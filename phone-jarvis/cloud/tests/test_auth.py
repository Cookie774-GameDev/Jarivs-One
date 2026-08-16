from unittest.mock import AsyncMock, patch

import pytest

from cloud.auth import JwtVerifier, remaining_jwt_lifetime


@pytest.mark.asyncio
async def test_jwt_rejects_unapproved_algorithm_before_decode():
    verifier = JwtVerifier(
        jwks_url="https://example.supabase.co/auth/v1/.well-known/jwks.json",
        issuer="https://example.supabase.co/auth/v1",
    )
    verifier._fetch_jwks = AsyncMock(return_value={"keys": [{"kid": "key-1", "kty": "RSA"}]})
    with patch("cloud.auth.jwt.get_unverified_header", return_value={"kid": "key-1", "alg": "HS256"}), \
         patch("cloud.auth.jwt.decode") as decode:
        with pytest.raises(PermissionError, match="algorithm_not_allowed"):
            await verifier.verify("token")
        decode.assert_not_called()


@pytest.mark.asyncio
async def test_jwt_requires_authenticated_role_and_uuid_subject():
    verifier = JwtVerifier(
        jwks_url="https://example.supabase.co/auth/v1/.well-known/jwks.json",
        issuer="https://example.supabase.co/auth/v1",
    )
    verifier._fetch_jwks = AsyncMock(return_value={"keys": [{"kid": "key-1", "kty": "RSA"}]})
    with patch("cloud.auth.jwt.get_unverified_header", return_value={"kid": "key-1", "alg": "RS256"}), \
         patch("cloud.auth.jwt.decode", return_value={
             "sub": "not-a-uuid",
             "role": "service_role",
             "exp": 4_102_444_800,
         }):
        with pytest.raises(PermissionError, match="invalid_claims"):
            await verifier.verify("token")


@pytest.mark.asyncio
async def test_jwt_pins_issuer_audience_and_algorithm():
    verifier = JwtVerifier(
        jwks_url="https://example.supabase.co/auth/v1/.well-known/jwks.json",
        issuer="https://example.supabase.co/auth/v1",
    )
    verifier._fetch_jwks = AsyncMock(return_value={"keys": [{"kid": "key-1", "kty": "EC"}]})
    claims = {
        "sub": "11111111-1111-4111-8111-111111111111",
        "role": "authenticated",
        "exp": 4_102_444_800,
    }
    with patch("cloud.auth.jwt.get_unverified_header", return_value={"kid": "key-1", "alg": "ES256"}), \
         patch("cloud.auth.jwt.decode", return_value=claims) as decode:
        assert await verifier.verify("token") == claims
        assert decode.call_args.kwargs["algorithms"] == ["ES256"]
        assert decode.call_args.kwargs["issuer"] == "https://example.supabase.co/auth/v1"
        assert decode.call_args.kwargs["audience"] == "authenticated"


@pytest.mark.asyncio
async def test_jwt_refreshes_jwks_once_when_signing_key_rotates():
    verifier = JwtVerifier(
        jwks_url="https://example.supabase.co/auth/v1/.well-known/jwks.json",
        issuer="https://example.supabase.co/auth/v1",
    )
    verifier._fetch_jwks = AsyncMock(side_effect=[
        {"keys": [{"kid": "old-key", "kty": "RSA"}]},
        {"keys": [{"kid": "new-key", "kty": "RSA"}]},
    ])
    claims = {
        "sub": "11111111-1111-4111-8111-111111111111",
        "role": "authenticated",
        "exp": 4_102_444_800,
    }
    with patch("cloud.auth.jwt.get_unverified_header", return_value={"kid": "new-key", "alg": "RS256"}), \
         patch("cloud.auth.jwt.decode", return_value=claims):
        assert await verifier.verify("token") == claims
    assert verifier._fetch_jwks.await_args_list[1].kwargs == {"force": True}


@pytest.mark.asyncio
async def test_jwt_rejects_jwk_with_mismatched_or_missing_key_type():
    verifier = JwtVerifier(
        jwks_url="https://example.supabase.co/auth/v1/.well-known/jwks.json",
        issuer="https://example.supabase.co/auth/v1",
    )
    verifier._fetch_jwks = AsyncMock(return_value={"keys": [{"kid": "key-1"}]})
    with patch("cloud.auth.jwt.get_unverified_header", return_value={"kid": "key-1", "alg": "RS256"}), \
         patch("cloud.auth.jwt.decode") as decode:
        with pytest.raises(PermissionError, match="unknown_kid"):
            await verifier.verify("token")
        decode.assert_not_called()


def test_jwt_remaining_lifetime_fails_closed_for_missing_expiry():
    assert remaining_jwt_lifetime({"exp": 1_030}, now=1_000) == 30
    assert remaining_jwt_lifetime({"exp": 999}, now=1_000) == 0
    assert remaining_jwt_lifetime({}, now=1_000) == 0
