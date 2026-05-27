# CAP - Cardano Analytics Platform

## What is CAP?
Leveraging LLMs and analytics mechanisms to provide natural language queries, CAP simplifies Cardano data analysis through real-time insights and intuitive, customizable dashboards.

## Running CAP

## Setting Up Your Environment

### Prerequisites

Before running CAP, ensure you have the following installed:

- **Python 3.11+**
- **Docker & Docker Compose**
- **Virtualenv** (for local setup)
- **Git**

### Setting Up macOS

1. **Install Homebrew (if not installed):**
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```
2. **Install dependencies:**
   ```bash
   brew install python@3.11 docker docker-compose
   ```
3. **Start Docker (if not already running):**
   ```bash
   open -a Docker
   ```

### Setting Up Linux (Ubuntu)

1. **Update system and install dependencies:**
   ```bash
   sudo apt update && sudo apt upgrade -y
   sudo apt install python3.11 python3.11-venv python3-pip docker.io docker-compose -y
   ```
2. **Start Docker service:**
   ```bash
   sudo systemctl start docker
   sudo systemctl enable docker
   ```

### Setting Up Windows (WSL2) - NOT OFFICIALLY SUPPORTED, TESTED NOR RECOMMENDED.

> **DISCLAIMER:** While CAP may work on WSL2, it is **not officially supported**. Some features, especially those relying on networking and Docker, may require additional configuration or may not work as expected. Use at your own discretion.

1. **Enable WSL2 and Install Ubuntu:**
   - Follow Microsoft’s guide: [https://learn.microsoft.com/en-us/windows/wsl/install](https://learn.microsoft.com/en-us/windows/wsl/install)
2. **Install dependencies in WSL:**
   ```bash
   sudo apt update && sudo apt upgrade -y
   sudo apt install python3.11 python3.11-venv python3-pip docker.io docker-compose -y
   ```
3. **Start Docker within WSL:**
   ```bash
   sudo systemctl start docker
   ```

## Runing CAP

### Running locally



#### CAP Setup

1. **Config and environment files:**

   Create env file by copying provided example
   ```bash
   cp .env.example .env
   ```

   In the .env file, set `VIRTUOSO_HOST=localhost` and define your password (use the same password in the commands ahead).

2. **Run supporting services:**

   **ATTENTION**: remove --platform linux/amd64 if you are *NOT* using an amd64 platform (e.g. Mac with M1, M2, M3, M4 chips)

   Jaeger for CAP tracing support:
   ```bash
   docker run --platform linux/amd64 -d --name jaeger \
     -p 4317:4317 \
     -p 4318:4318 \
     -p 16686:16686 \
     jaegertracing/all-in-one:latest
   ```

   ```bash
   #OR check if it is running if you had it before
   docker ps --filter "name=jaeger"
   ```

   Virtuoso for CAP triplestore:
   ```bash
   docker run --platform linux/amd64 -d --name virtuoso \
     -p 8890:8890 -p 1111:1111 \
     -e DBA_PASSWORD=mysecretpassword \
     -e SPARQL_UPDATE=true \
     tenforce/virtuoso
   ```

   ```bash
   #OR check if it is running if you had it before
   docker ps --filter "name=virtuoso"
   ```

   PostgreSQL:
   ```bash
   docker run --platform linux/amd64 -d --name postgres \
      -v postgres-data:/var/lib/postgresql/data \
      -e POSTGRES_DB=cap \
      -e POSTGRES_USER=postgres \
      -e POSTGRES_PASSWORD=mysecretpassword \
      -p 5432:5432 \
      postgres:17.5-alpine
   ```

   ```bash
   #OR check if it is running if you had it before
   docker ps --filter "name=postgres"
   ```

   Verify PostgreSQL is running:
   ```bash
   docker ps
   ```

   Create a pgpass File:
   ```bash
   echo "localhost:5432:cap:postgres:mysecretpassword" > ~/.pgpass
   chmod 600 ~/.pgpass
   ```


3. **Set up Python environment:**

   ```bash
   virtualenv venv
   source venv/bin/activate

   #poetry install
   #strongly recommended NVIDIA GeForce RTX 5080 at least to run the model locally
   ollama ollama pull mobr/cap

   ```

4. **Run CAP server:**

   ```bash
   uvicorn src.cap.main:app --host 0.0.0.0 --port 8000
   ```

Now, you can access CAP's API at: [http://localhost:8000/docs](http://localhost:8000/docs)
You can also access CAP's chat UI via `http://localhost:8000/llm`.

#### Testing

```bash
# activate virtual environment
source venv/bin/activate

# install dev dependencies
poetry install --with dev

# Run all tests
pytest -v

# Run specific test file
pytest -v src/tests/test_api.py

# Run specifit test function
pytest -s src/tests/test_integration.py::test_full_graph_lifecycle

# Run with coverage report
pytest --cov=src/cap
```

### Running CAP with Docker Compose

1. **Copy the environment file:**

   ```bash
   cp .env.example .env
   ```

   Set `VIRTUOSO_HOST=virtuoso` in the `.env` file.

   **Note:** If you're not using an ARM64 system (e.g., Mac M1/M2/M3), remove `platform: linux/amd64` lines from `docker-compose.yml`.

2. **Build and start services:**

   ```bash
   docker compose up -d
   ```

   Wait a couple of minutes until the services are up. Check them on:
   - **Jaeger UI** → [http://localhost:16686](http://localhost:16686)
   - **Virtuoso** → [http://localhost:8890](http://localhost:8890)
   - **CAP API** → [http://localhost:8000/docs](http://localhost:8000/docs)

3. **View logs:**

   ```bash
   # View all service logs
   docker compose logs -f

   # View specific service logs
   docker compose logs -f api
   ```

4. **Stop services:**

   ```bash
   docker compose down
   ```

5. **Stop services and remove volumes:**

   ```bash
   docker compose down -v
   ```

6. **Pull mobr/cap LLM model inside Docker:**

   ```bash
   #strongly recommended NVIDIA GeForce RTX 5080 at least to run the model locally
   docker exec ollama ollama pull mobr/cap
   ```

Now, you can access CAP's API at: [http://localhost:8000/docs](http://localhost:8000/docs)
You can also access CAP's chat UI via `http://localhost:8000/llm`.

## Development

### API Documentation

Once running, access API documentation at:

- **Swagger UI:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc:** [http://localhost:8000/redoc](http://localhost:8000/redoc)

### Ontology Documentation

- **GitHub:** [https://github.com/mobr-ai/cap/documentation/ontology](https://github.com/mobr-ai/cap/documentation/ontology)
- **Live Website:** [https://mobr.ai/cardano](https://mobr.ai/cardano)

### Monitoring and Tracing

Distributed tracing is enabled with Jaeger. You can monitor traces and debug performance at:

- **Jaeger UI:** [http://localhost:16686](http://localhost:16686)

### Using virtuoso conductor to make queries

Queries is alse enabled with Virtuos Conductor. You can access the conductor at:

- **Virtuoso UI:** [http://localhost:8890](http://localhost:8890)
