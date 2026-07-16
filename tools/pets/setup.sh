#!/usr/bin/env sh
set -eu

tools_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repository_root=$(CDPATH= cd -- "$tools_root/../.." && pwd)
environment_path=${1:-"$repository_root/.venv-pets"}

if [ ! -x "$environment_path/bin/python" ]; then
  python3 -m venv "$environment_path"
fi

"$environment_path/bin/python" -m pip install --disable-pip-version-check --requirement "$tools_root/requirements-lock.txt"
"$environment_path/bin/python" -c "import cv2, jsonschema, numpy, PIL, pytest; print('Pet pipeline environment ready')"
printf 'Environment: %s\n' "$environment_path"
printf 'Pip cache: %s\n' "$("$environment_path/bin/python" -m pip cache dir)"
