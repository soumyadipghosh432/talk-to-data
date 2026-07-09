# 📘 Talk-to-Data Developer Handbook

Welcome to the **Talk-to-Data Developer Handbook**. This guide provides an in-depth code and logic walkthrough of each core feature, API endpoint, database connection rule, and state workflow node. It is designed to help engineers onboard and maintain the application in production.

---

## 📂 1. Directory Structure

```
talk-to-data/
├── backend/
│   ├── app/
│   │   ├── auth.py          # Hashing, JWT cookies, and FastAPI dependencies
│   │   ├── config.py        # Environment variables & YAML config loaders
│   │   ├── database.py      # SQLAlchemy connection pool & engine creation
│   │   ├── models.py        # SQLAlchemy ORM models (User, Role, Rule, Chat, Telemetry)
│   │   ├── schemas.py       # Pydantic input/output validation models
│   │   ├── agent.py         # LangGraph workflow pipeline & LLM definitions
│   │   ├── pdf_exporter.py  # ReportLab script compiling PDF transcripts
│   │   └── main.py          # FastAPI Gateway routes & admin operations
│   ├── .env                 # Database and API keys environment file
│   └── llm_config.yaml      # Dynamic LLM provider & model configurations
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # React SPA state, triggers, views, and dashboards
│   │   ├── main.jsx         # React application entry point
│   │   └── index.css        # Responsive layouts, shadows, and design tokens
└── init.sql                 # Schema builder & table setups
```

---

## 🔒 2. Session Authentication & Security Flow

The system uses stateless JWT credentials, but locks down transport by storing the token strictly in a secure, `HttpOnly`, `SameSite=Lax` browser cookie.

```
[Register / Login Forms] ──► [FastAPI Router] ──► [Password Hashing / Verify]
                                                     │
                                                     ▼
[Subsequent Requests] ◄── [Secure HttpOnly Cookie] ◄─┘ (Inject Signed JWT)
```

### Hashing & Verification Logic (`backend/app/auth.py`)
1. **Password Encryption**: When a user registers via `POST /api/v1/auth/register`, their password is encrypted using the `passlib` library with the `bcrypt` hashing scheme.
   ```python
   pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
   
   def hash_password(password: str) -> str:
       return pwd_context.hash(password)
   ```
2. **Access Token Generation**: Upon verification (`POST /api/v1/auth/login`), a signed JWT payload is constructed with a sub (username) and expiration duration.
3. **Dependency Injection**: Routes use FastAPI dependencies to authorize calls:
   * `get_current_user`: Extracts the JWT from the cookie, decodes it, queries the database, and returns the authorized `User` object.
   * `get_current_admin`: Chains `get_current_user` and asserts that the `access_type` is equal to `Admin`. If not, raises an `HTTPException 403 Forbidden` response.

---

## 🗄️ 3. Database Connection Pooling (`backend/app/database.py`)

To handle connection drops and firewall connection recycling in production (especially on AWS RDS), the database engine is configured as follows:

```python
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,  # Disconnect Defense: Checks if connection is alive before routing query
    pool_size=10,        # Active Channels: Maintains a pool of 10 persistent connections
    max_overflow=20      # Traffic Spikes: Temporarily opens up to 20 additional connections
)
```

FastAPI handles database sessions via the `get_db` dependency generator:
* Opens a session (`SessionLocal()`).
* Yields the session context to the calling route.
* Closes the session inside a `finally` block, ensuring connections return safely to the pool.

---

## 💬 4. LangGraph Agent Execution Pipeline (`backend/app/agent.py`)

When a user submits a prompt, it triggers `run_agent_pipeline(...)`, which executes a stateless, deterministic LangGraph workflow:

```
[User Prompt] ──► Node 1: Guardrail Inspection ──► Node 2: RBAC Rule Injection
                                                             │
                                                             ▼
[SQL Executed] ◄─ Node 5: SQLAlchemy Exec ◄─ Node 4: Strict SQL Validator ◄─ Node 3: Text-to-SQL
      │
      ▼
Node 6: AI Synthesis ──► Node 7: Telemetry Logger ──► [Formatted UI Bubble]
```

### Step-by-Step Logic Flow:

#### Node 1: Guardrail Inspection (`guardrail_node`)
* **Purpose**: Prevents irrelevant, abusive, or out-of-scope queries.
* **Context Loading**: Loads the active user's prompt alongside the **Conversation History** (up to 300 characters of recent turns) to make the guardrail context-aware. This ensures follow-up prompts are not blocked.
* **Result**: If the model finds the question out of scope, it halts the graph, sets `status` to `GUARDRAIL_DENIED`, and returns a polite rejection template.

#### Node 2: RBAC Prompt Injection (`rbac_node`)
* **Purpose**: Enforces data isolation constraints based on mapped user roles.
* **Predicate Fetching**: Connects to the database and fetches all active SQL predicate constraints associated with the user's roles (e.g. `geographic_region = 'US'`).
* **Result**: Appends these constraints as string requirements in the state's rules list.

#### Node 3: Text-to-SQL Generation (`text_to_sql_node`)
* **Purpose**: Translates the natural language prompt into a valid PostgreSQL SELECT query.
* **YAML Model Selector**: Loads the active Gemini model name (e.g. `gemini-2.5-flash-lite`) from `llm_config.yaml`.
* **Ordinal Entity Resolution**: The prompt instructs the model to resolve ordinals (e.g. *"third one"*) back to the **primary listing entity** of the conversation history (e.g. `orders`) instead of carrying over sub-query targets (e.g. `customers`).
* **RBAC Constraints**: The model is instructed to append the RBAC constraints (e.g., `WHERE geographic_region = 'US'`) to all matching queries. If a user asks to query a forbidden region, the node outputs `SECURITY_VIOLATION`.

#### Node 4: Strict SQL Validation (`sql_validation_node`)
* **Purpose**: Evaluates structural syntax safety before database execution.
* **SELECT Enforcement**: Validates that the generated query is exclusively a `SELECT` statement using regex matches. If write commands (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`) are found, it sets the status to `SQL_ERROR` and halts execution.
* **Violation Capture**: If the SQL generator output was `SECURITY_VIOLATION`, it triggers a secure access-denied response.

#### Node 5: Engine Execution (`execute_sql_node`)
* **Purpose**: Connects to the database and executes the query.
* **Result Mapping**: Converts rows and columns into dictionaries, limiting outputs to 100 rows to prevent memory exhaustion.

#### Node 6: Comprehensive Synthesis (`synthesis_node`)
* **Purpose**: Translates the dataset back into human-readable answers.
* **Prompt Engineering**:
  * **Hides raw SQL** from the text block (the SQL is displayed exclusively in the UI drawer).
  * **Omits greeting prefixes** (like *"Hello!"*, *"Hi!"*), going straight to the analytical answer.

#### Node 7: Telemetry Logger (`telemetry_node` / router logging)
* **Purpose**: Captures key numbers and performance metrics.
* **TPS Throughput**: Computes tokens per second:
  $$\text{Throughput (TPS)} = \frac{\text{total\_tokens}}{\text{latency\_ms} / 1000.0}$$
* **Log Write**: Creates and commits an `ExecutionLog` ORM entity record to the database.

---

## 📊 5. Performance Analytics Compilation (`backend/app/main.py`)

The Admin Panel analytics page calls `GET /api/v1/admin/analytics`. The backend computes these metrics using raw SQL execution on connection pools:

```python
@app.get("/api/v1/admin/analytics")
def admin_get_analytics(current_admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    # Total Queries count
    total_queries = db.query(ExecutionLog).count()
    
    # Total Failures count (non-SUCCESS logs)
    total_failures = db.query(ExecutionLog).filter(ExecutionLog.execution_status != "SUCCESS").count()
    
    # Average Latency (seconds)
    avg_latency = db.execute(text("SELECT AVG(latency_ms) FROM execution_log")).scalar() or 0.0
    
    # Average Throughput (TPS)
    avg_throughput = db.execute(text("SELECT AVG(throughput_tps) FROM execution_log")).scalar() or 0.0
    
    # Tokens Breakdown
    total_tokens = db.execute(text("SELECT SUM(total_tokens) FROM execution_log")).scalar() or 0
    prompt_tokens = db.execute(text("SELECT SUM(prompt_tokens) FROM execution_log")).scalar() or 0
    completion_tokens = db.execute(text("SELECT SUM(completion_tokens) FROM execution_log")).scalar() or 0
    
    # Recent Logs (fetches last 10 logs)
    # Returns values formatted as JSON
```

---

## 🖨️ 6. PDF Export Compilation (`backend/app/pdf_exporter.py`)

The export action compiles conversation transcript lists into a downloadable PDF document using the **ReportLab** library.

* **Flowable Table Structure**: Uses ReportLab `Table` layouts with explicit column widths to prevent overlapping text boundaries.
* **Horizontal Independent Scrolling**: Tables wrap content dynamically and handle pagination across pages automatically.
* **Header & Styling Rules**: Renders headers on page 2+ showing the chat title and username. Applies custom paragraph styles for user questions and AI answers.
