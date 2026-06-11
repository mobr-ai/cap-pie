#include "cap/Utils.hpp"

#include <algorithm>
#include <array>
#include <cctype>
#include <chrono>
#include <cstdio>
#include <ctime>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace cap {

std::string now_utc()
{
  time_t timestamp = time(nullptr);
  tm utc_time{};
  gmtime_r(&timestamp, &utc_time);

  char buffer[32];
  strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", &utc_time);

  return buffer;
}

void log(const std::string& level, const std::string& message)
{
  std::cerr << now_utc() << " [" << level << "] " << message << "\n";
}

std::string trim(std::string value)
{
  auto is_not_space = [](int c) {
    return !std::isspace(c);
  };

  value.erase(
    value.begin(),
    std::find_if(value.begin(), value.end(), is_not_space)
  );

  value.erase(
    std::find_if(value.rbegin(), value.rend(), is_not_space).base(),
    value.end()
  );

  return value;
}

std::vector<std::string> split_csv(const std::string& line)
{
  std::vector<std::string> values;
  std::string current;
  bool quoted = false;

  for(size_t i = 0; i < line.size(); ++i) {
    char c = line[i];

    if(c == '"') {
      if(quoted && i + 1 < line.size() && line[i + 1] == '"') {
        current.push_back('"');
        ++i;
      } else {
        quoted = !quoted;
      }

      continue;
    }

    if(c == ',' && !quoted) {
      values.push_back(trim(current));
      current.clear();
      continue;
    }

    current.push_back(c);
  }

  values.push_back(trim(current));

  return values;
}

std::string read_file(const std::string& path)
{
  std::ifstream file(path);

  if(!file) {
    throw std::runtime_error("cannot open file: " + path);
  }

  std::stringstream buffer;
  buffer << file.rdbuf();

  return buffer.str();
}

std::string shell_escape(const std::string& value)
{
  std::string escaped;

  for(char c : value) {
    if(c == '\'') {
      escaped += "''";
    } else {
      escaped += c;
    }
  }

  return escaped;
}

long long fnv1a64(const std::string& value)
{
  unsigned long long hash = 1469598103934665603ULL;

  for(unsigned char c : value) {
    hash ^= c;
    hash *= 1099511628211ULL;
  }

  return static_cast<long long>(hash);
}

std::string hex_id(const std::string& value)
{
  unsigned long long hash = static_cast<unsigned long long>(fnv1a64(value));

  std::stringstream stream;
  stream << std::hex << std::setw(16) << std::setfill('0') << hash;

  return stream.str();
}

std::string pseudo_sha256(const std::string& value)
{
  std::string first = hex_id("a" + value);
  std::string second = hex_id("b" + value);
  std::string third = hex_id("c" + value);
  std::string fourth = hex_id("d" + value);

  return first + second + third + fourth;
}

long long parse_utc_ms(const std::string& iso_timestamp)
{
  tm utc_time{};
  std::string normalized = iso_timestamp;

  if(!normalized.empty() && normalized.back() == 'Z') {
    normalized.pop_back();
  }

  std::istringstream stream(normalized);
  stream >> std::get_time(&utc_time, "%Y-%m-%dT%H:%M:%S");

  if(stream.fail()) {
    throw std::runtime_error("invalid timestamp: " + iso_timestamp);
  }

  return static_cast<long long>(timegm(&utc_time)) * 1000LL;
}

std::string ms_to_iso(long long milliseconds)
{
  time_t seconds = milliseconds / 1000;
  tm utc_time{};
  gmtime_r(&seconds, &utc_time);

  char buffer[32];
  strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", &utc_time);

  return buffer;
}

std::string run_command_capture(const std::string& command)
{
  std::array<char, 8192> buffer{};
  std::string output;

  FILE* pipe = popen(command.c_str(), "r");

  if(!pipe) {
    throw std::runtime_error("failed to execute command: " + command);
  }

  while(fgets(buffer.data(), static_cast<int>(buffer.size()), pipe)) {
    output += buffer.data();
  }

  int rc = pclose(pipe);

  if(rc != 0) {
    throw std::runtime_error("command failed: " + command);
  }

  return output;
}

bool safe_market_token(const std::string& value)
{
  if(value.empty()) {
    return false;
  }

  return std::all_of(
    value.begin(),
    value.end(),
    [](unsigned char c) {
      return std::isupper(c) || std::isdigit(c) || c == '_';
    }
  );
}

} // namespace cap
