#pragma once

#include <curl/curl.h>
#include <string>

namespace cap {

struct HttpResult {
  long status = 0;
  std::string body;
  std::string content_type;
};

std::string url_encode(CURL* curl, const std::string& value);
HttpResult http_get(const std::string& url, long timeout = 30);
void http_download_file(
  const std::string& url,
  const std::string& path,
  long timeout = 120
);

} // namespace cap
