import Database from 'better-sqlite3';

type AnyObj = Record<string, any>;

type WeekInfo = {
  week: number;
  date?: string | null;
};

type GameRecord = {
  week: number;
  gameNumber: number;
  score: number;
  date?: string | null;
};

const LEAGUE_ID = 48550;
const TARGET_LEAGUE_ID = 1;
const TARGET_BOWLER_NAME = 'Kerns, Matt';
const DB_PATH = '/home/mkerns/bowling-tracker/backend/bowling.db';

const DASHBOARD_URL =
  'https://www.leaguesecretary.com/bowling-centers/maple-lanes-lakeland/bowling-leagues/michelob-ultra-league-202526/dashboard/48550';
const WEEKS_URL =
  'https://www.leaguesecretary.com/bowling-centers/maple-lanes-lakeland/bowling-leagues/michelob-ultra-league-202526/league/weeks/48550';
const RESULTS_URL =
  'https://www.leaguesecretary.com/bowling-centers/maple-lanes-lakeland/bowling-leagues/michelob-ultra-league-202526/league/results/48550';

const BASE_HEADERS: HeadersInit = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  Referer: DASHBOARD_URL,
};

function log(msg: string) {
  console.log(`[import-league] ${msg}`);
}

function cleanHtmlText(s: string): string {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function toIsoDate(value: string): string | null {
  const v = value.trim();
  if (!v) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;

  const mdY = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdY) {
    const mm = mdY[1].padStart(2, '0');
    const dd = mdY[2].padStart(2, '0');
    const yy = mdY[3];
    return `${yy}-${mm}-${dd}`;
  }

  const monthName = v.match(
    /^(Jan|January|Feb|February|Mar|March|Apr|April|May|Jun|June|Jul|July|Aug|August|Sep|Sept|September|Oct|October|Nov|November|Dec|December)\s+(\d{1,2}),\s*(\d{4})$/i,
  );
  if (monthName) {
    const map: Record<string, string> = {
      jan: '01', january: '01',
      feb: '02', february: '02',
      mar: '03', march: '03',
      apr: '04', april: '04',
      may: '05',
      jun: '06', june: '06',
      jul: '07', july: '07',
      aug: '08', august: '08',
      sep: '09', sept: '09', september: '09',
      oct: '10', october: '10',
      nov: '11', november: '11',
      dec: '12', december: '12',
    };
    const mm = map[monthName[1].toLowerCase()];
    const dd = monthName[2].padStart(2, '0');
    const yy = monthName[3];
    return `${yy}-${mm}-${dd}`;
  }

  return null;
}

async function fetchHtml(url: string): Promise<{ status: number; html: string }> {
  log(`fetch url: ${url}`);
  const res = await fetch(url, { method: 'GET', headers: BASE_HEADERS });
  const html = await res.text();
  log(`fetch status=${res.status}, bytes=${html.length}`);
  return { status: res.status, html };
}

function parseWeeksFromHtml(html: string): WeekInfo[] {
  const out = new Map<number, WeekInfo>();

  const hrefWeek = /href=["'][^"']*?[?&]week=(\d+)[^"']*["']/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefWeek.exec(html)) !== null) {
    const week = Number(m[1]);
    if (Number.isFinite(week) && week > 0 && week < 80) {
      if (!out.has(week)) out.set(week, { week, date: null });
    }
  }

  const rowRe = /<tr[\s\S]*?<\/tr>/gi;
  const rows = html.match(rowRe) ?? [];
  for (const row of rows) {
    const rowText = cleanHtmlText(row);
    const weekMatch = rowText.match(/\bweek\s*(\d{1,2})\b/i) || rowText.match(/\b(\d{1,2})\b/);
    if (!weekMatch) continue;
    const week = Number(weekMatch[1]);
    if (!Number.isFinite(week) || week <= 0 || week > 80) continue;

    const dateMatch =
      rowText.match(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/) ||
      rowText.match(
        /\b(Jan|January|Feb|February|Mar|March|Apr|April|May|Jun|June|Jul|July|Aug|August|Sep|Sept|September|Oct|October|Nov|November|Dec|December\s+\d{1,2},\s*\d{4})\b/i,
      );

    const iso = dateMatch ? toIsoDate(dateMatch[1]) : null;

    if (!out.has(week)) out.set(week, { week, date: iso });
    else if (!out.get(week)?.date && iso) out.set(week, { week, date: iso });
  }

  const weeks = [...out.values()].sort((a, b) => a.week - b.week);
  log(`weeks parsed from html: count=${weeks.length}`);
  for (const w of weeks) {
    log(`weeks parsed item: week=${w.week}, date=${w.date ?? 'null'}`);
  }
  return weeks;
}

function parseGamesForBowlerFromWeekHtml(html: string, week: number): GameRecord[] {
  const games: GameRecord[] = [];
  const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
  log(`week ${week}: html row count=${rows.length}`);

  for (const rowHtml of rows) {
    const rowText = cleanHtmlText(rowHtml);
    if (!rowText.toLowerCase().includes(TARGET_BOWLER_NAME.toLowerCase())) continue;

    const scoreCandidates = [...rowText.matchAll(/\b([3-9]\d|[12]\d{2}|300)\b/g)].map((x) => Number(x[1]));
    const plausibleScores = scoreCandidates.filter((n) => n >= 50 && n <= 300);

    if (plausibleScores.length === 0) {
      log(`week ${week}: found bowler row but no plausible scores -> ${rowText}`);
      continue;
    }

    const dedup = Array.from(new Set(plausibleScores)).slice(0, 6);
    for (let i = 0; i < dedup.length; i++) {
      games.push({
        week,
        gameNumber: i + 1,
        score: dedup[i],
        date: null,
      });
    }

    log(`week ${week}: matched bowler row -> extracted scores=${dedup.join(', ')}`);
  }

  const uniq = new Map<string, GameRecord>();
  for (const g of games) {
    uniq.set(`${g.week}-${g.gameNumber}-${g.score}`, g);
  }

  const out = [...uniq.values()].sort((a, b) => a.gameNumber - b.gameNumber);
  log(`week ${week}: games parsed for ${TARGET_BOWLER_NAME}: ${out.length}`);
  return out;
}

function ensureWeekRow(db: Database.Database, leagueId: number, weekNumber: number, date: string | null): number {
  const existing = db
    .prepare(
      `SELECT id, date
       FROM league_weeks
       WHERE leagueId = ? AND weekNumber = ?
       ORDER BY id ASC
       LIMIT 1`,
    )
    .get(leagueId, weekNumber) as AnyObj | undefined;

  if (existing) {
    if (!existing.date && date) {
      db.prepare(`UPDATE league_weeks SET date = ? WHERE id = ?`).run(date, existing.id);
      log(`db week update: weekId=${existing.id} week=${weekNumber} set date=${date}`);
    } else {
      log(`db week exists: weekId=${existing.id} week=${weekNumber} date=${existing.date ?? 'null'}`);
    }
    return Number(existing.id);
  }

  const ins = db
    .prepare(`INSERT INTO league_weeks (leagueId, weekNumber, date) VALUES (?, ?, ?)`)
    .run(leagueId, weekNumber, date);
  const weekId = Number(ins.lastInsertRowid);
  log(`db week insert: weekId=${weekId} week=${weekNumber} date=${date ?? 'null'}`);
  return weekId;
}

function gameExists(
  db: Database.Database,
  weekId: number,
  bowlerName: string,
  gameNumber: number,
  score: number,
): number | null {
  const row = db
    .prepare(
      `SELECT id
       FROM league_games
       WHERE weekId = ? AND bowlerName = ? AND gameNumber = ? AND score = ?
       LIMIT 1`,
    )
    .get(weekId, bowlerName, gameNumber, score) as AnyObj | undefined;
  return row ? Number(row.id) : null;
}

function insertGame(db: Database.Database, weekId: number, bowlerName: string, gameNumber: number, score: number) {
  const res = db
    .prepare(
      `INSERT INTO league_games (weekId, bowlerName, gameNumber, score, strike, spare, split, frameData)
       VALUES (?, ?, ?, ?, 0, 0, 0, ?)`
    )
    .run(weekId, bowlerName, gameNumber, score, null);
  return Number(res.lastInsertRowid);
}

async function main() {
  log(`starting import for leagueId=${TARGET_LEAGUE_ID}, sourceLeagueId=${LEAGUE_ID}, bowler=${TARGET_BOWLER_NAME}`);

  const weeksFetch = await fetchHtml(WEEKS_URL);
  let weeks: WeekInfo[] = [];

  if (weeksFetch.status === 404 || !weeksFetch.html.trim()) {
    log('weeks page unavailable/empty. falling back to probing week numbers 1..35');
    weeks = Array.from({ length: 35 }, (_, i) => ({ week: i + 1, date: null }));
  } else {
    weeks = parseWeeksFromHtml(weeksFetch.html);
    if (weeks.length === 0) {
      log('weeks page parsed with zero weeks. falling back to probing week numbers 1..35');
      weeks = Array.from({ length: 35 }, (_, i) => ({ week: i + 1, date: null }));
    }
  }

  const db = new Database(DB_PATH);
  log(`db open: ${DB_PATH}`);

  let totalFound = 0;
  let totalImported = 0;
  let totalSkipped = 0;

  for (const w of weeks) {
    const url = `${RESULTS_URL}?week=${w.week}`;
    const res = await fetchHtml(url);

    if (res.status === 404 || !res.html.trim()) {
      log(`page empty/404 for week ${w.week} — skipping`);
      continue;
    }

    const games = parseGamesForBowlerFromWeekHtml(res.html, w.week);
    if (games.length === 0) {
      log(`week ${w.week}: HTML parsed but no games found for ${TARGET_BOWLER_NAME}`);
      continue;
    }

    totalFound += games.length;

    const weekId = ensureWeekRow(db, TARGET_LEAGUE_ID, w.week, w.date ?? null);

    let importedThisWeek = 0;
    for (const g of games) {
      const existingId = gameExists(db, weekId, TARGET_BOWLER_NAME, g.gameNumber, g.score);
      if (existingId) {
        totalSkipped += 1;
        log(
          `db game exists: gameId=${existingId} weekId=${weekId} gameNumber=${g.gameNumber} score=${g.score} bowler=${TARGET_BOWLER_NAME}`,
        );
        continue;
      }

      const newId = insertGame(db, weekId, TARGET_BOWLER_NAME, g.gameNumber, g.score);
      importedThisWeek += 1;
      totalImported += 1;
      log(
        `db game insert: gameId=${newId} weekId=${weekId} gameNumber=${g.gameNumber} score=${g.score} bowler=${TARGET_BOWLER_NAME}`,
      );
    }

    log(`Week ${w.week} (${w.date ?? 'date unknown'}): found ${games.length} games for Matt, imported ${importedThisWeek}`);
  }

  db.close();

  log(`Done. Total: found ${totalFound} games, imported ${totalImported}, skipped ${totalSkipped} (duplicate).`);
}

main().catch((err) => {
  console.error('[import-league] fatal error:', err);
  process.exit(1);
});
