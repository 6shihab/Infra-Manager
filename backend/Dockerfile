FROM python:3.12-slim

WORKDIR /app

# Install system dependencies (including curl for healthcheck)
RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -r appuser

# Install uv manager first
RUN pip install --no-cache-dir uv

# Install dependencies using uv and pyproject.toml
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-cache

# Copy application code
COPY . .

# Set ownership for the app directory
RUN chown -R appuser:appuser /app

# Run as non-root user
USER appuser

# Expose the API port
EXPOSE 8000

# Start the application using Gunicorn async workers
CMD [".venv/bin/gunicorn", "-c", "gunicorn_conf.py", "app.main:app"]
