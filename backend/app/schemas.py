import uuid
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, date

class UserRegister(BaseModel):
    username: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=5, max_length=20)

class UserLogin(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    user_id: int
    user_name: str
    access_type: str
    created_at: datetime

    class Config:
        from_attributes = True

class RuleResponse(BaseModel):
    rule_id: int
    rule_name: str
    description: Optional[str]
    sql_predicate: str

    class Config:
        from_attributes = True

class RoleResponse(BaseModel):
    role_id: int
    role_name: str
    description: Optional[str]
    rules: List[RuleResponse] = []

    class Config:
        from_attributes = True

class UserAdminResponse(BaseModel):
    user_id: int
    user_name: str
    access_type: str
    created_at: datetime
    roles: List[RoleResponse] = []

    class Config:
        from_attributes = True

class MessageRequest(BaseModel):
    chat_id: uuid.UUID
    message: str

class FeedbackRequest(BaseModel):
    chat_id: uuid.UUID
    thumbs_up: bool
    thumbs_down: bool
    user_question: str
    ai_response: str
    comment: Optional[str] = None

class UserElevationRequest(BaseModel):
    user_id: int
    access_type: str # 'User' or 'Admin'

class RoleCreate(BaseModel):
    role_name: str
    description: Optional[str] = None

class RuleCreate(BaseModel):
    rule_name: str
    description: Optional[str] = None
    sql_predicate: str

class UserRoleMappingRequest(BaseModel):
    user_id: int
    role_id: int

class RoleRuleMappingRequest(BaseModel):
    role_id: int
    rule_id: int

class ChatHistoryResponse(BaseModel):
    chat_id: uuid.UUID
    title: str
    updated_at: datetime
    history_data: List[dict]

    class Config:
        from_attributes = True
