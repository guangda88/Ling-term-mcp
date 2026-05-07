# Ling-term-mcp Detailed Guide

Content moved from AGENTS.md for context budget optimization. See AGENTS.md for identity, commands, and rules.

---

## Tech Stack

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

## Full Command Reference

### Development

```bash
npm install          # Install dependencies
npm run dev          # Run in dev mode (no build needed, uses tsx)
npm run dev:watch    # Run in dev mode with watch
npm run build        # Build TypeScript to dist/
npm run build:watch  # Build and watch for changes
npm start            # Start production server (from compiled dist/)
```

### Testing

```bash
npm test             # Run unit tests (default)
npm run test:unit    # Run unit tests explicitly
npm run test:integration  # Run integration tests
npm run test:e2e     # Run e2e tests (Node.js built-in test runner, NOT Jest)
npm run test:stress  # Run stress tests (uses tsx directly)
npm run test:coverage # Run tests with coverage report
npm run test:watch   # Run tests in watch mode
```

### Code Quality

```bash
npm run lint         # Lint all source and test files
npm run lint:fix     # Lint and auto-fix
npm run format       # Format all TypeScript files
npm run format:check # Check formatting without writing
npx tsc --noEmit     # Type check (used in CI)
```

### Build & Publish

```bash
npm run clean        # Clean dist and coverage directories
npm run verify       # Verify publish readiness
npm run docs         # Generate API documentation (TypeDoc)
npm run optimize     # Run parameter optimization (Python script)
```

---

## Project Structure

```
Ling-term-mcp/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── cli.ts                # CLI binary entry point
│   ├── tools/
│   │   ├── create_session.ts
│   │   ├── destroy_session.ts
│   │   ├── execute_command.ts
│   │   ├── list_sessions.ts
│   │   └── sync_terminal.ts
│   ├── sessions/
│   │   └── store.ts          # Session persistence
│   ├── security/
│   │   ├── validator.ts      # SecurityValidator
│   │   └── identity.ts       # 灵族 member registry
│   ├── monitoring/
│   │   └── performance.ts    # PerformanceMonitor
│   └── audit/
│       ├── contracts.ts      # Behavioral contracts
│       ├── metacognitive.ts  # Metacognitive audit
│       └── snapshot.ts       # Session snapshots
├── tests/
│   ├── unit/
│   ├── e2e/
│   └── stress/
└── docs/
```

---

## Architecture Details

### MCP Server Pattern

1. **Server creation**: `createServer()` instantiates an MCP Server with tool capabilities
2. **Tool registration**: `ListToolsRequestSchema` handler returns tool definitions
3. **Tool dispatch**: `CallToolRequestSchema` handler routes via `switch(name)`
4. **Transport**: StdioServerTransport (communicates over stdin/stdout)

### Tool Pattern

```typescript
export const myTool = {
  definition: {
    name: 'tool_name',
    description: 'What the tool does',
    inputSchema: {
      type: 'object',
      properties: {
        /* ... */
      },
      required: ['param'],
    },
  },
  async handler(args: unknown): Promise<MCPToolResponse> {
    const { param } = args as { param: string };
    return { content: [{ type: 'text', text: 'result' }], isError: false };
  },
};
```

### Session Persistence

- Stored at `.ling-term-mcp/sessions.json` relative to `process.cwd()`
- `initializeStore()` — loads from disk on first access
- `persistSessions()` — writes full state after each mutation

### Security Layer

1. Length check (max 10000 chars)
2. Blacklist check (always enforced: rm, sudo, kill, dd, etc.)
3. Whitelist check (only when `allowUnknownCommands: false`)
4. Dangerous pattern detection (injection, fork bombs, pipe-to-shell)
5. Shell injection check (`&&`, `||`, `;`, `|`, `$`, backticks)

### Identity Verification

`src/security/identity.ts` maintains the 12-member 灵族 registry. `execute_command` accepts an optional `caller` param validated against this registry.

---

## Testing Details

- **Unit/Integration**: Jest 29 + ts-jest
- **E2E**: `node --test` (do NOT use Jest APIs)
- **Coverage threshold**: 70% globally
- **Session cleanup**: `beforeEach` deletes `.ling-term-mcp/sessions.json`
- **ESM mocking**: `@ling/protocol` requires CJS mock at `tests/__mocks__/@ling/protocol.js`

---

## Key Dependencies

| Package                     | Version | Purpose                         |
| --------------------------- | ------- | ------------------------------- |
| `@modelcontextprotocol/sdk` | ^1.27.1 | MCP server and protocol types   |
| `typescript`                | ^5.4.0  | Type checking and compilation   |
| `jest`                      | ^29.7.0 | Unit/integration test framework |
| `ts-jest`                   | ^29.1.0 | Jest TypeScript transform       |
| `tsx`                       | ^4.21.0 | Dev mode execution              |
| `eslint`                    | ^8.57.0 | Code linting                    |
| `prettier`                  | ^3.2.0  | Code formatting                 |

---

## CI/CD

- **Branches**: `main`, `develop` — CI on push/PR
- **CI steps**: `npm ci` → lint → type check → test → coverage → build
- **Node versions**: 18.x, 20.x
- **Pre-commit**: Husky + lint-staged (`eslint --fix` + `prettier --write`)
- **Publish**: `prepublishOnly` runs `clean && build`, publishes `dist/`, README, LICENSE

---

## Important Gotchas

- `package.json` does NOT declare `"type": "module"` — this is CommonJS throughout
- Source imports must use `.js` extensions for local files
- Jest config must be `.cjs` format
- `console.log` reserved for MCP protocol — use `console.error` for logging
- Security blacklist runs before whitelist — overlap means always denied
- `config/test_config.json` exists but tests create configs inline
