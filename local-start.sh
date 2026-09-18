#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
venv_python="$project_root/.venv/bin/python"

if [[ ! -x "$venv_python" ]]; then
  python_command=""
  for candidate in python3 python; do
    if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' >/dev/null 2>&1; then
      python_command="$candidate"
      break
    fi
  done
  if [[ -z "$python_command" ]]; then
    echo 'Install Python 3.9 or newer, then run ./local-start.sh again.' >&2
    exit 1
  fi
  echo 'Creating .venv...'
  "$python_command" -m venv "$project_root/.venv"
fi

if [[ ! -f "$project_root/.env" ]]; then
  cp "$project_root/.env.example" "$project_root/.env"
fi
echo 'Installing local requirements...'
"$venv_python" -m pip install --disable-pip-version-check -r "$project_root/requirements.txt"
exec "$venv_python" "$project_root/scripts/local_server.py" start "$@"
