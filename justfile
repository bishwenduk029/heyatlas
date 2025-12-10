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
    @echo "Checking for changes in web..."
    @cd web && if ! git diff --quiet HEAD^ HEAD .; then \
        echo "🔄 Changes detected in web, proceeding with deployment..." && \
        vercel deploy --prod; \
    else \
        echo "✋ No changes in web, skipping deployment"; \
    fi

# Voice Agent tasks
setup-voice-agent:
    @echo "Setting up voice-agent..."
    cd voice-agent && uv sync

voice-agent-dev:
    @echo "Running voice-agent in dev mode..."
    cd voice-agent && uv run main.py dev

voice-agent-console:
    @echo "Running voice-agent in dev mode..."
    npx -y concurrently \
        "cd claude-agent && uv sync && uv run main.py" \
        "cd voice-agent && uv sync && uv run main.py console"

deploy-voice-agent:
    @echo "Checking for changes in voice-agent..."
    @cd voice-agent && if ! git diff --quiet HEAD^ HEAD .; then \
        echo "🔄 Changes detected in voice-agent, proceeding with deployment..." && \
        fly deploy; \
    else \
        echo "✋ No changes in voice-agent, skipping deployment"; \
    fi

# Agno Agent tasks
setup-agno-agent:
    @echo "Setting up agno-agent..."
    cd agno-agent && uv sync

# Claude Agent tasks
setup-claude-agent:
    @echo "Setting up claude-agent..."
    cd claude-agent && uv sync

# Bifrost Gateway tasks
deploy-bifrost:
    @echo "Checking for changes in bifrost-gateway..."
    @cd bifrost-gateway && if ! git diff --quiet HEAD^ HEAD .; then \
        echo "🔄 Changes detected in bifrost-gateway, proceeding with deployment..." && \
        fly deploy; \
    else \
        echo "✋ No changes in bifrost-gateway, skipping deployment"; \
    fi

build-agno-agent:
    @echo "Building agno-agent wheel..."
    cd agno-agent && rm -rf dist/ build/ *.egg-info
    cd agno-agent && uv build
    @echo "Copying wheel to e2b files directory..."
    rm -f virtual-desktop-agent/e2b/files/agno_agent-*.whl
    cp agno-agent/dist/agno_agent-*.whl virtual-desktop-agent/e2b/files/
    @echo "✅ Agno Agent wheel built and copied to virtual-desktop-agent/e2b/files/"

build-claude-agent:
    @echo "Building claude-agent wheel..."
    cd claude-agent && rm -rf dist/ build/ *.egg-info
    cd claude-agent && uv build
    @echo "Copying wheel to e2b files directory..."
    rm -f virtual-desktop-agent/e2b/files/claude_agent-*.whl
    cp claude-agent/dist/claude_agent-*.whl virtual-desktop-agent/e2b/files/
    @echo "✅ Claude Agent wheel built and copied to virtual-desktop-agent/e2b/files/"

clean-agno-agent:
    @echo "Cleaning agno-agent build artifacts..."
    cd agno-agent && rm -rf dist/ build/ *.egg-info __pycache__ .pytest_cache
    rm -f virtual-desktop-agent/e2b/files/agno-agent.whl
    @echo "✅ Clean complete"

clean-claude-agent:
    @echo "Cleaning claude-agent build artifacts..."
    cd claude-agent && rm -rf dist/ build/ *.egg-info __pycache__ .pytest_cache
    rm -f virtual-desktop-agent/e2b/files/claude_agent-*.whl
    @echo "✅ Clean complete"

build-opencode-bridge:
    @echo "Building opencode-bridge..."
    cd opencode-agent && bun build index.ts --outfile=dist/index.js --target=node --minify
    cp opencode-agent/dist/index.js virtual-desktop-agent/e2b/files/opencode-bridge.js
    @echo "✅ OpenCode bridge built and copied to virtual-desktop-agent/e2b/files/opencode-bridge.js"

test-agno-agent:
    @echo "Running agno-agent locally..."
    cd agno-agent && uv run main.py

test-claude-agent:
    @echo "Running claude-agent locally..."
    cd claude-agent && uv run main.py

# Virtual Desktop Agent tasks
build-e2b-sandbox: build-opencode-bridge
    @echo "Building E2B sandbox..."
    cd virtual-desktop-agent/e2b && uv run build_prod.py

# Composite tasks
setup: setup-web setup-voice-agent setup-agno-agent setup-claude-agent
    @echo "✅ Setup complete."

dev: setup-web setup-voice-agent setup-agno-agent setup-claude-agent
    @echo "Starting development environment..."
    npx -y concurrently \
        "just web-dev" \
        "just voice-agent-dev"

build: build-web build-agno-agent build-claude-agent build-opencode-bridge
    @echo "✅ Build complete."

build-all: build-web build-agno-agent build-claude-agent build-opencode-bridge build-e2b-sandbox
    @echo "✅ Full build complete (web + agno-agent + claude-agent + opencode-bridge + e2b sandbox)."

deploy: deploy-voice-agent deploy-web deploy-bifrost build-e2b-sandbox
    @echo "✅ Deployment complete."

clean: clean-agno-agent clean-claude-agent
    @echo "✅ Clean complete."
