# Cadence

A habit tracker that runs entirely in your browser. There's no account and no server, and nothing leaves your machine.

I wanted something that handles the messy parts of tracking: a rating out of 10 for how I slept, hours of study, a weekly gym target, and "days since" counters for things I'm trying to quit. Fixing last Tuesday's log had to be painless, and I wanted it to spot patterns between habits, like whether gym days line up with better sleep.

## What it does

- Five kinds of habit: yes/no, amounts (glasses of water, meals), time with a built-in stopwatch, ratings out of 5 or 10, and quit habits that count up until you slip.
- Daily, weekly or monthly goals. Daily habits can run on specific weekdays, goals can be "at least" or "at most", and anything can be track-only.
- Past days are easy to fix from the week strip on Today, the History grid, or the calendar on each habit's page. Sick days can be skipped so they don't break a streak.
- Each habit gets streaks, completion rates, a strength score and trend charts. The Insights page compares habits with each other and with the next day ("on gym days your mood averages 7.5 vs 6.2"), and shows the sample size and confidence for each finding.
- XP, levels and achievements, with optional sounds and confetti.
- Four themes, six accent colors, and full keyboard support (`Ctrl K` opens a command palette).

## Running it

You need [Node.js](https://nodejs.org) 20.19 or newer.

```bash
npm install
npm start
```

That builds the app and serves it at http://localhost:5180. On Windows you can double-click `Cadence.bat` instead. It installs and builds on the first run.

## Working on it while you use it

The browser keeps your data per address, so the two ports act as two separate copies:

| | Command | URL | Data |
| --- | --- | --- | --- |
| Using it | `npm start` / `Cadence.bat` | localhost:5180 | your real habits |
| Developing | `npm run dev` | localhost:5173 | a separate sandbox |

Both can run at the same time, and nothing you do on the dev server touches your real history. The welcome screen can fill the sandbox with 150 days of demo data. To try changes against your real logs, export a backup in Settings on 5180 and import it on 5173.

When you're happy with a change, rebuild the everyday copy with `npm run build` (or `Rebuild.bat`) and reload the tab.

## Your data

Everything is stored in the browser's IndexedDB for `localhost:5180`. Clearing site data, switching browsers or using a private window all start you from empty, so export a backup now and then (Settings, then Data). The backup restores everything. There's also a CSV export if you want your logs in a spreadsheet.

## Tech

React 19, TypeScript, Vite, Tailwind CSS 4, zustand for state (persisted to IndexedDB with undo/redo), motion for animation, and recharts for the charts.

All of the habit math lives in pure functions under `src/lib`: statuses, streaks, period goals, strength, XP and the correlation stats (Pearson's r with a t-test for the p-value). That keeps it easy to test.

```
src/
  lib/          habit engine, formatting, XP and achievements, insights, backup
  store/        app state, persistence, hooks
  components/   ui kit plus one folder per screen
  pages/        routes
```

```bash
npm test            # vitest
npm run typecheck   # tsc
```
