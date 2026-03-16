#!/bin/bash
# cmbt-agent_change - new file
# Automated test-fix loop for ACP OpenCode integration

set -e

MAX_ITERATIONS=5
ITERATION=0

echo "🚀 Starting automated test-fix loop..."

while [ $ITERATION -lt $MAX_ITERATIONS ]; do
    ITERATION=$((ITERATION + 1))
    echo ""
    echo "📍 Iteration $ITERATION/$MAX_ITERATIONS"
    
    # Build extension
    echo "🔨 Building extension..."
    cd src && pnpm bundle && cd ..
    
    # Run E2E test
    echo "🧪 Running E2E tests..."
    if cd src && pnpm test:e2e; then
        echo "✅ Tests passed! OpenCode integration working."
        exit 0
    else
        echo "❌ Tests failed. Check logs above."
        
        if [ $ITERATION -eq $MAX_ITERATIONS ]; then
            echo "⚠️  Max iterations reached. Manual intervention needed."
            exit 1
        fi
        
        echo "⏳ Waiting 5 seconds before next iteration..."
        sleep 5
    fi
done
