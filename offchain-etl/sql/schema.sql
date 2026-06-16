CREATE TABLE IF NOT EXISTS asset (
  id BIGSERIAL PRIMARY KEY,
  asset_id TEXT NOT NULL UNIQUE,
  symbol TEXT NOT NULL,
  name TEXT,
  policy_id TEXT,
  asset_name_hex TEXT,
  decimals INTEGER NOT NULL DEFAULT 0,
  asset_type TEXT NOT NULL DEFAULT 'token',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_asset_symbol ON asset(symbol);
CREATE INDEX IF NOT EXISTS ix_asset_policy_id ON asset(policy_id);

CREATE TABLE IF NOT EXISTS asset_relationship (
  id BIGSERIAL PRIMARY KEY,
  from_asset_id TEXT NOT NULL REFERENCES asset(asset_id) ON DELETE CASCADE,
  to_asset_id TEXT NOT NULL REFERENCES asset(asset_id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  effective_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(from_asset_id, to_asset_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS ix_asset_relationship_from ON asset_relationship(from_asset_id);
CREATE INDEX IF NOT EXISTS ix_asset_relationship_to ON asset_relationship(to_asset_id);

CREATE TABLE IF NOT EXISTS asset_market_source (
  id BIGSERIAL PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES asset(asset_id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  source_asset_id TEXT NOT NULL,
  quote_asset TEXT NOT NULL,
  base_asset_symbol TEXT,
  source_market_id TEXT NOT NULL,
  valid_from TIMESTAMPTZ NOT NULL,
  valid_to TIMESTAMPTZ,
  bootstrap_from TIMESTAMPTZ NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source, source_market_id)
);

CREATE INDEX IF NOT EXISTS ix_asset_market_source_asset ON asset_market_source(asset_id);
CREATE INDEX IF NOT EXISTS ix_asset_market_source_source ON asset_market_source(source);
CREATE INDEX IF NOT EXISTS ix_asset_market_source_source_asset ON asset_market_source(source_asset_id);
CREATE INDEX IF NOT EXISTS ix_asset_market_source_validity ON asset_market_source(valid_from, valid_to);

CREATE TABLE IF NOT EXISTS asset_ohlcv (
  id BIGSERIAL PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES asset(asset_id) ON DELETE CASCADE,
  market_source_id BIGINT NOT NULL REFERENCES asset_market_source(id) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL,
  interval TEXT NOT NULL,
  open NUMERIC(38,18) NOT NULL,
  high NUMERIC(38,18) NOT NULL,
  low NUMERIC(38,18) NOT NULL,
  close NUMERIC(38,18) NOT NULL,
  volume NUMERIC(38,18) NOT NULL,
  source TEXT NOT NULL,
  source_asset_id TEXT NOT NULL,
  quote_asset TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(market_source_id, ts, interval)
);

CREATE INDEX IF NOT EXISTS ix_asset_ohlcv_asset_ts ON asset_ohlcv(asset_id, ts);
CREATE INDEX IF NOT EXISTS ix_asset_ohlcv_market_ts ON asset_ohlcv(market_source_id, ts);
CREATE INDEX IF NOT EXISTS ix_asset_ohlcv_source_symbol_ts ON asset_ohlcv(source, source_asset_id, ts);
CREATE INDEX IF NOT EXISTS ix_asset_ohlcv_ts_interval ON asset_ohlcv(ts, interval);

CREATE TABLE IF NOT EXISTS asset_indicator (
  id BIGSERIAL PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES asset(asset_id) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL,
  interval TEXT NOT NULL,
  ohlcv_source TEXT NOT NULL,
  indicator TEXT NOT NULL,
  period INTEGER NOT NULL,
  value NUMERIC(38,18) NOT NULL,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(asset_id, ts, interval, ohlcv_source, indicator, period, params, source)
);

CREATE INDEX IF NOT EXISTS ix_asset_indicator_asset_ts ON asset_indicator(asset_id, ts);
CREATE INDEX IF NOT EXISTS ix_asset_indicator_indicator ON asset_indicator(indicator);


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
