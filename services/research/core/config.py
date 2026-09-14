"""Research service configuration."""
import os


class Settings:
    PORT: int = int(os.environ.get("RESEARCH_PORT", "8102"))


settings = Settings()
