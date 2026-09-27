#!/usr/bin/env python3
"""Indeed の求人別実績から CPA 等を算出し、セミナー用の集計表を出す。

使い方:
    python3 analyze_cpa.py <input.csv> [> out.md]

入力列（表示回数・クリック数・採用数は空欄可）:
    企業, 職種, エリア, 期間開始, 期間終了, 表示回数, クリック数, 応募数, 広告費, 採用数
"""
import csv
import sys
from collections import defaultdict

NUM = ("表示回数", "クリック数", "応募数", "広告費", "採用数")


def to_num(v):
    if v is None:
        return None
    v = v.strip().replace(",", "").replace("¥", "").replace("円", "")
    if v == "":
        return None
    try:
        return float(v)
    except ValueError:
        return None


def load(path):
    rows = []
    with open(path, encoding="utf-8-sig", newline="") as f:
        for i, raw in enumerate(csv.DictReader(f), start=2):
            r = {k: (raw.get(k) or "").strip() for k in ("企業", "職種", "エリア", "期間開始", "期間終了")}
            for k in NUM:
                r[k] = to_num(raw.get(k))
            if not r["企業"] and not r["職種"]:
                continue  # 空行
            if r["応募数"] is None or r["広告費"] is None:
                print(f"<!-- {i}行目: 応募数または広告費が空のため除外 ({r['企業']} / {r['職種']}) -->")
                continue
            rows.append(r)
    return rows


def rate(a, b):
    """a / b。分母が無い・0 のときは None。"""
    if a is None or b in (None, 0):
        return None
    return a / b


def fmt(v, unit="", digits=0):
    if v is None:
        return "—"
    if unit == "%":
        return f"{v * 100:.1f}%"
    if digits:
        return f"{v:,.{digits}f}{unit}"
    return f"{round(v):,}{unit}"


def metrics(bucket):
    """同じ括りの行をまとめて指標を出す。率は合計してから割る（加重平均）。"""
    s = {k: None for k in NUM}
    for k in NUM:
        vals = [r[k] for r in bucket if r[k] is not None]
        if vals:
            s[k] = sum(vals)
    return {
        "件数": len(bucket),
        "表示": s["表示回数"],
        "クリック": s["クリック数"],
        "応募": s["応募数"],
        "費用": s["広告費"],
        "採用": s["採用数"],
        "CTR": rate(s["クリック数"], s["表示回数"]),
        "CVR": rate(s["応募数"], s["クリック数"]),
        "CPC": rate(s["広告費"], s["クリック数"]),
        "CPA": rate(s["広告費"], s["応募数"]),
        "採用単価": rate(s["広告費"], s["採用数"]),
        "採用率": rate(s["採用数"], s["応募数"]),
    }


def table(title, groups, key_headers):
    print(f"\n### {title}\n")
    print("| " + " | ".join(key_headers) + " | 件数 | 表示 | クリック | 応募 | 広告費 | CTR | 応募率 | CPC | **CPA** | 採用 | 採用単価 |")
    print("|" + "---|" * (len(key_headers) + 11))
    for key, bucket in groups:
        m = metrics(bucket)
        keys = key if isinstance(key, tuple) else (key,)
        cells = [k or "（未記入）" for k in keys]
        print(
            "| " + " | ".join(cells) + " | "
            + " | ".join([
                str(m["件数"]),
                fmt(m["表示"]), fmt(m["クリック"]), fmt(m["応募"]),
                fmt(m["費用"], "円"),
                fmt(m["CTR"], "%"), fmt(m["CVR"], "%"),
                fmt(m["CPC"], "円"),
                "**" + fmt(m["CPA"], "円") + "**",
                fmt(m["採用"]), fmt(m["採用単価"], "円"),
            ]) + " |"
        )


def grouped(rows, keyfn):
    g = defaultdict(list)
    for r in rows:
        g[keyfn(r)].append(r)
    # CPA の高い順（費用がかかっている順）に並べる
    return sorted(g.items(), key=lambda kv: -(metrics(kv[1])["CPA"] or 0))


def spread(rows, keyfn, label):
    """同じ括りの中で CPA が何倍ひらいているかを出す（セミナーで一番効く数字）。"""
    out = []
    for key, bucket in grouped(rows, keyfn):
        cpas = [rate(r["広告費"], r["応募数"]) for r in bucket]
        cpas = [c for c in cpas if c]
        if len(cpas) >= 2:
            lo, hi = min(cpas), max(cpas)
            out.append((key, lo, hi, hi / lo, len(cpas)))
    if not out:
        return
    print(f"\n### {label}の中での CPA のひらき\n")
    print("| 括り | 求人数 | 最安 CPA | 最高 CPA | 倍率 |")
    print("|---|---|---|---|---|")
    for key, lo, hi, ratio, n in sorted(out, key=lambda x: -x[3]):
        keys = key if isinstance(key, tuple) else (key,)
        print(f"| {' / '.join(k or '（未記入）' for k in keys)} | {n} | {fmt(lo,'円')} | {fmt(hi,'円')} | **{ratio:.1f}倍** |")


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    rows = load(sys.argv[1])
    if not rows:
        sys.exit("有効な行がありません（応募数と広告費が必須）")

    print("# Indeed 実績集計\n")
    m = metrics(rows)
    print(f"対象 {m['件数']} 求人 / 応募 {fmt(m['応募'])} 件 / 広告費 {fmt(m['費用'],'円')}")
    print(f"\n**全体 CPA: {fmt(m['CPA'],'円')}**" + (f" / 採用単価: {fmt(m['採用単価'],'円')}" if m["採用単価"] else ""))

    table("企業別", grouped(rows, lambda r: r["企業"]), ["企業"])
    table("職種別", grouped(rows, lambda r: r["職種"]), ["職種"])
    table("エリア別", grouped(rows, lambda r: r["エリア"]), ["エリア"])
    table("職種 × エリア", grouped(rows, lambda r: (r["職種"], r["エリア"])), ["職種", "エリア"])
    table("企業 × 職種 × エリア（明細）", grouped(rows, lambda r: (r["企業"], r["職種"], r["エリア"])), ["企業", "職種", "エリア"])

    spread(rows, lambda r: r["職種"], "同一職種")
    spread(rows, lambda r: (r["職種"], r["エリア"]), "同一職種×同一エリア")

    print("\n---\n")
    print("_率は各括りの合計から算出（単純平均ではなく加重平均）。空欄の項目は — で表示。_")


if __name__ == "__main__":
    main()
