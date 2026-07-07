import os
import yaml
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

# Load env variables
dotenv_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
if os.path.exists(dotenv_path):
    load_dotenv(dotenv_path)
else:
    load_dotenv()

class Settings(BaseSettings):
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/postgres")
    JWT_SECRET: str = os.getenv("JWT_SECRET", "super_secret_jwt_signing_key_change_me_in_production")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
    GOOGLE_GEMINI_KEY: str = os.getenv("GOOGLE_GEMINI_KEY", "")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()

# Validate llm_config.yaml on import/startup
def get_active_llm_config():
    config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "llm_config.yaml")
    if not os.path.exists(config_path):
        raise FileNotFoundError(f"Configuration file 'llm_config.yaml' not found at {config_path}")
        
    with open(config_path, "r", encoding="utf-8") as f:
        config_data = yaml.safe_load(f)
        
    models = config_data.get("models", [])
    active_configs = [m for m in models if m.get("active") is True]
    
    if len(active_configs) != 1:
        raise RuntimeError("Initialization Failed: Exactly one LLM configuration provider must be flagged active.")
        
    active_model = active_configs[0]["name"]
    return active_model

# Run validation and cache active LLM model
ACTIVE_LLM_PROVIDER = get_active_llm_config()

def get_gemini_model_setting() -> str:
    config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "llm_config.yaml")
    if os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                config_data = yaml.safe_load(f)
                return config_data.get("gemini_model", "gemini-2.5-flash-lite")
        except Exception:
            pass
    return "gemini-2.5-flash-lite"

GEMINI_MODEL = get_gemini_model_setting()
print(f"Active LLM Provider loaded: {ACTIVE_LLM_PROVIDER} (Model: {GEMINI_MODEL})")
