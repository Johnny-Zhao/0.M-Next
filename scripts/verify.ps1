$ErrorActionPreference = "Stop"

corepack pnpm install --frozen-lockfile
corepack pnpm verify
