"""Auth API routes."""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.deps import get_db
from .deps import get_current_user, require_superadmin
from .models import User
from .schemas import AuditLogOut, LoginRequest, Token, UserCreate, UserOut, UserUpdate, UserPermissionUpdate
from .service import (
    PERMISSIONS_CATALOG,
    authenticate_user,
    create_user,
    get_user_by_id,
    get_user_permissions,
    list_audit_logs,
    list_users,
    log_audit,
    set_user_permissions,
    update_user,
)

router = APIRouter()


def _user_out(user: User) -> UserOut:
    data = UserOut.model_validate(user).model_dump()
    data["permissions"] = sorted(get_user_permissions(user))
    return UserOut(**data)


@router.post("/login", response_model=Token)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    from .service import create_access_token
    user = authenticate_user(db, req.username, req.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account pending approval")
    log_audit(db, user, action="login", module="auth", target=user.username, detail="User login success")
    token = create_access_token({"sub": str(user.id)})
    return Token(access_token=token)


@router.post("/register", response_model=UserOut)
def register(req: UserCreate, db: Session = Depends(get_db)):
    from .service import get_user_by_username
    if get_user_by_username(db, req.username):
        raise HTTPException(status_code=400, detail="Username already exists")
    if not req.email.strip() or not req.phone.strip():
        raise HTTPException(status_code=400, detail="Real-name registration requires email and phone")
    user = create_user(db, username=req.username, password=req.password,
                       email=req.email.strip(), phone=req.phone.strip(), is_active=False)
    log_audit(db, user, action="register", module="auth", target=user.username, detail="Pending approval")
    return _user_out(user)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return _user_out(user)


@router.put("/me", response_model=UserOut)
def update_me(req: UserUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    target = update_user(db, user, **req.model_dump(exclude_unset=True))
    return _user_out(target)


@router.get("/users", response_model=List[UserOut])
def get_users(db: Session = Depends(get_db), _: User = Depends(require_superadmin)):
    return [_user_out(u) for u in list_users(db)]


@router.put("/users/{user_id}/approve", response_model=UserOut)
def approve_user(user_id: int, db: Session = Depends(get_db), _: User = Depends(require_superadmin)):
    target = get_user_by_id(db, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    out = update_user(db, target, is_active=True)
    log_audit(db, out, action="account_approved", module="auth", target=out.username)
    return _user_out(out)


@router.put("/users/{user_id}/deactivate", response_model=UserOut)
def deactivate_user(user_id: int, db: Session = Depends(get_db), _: User = Depends(require_superadmin)):
    target = get_user_by_id(db, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    out = update_user(db, target, is_active=False)
    log_audit(db, out, action="account_deactivated", module="auth", target=out.username)
    return _user_out(out)


@router.get("/permissions/catalog")
def permissions_catalog(_: User = Depends(require_superadmin)):
    return [{"code": k, "label": v} for k, v in PERMISSIONS_CATALOG.items()]


@router.get("/users/{user_id}/permissions")
def get_user_permissions_api(user_id: int, db: Session = Depends(get_db), _: User = Depends(require_superadmin)):
    target = get_user_by_id(db, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    return {"user_id": target.id, "permissions": sorted(get_user_permissions(target))}


@router.put("/users/{user_id}/permissions")
def set_user_permissions_api(
    user_id: int,
    req: UserPermissionUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    target = get_user_by_id(db, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    target = set_user_permissions(db, target, req.permissions)
    log_audit(db, target, action="permissions_updated", module="auth", target=target.username, detail=",".join(sorted(req.permissions)))
    return {"user_id": target.id, "permissions": sorted(get_user_permissions(target))}


@router.get("/audit-logs", response_model=List[AuditLogOut])
def get_audit_logs(
    username: str | None = None,
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    return list_audit_logs(db, for_user=username, skip=skip, limit=min(limit, 500))

