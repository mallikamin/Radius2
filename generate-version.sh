#!/bin/bash
# Generate version.js with current git info

HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
DATE=$(date -u +"%Y-%m-%d %H:%M UTC")
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")

cat > frontend/src/version.js << EOJS
// Auto-generated during build - DO NOT EDIT
export const BUILD_INFO = {
  hash: '${HASH}',
  date: '${DATE}',
  branch: '${BRANCH}'
};
EOJS

echo "✓ Generated version.js: ${HASH} (${BRANCH}) - ${DATE}"
