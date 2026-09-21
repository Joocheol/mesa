#!/usr/bin/env python3
"""Turn a Yahoo Finance (or any date/close) CSV into the workshop's data snapshot.

    python3 scripts/prepare_snapshot.py ~/Downloads/^KS200.csv \
        --name kospi200 --instrument "KOSPI 200 지수" --symbol "^KS200" \
        --source "Yahoo Finance" --source-url "https://finance.yahoo.com/quote/%5EKS200/history/" \
        --price adj_close --activate

Writes site/assets/data/<name>-daily.csv (date,close), <name>-metadata.json (with SHA-256)
and, with --activate, points site/assets/data/dataset.json at the new files.
Validation failures stop the build: nothing is silently sorted, filled or dropped.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "site/assets/data"


def pick(header: list[str], *names: str) -> int:
    lowered = [h.strip().lower() for h in header]
    for n in names:
        if n in lowered:
            return lowered.index(n)
    raise SystemExit(f"열을 찾을 수 없습니다: {names} (있는 열: {header})")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source_csv", type=Path)
    ap.add_argument("--name", required=True, help="파일 이름 접두어, 예: kospi200")
    ap.add_argument("--instrument", required=True)
    ap.add_argument("--symbol", default="")
    ap.add_argument("--market", default="KRX")
    ap.add_argument("--currency", default="KRW")
    ap.add_argument("--source", default="Yahoo Finance")
    ap.add_argument("--source-url", default="")
    ap.add_argument("--price", choices=["close", "adj_close"], default="adj_close", help="Yahoo의 Close 또는 Adj Close")
    ap.add_argument("--acquired", default=date.today().isoformat())
    ap.add_argument("--activate", action="store_true", help="dataset.json을 이 스냅샷으로 바꾼다")
    args = ap.parse_args()

    with args.source_csv.open(encoding="utf-8-sig", newline="") as fh:
        reader = csv.reader(fh)
        header = next(reader)
        i_date = pick(header, "date")
        i_close = pick(header, "adj close", "adj_close", "close") if args.price == "adj_close" else pick(header, "close")
        rows: list[tuple[str, float]] = []
        skipped = 0
        for line in reader:
            if not line or len(line) <= max(i_date, i_close):
                continue
            raw_date, raw_close = line[i_date].strip(), line[i_close].strip()
            if raw_close in ("", "null", "NaN"):
                skipped += 1  # Yahoo emits null rows on holidays for some indices
                continue
            d = datetime.strptime(raw_date[:10], "%Y-%m-%d").date().isoformat()
            close = float(raw_close)
            if close <= 0:
                raise SystemExit(f"0 이하 가격: {raw_date} {raw_close}")
            rows.append((d, close))

    if len(rows) < 300:
        raise SystemExit(f"관측값이 너무 적습니다: {len(rows)} (최소 300일 권장)")
    dates = [r[0] for r in rows]
    if dates != sorted(dates):
        raise SystemExit("날짜가 오름차순이 아닙니다. 원본을 확인하세요 (자동 정렬하지 않습니다).")
    if len(dates) != len(set(dates)):
        raise SystemExit("중복 날짜가 있습니다.")

    DATA.mkdir(parents=True, exist_ok=True)
    csv_path = DATA / f"{args.name}-daily.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["date", "close"])
        for d, c in rows:
            w.writerow([d, f"{c:.4f}".rstrip("0").rstrip(".")])
    sha = hashlib.sha256(csv_path.read_bytes()).hexdigest()
    meta = {
        "instrument": args.instrument,
        "symbol": args.symbol,
        "market": args.market,
        "currency": args.currency,
        "frequency": "daily",
        "price_definition": "수정 종가 (Adj Close)" if args.price == "adj_close" else "종가 (Close)",
        "source_name": args.source,
        "source_url": args.source_url,
        "acquired_at": args.acquired,
        "observation_start": dates[0],
        "observation_end": dates[-1],
        "observations": len(rows),
        "skipped_null_rows": skipped,
        "source_csv_sha256": hashlib.sha256(args.source_csv.read_bytes()).hexdigest(),
        "csv_sha256": sha,
        "transformations": f"{args.source_csv.name}에서 date와 {'Adj Close' if args.price == 'adj_close' else 'Close'} 열만 추출, null 행 {skipped}개 제외, 소수 4자리 반올림",
        "usage_note": "교육용 고정 스냅샷. 재배포·상업적 이용은 원 출처 이용조건을 별도 확인하세요.",
    }
    meta_path = DATA / f"{args.name}-metadata.json"
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{csv_path.relative_to(ROOT)}: {len(rows)}행 {dates[0]}~{dates[-1]} sha256 {sha[:12]}… (null {skipped}행 제외)")
    if args.activate:
        (DATA / "dataset.json").write_text(json.dumps({"csv": csv_path.name, "metadata": meta_path.name}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("dataset.json을 갱신했습니다. `npm test`로 해시·순서 검사를 통과하는지 확인하세요.")


if __name__ == "__main__":
    main()
