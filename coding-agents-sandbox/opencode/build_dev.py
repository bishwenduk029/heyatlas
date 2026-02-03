from dotenv import load_dotenv
from e2b import Template, default_build_logger

from template import template

load_dotenv()

Template.build(
    template,
    alias="heyatlas-opencode-dev",
    cpu_count=2,
    memory_mb=2048,
    on_build_logs=default_build_logger(),
)
