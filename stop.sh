#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$SCRIPT_DIR/manty-blast-mail.pid"

if [ ! -f "$PID_FILE" ]; then
    echo "Not running (no PID file)"
    exit 0
fi

PID=$(cat "$PID_FILE")
if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    echo "Stopped (PID: $PID)"
else
    echo "Process not found (PID: $PID)"
fi
rm -f "$PID_FILE"
