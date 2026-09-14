"""Inference service configuration."""
import os


class Settings:
    PORT: int = int(os.environ.get("INFERENCE_PORT", "8101"))


settings = Settings()
