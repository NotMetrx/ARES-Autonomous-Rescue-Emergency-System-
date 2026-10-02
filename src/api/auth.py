import os
import time
import hashlib
from typing import Optional, Dict, Any
import jwt
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import aiosqlite
from src.database.db import get_db

SECRET_KEY = os.getenv("ARES_JWT_SECRET", "ares-tactical-secret-key-2026-edge-defense")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_SECONDS = 28800

security = HTTPBearer(auto_error=False)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        from passlib.hash import bcrypt
        if hashed_password.startswith("$2"):
            return bcrypt.verify(plain_password, hashed_password)
    except Exception:
        pass

    if hashed_password.startswith("sha256$"):
        expected = "sha256$" + hashlib.sha256(plain_password.encode()).hexdigest()
        return expected == hashed_password
    
    # Direct hash fallback
    return hashed_password == hashlib.sha256(plain_password.encode()).hexdigest()

def create_access_token(data: dict, expires_seconds: int = ACCESS_TOKEN_EXPIRE_SECONDS) -> str:
    to_encode = data.copy()
    expire = time.time() + expires_seconds
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_operator(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
    db: aiosqlite.Connection = Depends(get_db)
) -> Dict[str, Any]:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "UNAUTHORIZED", "message": "Token de autorización no provisto"}}
        )

    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        sub = payload.get("sub")
        if sub is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"error": {"code": "INVALID_TOKEN", "message": "Token inválido"}}
            )
        operator_id = int(sub)
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "INVALID_TOKEN", "message": "Token expirado o inválido"}}
        )

    cursor = await db.execute("""
        SELECT o.operator_id, o.username, o.full_name, o.is_active, r.code AS role
        FROM operators o
        JOIN roles r ON o.role_id = r.role_id
        WHERE o.operator_id = ?
    """, (operator_id,))
    operator = await cursor.fetchone()

    if not operator:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "USER_NOT_FOUND", "message": "Operador no encontrado"}}
        )

    if not operator["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": {"code": "USER_DISABLED", "message": "El operador se encuentra inactivo"}}
        )

    return dict(operator)
