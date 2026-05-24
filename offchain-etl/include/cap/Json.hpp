#pragma once

#include <initializer_list>
#include <map>
#include <string>
#include <vector>

namespace cap {

struct JsonValue {
  enum class Type {
    Null,
    Bool,
    Number,
    String,
    Array,
    Object
  };

  Type type = Type::Null;
  bool boolean = false;
  double number = 0.0;
  std::string str;
  std::vector<JsonValue> array;
  std::map<std::string, JsonValue> object;
};

class JsonParser {
 public:
  explicit JsonParser(const std::string& input);

  JsonValue parse_value();
  JsonValue parse();

 private:
  const std::string& source_;
  size_t index_ = 0;

  void skip_ws();
  bool consume(char c);
  void expect(char c);
  std::string parse_string();
  JsonValue parse_number();
  JsonValue parse_array();
  JsonValue parse_object();
};

const JsonValue* json_at(
  const JsonValue& root,
  std::initializer_list<const char*> path
);

std::string json_string_at(
  const JsonValue& root,
  std::initializer_list<const char*> path,
  const std::string& default_value = ""
);

int json_int_at(
  const JsonValue& root,
  std::initializer_list<const char*> path,
  int default_value
);

bool json_bool_at(
  const JsonValue& root,
  std::initializer_list<const char*> path,
  bool default_value
);

std::vector<std::string> json_array_strings_at(
  const JsonValue& root,
  std::initializer_list<const char*> path
);

std::string json_get_string(
  const std::string& json,
  const std::string& key,
  const std::string& default_value = ""
);

} // namespace cap
