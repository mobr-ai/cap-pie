#!/usr/bin/env bash
set -euo pipefail
./build/cap-offchain-etl --config config/config.local.json "$@"
