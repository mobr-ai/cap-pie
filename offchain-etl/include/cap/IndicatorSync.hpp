#pragma once

#include "cap/Config.hpp"
#include "cap/Db.hpp"

namespace cap {

void sync_indicators(Db& db, const Config& config);

} // namespace cap
