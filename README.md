# CAP Offchain ETL

## Overview

CAP Offchain ETL (`cap-offchain-etl`) is a C++ ETL pipeline designed to continuously synchronize offchain Cardano data into PostgreSQL.

Currently, the project has three components:

1. OHLCV market data synchronization
2. Technical indicator synchronization
3. Offchain governance metadata synchronization

Supporting:

- Initial historical bootstrap
- Incremental synchronization
- Automatic PostgreSQL schema creation
- Idempotent upserts
- Checkpoint-based synchronization
- Real-time 1h candle updates
- Docker deployment
- Local native deployment
- Configurable governance metadata sources
- Asset symbol mapping
- Production logging
- Fault-tolerant retries

---

# OHLCV Synchronization

## Goal

The OHLCV component continuously synchronizes 1-hour candle data for Cardano ecosystem assets.

The ETL stores:

- open
- high
- low
- close
- volume

for each asset and timestamp.

The default implementation uses Binance Spot public market APIs.

---

## Why Binance Instead of CoinGecko

We designed cap-offchain-etl to use free apis.

CoinGecko free APIs are designed primarily for demo or lightweight applications.

For continuous ETL synchronization, the free tier is insufficient because:

- historical limits are restrictive
- rate limits are aggressive
- full historical bootstrap becomes impractical
- large-scale synchronization is unreliable

Binance Spot public APIs are more appropriate for ETL workloads because they:

- expose direct kline endpoints
- support historical pagination
- allow incremental synchronization
- are free to access
- support efficient checkpoint synchronization
- are operationally stable

The ETL therefore uses Binance Spot as the default market source.

---

## Asset Mapping

Asset mapping defines how CAP assets map to external market instruments.

This separation is important because a Cardano asset, a centralized exchange symbol, and a market data provider identifier are not the same thing.

For example:

```csv
asset_id,symbol,name,policy_id,asset_name_hex,decimals,source,source_asset_id,quote_asset,bootstrap_from,valid_from,valid_to,base_asset_symbol,source_market_id
agix,AGIX,SingularityNET,,,8,binance_spot,AGIXUSDT,USDT,2018-04-16T00:00:00Z,2018-04-16T00:00:00Z,2024-07-01T00:00:00Z,AGIX,binance_spot:AGIXUSDT
fet,FET,Artificial Superintelligence Alliance,,,8,binance_spot,FETUSDT,USDT,2024-07-01T00:00:00Z,2024-07-01T00:00:00Z,,FET,binance_spot:FETUSDT
```

---

## Asset Relationships and Token Migrations

Some assets change identity over time.

Examples include:

- token migrations
- ticker changes
- protocol mergers
- rebrands
- wrapped-to-native transitions
- deprecated markets replaced by successor markets

The ETL models these cases explicitly through `asset_relationship`.

Example:

```csv
from_asset_id,to_asset_id,relationship_type,effective_at,metadata
agix,fet,migrated_to,2024-07-01T00:00:00Z,"{""note"":""AGIX migrated into ASI/FET. Keep historical AGIX OHLCV separate but queryable through relationship graph.""}"
```

---

# Technical Indicator Synchronization

## Goal

The indicator component keeps commonly used market indicators synchronized in PostgreSQL.

The ETL calculates indicators from the synchronized 1-hour OHLCV candles and stores the results in `asset_indicator`.

The default indicators are:

- SMA: 20, 50, 100, 200
- EMA: 9, 20, 50, 100, 200
- RSI: 14
- Bollinger Bands: 20-period, 2 standard deviations
- MACD: 12/26/9

Indicators are calculated after each OHLCV synchronization cycle.

This means the standard production flow is:

```text
fetch OHLCV candles
        ↓
upsert asset_ohlcv
        ↓
calculate indicators
        ↓
upsert asset_indicator
        ↓
sync governance metadata
```

---

# Governance Metadata Synchronization

## Goal

The governance ETL is designed only for metadata enrichment.

Examples include:

- proposal metadata JSON
- governance rationale documents
- DRep metadata
- CIP-119 metadata
- CIP-108 metadata
- external governance references
- governance attachments
- governance descriptions
- governance titles
- governance summaries

These objects are stored offchain as JSON documents.

---

## Governance Synchronization Strategy

The ETL periodically downloads configured metadata documents.

Each metadata source is identified by:

- proposal ID
- DRep ID
- governance identifier
- metadata URL

The ETL then:

1. downloads the document
2. validates JSON
3. extracts normalized fields
4. stores the raw JSON
5. updates synchronization timestamps

The correlation with onchain governance entities is intentionally externalized.

The consuming analytics platform is responsible for joining:

```text
offchain proposal id
        with
onchain governance proposal id
```

This keeps the ETL fully decoupled from blockchain indexing.

---

# PostgreSQL

## Default Connection Configuration

The ETL uses the following default PostgreSQL configuration:

```env
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=mysecretpassword
POSTGRES_DB=cap
```

Default SQLAlchemy-compatible URL:

```env
DATABASE_URL=postgresql://postgres:mysecretpassword@postgres:5432/cap
```

---

## Automatic Schema Bootstrap

On startup, the ETL automatically:

1. connects to PostgreSQL
2. checks whether required tables exist
3. creates missing tables
4. creates indexes
5. creates synchronization state tables
6. initializes metadata tables

No manual database initialization is required.

The ETL is designed so that a fresh deployment works immediately.

---

# Configuration

## Main Configuration File

Default configuration:

```text
config/config.json
```

The configuration controls:

- PostgreSQL connection
- OHLC synchronization
- governance synchronization
- scheduler intervals
- asset mappings
- asset market source mappings
- asset relationship mappings for migrations and ticker changes
- governance metadata sources
- logging

---

# Running the ETL

## Standard Production Execution

The standard execution mode continuously synchronizes:

- OHLCV data
- governance metadata
- technical indicator periods
- indicator warmup window

Run:

```bash
./build/cap-offchain-etl
```

This is the primary production mode.

The ETL continuously runs in synchronization loops.

---

## Run Once Mode

Run a single synchronization cycle:

```bash
./build/cap-offchain-etl --run-once
```

This mode is useful for:

- testing
- CI pipelines
- debugging
- manual synchronization

---

## Custom Configuration

Use a custom configuration file:

```bash
./build/cap-offchain-etl --config config/custom.json
```

---

# Docker Deployment

## Start the Full Stack

Build and start PostgreSQL plus the ETL:

```bash
docker compose up --build
```

This command:

1. builds the ETL container
2. starts PostgreSQL
3. initializes the database
4. starts synchronization loops
5. keeps the ETL running continuously

---

## Stop the Stack

```bash
docker compose down
```

---

## Run a Single Synchronization Cycle

```bash
docker compose run --rm cap-offchain-etl --run-once
```

---

# Local Native Build

## Install Dependencies

Debian/Ubuntu:

```bash
sudo apt-get update

sudo apt-get install -y \
    build-essential \
    cmake \
    libpq-dev \
    curl \
    ca-certificates
```

---

## Build

```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release

cmake --build build -j$(nproc)
```

---

## Execute

```bash
./build/cap-offchain-etl --config config/config.local.json
```

---

# Synchronization State

The ETL maintains synchronization checkpoints inside PostgreSQL.

Examples:

- latest synchronized OHLC candle timestamp
- latest synchronized indicator timestamp per asset/source
- latest governance metadata fetch timestamp
- retry states
- synchronization cursors

This guarantees:

- resumability
- crash recovery
- incremental synchronization
- reduced API usage

OHLCV checkpoints are tracked by `source_market_id`, not only by `asset_id`.

This matters for edge cases such as AGIX → FET, where the historical market `binance_spot:AGIXUSDT` and the successor market `binance_spot:FETUSDT` must have independent checkpoints.

This prevents the ETL from repeatedly querying inactive or missing Binance archive files after a market has ended.

---

# Fault Tolerance

The ETL includes:

- retry handling
- transient failure recovery
- HTTP timeout handling
- PostgreSQL reconnect logic
- partial synchronization isolation
- idempotent inserts

Failures in one synchronization source do not stop the entire ETL.

---

# Logging

The ETL produces structured logs for:

- synchronization events
- API requests
- synchronization progress
- retries
- failures
- PostgreSQL operations

Logs are written to stdout by default.

---

# Resetting PostgreSQL Tables

If you want to completely remove all tables created by `cap-offchain-etl` and start synchronization from scratch, connect to PostgreSQL and drop the ETL tables.

## Connect to PostgreSQL

Using the default CAP PostgreSQL container:

```bash
docker exec -it postgres psql -U postgres -d cap
```

Or from the host:

```bash
psql -h localhost -p 5433 -U postgres -d cap
```

---

## Drop All ETL Tables

Execute:

```sql
DROP TABLE IF EXISTS offchain_governance_metadata_fetch_log CASCADE;
DROP TABLE IF EXISTS offchain_governance_metadata CASCADE;
DROP TABLE IF EXISTS offchain_governance_source CASCADE;
DROP TABLE IF EXISTS etl_checkpoint CASCADE;
DROP TABLE IF EXISTS asset_indicator CASCADE;
DROP TABLE IF EXISTS asset_ohlcv CASCADE;
DROP TABLE IF EXISTS asset_market_source CASCADE;
DROP TABLE IF EXISTS asset_relationship CASCADE;
DROP TABLE IF EXISTS asset CASCADE;
```

---

## Verify Cleanup

Inside PostgreSQL:

```sql
\dt
```

The ETL tables should no longer appear.

---

## Recreate Tables Automatically

On the next ETL startup:

```bash
./build/cap-offchain-etl --config config/config.json
```

or:

```bash
docker compose up
```

The ETL automatically recreates all required tables and indexes when:

```json
"bootstrap_schema": true
```

is enabled in the configuration.

---

## Full Historical Rebootstrap

After deleting the tables:

- OHLCV synchronization restarts from the configured `bootstrap_from` timestamps
- governance synchronization restarts from the beginning
- synchronization checkpoints are recreated
- all metadata is downloaded again

This is useful when:

- testing schema changes
- rebuilding corrupted datasets
- validating ETL fixes
- performing clean-room reindexing

---

# License

MIT. See LICENSE file for details.
