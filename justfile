# Web tasks
setup-web:
    @echo "Setting up web..."
    cd web && pnpm install

build-web:
    @echo "Building web..."
    cd web && pnpm run build

web-dev:
    @echo "Running web in dev mode..."
    cd web && pnpm run dev

deploy-web:
    @echo "🔄 Changes detected in web, proceeding with deployment..."
    cd web && vercel deploy --prod

# Voice Agent tasks (Python)
setup-voice-agent:
    @echo "Setting up voice-agent..."
    cd voice-agent && uv sync

voice-agent-dev:
    @echo "Running voice-agent in dev mode..."
    cd voice-agent && uv run main.py dev

voice-agent-download:
    @echo "Downloading voice-agent model files..."
    cd voice-agent && uv run main.py download-files

voice-agent-console:
    @echo "Running voice-agent in console mode..."
    cd voice-agent && uv run main.py console

deploy-voice-agent:
    @echo "Checking for changes in voice-agent..."
    @cd voice-agent && if ! git diff --quiet HEAD^ HEAD .; then \
        echo "🔄 Changes detected in voice-agent, proceeding with deployment..." && \
        fly deploy; \
    else \
        echo "✋ No changes in voice-agent, skipping deployment"; \
    fi

# Agent Rooms Server tasks
setup-agent-rooms:
    @echo "Setting up agent-rooms-server..."
    cd agent-rooms-server && pnpm install

agent-rooms-dev:
    @echo "Running agent-rooms-server in dev mode..."
    cd agent-rooms-server && pnpm run dev

agent-rooms-deploy:
    @echo "Deploying agent-rooms-server..."
    cd agent-rooms-server && pnpm run deploy

# CLI tasks
setup-cli:
    @echo "Setting up CLI..."
    cd cli && bun install

build-cli:
    @echo "Building CLI..."
    cd cli && bun run build
    @echo "✅ HeyAtlas CLI binary compiled to cli/dist/"

cli-dev:
    @echo "Running CLI in dev mode..."
    cd cli && bun run cli.ts warp opencode

# MCP UI Server tasks
setup-mcp-ui-server:
    @echo "Setting up mcp-ui-server..."
    cd mcp-ui-server && bun install

mcp-ui-server-dev:
    @echo "Running mcp-ui-server in dev mode..."
    cd mcp-ui-server && bun run dev

deploy-mcp-ui-server:
    @echo "Deploying mcp-ui-server to Cloudflare Workers..."
    cd mcp-ui-server && bunx wrangler@3.78.0 deploy
    @echo "⚠️  Don't forget to set the API key secret:"
    @echo "    cd mcp-ui-server && bunx wrangler@3.78.0 secret put HEYATLAS_API_KEY"

# Bifrost Gateway tasks
deploy-bifrost:
    @echo "Checking for changes in bifrost-gateway..."
    @cd bifrost-gateway && if ! git diff --quiet HEAD^ HEAD .; then \
        echo "🔄 Changes detected in bifrost-gateway, proceeding with deployment..." && \
        fly deploy; \
    else \
        echo "✋ No changes in bifrost-gateway, skipping deployment"; \
    fi

# Composite tasks
setup: setup-web setup-voice-agent setup-agent-rooms setup-cli setup-mcp-ui-server
    @echo "✅ Setup complete."

dev:
    @echo "Starting development environment..."
    npx -y concurrently \
        "just web-dev" \
        "just agent-rooms-dev" \
        "just voice-agent-dev"

dev-voice:
    @echo "Starting voice pipeline (agent-rooms + voice-agent + cli + mcp-ui-server)..."
    npx -y concurrently \
        "just agent-rooms-dev" \
        "just voice-agent-dev" \
        "just cli-dev"

deploy-all:
    @echo "Deploying all services..."
    just deploy-web
    just deploy-voice-agent
    just agent-rooms-deploy
    just deploy-mcp-ui-server
    @echo "✅ Deployment complete."
