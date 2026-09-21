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
        self.canvases: list[dict[str, str]] = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ("a", "link") and a.get("href"):
            self.links.append(a["href"])
        if tag == "script" and a.get("src"):
            self.scripts.append(a["src"])
        if a.get("id"):
            self.ids.append(a["id"])
        if tag == "canvas":
            self.canvases.append(a)


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

    def test_canvas_and_keyboard_accessibility_hooks(self):
        for page in self.pages:
            for canvas in parse(page).canvases:
                self.assertEqual(canvas.get("role"), "img", f"{page.name}: canvas lacks role=img")
                self.assertTrue(canvas.get("aria-label"), f"{page.name}: canvas lacks aria-label")
        css = (SITE / "assets/styles.css").read_text(encoding="utf-8")
        self.assertIn(":focus-visible", css)
        self.assertIn("prefers-reduced-motion", css)
        ui = (SITE / "assets/js/ui.js").read_text(encoding="utf-8")
        self.assertIn("labelUnnamedControls", ui)

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

    def test_beginner_guide_and_activity_notes_cover_course(self):
        guide = SITE / "guide.html"
        self.assertTrue(guide.exists())
        ids = set(parse(guide).ids)
        required = {
            "simulation", "randomness", "monte-carlo", "probability",
            "distribution", "returns", "validation", "diagnostics",
            "models", "market", "abm", "llm", "reading-results", "mistakes",
        }
        self.assertTrue(required.issubset(ids), f"guide missing anchors: {sorted(required - ids)}")

        pages_js = (SITE / "assets/js/pages.js").read_text(encoding="utf-8")
        pages_block = pages_js.split("export const PAGES =", 1)[1].split("export const SCHEDULE =", 1)[0]
        activity_ids = set(re.findall(r'\{ id:\s*"([^"]+)"', pages_block))
        notes_block = pages_js.split("export const BEGINNER_NOTES =", 1)[1]
        note_ids = set(re.findall(r"^  ([a-z0-9]+): \{", notes_block, re.MULTILINE))
        self.assertEqual(activity_ids, note_ids, "every activity needs a beginner note")

        ui = (SITE / "assets/js/ui.js").read_text(encoding="utf-8")
        self.assertIn('href="guide.html#${anchor}"', ui)

    def test_facilitator_and_projector_surfaces_exist(self):
        facilitator = (SITE / "facilitate.html").read_text(encoding="utf-8")
        projector = (SITE / "present.html").read_text(encoding="utf-8")
        self.assertIn("강사 노트북 전용", facilitator)
        self.assertIn("assets/js/pages/facilitate.js", facilitator)
        self.assertIn("activity-frame", projector)
        self.assertIn("assets/js/pages/present.js", projector)
        worker = (ROOT / "worker/index.js").read_text(encoding="utf-8")
        self.assertIn('path === "/api/presentation"', worker)
        self.assertIn('path === "/api/presence"', worker)

    def test_csv_hash_matches_metadata_and_is_chronological(self):
        dataset = json.loads((SITE / "assets/data/dataset.json").read_text(encoding="utf-8"))
        csv = SITE / "assets/data" / dataset["csv"]
        meta = json.loads((SITE / "assets/data" / dataset["metadata"]).read_text(encoding="utf-8"))
        self.assertEqual(hashlib.sha256(csv.read_bytes()).hexdigest(), meta["csv_sha256"])
        rows = csv.read_text(encoding="utf-8").strip().splitlines()
        header = [h.lower() for h in rows[0].split(",")]
        self.assertIn("date", header)
        self.assertIn("close", header)
        i_close = header.index("close")
        dates = [r.split(",")[0] for r in rows[1:]]
        self.assertEqual(dates, sorted(dates))
        self.assertEqual(len(dates), len(set(dates)))
        self.assertEqual(len(dates), meta["observations"])
        self.assertTrue(all(float(r.split(",")[i_close]) > 0 for r in rows[1:]))

    def test_llm_response_bank_is_well_formed(self):
        bank = json.loads((SITE / "assets/data/llm-responses.json").read_text(encoding="utf-8"))
        self.assertIn("강사가 작성한 가상 예시", bank["note"])
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
