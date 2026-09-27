#!/usr/bin/env python3
"""Indeed「求人・キャンペーン」レポート（複数アカウント）を集計して CPA を出す。

使い方: python3 analyze_indeed_campaigns.py <csv> [<csv> ...]

方針:
- CPA はファイルの「応募単価（CPA）」列を使わず、費用 ÷ 応募数 で自前計算する。
  ファイルの列は応募数0のとき0が入っており、費用が出ているのに「0円」に見えてしまう。
- 率は各括りの合計から算出（加重平均）。
- 参照番号で重複排除（同じ行が複数ファイルに入っていても二重計上しない）。
"""
import csv
import sys
from collections import defaultdict

COLS = {
    "job": "求人", "camp": "キャンペーン", "pref": "都道府県", "city": "市区町村",
    "co": "企業名", "ref": "参照番号", "created": "作成日",
    "imp": "表示回数", "clk": "クリック数", "asr_n": "応募開始数",
    "app": "応募数", "cost": "費用", "cat": "職種", "status": "求人のステータス",
}


def num(v):
    if not v:
        return 0.0
    v = v.strip().replace(",", "").replace("￥", "").replace("¥", "")
    try:
        return float(v)
    except ValueError:
        return 0.0


def norm_city(pref, city):
    """「東京, 渋谷区」→「渋谷区」、「札幌市, 中央区」→「札幌市中央区」。"""
    city = (city or "").strip()
    if "," in city:
        head, tail = [p.strip() for p in city.split(",", 1)]
        city = tail if head in ("東京",) else f"{head}{tail}"
    return city or (pref or "").strip()


def load(paths):
    rows, seen, dupes = [], set(), 0
    for p in paths:
        with open(p, encoding="utf-8-sig", newline="") as f:
            for raw in csv.DictReader(f):
                ref = (raw.get(COLS["ref"]) or "").strip()
                if not ref:
                    continue
                if ref in seen:
                    dupes += 1
                    continue
                seen.add(ref)
                cats = (raw.get(COLS["cat"]) or "").strip()
                rows.append({
                    "co": (raw.get(COLS["co"]) or "").strip(),
                    "job": (raw.get(COLS["job"]) or "").strip().replace("\\|", "｜"),
                    "camp": (raw.get(COLS["camp"]) or "").strip(),
                    "pref": (raw.get(COLS["pref"]) or "").strip(),
                    "city": norm_city(raw.get(COLS["pref"]), raw.get(COLS["city"])),
                    "cat": cats.split(",")[0].strip() or "（未設定）",
                    "status": (raw.get(COLS["status"]) or "").strip(),
                    "created": (raw.get(COLS["created"]) or "").strip(),
                    "imp": num(raw.get(COLS["imp"])),
                    "clk": num(raw.get(COLS["clk"])),
                    "start": num(raw.get(COLS["asr_n"])),
                    "app": num(raw.get(COLS["app"])),
                    "cost": num(raw.get(COLS["cost"])),
                })
    return rows, dupes


def agg(bucket):
    s = {k: sum(r[k] for r in bucket) for k in ("imp", "clk", "start", "app", "cost")}
    d = lambda a, b: (a / b) if b else None
    return {
        "n": len(bucket), **s,
        "CTR": d(s["clk"], s["imp"]),
        "ASR": d(s["start"], s["clk"]),
        "COMP": d(s["app"], s["start"]),
        "CVR": d(s["app"], s["clk"]),
        "CPC": d(s["cost"], s["clk"]),
        "CPA": d(s["cost"], s["app"]),
    }


def f(v, unit="", pct=False):
    if v is None:
        return "—"
    if pct:
        return f"{v * 100:.1f}%"
    return f"{round(v):,}{unit}"


def table(title, groups, headers, note=""):
    print(f"\n### {title}\n")
    if note:
        print(f"{note}\n")
    print("| " + " | ".join(headers) + " | 求人数 | 表示 | クリック | CTR | 応募開始 | 応募 | 応募率 | 費用 | CPC | **CPA** |")
    print("|" + "---|" * (len(headers) + 11))
    for key, b in groups:
        m = agg(b)
        keys = key if isinstance(key, tuple) else (key,)
        print("| " + " | ".join(k or "（空欄）" for k in keys) + " | " + " | ".join([
            str(m["n"]), f(m["imp"]), f(m["clk"]), f(m["CTR"], pct=True),
            f(m["start"]), f(m["app"]), f(m["CVR"], pct=True),
            f(m["cost"], "円"), f(m["CPC"], "円"), "**" + f(m["CPA"], "円") + "**",
        ]) + " |")


def by(rows, keyfn, min_cost=0):
    g = defaultdict(list)
    for r in rows:
        g[keyfn(r)].append(r)
    out = [(k, b) for k, b in g.items() if sum(x["cost"] for x in b) >= min_cost]
    return sorted(out, key=lambda kv: -agg(kv[1])["cost"])


def main():
    rows, dupes = load(sys.argv[1:])
    m = agg(rows)

    print("# Indeed 実績分析（2026/03/01〜2026/09/28）\n")
    print(f"対象 {m['n']:,} 行（求人×エリア×掲載期間）／重複排除 {dupes} 行\n")
    print("## 全体\n")
    print(f"- 表示 **{f(m['imp'])}** → クリック **{f(m['clk'])}**（CTR {f(m['CTR'], pct=True)}）"
          f" → 応募開始 **{f(m['start'])}**（{f(m['ASR'], pct=True)}）"
          f" → 応募完了 **{f(m['app'])}**（完了率 {f(m['COMP'], pct=True)}）")
    print(f"- 費用 **{f(m['cost'], '円')}** ／ CPC **{f(m['CPC'], '円')}** ／ **CPA {f(m['CPA'], '円')}**")
    print(f"- クリック→応募（CVR）**{f(m['CVR'], pct=True)}**")

    # 応募0で費用が出ている行 = 明確な無駄打ち
    waste = [r for r in rows if r["app"] == 0 and r["cost"] > 0]
    wc = sum(r["cost"] for r in waste)
    print(f"\n## 応募0円獲得（費用が出て応募が1件も無い行）\n")
    print(f"- **{len(waste)} 行 / {f(wc,'円')}**（全費用の **{wc / m['cost'] * 100:.1f}%**）")
    wg = defaultdict(float)
    wn = defaultdict(int)
    for r in waste:
        wg[r["co"]] += r["cost"]
        wn[r["co"]] += 1
    print("\n| 企業 | 応募0の行数 | 消えた費用 | その企業の全費用に対する比率 |")
    print("|---|---|---|---|")
    tot = defaultdict(float)
    for r in rows:
        tot[r["co"]] += r["cost"]
    for co, c in sorted(wg.items(), key=lambda kv: -kv[1]):
        print(f"| {co} | {wn[co]} | {f(c,'円')} | {c / tot[co] * 100:.1f}% |")

    table("企業別", by(rows, lambda r: r["co"]), ["企業"])
    table("職種カテゴリ別（費用5,000円以上）", by(rows, lambda r: r["cat"], 5000), ["職種カテゴリ"])
    table("都道府県別", by(rows, lambda r: r["pref"]), ["都道府県"])
    table("求人別（費用上位20件）", by(rows, lambda r: (r["co"], r["job"]))[:20], ["企業", "求人名"])

    # 同一求人がエリアをまたぐときの CPA のひらき
    print("\n### 同一求人の中で、エリアによって CPA がどれだけひらくか\n")
    print("（同じ求人原稿を複数エリアに出しているケース。応募が出たエリアが2つ以上あるもの）\n")
    print("| 企業 | 求人名 | エリア数 | 応募が出たエリア | 最安 CPA | 最高 CPA | 倍率 |")
    print("|---|---|---|---|---|---|---|")
    spread = []
    for (co, job), b in by(rows, lambda r: (r["co"], r["job"])):
        per = defaultdict(list)
        for r in b:
            per[r["city"]].append(r)
        cpas = []
        for city, rs in per.items():
            a = agg(rs)
            if a["CPA"]:
                cpas.append(a["CPA"])
        if len(cpas) >= 2:
            spread.append((co, job, len(per), len(cpas), min(cpas), max(cpas), max(cpas) / min(cpas)))
    for co, job, nloc, nc, lo, hi, ratio in sorted(spread, key=lambda x: -x[6])[:15]:
        print(f"| {co} | {job[:34]} | {nloc} | {nc} | {f(lo,'円')} | {f(hi,'円')} | **{ratio:.1f}倍** |")

    # 応募フォームの離脱
    print("\n### 応募フォームの離脱（応募開始したのに完了していない）\n")
    print("| 企業 | 応募開始 | 応募完了 | 完了率 | 離脱した人数 |")
    print("|---|---|---|---|---|")
    for co, b in by(rows, lambda r: r["co"]):
        a = agg(b)
        if a["start"]:
            print(f"| {co} | {f(a['start'])} | {f(a['app'])} | {f(a['COMP'], pct=True)} | {f(a['start'] - a['app'])} |")
    a = agg(rows)
    print(f"| **全体** | **{f(a['start'])}** | **{f(a['app'])}** | **{f(a['COMP'], pct=True)}** | **{f(a['start']-a['app'])}** |")

    print("\n---\n")
    print("_CPA は 費用÷応募数 で自前計算（レポートの CPA 列は応募0のとき0と表示されるため使用せず）。_")
    print("_率は各括りの合計から算出した加重平均。1行＝1求人×1エリア×1掲載期間。_")


if __name__ == "__main__":
    main()
