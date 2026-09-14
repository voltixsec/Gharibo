"""
Trainer service configuration.
"""
import os


class Settings:
    """Trainer service settings."""
    # Port to run on
    PORT: int = int(os.environ.get("TRAINER_PORT", "8100"))

    # Allowed data directories
    DATA_DIR: str = os.environ.get("DATA_DIR", "../../data")

    # Allowed model directories
    MODEL_DIR: str = os.environ.get("MODEL_DIR", "../../models")


settings = Settings()
