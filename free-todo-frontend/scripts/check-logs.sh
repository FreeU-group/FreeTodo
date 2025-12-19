#!/bin/bash
# Script to check application logs and diagnose issues

echo "=== LifeTrace Application Logs Checker ==="
echo ""

# Check Electron main process log
ELECTRON_LOG="$HOME/Library/Logs/free-todo-frontend/freetodo.log"
echo "1. Electron Main Process Log:"
if [ -f "$ELECTRON_LOG" ]; then
    echo "   Location: $ELECTRON_LOG"
    echo "   Size: $(ls -lh "$ELECTRON_LOG" | awk '{print $5}')"
    echo "   Last 50 lines:"
    echo "   ---"
    tail -50 "$ELECTRON_LOG" | sed 's/^/   /'
    echo "   ---"
else
    echo "   ❌ Log file not found: $ELECTRON_LOG"
fi

echo ""
echo "2. Backend Data Directory:"
DATA_DIR="$HOME/Library/Application Support/FreeTodo/lifetrace-data"
if [ -d "$DATA_DIR" ]; then
    echo "   Location: $DATA_DIR"
    echo "   Contents:"
    ls -la "$DATA_DIR" | sed 's/^/   /'

    echo ""
    echo "   Backend Logs:"
    if [ -d "$DATA_DIR/logs" ]; then
        for log_file in "$DATA_DIR/logs"/*.log; do
            if [ -f "$log_file" ]; then
                echo "   - $(basename "$log_file"):"
                tail -30 "$log_file" | sed 's/^/     /'
            fi
        done
    else
        echo "   ❌ Logs directory not found"
    fi
else
    echo "   ❌ Data directory not found: $DATA_DIR"
fi

echo ""
echo "3. Application Process Check:"
if pgrep -f "FreeTodo" > /dev/null; then
    echo "   ✓ FreeTodo process is running"
    pgrep -f "FreeTodo" | sed 's/^/   PID: /'
else
    echo "   ❌ No FreeTodo process found"
fi

if pgrep -f "lifetrace" > /dev/null; then
    echo "   ✓ Backend (lifetrace) process is running"
    pgrep -f "lifetrace" | sed 's/^/   PID: /'
else
    echo "   ❌ No backend (lifetrace) process found"
fi

echo ""
echo "4. Port Check:"
if lsof -i :8000 > /dev/null 2>&1; then
    echo "   ✓ Port 8000 is in use (backend)"
    lsof -i :8000 | sed 's/^/   /'
else
    echo "   ❌ Port 8000 is not in use (backend not running?)"
fi

if lsof -i :3000 > /dev/null 2>&1; then
    echo "   ✓ Port 3000 is in use (frontend)"
    lsof -i :3000 | sed 's/^/   /'
else
    echo "   ❌ Port 3000 is not in use (frontend not running?)"
fi

echo ""
echo "=== End of Log Check ==="
