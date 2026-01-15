"""
Model configuration for Agent Smith.

Supports multiple LLM providers via CAMEL-AI ModelFactory.
"""

import os
from typing import Optional
from dotenv import load_dotenv
from camel.models import ModelFactory
from camel.types import ModelPlatformType, ModelType

load_dotenv()


def get_model_config() -> Optional[dict]:
    """
    Get model configuration from environment.

    Priority:
    1. OPENROUTER_API_KEY - Use OpenRouter
    2. HEYATLAS_PROVIDER_API_KEY - Use OpenAI-compatible gateway
    3. OPENAI_API_KEY - Use OpenAI directly
    """

    # HeyAtlas Gateway (OpenAI-compatible)
    heyatlas_key = os.getenv("HEYATLAS_PROVIDER_API_KEY")
    heyatlas_url = os.getenv("HEYATLAS_PROVIDER_API_URL")
    model_name = os.getenv("MODEL_NAME", "zai-glm-4.7")
    if heyatlas_key and heyatlas_url:
        # zai-glm-4.7 doesn't support response_format - exclude it from config
        # so it won't be passed to the API
        return {
            "platform": ModelPlatformType.OPENAI_COMPATIBLE_MODEL,
            "model_type": model_name,
            "api_key": heyatlas_key,
            "url": heyatlas_url,
            "config": {"temperature": 0.2, "max_tokens": 8192},
        }

    # OpenAI fallback
    openai_key = os.getenv("OPENAI_API_KEY")
    if openai_key:
        return {
            "platform": ModelPlatformType.DEFAULT,
            "model_type": ModelType.GPT_4O_MINI,
            "api_key": openai_key,
            "url": None,
            "config": {"temperature": 0.2, "max_tokens": 8192},
        }

    return None


def create_agent_model(model_type: Optional[str] = None):
    """
    Create a model instance for agents.

    Args:
        model_type: Override model type from environment
    """
    config = get_model_config()

    if not config:
        raise ValueError(
            "No API key found. Set one of: OPENROUTER_API_KEY, "
            "HEYATLAS_PROVIDER_API_KEY, or OPENAI_API_KEY"
        )

    kwargs = {
        "model_platform": config["platform"],
        "model_type": model_type or config["model_type"],
        "model_config_dict": config["config"],
    }

    if config["api_key"]:
        kwargs["api_key"] = config["api_key"]
    if config["url"]:
        kwargs["url"] = config["url"]

    return ModelFactory.create(**kwargs)
