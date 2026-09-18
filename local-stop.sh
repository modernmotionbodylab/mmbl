#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
venv_python="$project_root/.venv/bin/python"
if [[ ! -x "$venv_python" ]]; then
  if [[ -f "$project_root/.local/server.json" ]]; then
    echo 'The virtual environment is missing. Restore it with ./local-start.sh before stopping the recorded server.' >&2
    exit 1
  fi
  echo 'No local Python server is running.'
  exit 0
fi
exec "$venv_python" "$project_root/scripts/local_server.py" stop
