CREATE TABLE IF NOT EXISTS asset (
  id BIGSERIAL PRIMARY KEY,
  asset_id TEXT NOT NULL UNIQUE,
  symbol TEXT NOT NULL,
  name TEXT,
  policy_id TEXT,
  asset_name_hex TEXT,
  decimals INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_asset_symbol ON asset(symbol);
CREATE INDEX IF NOT EXISTS ix_asset_policy_id ON asset(policy_id);

CREATE TABLE IF NOT EXISTS asset_market_source (
  id BIGSERIAL PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES asset(asset_id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  source_asset_id TEXT NOT NULL,
  quote_asset TEXT NOT NULL,
  bootstrap_from TIMESTAMPTZ NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(asset_id, source, source_asset_id, quote_asset)
);
CREATE INDEX IF NOT EXISTS ix_asset_market_source_source ON asset_market_source(source);

CREATE TABLE IF NOT EXISTS asset_ohlcv (
  id BIGSERIAL PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES asset(asset_id) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL,
  interval TEXT NOT NULL,
  open NUMERIC(38,18) NOT NULL,
  high NUMERIC(38,18) NOT NULL,
  low NUMERIC(38,18) NOT NULL,
  close NUMERIC(38,18) NOT NULL,
  volume NUMERIC(38,18) NOT NULL,
  source TEXT NOT NULL DEFAULT 'unknown',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(asset_id, ts, interval, source)
);
CREATE INDEX IF NOT EXISTS ix_asset_ohlcv_asset_ts ON asset_ohlcv(asset_id, ts);
CREATE INDEX IF NOT EXISTS ix_asset_ohlcv_ts_interval ON asset_ohlcv(ts, interval);

CREATE TABLE IF NOT EXISTS asset_indicator (
    id BIGSERIAL PRIMARY KEY,

    asset_id TEXT NOT NULL REFERENCES asset(asset_id) ON DELETE CASCADE,
    ts TIMESTAMPTZ NOT NULL,
    interval TEXT NOT NULL,

    ohlcv_source TEXT NOT NULL,

    indicator TEXT NOT NULL,
    period INTEGER NOT NULL,
    value NUMERIC(38, 18) NOT NULL,
    params JSONB NOT NULL DEFAULT '{}'::jsonb,

    source TEXT NOT NULL DEFAULT 'cap-offchain-etl',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_asset_indicator
      UNIQUE(asset_id, ts, interval, ohlcv_source, indicator, period, params, source)
);

CREATE INDEX IF NOT EXISTS ix_asset_indicator_lookup
ON asset_indicator(asset_id, interval, indicator, period, ts);

CREATE INDEX IF NOT EXISTS ix_asset_indicator_ts
ON asset_indicator(ts, interval);

CREATE INDEX IF NOT EXISTS ix_asset_indicator_latest
ON asset_indicator(asset_id, interval, ohlcv_source, indicator, period, ts DESC);

CREATE TABLE IF NOT EXISTS etl_checkpoint (
  source TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  checkpoint_key TEXT NOT NULL,
  checkpoint_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(source, entity_id, checkpoint_key)
);

CREATE TABLE IF NOT EXISTS offchain_governance_source (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  source_type TEXT NOT NULL,
  external_id TEXT NOT NULL,
  url TEXT NOT NULL,
  discovered_from TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  enabled BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(provider, external_id)
);
CREATE INDEX IF NOT EXISTS ix_offchain_governance_source_type ON offchain_governance_source(source_type);
CREATE INDEX IF NOT EXISTS ix_offchain_governance_source_url ON offchain_governance_source(url);

CREATE TABLE IF NOT EXISTS offchain_governance_metadata (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  metadata_type TEXT NOT NULL,
  external_id TEXT NOT NULL,
  url TEXT NOT NULL,
  content_type TEXT,
  http_status INTEGER,
  title TEXT,
  abstract TEXT,
  motivation TEXT,
  rationale TEXT,
  given_name TEXT,
  raw_content TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, external_id, content_sha256)
);
CREATE INDEX IF NOT EXISTS ix_offchain_governance_metadata_type ON offchain_governance_metadata(metadata_type);
CREATE INDEX IF NOT EXISTS ix_offchain_governance_metadata_external_id ON offchain_governance_metadata(external_id);
CREATE INDEX IF NOT EXISTS ix_offchain_governance_metadata_url ON offchain_governance_metadata(url);

CREATE TABLE IF NOT EXISTS offchain_governance_metadata_fetch_log (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  url TEXT NOT NULL,
  http_status INTEGER,
  error TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_offchain_governance_metadata_fetch_log_url ON offchain_governance_metadata_fetch_log(url);
