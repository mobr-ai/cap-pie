"""
SPARQL Results to Key-Value Converter for Blockchain Data
"""
import logging
import re
from typing import Any

from pyparsing import ParseException
from rdflib.plugins.sparql.parser import parseQuery

from cap.chains.registry import get_chain

logger = logging.getLogger(__name__)

def _clean_sparql(sparql_text: str) -> str:
    """
    Clean and extract SPARQL query from LLM response.

    Args:
        sparql_text: Raw text from LLM

    Returns:
        Cleaned SPARQL query
    """
    # Remove markdown code blocks
    sparql_text = re.sub(r'```sparql\s*', '', sparql_text)
    sparql_text = re.sub(r'```\s*', '', sparql_text)

    # Extract SPARQL query pattern
    # Look for PREFIX or SELECT/ASK/CONSTRUCT/DESCRIBE
    match = re.search(
        r'((?:PREFIX[^\n]+\n)*\s*(?:SELECT|ASK|CONSTRUCT|DESCRIBE).*)',
        sparql_text,
        re.IGNORECASE | re.DOTALL
    )

    if match:
        sparql_text = match.group(1)

    # Remove common explanatory text
    sparql_text = re.sub(r'(?i)here is the sparql query:?\s*', '', sparql_text)
    sparql_text = re.sub(r'(?i)the query is:?\s*', '', sparql_text)
    sparql_text = re.sub(r'(?i)this query will:?\s*.*$', '', sparql_text, flags=re.MULTILINE)

    # Remaining nl before PREFIX
    index = sparql_text.find("PREFIX")
    if index > -1:
        sparql_text = sparql_text[index:]

    # Clean up whitespace
    lines = [line.strip() for line in sparql_text.strip().split('\n') if line.strip()]

    # Filter out lines that are explanatory text and prefixes
    sparql_lines = []
    in_query = False
    for line in lines:
        upper_line = line.upper()
        # Start capturing when we hit query keywords
        if any(keyword in upper_line for keyword in ['SELECT', 'ASK', 'CONSTRUCT', 'DESCRIBE']):
            in_query = True

        # Once we're in the query, keep all lines
        if in_query:
            sparql_lines.append(line)

    cleaned = '\n'.join(sparql_lines).strip()

    logger.debug(f"Cleaned SPARQL query: {cleaned}")
    return cleaned

def _ensure_prefixes(query: str) -> str:
    required_prefixes = get_chain().sparql_prefixes()

    stripped = query.strip()
    query_upper = query.upper()

    missing_prefixes = []
    for prefix_name, prefix_declaration in required_prefixes.items():
        pattern1 = f"PREFIX {prefix_name}:".upper()
        pattern2 = f"PREFIX {prefix_name} :".upper()

        if pattern1 not in query_upper and pattern2 not in query_upper:
            missing_prefixes.append(prefix_declaration)

    if missing_prefixes:
        return "\n".join(missing_prefixes) + "\n\n" + stripped

    return query

def _validate_and_fix_sparql(query: str, nl_query: str) -> tuple[bool, str, list[str]]:
    """
    Validate and attempt to fix SPARQL query issues.

    Process:
    1. Try to detect and fix common semantic issues FIRST
    2. Then validate syntax with RDFLib parser
    3. If validation fails, try additional fixes and re-validate

    Args:
        query: SPARQL query string to validate and fix

    Returns:
        Tuple of (is_valid: bool, fixed_query: str, issues: list[str])
    """
    issues = []
    fixed_query = query

    # Try syntax validation
    try:
        parseQuery(fixed_query)
        return True, fixed_query, issues
    except ParseException as e:
        error_msg = f"Syntax error: {str(e)}"
        issues.append(error_msg)
        logger.warning(f"Error for query {nl_query}: {error_msg}")

        # Step 3: Try additional fixes based on the error
        if "expected" in str(e).lower():
            # Try to fix missing dots, braces, etc.
            fixed_query = _fix_structural_issues(fixed_query, issues)

            # Re-validate after structural fixes
            try:
                parseQuery(fixed_query)
                logger.info("Query validated after structural fixes")
                return True, fixed_query, issues
            except Exception:
                pass

        return False, fixed_query, issues

    except Exception as e:
        error_msg = f"Validation error: {str(e)}"
        issues.append(error_msg)
        logger.error(error_msg)
        return False, fixed_query, issues


def _fix_structural_issues(query: str, issues: list[str]) -> str:
    """
    Fix basic structural issues like unbalanced braces or parentheses.
    """
    fixed_query = query

    # Check and fix unbalanced braces
    open_braces = fixed_query.count('{')
    close_braces = fixed_query.count('}')
    if open_braces > close_braces:
        fixed_query += ' }' * (open_braces - close_braces)
        issues.append(f"Added {open_braces - close_braces} missing closing braces")

    # Check and fix unbalanced parentheses
    open_parens = fixed_query.count('(')
    close_parens = fixed_query.count(')')
    if open_parens > close_parens:
        fixed_query += ')' * (open_parens - close_parens)
        issues.append(f"Added {open_parens - close_parens} missing closing parentheses")

    return fixed_query

def _parse_sequential_sparql(sparql_text: str) -> list[dict[str, Any]]:
    """
    Parse sequential SPARQL queries from LLM response with proper INJECT extraction.
    """
    queries = []

    # Split by query sequence markers
    parts = re.split(r'---query sequence \d+:.*?---', sparql_text)

    for part in parts[1:]:  # Skip first empty part
        cleaned = _clean_sparql(part)
        if not cleaned:
            continue
        cleaned = _ensure_prefixes(cleaned)

        # Extract INJECT patterns with nested parentheses
        inject_params = []
        pos = 0
        while True:
            match = re.search(r'INJECT(?:_FROM_PREVIOUS)?\(', cleaned[pos:])
            if not match:
                break

            start = pos + match.start()
            paren_count = 1
            i = start + len(match.group(0))
            while i < len(cleaned) and paren_count > 0:
                if cleaned[i] == '(':
                    paren_count += 1
                elif cleaned[i] == ')':
                    paren_count -= 1
                i += 1

            if paren_count == 0:
                inject_params.append(cleaned[start:i])
                pos = i
            else:
                break

        queries.append({
            'query': cleaned,
            'inject_params': inject_params
        })

    return queries

def ensure_validity(sparql_query: str, nl_query: str) -> str:
    cleaned = _clean_sparql(sparql_query)
    cleaned = _ensure_prefixes(cleaned)

    # Validate and fix
    _, fixed_query, issues = _validate_and_fix_sparql(cleaned, nl_query)
    if issues:
        logger.info(f"SPARQL validation results: {'; '.join(issues)}")

    return fixed_query

TAIL_RE = re.compile(
    r"""
    \s*
    (?:
        LIMIT\s+\S+
        (?:\s+OFFSET\s+\S+)?
    )?
    \s*$
    """,
    re.IGNORECASE | re.DOTALL | re.VERBOSE
)

def force_limit_cap(query: str, limit_cap: int = 3500) -> str:
    """
    Ensures the query has an appropriate LIMIT based on limit_cap:
    - If limit_cap is 0: removes existing LIMIT and sets LIMIT 0
    - If limit_cap > 0: only updates LIMIT if existing LIMIT is larger than limit_cap
    - Only modifies the outermost query LIMIT
    """
    q = query.rstrip().rstrip(";")

    if limit_cap == 0:
        # Remove existing trailing LIMIT/OFFSET and set LIMIT 0
        q = TAIL_RE.sub("", q).rstrip()
        return f"{q}\nLIMIT 0"

    # Extract existing LIMIT value from outermost query
    limit_match = re.search(
        r'LIMIT\s+(\d+)\s*(?:OFFSET\s+\d+)?\s*$',
        q,
        re.IGNORECASE
    )

    if limit_match:
        existing_limit = int(limit_match.group(1))
        # Only update if existing limit is larger than limit_cap
        if existing_limit > limit_cap:
            q = TAIL_RE.sub("", q).rstrip()
            return f"{q}\nLIMIT {limit_cap}"
        else:
            # Keep existing limit as is
            return query.rstrip().rstrip(";")
    else:
        # No existing LIMIT, add limit_cap
        q = TAIL_RE.sub("", q).rstrip()
        return f"{q}\nLIMIT {limit_cap}"
