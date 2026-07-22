import uuid
import time
from fastapi import FastAPI, Depends, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.orm import Session
from typing import List

from app.config import settings, ACTIVE_LLM_PROVIDER
from app.database import get_db, Base, engine
from app.auth import (
    COOKIE_NAME,
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    get_current_admin
)
from app.models import (
    User,
    Role,
    Rule,
    ChatHistory,
    Feedback,
    ExecutionLog
)
from app.schemas import (
    UserRegister,
    UserLogin,
    UserResponse,
    UserAdminResponse,
    MessageRequest,
    FeedbackRequest,
    UserElevationRequest,
    RoleCreate,
    RuleCreate,
    UserRoleMappingRequest,
    RoleRuleMappingRequest,
    ChatHistoryResponse,
    RuleResponse,
    RoleResponse
)
from app.agent import run_agent_pipeline, ACTIVE_LLM_PROVIDER
from app.pdf_exporter import export_chat_history_to_pdf

app = FastAPI(title="Talk-to-Data API Gateway", version="1.0.0")

# Setup CORS
# Allow localhost:5173 (standard Vite client port)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    # Make sure tables are present
    Base.metadata.create_all(bind=engine)
    print(f"Server booted. Active LLM configured: {ACTIVE_LLM_PROVIDER}")

# ----------------------------------------------------
# AUTHENTICATION ENDPOINTS
# ----------------------------------------------------

@app.post("/api/v1/auth/register", status_code=status.HTTP_201_CREATED)
def register(user_data: UserRegister, db: Session = Depends(get_db)):
    # Validate password length
    if len(user_data.password) < 5 or len(user_data.password) > 20:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be between 5 and 20 characters."
        )
        
    # Check if user already exists
    existing_user = db.query(User).filter(User.user_name == user_data.username).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken."
        )
        
    # Create new user
    hashed = hash_password(user_data.password)
    new_user = User(
        user_name=user_data.username,
        password_hash=hashed,
        access_type="User" # Defaults to standard user
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return {"status": "success", "message": "User registry initialized."}

@app.post("/api/v1/auth/login")
def login(login_data: UserLogin, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.user_name == login_data.username).first()
    if not user or not user.password_hash or not verify_password(login_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password credentials."
        )
        
    # Create Token
    token = create_access_token(data={"sub": user.user_name})
    
    # Store token in HTTPOnly secure cookie
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        samesite="lax",
        secure=False # Set to True in production with HTTPS
    )
    
    return {"status": "authenticated", "access_type": user.access_type}

@app.post("/api/v1/auth/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME)
    return {"status": "logged_out"}

@app.get("/api/v1/auth/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {
        "user_id": current_user.user_id,
        "username": current_user.user_name,
        "access_type": current_user.access_type
    }

# ----------------------------------------------------
# CHAT CORE WORKSPACE ENDPOINTS
# ----------------------------------------------------

@app.post("/api/v1/chat/new")
def create_new_chat(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    chat_id = uuid.uuid4()
    new_chat = ChatHistory(
        chat_id=chat_id,
        user_id=current_user.user_id,
        title="New Chat Session",
        history_data=[]
    )
    db.add(new_chat)
    db.commit()
    return {"chat_id": chat_id}

@app.get("/api/v1/chat/list", response_model=List[ChatHistoryResponse])
def get_chat_list(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    chats = db.query(ChatHistory).filter(ChatHistory.user_id == current_user.user_id).order_by(ChatHistory.updated_at.desc()).all()
    return chats

@app.get("/api/v1/chat/detail/{chat_id}", response_model=ChatHistoryResponse)
def get_chat_detail(chat_id: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    chat = db.query(ChatHistory).filter(ChatHistory.chat_id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat session not found.")
    if chat.user_id != current_user.user_id and current_user.access_type != "Admin":
        raise HTTPException(status_code=403, detail="Access denied.")
    return chat

@app.delete("/api/v1/chat/delete/{chat_id}")
def delete_chat(chat_id: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    chat = db.query(ChatHistory).filter(ChatHistory.chat_id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat session not found.")
    if chat.user_id != current_user.user_id and current_user.access_type != "Admin":
        raise HTTPException(status_code=403, detail="Access denied.")
        
    db.delete(chat)
    db.commit()
    return {"status": "success", "message": "Chat context deleted."}

@app.post("/api/v1/chat/message")
def submit_message(msg_req: MessageRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    chat = db.query(ChatHistory).filter(ChatHistory.chat_id == msg_req.chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat context not found.")
    if chat.user_id != current_user.user_id and current_user.access_type != "Admin":
        raise HTTPException(status_code=403, detail="Access denied.")
        
    # Execute LangGraph Pipeline
    pipeline_state = run_agent_pipeline(
        user_id=current_user.user_id,
        chat_id=str(msg_req.chat_id),
        question=msg_req.message
    )
    
    # Calculate telemetry throughput (tps)
    latency_sec = pipeline_state["latency_ms"] / 1000.0
    throughput = 0.0
    if latency_sec > 0:
        throughput = round(pipeline_state["total_tokens"] / latency_sec, 2)
        
    # Log telemetry metrics to execution_log
    log_entry = ExecutionLog(
        chat_id=msg_req.chat_id,
        user_id=current_user.user_id,
        prompt_tokens=pipeline_state["prompt_tokens"],
        completion_tokens=pipeline_state["completion_tokens"],
        total_tokens=pipeline_state["total_tokens"],
        latency_ms=pipeline_state["latency_ms"],
        throughput_tps=throughput,
        llm_provider_utilized=ACTIVE_LLM_PROVIDER,
        generated_sql_statement=pipeline_state["generated_sql"],
        execution_status=pipeline_state["status"]
    )
    db.add(log_entry)
    
    # Append turns to chat history
    history = list(chat.history_data)
    history.append({"role": "user", "content": msg_req.message})
    history.append({
        "role": "ai", 
        "content": pipeline_state["response"],
        "latency_ms": pipeline_state["latency_ms"],
        "sql": pipeline_state["generated_sql"]
    })
    
    chat.history_data = history
    
    # If first message, update chat session title to user's question
    if len(history) <= 2:
        # Trim query length to fit title bar nicely
        title = msg_req.message
        if len(title) > 40:
            title = title[:37] + "..."
        chat.title = title
        
    db.commit()
    db.refresh(chat)
    
    return {
        "response": pipeline_state["response"],
        "latency_ms": pipeline_state["latency_ms"],
        "sql": pipeline_state["generated_sql"]
    }

@app.post("/api/v1/chat/feedback")
def submit_feedback(fb_req: FeedbackRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    chat = db.query(ChatHistory).filter(ChatHistory.chat_id == fb_req.chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat history not found.")
        
    feedback_row = Feedback(
        chat_id=fb_req.chat_id,
        thumbs_up=fb_req.thumbs_up,
        thumbs_down=fb_req.thumbs_down,
        user_question=fb_req.user_question,
        ai_response=fb_req.ai_response,
        comment=fb_req.comment
    )
    db.add(feedback_row)
    db.commit()
    return {"status": "feedback_logged"}

@app.get("/api/v1/chat/export/{chat_id}")
def export_chat(chat_id: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    chat = db.query(ChatHistory).filter(ChatHistory.chat_id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat history session not found.")
    if chat.user_id != current_user.user_id and current_user.access_type != "Admin":
        raise HTTPException(status_code=403, detail="Access denied.")
        
    # Generate PDF bytes
    pdf_bytes = export_chat_history_to_pdf(
        chat_title=chat.title,
        username=current_user.user_name,
        history_data=chat.history_data
    )
    
    # Stream binary response
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=transcript_{str(chat_id)[:8]}.pdf"
        }
    )

# ----------------------------------------------------
# ADMIN PANEL COMMANDS (Admins Only)
# ----------------------------------------------------

@app.get("/api/v1/admin/users", response_model=List[UserAdminResponse])
def admin_get_users(current_admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    users = db.query(User).order_by(User.user_id.asc()).all()
    return users

@app.post("/api/v1/admin/users/elevate")
def admin_elevate_user(req: UserElevationRequest, current_admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.user_id == req.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
        
    if req.access_type not in ["User", "Admin"]:
        raise HTTPException(status_code=400, detail="Invalid access type selection.")
        
    user.access_type = req.access_type
    db.commit()
    return {"status": "success", "message": f"User status set to {req.access_type}."}

@app.get("/api/v1/admin/roles", response_model=List[RoleResponse])
def admin_get_roles(current_admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    roles = db.query(Role).all()
    return roles

@app.post("/api/v1/admin/roles/create")
def admin_create_role(req: RoleCreate, current_admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    existing = db.query(Role).filter(Role.role_name == req.role_name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Role name already exists.")
        
    new_role = Role(role_name=req.role_name, description=req.description)
    db.add(new_role)
    db.commit()
    return {"status": "success", "message": "Role created successfully."}

@app.get("/api/v1/admin/rules", response_model=List[RuleResponse])
def admin_get_rules(current_admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    rules = db.query(Rule).all()
    return rules

@app.post("/api/v1/admin/rules/create")
def admin_create_rule(req: RuleCreate, current_admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    existing = db.query(Rule).filter(Rule.rule_name == req.rule_name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Rule name already exists.")
        
    new_rule = Rule(
        rule_name=req.rule_name,
        description=req.description,
        sql_predicate=req.sql_predicate
    )
    db.add(new_rule)
    db.commit()
    return {"status": "success", "message": "Restriction rule created."}

@app.post("/api/v1/admin/mappings/user-role")
def admin_map_user_role(req: UserRoleMappingRequest, current_admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.user_id == req.user_id).first()
    role = db.query(Role).filter(Role.role_id == req.role_id).first()
    
    if not user or not role:
        raise HTTPException(status_code=404, detail="User or Role not found.")
        
    # Append role to user roles if not already present
    if role not in user.roles:
        user.roles.append(role)
        db.commit()
        
    return {"status": "success", "message": f"Mapped user {user.user_name} to role {role.role_name}."}

@app.delete("/api/v1/admin/mappings/user-role")
def admin_unmap_user_role(user_id: int, role_id: int, current_admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.user_id == user_id).first()
    role = db.query(Role).filter(Role.role_id == role_id).first()
    
    if not user or not role:
        raise HTTPException(status_code=404, detail="User or Role not found.")
        
    if role in user.roles:
        user.roles.remove(role)
        db.commit()
        
    return {"status": "success", "message": f"Removed role {role.role_name} from user {user.user_name}."}

@app.post("/api/v1/admin/mappings/role-rule")
def admin_map_role_rule(req: RoleRuleMappingRequest, current_admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    role = db.query(Role).filter(Role.role_id == req.role_id).first()
    rule = db.query(Rule).filter(Rule.rule_id == req.rule_id).first()
    
    if not role or not rule:
        raise HTTPException(status_code=404, detail="Role or Rule not found.")
        
    if rule not in role.rules:
        role.rules.append(rule)
        db.commit()
        
    return {"status": "success", "message": f"Mapped rule {rule.rule_name} to role {role.role_name}."}

@app.delete("/api/v1/admin/mappings/role-rule")
def admin_unmap_role_rule(role_id: int, rule_id: int, current_admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    role = db.query(Role).filter(Role.role_id == role_id).first()
    rule = db.query(Rule).filter(Rule.rule_id == rule_id).first()
    
    if not role or not rule:
        raise HTTPException(status_code=404, detail="Role or Rule not found.")
        
    if rule in role.rules:
        role.rules.remove(rule)
        db.commit()
        
    return {"status": "success", "message": f"Removed rule {rule.rule_name} from role {role.role_name}."}

@app.get("/api/v1/admin/analytics")
def admin_get_analytics(current_admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    # Total Queries
    total_queries = db.query(ExecutionLog).count()
    
    # Total Failures
    total_failures = db.query(ExecutionLog).filter(ExecutionLog.execution_status != "SUCCESS").count()
    
    # Average Latency
    avg_latency = db.execute(text("SELECT AVG(latency_ms) FROM execution_log")).scalar() or 0.0
    avg_latency = round(float(avg_latency), 1)
    
    # Average Throughput
    avg_throughput = db.execute(text("SELECT AVG(throughput_tps) FROM execution_log")).scalar() or 0.0
    avg_throughput = round(float(avg_throughput), 2)
    
    # Total Tokens Consumed
    total_tokens = db.execute(text("SELECT SUM(total_tokens) FROM execution_log")).scalar() or 0
    prompt_tokens = db.execute(text("SELECT SUM(prompt_tokens) FROM execution_log")).scalar() or 0
    completion_tokens = db.execute(text("SELECT SUM(completion_tokens) FROM execution_log")).scalar() or 0
    
    # Status Breakdown
    status_rows = db.execute(text("SELECT execution_status, COUNT(*) FROM execution_log GROUP BY execution_status")).fetchall()
    status_breakdown = {row[0]: row[1] for row in status_rows}
    
    # Recent logs
    recent_rows = db.execute(text("""
        SELECT log_id, recorded_at, execution_status, latency_ms, total_tokens, throughput_tps, generated_sql_statement 
        FROM execution_log 
        ORDER BY recorded_at DESC 
        LIMIT 200
    """)).fetchall()
    
    recent_logs = []
    for r in recent_rows:
        recent_logs.append({
            "log_id": r[0],
            "recorded_at": r[1].isoformat() if r[1] else "",
            "status": r[2],
            "latency_ms": r[3],
            "total_tokens": r[4],
            "throughput": float(r[5]) if r[5] is not None else 0.0,
            "sql": r[6]
        })
        
    return {
        "total_queries": total_queries,
        "total_failures": total_failures,
        "avg_latency_ms": avg_latency,
        "avg_throughput_tps": avg_throughput,
        "tokens": {
            "total": int(total_tokens),
            "prompt": int(prompt_tokens),
            "completion": int(completion_tokens)
        },
        "status_breakdown": status_breakdown,
        "recent_logs": recent_logs
    }

@app.get("/api/v1/admin/schema")
def admin_get_schema(current_admin: User = Depends(get_current_admin)):
    import os
    import json
    schema_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "db_schema_mapping.json")
    if not os.path.exists(schema_path):
        raise HTTPException(status_code=404, detail="Database schema mapping file not found.")
    try:
        with open(schema_path, "r", encoding="utf-8") as f:
            schema_data = json.load(f)
        return schema_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading schema mapping: {str(e)}")

@app.get("/api/v1/chat/llm-status")
def get_llm_status(current_user: User = Depends(get_current_user)):
    import yaml
    import os
    config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "llm_config.yaml")
    if not os.path.exists(config_path):
        raise HTTPException(status_code=404, detail="LLM config file not found.")
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            config_data = yaml.safe_load(f)
        
        gemini_model = config_data.get("gemini_model", "gemini-2.5-flash-lite")
        models = config_data.get("models", [])
        
        active_provider = "UNKNOWN"
        for m in models:
            if m.get("active") is True:
                active_provider = m.get("name")
                
        # Friendly model display name mapping
        def get_friendly_name(provider, gemini_name):
            if provider == "GOOGLE_GEMINI_API":
                return f"Google Gemini ({gemini_name})"
            elif provider == "OPENAI_API":
                return "OpenAI GPT-4o-mini"
            elif provider == "AWS_BEDROCK_CLAUDE":
                return "AWS Bedrock Claude 3.5 Sonnet"
            elif provider == "AMAZON_NOVA_BEDROCK":
                return "AWS Bedrock Amazon Nova"
            elif provider == "GPTOSS_20B_BEDROCK":
                return "AWS Bedrock OpenAI GPT-OSS 20B"
            return provider

        available_list = []
        for m in models:
            available_list.append({
                "name": m.get("name"),
                "active": m.get("active", False),
                "friendly_name": get_friendly_name(m.get("name"), gemini_model)
            })

        active_model_name = get_friendly_name(active_provider, gemini_model)

        return {
            "active_provider": active_provider,
            "active_model_name": active_model_name,
            "available_models": available_list
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading LLM status: {str(e)}")


