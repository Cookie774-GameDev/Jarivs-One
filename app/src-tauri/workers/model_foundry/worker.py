"""VibeSpace Model Foundry local training worker.

This source is embedded in the signed desktop application and copied into the
private app-data runtime only after an explicit user action. It never performs
cloud execution or uploads.
"""

from __future__ import annotations

import argparse
import json
import sys

PROTOCOL = 1
LOCAL_ONLY = True


def probe() -> int:
    """Report installed training libraries without installing or downloading."""
    packages: dict[str, str | None] = {}
    for name in ("torch", "transformers", "datasets", "accelerate", "peft", "trl"):
        try:
            module = __import__(name)
            packages[name] = str(getattr(module, "__version__", "unknown"))
        except Exception:
            packages[name] = None
    ready = all(packages.values())
    print(
        json.dumps(
            {
                "protocol": PROTOCOL,
                "localOnly": LOCAL_ONLY,
                "ready": ready,
                "packages": packages,
                "reason": None
                if ready
                else "Verified local training libraries are incomplete; cloud execution is disabled.",
            },
            separators=(",", ":"),
        )
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("command", choices=("probe",))
    args = parser.parse_args()
    if args.command == "probe":
        return probe()
    return 2


if __name__ == "__main__":
    sys.exit(main())
