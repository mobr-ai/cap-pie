#include "cap/Config.hpp"
#include "cap/Db.hpp"
#include "cap/GovernanceSync.hpp"
#include "cap/IndicatorSync.hpp"
#include "cap/OhlcvSync.hpp"
#include "cap/Utils.hpp"

#include <curl/curl.h>

#include <chrono>
#include <cstdlib>
#include <exception>
#include <iostream>
#include <string>
#include <thread>

int main(int argc, char** argv)
{
  const char* config_env = getenv("CAP_ETL_CONFIG");
  std::string config_path = config_env ? config_env : "/app/config/config.example.json";
  bool cli_run_once = false;

  try {
    for(int i = 1; i < argc; ++i) {
      std::string argument = argv[i];

      if(argument == "--help") {
        std::cout << "cap-offchain-etl --config <file> [--run-once]\n";
        return 0;
      }

      if(argument == "--config" && i + 1 < argc) {
        config_path = argv[++i];
        continue;
      }

      if(argument == "--run-once") {
        cli_run_once = true;
        continue;
      }

      throw std::runtime_error("unknown argument: " + argument);
    }
  } catch(const std::exception& e) {
    cap::log("ERROR", e.what());
    return 1;
  }

  cap::Config config;

  try {
    config = cap::load_config(config_path);

    if(cli_run_once) {
      config.run_once = true;
    }
  } catch(const std::exception& e) {
    cap::log("ERROR", "Configuration error: " + std::string(e.what()));
    return 1;
  }

  curl_global_init(CURL_GLOBAL_DEFAULT);
  bool schema_bootstrapped = false;

  while(true) {
    try {
      cap::Db db(
        config.db_host,
        config.db_port,
        config.db_user,
        config.db_pass,
        config.db_name
      );

      if(config.bootstrap_schema && !schema_bootstrapped) {
        cap::log("INFO", "Bootstrapping PostgreSQL schema");
        db.exec(cap::read_file(config.schema_file));
        schema_bootstrapped = true;
      }

      if(config.ohlcv_enabled) {
        try {
          cap::sync_ohlcv(db, config);
        } catch(const std::exception& e) {
          cap::log(
            "ERROR",
            "OHLCV source cycle failed; will retry after sleep: " +
            std::string(e.what())
          );
        }
      }

      if(config.indicators_enabled) {
        try {
          cap::sync_indicators(db, config);
        } catch(const std::exception& e) {
          cap::log(
            "ERROR",
            "Indicator source cycle failed; will retry after sleep: " +
            std::string(e.what())
          );
        }
      }

      if(config.gov_enabled) {
        try {
          cap::sync_governance(db, config);
        } catch(const std::exception& e) {
          cap::log(
            "ERROR",
            "Governance source cycle failed; will retry after sleep: " +
            std::string(e.what())
          );
        }
      }

      if(config.run_once) {
        break;
      }

      cap::log(
        "INFO",
        "Sleeping " + std::to_string(config.loop_sleep) +
        " seconds before next cycle"
      );
      std::this_thread::sleep_for(std::chrono::seconds(config.loop_sleep));
    } catch(const std::exception& e) {
      cap::log(
        "ERROR",
        "ETL cycle failed; will retry after sleep: " + std::string(e.what())
      );

      if(config.run_once) {
        curl_global_cleanup();
        return 1;
      }

      std::this_thread::sleep_for(std::chrono::seconds(config.loop_sleep));
    }
  }

  curl_global_cleanup();

  return 0;
}
