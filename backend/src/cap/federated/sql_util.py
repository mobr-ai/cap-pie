import re


_SELECT_RE = re.compile(r"^\s*(SELECT|WITH)\b", re.IGNORECASE)
_FORBIDDEN_RE = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|COPY|CALL|DO|MERGE)\b",
    re.IGNORECASE,
)


def clean_sql(raw: str) -> str:
    if not raw:
        return ""

    text = raw.strip()
    text = re.sub(r"```sql\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"```\s*", "", text)

    match = re.search(r"((?:WITH|SELECT)\b[\s\S]*)", text, re.IGNORECASE)
    if match:
        text = match.group(1)

    return text.strip().rstrip(";")


def ensure_safe_readonly_sql(sql: str) -> str:
    cleaned = clean_sql(sql)

    if not cleaned:
        return ""

    if not _SELECT_RE.search(cleaned):
        raise ValueError("Only SELECT/WITH SQL queries are allowed.")

    if _FORBIDDEN_RE.search(cleaned):
        raise ValueError("Unsafe SQL statement rejected.")

    return cleaned


def force_limit(sql: str, limit: int = 3500) -> str:
    cleaned = ensure_safe_readonly_sql(sql).rstrip().rstrip(";")

    if not cleaned:
        return ""

    if re.search(r"\bLIMIT\s+\d+\s*$", cleaned, re.IGNORECASE):
        return cleaned

    return f"SELECT * FROM (\n{cleaned}\n) AS cap_limited_result\nLIMIT {limit}"