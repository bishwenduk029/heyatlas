# Coding Agents Sandbox

E2B sandbox templates for coding agents used by Atlas.

## Templates

- **opencode** - OpenCode CLI agent sandbox
- **goose** - Goose AI agent sandbox

## Setup

```bash
# Install dependencies
pip install -e .

# Set up E2B API key
export E2B_API_KEY=your_api_key
# Or create a .env file with E2B_API_KEY=your_api_key
```

## Building Templates

### Development builds (smaller resources for testing)

```bash
cd opencode && python build_dev.py
cd goose && python build_dev.py
```

### Production builds

```bash
cd opencode && python build_prod.py
cd goose && python build_prod.py
```

## Template Aliases

After building, the templates will be available with these aliases:

- `heyatlas-opencode` / `heyatlas-opencode-dev`
- `heyatlas-goose` / `heyatlas-goose-dev`

## Usage

These templates are used by the Atlas agent via `atlas/src/lib/e2b-sandbox.ts`.
