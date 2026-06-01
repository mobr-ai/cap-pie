#include "cap/OhlcvSync.hpp"

#include "cap/Http.hpp"
#include "cap/Utils.hpp"

#include <algorithm>
#include <cctype>
#include <chrono>
#include <ctime>
#include <filesystem>
#include <fstream>
#include <regex>
#include <sstream>
#include <stdexcept>
#include <thread>

namespace cap {
namespace {

long long normalize_epoch_ms(long long value)
{
  // Binance API usually returns milliseconds.
  // Some archive CSVs may contain microseconds.
  if(value > 99999999999999LL) {
    return value / 1000LL;
  }

  return value;
}

void upsert_checkpoint(
  Db& db,
  const std::string& source,
  const std::string& id,
  const std::string& key,
  const std::string& value
)
{
  db.exec(
    "INSERT INTO etl_checkpoint(source,entity_id,checkpoint_key,checkpoint_value) "
    "VALUES('" + shell_escape(source) + "','" + shell_escape(id) + "','" +
    shell_escape(key) + "','" + shell_escape(value) + "') "
    "ON CONFLICT(source,entity_id,checkpoint_key) "
    "DO UPDATE SET checkpoint_value=EXCLUDED.checkpoint_value, updated_at=now()"
  );
}

std::string get_checkpoint(
  Db& db,
  const std::string& source,
  const std::string& id,
  const std::string& key,
  const std::string& default_value
)
{
  return db.scalar(
    "SELECT checkpoint_value FROM etl_checkpoint "
    "WHERE source='" + shell_escape(source) + "' "
    "AND entity_id='" + shell_escape(id) + "' "
    "AND checkpoint_key='" + shell_escape(key) + "'",
    default_value
  );
}

bool checkpoint_exists(
  Db& db,
  const std::string& source,
  const std::string& id,
  const std::string& key
)
{
  return db.scalar(
    "SELECT count(*) FROM etl_checkpoint "
    "WHERE source='" + shell_escape(source) + "' "
    "AND entity_id='" + shell_escape(id) + "' "
    "AND checkpoint_key='" + shell_escape(key) + "'",
    "0"
  ) != "0";
}

std::string latest_ohlcv_checkpoint(Db& db, const AssetMap& asset)
{
  return get_checkpoint(
    db,
    "ohlcv",
    asset.source + ":" + asset.source_asset,
    "last_open_time_ms",
    ""
  );
}

long long effective_bootstrap_ms(const Config& config, const AssetMap& asset)
{
  long long config_bootstrap_ms = parse_utc_ms(config.bootstrap_from);

  if(asset.bootstrap.empty()) {
    return config_bootstrap_ms;
  }

  long long asset_bootstrap_ms = parse_utc_ms(asset.bootstrap);

  /*
   * The config bootstrap_from is a global lower bound requested by the
   * operator. Asset mappings may define an older listing/bootstrap date, but
   * they must not make this run fetch data before the configured timestamp.
   *
   * If an asset-specific bootstrap is later than the config timestamp, keep the
   * later date to avoid wasting cycles on ranges where the market did not yet
   * exist.
   */
  return std::max(config_bootstrap_ms, asset_bootstrap_ms);
}

void upsert_asset_source(Db& db, const AssetMap& asset)
{
  std::string sql =
    "INSERT INTO asset(asset_id,symbol,name,policy_id,asset_name_hex,decimals) "
    "VALUES('" + shell_escape(asset.asset_id) + "','" +
    shell_escape(asset.symbol) + "','" +
    shell_escape(asset.name) + "','" +
    shell_escape(asset.policy) + "','" +
    shell_escape(asset.hex) + "'," + asset.decimals + ") "
    "ON CONFLICT(asset_id) DO UPDATE SET "
    "symbol=EXCLUDED.symbol,"
    "name=EXCLUDED.name,"
    "policy_id=EXCLUDED.policy_id,"
    "asset_name_hex=EXCLUDED.asset_name_hex,"
    "decimals=EXCLUDED.decimals";

  db.exec(sql);

  sql =
    "INSERT INTO asset_market_source"
    "(asset_id,source,source_asset_id,quote_asset,bootstrap_from) "
    "VALUES('" + shell_escape(asset.asset_id) + "','" +
    shell_escape(asset.source) + "','" +
    shell_escape(asset.source_asset) + "','" +
    shell_escape(asset.quote) + "','" +
    shell_escape(asset.bootstrap) + "'::timestamptz) "
    "ON CONFLICT(asset_id,source,source_asset_id,quote_asset) "
    "DO UPDATE SET enabled=true, bootstrap_from=EXCLUDED.bootstrap_from";

  db.exec(sql);
}

std::vector<std::vector<std::string>> parse_klines(const std::string& body)
{
  std::vector<std::vector<std::string>> output;
  std::regex row_regex("\\[([0-9]+),\"([^\"]+)\",\"([^\"]+)\",\"([^\"]+)\",\"([^\"]+)\",\"([^\"]+)\"");

  for(
    std::sregex_iterator it(body.begin(), body.end(), row_regex), end;
    it != end;
    ++it
  ) {
    output.push_back({
      (*it)[1],
      (*it)[2],
      (*it)[3],
      (*it)[4],
      (*it)[5],
      (*it)[6]
    });
  }

  return output;
}

std::vector<std::vector<std::string>> parse_binance_kline_csv(
  const std::string& csv
)
{
  std::vector<std::vector<std::string>> output;
  std::stringstream stream(csv);
  std::string line;

  while(std::getline(stream, line)) {
    line = trim(line);

    if(line.empty()) {
      continue;
    }

    auto values = split_csv(line);

    if(values.size() < 7) {
      continue;
    }

    if(!std::isdigit(static_cast<unsigned char>(values[0][0]))) {
      continue;
    }

    output.push_back({
      values[0],
      values[1],
      values[2],
      values[3],
      values[4],
      values[5]
    });
  }

  return output;
}

std::vector<std::string> generate_binance_daily_kline_archive_keys(
  const Config& config,
  const std::string& symbol,
  long long start_ms,
  long long end_ms
)
{
  if(!safe_market_token(symbol)) {
    throw std::runtime_error("unsafe Binance symbol: " + symbol);
  }

  if(config.interval != "1h") {
    throw std::runtime_error(
      "Binance archive bootstrap currently supports only 1h candles"
    );
  }

  std::vector<std::string> keys;
  const long long day_ms = 86400000LL;

  time_t start_seconds = static_cast<time_t>(start_ms / 1000);
  tm start_time{};
  gmtime_r(&start_seconds, &start_time);
  start_time.tm_hour = 0;
  start_time.tm_min = 0;
  start_time.tm_sec = 0;

  long long day_start_ms = static_cast<long long>(timegm(&start_time)) * 1000LL;

  for(long long t = day_start_ms; t <= end_ms; t += day_ms) {
    time_t seconds = static_cast<time_t>(t / 1000);
    tm day{};
    gmtime_r(&seconds, &day);

    char date_buffer[16];
    strftime(date_buffer, sizeof(date_buffer), "%Y-%m-%d", &day);

    std::string file = symbol + "-" + config.interval + "-" +
      std::string(date_buffer) + ".zip";

    keys.push_back(
      "data/spot/daily/klines/" + symbol + "/" + config.interval + "/" + file
    );
  }

  return keys;
}

void upsert_ohlcv_rows(
  Db& db,
  const AssetMap& asset,
  const std::vector<std::vector<std::string>>& rows
)
{
  if(rows.empty()) {
    return;
  }

  long long max_open_ms = 0;

  for(const auto& row : rows) {
    long long open_ms = normalize_epoch_ms(std::stoll(row[0]));
    max_open_ms = std::max(max_open_ms, open_ms);

    db.exec(
      "INSERT INTO asset_ohlcv("
      "asset_id,ts,interval,open,high,low,close,volume,source"
      ") VALUES("
      "'" + shell_escape(asset.asset_id) + "',"
      "to_timestamp(" + std::to_string(open_ms / 1000) + "),"
      "'1h'," +
      row[1] + "," +
      row[2] + "," +
      row[3] + "," +
      row[4] + "," +
      row[5] + ","
      "'" + shell_escape(asset.source) + "'"
      ") "
      "ON CONFLICT(asset_id,ts,interval,source) DO UPDATE SET "
      "open=EXCLUDED.open,"
      "high=EXCLUDED.high,"
      "low=EXCLUDED.low,"
      "close=EXCLUDED.close,"
      "volume=EXCLUDED.volume"
    );
  }

  const std::string entity = asset.source + ":" + asset.source_asset;

  std::string current_checkpoint = get_checkpoint(
    db,
    "ohlcv",
    entity,
    "last_open_time_ms",
    "0"
  );

  long long current_ms = std::stoll(current_checkpoint);

  if(max_open_ms > current_ms) {
    upsert_checkpoint(
      db,
      "ohlcv",
      entity,
      "last_open_time_ms",
      std::to_string(max_open_ms)
    );
  }
}

void sync_binance_archives(Db& db, const Config& config, const AssetMap& asset)
{
  if(!config.archive_bootstrap_enabled) {
    return;
  }

  if(asset.source != "binance_spot") {
    return;
  }

  const std::string entity = asset.source + ":" + asset.source_asset;
  const long long bootstrap_ms = effective_bootstrap_ms(config, asset);

  long long now_ms = static_cast<long long>(time(nullptr)) * 1000LL;
  time_t now_seconds = static_cast<time_t>(now_ms / 1000);
  tm utc_now{};

  gmtime_r(&now_seconds, &utc_now);
  utc_now.tm_hour = 0;
  utc_now.tm_min = 0;
  utc_now.tm_sec = 0;

  long long today_midnight_ms =
    static_cast<long long>(timegm(&utc_now)) * 1000LL;
  long long archive_end_ms = today_midnight_ms - 1;

  auto keys = generate_binance_daily_kline_archive_keys(
    config,
    asset.source_asset,
    bootstrap_ms,
    archive_end_ms
  );

  log(
    "INFO",
    "Binance archive files generated for " + asset.source_asset + ": " +
    std::to_string(keys.size())
  );

  for(const auto& key : keys) {
    const std::string checkpoint_key = "archive_zip:" + key;

    if(checkpoint_exists(db, "ohlcv", entity, checkpoint_key)) {
      continue;
    }

    std::string url = config.binance_data_base + "/" + key;
    std::string local_zip = config.archive_tmp_dir + "/" + asset.source_asset +
      "/" + std::filesystem::path(key).filename().string();

    try {
      http_download_file(url, local_zip);

      std::string csv = run_command_capture(
        "unzip -p '" + shell_escape(local_zip) + "'"
      );
      auto rows = parse_binance_kline_csv(csv);

      std::vector<std::vector<std::string>> filtered;

      for(const auto& row : rows) {
        long long open_ms = normalize_epoch_ms(std::stoll(row[0]));

        if(open_ms >= bootstrap_ms) {
          filtered.push_back(row);
        }
      }

      if(!filtered.empty()) {
        upsert_ohlcv_rows(db, asset, filtered);
        log(
          "INFO",
          "Loaded Binance archive " + key + " candles=" +
          std::to_string(filtered.size())
        );
      } else {
        log("INFO", "Skipped Binance archive before bootstrap range: " + key);
      }

      upsert_checkpoint(db, "ohlcv", entity, checkpoint_key, "processed");
      std::filesystem::remove(local_zip);
    } catch(const std::exception& e) {
      const std::string error = e.what();

      if (error.find("HTTP 404 for ") != std::string::npos) {
        upsert_checkpoint(db, "ohlcv", entity, checkpoint_key, "missing_404");

      } else {
        log(
          "WARN",
          "Binance archive unavailable for " + key +
          "; API sync will backfill missing candles automatically: " +
          error
        );
      }
      std::filesystem::remove(local_zip);
      continue;
    }

    std::this_thread::sleep_for(
      std::chrono::milliseconds(config.request_pause_ms)
    );
  }
}

} // namespace

std::vector<AssetMap> load_assets(const std::string& file)
{
  std::vector<AssetMap> output;
  std::ifstream stream(file);

  if(!stream) {
    throw std::runtime_error("cannot open asset mapping file: " + file);
  }

  std::string line;
  bool first = true;

  while(std::getline(stream, line)) {
    line = trim(line);

    if(line.empty() || line[0] == '#') {
      continue;
    }

    auto values = split_csv(line);

    if(first && !values.empty() && values[0] == "asset_id") {
      first = false;
      continue;
    }

    first = false;

    if(values.size() == 11 && values[5].empty()) {
      values.erase(values.begin() + 5);
    }

    if(values.size() < 10) {
      throw std::runtime_error("invalid asset mapping line: " + line);
    }

    output.push_back({
      values[0],
      values[1],
      values[2],
      values[3],
      values[4],
      values[5],
      values[6],
      values[7],
      values[8],
      values[9]
    });
  }

  return output;
}

void sync_ohlcv(Db& db, const Config& config)
{
  auto assets = load_assets(config.mapping_file);
  log("INFO", "OHLCV mappings loaded: " + std::to_string(assets.size()));

  CURL* encoder_curl = curl_easy_init();

  if(!encoder_curl) {
    throw std::runtime_error("curl init failed for OHLCV URL encoding");
  }

  for(const auto& asset : assets) {
    try {
      upsert_asset_source(db, asset);
      sync_binance_archives(db, config, asset);

      const long long bootstrap_ms = effective_bootstrap_ms(config, asset);
      std::string checkpoint = latest_ohlcv_checkpoint(db, asset);
      long long start = bootstrap_ms;

      if(!checkpoint.empty() && checkpoint != "0") {
        start = std::max(bootstrap_ms, std::stoll(checkpoint) + 3600000LL);
      }

      long long now_ms = static_cast<long long>(time(nullptr)) * 1000LL;
      int empty_count = 0;

      while(start < now_ms - 3600000LL) {
        long long end = start +
          static_cast<long long>(config.request_limit - 1) * 3600000LL;

        if(end > now_ms) {
          end = now_ms;
        }

        std::string url = config.ohlcv_base +
          "/api/v3/klines?symbol=" + url_encode(encoder_curl, asset.source_asset) +
          "&interval=1h&startTime=" + std::to_string(start) +
          "&endTime=" + std::to_string(end) +
          "&limit=" + std::to_string(config.request_limit);

        auto response = http_get(url);

        if(response.status >= 400) {
          log(
            "WARN",
            "OHLCV provider returned HTTP " + std::to_string(response.status) +
            " for " + asset.source_asset +
            "; keeping checkpoint unchanged and retrying in a later cycle"
          );
          break;
        }

        auto rows = parse_klines(response.body);

        if(rows.empty()) {
          log(
            "WARN",
            "No API candles for " + asset.source_asset +
            " between " + ms_to_iso(start) +
            " and " + ms_to_iso(end) +
            "; advancing search window"
          );

          start = end + 3600000LL;

          upsert_checkpoint(
            db,
            "ohlcv",
            asset.source + ":" + asset.source_asset,
            "last_empty_search_ms",
            std::to_string(end)
          );

          ++empty_count;

          if(empty_count >= config.empty_advances) {
            log(
              "WARN",
              "Reached maximum empty-window advances for " + asset.source_asset +
              "; retrying remaining history in a later cycle"
            );
            break;
          }

          std::this_thread::sleep_for(
            std::chrono::milliseconds(config.request_pause_ms)
          );
          continue;
        }

        empty_count = 0;
        upsert_ohlcv_rows(db, asset, rows);

        long long last = std::stoll(rows.back()[0]);
        log(
          "INFO",
          "OHLCV API synced " + asset.source_asset +
          " candles=" + std::to_string(rows.size()) +
          " through " + ms_to_iso(last)
        );

        start = last + 3600000LL;

        std::this_thread::sleep_for(
          std::chrono::milliseconds(config.request_pause_ms)
        );
      }
    } catch(const std::exception& e) {
      log(
        "ERROR",
        "OHLCV sync failed for " + asset.source_asset +
        "; checkpoint unchanged, will retry in the next cycle: " +
        std::string(e.what())
      );
    }
  }

  curl_easy_cleanup(encoder_curl);
}

} // namespace cap
