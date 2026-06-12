#!/usr/bin/env sh
set -eu

corepack pnpm install --frozen-lockfile
corepack pnpm verify
