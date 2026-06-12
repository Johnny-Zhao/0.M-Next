# M-Next

M-Next is a Java 21 + React modular monorepo.

## Prerequisites

- Docker with Buildx and Compose
- Node.js 22+ with Corepack
- A Java 21 JDK (the Maven Wrapper supplies Maven)

## One-command verification

Linux/macOS:

```sh
./scripts/verify.sh
```

Windows PowerShell:

```powershell
.\scripts\verify.ps1
```

The command installs locked dependencies and runs architecture checks, format
checks, lint, type checks, tests, and builds.
Contract schemas and fixtures are validated by `pnpm contracts:check` and the CI lint job.

Start local infrastructure with:

```sh
docker compose up -d
```

Set `REGISTRY_PREFIX` to switch all Compose and Dockerfile base images to an
internal registry, for example `REGISTRY_PREFIX=harbor.example.local/library`.

Architecture dependency rules live in [AGENTS.md](AGENTS.md) and
`architecture/dependencies.json`.
