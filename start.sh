#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$SCRIPT_DIR/manty-blast-mail.pid"
CONFIG_FILE="$SCRIPT_DIR/config.yaml"
LOG_FILE="$SCRIPT_DIR/manty-blast-mail.log"

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        echo "Already running (PID: $PID)"
        exit 1
    fi
    rm -f "$PID_FILE"
fi

# Find binary
BIN=""
for candidate in "$SCRIPT_DIR/manty-blast-mail" "$SCRIPT_DIR/bin/mail-sender"; do
    if [ -x "$candidate" ]; then
        BIN="$candidate"
        break
    fi
done

# Try platform-specific binary
if [ -z "$BIN" ]; then
    OS=$(uname -s | tr '[:upper:]' '[:lower:]')
    ARCH=$(uname -m)
    case "$ARCH" in
        x86_64) ARCH="amd64" ;;
        aarch64|arm64) ARCH="arm64" ;;
    esac
    candidate="$SCRIPT_DIR/manty-blast-mail-${OS}-${ARCH}"
    if [ -x "$candidate" ]; then
        BIN="$candidate"
    fi
fi

if [ -z "$BIN" ]; then
    echo "Error: binary not found. Place the binary in $SCRIPT_DIR"
    exit 1
fi

if [ ! -f "$CONFIG_FILE" ]; then
    echo "Error: $CONFIG_FILE not found"
    exit 1
fi

nohup "$BIN" -config "$CONFIG_FILE" > "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"
echo "Started (PID: $(cat "$PID_FILE")), log: $LOG_FILE"
