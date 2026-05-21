from typing import Any

from .charts import CHART_SCENES
from .misc import MISC_SCENES

DEMO_SCENES: dict[str, dict[str, Any]] = {
    **CHART_SCENES,
    **MISC_SCENES,
}

def pick_scene(query: str) -> dict | None:
    q = (query or "").strip().lower()
    for scene in DEMO_SCENES.values():
        if scene["match"] in q:
            return scene
    return None
