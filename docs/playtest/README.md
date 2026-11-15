# Playtesting

This folder holds the evidence of learning for the rubric: real peers' logs, their feedback,
and the summary made from them. **Nothing here is invented.** It stays empty until people play.

## Protocol (about 20 minutes per player)

1. Give each player a tag (`P1`, `P2`, …). Don't use real names.
2. They open the game, type their tag on the start screen and **take the warm-up quiz** (don't skip it).
3. They play all five levels without help. You watch quietly and write notes in
   [`observation_notes.md`](observation_notes.md): where they got stuck, what they said.
4. At the end they take the **check-out quiz**, fill in the short feedback form, and press
   **Download my playtest log (JSON)**. Ask them to send you the file.
5. Put every `.json` file in [`logs/`](logs/).
6. From the `mayor-game` folder run:

   ```bash
   python tools/summarize_logs.py
   ```

   This writes `summary.md`, `summary_per_player.csv` and `playtest_chart.png` here.
7. Copy the headline table from `summary.md` and the chart into the main README's
   "Playtest results" section, and add 2–3 quotes from the feedback.

## What we measure

| Question | From |
|---|---|
| Do players fall for the trap at first? | Level 1 `fell_for_trap` |
| Do they avoid the same kind of trap later, in a new story? | Level 5a `fell_for_trap` |
| Do they do better on unseen scenario questions after playing? | warm-up vs check-out quiz score |
| Do they use the right tool before deciding? | `used_key_tool` per level |
| Did they find it helpful? | feedback rating (1–5) and comments |

With a handful of players these are descriptive numbers, not a statistical test, and the
README should say so.
