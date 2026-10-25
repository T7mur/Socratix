from fastapi import APIRouter, Depends

from app.contracts.identity import UserProfile
from app.core.security import get_current_user
from app.db.models.identity import User

router = APIRouter(tags=["identity"])


@router.get("/me", response_model=UserProfile)
async def me(user: User = Depends(get_current_user)):
    return user
