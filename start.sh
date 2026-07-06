#!/bin/sh
# NEON ARENA - launcher lokalnego serwera (macOS / Linux)
cd "$(dirname "$0")" || exit 1
echo "============================================"
echo " NEON ARENA - lokalny serwer gry"
echo " Adres: http://localhost:8137"
echo " Ctrl+C aby wylaczyc serwer."
echo "============================================"
( sleep 1
  if command -v open >/dev/null 2>&1; then open "http://localhost:8137/index.html"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "http://localhost:8137/index.html"
  fi ) &
python3 -m http.server 8137
