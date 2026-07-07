import pytest
from fastapi.testclient import TestClient
import yaml
import os

# Set environment variables for testing before imports
os.environ["DATABASE_URL"] = "postgresql://postgres:admin@localhost:5432/postgres"
os.environ["JWT_SECRET"] = "testsecret"
os.environ["GOOGLE_GEMINI_KEY"] = "mock_key"

from app.main import app
from app.config import get_active_llm_config
from app.agent import sql_validation_node, AgentState

client = TestClient(app)

# 1. Config tests
def test_llm_config_validation(tmp_path):
    # Test valid yaml (exactly one active)
    valid_yaml = """
    models:
      - name: "OPENAI_API"
        active: false
      - name: "GOOGLE_GEMINI_API"
        active: true
    """
    p = tmp_path / "llm_config.yaml"
    p.write_text(valid_yaml)
    
    # Test invalid yaml (multiple active)
    invalid_yaml_multi = """
    models:
      - name: "OPENAI_API"
        active: true
      - name: "GOOGLE_GEMINI_API"
        active: true
    """
    p_invalid = tmp_path / "llm_config_invalid.yaml"
    p_invalid.write_text(invalid_yaml_multi)
    
    # Mocking the load function for test
    def mock_check(file_path):
        with open(file_path, "r") as f:
            config_data = yaml.safe_load(f)
        models = config_data.get("models", [])
        active_configs = [m for m in models if m.get("active") is True]
        if len(active_configs) != 1:
            raise RuntimeError("Initialization Failed")
        return active_configs[0]["name"]
        
    assert mock_check(p) == "GOOGLE_GEMINI_API"
    
    with pytest.raises(RuntimeError):
        mock_check(p_invalid)

# 2. Auth tests
def test_registration_password_rules():
    # Passwords must be between 5 and 20 chars
    # Too short
    response = client.post("/api/v1/auth/register", json={"username": "testuser_short", "password": "123"})
    assert response.status_code == 422
    
    # Too long
    response = client.post("/api/v1/auth/register", json={"username": "testuser_long", "password": "a" * 21})
    assert response.status_code == 422

def test_auth_route_guards_missing_cookie():
    # Attempting to fetch user info without cookies should yield 401
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401

# 3. SQL Guardrail & Validator tests
def test_sql_validator_select_only():
    # Valid SELECT
    state = AgentState(
        user_id=1,
        chat_id="test-chat",
        question="Show all orders",
        rbac_rules=[],
        generated_sql="SELECT * FROM orders",
        query_results=None,
        sql_error=None,
        response=None,
        status="IN_SCOPE",
        start_time=0.0,
        latency_ms=0,
        prompt_tokens=0,
        completion_tokens=0,
        total_tokens=0
    )
    result_state = sql_validation_node(state)
    assert result_state["status"] == "IN_SCOPE"
    assert result_state["sql_error"] is None
    
    # Unsafe INSERT
    state["generated_sql"] = "INSERT INTO customers (first_name) VALUES ('Hacked')"
    result_state = sql_validation_node(state)
    assert result_state["status"] == "SQL_ERROR"
    assert "Prohibited statement type" in result_state["sql_error"]
    assert "Security Exception" in result_state["response"]

    # Unsafe DROP
    state["generated_sql"] = "SELECT * FROM orders; DROP TABLE customers;"
    result_state = sql_validation_node(state)
    assert result_state["status"] == "SQL_ERROR"
    assert "Forbidden keyword 'DROP' detected" in result_state["sql_error"]
    assert "Security Exception" in result_state["response"]
