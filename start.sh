#!/bin/bash
cd "$(dirname "$0")"

cleanup() {
  echo "Shutting down..."
  kill $CLIENT_PID $SERVER_PID 2>/dev/null
  wait $CLIENT_PID $SERVER_PID 2>/dev/null
  exit 0
}

trap cleanup INT TERM

npm run dev:server &
SERVER_PID=$!

npm run dev:client &
CLIENT_PID=$!

sleep 2
open http://localhost:5173

echo "Vitality Tracker running — press Ctrl+C to stop"
wait
