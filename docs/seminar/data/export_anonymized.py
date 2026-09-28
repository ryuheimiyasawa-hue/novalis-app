#!/usr/bin/env python3
"""Indeed レポートを匿名化して CSV に書き出す（セミナー・スライド用）。

使い方: python3 export_anonymized.py <out_dir> <csv> [<csv> ...]

出力:
  jobs_anonymized.csv   求人ごとの集計（社名は A社/B社…）
  areas_anonymized.csv  都道府県×市区町村ごとの集計
  summary_anonymized.csv 全体のファネルと主要指標
  _company_map.csv      社名とラベルの対応（**社内用。配布しない**）
"""
import csv
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from analyze_indeed_campaigns import load, agg, f  # noqa: E402

IMP_MIN, APP_MIN = 1000, 10


def r0(v):
    return "" if v is None else round(v)


def r3(v):
    return "" if v is None else round(v, 4)


def main():
    out, paths = sys.argv[1], sys.argv[2:]
    os.makedirs(out, exist_ok=True)
    rows, _, _ = load(paths)

    # 費用の大きい順に A社, B社, … を割り当てる
    spend = defaultdict(float)
    for r in rows:
        spend[r["co"]] += r["cost"]
    label = {co: f"{chr(65 + i)}社" for i, (co, _) in
             enumerate(sorted(spend.items(), key=lambda kv: -kv[1]))}

    with open(os.path.join(out, "_company_map.csv"), "w", newline="", encoding="utf-8-sig") as fh:
        w = csv.writer(fh)
        w.writerow(["ラベル", "実際の社名", "費用", "※このファイルは社内用。配布しない"])
        for co, lb in sorted(label.items(), key=lambda kv: kv[1]):
            w.writerow([lb, co, round(spend[co]), ""])

    def dump(path, headers, records):
        with open(os.path.join(out, path), "w", newline="", encoding="utf-8-sig") as fh:
            w = csv.writer(fh)
            w.writerow(headers)
            w.writerows(records)
        print(f"{path}: {len(records)}行")

    # ── 求人別
    g = defaultdict(list)
    for r in rows:
        g[(r["co"], r["job"])].append(r)
    jobs = []
    for (co, job), b in g.items():
        a = agg(b)
        jobs.append({
            "co": label[co], "job": job, "a": a,
            "keep": a["imp"] >= IMP_MIN or a["app"] >= APP_MIN,
            "areas": len({r["city"] for r in b}),
        })
    # CPA 昇順（応募0は末尾）
    jobs.sort(key=lambda x: (x["a"]["CPA"] is None, x["a"]["CPA"] or 0))
    dump("jobs_anonymized.csv",
         ["企業ラベル", "求人名", "応募単価CPA", "応募数", "費用", "クリック数", "クリック単価CPC",
          "応募率", "応募開始数", "応募完了率", "表示回数", "CTR", "掲載行数", "配信エリア数",
          "母数条件を満たす"],
         [[j["co"], j["job"], r0(j["a"]["CPA"]), r0(j["a"]["app"]), r0(j["a"]["cost"]),
           r0(j["a"]["clk"]), r0(j["a"]["CPC"]), r3(j["a"]["CVR"]), r0(j["a"]["start"]),
           r3(j["a"]["COMP"]), r0(j["a"]["imp"]), r3(j["a"]["CTR"]), j["a"]["n"], j["areas"],
           "1" if j["keep"] else "0"] for j in jobs])

    # ── エリア別
    ga = defaultdict(list)
    for r in rows:
        ga[(r["pref"], r["city"])].append(r)
    areas = sorted(ga.items(), key=lambda kv: -agg(kv[1])["cost"])
    dump("areas_anonymized.csv",
         ["都道府県", "市区町村", "応募単価CPA", "応募数", "費用", "クリック数", "クリック単価CPC",
          "応募率", "表示回数", "CTR", "掲載行数"],
         [[p, c, r0(a["CPA"]), r0(a["app"]), r0(a["cost"]), r0(a["clk"]), r0(a["CPC"]),
           r3(a["CVR"]), r0(a["imp"]), r3(a["CTR"]), a["n"]]
          for (p, c), b in areas for a in [agg(b)]])

    # ── 全体サマリ
    m = agg(rows)
    kept = [r for j in jobs if j["keep"] for r in g[
        next(k for k in g if label[k[0]] == j["co"] and k[1] == j["job"])]]
    km = agg(kept)
    waste = [r for r in rows if r["app"] == 0 and r["cost"] > 0]
    wc = sum(r["cost"] for r in waste)
    kf = [j["a"]["CPA"] for j in jobs if j["keep"] and j["a"]["CPA"]]
    dump("summary_anonymized.csv", ["項目", "値", "単位"], [
        ["集計期間", "2026-03-01〜2026-09-28", ""],
        ["対象行数（求人×エリア×掲載期間）", m["n"], "行"],
        ["求人数", len(jobs), "件"],
        ["表示回数", r0(m["imp"]), "回"],
        ["クリック数", r0(m["clk"]), "回"],
        ["CTR", r3(m["CTR"]), "率"],
        ["応募開始数", r0(m["start"]), "件"],
        ["応募完了数", r0(m["app"]), "件"],
        ["応募フォーム完了率", r3(m["COMP"]), "率"],
        ["応募フォーム離脱人数", r0(m["start"] - m["app"]), "人"],
        ["クリック→応募率", r3(m["CVR"]), "率"],
        ["費用", r0(m["cost"]), "円"],
        ["CPC", r0(m["CPC"]), "円"],
        ["CPA（全体）", r0(m["CPA"]), "円"],
        ["応募0のまま費用が出た行数", len(waste), "行"],
        ["応募0で消えた費用", r0(wc), "円"],
        ["応募0で消えた費用の全費用比", r3(wc / m["cost"]), "率"],
        ["母数条件を満たす求人数", len(kf), "件"],
        ["母数条件を満たす求人の費用", r0(km["cost"]), "円"],
        ["母数条件を満たす求人のCPA", r0(km["CPA"]), "円"],
        ["母数条件内の最安CPA", r0(min(kf)), "円"],
        ["母数条件内の最高CPA", r0(max(kf)), "円"],
        ["母数条件内のCPA倍率", round(max(kf) / min(kf), 1), "倍"],
        ["母数条件", f"表示{IMP_MIN}回以上 または 応募{APP_MIN}件以上", ""],
    ])


if __name__ == "__main__":
    main()
