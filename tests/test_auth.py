import pytest

@pytest.mark.asyncio
async def test_auth_001_successful_login(async_client):
    """TEST-AUTH-001: Autenticación exitosa de operador activo."""
    response = await async_client.post("/api/v1/auth/login", json={
        "username": "operador_tactico",
        "password": "PasswordSeguro2026!"
    })
    assert response.status_code == 200
    data = response.json()
    assert "token" in data
    assert data["token_type"] == "Bearer"
    assert data["operator"]["username"] == "operador_tactico"
    assert data["operator"]["role"] == "TACTICAL_OPERATOR"

@pytest.mark.asyncio
async def test_auth_002_invalid_credentials(async_client):
    """TEST-AUTH-002: Rechazo de credenciales incorrectas."""
    response = await async_client.post("/api/v1/auth/login", json={
        "username": "operador_tactico",
        "password": "WrongPassword!"
    })
    assert response.status_code == 401
    data = response.json()
    assert data["error"]["code"] == "INVALID_CREDENTIALS"

@pytest.mark.asyncio
async def test_auth_003_disabled_user(async_client):
    """TEST-AUTH-003: Bloqueo de operadores inactivos."""
    response = await async_client.post("/api/v1/auth/login", json={
        "username": "operador_inactivo",
        "password": "PasswordSeguro2026!"
    })
    assert response.status_code == 403
    data = response.json()
    assert data["error"]["code"] == "USER_DISABLED"

@pytest.mark.asyncio
async def test_auth_004_protected_endpoint_without_token(async_client):
    """TEST-AUTH-004: Protección de rutas autenticadas."""
    response = await async_client.get("/api/v1/missions/101")
    assert response.status_code == 401
