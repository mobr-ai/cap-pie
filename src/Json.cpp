#include "cap/Json.hpp"

#include <cctype>
#include <iomanip>
#include <sstream>
#include <stdexcept>

namespace cap {

JsonParser::JsonParser(const std::string& input)
  : source_(input)
{
}

void JsonParser::skip_ws()
{
  while(
    index_ < source_.size() &&
    std::isspace(static_cast<unsigned char>(source_[index_]))
  ) {
    ++index_;
  }
}

bool JsonParser::consume(char c)
{
  skip_ws();

  if(index_ < source_.size() && source_[index_] == c) {
    ++index_;
    return true;
  }

  return false;
}

void JsonParser::expect(char c)
{
  if(!consume(c)) {
    throw std::runtime_error(std::string("invalid JSON: expected '") + c + "'");
  }
}

std::string JsonParser::parse_string()
{
  skip_ws();
  expect('"');

  std::string output;

  while(index_ < source_.size()) {
    char c = source_[index_++];

    if(c == '"') {
      return output;
    }

    if(c != '\\') {
      output.push_back(c);
      continue;
    }

    if(index_ >= source_.size()) {
      throw std::runtime_error("invalid JSON: bad escape");
    }

    char escaped = source_[index_++];

    switch(escaped) {
      case '"':
        output.push_back('"');
        break;
      case '\\':
        output.push_back('\\');
        break;
      case '/':
        output.push_back('/');
        break;
      case 'b':
        output.push_back('\b');
        break;
      case 'f':
        output.push_back('\f');
        break;
      case 'n':
        output.push_back('\n');
        break;
      case 'r':
        output.push_back('\r');
        break;
      case 't':
        output.push_back('\t');
        break;
      case 'u':
        if(index_ + 4 > source_.size()) {
          throw std::runtime_error("invalid JSON: incomplete unicode escape");
        }

        index_ += 4;
        output.push_back('?');
        break;
      default:
        throw std::runtime_error("invalid JSON: unsupported escape sequence");
    }
  }

  throw std::runtime_error("invalid JSON: unterminated string");
}

JsonValue JsonParser::parse_number()
{
  skip_ws();

  size_t start = index_;

  if(index_ < source_.size() && source_[index_] == '-') {
    ++index_;
  }

  while(
    index_ < source_.size() &&
    std::isdigit(static_cast<unsigned char>(source_[index_]))
  ) {
    ++index_;
  }

  if(index_ < source_.size() && source_[index_] == '.') {
    ++index_;

    while(
      index_ < source_.size() &&
      std::isdigit(static_cast<unsigned char>(source_[index_]))
    ) {
      ++index_;
    }
  }

  if(
    index_ < source_.size() &&
    (source_[index_] == 'e' || source_[index_] == 'E')
  ) {
    ++index_;

    if(
      index_ < source_.size() &&
      (source_[index_] == '+' || source_[index_] == '-')
    ) {
      ++index_;
    }

    while(
      index_ < source_.size() &&
      std::isdigit(static_cast<unsigned char>(source_[index_]))
    ) {
      ++index_;
    }
  }

  JsonValue value;
  value.type = JsonValue::Type::Number;
  value.number = std::stod(source_.substr(start, index_ - start));

  return value;
}

JsonValue JsonParser::parse_array()
{
  JsonValue value;
  value.type = JsonValue::Type::Array;

  expect('[');
  skip_ws();

  if(consume(']')) {
    return value;
  }

  while(true) {
    value.array.push_back(parse_value());
    skip_ws();

    if(consume(']')) {
      break;
    }

    expect(',');
  }

  return value;
}

JsonValue JsonParser::parse_object()
{
  JsonValue value;
  value.type = JsonValue::Type::Object;

  expect('{');
  skip_ws();

  if(consume('}')) {
    return value;
  }

  while(true) {
    std::string key = parse_string();
    expect(':');
    value.object[key] = parse_value();
    skip_ws();

    if(consume('}')) {
      break;
    }

    expect(',');
  }

  return value;
}

JsonValue JsonParser::parse_value()
{
  skip_ws();

  if(index_ >= source_.size()) {
    throw std::runtime_error("invalid JSON: unexpected end of input");
  }

  char c = source_[index_];

  if(c == '{') {
    return parse_object();
  }

  if(c == '[') {
    return parse_array();
  }

  if(c == '"') {
    JsonValue value;
    value.type = JsonValue::Type::String;
    value.str = parse_string();
    return value;
  }

  if(c == '-' || std::isdigit(static_cast<unsigned char>(c))) {
    return parse_number();
  }

  if(source_.compare(index_, 4, "true") == 0) {
    index_ += 4;
    JsonValue value;
    value.type = JsonValue::Type::Bool;
    value.boolean = true;
    return value;
  }

  if(source_.compare(index_, 5, "false") == 0) {
    index_ += 5;
    JsonValue value;
    value.type = JsonValue::Type::Bool;
    value.boolean = false;
    return value;
  }

  if(source_.compare(index_, 4, "null") == 0) {
    index_ += 4;
    return JsonValue{};
  }

  throw std::runtime_error(
    "invalid JSON: unexpected token near offset " + std::to_string(index_)
  );
}

JsonValue JsonParser::parse()
{
  JsonValue value = parse_value();
  skip_ws();

  if(index_ != source_.size()) {
    throw std::runtime_error(
      "invalid JSON: trailing content near offset " + std::to_string(index_)
    );
  }

  return value;
}

const JsonValue* json_at(
  const JsonValue& root,
  std::initializer_list<const char*> path
)
{
  const JsonValue* current = &root;

  for(const char* key : path) {
    if(!current || current->type != JsonValue::Type::Object) {
      return nullptr;
    }

    auto it = current->object.find(key);

    if(it == current->object.end()) {
      return nullptr;
    }

    current = &it->second;
  }

  return current;
}

std::string json_string_at(
  const JsonValue& root,
  std::initializer_list<const char*> path,
  const std::string& default_value
)
{
  const JsonValue* value = json_at(root, path);

  if(!value) {
    return default_value;
  }

  if(value->type == JsonValue::Type::String) {
    return value->str;
  }

  if(value->type == JsonValue::Type::Number) {
    std::stringstream stream;
    stream << std::fixed << std::setprecision(0) << value->number;
    return stream.str();
  }

  if(value->type == JsonValue::Type::Bool) {
    return value->boolean ? "true" : "false";
  }

  return default_value;
}

int json_int_at(
  const JsonValue& root,
  std::initializer_list<const char*> path,
  int default_value
)
{
  const JsonValue* value = json_at(root, path);

  if(!value) {
    return default_value;
  }

  if(value->type == JsonValue::Type::Number) {
    return static_cast<int>(value->number);
  }

  if(value->type == JsonValue::Type::String && !value->str.empty()) {
    return std::stoi(value->str);
  }

  return default_value;
}

bool json_bool_at(
  const JsonValue& root,
  std::initializer_list<const char*> path,
  bool default_value
)
{
  const JsonValue* value = json_at(root, path);

  if(!value) {
    return default_value;
  }

  if(value->type == JsonValue::Type::Bool) {
    return value->boolean;
  }

  if(value->type == JsonValue::Type::String) {
    return value->str == "true" || value->str == "1";
  }

  return default_value;
}

std::vector<std::string> json_array_strings_at(
  const JsonValue& root,
  std::initializer_list<const char*> path
)
{
  std::vector<std::string> output;
  const JsonValue* value = json_at(root, path);

  if(!value || value->type != JsonValue::Type::Array) {
    return output;
  }

  for(const auto& item : value->array) {
    if(item.type == JsonValue::Type::String) {
      output.push_back(item.str);
    }
  }

  return output;
}

std::string json_get_string(
  const std::string& json,
  const std::string& key,
  const std::string& default_value
)
{
  try {
    JsonValue root = JsonParser(json).parse();
    return json_string_at(root, {key.c_str()}, default_value);
  } catch(...) {
    return default_value;
  }
}

} // namespace cap
