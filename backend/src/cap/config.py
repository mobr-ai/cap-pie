from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    APP_NAME: str = "CAP"
    APP_DESCRIPTION: str = "Cardano powered by LLM"

    # Virtuoso settings
    TRIPLESTORE_HOST: str
    TRIPLESTORE_PORT: int
    TRIPLESTORE_USER: str
    TRIPLESTORE_PASSWORD: str
    TRIPLESTORE_TIMEOUT: str
    TRIPLESTORE_ENDPOINT: str
    CHAIN_NAME: str = "cardano"
    KG_NAME: str
    ONTOLOGY_PATH: str

    # LLM settings
    LLM_ONTOLOGY_PATH: str
    MODEL_CONTEXT_CAP: int
    CHAR_PER_TOKEN: int

    # PostgreSQL settings for offchain data
    POSTGRES_HOST: str
    POSTGRES_PORT: int
    POSTGRES_DB: str
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str

    # Monitoring settings
    ENABLE_TRACING: bool
    LOG_LEVEL: str

    # APP settings
    APP_HOST: str
    APP_PORT: int

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True
    )

settings = Settings()
