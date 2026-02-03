from dotenv import load_dotenv
from e2b import Template, default_build_logger

from template import template

load_dotenv()

Template.build(
    template,
    alias="heyatlas-opencode",
    cpu_count=4,
    memory_mb=4096,
    on_build_logs=default_build_logger(),
)
