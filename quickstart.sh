#!/bin/bash

# Ling-term-mcp Quick Start Script
# This script helps you get started with Ling-term-mcp quickly

set -e

echo "🚀 Ling-term-mcp (灵犀) Quick Start"
echo "=================================="
echo ""

# Check Node.js version
echo "📋 Checking Node.js version..."
NODE_VERSION=$(node --version)
echo "   Node.js version: $NODE_VERSION"

# Check if version is >= 18
if ! node -e "const v=process.version.slice(1).split('.');process.exit(v[0]>=18?0:1)"; then
    echo "   ❌ Error: Node.js >= 18.0.0 is required"
    exit 1
fi

echo "   ✅ Node.js version is compatible"
echo ""

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Build the project
echo "🔨 Building project..."
npm run build
echo ""

# Run unit tests
echo "🧪 Running unit tests..."
npm test
echo ""

# Run optimization
echo "⚡ Running parameter optimization..."
cd optimization
python3 optimize_mcp_params.py
cd ..
echo ""

# Display next steps
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "==========="
echo ""
echo "1. Start the MCP server:"
echo "   npm start"
echo ""
echo "2. Configure your AI assistant:"
echo ""
echo "   For Cursor, add to settings:"
echo '   {"mcpServers": {"ling-term-mcp": {"command": "node", "args": ["'$(pwd)'/dist/index.js"]}}}'
echo ""
echo "   For Claude Desktop, add to config:"
echo '   {"mcpServers": {"ling-term-mcp": {"command": "node", "args": ["'$(pwd)'/dist/index.js"]}}}'
echo ""
echo "3. Run examples:"
echo "   cd examples"
echo "   npx tsx basic-usage.ts"
echo ""
echo "4. View documentation:"
echo "   - README.md - Project overview"
echo "   - docs/API.md - API reference"
echo "   - docs/USER_GUIDE.md - User guide"
echo ""
echo "📚 More information: https://github.com/guangda/ling-term-mcp"
