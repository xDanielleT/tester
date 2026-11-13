#!/bin/bash
# Mac launcher: double-click in Finder.
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed yet. Get the LTS version from https://nodejs.org"
  read -n 1 -s -r -p "Press any key to close"
  exit 1
fi
node server.js --open
