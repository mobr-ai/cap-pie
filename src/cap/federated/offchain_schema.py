OFFCHAIN_SCHEMA = """
PostgreSQL off-chain asset market data schema:

Table: asset
- id BIGSERIAL PRIMARY KEY
- asset_id TEXT UNIQUE NOT NULL
- symbol TEXT NOT NULL
- name TEXT
- policy_id TEXT
- asset_name_hex TEXT
- decimals INTEGER NOT NULL DEFAULT 0
- asset_type TEXT NOT NULL DEFAULT 'token'
- created_at TIMESTAMPTZ NOT NULL DEFAULT now()

Table: asset_market_source
- id BIGSERIAL PRIMARY KEY
- asset_id TEXT NOT NULL REFERENCES asset(asset_id)
- source TEXT NOT NULL
- source_asset_id TEXT NOT NULL
- quote_asset TEXT NOT NULL
- base_asset_symbol TEXT
- source_market_id TEXT NOT NULL
- valid_from TIMESTAMPTZ NOT NULL
- valid_to TIMESTAMPTZ
- bootstrap_from TIMESTAMPTZ NOT NULL
- enabled BOOLEAN NOT NULL DEFAULT true
- metadata JSONB NOT NULL DEFAULT '{}'::jsonb
- created_at TIMESTAMPTZ NOT NULL DEFAULT now()
Unique key: (source, source_market_id)

Table: asset_ohlcv
- id BIGSERIAL PRIMARY KEY
- asset_id TEXT NOT NULL REFERENCES asset(asset_id)
- market_source_id BIGINT NOT NULL REFERENCES asset_market_source(id)
- ts TIMESTAMPTZ NOT NULL
- interval TEXT NOT NULL
- open NUMERIC(38,18) NOT NULL
- high NUMERIC(38,18) NOT NULL
- low NUMERIC(38,18) NOT NULL
- close NUMERIC(38,18) NOT NULL
- volume NUMERIC(38,18) NOT NULL
- source TEXT NOT NULL
- source_asset_id TEXT NOT NULL
- quote_asset TEXT NOT NULL
- created_at TIMESTAMPTZ NOT NULL DEFAULT now()
Unique key: (market_source_id, ts, interval)

Table: asset_indicator
- id BIGSERIAL PRIMARY KEY
- asset_id TEXT NOT NULL REFERENCES asset(asset_id)
- ts TIMESTAMPTZ NOT NULL
- interval TEXT NOT NULL
- ohlcv_source TEXT NOT NULL
- indicator TEXT NOT NULL
- period INTEGER NOT NULL
- value NUMERIC(38,18) NOT NULL
- params JSONB NOT NULL DEFAULT '{}'::jsonb
- source TEXT NOT NULL
- created_at TIMESTAMPTZ NOT NULL DEFAULT now()
Unique key: (asset_id, ts, interval, ohlcv_source, indicator, period, params, source)

Table: asset_relationship
- id BIGSERIAL PRIMARY KEY
- from_asset_id TEXT NOT NULL REFERENCES asset(asset_id)
- to_asset_id TEXT NOT NULL REFERENCES asset(asset_id)
- relationship_type TEXT NOT NULL
- effective_at TIMESTAMPTZ
- metadata JSONB NOT NULL DEFAULT '{}'::jsonb
- created_at TIMESTAMPTZ NOT NULL DEFAULT now()
Unique key: (from_asset_id, to_asset_id, relationship_type)

Table: offchain_governance_source
- id BIGSERIAL PRIMARY KEY
- provider TEXT NOT NULL
- source_type TEXT NOT NULL
- external_id TEXT NOT NULL
- url TEXT NOT NULL
- discovered_from TEXT
- first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
- last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
- enabled BOOLEAN NOT NULL DEFAULT true
Unique key: (provider, external_id)

Table: offchain_governance_metadata
- id BIGSERIAL PRIMARY KEY
- provider TEXT NOT NULL
- metadata_type TEXT NOT NULL
- external_id TEXT NOT NULL
- url TEXT NOT NULL
- content_type TEXT
- http_status INTEGER
- title TEXT
- abstract TEXT
- motivation TEXT
- rationale TEXT
- given_name TEXT
- raw_content TEXT NOT NULL
- content_sha256 TEXT NOT NULL
- fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
Unique key: (provider, external_id, content_sha256)

Table: offchain_governance_metadata_fetch_log
- id BIGSERIAL PRIMARY KEY
- provider TEXT NOT NULL
- url TEXT NOT NULL
- http_status INTEGER
- error TEXT
- attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()

Table: etl_checkpoint
- source TEXT NOT NULL
- entity_id TEXT NOT NULL
- checkpoint_key TEXT NOT NULL
- checkpoint_value TEXT NOT NULL
- updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
Primary key: (source, entity_id, checkpoint_key)

Query guidance:
- Use asset_ohlcv for price, OHLCV, candles, market volume, open, high, low, close, returns, volatility, and time-series market queries.
- Join asset when the user names a token by symbol, name, policy_id, or asset_name_hex.
- Join asset_market_source when the query depends on exchange/provider, quote asset, source symbol, market validity, or market-specific uniqueness.
- Use asset_indicator for precomputed indicators such as sma, ema, rsi, bb_middle, bb_upper, bb_lower, macd, macd_signal, and macd_histogram.
- Use asset_relationship for mapped relationships between assets, such as wrapped, bridged, derivative, or related market assets.
- Use offchain_governance_* tables only for off-chain governance metadata, pages, proposal discussions, budget discussions, and fetch status.
- Interval data currently available is 1h.
"""
