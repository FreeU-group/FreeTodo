#!/bin/bash
# Comprehensive diagnostic script for FreeTodo application

echo "=========================================="
echo "FreeTodo Application Diagnostic Tool"
echo "=========================================="
echo ""

# 1. Check Electron main process log
echo "1. ELECTRON MAIN PROCESS LOG"
echo "----------------------------"
ELECTRON_LOG="$HOME/Library/Logs/free-todo-frontend/freetodo.log"
if [ -f "$ELECTRON_LOG" ]; then
    echo "✓ Log file exists: $ELECTRON_LOG"
    echo "  Size: $(ls -lh "$ELECTRON_LOG" | awk '{print $5}')"
    echo "  Last modified: $(stat -f "%Sm" "$ELECTRON_LOG" 2>/dev/null || stat -c "%y" "$ELECTRON_LOG" 2>/dev/null)"
    echo ""
    echo "  Last 100 lines:"
    echo "  ---"
    tail -100 "$ELECTRON_LOG" | sed 's/^/  /'
    echo "  ---"
else
    echo "✗ Log file not found: $ELECTRON_LOG"
    echo "  This means the application may not have started yet."
fi

echo ""
echo ""

# 2. Check backend data directory and logs
echo "2. BACKEND DATA DIRECTORY"
echo "-------------------------"
DATA_DIR="$HOME/Library/Application Support/FreeTodo/lifetrace-data"
if [ -d "$DATA_DIR" ]; then
    echo "✓ Data directory exists: $DATA_DIR"
    echo "  Contents:"
    ls -la "$DATA_DIR" | sed 's/^/  /'

    echo ""
    echo "  Backend Logs:"
    if [ -d "$DATA_DIR/logs" ]; then
        for log_file in "$DATA_DIR/logs"/*.log; do
            if [ -f "$log_file" ]; then
                echo "  - $(basename "$log_file"):"
                tail -50 "$log_file" | sed 's/^/    /'
                echo ""
            fi
        done
    else
        echo "  ✗ Logs directory not found"
    fi
else
    echo "✗ Data directory not found: $DATA_DIR"
    echo "  This may indicate the backend never started."
fi

echo ""

# 3. Check running processes
echo "3. RUNNING PROCESSES"
echo "--------------------"
if pgrep -f "FreeTodo" > /dev/null; then
    echo "✓ FreeTodo process is running:"
    pgrep -f "FreeTodo" | while read pid; do
        ps -p "$pid" -o pid,command | tail -1 | sed 's/^/  /'
    done
else
    echo "✗ No FreeTodo process found"
fi

echo ""

if pgrep -f "lifetrace" > /dev/null; then
    echo "✓ Backend (lifetrace) process is running:"
    pgrep -f "lifetrace" | while read pid; do
        ps -p "$pid" -o pid,command | tail -1 | sed 's/^/  /'
    done
else
    echo "✗ No backend (lifetrace) process found"
fi

echo ""

# 4. Check ports
echo "4. PORT STATUS"
echo "--------------"
if lsof -i :8000 > /dev/null 2>&1; then
    echo "✓ Port 8000 is in use (backend):"
    lsof -i :8000 | sed 's/^/  /'
else
    echo "✗ Port 8000 is not in use (backend not running?)"
fi

echo ""

if lsof -i :3000 > /dev/null 2>&1; then
    echo "✓ Port 3000 is in use (frontend):"
    lsof -i :3000 | sed 's/^/  /'
else
    echo "✗ Port 3000 is not in use (frontend not running?)"
fi

echo ""

# 5. Check application bundle
echo "5. APPLICATION BUNDLE"
echo "---------------------"
APP_PATH="/Applications/FreeTodo.app"
if [ -d "$APP_PATH" ]; then
    echo "✓ Application bundle found: $APP_PATH"

    # Check backend executable
    BACKEND_EXEC="$APP_PATH/Contents/Resources/backend/lifetrace"
    if [ -f "$BACKEND_EXEC" ]; then
        echo "  ✓ Backend executable found"
        echo "    Size: $(ls -lh "$BACKEND_EXEC" | awk '{print $5}')"
        echo "    Executable: $([ -x "$BACKEND_EXEC" ] && echo "Yes" || echo "No")"
    else
        echo "  ✗ Backend executable not found: $BACKEND_EXEC"
    fi

    # Check Next.js server
    SERVER_JS="$APP_PATH/Contents/Resources/standalone/server.js"
    if [ -f "$SERVER_JS" ]; then
        echo "  ✓ Next.js server.js found"
    else
        echo "  ✗ Next.js server.js not found: $SERVER_JS"
    fi
else
    echo "✗ Application bundle not found: $APP_PATH"
    echo "  Looking for DMG file..."
    DMG_PATH="$HOME/Downloads/FreeTodo-*.dmg"
    if ls $DMG_PATH 1> /dev/null 2>&1; then
        echo "  Found DMG file(s):"
        ls -lh $DMG_PATH | sed 's/^/    /'
    fi
fi

echo ""
echo "=========================================="
echo "Diagnostic complete!"
echo "=========================================="
