from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import Request, Depends, HTTPException, status
from jose import jwt, JWTError
import bcrypt
from sqlalchemy.orm import Session
from app.config import settings
from app.database import get_db
from app.models import User

# Cookie key name
COOKIE_NAME = "session_token"

def hash_password(password: str) -> str:
    """Hash password with bcrypt."""
    pw_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pw_bytes, salt).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify standard text password against hash."""
    try:
        pw_bytes = plain_password.encode('utf-8')
        hash_bytes = hashed_password.encode('utf-8')
        return bcrypt.checkpw(pw_bytes, hash_bytes)
    except Exception:
        return False

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Generate JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt

def get_token_from_cookie(request: Request) -> str:
    """Extract token from request HTTP cookies."""
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated. Missing session cookie.",
        )
    return token

def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """Dependency: Extract and validate user from JWT session cookie."""
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session cookie missing. Please log in.",
        )
        
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token content.",
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or invalid token.",
        )
        
    user = db.query(User).filter(User.user_name == username).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found in system.",
        )
    return user

def get_current_admin(current_user: User = Depends(get_current_user)) -> User:
    """Dependency: Assert that active user is Admin."""
    if current_user.access_type != "Admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Admin permissions required.",
        )
    return current_user
