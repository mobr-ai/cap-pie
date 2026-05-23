#include "cap/Db.hpp"

#include <sstream>
#include <stdexcept>

namespace cap {

Db::Db(
  const std::string& host,
  int port,
  const std::string& user,
  const std::string& password,
  const std::string& database
)
{
  std::stringstream connection_string;
  connection_string
    << "host=" << host
    << " port=" << port
    << " user=" << user
    << " password=" << password
    << " dbname=" << database;

  connection_ = PQconnectdb(connection_string.str().c_str());

  if(PQstatus(connection_) != CONNECTION_OK) {
    throw std::runtime_error(PQerrorMessage(connection_));
  }
}

Db::~Db()
{
  if(connection_) {
    PQfinish(connection_);
  }
}

void Db::exec(const std::string& sql)
{
  PGresult* result = PQexec(connection_, sql.c_str());
  ExecStatusType status = PQresultStatus(result);

  if(status != PGRES_COMMAND_OK && status != PGRES_TUPLES_OK) {
    std::string error = PQerrorMessage(connection_);
    PQclear(result);
    throw std::runtime_error(error + " SQL=" + sql);
  }

  PQclear(result);
}

std::string Db::scalar(const std::string& sql, const std::string& default_value)
{
  PGresult* result = PQexec(connection_, sql.c_str());

  if(PQresultStatus(result) != PGRES_TUPLES_OK) {
    std::string error = PQerrorMessage(connection_);
    PQclear(result);
    throw std::runtime_error(error + " SQL=" + sql);
  }

  std::string value = default_value;

  if(PQntuples(result) > 0 && !PQgetisnull(result, 0, 0)) {
    value = PQgetvalue(result, 0, 0);
  }

  PQclear(result);

  return value;
}

std::vector<std::vector<std::string>> Db::rows(const std::string& sql)
{
  PGresult* result = PQexec(connection_, sql.c_str());

  if(PQresultStatus(result) != PGRES_TUPLES_OK) {
    std::string error = PQerrorMessage(connection_);
    PQclear(result);
    throw std::runtime_error(error + " SQL=" + sql);
  }

  std::vector<std::vector<std::string>> output;

  for(int row_index = 0; row_index < PQntuples(result); ++row_index) {
    std::vector<std::string> row;

    for(int field_index = 0; field_index < PQnfields(result); ++field_index) {
      if(PQgetisnull(result, row_index, field_index)) {
        row.emplace_back();
      } else {
        row.push_back(PQgetvalue(result, row_index, field_index));
      }
    }

    output.push_back(row);
  }

  PQclear(result);

  return output;
}

} // namespace cap
