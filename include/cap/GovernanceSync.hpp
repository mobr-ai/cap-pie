#pragma once

#include "cap/Config.hpp"
#include "cap/Db.hpp"

#include <string>
#include <vector>

namespace cap {

struct GovSource {
  std::string type;
  std::string id;
  std::string url;
  std::string from;
};

void sync_governance(Db& db, const Config& config);

} // namespace cap
