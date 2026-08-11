#!/bin/bash
set -Eeuo pipefail

echo "Installing dependencies..."
pnpm install --frozen-lockfile

echo "Building the Next.js project..."
pnpm next build

echo "Build completed successfully!"
