#!/bin/bash
set -e

echo "Running database migrations..."
docker exec infra-manager-backend-1 .venv/bin/alembic upgrade head
echo "Done."
