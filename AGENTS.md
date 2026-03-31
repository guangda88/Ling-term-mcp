# Ling-term-mcp Agent Guide

**Version**: 1.0.0
**Codename**: 灵犀 (Lingxi)
**Status**: Production Ready
**Last Updated**: 2026-03-31

---

## Project Overview

Ling-term-mcp (灵犀) is an AI terminal operations MCP (Model Context Protocol) server. It exposes terminal command execution, session management, and terminal state synchronization as MCP tools that AI clients (Claude, Cursor, Copilot) can invoke via the Model Context Protocol SDK.

### Tech Stack

- **Language**: TypeScript 5.4+ (strict mode)
- **Runtime**: Node.js >=18.0.0
- **Module system**: TypeScript compiled to CommonJS (`"module": "commonjs"` in tsconfig.json)
- **MCP SDK**: `@modelcontextprotocol/sdk` ^1.27.1
- **Transport**: stdio (StdioServerTransport)
- **Testing**: Jest 29 + ts-jest
- **Build**: `tsc` (TypeScript compiler)
- **Linting**: ESLint + Prettier
- **Pre-commit hooks**: Husky + lint-staged

---

## Essential Commands

### Development

```bash
# Install dependencies
npm install

# Run in dev mode (no build needed, uses tsx)
npm run dev

# Run in dev mode with watch
npm run dev:watch

# Build TypeScript to dist/
npm run build

# Build and watch for changes
npm run build:watch

# Start production server (from compiled dist/)
npm start
```

### Testing

```bash
# Run unit tests (default)
npm test

# Run unit tests explicitly
npm run test:unit

# Run integration tests
npm run test:integration

# Run e2e tests (uses Node.js built-in test runner, NOT Jest)
npm run test:e2e

# Run stress tests (uses tsx directly)
npm run test:stress

# Run tests with coverage report
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

### Code Quality

```bash
# Lint all source and test files
npm run lint

# Lint and auto-fix
npm run lint:fix

# Format all TypeScript files
npm run format

# Check formatting without writing
npm run format:check

# Type check (used in CI)
npx tsc --noEmit
```

### Build & Publish

```bash
# Clean dist and coverage directories
npm run clean

# Verify publish readiness
npm run verify

# Generate API documentation (TypeDoc)
npm run docs

# Run parameter optimization (Python script)
npm run optimize
```

### CI Pipeline

The GitHub Actions CI (`.github/workflows/ci.yml`) runs on push/PR to `main` and `develop`:

1. `npm ci` — install dependencies
2. `npm run lint` — lint check
3. `npx tsc --noEmit` — type check
4. `npm test` — unit tests
5. Codecov coverage upload (Node 20.x only)
6. `npm run build` — build verification

Node versions tested: **18.x**, **20.x**

---

## Project Structure

```
Ling-term-mcp/
├── src/
│   ├── index.ts              # MCP server entry point (createServer, startMCPServer)
│   ├── cli.ts                # CLI binary entry point (#!/usr/bin/env node)
│   ├── types.ts              # Shared type definitions (MCPTool, Session, etc.)
│   ├── tools/                # MCP tool implementations
│   │   ├── create_session.ts     # Create terminal session
│   │   ├── destroy_session.ts    # Destroy terminal session
│   │   ├── execute_command.ts    # Execute terminal commands (with security validation)
│   │   ├── list_sessions.ts      # List all active sessions
│   │   └── sync_terminal.ts      # Sync terminal state (cwd, env, platform info)
│   ├── sessions/
│   │   ├── manager.ts        # SessionManager class (lifecycle management)
│   │   └── store.ts          # Session persistence (JSON file in .ling-term-mcp/)
│   ├── security/
│   │   └── validator.ts      # SecurityValidator (whitelist, blacklist, injection detection)
│   ├── monitoring/
│   │   └── performance.ts    # PerformanceMonitor (execution timing, percentile stats)
│   └── utils/                # (empty — reserved for future utilities)
├── tests/
│   ├── unit/                 # Jest unit tests (one file per source module)
│   │   ├── execute_command.test.ts
│   │   ├── manager.test.ts
│   │   ├── performance.test.ts
│   │   ├── security.test.ts
│   │   └── sync_terminal.test.ts
│   ├── integration/          # (reserved for integration tests)
│   ├── e2e/
│   │   └── cli.test.ts       # E2E test (Node.js built-in test runner)
│   └── stress/
│       └── stress-tests.ts   # Stress test scenarios
├── config/
│   └── test_config.json      # Test configuration (MCP params, session cache, logging)
├── examples/
│   ├── basic-usage.ts        # MCP client usage example
│   ├── claude-config.json    # Claude desktop config example
│   └── cursor-config.json    # Cursor IDE config example
├── scripts/
│   └── verify-publish.ts     # Pre-publish verification script
├── optimization/             # LingMinOpt parameter optimization (Python)
│   ├── optimize_mcp_params.py
│   ├── optimization_report.md
│   └── optimization_results.json
├── docs/
│   ├── API.md                # API reference
│   └── USER_GUIDE.md         # User guide
├── .lingflow/
│   └── workflows/
│       └── develop_ling_term_mcp.yaml  # LingFlow development workflow config
├── jest.config.cjs           # Jest configuration (CommonJS)
├── tsconfig.json             # TypeScript config (production build)
├── tsconfig.test.json        # TypeScript config (tests — extends main config)
├── .eslintrc.cjs             # ESLint config (CommonJS)
├── .prettierrc.json          # Prettier config
├── .editorconfig             # Editor formatting rules
├── .npmrc                    # npm configuration (legacy-peer-deps, save-exact)
└── package.json              # Project manifest
```

---

## Architecture

### MCP Server Pattern

The server follows a standard MCP pattern defined in `src/index.ts`:

1. **Server creation**: `createServer()` instantiates an MCP Server with tool capabilities
2. **Tool registration**: `ListToolsRequestSchema` handler returns tool definitions
3. **Tool dispatch**: `CallToolRequestSchema` handler routes to the correct tool via `switch(name)`
4. **Transport**: StdioServerTransport (communicates over stdin/stdout)

### Tool Pattern

Each tool in `src/tools/` exports a const object with two properties:

```typescript
export const myTool = {
  definition: {
    name: 'tool_name',
    description: 'What the tool does',
    inputSchema: {
      type: 'object',
      properties: { /* ... */ },
      required: ['param'],
    },
  },

  async handler(args: unknown): Promise<MCPToolResponse> {
    const { param } = args as { param: string };
    // ... logic ...
    return {
      content: [{ type: 'text', text: 'result' }],
      isError: false,  // optional, defaults to false
    };
  },
};
```

**Registered in `src/index.ts`** — both the `definition` (in ListTools handler) and `handler` (in CallTool handler) must be wired up.

### Session Persistence

Sessions are stored in a JSON file at `.ling-term-mcp/sessions.json` relative to `process.cwd()`. The `SessionStore` (`src/sessions/store.ts`) uses an in-memory `Map` backed by file I/O:

- `initializeStore()` — loads from disk on first access
- `persistSessions()` — writes full state to disk after each mutation
- Every store operation calls `initializeStore()` first (lazy initialization)

### Security Layer

`SecurityValidator` (`src/security/validator.ts`) is a singleton that validates commands before execution:

1. **Length check** — max 10000 characters
2. **Blacklist check** — always denies dangerous commands (rm, sudo, kill, dd, etc.)
3. **Whitelist check** — optional, only when `allowUnknownCommands: false`
4. **Dangerous pattern detection** — regex patterns for injection, fork bombs, pipe-to-shell
5. **Shell injection check** — detects `&&`, `||`, `;`, `|`, `$`, backticks, etc.

**Important**: The default config has `allowUnknownCommands: true`, so the whitelist is advisory. The blacklist and pattern checks are always enforced.

### Performance Monitoring

`PerformanceMonitor` (`src/monitoring/performance.ts`) tracks command execution:

- Records execution time, success/failure, per-command metrics
- Calculates percentile stats (P50, P95, P99)
- `withPerformanceTracking()` wraps async functions to automatically record
- Singleton instance `performanceMonitor` is used by `execute_command`

---

## Code Style and Conventions

### TypeScript Configuration

- **Target**: ES2022
- **Module**: CommonJS (compiled output)
- **Strict mode**: enabled (noImplicitReturns, noUnusedLocals, noUnusedParameters, noFallthroughCasesInSwitch)
- **Source maps**: enabled
- **Declaration files**: generated

### Formatting (Prettier)

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 80,
  "tabWidth": 2,
  "useTabs": false,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

### Naming Conventions

- **Files**: snake_case (e.g., `execute_command.ts`, `sync_terminal.ts`)
- **Exports**: camelCase for functions/objects (e.g., `executeCommand`, `syncTerminal`)
- **Classes**: PascalCase (e.g., `SessionManager`, `SecurityValidator`, `PerformanceMonitor`)
- **Constants**: UPPER_CASE (e.g., `DEFAULT_WHITELIST`, `LATENCY_BUCKETS`)
- **Singletons**: camelCase instances (e.g., `sessionManager`, `securityValidator`, `performanceMonitor`)

### Import Style

- Imports use `.js` extension for local modules (TypeScript ESM convention):
  ```typescript
  import { saveSession } from '../sessions/store.js';
  ```
- External imports do NOT use extensions:
  ```typescript
  import { exec } from 'child_process';
  import { v4 as uuidv4 } from 'uuid';
  ```

### Error Handling

- Tools catch errors and return `MCPToolResponse` with `isError: true` (do not throw from handlers for expected failures)
- The MCP server's `CallToolRequestSchema` handler has a top-level try-catch that returns error responses
- `console.error()` is used for server-side logging (stdout is reserved for MCP protocol)

### ESLint Rules

- `@typescript-eslint/no-unused-vars`: error (unused vars prefixed with `_` are allowed via `argsIgnorePattern`)
- `@typescript-eslint/no-explicit-any`: warn
- `no-console`: warn (allows `console.warn` and `console.error`)

---

## Testing Approach

### Test Framework

- **Unit/Integration**: Jest 29 with `ts-jest` preset
- **E2E**: Node.js built-in test runner (`node --test`)
- **Stress**: Direct `tsx` execution

### Jest Configuration

- Config: `jest.config.cjs` (CommonJS format required by Jest)
- Test tsconfig: `tsconfig.test.json` (extends main config, adds `jest` types)
- Module name mapper: `^(\\.{1,2}/.*)\\.js$` → `$1` (strips `.js` from imports)
- Transform: `ts-jest` with `tsconfig.test.json`
- Coverage threshold: 70% globally (branches, functions, lines, statements)
- Coverage excludes: declaration files, `src/index.ts`

### Test Patterns

```typescript
// Unit test file structure
import { executeCommand } from '../../src/tools/execute_command';

describe('tool_name', () => {
  it('should do something', async () => {
    const result = await tool.handler({ /* args */ });
    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
  });
});
```

### Session Test Cleanup

Tests that use sessions clean up the file store in `beforeEach`:

```typescript
const SESSIONS_FILE = path.join(process.cwd(), '.ling-term-mcp', 'sessions.json');

beforeEach(() => {
  if (fs.existsSync(SESSIONS_FILE)) {
    fs.unlinkSync(SESSIONS_FILE);
  }
});
```

### Mocking

- `uuid` module is mocked in session manager tests to generate predictable IDs:
  ```typescript
  jest.mock('uuid', () => ({
    v4: jest.fn(() => `predictable-uuid-${counter++}`),
  }));
  ```

---

## Important Gotchas

### Module Resolution (ESM vs CommonJS)

The project declares `"type": "module"` in package.json (ESM) but compiles to CommonJS (`"module": "commonjs"` in tsconfig.json). This means:

- Source imports must use `.js` extensions for local files
- Jest config must be `.cjs` (CommonJS) because Jest doesn't support ESM configs natively
- The `ts-jest` moduleNameMapper strips `.js` extensions so tests resolve `.ts` files

### Session Store Location

Sessions are persisted to `.ling-term-mcp/sessions.json` relative to `process.cwd()`, not relative to the project root. This means the storage location depends on where the server is launched from. Tests clean up this file in `beforeEach`.

### Tool Registration

When adding a new MCP tool, you must update **two places** in `src/index.ts`:

1. The `ListToolsRequestSchema` handler — add the tool's `definition`
2. The `CallToolRequestSchema` handler — add a `case` in the switch statement

### Security Validator Overlap

Some commands appear in both the whitelist AND the blacklist (e.g., `rm`, `rmdir`). The blacklist check runs first, so these commands are always denied regardless of whitelist membership.

### console.log vs console.error

Stdout (`console.log`) is reserved for MCP protocol messages. Server-side logging must use `console.error()` or `console.warn()`. ESLint warns on `console.log` usage.

### Test Config

`config/test_config.json` exists with MCP connection parameters, but it is not loaded by the test suite automatically. Tests create their own configurations inline.

### E2E Tests Use Different Runner

`npm run test:e2e` uses `node --test` (Node.js built-in test runner), NOT Jest. E2E tests should not use Jest APIs (`describe`, `it`, `expect`).

---

## Adding a New MCP Tool

1. Create `src/tools/my_tool.ts` following the tool pattern (definition + handler)
2. Import and register in `src/index.ts`:
   - Add import: `import { myTool } from './tools/my_tool.js';`
   - Add to ListTools handler: `myTool.definition,`
   - Add case in CallTools handler: `case 'my_tool': return await myTool.handler(args);`
3. Create `tests/unit/my_tool.test.ts` with Jest tests
4. Run: `npm run lint && npx tsc --noEmit && npm test`

---

## Key Dependencies

### Runtime

| Package | Version | Purpose |
|---------|---------|---------|
| `@modelcontextprotocol/sdk` | ^1.27.1 | MCP server and protocol types |
| `uuid` | (via types) | Session ID generation |

### Development

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | ^5.4.0 | Type checking and compilation |
| `jest` | ^29.7.0 | Unit/integration test framework |
| `ts-jest` | ^29.1.0 | Jest TypeScript transform |
| `tsx` | ^4.21.0 | Dev mode execution (no build) |
| `eslint` | ^8.57.0 | Code linting |
| `prettier` | ^3.2.0 | Code formatting |
| `husky` | ^9.0.0 | Git hooks |
| `lint-staged` | ^15.2.0 | Staged file linting |
| `typedoc` | ^0.25.0 | API documentation generation |
| `rimraf` | ^5.0.0 | Clean build artifacts |

---

## CI/CD

### Branches

- `main`, `develop` — CI runs on push and PR
- Feature branches should follow pattern: `feature/my-feature`

### CI Steps (`.github/workflows/ci.yml`)

1. Install: `npm ci`
2. Lint: `npm run lint`
3. Type check: `npx tsc --noEmit`
4. Test: `npm test`
5. Coverage upload: Codecov (Node 20.x only)
6. Build: `npm run build` (separate job, depends on test job)

### Pre-commit Hooks (Husky + lint-staged)

- `*.ts, *.js` files: `eslint --fix` + `prettier --write`
- `*.json, *.md` files: `prettier --write`

### npm Publish

- `prepublishOnly` runs `npm run clean && npm run build`
- Published files: `dist/`, `README.md`, `LICENSE`
- Binary: `ling-term-mcp` → `./dist/cli.js`

---

## Related Projects

- **LingFlow** (`/home/ai/LingFlow`) — Parent project. Intelligent software development workflow engine with skill-driven architecture, agent coordination, and self-optimization capabilities.
- The `.lingflow/` directory contains a development workflow YAML that defines the build phases for this project using LingFlow skills.
- The `optimization/` directory contains a Python-based parameter optimization tool (LingMinOpt integration).

---

## Resources

- `README.md` — Project overview and quick start
- `docs/API.md` — API reference for MCP tools
- `docs/USER_GUIDE.md` — User guide
- `CONTRIBUTING.md` — Contribution guidelines
- `examples/` — Claude and Cursor configuration examples
- `CHANGELOG.md` — Version history
