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
};

std::vector<AssetMap> load_assets(const std::string& file);
void sync_ohlcv(Db& db, const Config& config);

} // namespace cap
