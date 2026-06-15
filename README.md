# M-Next

M-Next is a Java 21 + React 18 modular monorepo for a command-driven modeling
workspace. The backend is a Spring Boot modular monolith; the frontend uses
Vite, React, TypeScript, and pnpm.

## Prerequisites

- Docker with Buildx and Compose
- Node.js 22+ with Corepack
- A Java 21 JDK; the repository script supplies Maven

## One-Command Verification

Run the same local gate that CI expects:

```sh
corepack pnpm verify
```

`pnpm verify` runs architecture checks, architecture self-tests, Prettier,
Spotless, ESLint, Checkstyle, TypeScript checks, Vitest, Maven tests, JaCoCo,
and frontend/backend builds. Start local infrastructure when a workflow needs
it:

```sh
docker compose up -d
```

Use `REGISTRY_PREFIX` to point Compose and Dockerfile base images at an internal
registry, for example `REGISTRY_PREFIX=harbor.example.local/library`.

## Module Map

- `packages/shared`: domain-neutral DTOs, contracts, and utilities. No business
  logic or I/O.
- `packages/kernel`: command entry, master data transactions, versioning,
  permissions, and event outbox.
- `packages/engines`: pure capability engines such as review, exchange, rules,
  and output rendering.
- `packages/server`: Spring Boot composition root, HTTP controllers, read model,
  repositories, and worker wiring.
- `packages/views`: reusable frontend view components and selection linkage.
- `packages/web`: workspace shell that composes the views.

Dependency rules are enforced by `pnpm architecture:check`; the authoritative
red lines live in [AGENTS.md](AGENTS.md).

## CQRS Flow

Writes go through command endpoints:

- M1 data commands: `POST /workspaces/{id}/commands`
- metamodel commands: `POST /workspaces/{id}/meta-commands`
- review commands: `POST /workspaces/{id}/review/commands`

Command handlers write master tables and append `event_outbox`. The read model
projects events into `rm_object` and `rm_relation`, which are queried by
`/views/objects`, `/views/tree`, `/views/matrix`, and `/views/relations`.
Tests that need deterministic projection drain events synchronously; production
uses the configured outbox/read-model wiring.

## Exchange SPI

`com.mnext.engines.exchange.ExchangeAdapter` converts external artifacts to and
from the internal `DataSet`. Implementations are pure Java and are registered
with JDK `ServiceLoader`:

```text
META-INF/services/com.mnext.engines.exchange.ExchangeAdapter
```

Built-in formats include JSON and ReqIF. Server endpoints expose both specific
and generic exchange paths, while apply operations still write only through M1
commands. See [docs/11-exchange-adapter-spi.md](docs/11-exchange-adapter-spi.md)
and [docs/插件-交换适配器开发指南.md](docs/插件-交换适配器开发指南.md).

## Render SPI

`com.mnext.engines.output.RenderAdapter` renders an immutable snapshot
`DataSet` into an output artifact. It is also loaded with `ServiceLoader`:

```text
META-INF/services/com.mnext.engines.output.RenderAdapter
```

The output pipeline accepts only `snapshotId`, renders through an adapter, stores
an immutable `output_snapshot`, and records a SHA-256 content hash. Built-in
formats include HTML, Markdown, CSV, and the ADR-approved Office renderers.

## Quality Baseline

`GoldenPathE2ETest` is the smoke test for the critical path: metamodel commands,
M1 commands, read-model views, review annotations, JSON exchange, snapshots, and
HTML output rendering. `docs/AG-载体审计.md` maps every `AG-xxx` rule to its
current automated carrier and marks gaps for follow-up.
