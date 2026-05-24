#include "cap/GovernanceSync.hpp"

#include "cap/Http.hpp"
#include "cap/Json.hpp"
#include "cap/Utils.hpp"

#include <chrono>
#include <fstream>
#include <regex>
#include <set>
#include <thread>

namespace cap {
namespace {

std::string html_title(const std::string& body)
{
  std::smatch match;
  std::regex title_regex("<title[^>]*>([^<]+)</title>", std::regex::icase);

  if(std::regex_search(body, match, title_regex)) {
    return trim(match[1].str());
  }

  return "";
}

std::string json_field_any(
  const std::string& body,
  const std::vector<std::string>& keys
)
{
  for(const auto& key : keys) {
    std::string value = json_get_string(body, key, "");

    if(!value.empty()) {
      return value;
    }

    std::regex value_regex(
      "\"" + key + "\"\\s*:\\s*\\{\\s*\"@value\"\\s*:\\s*\"([^\"]*)\""
    );
    std::smatch match;

    if(std::regex_search(body, match, value_regex)) {
      return match[1].str();
    }
  }

  return "";
}

std::vector<GovSource> manual_sources(const std::string& file)
{
  std::vector<GovSource> output;
  std::ifstream stream(file);

  if(!stream) {
    log("WARN", "manual governance source file not found: " + file);
    return output;
  }

  std::string line;
  bool first = true;

  while(std::getline(stream, line)) {
    line = trim(line);

    if(line.empty() || line[0] == '#') {
      continue;
    }

    auto values = split_csv(line);

    if(first && !values.empty() && values[0] == "metadata_type") {
      first = false;
      continue;
    }

    first = false;

    if(values.size() < 3) {
      continue;
    }

    output.push_back({
      values[0],
      values[1],
      values[2],
      "manual"
    });
  }

  return output;
}

std::vector<GovSource> discover_govtool(const Config& config)
{
  std::vector<GovSource> output;
  std::set<std::string> seen;

  for(const auto& discovery_url : config.gov_discovery) {
    try {
      auto response = http_get(discovery_url);
      std::regex href_regex("href=[\"']([^\"']+)[\"']", std::regex::icase);

      for(
        std::sregex_iterator it(response.body.begin(), response.body.end(), href_regex), end;
        it != end && static_cast<int>(output.size()) < config.gov_max_links;
        ++it
      ) {
        std::string link = (*it)[1].str();

        if(link.empty() || link[0] == '#') {
          continue;
        }

        if(link[0] == '/') {
          link = "https://gov.tools" + link;
        }

        if(link.find("gov.tools") == std::string::npos) {
          continue;
        }

        std::string type = "governance_page";

        if(link.find("proposal_discussion") != std::string::npos) {
          type = "proposal_discussion";
        } else if(link.find("budget_discussion") != std::string::npos) {
          type = "budget_discussion";
        } else if(link.find("governance_actions") != std::string::npos) {
          type = "governance_action_page";
        } else {
          continue;
        }

        if(seen.insert(link).second) {
          output.push_back({type, hex_id(link), link, discovery_url});
        }
      }

      if(seen.insert(discovery_url).second) {
        output.push_back({
          "governance_index",
          hex_id(discovery_url),
          discovery_url,
          "seed"
        });
      }
    } catch(const std::exception& e) {
      log(
        "WARN",
        "governance discovery failed for " + discovery_url + ": " + e.what()
      );
    }
  }

  return output;
}

bool should_fetch(Db& db, const Config& config, const GovSource& source)
{
  std::string count = db.scalar(
    "SELECT count(*) FROM offchain_governance_metadata "
    "WHERE provider='" + shell_escape(config.gov_provider) + "' "
    "AND external_id='" + shell_escape(source.id) + "' "
    "AND fetched_at > now() - interval '" +
    std::to_string(config.gov_refetch_hours) + " hours'",
    "0"
  );

  return count == "0";
}

} // namespace

void sync_governance(Db& db, const Config& config)
{
  std::vector<GovSource> sources = discover_govtool(config);
  auto manual = manual_sources(config.gov_manual);
  sources.insert(sources.end(), manual.begin(), manual.end());

  log(
    "INFO",
    "Governance offchain sources discovered/loaded: " +
    std::to_string(sources.size())
  );

  for(auto& source : sources) {
    db.exec(
      "INSERT INTO offchain_governance_source"
      "(provider,source_type,external_id,url,discovered_from,last_seen_at) "
      "VALUES('" + shell_escape(config.gov_provider) + "','" +
      shell_escape(source.type) + "','" +
      shell_escape(source.id) + "','" +
      shell_escape(source.url) + "','" +
      shell_escape(source.from) + "',now()) "
      "ON CONFLICT(provider,external_id) DO UPDATE SET "
      "last_seen_at=now(),"
      "url=EXCLUDED.url,"
      "source_type=EXCLUDED.source_type,"
      "discovered_from=EXCLUDED.discovered_from"
    );

    if(!should_fetch(db, config, source)) {
      continue;
    }

    try {
      auto response = http_get(source.url);
      std::string title = html_title(response.body);

      if(title.empty()) {
        title = json_field_any(response.body, {"title", "givenName", "name"});
      }

      std::string abstract = json_field_any(
        response.body,
        {"abstract", "summary", "description"}
      );
      std::string motivation = json_field_any(
        response.body,
        {"motivation", "motivations"}
      );
      std::string rationale = json_field_any(response.body, {"rationale"});
      std::string given = json_field_any(response.body, {"givenName"});
      std::string digest = pseudo_sha256(response.body);

      db.exec(
        "INSERT INTO offchain_governance_metadata"
        "(provider,metadata_type,external_id,url,content_type,http_status,title,"
        "abstract,motivation,rationale,given_name,raw_content,content_sha256) "
        "VALUES('" + shell_escape(config.gov_provider) + "','" +
        shell_escape(source.type) + "','" +
        shell_escape(source.id) + "','" +
        shell_escape(source.url) + "','" +
        shell_escape(response.content_type) + "'," +
        std::to_string(response.status) + ",'" +
        shell_escape(title) + "','" +
        shell_escape(abstract) + "','" +
        shell_escape(motivation) + "','" +
        shell_escape(rationale) + "','" +
        shell_escape(given) + "','" +
        shell_escape(response.body) + "','" +
        digest + "') "
        "ON CONFLICT(provider,external_id,content_sha256) DO NOTHING"
      );

      log(
        "INFO",
        "Fetched governance offchain source " + source.type + " " + source.url
      );
    } catch(const std::exception& e) {
      db.exec(
        "INSERT INTO offchain_governance_metadata_fetch_log(provider,url,error) "
        "VALUES('" + shell_escape(config.gov_provider) + "','" +
        shell_escape(source.url) + "','" + shell_escape(e.what()) + "')"
      );

      log("WARN", std::string("governance fetch failed: ") + e.what());
    }

    std::this_thread::sleep_for(std::chrono::milliseconds(config.gov_pause_ms));
  }
}

} // namespace cap
