#pragma once

#include <libpq-fe.h>
#include <string>
#include <vector>

namespace cap {

class Db {
 public:
  Db(
    const std::string& host,
    int port,
    const std::string& user,
    const std::string& password,
    const std::string& database
  );

  ~Db();

  Db(const Db&) = delete;
  Db& operator=(const Db&) = delete;

  void exec(const std::string& sql);
  std::string scalar(const std::string& sql, const std::string& default_value = "");
  std::vector<std::vector<std::string>> rows(const std::string& sql);

 private:
  PGconn* connection_ = nullptr;
};

} // namespace cap
