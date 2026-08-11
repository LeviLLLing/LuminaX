#!/bin/bash
set -Eeuo pipefail

PORT="${PORT:-5000}"

echo "Starting LuminaX dev server on http://localhost:${PORT}"
pnpm next dev -p "${PORT}"
