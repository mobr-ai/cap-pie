ASSET_OHLCV_SCHEMA = """
PostgreSQL asset market data schema:

Table: asset
- id BIGSERIAL PRIMARY KEY
- asset_id TEXT UNIQUE NOT NULL
- symbol TEXT NOT NULL
- name TEXT
- policy_id TEXT
- asset_name_hex TEXT
- decimals INTEGER DEFAULT 0
- created_at TIMESTAMPTZ NOT NULL DEFAULT now()

Table: asset_ohlcv
- id BIGSERIAL PRIMARY KEY
- asset_id TEXT NOT NULL REFERENCES asset(asset_id)
- ts TIMESTAMPTZ NOT NULL
- interval TEXT NOT NULL
- open NUMERIC(38, 18) NOT NULL
- high NUMERIC(38, 18) NOT NULL
- low NUMERIC(38, 18) NOT NULL
- close NUMERIC(38, 18) NOT NULL
- volume NUMERIC(38, 18) NOT NULL
- source TEXT NOT NULL DEFAULT 'unknown'
- created_at TIMESTAMPTZ NOT NULL DEFAULT now()

Unique key: (asset_id, ts, interval, source)

Use asset_ohlcv for price, OHLCV, candles, market volume, high, low, open, close, moving averages, returns, volatility, and time-series asset-market queries.
Join asset when the user names a token by symbol, name, policy_id, or asset_name_hex.
"""