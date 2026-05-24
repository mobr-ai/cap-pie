from dataclasses import dataclass
from typing import Literal

ReferLabel = Literal["refer", "not_refer"]
RenderFamily = Literal["chart", "table", "text"]
ChartSubtype = Literal[
    "line",
    "bar",
    "scatter",
    "bubble",
    "pie",
    "heatmap",
    "treemap",
]


@dataclass(frozen=True)
class ReferDecision:
    label: ReferLabel
    confidence: float
    reason: str = ""


@dataclass(frozen=True)
class RenderDecision:
    family: RenderFamily | None
    confidence: float
    chart_subtype: str | None = None
    matched_example: str | None = None
