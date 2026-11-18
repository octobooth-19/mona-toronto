# Mona / Toronto

A dependency-free, offline Toronto arcade game. Collect commit icons as Mona,
avoid the bugs, and compete on this computer's leaderboard.

## Developer

[Garreth Golding](https://github.com/garrethgolding) ·
[LinkedIn](https://ca.linkedin.com/in/garrethgolding)

## Run locally

Requires Node.js 22 or newer. No packages, installation, or build step.

```sh
git clone https://github.com/octobooth-19/mona-toronto.git
cd mona-toronto
node server.mjs
```

Open **http://127.0.0.1:4317**. Stop the server with **Ctrl+C** in its terminal.
If that port is in use, run `PORT=4318 node server.mjs` and open the printed URL.
The server binds only to `127.0.0.1`; there are no external requests.

## Play

Choose **New game**, enter a name, and start at Design Exchange on Bay Street.
Move with **arrow keys** or **WASD**; on-screen direction buttons are available
at narrow screen sizes. Queue a direction before a junction. Mona keeps moving
until blocked or turned.

The map scales to the available viewport height and width without cropping or
page scrolling. In narrow windows, **Leaderboard & field guide** opens the
supporting information on demand and pauses an active run.

- One commit = one point. Clearing the board refills the commits.
- One bug starts on the map. One more appears every **5 seconds of active play**,
  with no enemy limit. Touching a bug ends the single-life run.
- **Esc** or **Pause** freezes movement, elapsed time, and spawning. Switching
  tabs or leaving the window also pauses; resume explicitly when you return.
- Opening New game pauses the current run. Cancel leaves it paused. Starting
  again discards that unfinished run without saving a score.

## Scores and player names

The server creates **`data/scores.csv`** beside `server.mjs`, outside the public
folder. It stores `run_id,username,score,duration_ms,completed_at` for every
completed run and reloads them after a restart. Back up this file to keep scores.
Stop the server before editing it. Invalid CSV is reported, not overwritten.

The leaderboard shows the top 10 personal bests. Names are trimmed,
case-insensitive, and limited to 24 Unicode characters. Control/format characters
and leading `=`, `+`, `-`, or `@` are rejected to keep CSV safe to open in
spreadsheet software. Commas and quotation marks are supported and CSV-escaped.
There are no accounts or separate player profiles; the name identifies a player.
Equal scores favor the earlier result, then the first recorded row.

Scores save automatically when a run ends. If saving fails, the screen explicitly
reports **NOT saved** and keeps that result in memory for **Retry score save**.
Keep the page open until saved; starting another run is disabled meanwhile.
Retries use the same run ID so a lost response cannot create duplicate rows.
Closing/reloading the page can discard an unsaved result. The app warns before
navigation when the browser supports it.

Local-only, same-origin score requests are accepted. This is a casual local
game, not a tamper-proof competition. Run only one server per CSV file.

## Design and verification

The map is an original schematic based on the provided Toronto street reference,
not live map tiles or navigation data. Mona is an original stylized illustration,
not an official GitHub character asset. All visuals and fonts are local.

```sh
node --test
```

Tests use temporary files, never the real leaderboard. No dependencies.
