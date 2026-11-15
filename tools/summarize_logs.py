"""Combine several players' playtest logs into a summary table and a chart.

Usage (from the mayor-game folder):
    python tools/summarize_logs.py                      # reads docs/playtest/logs/*.json
    python tools/summarize_logs.py --logs some/folder --out some/folder

Each player downloads "my playtest log (JSON)" at the end of the game and sends it in.
This script then writes:
    <out>/summary_per_player.csv   one row per player
    <out>/summary.md               the headline numbers, ready to paste into the README
    <out>/playtest_chart.png       trap-fall rate (Level 1 vs Level 5) and quiz (pre vs post)

Only the Python standard library and matplotlib are needed.
"""
import argparse
import csv
import glob
import json
import os
import statistics as st

CONCEPTS = {"confounding": "Confounding", "reverse": "Reverse causation", "simpson": "Simpson's paradox", "rct": "Hidden confounder (pilot)"}


def load_logs(folder):
    logs = []
    for path in sorted(glob.glob(os.path.join(folder, "*.json"))):
        with open(path, encoding="utf-8") as f:
            try:
                data = json.load(f)
            except json.JSONDecodeError:
                print(f"skipping {path}: not valid JSON")
                continue
        if "decisions" not in data:
            print(f"skipping {path}: not a playtest log")
            continue
        data["_file"] = os.path.basename(path)
        logs.append(data)
    return logs


def player_row(log):
    dec = {d["level"]: d for d in log["decisions"]}
    l5 = [dec[k] for k in ("5a", "5b", "5c") if k in dec]
    quiz = log.get("quiz") or {}
    fb = log.get("feedback") or {}
    row = {
        "file": log["_file"],
        "player": log.get("player") or "(no tag)",
        "seed": log.get("seed"),
        "levels_played": len(dec),
        "L1_fell_for_trap": dec["1"]["fell_for_trap"] if "1" in dec else "",
        "L1_used_key_tool": dec["1"].get("used_key_tool", "") if "1" in dec else "",
        "L5_traps_fallen": sum(d["fell_for_trap"] for d in l5) if l5 else "",
        "L5_problems": len(l5),
        "L5a_fell_for_trap": dec["5a"]["fell_for_trap"] if "5a" in dec else "",
        "pilots_run": sum(int(d.get("pilots", 0) or 0) for d in log["decisions"]),
        "total_score": sum(d["score"] for d in log["decisions"]),
        "quiz_pre": quiz.get("pre", {}).get("score", ""),
        "quiz_post": quiz.get("post", {}).get("score", ""),
        "rating": fb.get("rating", ""),
        "learned": fb.get("learned", ""),
        "improve": fb.get("improve", ""),
    }
    for d in log["decisions"]:
        row[f"fell_{d['level']}"] = d["fell_for_trap"]
    return row


def shown_path(path, root):
    try:
        return os.path.relpath(path, root)
    except ValueError:  # different drive on Windows
        return path


def rate(values):
    vals = [v for v in values if v != ""]
    return (sum(vals) / len(vals), len(vals)) if vals else (None, 0)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.dirname(here)
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--logs", default=os.path.join(root, "docs", "playtest", "logs"))
    ap.add_argument("--out", default=os.path.join(root, "docs", "playtest"))
    args = ap.parse_args()

    logs = load_logs(args.logs)
    if not logs:
        print(f"No playtest logs found in {args.logs}. Put the players' .json logs there and run again.")
        return
    os.makedirs(args.out, exist_ok=True)
    rows = [player_row(l) for l in logs]

    # ---- per-player CSV
    cols = list(rows[0].keys())
    for r in rows[1:]:
        cols += [c for c in r if c not in cols]
    with open(os.path.join(args.out, "summary_per_player.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in rows:
            w.writerow(r)

    # ---- headline numbers
    l1_rate, n_l1 = rate([r["L1_fell_for_trap"] for r in rows])
    l5_all = [d["fell_for_trap"] for l in logs for d in l["decisions"] if d["level"] in ("5a", "5b", "5c")]
    l5_rate, n_l5 = rate(l5_all)
    l5a_rate, n_l5a = rate([r["L5a_fell_for_trap"] for r in rows])
    by_level = {}
    for l in logs:
        for d in l["decisions"]:
            by_level.setdefault(d["level"], []).append(d["fell_for_trap"])
    paired = [(r["quiz_pre"], r["quiz_post"]) for r in rows if r["quiz_pre"] != "" and r["quiz_post"] != ""]
    pre_all = [r["quiz_pre"] for r in rows if r["quiz_pre"] != ""]
    post_all = [r["quiz_post"] for r in rows if r["quiz_post"] != ""]
    ratings = [r["rating"] for r in rows if r["rating"] not in ("", None)]

    def pct(x):
        return "n/a" if x is None else f"{100 * x:.0f}%"

    lines = [
        "# Playtest summary",
        "",
        f"Players: **{len(rows)}** (logs in `{shown_path(args.logs, root)}`).",
        "",
        "| Measure | Value |",
        "|---|---|",
        f"| Fell for the Level 1 trap (confounding) | {pct(l1_rate)} of {n_l1} players |",
        f"| Fell for the same kind of trap in Level 5 (new story: diarrhoea vs cold drinks) | {pct(l5a_rate)} of {n_l5a} players |",
        f"| Fell for any Level 5 trap (3 problems each) | {pct(l5_rate)} of {n_l5} decisions |",
    ]
    if paired:
        diffs = [b - a for a, b in paired]
        lines.append(f"| Quiz score, players who did both (out of 3) | pre {st.mean(a for a, _ in paired):.2f} → post {st.mean(b for _, b in paired):.2f} (mean change {st.mean(diffs):+.2f}, n = {len(paired)}) |")
    elif pre_all or post_all:
        lines.append(f"| Quiz score (out of 3) | pre {st.mean(pre_all):.2f} (n={len(pre_all)}) · post {st.mean(post_all):.2f} (n={len(post_all)}) |" if pre_all and post_all else "| Quiz score | not enough data |")
    if ratings:
        lines.append(f"| Helpfulness rating (1-5) | mean {st.mean(ratings):.1f} (n = {len(ratings)}) |")
    lines += ["", "## Trap-fall rate by problem", "", "| Problem | Fell for trap | Players |", "|---|---|---|"]
    for lvl in sorted(by_level):
        r, n = rate(by_level[lvl])
        lines.append(f"| {lvl} | {pct(r)} | {n} |")
    lines += ["", "## What players wrote", ""]
    for r in rows:
        if r["learned"] or r["improve"]:
            lines.append(f"- **{r['player']}**: learned: \"{r['learned']}\"; would change: \"{r['improve']}\"")
    lines += ["", "With only a handful of players these are descriptive numbers, not a statistical test.", ""]
    with open(os.path.join(args.out, "summary.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    # ---- chart: two panels, one axis each (no dual axes), colour-blind-safe blue/orange
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, axes = plt.subplots(1, 2, figsize=(10, 4))
    ax = axes[0]
    labels = ["Level 1\n(confounding)", "Level 5a\n(confounding,\nnew story)", "Level 5\n(all 3 problems)"]
    vals = [l1_rate, l5a_rate, l5_rate]
    ns = [n_l1, n_l5a, n_l5]
    bars = ax.bar(labels, [0 if v is None else 100 * v for v in vals], color=["#eb6834", "#2a78d6", "#2a78d6"], width=0.6)
    for b, v, n in zip(bars, vals, ns):
        ax.text(b.get_x() + b.get_width() / 2, b.get_height() + 2, "n/a" if v is None else f"{100 * v:.0f}%\n(n={n})", ha="center", va="bottom", fontsize=9)
    ax.set_ylim(0, 115)
    ax.set_ylabel("Fell for the trap (%)")
    ax.set_title("Trap-fall rate: start vs end of the game")
    ax.spines[["top", "right"]].set_visible(False)

    ax = axes[1]
    if pre_all or post_all:
        q_vals = [st.mean(pre_all) if pre_all else 0, st.mean(post_all) if post_all else 0]
        qb = ax.bar(["Warm-up quiz\n(before Level 1)", "Check-out quiz\n(after Level 5)"], q_vals, color=["#eb6834", "#2a78d6"], width=0.5)
        for b, v, n in zip(qb, q_vals, [len(pre_all), len(post_all)]):
            ax.text(b.get_x() + b.get_width() / 2, v + 0.05, f"{v:.2f}\n(n={n})", ha="center", va="bottom", fontsize=9)
    else:
        ax.text(0.5, 0.5, "No quiz answers yet", ha="center", va="center", transform=ax.transAxes)
    ax.set_ylim(0, 3.6)
    ax.set_ylabel("Mean score (out of 3)")
    ax.set_title("Scenario quiz: before vs after")
    ax.spines[["top", "right"]].set_visible(False)
    fig.suptitle(f"Mayor for a Year playtest ({len(rows)} players)", fontsize=12)
    fig.tight_layout()
    fig.savefig(os.path.join(args.out, "playtest_chart.png"), dpi=150)
    print(f"Wrote summary for {len(rows)} players to {args.out}")


if __name__ == "__main__":
    main()
