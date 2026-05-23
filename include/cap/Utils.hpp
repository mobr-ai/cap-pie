#pragma once

#include <string>
#include <vector>

namespace cap {

std::string now_utc();
void log(const std::string& level, const std::string& message);
std::string trim(std::string value);
std::vector<std::string> split_csv(const std::string& line);
std::string read_file(const std::string& path);
std::string shell_escape(const std::string& value);
long long fnv1a64(const std::string& value);
std::string hex_id(const std::string& value);
std::string pseudo_sha256(const std::string& value);
long long parse_utc_ms(const std::string& iso_timestamp);
std::string ms_to_iso(long long milliseconds);
std::string run_command_capture(const std::string& command);
bool safe_market_token(const std::string& value);

} // namespace cap
