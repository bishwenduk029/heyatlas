#!/bin/bash
# Build agno-agent wheel for distribution

set -e

echo "Building agno-agent wheel..."

# Clean previous builds
rm -rf dist/ build/ *.egg-info

# Build wheel with uv
uv build

# Show output
echo ""
echo "✅ Build complete!"
echo "Wheel location: $(ls dist/*.whl)"
echo "Size: $(du -h dist/*.whl | cut -f1)"
echo ""
echo "To install: uv pip install dist/*.whl"
