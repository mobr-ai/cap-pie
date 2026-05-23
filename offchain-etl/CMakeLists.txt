cmake_minimum_required(VERSION 3.16)

project(cap_offchain_etl VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

find_package(PkgConfig REQUIRED)
pkg_check_modules(CURL REQUIRED libcurl)
find_package(PostgreSQL REQUIRED)

add_executable(
  cap-offchain-etl
  src/main.cpp
  src/Config.cpp
  src/Db.cpp
  src/GovernanceSync.cpp
  src/Http.cpp
  src/Json.cpp
  src/OhlcvSync.cpp
  src/Utils.cpp
)

target_include_directories(
  cap-offchain-etl
  PRIVATE
    include
    ${PostgreSQL_INCLUDE_DIRS}
    ${CURL_INCLUDE_DIRS}
)

target_link_directories(
  cap-offchain-etl
  PRIVATE
    ${CURL_LIBRARY_DIRS}
)

target_link_libraries(
  cap-offchain-etl
  PRIVATE
    ${PostgreSQL_LIBRARIES}
    ${CURL_LIBRARIES}
)

target_compile_options(
  cap-offchain-etl
  PRIVATE
    -Wall
    -Wextra
    -Wpedantic
    ${CURL_CFLAGS_OTHER}
)

install(TARGETS cap-offchain-etl RUNTIME DESTINATION bin)
