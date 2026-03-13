#!/usr/bin/env bash
set -euo pipefail

echo "=== Installing pnpm ==="
corepack enable
corepack prepare pnpm@latest --activate

echo "=== Installing uv (Python package manager) ==="
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"

echo "=== Installing Supabase CLI ==="
curl -sSL https://raw.githubusercontent.com/supabase/cli/main/install.sh | bash

echo "=== Installing frontend dependencies ==="
if [ -f "frontend/package.json" ]; then
  cd frontend
  pnpm install
  cd ..
fi

echo "=== Setting up dbt environment ==="
if [ -f "dbt/pyproject.toml" ]; then
  cd dbt
  uv sync
  cd ..
fi

echo "=== Setup complete ==="
