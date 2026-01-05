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

# Atlas Agent tasks (Cloudflare Durable Object)
setup-atlas:
    @echo "Setting up atlas..."
    cd atlas && pnpm install

atlas-dev:
    @echo "Running atlas in dev mode..."
    cd atlas && pnpm run dev

deploy-atlas:
    @echo "Deploying atlas..."
    cd atlas && npx wrangler deploy --env=""

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

deploy-voice-agent:
    @echo "Checking for changes in voice-agent..."
    @cd voice-agent && lk agent deploy

# Agent Smith tasks
setup-agent-smith:
    @echo "Setting up agent-smith..."
    cd desktop-sandbox/agent-smith && bun install

build-agent-smith: setup-agent-smith
    @echo "Building agent-smith..."
    cd desktop-sandbox/agent-smith && bun run build
    @echo "Copying built agent-smith.cjs to template/files..."
    cp desktop-sandbox/agent-smith/dist/agent-smith.cjs desktop-sandbox/template/files/agent-smith.cjs

agent-smith-dev:
    @echo "Running agent-smith in dev mode..."
    cd desktop-sandbox/agent-smith && bun run dev

# Desktop Sandbox tasks
setup-desktop-sandbox:
    @echo "Setting up desktop-sandbox template..."
    cd desktop-sandbox/template && uv sync

build-desktop-sandbox: setup-desktop-sandbox build-agent-smith
    cd desktop-sandbox/template && uv run python build_prod.py
    @echo "✅ Desktop sandbox built successfully"

desktop-sandbox-dev:
    @echo "Running desktop-sandbox in dev mode..."
    cd desktop-sandbox/template && uv run python build_dev.py

deploy-desktop-sandbox:
    @echo "Deploying desktop-sandbox..."
    cd desktop-sandbox/template && uv run python build_docker.py

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
setup: setup-web setup-atlas setup-voice-agent setup-cli setup-mcp-ui-server setup-agent-smith setup-desktop-sandbox
    @echo "✅ Setup complete."

# Kill any stray dev processes (workerd, next, etc.)
dev-cleanup:
    @echo "Cleaning up stray dev processes..."
    -@pkill -f "workerd" 2>/dev/null || true
    -@lsof -ti:8787 | xargs kill -9 2>/dev/null || true
    -@lsof -ti:3000 | xargs kill -9 2>/dev/null || true
    @echo "Cleanup done."

# Dev with mprocs TUI (nicer multiplexed logs)
dev: dev-cleanup
    @echo "Starting development environment with mprocs TUI..."
    @(sleep 3 && open http://localhost:3000) &
    mprocs "just atlas-dev" "just voice-agent-dev" "just web-dev"

# Voice pipeline: atlas + voice-agent + cli (for local coding agent)
dev-voice:
    @echo "Starting voice pipeline (atlas + voice-agent + cli)..."
    npx -y concurrently \
        "just atlas-dev" \
        "just voice-agent-dev" \
        "just cli-dev"

# Voice pipeline with mprocs TUI
dev-voice-tui: dev-cleanup
    @echo "Starting voice pipeline with mprocs TUI..."
    mprocs "just atlas-dev" "just voice-agent-dev" "just cli-dev"

# Desktop sandbox dev (for building/testing sandbox locally)
desktop-dev:
    @echo "Starting desktop development environment (agent-smith + desktop-sandbox)..."
    npx -y concurrently \
        "just agent-smith-dev" \
        "just desktop-sandbox-dev"

deploy-all:
    @echo "Deploying all services..."
    just deploy-web
    just deploy-atlas
    just deploy-voice-agent
    # just deploy-mcp-ui-server
    # just deploy-desktop-sandbox
    @echo "✅ Deployment complete."
