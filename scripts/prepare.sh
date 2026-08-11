#!/bin/bash
set -Eeuo pipefail

echo "Installing dependencies..."
pnpm install --frozen-lockfile
