#!/bin/bash
# Quick script to view application logs

LOG_FILE="$HOME/Library/Logs/free-todo-frontend/freetodo.log"

echo "=== FreeTodo Application Log ==="
echo "Log file: $LOG_FILE"
echo ""

if [ -f "$LOG_FILE" ]; then
    echo "Last 100 lines:"
    echo "---"
    tail -100 "$LOG_FILE"
else
    echo "Log file not found. The application may not have started yet."
fi

echo ""
echo "=== Backend Logs ==="
BACKEND_LOG_DIR="$HOME/Library/Application Support/free-todo-frontend/lifetrace-data/logs"
if [ -d "$BACKEND_LOG_DIR" ]; then
    echo "Backend log directory: $BACKEND_LOG_DIR"
    echo ""
    for log in "$BACKEND_LOG_DIR"/*.log; do
        if [ -f "$log" ]; then
            echo "=== $(basename "$log") ==="
            tail -50 "$log"
            echo ""
        fi
    done
else
    echo "Backend log directory not found: $BACKEND_LOG_DIR"
    echo "The backend may not have started yet."
fi
