import asyncio
import time
from uuid import UUID

import httpx
import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.db.models.identity import User
from app.db.repositories.users import UserRepository
from app.db.session import get_db_session, transaction

bearer = HTTPBearer(auto_error=False)


class TokenVerifier:
    def __init__(self, settings: Settings, client: httpx.AsyncClient):
        self.settings, self.client = settings, client
        self.keys: dict = {}
        self.expires = 0.0
        self.last_refresh = 0.0
        self.lock = asyncio.Lock()

    async def verify_access_token(self, token: str) -> dict:
        try:
            if len(token) > 16384:
                raise jwt.InvalidTokenError()
            header = jwt.get_unverified_header(token)
            kid = header.get("kid")
            if (
                header.get("alg") != self.settings.supabase_jwt_algorithm
                or not isinstance(kid, str)
                or len(kid) > 128
            ):
                raise jwt.InvalidTokenError()
            async with self.lock:
                now = time.monotonic()
                if now >= self.expires or (kid not in self.keys and now - self.last_refresh >= 10):
                    try:
                        response = await self.client.get(self.settings.jwks_url)
                        response.raise_for_status()
                        self.keys = {item["kid"]: item for item in response.json()["keys"]}
                    except (httpx.HTTPError, KeyError, ValueError, TypeError) as exc:
                        raise HTTPException(503, "Authentication key service unavailable") from exc
                    self.expires, self.last_refresh = now + 300, now
                key_data = self.keys.get(kid)
            if key_data is None:
                raise jwt.InvalidTokenError()
            key = jwt.PyJWK.from_dict(key_data, algorithm=self.settings.supabase_jwt_algorithm).key
            claims = jwt.decode(
                token,
                key,
                algorithms=[self.settings.supabase_jwt_algorithm],
                audience=self.settings.supabase_jwt_audience,
                issuer=self.settings.jwt_issuer,
                options={"require": ["exp", "iat", "sub", "aud", "iss"]},
            )
            UUID(claims["sub"])
            if claims.get("role") != "authenticated" or claims.get("is_anonymous", False):
                raise jwt.InvalidTokenError()
            return claims
        except (jwt.InvalidTokenError, ValueError, TypeError) as exc:
            raise HTTPException(
                401, "Invalid or expired access token", headers={"WWW-Authenticate": "Bearer"}
            ) from exc


async def verify_access_token(request: Request, token: str) -> dict:
    return await request.app.state.token_verifier.verify_access_token(token)


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    session: AsyncSession = Depends(get_db_session),
) -> User:
    if credentials is None:
        raise HTTPException(401, "Authentication required", headers={"WWW-Authenticate": "Bearer"})
    claims = await verify_access_token(request, credentials.credentials)
    meta = claims.get("user_metadata")
    if not isinstance(meta, dict):
        meta = {}
    name = str(meta.get("display_name") or "Student")[:200]
    async with transaction(session):
        user = await UserRepository(session).ensure_student_profile(
            UUID(claims["sub"]), str(claims.get("email", "")), name
        )
        if not user.is_active:
            raise HTTPException(403, "Application account disabled")
    return user


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin" or not user.is_active:
        raise HTTPException(403, "Admin review permission required")
    return user


def require_resource_owner(owner_id: UUID, user_id: UUID) -> None:
    if owner_id != user_id:
        raise HTTPException(403, "Resource ownership required")
