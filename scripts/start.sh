#!/bin/bash
set -Eeuo pipefail

PORT="${PORT:-5000}"

echo "Starting LuminaX production server on http://localhost:${PORT}"
pnpm next start -p "${PORT}"
