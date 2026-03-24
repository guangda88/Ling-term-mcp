# Contributing to Ling-term-mcp (灵犀)

Thank you for your interest in contributing to Ling-term-mcp!

## Code of Conduct

By participating in this project, you agree to maintain a respectful, inclusive environment.

## How to Contribute

### Reporting Bugs

Before creating bug reports, please check existing issues as you might find that the problem has already been reported. When creating a bug report, include:

- A clear and concise description of the problem
- Steps to reproduce the problem
- Expected behavior
- Actual behavior
- Screenshots or logs if applicable
- Environment details (OS, Node version, etc.)

### Suggesting Enhancements

Enhancement suggestions are welcome! Please:

- Use a clear and descriptive title
- Provide a detailed description of the enhancement
- Explain why this enhancement would be useful
- Provide example use cases if applicable

### Pull Requests

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Make your changes following the coding standards
4. Run tests (`npm test`)
5. Run linter (`npm run lint`)
6. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
7. Push to the branch (`git push origin feature/AmazingFeature`)
8. Open a Pull Request

### Coding Standards

- Follow TypeScript best practices
- Write tests for new features
- Ensure all tests pass before submitting
- Update documentation as needed

### Development Workflow

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/Ling-term-mcp.git
cd Ling-term-mcp

# Install dependencies
npm install

# Create a branch
git checkout -b feature/my-feature

# Make your changes
# ...

# Run tests
npm test

# Build
npm run build

# Commit and push
git add .
git commit -m "feat: add my feature"
git push origin feature/my-feature
```

## Development Setup

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run linter
npm run lint

# Format code
npm run format
```

## Project Structure

```
src/
├── index.ts          # MCP Server entry point
├── cli.ts            # CLI entry point
├── types.ts          # TypeScript type definitions
├── tools/            # MCP tools
│   ├── execute_command.ts
│   ├── sync_terminal.ts
│   ├── list_sessions.ts
│   ├── create_session.ts
│   └── destroy_session.ts
├── sessions/         # Session management
│   ├── manager.ts
│   └── store.ts
└── utils/            # Utility functions
```

## Testing

We aim for high test coverage (85%+). Please write tests for:

- New features
- Bug fixes
- Edge cases

## Documentation

Keep documentation up to date:

- README.md for user-facing documentation
- docs/API.md for API reference
- Add inline comments for complex logic
- Update CHANGELOG.md for notable changes

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
