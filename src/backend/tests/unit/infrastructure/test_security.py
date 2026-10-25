import json
import time
from uuid import uuid4

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import HTTPException

from app.core.security import TokenVerifier


@pytest.fixture
def signed(settings):
    key = ec.generate_private_key(ec.SECP256R1())
    public = json.loads(jwt.algorithms.ECAlgorithm.to_jwk(key.public_key()))
    public.update(kid="test-key", alg="ES256", use="sig")
    claims = dict(
        sub=str(uuid4()),
        iss=settings.jwt_issuer,
        aud="authenticated",
        role="authenticated",
        iat=int(time.time()),
        exp=int(time.time()) + 300,
        email="test@example.invalid",
    )
    return key, public, claims


@pytest.mark.parametrize(
    "change",
    [
        {"iss": "https://wrong.invalid/auth/v1"},
        {"aud": "other"},
        {"exp": 1},
        {"sub": "not-a-uuid"},
        {"role": "service_role"},
        {"is_anonymous": True},
    ],
)
async def test_invalid_tokens_are_rejected(settings, signed, change):
    key, public, claims = signed
    token = jwt.encode({**claims, **change}, key, algorithm="ES256", headers={"kid": "test-key"})
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda req: httpx.Response(200, json={"keys": [public]}))
    ) as client:
        with pytest.raises(HTTPException) as exc:
            await TokenVerifier(settings, client).verify_access_token(token)
        assert exc.value.status_code == 401


async def test_valid_token_uses_cached_keys(settings, signed):
    key, public, claims = signed
    requests = []

    def respond(req):
        requests.append(req)
        return httpx.Response(200, json={"keys": [public]})

    token = jwt.encode(claims, key, algorithm="ES256", headers={"kid": "test-key"})
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        verifier = TokenVerifier(settings, client)
        assert (await verifier.verify_access_token(token))["sub"] == claims["sub"]
        await verifier.verify_access_token(token)
        assert len(requests) == 1


async def test_provider_failure_is_unavailable_not_authenticated(settings, signed):
    key, _, claims = signed
    token = jwt.encode(claims, key, algorithm="ES256", headers={"kid": "test-key"})
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda req: httpx.Response(503))) as client:
        with pytest.raises(HTTPException) as exc:
            await TokenVerifier(settings, client).verify_access_token(token)
        assert exc.value.status_code == 503
