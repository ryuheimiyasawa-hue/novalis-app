#!/usr/bin/env python3
"""Indeed「求人・キャンペーン」レポート（複数アカウント）を集計して完全レポートを出す。

使い方: python3 analyze_indeed_campaigns.py <csv> [<csv> ...]

方針:
- CPA はファイルの「応募単価（CPA）」列を使わず、費用 ÷ 応募数 で自前計算する。
  ファイルの列は応募数0のとき0が入っており、費用が出ているのに「0円」に見えてしまう。
- 率は各括りの合計から算出（加重平均）。
- 参照番号で重複排除（同じ行が複数ファイルに入っていても二重計上しない）。
"""
import csv
import os
import re
import sys
from collections import defaultdict

MONTH_RE = re.compile(r"(\d{4})年(\d{1,2})月")


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
        city = tail if head == "東京" else f"{head}{tail}"
    return city or (pref or "").strip()


def month(v):
    m = MONTH_RE.search(v or "")
    return f"{m.group(1)}-{int(m.group(2)):02d}" if m else "（不明）"


def family(cat):
    """職種カテゴリを大分類にまとめる。"""
    c = cat or ""
    if "営業" in c and "営業事務" not in c:
        return "営業系"
    if any(k in c for k in ("事務", "経理", "総務", "受付", "秘書")):
        return "事務・バックオフィス系"
    if any(k in c for k in ("人事", "教育", "研修")):
        return "人事・採用系"
    if any(k in c for k in ("SE", "エンジニア", "デザイナー", "開発", "システム",
                            "プロジェクトマネージャー", "データ")):
        return "IT・クリエイティブ系"
    if any(k in c for k in ("マーケ", "広報", "広告", "企画", "Web", "PR")):
        return "マーケ・広報系"
    if any(k in c for k in ("販売", "フロア", "接客", "カスタマー", "コールセンター")):
        return "販売・CS系"
    return "その他"


def load(paths):
    rows, seen, dupes, per_file = [], set(), [], []
    for p in paths:
        n = 0
        for raw in csv.DictReader(open(p, encoding="utf-8-sig")):
            ref = (raw.get("参照番号") or "").strip()
            if not ref:
                continue
            n += 1
            if ref in seen:
                dupes.append(ref)
                continue
            seen.add(ref)
            cats = (raw.get("職種") or "").strip()
            cat = cats.split(",")[0].strip() or "（未設定）"
            rows.append({
                "file": os.path.basename(p),
                "co": (raw.get("企業名") or "").strip(),
                "job": (raw.get("求人") or "").strip().replace("\\|", "｜"),
                "camp": (raw.get("キャンペーン") or "").strip(),
                "pref": (raw.get("都道府県") or "").strip(),
                "city": norm_city(raw.get("都道府県"), raw.get("市区町村")),
                "cat": cat,
                "fam": family(cat),
                "status": (raw.get("求人のステータス") or "").strip(),
                "emp": (raw.get("雇用形態") or "").strip() or "（未設定）",
                "month": month(raw.get("作成日")),
                "imp": num(raw.get("表示回数")),
                "clk": num(raw.get("クリック数")),
                "start": num(raw.get("応募開始数")),
                "app": num(raw.get("応募数")),
                "cost": num(raw.get("費用")),
            })
        per_file.append((os.path.basename(p), n))
    return rows, dupes, per_file


def agg(b):
    s = {k: sum(r[k] for r in b) for k in ("imp", "clk", "start", "app", "cost")}
    d = lambda x, y: (x / y) if y else None
    return {"n": len(b), **s,
            "CTR": d(s["clk"], s["imp"]), "ASR": d(s["start"], s["clk"]),
            "COMP": d(s["app"], s["start"]), "CVR": d(s["app"], s["clk"]),
            "CPC": d(s["cost"], s["clk"]), "CPA": d(s["cost"], s["app"])}


def f(v, unit="", pct=False, dash="—"):
    if v is None:
        return dash
    return f"{v * 100:.1f}%" if pct else f"{round(v):,}{unit}"


HDR = "| 行数 | 表示 | クリック | CTR | 応募開始 | 応募 | 応募率 | 費用 | CPC | **CPA** |"


def cells(m):
    return " | ".join([str(m["n"]), f(m["imp"]), f(m["clk"]), f(m["CTR"], pct=True),
                       f(m["start"]), f(m["app"]), f(m["CVR"], pct=True),
                       f(m["cost"], "円"), f(m["CPC"], "円"),
                       "**" + f(m["CPA"], "円", dash="応募0") + "**"])


def table(title, groups, headers, note=None, total=None):
    print(f"\n### {title}\n")
    if note:
        print(f"{note}\n")
    print("| " + " | ".join(headers) + " " + HDR)
    print("|" + "---|" * (len(headers) + 10))
    for key, b in groups:
        keys = key if isinstance(key, tuple) else (key,)
        print("| " + " | ".join(str(k) if k else "（空欄）" for k in keys) + " | " + cells(agg(b)) + " |")
    if total is not None:
        m = agg(total)
        print("| " + " | ".join(["**合計**"] + ["" for _ in headers[1:]]) + " | " + cells(m) + " |")


def by(rows, keyfn, sort="cost", min_cost=None):
    g = defaultdict(list)
    for r in rows:
        g[keyfn(r)].append(r)
    items = list(g.items())
    if min_cost is not None:
        items = [(k, b) for k, b in items if sum(x["cost"] for x in b) >= min_cost]
    if sort == "cost":
        items.sort(key=lambda kv: -agg(kv[1])["cost"])
    elif sort == "cpa":
        items.sort(key=lambda kv: (agg(kv[1])["CPA"] is None, agg(kv[1])["CPA"] or 0))
    elif sort == "key":
        items.sort(key=lambda kv: kv[0])
    return items


def main():
    rows, dupes, per_file = load(sys.argv[1:])
    m = agg(rows)
    cost = m["cost"]

    print("# Indeed 実績 完全レポート（2026/03/01〜2026/09/28）\n")
    print("> **社内分析用。社名は実名。外部に出す際は「◯◯業・従業員◯名規模」に丸めること。**\n")

    # ───────── 0. 読み方
    print("## 0. 読み方と前提\n")
    print("- **1行 ＝ 1求人 × 1エリア × 1掲載期間**。同じ求人名が複数行に分かれる。")
    print("- **CPA は 費用 ÷ 応募数 を自前計算**している。レポートの「応募単価（CPA）」列は")
    print("  応募0のとき0と表示されるため、費用が出ているのに0円に見える。そのまま使うと")
    print("  無駄打ちが見えなくなるので使っていない。表では応募0の括りを「応募0」と表示する。")
    print("- **率はすべて加重平均**（各括りの合計を合計で割る）。行ごとの率の単純平均ではない。")
    print("- 「応募率」＝ 応募数 ÷ クリック数（CVR）。「CTR」＝ クリック数 ÷ 表示回数。")
    print("- ファネルは4段: **表示 → クリック → 応募開始 → 応募完了（＝応募数）**。")
    print("  Indeedは「応募開始」と「完了」を分けて出すので、フォーム離脱が測れる。")
    print("- 費用が少額の括りのCPAは不安定（応募1件でCPAが決まる）。**母数を必ず見ること**。")
    print("  比較の主役は §5（求人別）。母数を絞って見たいときは §8。")
    print("- 採用数はレポートに含まれないため、**採用単価は算出できない**。応募単価までが範囲。\n")

    # ───────── 1. データ概要
    print("## 1. データ概要\n")
    print("| ファイル | 行数 |")
    print("|---|---|")
    for name, n in per_file:
        print(f"| {name} | {n} |")
    print(f"| **合計（重複排除後）** | **{m['n']}** |")
    print(f"\n重複（同一参照番号）: **{len(dupes)}行**"
          + ("" if dupes else " → ファイル間の重複なし。4ファイルは別アカウントのエクスポート。"))
    print("\n企業名は1ファイルに複数含まれる（代理店アカウントに複数社が入っている）ため、"
          "以降の集計は**ファイル単位ではなく企業名単位**で行う。\n")
    print("| 企業 | 行数 | 含まれるファイル |")
    print("|---|---|---|")
    for co, b in by(rows, lambda r: r["co"]):
        files = sorted({r["file"].split("-", 1)[1] for r in b})
        print(f"| {co} | {len(b)} | {', '.join(files)} |")

    # ───────── 2. 全体
    print("\n## 2. 全体ファネル\n")
    print("| 段 | 数 | 前段からの転換率 |")
    print("|---|---|---|")
    print(f"| 表示回数 | {f(m['imp'])} | — |")
    print(f"| クリック数 | {f(m['clk'])} | {f(m['CTR'], pct=True)}（CTR） |")
    print(f"| 応募開始数 | {f(m['start'])} | {f(m['ASR'], pct=True)}（ASR） |")
    print(f"| **応募完了数** | **{f(m['app'])}** | {f(m['COMP'], pct=True)}（完了率） |")
    print(f"\n- 費用 **{f(cost,'円')}** ／ CPC **{f(m['CPC'],'円')}** ／ **CPA {f(m['CPA'],'円')}**")
    print(f"- クリック→応募（CVR）**{f(m['CVR'], pct=True)}**")
    print(f"- 表示→応募 は **{m['app']/m['imp']*100:.2f}%**（表示{round(m['imp']/m['app']):,}回で応募1件）")

    # ───────── 3〜 各集計
    table("3. 企業別", by(rows, lambda r: r["co"]), ["企業"], total=rows)
    table("4. 職種の大分類別（参考）", by(rows, lambda r: r["fam"]), ["大分類"],
          "**参考値。**Indeed の職種カテゴリ（先頭値）をさらにまとめたもので、丸めが二重に入っている。"
          "判断は §5 の求人別で行うこと。分類ルールはスクリプトの family() を参照。", total=rows)
    # 5. 求人別（CPA 安い順・全件）— カテゴリで丸めず、求人ごとに1行
    print("\n### 5. 求人別（CPA が安い順・全件）\n")
    print("**Indeed の「職種」カテゴリでは丸めていない。**1求人に複数カテゴリが付くうえ、")
    print("違う仕事が同じカテゴリに入ってしまうため、求人（掲載原稿）ごとに1行にしている。")
    print("同じ求人名を複数エリア・複数期間に出しているぶんはその求人の行としてまとめている。")
    print("応募0の求人は最下段。**応募数の少ない行のCPAは不安定なので応募数を併せて見ること。**\n")
    print("| 順 | **CPA** | 企業 | 求人名 | 応募 | 費用 | クリック | CPC | 応募率 | 表示 | CTR | 掲載行数 |")
    print("|---|---|---|---|---|---|---|---|---|---|---|---|")
    for i, ((co, job), b) in enumerate(by(rows, lambda r: (r["co"], r["job"]), sort="cpa"), 1):
        a = agg(b)
        print(f"| {i} | **{f(a['CPA'],'円',dash='応募0')}** | {co} | {job} | {f(a['app'])} | "
              f"{f(a['cost'],'円')} | {f(a['clk'])} | {f(a['CPC'],'円')} | {f(a['CVR'],pct=True)} | "
              f"{f(a['imp'])} | {f(a['CTR'],pct=True)} | {a['n']} |")
    mm = agg(rows)
    print(f"| | **{f(mm['CPA'],'円')}** | **全体** | | **{f(mm['app'])}** | **{f(mm['cost'],'円')}** | "
          f"**{f(mm['clk'])}** | **{f(mm['CPC'],'円')}** | **{f(mm['CVR'],pct=True)}** | "
          f"**{f(mm['imp'])}** | **{f(mm['CTR'],pct=True)}** | **{mm['n']}** |")

    table("6. 都道府県別", by(rows, lambda r: r["pref"]), ["都道府県"], total=rows)
    table("7. 市区町村別（費用が発生した全エリア）",
          by([r for r in rows if r["cost"] > 0], lambda r: (r["pref"], r["city"])), ["都道府県", "市区町村"])

    # ───────── 9. 母数を確保したCPAランキング
    solid = by(rows, lambda r: (r["co"], r["job"]), sort="cpa", min_cost=10000)
    print("\n### 8. 費用1万円以上を使った求人だけに絞った場合\n")
    print("§5 から費用1万円未満の求人を落としたもの。母数が確保された求人だけのCPAのひらきを見る。\n")
    print("| 順 | CPA | 企業 | 求人名 | 費用 | 応募 | クリック | CPC | 応募率 |")
    print("|---|---|---|---|---|---|---|---|---|")
    fin = []
    for i, ((co, job), b) in enumerate(solid, 1):
        a = agg(b)
        if a["CPA"]:
            fin.append(a["CPA"])
        print(f"| {i} | **{f(a['CPA'],'円',dash='応募0')}** | {co} | {job} | "
              f"{f(a['cost'],'円')} | {f(a['app'])} | {f(a['clk'])} | {f(a['CPC'],'円')} | {f(a['CVR'],pct=True)} |")
    print(f"\n→ 最安 **{f(min(fin),'円')}** ／ 最高 **{f(max(fin),'円')}** ／ "
          f"**{max(fin)/min(fin):.0f}倍のひらき**（対象 {len(solid)} 求人、うち応募0が {len(solid)-len(fin)} 件）")

    # ───────── 10. 同一求人のエリア差
    print("\n### 9. 同一求人の中で、エリアによって CPA がどれだけひらくか\n")
    print("同じ求人原稿を複数エリアに配信しているケース。原稿は同じなので、"
          "差は**エリア選定と配信の差**として読める。応募が出たエリアが2つ以上あるものだけ。\n")
    print("| 企業 | 求人名 | 配信エリア数 | 応募が出たエリア数 | 最安 CPA | 最高 CPA | 倍率 | 総費用 |")
    print("|---|---|---|---|---|---|---|---|")
    spread = []
    for (co, job), b in by(rows, lambda r: (r["co"], r["job"])):
        per = defaultdict(list)
        for r in b:
            per[r["city"]].append(r)
        cp = [agg(v)["CPA"] for v in per.values() if agg(v)["CPA"]]
        if len(cp) >= 2:
            spread.append((co, job, len(per), len(cp), min(cp), max(cp), max(cp) / min(cp),
                           sum(r["cost"] for r in b)))
    for co, job, nl, nc, lo, hi, ratio, tc in sorted(spread, key=lambda x: -x[6]):
        print(f"| {co} | {job} | {nl} | {nc} | {f(lo,'円')} | {f(hi,'円')} | **{ratio:.1f}倍** | {f(tc,'円')} |")

    # ───────── 11. 無駄打ち
    waste = [r for r in rows if r["app"] == 0 and r["cost"] > 0]
    wc = sum(r["cost"] for r in waste)
    print(f"\n### 10. 応募0のまま費用が出た行\n")
    print(f"**{len(waste)}行 / {f(wc,'円')} ＝ 全費用の {wc/cost*100:.1f}%**\n")
    tot = defaultdict(float)
    for r in rows:
        tot[r["co"]] += r["cost"]
    wg, wn, wclk = defaultdict(float), defaultdict(int), defaultdict(float)
    for r in waste:
        wg[r["co"]] += r["cost"]
        wn[r["co"]] += 1
        wclk[r["co"]] += r["clk"]
    print("| 企業 | 応募0の行数 | 消えた費用 | その企業の全費用比 | 無駄になったクリック |")
    print("|---|---|---|---|---|")
    for co, c in sorted(wg.items(), key=lambda kv: -kv[1]):
        print(f"| {co} | {wn[co]} | {f(c,'円')} | {c/tot[co]*100:.1f}% | {f(wclk[co])} |")
    print(f"| **合計** | **{len(waste)}** | **{f(wc,'円')}** | **{wc/cost*100:.1f}%** | "
          f"**{f(sum(r['clk'] for r in waste))}** |")
    print("\n応募0で費用が5,000円以上出た行（金額降順）:\n")
    print("| 企業 | 求人名 | エリア | 作成月 | 表示 | クリック | CPC | 費用 |")
    print("|---|---|---|---|---|---|---|---|")
    for r in sorted([r for r in waste if r["cost"] >= 5000], key=lambda r: -r["cost"]):
        cpc = r["cost"] / r["clk"] if r["clk"] else None
        print(f"| {r['co']} | {r['job']} | {r['city']} | {r['month']} | {f(r['imp'])} | "
              f"{f(r['clk'])} | {f(cpc,'円')} | {f(r['cost'],'円')} |")

    # ───────── 12. フォーム離脱
    print("\n### 11. 応募フォームの離脱（応募開始したのに完了していない）\n")
    print("| 企業 | 応募開始 | 応募完了 | 完了率 | 離脱人数 |")
    print("|---|---|---|---|---|")
    for co, b in by(rows, lambda r: r["co"]):
        a = agg(b)
        if a["start"]:
            print(f"| {co} | {f(a['start'])} | {f(a['app'])} | {f(a['COMP'],pct=True)} | {f(a['start']-a['app'])} |")
    print(f"| **全体** | **{f(m['start'])}** | **{f(m['app'])}** | **{f(m['COMP'],pct=True)}** | "
          f"**{f(m['start']-m['app'])}** |")
    print("\n離脱が5人以上出ている求人（離脱人数の多い順）:\n")
    print("| 企業 | 求人名 | 応募開始 | 応募完了 | 完了率 | 離脱 |")
    print("|---|---|---|---|---|---|")
    leak = []
    for (co, job), b in by(rows, lambda r: (r["co"], r["job"])):
        a = agg(b)
        if a["start"] - a["app"] >= 5:
            leak.append((co, job, a))
    for co, job, a in sorted(leak, key=lambda x: -(x[2]["start"] - x[2]["app"])):
        print(f"| {co} | {job} | {f(a['start'])} | {f(a['app'])} | {f(a['COMP'],pct=True)} | "
              f"**{f(a['start']-a['app'])}** |")

    table("12. 求人作成月別", by(rows, lambda r: r["month"], sort="key"), ["作成月"],
          "行の「作成日」ベース。掲載開始のタイミングを表すもので、費用の発生月とは厳密には一致しない。",
          total=rows)
    table("13. 雇用形態別", by(rows, lambda r: r["emp"]), ["雇用形態"], total=rows)
    table("14. 掲載ステータス別", by(rows, lambda r: r["status"]), ["ステータス"], total=rows)

    # ───────── 16. 注意点
    print("\n## 15. この数字を扱うときの注意\n")
    print("1. **掲載期間の長さが行ごとに違う**。1日だけ配信した行と2ヶ月配信した行が同じ1行として並ぶ。")
    print("   月次の正確な推移を出すには、期間で按分したデータが別途必要。")
    print("2. **応募の質は測れていない**。CPAが安い＝良いとは限らない。面接実施率・採用数が無いため、")
    print("   「安いが誰も面接に来ない求人」と「高いが決まる求人」を区別できない。")
    print("3. **母数が小さい括りを傾向として語らない**。応募が数件の括りはCPAが跳ねる。")
    print("4. **職種カテゴリは先頭値のみ採用**。1求人に3カテゴリ付いている行が多く、")
    print("   カテゴリ別集計は目安。求人別（§8, §9）のほうが実態に近い。")
    print("5. **CPAは自前計算**。レポートのCPA列と一致しない箇所があるのは意図的（§0参照）。")


if __name__ == "__main__":
    main()
