FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install uv manager first
RUN pip install --no-cache-dir uv

# Install dependencies using uv and pyproject.toml
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-cache
# Copy application code
COPY . .

# Expose the API port
EXPOSE 8000

# Start the application using Gunicorn async workers
CMD [".venv/bin/gunicorn", "-c", "gunicorn_conf.py", "app.main:app"]
