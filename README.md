# Nirmanus Workspace

Multi-package monorepo workspace containing various agent projects.

## Structure

This workspace contains the following packages:

### voice-agent
Python-based voice agent using LiveKit
- Language: Python 3.12+
- Virtual environment: `.venv`
- Dependencies managed via `pyproject.toml`

### virtual-desktop-agent
Docker-based desktop agent with E2B configuration
- Deployment: Docker
- Configuration: E2B sandbox environment

## Setup

### Prerequisites
- Python 3.12+
- Docker
- VSCode (recommended)

### Getting Started

1. Open the workspace in VSCode:
   ```bash
   code nirmanus.code-workspace
   ```

2. For Python projects (voice-agent):
   - Virtual environment will be automatically detected
   - Install dependencies: `cd voice-agent && .venv/bin/pip install -e .`

3. For Docker projects (virtual-desktop-agent):
   - Build and run using Docker commands as per project documentation

## VSCode Integration

The workspace is configured with:
- Per-folder Python interpreter detection
- Automatic virtual environment activation
- Docker file associations
- Recommended extensions for Python, TypeScript, and Docker

## Development

Each package is independent with its own:
- Dependencies
- Configuration files
- Development environment
- Git tracking (if needed)
