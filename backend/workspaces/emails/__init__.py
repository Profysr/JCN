"""
Email template loader. Add a new .html file in this directory for each new template.
Call render(template_name, context) to get a ready-to-send HTML string.
"""

import os

_DIR = os.path.dirname(__file__)


def render(template_name: str, context: dict) -> str:
    path = os.path.join(_DIR, template_name)
    with open(path, encoding="utf-8") as f:
        html = f.read()
    for key, value in context.items():
        html = html.replace(f"{{{{{key}}}}}", str(value))
    return html
