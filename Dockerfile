FROM debian:12 AS build
RUN apt-get update && apt-get install -y --no-install-recommends build-essential cmake libpq-dev libcurl4-openssl-dev ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY . .
RUN cmake -S . -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j$(nproc)

FROM debian:12
RUN apt-get update && apt-get install -y --no-install-recommends libpq5 libcurl4 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /src/build/cap-offchain-etl /usr/local/bin/cap-offchain-etl
COPY config /app/config
COPY sql /app/sql
ENTRYPOINT ["cap-offchain-etl"]
