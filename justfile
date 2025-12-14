# Web tasks
setup-web:
    @echo "Setting up web..."
    cd web && pnpm install

build-web:
    @echo "Building web..."
    cd web && pnpm run build

web-dev:
    @echo "Running web in dev mode..."
    cd cloud/web && pnpm run dev

deploy-web:
    echo "🔄 Changes detected in web, proceeding with deployment..."
    cd on-cloud/web
    vercel deploy --prod

# Voice Agent tasks (Python)
setup-voice-agent:
    @echo "Setting up voice-agent..."
    cd on-cloud/voice-agent && uv sync

voice-agent-dev:
    @echo "Running voice-agent in dev mode..."
    cd on-cloud/voice-agent && uv run main.py dev

voice-agent-download:
    @echo "Downloading voice-agent model files..."
    cd on-cloud/voice-agent && uv run main.py download-files

voice-agent-console:
    @echo "Running voice-agent in console mode..."
    cd on-cloud/voice-agent && uv run main.py console

deploy-voice-agent:
    @echo "Checking for changes in voice-agent..."
    @cd on-cloud/voice-agent && if ! git diff --quiet HEAD^ HEAD .; then \
        echo "🔄 Changes detected in voice-agent, proceeding with deployment..." && \
        fly deploy; \
    else \
        echo "✋ No changes in voice-agent, skipping deployment"; \
    fi

# PartyKit Relay tasks
setup-party-relay:
    @echo "Setting up PartyKit relay..."
    cd cloud/party-relay && pnpm install

party-relay-dev:
    @echo "Running PartyKit relay in dev mode..."
    cd cloud/party-relay && pnpm run dev

party-relay-deploy:
    @echo "Deploying PartyKit relay..."
    cd cloud/party-relay && pnpm run deploy

# Agent Bridge tasks
setup-agent-bridge-sidecar:
    @echo "Setting up agent-bridge..."
    cd on-device/agent-bridge && bun install

build-agent-bridge-sidecar:
    @echo "Setting up agent-bridge..."
    cd on-device/agent-bridge && pnpm run build
    cp on-device/agent-bridge/dist/heycomputer-agent-bridge on-device/desktop/src-tauri/sidecars/heycomputer-agent-bridge-aarch64-apple-darwin
    @echo "✅ Agent Bridge binary compiled to on-device/desktop/src-tauri/sidecars/"

agent-bridge-dev:
    @echo "Running agent-bridge in dev mode..."
    cd on-device/agent-bridge && bun run index.ts

# MCP UI Server tasks
setup-mcp-ui-server:
    @echo "Setting up mcp-ui-server..."
    cd on-cloud/mcp-ui-server && bun install

mcp-ui-server-dev:
    @echo "Running mcp-ui-server in dev mode..."
    cd on-cloud/mcp-ui-server && bun run dev

deploy-mcp-ui-server:
    @echo "Deploying mcp-ui-server to Cloudflare Workers..."
    cd on-cloud/mcp-ui-server && bunx wrangler@3.78.0 deploy
    @echo "⚠️  Don't forget to set the API key secret:"
    @echo "    cd on-cloud/mcp-ui-server && bunx wrangler@3.78.0 secret put NIRMANUS_API_KEY"

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
setup: setup-web setup-voice-agent setup-party-relay setup-agent-bridge-sidecar setup-mcp-ui-server
    @echo "✅ Setup complete."

dev:
    @echo "Starting development environment..."
    npx -y concurrently \
        "just web-dev" \
        "just party-relay-dev" \
        "just voice-agent-dev"

dev-voice:
    @echo "Starting voice pipeline (party-relay + voice-agent + agent-bridge + mcp-ui-server)..."
    npx -y concurrently \
        "just party-relay-dev" \
        "just voice-agent-dev" \
        "just agent-bridge-dev" \

    @echo "✅ Deployment complete."

desktop-dev: build-agent-bridge-sidecar
    cd on-device/desktop && pnpm run dev

desktop-build: build-agent-bridge-sidecar
    cd on-device/desktop && pnpm run build
