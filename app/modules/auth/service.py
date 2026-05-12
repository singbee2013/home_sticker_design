"""Auth service — JWT, password hashing, CRUD."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import get_settings
from .models import User, Role, AuditLog

PERMISSIONS_CATALOG: dict[str, str] = {
    "ai.generate": "AI图案生成",
    "scenes.manage": "场景图库管理",
    "effects.manage": "效果图合成管理",
    "suites.manage": "电商套图管理",
    "ads.manage": "广告素材管理",
    "video.manage": "视频合成管理",
    "history.view": "历史记录查看",
    "history.delete": "历史记录删除",
    "users.manage": "账号与权限管理",
}


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    settings = get_settings()
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm="HS256")


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, get_settings().SECRET_KEY, algorithms=["HS256"])
    except JWTError:
        return None


# ---- User CRUD ----

def get_user_by_username(db: Session, username: str) -> User | None:
    return db.query(User).filter(User.username == username, User.is_deleted == False).first()


def get_user_by_login(db: Session, account: str) -> User | None:
    return (
        db.query(User)
        .filter(
            User.is_deleted == False,
            ((User.username == account) | (User.email == account) | (User.phone == account)),
        )
        .first()
    )


def _parse_permissions(text: str | None) -> set[str]:
    if not text:
        return set()
    return {p.strip() for p in text.split(",") if p.strip()}


def get_user_permissions(user: User) -> set[str]:
    if user.is_superadmin:
        return set(PERMISSIONS_CATALOG.keys())
    out: set[str] = set()
    for role in user.roles or []:
        out |= _parse_permissions(role.permissions)
    return out


def set_user_permissions(db: Session, user: User, permissions: list[str]) -> User:
    allowed = [p for p in permissions if p in PERMISSIONS_CATALOG]
    role_name = f"user_{user.id}_custom"
    role = db.query(Role).filter(Role.name == role_name).first()
    if not role:
        role = Role(name=role_name, description=f"Custom permissions for {user.username}", permissions="")
        db.add(role)
        db.flush()
    role.permissions = ",".join(sorted(set(allowed)))
    user.roles = [role]
    db.commit()
    db.refresh(user)
    return user


def log_audit(db: Session, user: User | None, action: str, module: str, target: str | None = None, detail: str | None = None) -> None:
    row = AuditLog(
        user_id=user.id if user else None,
        username=user.username if user else None,
        action=action,
        module=module,
        target=target,
        detail=(detail or "")[:2000] or None,
    )
    db.add(row)
    db.commit()


def list_audit_logs(db: Session, for_user: str | None = None, skip: int = 0, limit: int = 200):
    q = db.query(AuditLog)
    if for_user:
        q = q.filter(AuditLog.username == for_user)
    return q.order_by(AuditLog.id.desc()).offset(skip).limit(limit).all()


def get_user_by_id(db: Session, user_id: int) -> User | None:
    return db.query(User).filter(User.id == user_id, User.is_deleted == False).first()


def list_users(db: Session, skip: int = 0, limit: int = 50):
    return db.query(User).filter(User.is_deleted == False).offset(skip).limit(limit).all()


def create_user(db: Session, username: str, password: str, email: str | None = None,
                phone: str | None = None, is_active: bool = False, is_superadmin: bool = False) -> User:
    user = User(
        username=username,
        hashed_password=hash_password(password),
        email=email,
        phone=phone,
        is_active=is_active,
        is_superadmin=is_superadmin,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    if not user.is_superadmin:
        role = db.query(Role).filter(Role.name == "basic_creator").first()
        if role and role not in (user.roles or []):
            user.roles = [role]
            db.commit()
            db.refresh(user)
    return user


def authenticate_user(db: Session, username: str, password: str) -> User | None:
    user = get_user_by_login(db, username)
    if user and verify_password(password, user.hashed_password):
        return user
    return None


def update_user(db: Session, user: User, **kwargs) -> User:
    for k, v in kwargs.items():
        if v is not None and hasattr(user, k):
            setattr(user, k, v)
    db.commit()
    db.refresh(user)
    return user


def ensure_superadmin(db: Session) -> None:
    """Ensure configured primary owner account exists."""
    owner_username = "singbee2013@gmail.com"
    owner_password = "xielichan18"
    owner = get_user_by_username(db, owner_username)
    if not owner:
        create_user(
            db,
            username=owner_username,
            password=owner_password,
            email=owner_username,
            is_active=True,
            is_superadmin=True,
        )
    else:
        owner.is_superadmin = True
        owner.is_active = True
        if not owner.email:
            owner.email = owner_username
        db.commit()
    legacy_admin = get_user_by_username(db, "admin")
    if legacy_admin and legacy_admin.username != owner_username:
        legacy_admin.is_superadmin = False
        db.commit()
    role = db.query(Role).filter(Role.name == "basic_creator").first()
    if not role:
        role = Role(
            name="basic_creator",
            description="Default creator permissions",
            permissions="ai.generate,scenes.manage,effects.manage,suites.manage,ads.manage,video.manage,history.view,history.delete",
        )
        db.add(role)
        db.commit()
    users = db.query(User).filter(User.is_deleted == False, User.is_superadmin == False).all()
    changed = False
    for u in users:
        if not u.roles:
            u.roles = [role]
            changed = True
    if changed:
        db.commit()

