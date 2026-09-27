#!/data/data/com.termux/files/usr/bin/sh
# Omni IDE launcher for Termux
# Usage: ./omni-ide.sh [port]
PORT="${1:-8080}"
cd "$(dirname "$0")" || exit 1
[ -d node_modules ] || npm install
echo "Omni IDE -> http://127.0.0.1:$PORT"
exec env PORT="$PORT" node server/index.js
