#!/usr/bin/env python3
"""Embed site/ into the Worker and stage hosting config + D1 migrations under dist/.

    python3 scripts/build_sites_worker.py
"""
from __future__ import annotations

import base64
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"


def main() -> None:
    assets: dict[str, str] = {}
    for path in sorted(SITE.rglob("*")):
        if path.is_file():
            assets["/" + path.relative_to(SITE).as_posix()] = base64.b64encode(path.read_bytes()).decode("ascii")
    template = (ROOT / "worker/index.js").read_text(encoding="utf-8")
    if "__ASSET_MAP__" not in template:
        raise SystemExit("worker/index.js must contain the __ASSET_MAP__ placeholder")
    output = ROOT / "dist/server/index.js"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(template.replace("__ASSET_MAP__", json.dumps(assets, separators=(",", ":")), 1), encoding="utf-8")
    hosting = json.loads((ROOT / ".openai/hosting.json").read_text(encoding="utf-8"))
    (ROOT / "dist/.openai").mkdir(parents=True, exist_ok=True)
    (ROOT / "dist/.openai/hosting.json").write_text(json.dumps(hosting, indent=2), encoding="utf-8")
    drizzle = ROOT / "dist/.openai/drizzle"
    drizzle.mkdir(parents=True, exist_ok=True)
    for migration in sorted((ROOT / "drizzle").glob("*.sql")):
        (drizzle / migration.name).write_bytes(migration.read_bytes())
    print(f"Built Worker with {len(assets)} embedded assets → {output.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
