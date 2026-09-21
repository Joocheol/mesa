"""Static checks for site/: links resolve, ids are unique, data hash matches metadata,
the split is chronological, and every page in the course map exists.

    python3 -m unittest discover -s tests -v
"""
from __future__ import annotations

import hashlib
import json
import re
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"


class Collector(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[str] = []
        self.ids: list[str] = []
        self.scripts: list[str] = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ("a", "link") and a.get("href"):
            self.links.append(a["href"])
        if tag == "script" and a.get("src"):
            self.scripts.append(a["src"])
        if a.get("id"):
            self.ids.append(a["id"])


def parse(path: Path) -> Collector:
    c = Collector()
    c.feed(path.read_text(encoding="utf-8"))
    return c


class StaticSiteTests(unittest.TestCase):
    pages = sorted(SITE.glob("*.html"))

    def test_pages_exist(self):
        self.assertGreaterEqual(len(self.pages), 15)

    def test_local_links_and_scripts_resolve(self):
        for page in self.pages:
            c = parse(page)
            for href in c.links + c.scripts:
                if href.startswith(("http", "mailto:", "#", "data:")):
                    continue
                target = (page.parent / href.split("#")[0].split("?")[0]).resolve()
                self.assertTrue(target.exists(), f"{page.name}: {href} missing")

    def test_ids_unique_per_page(self):
        for page in self.pages:
            ids = parse(page).ids
            self.assertEqual(len(ids), len(set(ids)), f"{page.name}: duplicate ids {sorted(set(i for i in ids if ids.count(i) > 1))}")

    def test_js_imports_resolve(self):
        for js in (SITE / "assets/js").rglob("*.js"):
            for m in re.finditer(r'from\s+"(\.[^"]+)"', js.read_text(encoding="utf-8")):
                target = (js.parent / m.group(1)).resolve()
                self.assertTrue(target.exists(), f"{js.relative_to(SITE)}: import {m.group(1)} missing")

    def test_course_map_pages_exist(self):
        pages_js = (SITE / "assets/js/pages.js").read_text(encoding="utf-8")
        files = re.findall(r'file:\s*"([^"]+)"', pages_js)
        self.assertGreaterEqual(len(files), 12)
        for f in files:
            self.assertTrue((SITE / f).exists(), f)
            body = (SITE / f).read_text(encoding="utf-8")
            self.assertIn("data-page-head", body, f"{f} lacks activity head")
            self.assertIn("data-page-nav", body, f"{f} lacks nav")

    def test_csv_hash_matches_metadata_and_is_chronological(self):
        csv = SITE / "assets/data/sk-hynix-000660-daily.csv"
        meta = json.loads((SITE / "assets/data/sk-hynix-000660-metadata.json").read_text(encoding="utf-8"))
        self.assertEqual(hashlib.sha256(csv.read_bytes()).hexdigest(), meta["csv_sha256"])
        rows = csv.read_text(encoding="utf-8").strip().splitlines()
        self.assertEqual(rows[0], "date,open,high,low,close,volume")
        dates = [r.split(",")[0] for r in rows[1:]]
        self.assertEqual(dates, sorted(dates))
        self.assertEqual(len(dates), len(set(dates)))
        self.assertEqual(len(dates), meta["observations"])
        self.assertTrue(all(float(r.split(",")[4]) > 0 for r in rows[1:]))

    def test_llm_response_bank_is_well_formed(self):
        bank = json.loads((SITE / "assets/data/llm-responses.json").read_text(encoding="utf-8"))
        self.assertIn("사전 생성", bank["note"])
        for role, by_news in bank["responses"].items():
            for news, responses in by_news.items():
                self.assertEqual(len(responses), 4, f"{role}/{news}")
                for r in responses:
                    self.assertIn(r["action"], ("buy", "sell", "hold"))
                    if r["action"] == "hold":
                        self.assertIsNone(r["limit_price"])
                    else:
                        self.assertIsInstance(r["limit_price"], int)
                        self.assertGreater(r["limit_price"], 0)
                    self.assertTrue(r["reason"].strip())

    def test_worker_has_asset_placeholder_and_no_secrets(self):
        worker = (ROOT / "worker/index.js").read_text(encoding="utf-8")
        self.assertIn("__ASSET_MAP__", worker)
        self.assertNotRegex(worker, r"INSTRUCTOR_PASSWORD_HASH\s*=\s*\"[0-9a-f]{64}\"")

    def test_sealed_window_not_referenced_before_round3(self):
        # Only rounds.js (round3 branch), round.js (team exam) may call sealed().
        for js in (SITE / "assets/js").rglob("*.js"):
            text = js.read_text(encoding="utf-8")
            if "sealed()" in text:
                self.assertIn(js.name, ("rounds.js", "round.js", "data.js"), f"{js.name} touches the sealed window")


if __name__ == "__main__":
    unittest.main()
