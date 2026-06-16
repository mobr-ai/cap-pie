#pragma once

#include "cap/Config.hpp"
#include "cap/Db.hpp"

#include <string>
#include <vector>

namespace cap {

struct AssetMap {
  std::string asset_id;
  std::string symbol;
  std::string name;
  std::string policy;
  std::string hex;
  std::string decimals;
  std::string source;
  std::string source_asset;
  std::string quote;
  std::string bootstrap;
  std::string valid_from;
  std::string valid_to;
  std::string base_asset_symbol;
  std::string source_market_id;
};

struct AssetRelationshipMap {
  std::string from_asset_id;
  std::string to_asset_id;
  std::string relationship_type;
  std::string effective_at;
  std::string metadata;
};

std::vector<AssetMap> load_assets(const std::string& file);
void sync_ohlcv(Db& db, const Config& config);

} // namespace cap
