/**
 * seed-demo-db.ts
 *
 * Populates bowling.db with realistic Michelob Ultra League demo data so
 * BowlSense is usable for screenshots, demos, share pages, and Tonight's
 * League card. Idempotent — wipes demo data (sessions/games/league_weeks/
 * league_games with notes prefix "[DEMO]") before reseeding.
 *
 * Usage:
 *   npx tsx scripts/seed-demo-db.ts           # seed
 *   npx tsx scripts/seed-demo-db.ts --wipe    # only clear demo rows
 *
 * Or via HTTP: POST /api/admin/seed-demo
 */

import Database from 'better-sqlite3';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'bowling.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Wipe existing demo data ─────────────────────────────────────────
function wipeDemo() {
  console.log('🧹 Wiping existing demo rows…');
  // Delete league_games for any league_week that belongs to demo sessions
  db.exec(`
    DELETE FROM league_games
      WHERE week_id IN (
        SELECT lw.id FROM league_weeks lw
          JOIN sessions s ON lw.notes LIKE '[DEMO]%'
        WHERE s.id IS NOT NULL
      );
    DELETE FROM league_weeks
      WHERE notes LIKE '[DEMO]%';
    DELETE FROM games
      WHERE session_id IN (SELECT id FROM sessions WHERE notes LIKE '[DEMO]%');
    DELETE FROM sessions
      WHERE notes LIKE '[DEMO]%';
  `);
}

// ── Helper: build a realistic frameData string for a given total score
function buildFrames(totalScore: number): { frameData: string; strikes: number; spares: number; splits: number } {
  // Random walk that approximates realistic bowling
  const frames: Array<{ ball1: number; ball2: number; ball3: number; isStrike: boolean; isSpare: boolean }> = [];
  let pins = 0;
  let strikes = 0;
  let spares = 0;
  let splits = 0;

  // Use score to compute average per frame and decide strike/spare pattern
  const avgPerFrame = totalScore / 10;

  for (let i = 0; i < 10; i++) {
    const r1 = Math.random();
    let ball1 = 0, ball2 = 0, ball3 = 0;
    let isStrike = false, isSpare = false;

    if (avgPerFrame > 25 && r1 < 0.45) {
      // Strike
      ball1 = 10;
      isStrike = true;
      strikes++;
    } else if (avgPerFrame > 22 && r1 < 0.7) {
      // Open frame, mostly strikes converted to spares when second ball can clear
      ball1 = 7 + Math.floor(Math.random() * 3); // 7-9
      ball2 = 10 - ball1;
      isSpare = true;
      spares++;
    } else {
      // Open or near-open
      ball1 = Math.max(0, Math.min(10, Math.floor(avgPerFrame * 0.55 + (Math.random() * 3 - 1.5))));
      ball2 = Math.max(0, Math.min(10 - ball1, Math.floor(avgPerFrame * 0.45 + (Math.random() * 3 - 1))));
      if (ball1 + ball2 === 10) { isSpare = true; spares++; }
    }

    // 10th frame bonuses
    if (i === 9) {
      if (isStrike) {
        ball2 = Math.floor(Math.random() * 11);
        ball3 = Math.floor(Math.random() * 11);
        if (ball2 === 10) strikes++;
        if (ball1 + ball2 === 10 && ball2 !== 10) { spares++; isSpare = true; }
      } else if (isSpare) {
        ball3 = Math.floor(Math.random() * 11);
        if (ball3 === 10) strikes++;
      }
    }

    // Occasional split (7-10, 4-5-7, etc.)
    if (ball1 === 7 && ball2 === 0 && i < 9) { ball2 = 0; splits++; }
    else if (ball1 === 5 && ball2 === 0 && i < 9) { ball2 = 0; splits++; }

    pins += (isStrike ? 10 : ball1 + ball2);
    frames.push({ ball1, ball2, ball3, isStrike, isSpare });
  }

  return {
    frameData: JSON.stringify({ frames }),
    strikes,
    spares,
    splits,
  };
}

// ── Helper: build pin_leaves JSON (which pins fell each throw)
function buildPinLeaves(): string {
  const pinNumbers = Array.from({ length: 10 }, (_, i) => i + 1);
  const leave: number[] = [];
  for (let i = pinNumbers.length - 1; i > 0; i--) {
    if (Math.random() < 0.35) {
      leave.push(pinNumbers[i]);
      pinNumbers.splice(i, 1);
    }
  }
  if (Math.random() < 0.5) leave.push(pinNumbers[0]);
  return JSON.stringify({ firstThrow: leave.sort((a, b) => a - b) });
}

// ── Seed Michelob Ultra League demo data ────────────────────────────
function seed() {
  console.log('🌱 Seeding Michelob Ultra League demo data…');

  // Pick a ball from the existing library (rotates through real balls)
  const balls = db.prepare('SELECT id, name FROM balls ORDER BY id').all() as Array<{ id: number; name: string }>;
  if (balls.length === 0) {
    console.error('❌ No balls in DB. Cannot seed demo data without ball library.');
    process.exit(1);
  }

  const LEAGUE_ID = 1; // Michelob Ultra League
  const OPPONENTS = [
    'Strike Force', 'Pin Pals', 'Gutter Gang', 'Spare Change', 'Lane Masters',
    'Split Happens', 'Pin Seekers', 'Turkey Hunters', 'Spare Tire', 'Rolling Thunder',
    'King Pin', 'Wood Pushers', 'Frame Perfect', 'Ten Pins Down'
  ];

  // 12 weeks of league bowling — every Saturday going back 12 weeks
  const startDate = new Date('2026-05-23'); // last Saturday of May
  let weekNumber = 17; // continuing from existing league history (15 weeks played)
  let totalGames = 0;
  let totalSessions = 0;

  const insertSession = db.prepare(`
    INSERT INTO sessions (date, location, lanes, notes, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertGame = db.prepare(`
    INSERT INTO games (session_id, game_number, score, strikes, spares, splits, ball_id, frame_data, pin_leaves, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertWeek = db.prepare(`
    INSERT INTO league_weeks (league_id, week_number, date, opponent, games_won, games_lost, games_tied, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertLeagueGame = db.prepare(`
    INSERT INTO league_games (week_id, game_number, score, strikes, spares, splits, ball_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (let w = 0; w < 12; w++) {
      const weekDate = new Date(startDate);
      weekDate.setDate(weekDate.getDate() + (w * 7));
      const dateStr = weekDate.toISOString().split('T')[0];
      const opponent = OPPONENTS[w % OPPONENTS.length];

      // Create session for this league night
      const sessionNotes = `[DEMO] Michelob Ultra Week ${weekNumber + w}`;
      const sessionResult = insertSession.run(
        dateStr,
        'Maple Lanes Lakeland',
        `15-${16 + (w % 2)}`,
        sessionNotes,
        weekDate.getTime()
      );
      const sessionId = sessionResult.lastInsertRowid as number;
      totalSessions++;

      // Generate 3 games for the session
      const gameScores: number[] = [];
      let wonGames = 0, lostGames = 0;

      // Realistic-ish score distribution for a 220ish average bowler
      // Some weeks better, some worse — varied around 220
      const weeklyAdjust = (Math.sin(w * 1.7) * 12); // -12 to +12 variance
      const baseAvg = 222 + weeklyAdjust;

      for (let g = 0; g < 3; g++) {
        // Variance per game within a week
        const variance = (Math.random() - 0.5) * 30;
        const score = Math.max(150, Math.min(300, Math.round(baseAvg + variance)));
        gameScores.push(score);
        totalGames++;

        const ball = balls[Math.floor(Math.random() * balls.length)];
        const { frameData, strikes, spares, splits } = buildFrames(score);
        const pinLeaves = score === 300 ? null : buildPinLeaves();

        const gameResult = insertGame.run(
          sessionId,
          g + 1,
          score,
          strikes,
          spares,
          splits,
          ball.id,
          frameData,
          pinLeaves,
          weekDate.getTime()
        );
        const gameId = gameResult.lastInsertRowid as number;

        // Determine W/L for this game (mock opponent scoring — average 215)
        const opponentScore = Math.round(195 + Math.random() * 40);
        if (score > opponentScore) wonGames++;
        else if (score < opponentScore) lostGames++;

        // Add to league_games (tied to the week, which we'll create next)
        // Stash for later insertion after weekId is known
        // Instead we'll do a 2nd pass after week insert
        if (g === 0) {
          // We need to know weekId before we can insert league_games.
          // Use a workaround: create the week now, then insert league_games.
          // We'll handle this below by re-inserting game scores after week is created.
        }
      }

      // Create the league_week for this night
      const weekResult = insertWeek.run(
        LEAGUE_ID,
        weekNumber + w,
        dateStr,
        opponent,
        wonGames,
        lostGames,
        0,
        `[DEMO] Michelob Ultra Week ${weekNumber + w}`,
        weekDate.getTime()
      );
      const weekId = weekResult.lastInsertRowid as number;

      // Now insert league_games for this week — link to existing games by score+session
      for (let g = 0; g < 3; g++) {
        const ball = balls[Math.floor(Math.random() * balls.length)];
        const lgGame = db.prepare(`
          SELECT strikes, spares, splits FROM games
            WHERE session_id = ? AND game_number = ?
        `).get(sessionId, g + 1) as any;
        insertLeagueGame.run(
          weekId,
          g + 1,
          gameScores[g],
          lgGame?.strikes ?? 0,
          lgGame?.spares ?? 0,
          lgGame?.splits ?? 0,
          ball.id,
          weekDate.getTime()
        );
      }
    }

    // ── Add 3 solo practice sessions (non-league) ─────────────────────
    // These show up in Sessions list and contribute to Stats
    const PRACTICE_DATES = ['2026-06-14', '2026-07-19', '2026-08-09'];
    const PRACTICE_LOCATIONS = ['Pin Chasers Tampa', 'AMF Lakeland Lanes', 'Maple Lanes Lakeland'];
    const PRACTICE_BALL_IDX = [4, 8, 12];

    for (let p = 0; p < PRACTICE_DATES.length; p++) {
      const dateStr = PRACTICE_DATES[p];
      const sessionNotes = `[DEMO] Practice night ${p + 1}`;
      const sessRes = insertSession.run(
        dateStr,
        PRACTICE_LOCATIONS[p],
        '21-22',
        sessionNotes,
        new Date(dateStr).getTime()
      );
      const sessionId = sessRes.lastInsertRowid as number;
      totalSessions++;

      // Practice sessions: 2-4 games each
      const numGames = 2 + Math.floor(Math.random() * 3);
      for (let g = 0; g < numGames; g++) {
        const variance = (Math.random() - 0.5) * 40;
        const score = Math.max(140, Math.min(289, Math.round(220 + variance)));
        totalGames++;
        const ball = balls[PRACTICE_BALL_IDX[p % PRACTICE_BALL_IDX.length] % balls.length];
        const { frameData, strikes, spares, splits } = buildFrames(score);
        const pinLeaves = buildPinLeaves();
        insertGame.run(
          sessionId,
          g + 1,
          score,
          strikes,
          spares,
          splits,
          ball.id,
          frameData,
          pinLeaves,
          new Date(dateStr).getTime()
        );
      }
    }

    // ── Add a 300 perfect game (highlighted in PerfectGames page) ──────
    const perfectDate = '2026-07-26';
    const sessRes = insertSession.run(
      perfectDate,
      'Maple Lanes Lakeland',
      '17-18',
      '[DEMO] Practice — first 300 game of the season!',
      new Date(perfectDate).getTime()
    );
    const sessionId = sessRes.lastInsertRowid as number;
    totalSessions++;
    totalGames++;
    const ball = balls[0];
    const perfectFrames = {
      frames: Array.from({ length: 10 }, () => ({
        ball1: 10, ball2: 0, ball3: 10,
        isStrike: true, isSpare: false,
      })),
    };
    insertGame.run(
      sessionId, 1, 300, 12, 0, 0,
      ball.id,
      JSON.stringify(perfectFrames),
      null,
      new Date(perfectDate).getTime()
    );

    // ── Add a second 300 (so the page shows 2 perfect games) ──────────
    const perfect2Date = '2026-06-28';
    const sessRes2 = insertSession.run(
      perfect2Date,
      'Pin Chasers Tampa',
      '9-10',
      '[DEMO] Second 300 — felt like the pocket was enormous',
      new Date(perfect2Date).getTime()
    );
    const sessionId2 = sessRes2.lastInsertRowid as number;
    totalSessions++;
    totalGames++;
    const ball2 = balls[3 % balls.length];
    insertGame.run(
      sessionId2, 1, 300, 12, 0, 0,
      ball2.id,
      JSON.stringify(perfectFrames),
      null,
      new Date(perfect2Date).getTime()
    );
  });

  tx();

  // Verify counts
  const sessCount = (db.prepare('SELECT COUNT(*) AS c FROM sessions WHERE notes LIKE ?').get('[DEMO]%') as any).c;
  const gameCount = (db.prepare(`
    SELECT COUNT(*) AS c FROM games g
      JOIN sessions s ON g.session_id = s.id
      WHERE s.notes LIKE ?
  `).get('[DEMO]%') as any).c;
  const weekCount = (db.prepare('SELECT COUNT(*) AS c FROM league_weeks WHERE notes LIKE ?').get('[DEMO]%') as any).c;

  console.log('✅ Seed complete:');
  console.log(`   Sessions: ${sessCount} (${totalSessions} inserted)`);
  console.log(`   Games: ${gameCount} (${totalGames} inserted)`);
  console.log(`   League weeks: ${weekCount}`);
  console.log(`   Perfect games: 2`);
}

// ── Main ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.includes('--wipe')) {
  wipeDemo();
  console.log('✅ Demo rows cleared.');
} else {
  wipeDemo();
  seed();
}

db.close();
console.log('🎳 Done. Visit http://localhost:3003/ to see populated dashboard.');
