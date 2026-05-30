import logging
from dataclasses import dataclass

from opentelemetry import trace

logger = logging.getLogger(__name__)
tracer = trace.get_tracer(__name__)


@dataclass
class PlaceholderCounters:
    """Track placeholder counters for SPARQL normalization."""
    pct: int = 0
    num: int = 0
    str: int = 0
    lim: int = 0
    uri: int = 0
    cur: int = 0
    inject: int = 0
    year: int = 0
    month: int = 0
    day: int = 0
    period: int = 0
    order: int = 0
    pool_id: int = 0
    duration: int = 0
    definition: int = 0
    quantifier: int = 0
    utxo_ref: int = 0
    address: int = 0
