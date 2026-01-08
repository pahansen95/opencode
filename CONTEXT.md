- To test opencode in the `packages/opencode` directory you can run `bun dev`
- To regenerate the javascript SDK, run ./packages/sdk/js/script/build.ts
- ALWAYS USE PARALLEL TOOLS WHEN APPLICABLE.
- the default branch in this repo is `trunk`

## Project Topology

**Monorepo**: Bun workspaces + Turbo orchestration. 16 packages under `packages/`.

### Core Packages

- `packages/opencode` - CLI/TUI engine. Entry: `src/index.ts`. Houses agents, MCP/LSP, 20+ AI provider integrations.
- `packages/sdk/js` - Generated TypeScript SDK (client/server, v1/v2 APIs).
- `packages/ui` - Solid.js component library (Kobalte + Tailwind).
- `packages/util` - Shared utilities + Zod schemas.
- `packages/plugin` - Plugin system interfaces.

### Frontend Applications

- `packages/app` - Solid.js web shell.
- `packages/desktop` - Tauri wrapper around app.
- `packages/web` - Astro marketing/docs site.
- `packages/console/*` - SaaS dashboard (5 sub-packages: app, core, function, mail, resource).

### Backend & Infra

- `packages/function` - Cloudflare Workers (Hono).
- `packages/enterprise` - Enterprise features (Solid Start + Hono).
- `packages/slack` - Slack Bolt integration.
- `infra/` - SST/AWS infrastructure (app.ts, console.ts, enterprise.ts).

### Key Subsystems in `packages/opencode/src/`

- `agent/` - Execution modes (build, plan, general).
- `provider/` - Multi-vendor AI abstraction.
- `mcp/`, `lsp/` - Protocol implementations.
- `session/`, `storage/` - State & persistence.
- `skill/`, `plugin/` - Extension points.

### Build Targets

CLI binaries: `packages/opencode/dist/{name}-{os}-{arch}/bin/opencode` (Linux/macOS/Windows × arm64/x64).
