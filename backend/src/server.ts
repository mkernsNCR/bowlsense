import Fastify from 'fastify';
import FastifyMultipart from '@fastify/multipart';
import Database from 'better-sqlite3';
import sharp from 'sharp';
import fastifyStatic from '@fastify/static';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { sessions, games, balls } from './schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FRONTEND_DIST = join(__dirname, '..', '..', 'frontend', 'dist');

const sqlite = new Database('bowling.db');
const db = drizzle(sqlite);

const fastify = Fastify({ logger: true });
const internalRelayToken = randomBytes(32).toString('hex');
const configuredAuthToken = process.env.BOWLSENSE_AUTH_TOKEN || '';
const configuredProxySecret = process.env.BOWLSENSE_TRUSTED_PROXY_SECRET || '';
const allowedEmails = new Set(
  (process.env.BOWLSENSE_ALLOWED_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

function internalRequest(options: any) {
  return fastify.inject({
    ...options,
    headers: { ...options.headers, 'x-bowlsense-internal': internalRelayToken },
  });
}

function secretsMatch(candidate: string, expected: string) {
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer);
}

function isPublicDataRequest(method: string, pathname: string) {
  if (method !== 'GET') return false;
  return pathname === '/health'
    || pathname === '/api/stats'
    || pathname === '/stats'
    || /^\/(?:api\/)?games\/\d+\/(?:public|og-image|perfect-og-image)$/.test(pathname)
    || /^\/(?:api\/)?games\/perfect\/\d+$/.test(pathname)
    || /^\/(?:api\/)?sessions\/\d+\/(?:public|share-card|og-image)$/.test(pathname)
    || /^\/(?:api\/)?profile\/og-image$/.test(pathname)
    || /^\/(?:api\/)?leagues\/\d+\/(?:share|leaderboard|recap)(?:\/og-image)?$/.test(pathname)
    || /^\/(?:api\/)?leagues\/\d+\/(?:stats|standings)$/.test(pathname)
    || /^\/(?:api\/)?leagues\/\d+\/weeks\/\d+(?:\/og-image)?$/.test(pathname)
    || /^\/(?:api\/)?tournaments\/\d+\/(?:share|og-image|standings(?:\/og-image)?)$/.test(pathname);
}

function isPrivateDataRequest(pathname: string) {
  return pathname.startsWith('/api/')
    || /^\/(?:sessions|games|games-recent|balls|stats|dashboard|leagues|tournaments|arsenals)(?:\/|$)/.test(pathname)
    || /^\/(?:api\/)?(?:backup|backups|backup-log|restore|import|export|data-health)(?:\/|$)/.test(pathname);
}

fastify.addHook('onRequest', async (request, reply) => {
  const pathname = request.url.split('?')[0];

  // Browser navigations belong to React Router, even when a legacy JSON route
  // uses the same pathname. Programmatic API calls do not send text/html.
  if (request.method === 'GET' && String(request.headers.accept || '').includes('text/html')) {
    const isAssetOrExternalProxy = /\.[a-z0-9]+$/i.test(pathname)
      || pathname.startsWith('/api/')
      || ['/League', '/Bowler', '/Home', '/Bowl'].some((prefix) => pathname.startsWith(prefix));
    if (!isAssetOrExternalProxy && existsSync(join(FRONTEND_DIST, 'index.html'))) {
      return reply.type('text/html').send(readFileSync(join(FRONTEND_DIST, 'index.html')));
    }
  }

  if (!isPrivateDataRequest(pathname) || isPublicDataRequest(request.method, pathname)) return;

  const internalHeader = String(request.headers['x-bowlsense-internal'] || '');
  if (secretsMatch(internalHeader, internalRelayToken)) return;

  const remoteAddress = request.ip;
  const requestHost = String(request.headers.host || '').toLowerCase();
  const hasLoopbackHost = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(requestHost);
  const isLocalDevelopment = process.env.NODE_ENV !== 'production'
    && hasLoopbackHost
    && (remoteAddress === '127.0.0.1' || remoteAddress === '::1' || remoteAddress === '::ffff:127.0.0.1');
  if (isLocalDevelopment) return;

  const authenticatedEmail = String(request.headers['oai-authenticated-user-email'] || '').trim().toLowerCase();
  const suppliedProxySecret = String(request.headers['x-bowlsense-proxy-secret'] || '');
  const trustedProxy = configuredProxySecret && secretsMatch(suppliedProxySecret, configuredProxySecret);
  if (trustedProxy && authenticatedEmail && (allowedEmails.size === 0 || allowedEmails.has(authenticatedEmail))) return;

  const authorization = String(request.headers.authorization || '');
  const bearerToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (configuredAuthToken && secretsMatch(bearerToken, configuredAuthToken)) return;

  return reply.status(401).send({ error: 'Authentication required' });
});

function relayInjectedResponse(reply: any, response: any) {
  const contentType = response.headers['content-type'] || '';
  reply.status(response.statusCode);
  if (contentType) reply.header('Content-Type', contentType);
  if (response.headers['cache-control']) reply.header('Cache-Control', response.headers['cache-control']);
  if (response.statusCode === 204) return reply.send();
  if (contentType.includes('application/json')) return reply.send(response.json());
  return reply.send(response.rawPayload);
}

fastify.get('/health', async () => ({ status: 'ok', service: 'bowlsense-api' }));

async function buildPublicStats() {
  const allGames = await db.select().from(games);
  const totalGames = allGames.length;
  const totalScore = allGames.reduce((sum, game) => sum + (game.score || 0), 0);
  const totalStrikes = allGames.reduce((sum, game) => sum + (game.strikes || 0), 0);
  const totalSpares = allGames.reduce((sum, game) => sum + (game.spares || 0), 0);
  const profileName = (process.env.BOWLSENSE_PUBLIC_PROFILE_NAME || '').trim().slice(0, 80) || null;
  return {
    average: totalGames ? Math.round(totalScore / totalGames) : 0,
    strikeRate: totalGames ? Math.round((totalStrikes / (totalGames * 12)) * 100) : 0,
    spareRate: totalGames ? Math.round((totalSpares / (totalGames * 12)) * 100) : 0,
    totalGames,
    totalScore,
    totalStrikes,
    totalSpares,
    profileName,
    generatedAt: new Date().toISOString(),
  };
}

// Register multipart for file uploads (CSV import)
await fastify.register(FastifyMultipart, {
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ── API prefix routes (mirror non-prefixed routes for SPA /api/* calls) ──
// The React frontend calls /api/stats, /api/games-recent, etc.
// We add explicit /api/* aliases so the SPA on port 3003 works without a proxy.
fastify.get('/api/stats', buildPublicStats);

fastify.get('/api/games-recent', async () => {
  const recent = sqlite.prepare(`
    SELECT g.*, s.date, s.location
    FROM games g JOIN sessions s ON s.id = g.session_id
    ORDER BY s.date DESC, g.id DESC LIMIT 12
  `).all() as any[];
  return recent;
});

fastify.get('/api/stats/by-ball', async () => {
  return sqlite.prepare(`
    SELECT b.name, COUNT(g.id) as game_count, AVG(g.score) as avg_score, MAX(g.score) as high_game
    FROM balls b LEFT JOIN games g ON g.ball_id = b.id
    WHERE b.id IS NOT NULL
    GROUP BY b.id, b.name
    HAVING game_count > 0
    ORDER BY game_count DESC
  `).all() as any[];
});

fastify.get('/api/stats/weekly', async () => {
  // Determine week boundaries (Mon–Sun for current and last week)
  const now = new Date();
  const dow = now.getDay(); // 0=Sun
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() + mondayOffset);
  thisMonday.setHours(0, 0, 0, 0);
  const thisSunday = new Date(thisMonday);
  thisSunday.setDate(thisMonday.getDate() + 6);
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);
  const lastSunday = new Date(lastMonday);
  lastSunday.setDate(lastMonday.getDate() + 6);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const weekRows = (start: Date, end: Date) =>
    sqlite.prepare(`
      SELECT g.score, g.strikes, g.spares, s.date, s.location
      FROM games g
      JOIN sessions s ON s.id = g.session_id
      WHERE s.date >= ? AND s.date <= ?
      ORDER BY s.date ASC
    `).all(fmt(start), fmt(end)) as any[];

  const summarize = (rows: any[]) => {
    if (!rows.length) return { games: 0, average: 0, highGame: 0, totalStrikes: 0, totalSpares: 0, strikeRate: 0, spareRate: 0 };
    const totalScore = rows.reduce((s, r) => s + (r.score || 0), 0);
    const totalStrikes = rows.reduce((s, r) => s + (r.strikes || 0), 0);
    const totalSpares = rows.reduce((s, r) => s + (r.spares || 0), 0);
    return {
      games: rows.length,
      average: Math.round(totalScore / rows.length),
      highGame: Math.max(...rows.map(r => r.score || 0)),
      totalStrikes,
      totalSpares,
      strikeRate: Math.round((totalStrikes / (rows.length * 12)) * 100),
      spareRate: Math.round((totalSpares / (rows.length * 12)) * 100),
    };
  };

  const thisWeekGames = weekRows(thisMonday, thisSunday);
  const lastWeekGames = weekRows(lastMonday, lastSunday);
  const thisWeek = summarize(thisWeekGames);
  const lastWeek = summarize(lastWeekGames);

  const avgDelta = thisWeek.games > 0 && lastWeek.games > 0
    ? thisWeek.average - lastWeek.average
    : null;
  const gamesDelta = thisWeek.games - lastWeek.games;

  return {
    thisWeek: { ...thisWeek, dateRange: `${fmt(thisMonday)} to ${fmt(thisSunday)}` },
    lastWeek: { ...lastWeek, dateRange: `${fmt(lastMonday)} to ${fmt(lastSunday)}` },
    delta: {
      average: avgDelta,
      games: gamesDelta,
      highGame: thisWeek.highGame - lastWeek.highGame,
    },
    dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
  };
});

const getStatsTrend = async () => {
  const games = sqlite.prepare(`
    SELECT * FROM (
      SELECT g.id, g.score, g.game_number, g.session_id, s.date, s.location
      FROM games g
      JOIN sessions s ON s.id = g.session_id
      ORDER BY s.date DESC, g.id DESC
      LIMIT 30
    ) recent
    ORDER BY date ASC, id ASC
  `).all() as any[];

  if (!games.length) return { games: [], rolling5: [], rolling10: [], rolling20: [] };

  const scores = games.map(g => Number(g.score || 0));

  const rolling = (n: number) => scores.map((_, i) => {
    const slice = scores.slice(Math.max(0, i - n + 1), i + 1);
    return Math.round(slice.reduce((a, b) => a + b, 0) / slice.length);
  });

  return {
    games: games.map(g => ({
      id: g.id,
      score: Number(g.score || 0),
      date: g.date,
      location: g.location,
      gameNumber: g.game_number,
    })),
    rolling5: rolling(5),
    rolling10: rolling(10),
    rolling20: rolling(20),
  };
};

fastify.get('/api/stats/trend', getStatsTrend);
// Vite's development proxy removes the /api prefix before forwarding.
fastify.get('/stats/trend', getStatsTrend);

fastify.get('/api/analytics/pin-leaves', async () => {
  const rows = sqlite.prepare(`
    SELECT g.id, g.pin_leaves, g.frame_data, g.score, g.created_at, s.date
    FROM games g
    JOIN sessions s ON s.id = g.session_id
    WHERE g.pin_leaves IS NOT NULL AND g.pin_leaves != ''
    ORDER BY s.date ASC
  `).all() as any[];

  if (!rows.length) {
    return { totalFirstThrows: 0, totalGames: 0, leaves: [], neverLeft: [], byMonth: [] };
  }

  const ALL_PINS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const leaveMap = new Map<string, { count: number; conversions: number }>();
  const byMonthMap = new Map<string, Map<string, { count: number; conversions: number }>>();

  let totalFirstThrows = 0;

  for (const row of rows) {
    let pinSelections: number[][];
    try {
      pinSelections = JSON.parse(row.pin_leaves);
    } catch {
      continue;
    }

    // Parse frame_data to get frame data (for conversion detection)
    let frameDataList: any[] = [];
    try {
      if (row.frame_data) {
        const fd = JSON.parse(row.frame_data);
        frameDataList = fd.frames ?? [];
      }
    } catch { /* ignore */ }

    // Frames 1-9 (indices 0-8): accumulate roll indices
    let rollIdx = 0;
    for (let frameIdx = 0; frameIdx < 9; frameIdx++) {
      const pinsKnocked = pinSelections[rollIdx] ?? [];
      const knockedSet = new Set(pinsKnocked.map(Number));
      const knockedCount = knockedSet.size;

      if (knockedCount < 10) {
        // Not a strike — this is a "first throw" with pin leaves
        const standing = [...ALL_PINS].filter(p => !knockedSet.has(p));
        const pinsKey = standing.join(',');
        totalFirstThrows++;

        // Check if this frame was converted (score > 0, meaning spare or strike on second ball)
        const frame = frameDataList[frameIdx];
        const frameScore = frame?.score ?? null;
        const converted = frameScore != null && frameScore > 0;

        if (!leaveMap.has(pinsKey)) {
          leaveMap.set(pinsKey, { count: 0, conversions: 0 });
        }
        const entry = leaveMap.get(pinsKey)!;
        entry.count++;
        if (converted) entry.conversions++;

        // Monthly breakdown
        const month = String(row.date).slice(0, 7); // "YYYY-MM"
        if (!byMonthMap.has(month)) {
          byMonthMap.set(month, new Map());
        }
        const monthEntry = byMonthMap.get(month)!;
        if (!monthEntry.has(pinsKey)) {
          monthEntry.set(pinsKey, { count: 0, conversions: 0 });
        }
        const m = monthEntry.get(pinsKey)!;
        m.count++;
        if (converted) m.conversions++;

        rollIdx++;
        // Second throw in this frame (spare attempt)
        if (rollIdx < pinSelections.length) rollIdx++;
      } else {
        // Strike — no second ball in this frame
        rollIdx++;
      }
    }

    // Frame 10 (index 9) — up to 3 rolls
    // Track all non-strike rolls as "first throws" for the 10th
    const frame10 = frameDataList[9] ?? null; // { ball1, ball2, ball3, isStrike, isSpare } or null
    for (let i = 0; i < 3 && rollIdx < pinSelections.length; i++) {
      const pinsKnocked = pinSelections[rollIdx] ?? [];
      const knockedCount = pinsKnocked.length;
      if (knockedCount < 10) {
        const knockedSet = new Set(pinsKnocked.map(Number));
        const standing = [...ALL_PINS].filter(p => !knockedSet.has(p));
        const pinsKey = standing.join(',');
        totalFirstThrows++;

        // For 10th frame, conversion: if ball1 wasn't a strike and frame ended with any score
        const frame10Data = frame10;
        const converted = frame10Data
          ? (frame10Data.isStrike || frame10Data.isSpare || (frame10Data.ball2 != null && frame10Data.ball2 > 0))
          : (row.score != null && row.score > 0);

        if (!leaveMap.has(pinsKey)) {
          leaveMap.set(pinsKey, { count: 0, conversions: 0 });
        }
        const entry = leaveMap.get(pinsKey)!;
        entry.count++;
        if (converted) entry.conversions++;
      }
      rollIdx++;
    }
  }

  // Build neverLeft: leaves that were never recorded as a first throw
  // neverLeft: pin combinations never left (only those with 0 count in leaveMap)
  // Since leaveMap only tracks seen leaves, this will be empty unless a specific
  // combination was tracked with count 0 explicitly.
  const neverLeft: string[] = [];

  const total = totalFirstThrows || 1;
  const leaves = [...leaveMap.entries()]
    .filter(([, v]) => v.count > 0)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([pins, v]) => ({
      pins,
      count: v.count,
      pct: Math.round((v.count / total) * 1000) / 10,
      conversions: v.conversions,
      conversionRate: v.count > 0 ? Math.round((v.conversions / v.count) * 1000) / 10 : 0,
    }));

  const byMonth = [...byMonthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, monthLeaves]) => ({
      month,
      leaves: [...monthLeaves.entries()]
        .filter(([, v]) => v.count > 0)
        .sort((a, b) => b[1].count - a[1].count)
        .map(([pins, v]) => ({ pins, count: v.count })),
    }));

  return { totalFirstThrows: total, totalGames: rows.length, leaves, neverLeft, byMonth };
});

fastify.get('/api/balls', async () => db.select().from(balls));
fastify.post('/api/balls', async (request) => {
  const { name, brand, color, notes, bowwwlId, coreType, coreRg, coreDiff, coverstockName, coverstockType, factoryFinish, thumbnailImage } = request.body as any;
  const result = await db.insert(balls).values({ name, brand, color, notes, bowwwlId, coreType, coreRg, coreDiff, coverstockName, coverstockType, factoryFinish, thumbnailImage }).returning();
  return result[0];
});
fastify.put('/api/balls/:id', async (request) => {
  const { id } = request.params as any;
  const { name, brand, color, notes } = request.body as any;
  sqlite.prepare('UPDATE balls SET name=?, brand=?, color=?, notes=? WHERE id=?').run(name, brand, color, notes, parseInt(id));
  return sqlite.prepare('SELECT * FROM balls WHERE id=?').get(parseInt(id));
});
fastify.delete('/api/balls/:id', async (request, reply) => {
  const { id } = request.params as any;
  await db.delete(balls).where(eq(balls.id, parseInt(id)));
  return reply.status(204).send();
});

// GET /api/balls/image-proxy?path=/sites/default/files/... — proxies bowwwl.com ball
// thumbnails back to the browser as same-origin so the frontend can fetch+blob them
// for clipboard writes (CORS would otherwise block a direct cross-origin fetch).
fastify.get('/api/balls/image-proxy', async (request, reply) => {
  const { path: imgPath } = (request.query as any) || {};
  if (!imgPath || typeof imgPath !== 'string' || !imgPath.startsWith('/sites/default/files/')) {
    return reply.status(400).send({ error: 'Only bowwwl.com media paths are allowed' });
  }
  try {
    const upstreamUrl = new URL(imgPath, 'https://www.bowwwl.com');
    if (upstreamUrl.origin !== 'https://www.bowwwl.com') {
      return reply.status(400).send({ error: 'Invalid media path' });
    }
    const upstream = await fetch(upstreamUrl, { signal: AbortSignal.timeout(8_000) });
    if (!upstream.ok) {
      return reply.status(upstream.status).send({ error: `upstream ${upstream.status}` });
    }
    const contentType = (upstream.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
    if (!allowedTypes.has(contentType)) {
      return reply.status(415).send({ error: 'Upstream response is not a supported image' });
    }
    const maxBytes = 5 * 1024 * 1024;
    const declaredBytes = Number(upstream.headers.get('content-length') || 0);
    if (declaredBytes > maxBytes) return reply.status(413).send({ error: 'Image is too large' });
    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.byteLength > maxBytes) return reply.status(413).send({ error: 'Image is too large' });
    reply.header('Content-Type', contentType);
    reply.header('Cache-Control', 'public, max-age=86400');
    return reply.send(buffer);
  } catch (err: any) {
    return reply.status(502).send({ error: `proxy failed: ${err?.message || 'unknown'}` });
  }
});


function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Create tables
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    location TEXT,
    lanes TEXT,
    notes TEXT,
    created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    game_number INTEGER NOT NULL,
    score INTEGER,
    strikes INTEGER,
    spares INTEGER,
    splits INTEGER,
    ball_id INTEGER,
    frame_data TEXT,
    pin_leaves TEXT,
    created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS balls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    brand TEXT,
    color TEXT,
    notes TEXT,
    bowwwl_id TEXT,
    core_type TEXT,
    core_rg TEXT,
    core_diff TEXT,
    coverstock_name TEXT,
    coverstock_type TEXT,
    factory_finish TEXT,
    thumbnail_image TEXT,
    created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS leagues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    location TEXT,
    season TEXT,
    day_of_week TEXT,
    games_per_week INTEGER DEFAULT 3,
    start_date TEXT,
    end_date TEXT,
    notes TEXT,
    active INTEGER DEFAULT 1,
    created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS league_weeks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    league_id INTEGER NOT NULL REFERENCES leagues(id),
    week_number INTEGER NOT NULL,
    date TEXT NOT NULL,
    opponent TEXT,
    games_won INTEGER DEFAULT 0,
    games_lost INTEGER DEFAULT 0,
    games_tied INTEGER DEFAULT 0,
    notes TEXT,
    created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS league_games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_id INTEGER NOT NULL REFERENCES league_weeks(id),
    game_number INTEGER NOT NULL,
    score INTEGER,
    strikes INTEGER,
    spares INTEGER,
    splits INTEGER,
    ball_id INTEGER,
    frame_data TEXT,
    created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS tournaments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    location TEXT,
    date TEXT,
    end_date TEXT,
    format TEXT,
    entry_fee REAL,
    prize_fund REAL,
    placement INTEGER,
    notes TEXT,
    created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS tournament_games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id),
    game_number INTEGER NOT NULL,
    score INTEGER,
    strikes INTEGER,
    spares INTEGER,
    splits INTEGER,
    ball_id INTEGER,
    squad TEXT,
    frame_data TEXT,
    created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS arsenals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    use_case TEXT,
    max_size INTEGER DEFAULT 6,
    notes TEXT,
    created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS arsenal_balls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    arsenal_id INTEGER NOT NULL REFERENCES arsenals(id),
    ball_id INTEGER NOT NULL REFERENCES balls(id),
    role TEXT,
    slot_order INTEGER DEFAULT 0,
    notes TEXT,
    created_at INTEGER
  );
`);

const ballColumns = sqlite.prepare('PRAGMA table_info(balls)').all() as any[];
const ballColNames = ballColumns.map((c: any) => c.name);

const newBallCols = [
  ['bowwwl_id', 'TEXT'],
  ['core_type', 'TEXT'],
  ['core_rg', 'TEXT'],
  ['core_diff', 'TEXT'],
  ['coverstock_name', 'TEXT'],
  ['coverstock_type', 'TEXT'],
  ['factory_finish', 'TEXT'],
  ['thumbnail_image', 'TEXT'],
];
for (const [col, type] of newBallCols) {
  if (!ballColNames.includes(col)) {
    sqlite.exec(`ALTER TABLE balls ADD COLUMN ${col} ${type}`);
  }
}

const gameColumns = sqlite.prepare('PRAGMA table_info(games)').all() as any[];
const gameColNames = gameColumns.map((c: any) => c.name);
if (!gameColNames.includes('frame_data')) {
  sqlite.exec('ALTER TABLE games ADD COLUMN frame_data TEXT');
}
if (!gameColNames.includes('pin_leaves')) {
  sqlite.exec('ALTER TABLE games ADD COLUMN pin_leaves TEXT');
}

const arsenalColumns = sqlite.prepare('PRAGMA table_info(arsenals)').all() as any[];
const arsenalColNames = arsenalColumns.map((c: any) => c.name);
for (const [col, type] of [['description', 'TEXT'], ['use_case', 'TEXT'], ['max_size', 'INTEGER DEFAULT 6']] as const) {
  if (!arsenalColNames.includes(col)) {
    sqlite.exec(`ALTER TABLE arsenals ADD COLUMN ${col} ${type}`);
  }
}

const arsenalBallColumns = sqlite.prepare('PRAGMA table_info(arsenal_balls)').all() as any[];
const arsenalBallColNames = arsenalBallColumns.map((c: any) => c.name);
if (!arsenalBallColNames.includes('slot_order')) {
  sqlite.exec('ALTER TABLE arsenal_balls ADD COLUMN slot_order INTEGER DEFAULT 0');
}

// Migration safety checks for leagues feature
const leagueTables = ['leagues', 'league_weeks', 'league_games'];
for (const table of leagueTables) {
  const exists = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(table);
  if (!exists) {
    if (table === 'leagues') {
      sqlite.exec(`
        CREATE TABLE leagues (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          location TEXT,
          season TEXT,
          day_of_week TEXT,
          games_per_week INTEGER DEFAULT 3,
          start_date TEXT,
          end_date TEXT,
          notes TEXT,
          active INTEGER DEFAULT 1,
          created_at INTEGER
        );
      `);
    }
    if (table === 'league_weeks') {
      sqlite.exec(`
        CREATE TABLE league_weeks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          league_id INTEGER NOT NULL REFERENCES leagues(id),
          week_number INTEGER NOT NULL,
          date TEXT NOT NULL,
          opponent TEXT,
          games_won INTEGER DEFAULT 0,
          games_lost INTEGER DEFAULT 0,
          games_tied INTEGER DEFAULT 0,
          notes TEXT,
          created_at INTEGER
        );
      `);
    }
    if (table === 'league_games') {
      sqlite.exec(`
        CREATE TABLE league_games (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          week_id INTEGER NOT NULL REFERENCES league_weeks(id),
          game_number INTEGER NOT NULL,
          score INTEGER,
          strikes INTEGER,
          spares INTEGER,
          splits INTEGER,
          ball_id INTEGER,
          created_at INTEGER
        );
      `);
    }
  }
}

const lgCols = sqlite.prepare("PRAGMA table_info(league_games)").all() as any[];
if (!lgCols.map((c: any) => c.name).includes('frame_data')) {
  sqlite.exec('ALTER TABLE league_games ADD COLUMN frame_data TEXT');
}

const tgCols = sqlite.prepare("PRAGMA table_info(tournament_games)").all() as any[];
if (!tgCols.map((c: any) => c.name).includes('frame_data')) {
  sqlite.exec('ALTER TABLE tournament_games ADD COLUMN frame_data TEXT');
}
const lwCols = sqlite.prepare("PRAGMA table_info(league_weeks)").all() as any[];
if (!lwCols.map((c: any) => c.name).includes('games_tied')) {
  sqlite.exec('ALTER TABLE league_weeks ADD COLUMN games_tied INTEGER DEFAULT 0');
}

// Routes

// Create session
fastify.post('/sessions', async (request) => {
  const { date, location, lanes, notes } = request.body as any;
  const result = await db.insert(sessions).values({ date, location, lanes, notes }).returning();
  return result[0];
});

// List sessions
fastify.get('/sessions', async (request, reply) => {
  // If the client wants HTML (i.e. they navigated to /sessions in a browser),
  // fall through to the SPA fallback instead of returning API JSON. This
  // lets hard refreshes and shared links land on the React Sessions page
  // instead of dumping a JSON payload in the browser.
  const accept = String((request.headers as any)?.accept || '');
  if (accept.includes('text/html')) {
    return reply.callNotFound();
  }

  const { sort, order, limit: limitQuery, offset: offsetQuery, page, location } = request.query as any;

  const parsedLimit = Number.parseInt(String(limitQuery ?? ''), 10);
  const limit = Math.min(100, Math.max(1, Number.isFinite(parsedLimit) ? parsedLimit : 20));

  const parsedPage = Number.parseInt(String(page ?? ''), 10);
  const parsedOffset = Number.parseInt(String(offsetQuery ?? ''), 10);
  const offset = Number.isFinite(parsedPage) && parsedPage > 0
    ? (parsedPage - 1) * limit
    : Math.max(0, Number.isFinite(parsedOffset) ? parsedOffset : 0);

  const normalizedSort = sort === 'score' || sort === 'location' ? sort : 'date';
  const normalizedOrder = String(order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const sortColumn = normalizedSort === 'score'
    ? 'COALESCE(AVG(g.score), 0)'
    : normalizedSort === 'location'
      ? "COALESCE(s.location, '')"
      : 's.date';

  const hasLocationFilter = location && String(location).trim();
  const locationClause = hasLocationFilter ? `WHERE s.location LIKE '%' || ? || '%'` : '';

  const rows = sqlite.prepare(`
    SELECT s.*,
      COUNT(g.id) as game_count,
      ROUND(AVG(g.score)) as avg_score,
      MAX(g.score) as high_score,
      SUM(CASE WHEN g.score = 300 THEN 1 ELSE 0 END) as perfect_games
    FROM sessions s
    LEFT JOIN games g ON g.session_id = s.id
    ${locationClause}
    GROUP BY s.id
    ORDER BY ${sortColumn} ${normalizedOrder}, s.id ${normalizedOrder}
    LIMIT ? OFFSET ?
  `).all(hasLocationFilter ? [location.trim(), limit, offset] : [limit, offset]) as any[];

  const countSql = hasLocationFilter
    ? `SELECT COUNT(*) as total FROM sessions s ${locationClause}`
    : 'SELECT COUNT(*) as total FROM sessions';
  const totalRow = sqlite.prepare(countSql).get(hasLocationFilter ? [location.trim()] : []) as any;
  const total = Number(totalRow?.total || 0);

  return {
    sessions: rows.map((s) => ({
      id: s.id,
      date: s.date,
      location: s.location,
      lanes: s.lanes,
      notes: s.notes,
      createdAt: s.created_at,
      gameCount: Number(s.game_count || 0),
      avgScore: Number(s.avg_score || 0),
      highScore: Number(s.high_score || 0),
      perfectGames: Number(s.perfect_games || 0),
    })),
    total,
    limit,
    offset,
  };
});

fastify.get('/sessions/count', async () => {
  const row = sqlite.prepare('SELECT COUNT(*) as total FROM sessions').get() as any;
  return { total: Number(row?.total || 0) };
});

// Get session with games
fastify.get('/sessions/:id', async (request, reply) => {
  const { id } = request.params as any;
  // Guard: reject non-numeric IDs that are client-side routes (new, count, etc.)
  // so they fall through to the SPA fallback instead of returning JSON API responses
  if (!id || !/^\d+$/.test(id)) {
    return reply.callNotFound();
  }
  const session = await db.select().from(sessions).where(eq(sessions.id, parseInt(id)));
  const sessionGames = await db.select().from(games).where(eq(games.sessionId, parseInt(id)));
  return { ...session[0], games: sessionGames };
});

// Public session payload for share pages
const getPublicSessionPayload = (sessionId: number) => {
  const session = sqlite.prepare('SELECT id, date, location, lanes, notes FROM sessions WHERE id = ?').get(sessionId) as any;
  if (!session) return null;

  const sessionGames = sqlite
    .prepare('SELECT id, game_number, score, strikes, spares, splits FROM games WHERE session_id = ? ORDER BY game_number ASC, id ASC')
    .all(sessionId) as any[];

  const scores = sessionGames.map((g) => Number(g.score || 0));
  const series = scores.reduce((sum, s) => sum + s, 0);
  const totalGames = sessionGames.length;

  return {
    session: {
      id: session.id,
      date: session.date,
      location: session.location,
      lanes: session.lanes,
    },
    summary: {
      totalGames,
      series,
      average: totalGames ? Math.round(series / totalGames) : 0,
      highGame: totalGames ? Math.max(...scores) : 0,
      perfectGames: sessionGames.filter((g) => Number(g.score || 0) === 300).length,
    },
    games: sessionGames.map((g) => ({
      id: Number(g.id),
      gameNumber: Number(g.game_number || 0),
      score: Number(g.score || 0),
      strikes: Number(g.strikes || 0),
      spares: Number(g.spares || 0),
      splits: Number(g.splits || 0),
    })),
  };
};

fastify.get('/sessions/:id/public', async (request, reply) => {
  const { id } = request.params as any;
  const sessionId = parseInt(id, 10);
  if (Number.isNaN(sessionId)) return reply.status(400).send({ error: 'Invalid session ID' });

  const payload = getPublicSessionPayload(sessionId);
  if (!payload) return reply.status(404).send({ error: 'Session not found' });
  return payload;
});

fastify.get('/api/sessions/:id/public', async (request, reply) => {
  const { id } = request.params as any;
  const sessionId = parseInt(id, 10);
  if (Number.isNaN(sessionId)) return reply.status(400).send({ error: 'Invalid session ID' });

  const payload = getPublicSessionPayload(sessionId);
  if (!payload) return reply.status(404).send({ error: 'Session not found' });
  return payload;
});

// Share session score card (PNG)
fastify.get('/sessions/:id/share-card', async (request, reply) => {
  const { id } = request.params as any;
  const sessionId = parseInt(id, 10);

  const session = sqlite.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any;
  if (!session) return reply.status(404).send({ error: 'Session not found' });

  const sessionGames = sqlite
    .prepare('SELECT * FROM games WHERE session_id = ? ORDER BY game_number ASC, id ASC')
    .all(sessionId) as any[];

  const scores = sessionGames.map((g) => Number(g.score || 0));
  const total = scores.reduce((sum, s) => sum + s, 0);
  const avg = scores.length ? Math.round(total / scores.length) : 0;
  const highScore = scores.length ? Math.max(...scores) : 0;
  const hasPerfectGame = sessionGames.some((g) => Number(g.score || 0) === 300);

  const rawDate = session.date ? new Date(session.date) : null;
  const formattedDate = rawDate && !Number.isNaN(rawDate.getTime())
    ? rawDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : (session.date || 'Unknown date');

  const accent = '#00d4aa';
  const cardCount = Math.max(1, Math.min(6, sessionGames.length || 1));
  const cardGap = 18;
  const cardsStartX = 70;
  const cardsY = 220;
  const cardsAreaWidth = 1060;
  const cardWidth = Math.floor((cardsAreaWidth - (cardGap * (cardCount - 1))) / cardCount);
  const visibleGames = sessionGames.slice(0, 6);

  const gameCards = visibleGames.map((g, idx) => {
    const x = cardsStartX + (idx * (cardWidth + cardGap));
    const score = Number(g.score || 0);
    const isHigh = score === highScore && highScore > 0;
    const border = isHigh ? accent : '#2b2b44';
    const scoreColor = isHigh ? accent : '#ffffff';

    return `
      <rect x="${x}" y="${cardsY}" width="${cardWidth}" height="190" rx="16" fill="#16162a" stroke="${border}" stroke-width="2" />
      <text x="${x + 16}" y="252" font-size="20" font-weight="700" fill="#a6a6c2" font-family="Arial, sans-serif">Game ${g.game_number}</text>
      <text x="${x + 16}" y="323" font-size="70" font-weight="800" fill="${scoreColor}" font-family="Arial, sans-serif">${score}</text>
      <text x="${x + 16}" y="355" font-size="20" fill="#9da0be" font-family="Arial, sans-serif">⚡ ${Number(g.strikes || 0)}   ✅ ${Number(g.spares || 0)}   🔀 ${Number(g.splits || 0)}</text>
      ${isHigh ? `<text x="${x + 16}" y="387" font-size="16" font-weight="700" fill="${accent}" font-family="Arial, sans-serif">HIGH GAME</text>` : ''}
    `;
  }).join('');

  const moreGamesNote = sessionGames.length > 6
    ? `<text x="70" y="435" font-size="16" fill="#8b8faf" font-family="Arial, sans-serif">Showing first 6 games of ${sessionGames.length}</text>`
    : '';

  const perfectBadge = hasPerfectGame
    ? `
      <rect x="860" y="84" width="270" height="44" rx="22" fill="#2a2140" stroke="${accent}" stroke-width="2" />
      <text x="995" y="113" text-anchor="middle" font-size="22" font-weight="700" fill="${accent}" font-family="Arial, sans-serif">PERFECT GAME 🏆</text>
    `
    : '';

  const locationText = escapeXml(session.location || 'Unknown location');
  const svg = `
    <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0f0f1a"/>
          <stop offset="100%" stop-color="#17172b"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="630" fill="url(#bgGrad)"/>
      <circle cx="1100" cy="110" r="180" fill="rgba(0, 212, 170, 0.08)" />

      <text x="70" y="90" font-size="52" font-weight="800" fill="#ffffff" font-family="Arial, sans-serif">🎳 BowlSense</text>
      <text x="70" y="130" font-size="27" fill="#b2b5d3" font-family="Arial, sans-serif">${escapeXml(formattedDate)} · ${locationText}</text>

      <rect x="70" y="150" width="360" height="54" rx="12" fill="#1b1b33" stroke="#2b2b44" stroke-width="1.5" />
      <text x="92" y="185" font-size="28" font-weight="700" fill="#ffffff" font-family="Arial, sans-serif">Series ${total}</text>
      <text x="290" y="185" font-size="24" font-weight="700" fill="#9da0be" font-family="Arial, sans-serif">Avg ${avg}</text>

      ${perfectBadge}
      ${gameCards}
      ${moreGamesNote}

      <text x="70" y="596" font-size="20" fill="#6f7394" font-family="Arial, sans-serif">Track your game at BowlSense</text>
    </svg>
  `;

  const png = await sharp(Buffer.from(svg)).png().toBuffer();

  reply.header('Content-Type', 'image/png');
  reply.header('Cache-Control', 'no-store');
  return reply.send(png);
});

fastify.get('/api/sessions/:id/share-card', async (request, reply) => {
  const { id } = request.params as any;
  const response = await internalRequest({ method: 'GET', url: `/sessions/${id}/share-card` });
  return relayInjectedResponse(reply, response);
});

// Session OG image (1200x630 PNG for social sharing) — mirrors /sessions/:id/share-card logic
fastify.get('/api/sessions/:id/og-image', async (request, reply) => {
  const { id } = request.params as any;
  const sessionId = parseInt(id, 10);
  if (Number.isNaN(sessionId)) return reply.status(400).send({ error: 'Invalid session ID' });

  const session = sqlite.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any;
  if (!session) return reply.status(404).send({ error: 'Session not found' });

  const sessionGames = sqlite
    .prepare('SELECT * FROM games WHERE session_id = ? ORDER BY game_number ASC, id ASC')
    .all(sessionId) as any[];

  const scores = sessionGames.map((g) => Number(g.score || 0));
  const total = scores.reduce((sum, s) => sum + s, 0);
  const avg = scores.length ? Math.round(total / scores.length) : 0;
  const highScore = scores.length ? Math.max(...scores) : 0;
  const hasPerfectGame = sessionGames.some((g) => Number(g.score || 0) === 300);

  const rawDate = session.date ? new Date(session.date) : null;
  const formattedDate = rawDate && !Number.isNaN(rawDate.getTime())
    ? rawDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : (session.date || 'Unknown date');

  const accent = '#00d4aa';
  const cardCount = Math.max(1, Math.min(6, sessionGames.length || 1));
  const cardGap = 18;
  const cardsStartX = 70;
  const cardsY = 220;
  const cardsAreaWidth = 1060;
  const cardWidth = Math.floor((cardsAreaWidth - (cardGap * (cardCount - 1))) / cardCount);
  const visibleGames = sessionGames.slice(0, 6);

  const gameCards = visibleGames.map((g, idx) => {
    const x = cardsStartX + (idx * (cardWidth + cardGap));
    const score = Number(g.score || 0);
    const isHigh = score === highScore && highScore > 0;
    const border = isHigh ? accent : '#2b2b44';
    const scoreColor = isHigh ? accent : '#ffffff';

    return `
      <rect x="${x}" y="${cardsY}" width="${cardWidth}" height="190" rx="16" fill="#16162a" stroke="${border}" stroke-width="2" />
      <text x="${x + 16}" y="252" font-size="20" font-weight="700" fill="#a6a6c2" font-family="Arial, sans-serif">Game ${g.game_number}</text>
      <text x="${x + 16}" y="323" font-size="70" font-weight="800" fill="${scoreColor}" font-family="Arial, sans-serif">${score}</text>
      <text x="${x + 16}" y="355" font-size="20" fill="#9da0be" font-family="Arial, sans-serif">⚡ ${Number(g.strikes || 0)}   ✅ ${Number(g.spares || 0)}   🔀 ${Number(g.splits || 0)}</text>
      ${isHigh ? `<text x="${x + 16}" y="387" font-size="16" font-weight="700" fill="${accent}" font-family="Arial, sans-serif">HIGH GAME</text>` : ''}
    `;
  }).join('');

  const moreGamesNote = sessionGames.length > 6
    ? `<text x="70" y="435" font-size="16" fill="#8b8faf" font-family="Arial, sans-serif">Showing first 6 games of ${sessionGames.length}</text>`
    : '';

  const perfectBadge = hasPerfectGame
    ? `
      <rect x="860" y="84" width="270" height="44" rx="22" fill="#2a2140" stroke="${accent}" stroke-width="2" />
      <text x="995" y="113" text-anchor="middle" font-size="22" font-weight="700" fill="${accent}" font-family="Arial, sans-serif">PERFECT GAME 🏆</text>
    `
    : '';

  const locationText = escapeXml(session.location || 'Unknown location');
  const svg = `
    <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0f0f1a"/>
          <stop offset="100%" stop-color="#17172b"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="630" fill="url(#bgGrad)"/>
      <circle cx="1100" cy="110" r="180" fill="rgba(0, 212, 170, 0.08)" />

      <text x="70" y="90" font-size="52" font-weight="800" fill="#ffffff" font-family="Arial, sans-serif">🎳 BowlSense</text>
      <text x="70" y="130" font-size="27" fill="#b2b5d3" font-family="Arial, sans-serif">${escapeXml(formattedDate)} · ${locationText}</text>

      <rect x="70" y="150" width="360" height="54" rx="12" fill="#1b1b33" stroke="#2b2b44" stroke-width="1.5" />
      <text x="92" y="185" font-size="28" font-weight="700" fill="#ffffff" font-family="Arial, sans-serif">Series ${total}</text>
      <text x="290" y="185" font-size="24" font-weight="700" fill="#9da0be" font-family="Arial, sans-serif">Avg ${avg}</text>

      ${perfectBadge}
      ${gameCards}
      ${moreGamesNote}

      <text x="70" y="596" font-size="20" fill="#6f7394" font-family="Arial, sans-serif">Track your game at BowlSense</text>
    </svg>
  `;

  const png = await sharp(Buffer.from(svg)).png().toBuffer();

  reply.header('Content-Type', 'image/png');
  reply.header('Cache-Control', 'public, max-age=86400');
  return reply.send(png);
});

// Static OG share image (PNG rendered from SVG)
fastify.get('/sessions/share-og.png', async (_request, reply) => {
  const svgPath = join(__dirname, 'assets', 'share-og.svg');
  const svg = readFileSync(svgPath, 'utf8');
  const png = await sharp(Buffer.from(svg)).png().toBuffer();

  reply.header('Content-Type', 'image/png');
  reply.header('Cache-Control', 'public, max-age=3600');
  return reply.send(png);
});

// Edit session
fastify.put('/sessions/:id', async (request, reply) => {
  const { id } = request.params as any;
  const { date, location, lanes, notes } = request.body as any;
  const result = sqlite.prepare(
    'UPDATE sessions SET date=?, location=?, lanes=?, notes=? WHERE id=?'
  ).run(date, location, lanes, notes, parseInt(id));
  if (result.changes === 0) return reply.status(404).send({ error: 'Not found' });
  return sqlite.prepare('SELECT * FROM sessions WHERE id=?').get(parseInt(id));
});

// Delete session + games
fastify.delete('/sessions/:id', async (request, reply) => {
  const { id } = request.params as any;
  sqlite.prepare('DELETE FROM games WHERE session_id=?').run(parseInt(id));
  sqlite.prepare('DELETE FROM sessions WHERE id=?').run(parseInt(id));
  return reply.status(204).send();
});

// Add game to session
fastify.post('/games', async (request) => {
  const { sessionId, gameNumber, score, strikes, spares, splits, ballId, frameData, pinLeaves } = request.body as any;
  const result = await db.insert(games).values({ sessionId, gameNumber, score, strikes, spares, splits, ballId, frameData, pinLeaves }).returning();
  return result[0];
});

// Edit game
fastify.put('/games/:id', async (request) => {
  const { id } = request.params as any;
  const { score, strikes, spares, splits, ballId, frameData, pinLeaves } = request.body as any;
  sqlite.prepare(
    'UPDATE games SET score=?, strikes=?, spares=?, splits=?, ball_id=?, frame_data=?, pin_leaves=? WHERE id=?'
  ).run(score, strikes, spares, splits, ballId ?? null, frameData ?? null, pinLeaves ?? null, parseInt(id));
  return sqlite.prepare('SELECT * FROM games WHERE id=?').get(parseInt(id));
});

// Get stats
fastify.get('/stats', async (request, reply) => {
  // Serve the SPA when the request looks like a browser navigation
  const accept = String((request.headers as any)?.accept || '');
  if (accept.includes('text/html')) {
    return reply.callNotFound();
  }

  return buildPublicStats();
});

// Balls CRUD
fastify.get('/balls', async (request, reply) => {
  // Serve the SPA when the request looks like a browser navigation
  const accept = String((request.headers as any)?.accept || '');
  if (accept.includes('text/html')) {
    return reply.callNotFound();
  }
  return db.select().from(balls);
});

// GET /api/sessions — alias for the SPA (avoids Vite proxy dependency)
// Frontend calls: fetch('/api/sessions?limit=100&offset=0')
fastify.get('/api/sessions', async (request) => {
  const { sort, order, limit: limitQuery, offset: offsetQuery, page, location } = request.query as any;

  const parsedLimit = Number.parseInt(String(limitQuery ?? ''), 10);
  const limit = Math.min(100, Math.max(1, Number.isFinite(parsedLimit) ? parsedLimit : 20));

  const parsedPage = Number.parseInt(String(page ?? ''), 10);
  const parsedOffset = Number.parseInt(String(offsetQuery ?? ''), 10);
  const offset = Number.isFinite(parsedPage) && parsedPage > 0
    ? (parsedPage - 1) * limit
    : Math.max(0, Number.isFinite(parsedOffset) ? parsedOffset : 0);

  const normalizedSort = sort === 'score' || sort === 'location' ? sort : 'date';
  const normalizedOrder = String(order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const sortColumn = normalizedSort === 'score'
    ? 'COALESCE(AVG(g.score), 0)'
    : normalizedSort === 'location'
      ? "COALESCE(s.location, '')"
      : 's.date';

  const hasLocationFilter = location && String(location).trim();
  const locationClause = hasLocationFilter ? `WHERE s.location LIKE '%' || ? || '%'` : '';

  const rows = sqlite.prepare(`
    SELECT s.*,
      COUNT(g.id) as game_count,
      ROUND(AVG(g.score)) as avg_score,
      MAX(g.score) as high_score,
      SUM(CASE WHEN g.score = 300 THEN 1 ELSE 0 END) as perfect_games
    FROM sessions s
    LEFT JOIN games g ON g.session_id = s.id
    ${locationClause}
    GROUP BY s.id
    ORDER BY ${sortColumn} ${normalizedOrder}, s.id ${normalizedOrder}
    LIMIT ? OFFSET ?
  `).all(hasLocationFilter ? [location.trim(), limit, offset] : [limit, offset]) as any[];

  const countSql = hasLocationFilter
    ? `SELECT COUNT(*) as total FROM sessions s ${locationClause}`
    : 'SELECT COUNT(*) as total FROM sessions';
  const totalRow = sqlite.prepare(countSql).get(hasLocationFilter ? [location.trim()] : []) as any;
  const total = Number(totalRow?.total || 0);

  return {
    sessions: rows.map((s) => ({
      id: s.id,
      date: s.date,
      location: s.location,
      lanes: s.lanes,
      notes: s.notes,
      createdAt: s.created_at,
      gameCount: Number(s.game_count || 0),
      avgScore: Number(s.avg_score || 0),
      highScore: Number(s.high_score || 0),
      perfectGames: Number(s.perfect_games || 0),
    })),
    total,
    limit,
    offset,
  };
});


// Search ball database (must be before /balls/:id)
fastify.get('/balls/search', async (request, reply) => {
  const { q } = request.query as any;
  if (!q || q.length < 2) return reply.status(400).send({ error: 'Query too short' });
  const res = await fetch('https://www.bowwwl.com/restapi/balls?_format=json');
  const all = (await res.json()) as any[];
  const lower = (q as string).toLowerCase();
  const filtered = all.filter((b: any) => b.ball_name?.toLowerCase().includes(lower)).slice(0, 10);
  return filtered;
});

fastify.post('/balls', async (request) => {
  const { name, brand, color, notes, bowwwlId, coreType, coreRg, coreDiff, coverstockName, coverstockType, factoryFinish, thumbnailImage } = request.body as any;
  const result = await db.insert(balls).values({ name, brand, color, notes, bowwwlId, coreType, coreRg, coreDiff, coverstockName, coverstockType, factoryFinish, thumbnailImage }).returning();
  return result[0];
});

fastify.put('/balls/:id', async (request) => {
  const { id } = request.params as any;
  const { name, brand, color, notes } = request.body as any;
  sqlite.prepare('UPDATE balls SET name=?, brand=?, color=?, notes=? WHERE id=?').run(name, brand, color, notes, parseInt(id));
  return sqlite.prepare('SELECT * FROM balls WHERE id=?').get(parseInt(id));
});

fastify.delete('/balls/:id', async (request, reply) => {
  const { id } = request.params as any;
  await db.delete(balls).where(eq(balls.id, parseInt(id)));
  return reply.status(204).send();
});

// Public game share payload (no auth)
fastify.get('/games/:id/public', async (request, reply) => {
  const { id } = request.params as any;
  const gameId = parseInt(id, 10);

  const row = sqlite.prepare(`
    SELECT
      g.id,
      g.game_number as gameNumber,
      g.score,
      g.strikes,
      g.spares,
      g.splits,
      g.frame_data as frameData,
      b.name as ballName,
      s.date,
      s.location,
      s.lanes
    FROM games g
    JOIN sessions s ON s.id = g.session_id
    LEFT JOIN balls b ON b.id = g.ball_id
    WHERE g.id = ?
  `).get(gameId) as any;

  if (!row) return reply.status(404).send({ error: 'Game not found' });

  return {
    game: {
      id: row.id,
      gameNumber: Number(row.gameNumber || 0),
      score: Number(row.score || 0),
      strikes: Number(row.strikes || 0),
      spares: Number(row.spares || 0),
      splits: Number(row.splits || 0),
      frameData: row.frameData ?? null,
      ballName: row.ballName ?? null,
    },
    session: {
      date: row.date,
      location: row.location,
      lanes: row.lanes,
    },
    player: null,
  };
});

fastify.get('/api/games/:id/public', async (request, reply) => {
  const { id } = request.params as any;
  const response = await internalRequest({ method: 'GET', url: `/games/${id}/public` });
  return relayInjectedResponse(reply, response);
});

// OG Image generator for game share cards
function parseFramesOG(frameData: string | null): string[] {
  if (!frameData) return []
  try {
    const parsed = JSON.parse(frameData)
    const frames: any[] = Array.isArray(parsed?.frames) ? parsed.frames : []
    const mark = (v: number | null | undefined) => {
      if (v == null) return ''
      if (v === 10) return 'X'
      if (v === 0) return '-'
      return String(v)
    }
    return frames.map((f: any, idx: number) => {
      const b1 = f?.ball1
      const b2 = f?.ball2
      const b3 = f?.ball3
      if (idx < 9) {
        if (b1 === 10) return 'X'
        if (b1 == null) return ''
        if (b2 == null) return mark(b1)
        return b1 + b2 === 10 ? `${mark(b1)}/` : `${mark(b1)}${mark(b2)}`
      }
      const first = mark(b1)
      const second = b2 != null ? (b1 !== 10 && b1 + b2 === 10 ? '/' : mark(b2)) : ''
      const third = b3 != null ? (b1 === 10 && b2 != null && b2 < 10 && b2 + b3 === 10 ? '/' : mark(b3)) : ''
      return `${first}${second}${third}`
    })
  } catch {
    return []
  }
}

function buildGameOgSvg(opts: {
  score: number
  gameNumber: number
  marks: string[]
  location: string
  date: string
  lanes?: string
  ballName?: string
}): string {
  const { score, gameNumber, marks, location, date, lanes, ballName } = opts
  const isPerfect = score === 300
  const isElite = score >= 280
  const scoreColor = isPerfect ? '#fbbf24' : isElite ? '#f59e0b' : '#a78bfa'

  // Frame layout
  const frameY = 340
  const frameH = 90
  const frameGap = 10
  const frameW = 82
  const frameW10 = 108
  const totalFramesWidth = frameW * 9 + frameW10 + frameGap * 9
  const startX = Math.round((1200 - totalFramesWidth) / 2)

  const accent = isPerfect ? '#fbbf24' : '#7c3aed'

  const framesSvg = Array.from({ length: 10 }, (_, i) => {
    const fw = i === 9 ? frameW10 : frameW
    const x = startX + i * (frameW + frameGap)
    const mark = marks[i] || ''
    const upper = mark.toUpperCase()
    const isStrike = upper.includes('X')
    const isSpare = upper.includes('/')
    const markColor = isStrike ? '#a78bfa' : isSpare ? '#c4b5fd' : '#ffffff'
    const frameNumX = x + 8
    const frameNumY = frameY + 18
    const markX = x + fw / 2
    const markY = frameY + frameH / 2 + 14
    return `<text x="${frameNumX}" y="${frameNumY}" font-size="13" font-weight="600" fill="rgba(255,255,255,0.55)" font-family="Arial, sans-serif">${i + 1}</text>
    <text x="${markX}" y="${markY}" font-size="${i === 9 ? 28 : 34}" font-weight="700" fill="${markColor}" font-family="Arial, sans-serif" text-anchor="middle">${escapeXml(mark || '·')}</text>`
  }).join('')

  const framesRect = Array.from({ length: 10 }, (_, i) => {
    const fw = i === 9 ? frameW10 : frameW
    const x = startX + i * (frameW + frameGap)
    return `<rect x="${x}" y="${frameY}" width="${fw}" height="${frameH}" rx="12" ry="12" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>`
  }).join('')

  const perfectBadge = isPerfect
    ? `<rect x="490" y="32" width="220" height="40" rx="20" fill="#fbbf24"/>
       <text x="600" y="59" font-size="17" font-weight="700" fill="#0f0f1a" font-family="Arial, sans-serif" text-anchor="middle">🏆 PERFECT GAME</text>`
    : ''

  const ballText = ballName ? `<text x="1176" y="598" font-size="18" font-weight="600" fill="rgba(255,255,255,0.85)" font-family="Arial, sans-serif" text-anchor="end">🎳 ${escapeXml(ballName)}</text>` : ''

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0d0d1a"/>
      <stop offset="100%" stop-color="#13132a"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="30%" r="55%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <rect x="0" y="0" width="1200" height="6" fill="${accent}"/>

  <!-- Branding -->
  <text x="36" y="46" font-size="15" font-weight="500" fill="rgba(255,255,255,0.6)" font-family="Arial, sans-serif">🎳 BowlSense</text>

  ${perfectBadge}

  <!-- Score -->
  <text x="600" y="230" font-size="${isPerfect ? 148 : 128}" font-weight="900" fill="${scoreColor}" font-family="Arial, sans-serif" text-anchor="middle">${score}</text>

  <!-- Frames -->
  ${framesRect}
  ${framesSvg}

  <!-- Location / date row -->
  <text x="36" y="580" font-size="20" font-weight="700" fill="#ffffff" font-family="Arial, sans-serif">${escapeXml(location || 'Unknown Alley')}</text>
  <text x="36" y="610" font-size="16" font-weight="500" fill="rgba(255,255,255,0.6)" font-family="Arial, sans-serif">${escapeXml(date || '')}${lanes ? ` · Lanes ${escapeXml(lanes)}` : ''}</text>

  ${ballText}

  <!-- Footer -->
  <text x="1176" y="46" font-size="13" font-weight="500" fill="rgba(255,255,255,0.4)" font-family="Arial, sans-serif" text-anchor="end">bowlsense.app</text>
</svg>`
}

fastify.get('/api/games/:id/og-image', async (request, reply) => {
  const { id } = request.params as any
  const gameId = parseInt(id, 10)
  if (Number.isNaN(gameId)) return reply.status(400).send({ error: 'Invalid game ID' })

  const row = sqlite.prepare(`
    SELECT
      g.id,
      g.game_number as gameNumber,
      g.score,
      g.frame_data as frameData,
      b.name as ballName,
      s.date,
      s.location,
      s.lanes
    FROM games g
    JOIN sessions s ON s.id = g.session_id
    LEFT JOIN balls b ON b.id = g.ball_id
    WHERE g.id = ?
  `).get(gameId) as any

  if (!row) return reply.status(404).send({ error: 'Game not found' })

  const marks = parseFramesOG(row.frame_data)
  const svg = buildGameOgSvg({
    score: Number(row.score || 0),
    gameNumber: Number(row.gameNumber || 0),
    marks,
    location: row.location || 'Unknown Alley',
    date: row.date || '',
    lanes: row.lanes || '',
    ballName: row.ballName || undefined,
  })

  const png = await sharp(Buffer.from(svg, 'utf8')).png().toBuffer()

  reply.header('Content-Type', 'image/png')
  reply.header('Cache-Control', 'public, max-age=86400')
  return reply.send(png)
})

// Delete game
fastify.delete('/games/:id', async (request, reply) => {
  const { id } = request.params as any;
  await db.delete(games).where(eq(games.id, parseInt(id)));
  return reply.status(204).send();
});

// Leagues CRUD and related routes
fastify.get('/leagues', async (request, reply) => {
  // Serve the SPA when the request looks like a browser navigation
  const accept = String((request.headers as any)?.accept || '');
  if (accept.includes('text/html')) {
    return reply.callNotFound();
  }

  const leaguesRows = sqlite.prepare(`
    SELECT l.*,
           COUNT(DISTINCT lw.id) as weekCount,
           COALESCE(SUM(lw.games_won), 0) as gamesWon,
           COALESCE(SUM(lw.games_lost), 0) as gamesLost
    FROM leagues l
    LEFT JOIN league_weeks lw ON lw.league_id = l.id
    WHERE l.active = 1
    GROUP BY l.id
    ORDER BY l.created_at DESC, l.id DESC
  `).all() as any[];

  return leaguesRows.map((l) => ({
    id: l.id,
    name: l.name,
    location: l.location,
    season: l.season,
    dayOfWeek: l.day_of_week,
    gamesPerWeek: l.games_per_week,
    startDate: l.start_date,
    endDate: l.end_date,
    notes: l.notes,
    active: l.active,
    createdAt: l.created_at,
    weekCount: Number(l.weekCount || 0),
    gamesWon: Number(l.gamesWon || 0),
    gamesLost: Number(l.gamesLost || 0),
  }));
});

// Alias: GET /api/leagues — mirrors /leagues for SPA clients
fastify.get('/api/leagues', async () => {
  const leaguesRows = sqlite.prepare(`
    SELECT l.*,
           COUNT(DISTINCT lw.id) as weekCount,
           COALESCE(SUM(lw.games_won), 0) as gamesWon,
           COALESCE(SUM(lw.games_lost), 0) as gamesLost
    FROM leagues l
    LEFT JOIN league_weeks lw ON lw.league_id = l.id
    WHERE l.active = 1
    GROUP BY l.id
    ORDER BY l.created_at DESC, l.id DESC
  `).all() as any[];

  return leaguesRows.map((l) => ({
    id: l.id,
    name: l.name,
    location: l.location,
    season: l.season,
    dayOfWeek: l.day_of_week,
    gamesPerWeek: l.games_per_week,
    startDate: l.start_date,
    endDate: l.end_date,
    notes: l.notes,
    active: l.active,
    createdAt: l.created_at,
    weekCount: Number(l.weekCount || 0),
    gamesWon: Number(l.gamesWon || 0),
    gamesLost: Number(l.gamesLost || 0),
  }));
});

fastify.post('/api/leagues', async (request, reply) => {
  const { name, location, season, dayOfWeek, gamesPerWeek, startDate, endDate, notes, active } = request.body as any;
  if (!name?.trim()) return reply.status(400).send({ error: 'League name is required' });
  const result = sqlite.prepare(`
    INSERT INTO leagues (name, location, season, day_of_week, games_per_week, start_date, end_date, notes, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name.trim(), location || null, season || null,
    dayOfWeek || null, gamesPerWeek || null,
    startDate || null, endDate || null,
    notes || null, active !== undefined ? (active ? 1 : 0) : 1,
    Date.now(),
  );
  const row = sqlite.prepare('SELECT * FROM leagues WHERE id = ?').get(result.lastInsertRowid) as any;
  return { id: row.id, ...row };
});

fastify.post('/leagues', async (request, reply) => {
  const { name, location, season, dayOfWeek, gamesPerWeek, startDate, endDate, notes } = request.body as any;
  if (!name?.trim()) return reply.status(400).send({ error: 'League name is required' });

  const result = sqlite.prepare(`
    INSERT INTO leagues (name, location, season, day_of_week, games_per_week, start_date, end_date, notes, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `).run(
    name.trim(),
    location || null,
    season || null,
    dayOfWeek || null,
    Math.max(1, Number(gamesPerWeek || 3)),
    startDate || null,
    endDate || null,
    notes || null,
    Date.now(),
  );

  const league = sqlite.prepare('SELECT * FROM leagues WHERE id = ?').get(result.lastInsertRowid) as any;
  return {
    id: league.id,
    name: league.name,
    location: league.location,
    season: league.season,
    dayOfWeek: league.day_of_week,
    gamesPerWeek: league.games_per_week,
    startDate: league.start_date,
    endDate: league.end_date,
    notes: league.notes,
    active: league.active,
    createdAt: league.created_at,
  };
});

// ── Dashboard "Tonight's League" ──
// Returns leagues scheduled for today (matched by day_of_week) plus a
// "next-week" payload so the dashboard can offer one-tap logging.
// Both /dashboard/tonight and /api/dashboard/tonight are exposed.
const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function buildTonightPayload() {
  const todayName = dayNames[new Date().getDay()]
  const todayIso = new Date().toISOString().slice(0, 10)

  // Active leagues scheduled for today
  const leagues = sqlite.prepare(`
    SELECT id, name, location, season, day_of_week, games_per_week, start_date, end_date
    FROM leagues
    WHERE active = 1 AND day_of_week = ?
    ORDER BY name ASC
  `).all(todayName) as any[]

  return leagues.map(l => {
    // Last logged week (so we can show "your avg was X last week")
    const lastWeek = sqlite.prepare(`
      SELECT id, week_number, date, opponent, games_won, games_lost, games_tied
      FROM league_weeks
      WHERE league_id = ?
      ORDER BY week_number DESC, date DESC
      LIMIT 1
    `).get(l.id) as any

    // Lifetime stats (lightweight — just enough for the card)
    const stats = sqlite.prepare(`
      SELECT
        ROUND(AVG(lg.score)) as average,
        MAX(lg.score) as high,
        COUNT(lg.id) as totalGames,
        COUNT(DISTINCT lw.id) as totalWeeks,
        COALESCE(SUM(lw.games_won), 0) as gamesWon,
        COALESCE(SUM(lw.games_lost), 0) as gamesLost
      FROM league_games lg
      LEFT JOIN league_weeks lw ON lw.id = lg.week_id
      WHERE lw.league_id = ?
    `).get(l.id) as any

    // Last opponent (so the user knows who they're facing tonight)
    const lastOpponent = lastWeek?.opponent ?? null

    // Suggested week number = last + 1, or 1 if none
    const nextWeekNumber = lastWeek ? Number(lastWeek.week_number) + 1 : 1

    // Within season window?
    const inSeason = (() => {
      if (!l.start_date && !l.end_date) return true
      if (l.start_date && todayIso < l.start_date) return false
      if (l.end_date && todayIso > l.end_date) return false
      return true
    })()

    return {
      id: l.id,
      name: l.name,
      location: l.location,
      season: l.season,
      gamesPerWeek: l.games_per_week,
      startDate: l.start_date,
      endDate: l.end_date,
      todayName,
      todayIso,
      inSeason,
      nextWeekNumber,
      lastOpponent,
      lastWeekDate: lastWeek?.date ?? null,
      stats: {
        average: stats?.average ?? 0,
        high: stats?.high ?? 0,
        totalGames: stats?.totalGames ?? 0,
        totalWeeks: stats?.totalWeeks ?? 0,
        gamesWon: stats?.gamesWon ?? 0,
        gamesLost: stats?.gamesLost ?? 0,
      },
    }
  })
}

fastify.get('/api/dashboard/tonight', async () => buildTonightPayload())
fastify.get('/dashboard/tonight', async () => buildTonightPayload())

fastify.get('/leagues/:id/stats', async (request) => {
  const { id } = request.params as any;
  const leagueId = parseInt(id);

  const overall = sqlite.prepare(`
    SELECT
      ROUND(AVG(lg.score)) as average,
      MAX(lg.score) as high,
      MIN(lg.score) as low,
      COALESCE(SUM(lg.score), 0) as totalPins,
      COUNT(lg.id) as totalGames,
      COALESCE(SUM(lw.games_won), 0) as gamesWon,
      COALESCE(SUM(lw.games_lost), 0) as gamesLost,
      COUNT(DISTINCT lw.id) as totalWeeks
    FROM leagues l
    LEFT JOIN league_weeks lw ON lw.league_id = l.id
    LEFT JOIN league_games lg ON lg.week_id = lw.id
    WHERE l.id = ?
  `).get(leagueId) as any;

  const byWeek = sqlite.prepare(`
    SELECT
      lw.id as weekId,
      lw.week_number as weekNumber,
      lw.date,
      ROUND(AVG(lg.score)) as average,
      COUNT(lg.id) as games
    FROM league_weeks lw
    LEFT JOIN league_games lg ON lg.week_id = lw.id
    WHERE lw.league_id = ?
    GROUP BY lw.id
    ORDER BY lw.week_number ASC
  `).all(leagueId) as any[];

  return {
    average: Number(overall?.average || 0),
    high: Number(overall?.high || 0),
    low: Number(overall?.low || 0),
    totalPins: Number(overall?.totalPins || 0),
    totalGames: Number(overall?.totalGames || 0),
    gamesWon: Number(overall?.gamesWon || 0),
    gamesLost: Number(overall?.gamesLost || 0),
    totalWeeks: Number(overall?.totalWeeks || 0),
    weekByWeekAverages: byWeek.map((w) => ({
      weekId: w.weekId,
      weekNumber: w.weekNumber,
      date: w.date,
      average: Number(w.average || 0),
      games: Number(w.games || 0),
    })),
  };
});

fastify.get('/leagues/:id/standings', async (request, reply) => {
  const { id } = request.params as any;
  const leagueId = parseInt(id);

  const league = sqlite.prepare('SELECT id, games_per_week FROM leagues WHERE id = ?').get(leagueId) as any;
  if (!league) return reply.status(404).send({ error: 'League not found' });

  const overall = sqlite.prepare(`
    SELECT
      COALESCE(SUM(lg.score), 0) as totalPins,
      COUNT(lg.id) as totalGames,
      ROUND(AVG(lg.score), 1) as leagueAverage
    FROM league_weeks lw
    LEFT JOIN league_games lg ON lg.week_id = lw.id
    WHERE lw.league_id = ?
  `).get(leagueId) as any;

  const baseOpponentAvg = Number(overall?.leagueAverage || 0);

  const weekRows = sqlite.prepare(`
    SELECT
      lw.id as weekId,
      lw.week_number as weekNumber,
      lw.date as date,
      ROUND(AVG(lg.score), 1) as yourAvg,
      COALESCE(SUM(lg.score), 0) as weekPins,
      COUNT(lg.id) as games,
      MAX(lg.score) as bestGame
    FROM league_weeks lw
    LEFT JOIN league_games lg ON lg.week_id = lw.id
    WHERE lw.league_id = ?
    GROUP BY lw.id
    ORDER BY lw.week_number ASC
  `).all(leagueId) as any[];

  let cumulativePins = 0;
  let cumulativeGames = 0;
  let cumulativeWins = 0;
  let cumulativeLosses = 0;
  let cumulativeTies = 0;

  const weeks = weekRows.map((w) => {
    const yourAvg = Number(w.yourAvg || 0);
    const opponentAvg = Number(baseOpponentAvg || 0);
    const margin = yourAvg && opponentAvg ? Number((yourAvg - opponentAvg).toFixed(1)) : 0;

    let result: 'W' | 'L' | 'T' = 'T';
    if (yourAvg > opponentAvg) result = 'W';
    else if (yourAvg < opponentAvg) result = 'L';

    if (result === 'W') cumulativeWins += 1;
    if (result === 'L') cumulativeLosses += 1;
    if (result === 'T') cumulativeTies += 1;

    const weekPins = Number(w.weekPins || 0);
    const games = Number(w.games || 0);
    cumulativePins += weekPins;
    cumulativeGames += games;

    return {
      weekId: Number(w.weekId),
      weekNumber: Number(w.weekNumber),
      date: w.date,
      yourAvg,
      opponentAvg,
      result,
      margin,
      bestGame: Number(w.bestGame || 0),
      games,
      weekPins,
      cumulative: {
        pins: cumulativePins,
        games: cumulativeGames,
        average: cumulativeGames ? Number((cumulativePins / cumulativeGames).toFixed(1)) : 0,
        wins: cumulativeWins,
        losses: cumulativeLosses,
        ties: cumulativeTies,
      },
    };
  });

  return {
    leagueId,
    seasonRecord: {
      wins: cumulativeWins,
      losses: cumulativeLosses,
      ties: cumulativeTies,
      totalPins: Number(overall?.totalPins || 0),
      totalGames: Number(overall?.totalGames || 0),
      average: Number(baseOpponentAvg || 0),
    },
    totals: {
      wins: cumulativeWins,
      losses: cumulativeLosses,
      ties: cumulativeTies,
    },
    weeks,
  };
});

fastify.get('/leagues/:id/leaderboard', async (request, reply) => {
  const { id } = request.params as any;
  const leagueId = parseInt(id);

  const league = sqlite.prepare('SELECT id, games_per_week FROM leagues WHERE id = ?').get(leagueId) as any;
  if (!league) return reply.status(404).send({ error: 'League not found' });

  const rows = sqlite.prepare(`
    SELECT
      lw.id as weekId,
      lw.opponent,
      lw.week_number as weekNumber,
      lg.id as gameId,
      lg.game_number as gameNumber,
      lg.score,
      lg.strikes,
      lg.spares,
      lg.splits,
      lg.ball_id as ballId
    FROM league_games lg
    JOIN league_weeks lw ON lw.id = lg.week_id
    WHERE lw.league_id = ?
    ORDER BY lw.week_number ASC, lg.game_number ASC
  `).all(leagueId) as any[];

  const byWeek = new Map<number, { opponent: string; weekNumber: number; scores: number[]; avg: number }>();
  for (const r of rows) {
    if (!byWeek.has(r.weekId)) {
      byWeek.set(r.weekId, { opponent: r.opponent || 'Unknown', weekNumber: r.weekNumber, scores: [], avg: 0 });
    }
    const w = byWeek.get(r.weekId)!;
    if (r.score != null) w.scores.push(r.score);
  }

  for (const w of byWeek.values()) {
    w.avg = w.scores.length ? Math.round(w.scores.reduce((s, x) => s + x, 0) / w.scores.length) : 0;
  }

  const overall = sqlite.prepare(`
    SELECT ROUND(AVG(lg.score), 1) as avg
    FROM league_games lg
    JOIN league_weeks lw ON lw.id = lg.week_id
    WHERE lw.league_id = ? AND lg.score IS NOT NULL
  `).get(leagueId) as any;
  const leagueAvg = Number(overall?.avg || 0);

  const byOpp = new Map<string, { name: string; weeks: number[]; avg: number; games: number; totalPins: number; highGame: number }>();
  for (const w of byWeek.values()) {
    if (!byOpp.has(w.opponent)) {
      byOpp.set(w.opponent, { name: w.opponent, weeks: [], avg: 0, games: 0, totalPins: 0, highGame: 0 });
    }
    const o = byOpp.get(w.opponent)!;
    o.weeks.push(w.avg);
    o.games += w.scores.length;
    o.totalPins += w.scores.reduce((s, x) => s + x, 0);
    o.highGame = Math.max(o.highGame, ...(w.scores.length ? w.scores : [0]));
  }

  const rankedOpponents = Array.from(byOpp.values())
    .filter(o => o.games > 0)
    .map(o => ({
      ...o,
      avg: Math.round(o.totalPins / o.games),
      weeklyAverages: o.weeks.slice().sort((a, b) => b - a),
    }))
    .sort((a, b) => b.avg - a.avg)
    .map((o, i) => ({ rank: i + 1, name: o.name, avg: o.avg, games: o.games, totalPins: o.totalPins, highGame: o.highGame }));

  let wins = 0, losses = 0, ties = 0;
  for (const w of byWeek.values()) {
    if (!w.scores.length) continue;
    if (w.avg > leagueAvg) wins++;
    else if (w.avg < leagueAvg) losses++;
    else ties++;
  }

  return {
    leagueId,
    leagueAverage: leagueAvg,
    record: { wins, losses, ties },
    totalWeeks: byWeek.size,
    rankedOpponents,
  };
});

// API-prefixed mirror: /api/leagues/:id/leaderboard — used by PublicLeagueLeaderboard SPA
fastify.get('/api/leagues/:id/leaderboard', async (request, reply) => {
  const { id } = request.params as any;
  const leagueId = parseInt(id);

  const league = sqlite.prepare('SELECT id, games_per_week FROM leagues WHERE id = ?').get(leagueId) as any;
  if (!league) return reply.status(404).send({ error: 'League not found' });

  const rows = sqlite.prepare(`
    SELECT
      lw.id as weekId,
      lw.opponent,
      lw.week_number as weekNumber,
      lg.id as gameId,
      lg.game_number as gameNumber,
      lg.score,
      lg.strikes,
      lg.spares,
      lg.splits,
      lg.ball_id as ballId
    FROM league_games lg
    JOIN league_weeks lw ON lw.id = lg.week_id
    WHERE lw.league_id = ?
    ORDER BY lw.week_number ASC, lg.game_number ASC
  `).all(leagueId) as any[];

  const byWeek = new Map<number, { opponent: string; weekNumber: number; scores: number[]; avg: number }>();
  for (const r of rows) {
    if (!byWeek.has(r.weekId)) {
      byWeek.set(r.weekId, { opponent: r.opponent || 'Unknown', weekNumber: r.weekNumber, scores: [], avg: 0 });
    }
    const w = byWeek.get(r.weekId)!;
    if (r.score != null) w.scores.push(r.score);
  }

  for (const w of byWeek.values()) {
    w.avg = w.scores.length ? Math.round(w.scores.reduce((s, x) => s + x, 0) / w.scores.length) : 0;
  }

  const overall = sqlite.prepare(`
    SELECT ROUND(AVG(lg.score), 1) as avg
    FROM league_games lg
    JOIN league_weeks lw ON lw.id = lg.week_id
    WHERE lw.league_id = ? AND lg.score IS NOT NULL
  `).get(leagueId) as any;
  const leagueAvg = Number(overall?.avg || 0);

  const byOpp = new Map<string, { name: string; weeks: number[]; avg: number; games: number; totalPins: number; highGame: number }>();
  for (const w of byWeek.values()) {
    if (!byOpp.has(w.opponent)) {
      byOpp.set(w.opponent, { name: w.opponent, weeks: [], avg: 0, games: 0, totalPins: 0, highGame: 0 });
    }
    const o = byOpp.get(w.opponent)!;
    o.weeks.push(w.avg);
    o.games += w.scores.length;
    o.totalPins += w.scores.reduce((s, x) => s + x, 0);
    o.highGame = Math.max(o.highGame, ...(w.scores.length ? w.scores : [0]));
  }

  const rankedOpponents = Array.from(byOpp.values())
    .filter(o => o.games > 0)
    .map(o => ({
      ...o,
      avg: Math.round(o.totalPins / o.games),
      weeklyAverages: o.weeks.slice().sort((a, b) => b - a),
    }))
    .sort((a, b) => b.avg - a.avg)
    .map((o, i) => ({ rank: i + 1, name: o.name, avg: o.avg, games: o.games, totalPins: o.totalPins, highGame: o.highGame }));

  let wins = 0, losses = 0, ties = 0;
  for (const w of byWeek.values()) {
    if (!w.scores.length) continue;
    if (w.avg > leagueAvg) wins++;
    else if (w.avg < leagueAvg) losses++;
    else ties++;
  }

  return {
    leagueId,
    leagueAverage: leagueAvg,
    record: { wins, losses, ties },
    totalWeeks: byWeek.size,
    rankedOpponents,
  };
});

// OG image for league leaderboard
function buildLeagueLeaderboardOgSvg(opts: {
  leagueName: string
  season: string
  location: string
  leagueAverage: number
  record: { wins: number; losses: number; ties: number }
  totalWeeks: number
  rankedOpponents: { rank: number; name: string; avg: number; games: number; totalPins: number; highGame: number }[]
}): string {
  const { leagueName, season, location, leagueAverage, record, totalWeeks, rankedOpponents } = opts
  const accent = '#a78bfa'
  const top5 = rankedOpponents.slice(0, 5)

  const opponentRows = top5.map((opp, i) => {
    const y = 240 + i * 58
    const bgAlpha = opp.rank === 1 ? '0.12' : '0.04'
    const rankColor = opp.rank === 1 ? '#fbbf24' : opp.rank === 2 ? '#94a3b8' : opp.rank === 3 ? '#cd7f32' : 'rgba(255,255,255,0.5)'
    const nameColor = opp.rank === 1 ? '#ffffff' : '#e2e8f0'
    return `<rect x="40" y="${y}" width="1120" height="50" rx="8" fill="rgba(255,255,255,${bgAlpha})"/>
    <text x="60" y="${y + 32}" font-size="22" font-weight="700" fill="${rankColor}" font-family="Arial, sans-serif">#${opp.rank}</text>
    <text x="130" y="${y + 32}" font-size="20" font-weight="600" fill="${nameColor}" font-family="Arial, sans-serif">${escapeXml(opp.name)}</text>
    <text x="580" y="${y + 32}" font-size="22" font-weight="800" fill="${accent}" font-family="Arial, sans-serif">${opp.avg}</text>
    <text x="700" y="${y + 32}" font-size="18" fill="rgba(255,255,255,0.7)" font-family="Arial, sans-serif">${opp.games}g</text>
    <text x="820" y="${y + 32}" font-size="18" fill="rgba(255,255,255,0.7)" font-family="Arial, sans-serif">${opp.totalPins} pins</text>
    <text x="980" y="${y + 32}" font-size="18" font-weight="${opp.highGame === 300 ? '800' : '500'}" fill="${opp.highGame === 300 ? '#fbbf24' : 'rgba(255,255,255,0.7)'}" font-family="Arial, sans-serif">${opp.highGame === 300 ? '🏆 ' : ''}${opp.highGame}</text>`
  }).join('')

  const headerCol = [leagueName, season, location].filter(Boolean).join(' · ')

  // W-L-T badge
  const hasTies = record.ties > 0
  const wltLabel = hasTies ? `${record.wins}W – ${record.losses}L – ${record.ties}T` : `${record.wins}W – ${record.losses}L`
  const wltBgY = 195
  const wltBg = hasTies
    ? `<rect x="485" y="${wltBgY}" width="230" height="32" rx="16" fill="rgba(167,139,250,0.15)"/>`
    : `<rect x="525" y="${wltBgY}" width="150" height="32" rx="16" fill="rgba(167,139,250,0.15)"/>`
  const wltTextX = hasTies ? 600 : 600
  const wltTextAnchor = 'middle'
  const wltText = `<text x="${wltTextX}" y="${wltBgY + 22}" font-size="15" font-weight="800" fill="#c4b5fd" font-family="Arial, sans-serif" text-anchor="${wltTextAnchor}">📊 ${wltLabel}</text>`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f0f1a"/>
      <stop offset="100%" stop-color="#17172b"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="0" y="0" width="1200" height="4" fill="${accent}"/>
  <rect x="40" y="60" width="260" height="32" rx="16" fill="rgba(167,139,250,0.15)"/>
  <text x="170" y="83" font-size="13" font-weight="700" fill="#c4b5fd" font-family="Arial, sans-serif" text-anchor="middle" letter-spacing="1">PUBLIC LEAGUE LEADERBOARD</text>
  <text x="600" y="140" font-size="46" font-weight="900" fill="#ffffff" font-family="Arial, sans-serif" text-anchor="middle">${escapeXml(leagueName || 'League')}</text>
  <text x="600" y="172" font-size="18" fill="rgba(255,255,255,0.6)" font-family="Arial, sans-serif" text-anchor="middle">${escapeXml(headerCol)}</text>
  ${wltBg}
  ${wltText}
  <g transform="translate(40, 240)">
    <text x="0" y="0" font-size="13" font-weight="700" fill="rgba(255,255,255,0.45)" font-family="Arial, sans-serif" letter-spacing="1">RANK</text>
    <text x="70" y="0" font-size="13" font-weight="700" fill="rgba(255,255,255,0.45)" font-family="Arial, sans-serif" letter-spacing="1">BOWLER</text>
    <text x="540" y="0" font-size="13" font-weight="700" fill="rgba(255,255,255,0.45)" font-family="Arial, sans-serif" letter-spacing="1">AVG</text>
    <text x="660" y="0" font-size="13" font-weight="700" fill="rgba(255,255,255,0.45)" font-family="Arial, sans-serif" letter-spacing="1">GAMES</text>
    <text x="780" y="0" font-size="13" font-weight="700" fill="rgba(255,255,255,0.45)" font-family="Arial, sans-serif" letter-spacing="1">PINS</text>
    <text x="940" y="0" font-size="13" font-weight="700" fill="rgba(255,255,255,0.45)" font-family="Arial, sans-serif" letter-spacing="1">HIGH</text>
  </g>
  ${opponentRows}
  <text x="600" y="600" font-size="14" fill="rgba(255,255,255,0.35)" font-family="Arial, sans-serif" text-anchor="middle">Tracked with BowlSense · Bowlsense.app</text>
</svg>`
}

fastify.get('/leagues/:id/leaderboard/og-image', async (request, reply) => {
  const { id } = request.params as any
  const leagueId = parseInt(id, 10)
  if (Number.isNaN(leagueId)) return reply.status(400).send({ error: 'Invalid league ID' })

  const leagueRow = sqlite.prepare('SELECT name, season, location FROM leagues WHERE id = ?').get(leagueId) as any
  if (!leagueRow) return reply.status(404).send({ error: 'League not found' })

  // Reuse the leaderboard query logic inline
  const overall = sqlite.prepare(`
    SELECT ROUND(AVG(lg.score), 1) as avg
    FROM league_games lg
    JOIN league_weeks lw ON lw.id = lg.week_id
    WHERE lw.league_id = ? AND lg.score IS NOT NULL
  `).get(leagueId) as any
  const leagueAvg = Number(overall?.avg || 0)

  const rows = sqlite.prepare(`
    SELECT lw.opponent, lg.score
    FROM league_games lg
    JOIN league_weeks lw ON lw.id = lg.week_id
    WHERE lw.league_id = ? AND lg.score IS NOT NULL
    ORDER BY lw.week_number ASC
  `).all(leagueId) as any[]

  const byOpp = new Map<string, { name: string; games: number; totalPins: number; highGame: number }>()
  for (const r of rows) {
    const opp = r.opponent || 'Unknown'
    if (!byOpp.has(opp)) byOpp.set(opp, { name: opp, games: 0, totalPins: 0, highGame: 0 })
    const o = byOpp.get(opp)!
    o.games++
    o.totalPins += r.score
    o.highGame = Math.max(o.highGame, r.score)
  }

  const rankedOpponents = Array.from(byOpp.values())
    .map(o => ({ ...o, avg: Math.round(o.totalPins / o.games) }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 5)
    .map((o, i) => ({ rank: i + 1, name: o.name, avg: o.avg, games: o.games, totalPins: o.totalPins, highGame: o.highGame }))

  // W-L-T from weeks
  const weeks = sqlite.prepare('SELECT games_won, games_lost, games_tied FROM league_weeks WHERE league_id = ?').all(leagueId) as any[]
  const wins = weeks.reduce((s, w) => s + (w.games_won || 0), 0)
  const losses = weeks.reduce((s, w) => s + (w.games_lost || 0), 0)
  const ties = weeks.reduce((s, w) => s + (w.games_tied || 0), 0)

  const svg = buildLeagueLeaderboardOgSvg({
    leagueName: leagueRow.name || 'League',
    season: leagueRow.season || '',
    location: leagueRow.location || '',
    leagueAverage: leagueAvg,
    record: { wins, losses, ties },
    totalWeeks: weeks.length,
    rankedOpponents,
  })

  const png = await sharp(Buffer.from(svg, 'utf8')).png().toBuffer()
  reply.header('Content-Type', 'image/png')
  reply.header('Cache-Control', 'public, max-age=86400')
  return reply.send(png)
})

fastify.get('/api/leagues/:id/leaderboard/og-image', async (request, reply) => {
  const { id } = request.params as any
  const response = await internalRequest({ method: 'GET', url: `/leagues/${id}/leaderboard/og-image` })
  return relayInjectedResponse(reply, response)
})

// ── League Recap: most recent week data ─────────────────────────
fastify.get('/api/leagues/:id/recap', async (request, reply) => {
  const { id } = request.params as any
  const leagueId = parseInt(id, 10)
  if (Number.isNaN(leagueId)) return reply.status(400).send({ error: 'Invalid league ID' })
  const league = sqlite.prepare('SELECT id, name, location, season, day_of_week FROM leagues WHERE id = ?').get(leagueId) as any
  if (!league) return reply.status(404).send({ error: 'League not found' })

  const recentWeek = sqlite.prepare(`
    SELECT lw.*,
      COALESCE(json_group_array(
        CASE WHEN lg.id IS NULL THEN NULL ELSE json_object('score', lg.score, 'gameNumber', lg.game_number) END
      ), '[]') as gamesJson
    FROM league_weeks lw
    LEFT JOIN league_games lg ON lg.week_id = lw.id
    WHERE lw.league_id = ?
    GROUP BY lw.id
    ORDER BY lw.week_number DESC
    LIMIT 1
  `).get(leagueId) as any

  if (!recentWeek) return reply.status(404).send({ error: 'No league weeks found for this league' })

  const games = (JSON.parse(recentWeek.gamesJson || '[]') as any[]).filter(Boolean)
  const scores = games.map((g: any) => g.score).filter((s: any) => s != null)
  const average = scores.length ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : 0
  const highGame = scores.length ? Math.max(...scores) : 0
  const series = scores.reduce((a: number, b: number) => a + b, 0)
  const wltRecord = { won: recentWeek.games_won || 0, lost: recentWeek.games_lost || 0, tied: recentWeek.games_tied ?? 0 }

  return {
    league: { id: league.id, name: league.name || 'League', location: league.location || null, season: league.season || null },
    week: { weekNumber: recentWeek.week_number, date: recentWeek.date, opponent: recentWeek.opponent || 'League Play', ...wltRecord },
    games: scores,
    stats: { average, highGame, totalGames: scores.length, series },
  }
})

fastify.get('/leagues/:id/recap', async (request, reply) => {
  const { id } = request.params as any
  const response = await internalRequest({ method: 'GET', url: `/api/leagues/${id}/recap` })
  return relayInjectedResponse(reply, response)
})

// ── League Recap OG image ───────────────────────────────────────
function buildLeagueRecapOgSvg(opts: {
  leagueName: string
  weekNumber: number
  date: string
  opponent: string
  scores: number[]
  average: number
  highGame: number
  series: number
  wins: number
  losses: number
  ties: number
}): string {
  const { leagueName, weekNumber, date, opponent, scores, average, highGame, series, wins, losses, ties } = opts
  const accent = '#a78bfa'
  const gold = '#fbbf24'
  const red = '#fc8181'

  // Build game score circles
  const gameCircles = scores.slice(0, 8).map((score, i) => {
    const cx = 160 + i * 120
    const cy = 295
    let bgColor: string, textColor: string
    if (score === 300) { bgColor = gold; textColor = '#0d0d1a' }
    else if (score >= 250) { bgColor = accent; textColor = '#ffffff' }
    else if (score >= 200) { bgColor = '#818cf8'; textColor = '#ffffff' }
    else if (score < 170) { bgColor = red; textColor = '#ffffff' }
    else { bgColor = 'rgba(255,255,255,0.15)'; textColor = '#ffffff' }
    const medal = score === 300 ? '🏆' : ''
    return `<circle cx="${cx}" cy="${cy}" r="48" fill="${bgColor}"/>
    <text x="${cx}" y="${cy + 8}" font-size="22" font-weight="900" fill="${textColor}" font-family="Arial, sans-serif" text-anchor="middle">${medal}${score}</text>`
  }).join('')

  const wltLabel = ties > 0 ? `${wins}W – ${losses}L – ${ties}T` : `${wins}W – ${losses}L`
  const wltBadgeW = ties > 0 ? 200 : 160
  const wltBadgeX = 600 - wltBadgeW / 2

  const statW = 196
  const statGap = 24
  const statY = 460
  const gridStartX = Math.round((1200 - (statW * 4 + statGap * 3)) / 2)

  const makeStat = (x: number, label: string, value: string, valColor?: string) =>
    `<rect x="${x}" y="${statY}" width="${statW}" height="110" rx="16" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.1)" stroke-width="1.5"/>
    <text x="${x + statW / 2}" y="${statY + 22}" font-size="13" fill="rgba(255,255,255,0.55)" font-family="Arial, sans-serif" text-anchor="middle" letter-spacing="0.5">${label.toUpperCase()}</text>
    <text x="${x + statW / 2}" y="${statY + 78}" font-size="36" font-weight="900" fill="${valColor || '#ffffff'}" font-family="Arial, sans-serif" text-anchor="middle">${escapeXml(String(value))}</text>`

  const statsRow = [
    makeStat(gridStartX, 'Average', String(average), accent),
    makeStat(gridStartX + statW + statGap, 'High Game', String(highGame), highGame === 300 ? gold : undefined),
    makeStat(gridStartX + (statW + statGap) * 2, 'W-L Record', wltLabel),
    makeStat(gridStartX + (statW + statGap) * 3, 'Series', String(series)),
  ].join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f0f1a"/><stop offset="100%" stop-color="#17172b"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="35%" r="50%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.12"/><stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <ellipse cx="600" cy="200" rx="500" ry="260" fill="url(#glow)"/>
  <rect x="0" y="0" width="1200" height="5" fill="${accent}"/>
  <rect x="50" y="44" width="260" height="36" rx="18" fill="rgba(167,139,250,0.18)" stroke="rgba(167,139,250,0.45)" stroke-width="1.5"/>
  <text x="180" y="68" font-size="14" font-weight="700" fill="#c4b5fd" font-family="Arial, sans-serif" text-anchor="middle" letter-spacing="1">🏆 LEAGUE NIGHT RECAP</text>
  <text x="1150" y="68" font-size="18" font-weight="700" fill="rgba(255,255,255,0.5)" font-family="Arial, sans-serif" text-anchor="end">🎳 BowlSense</text>
  <text x="600" y="155" font-size="52" font-weight="900" fill="#ffffff" font-family="Arial, sans-serif" text-anchor="middle">${escapeXml(leagueName)}</text>
  <text x="600" y="195" font-size="20" fill="rgba(255,255,255,0.6)" font-family="Arial, sans-serif" text-anchor="middle">Week ${weekNumber} · ${escapeXml(date)} · vs ${escapeXml(opponent)}</text>
  ${gameCircles}
  ${statsRow}
  <text x="600" y="600" font-size="15" fill="rgba(255,255,255,0.3)" font-family="Arial, sans-serif" text-anchor="middle">Tracked with BowlSense</text>
</svg>`
}

fastify.get('/api/leagues/:id/recap/og-image', async (request, reply) => {
  const { id } = request.params as any
  const response = await internalRequest({ method: 'GET', url: `/leagues/${id}/recap/og-image` })
  return relayInjectedResponse(reply, response)
})

fastify.get('/leagues/:id/recap/og-image', async (request, reply) => {
  const { id } = request.params as any
  const leagueId = parseInt(id, 10)
  if (Number.isNaN(leagueId)) return reply.status(400).send({ error: 'Invalid league ID' })

  const league = sqlite.prepare('SELECT name FROM leagues WHERE id = ?').get(leagueId) as any
  if (!league) return reply.status(404).send({ error: 'League not found' })

  const recentWeek = sqlite.prepare(`
    SELECT lw.*,
      COALESCE(json_group_array(
        CASE WHEN lg.id IS NULL THEN NULL ELSE json_object('score', lg.score) END
      ), '[]') as gamesJson
    FROM league_weeks lw
    LEFT JOIN league_games lg ON lg.week_id = lw.id
    WHERE lw.league_id = ?
    GROUP BY lw.id
    ORDER BY lw.week_number DESC
    LIMIT 1
  `).get(leagueId) as any

  if (!recentWeek) {
    // Fallback empty-state SVG
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
      <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0d0d1a"/><stop offset="100%" stop-color="#1c1538"/></linearGradient></defs>
      <rect width="1200" height="630" fill="url(#bg)"/>
      <text x="600" y="280" text-anchor="middle" font-size="48" font-weight="800" fill="#a78bfa" font-family="Arial, sans-serif">🎳 BowlSense</text>
      <text x="600" y="340" text-anchor="middle" font-size="32" fill="#ffffff" font-family="Arial, sans-serif">No league weeks logged yet!</text>
      <text x="600" y="596" text-anchor="middle" font-size="20" fill="#6f7394" font-family="Arial, sans-serif">Track your game at BowlSense</text>
    </svg>`
    const png = await sharp(Buffer.from(svg)).png().toBuffer()
    reply.header('Content-Type', 'image/png')
    reply.header('Cache-Control', 'public, max-age=86400')
    return reply.send(png)
  }

  const games = (JSON.parse(recentWeek.gamesJson || '[]') as any[]).filter(Boolean)
  const scores = games.map((g: any) => g.score).filter((s: any) => s != null)
  const average = scores.length ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : 0
  const highGame = scores.length ? Math.max(...scores) : 0
  const series = scores.reduce((a: number, b: number) => a + b, 0)

  const svg = buildLeagueRecapOgSvg({
    leagueName: league.name || 'League',
    weekNumber: recentWeek.week_number,
    date: recentWeek.date || '',
    opponent: recentWeek.opponent || 'League Play',
    scores,
    average,
    highGame,
    series,
    wins: recentWeek.games_won || 0,
    losses: recentWeek.games_lost || 0,
    ties: recentWeek.games_tied ?? 0,
  })

  const png = await sharp(Buffer.from(svg, 'utf8')).png().toBuffer()
  reply.header('Content-Type', 'image/png')
  reply.header('Cache-Control', 'public, max-age=86400')
  return reply.send(png)
})

// ── League Week Share Page ──────────────────────────────────────
const getLeagueWeekShare = async (request: any, reply: any) => {
  const { id, weekId } = request.params as any
  const leagueId = parseInt(id, 10)
  const wId = parseInt(weekId, 10)
  if (Number.isNaN(leagueId) || Number.isNaN(wId)) return reply.status(400).send({ error: 'Invalid IDs' })

  const league = sqlite.prepare('SELECT id, name, location, season, day_of_week FROM leagues WHERE id = ?').get(leagueId) as any
  if (!league) return reply.status(404).send({ error: 'League not found' })

  const week = sqlite.prepare('SELECT * FROM league_weeks WHERE id = ? AND league_id = ?').get(wId, leagueId) as any
  if (!week) return reply.status(404).send({ error: 'Week not found' })

  const gamesRows = sqlite.prepare(
    'SELECT * FROM league_games WHERE week_id = ? ORDER BY game_number ASC'
  ).all(wId) as any[]

  const scores = gamesRows.map((g) => g.score).filter((s) => s != null)
  const average = scores.length ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : 0
  const highGame = scores.length ? Math.max(...scores) : 0
  const series = scores.reduce((a: number, b: number) => a + b, 0)

  return {
    league: { id: league.id, name: league.name || 'League', location: league.location || null, season: league.season || null },
    week: {
      id: week.id,
      weekNumber: week.week_number,
      date: week.date,
      opponent: week.opponent || 'League Play',
      gamesWon: week.games_won || 0,
      gamesLost: week.games_lost || 0,
      gamesTied: week.games_tied ?? 0,
    },
    games: scores,
    stats: { average, highGame, totalGames: scores.length, series },
  }
}

fastify.get('/api/leagues/:id/weeks/:weekId', getLeagueWeekShare)
// Vite's development proxy removes the /api prefix before forwarding.
fastify.get('/leagues/:id/weeks/:weekId', getLeagueWeekShare)

fastify.get('/api/leagues/:id/weeks/:weekId/og-image', async (request, reply) => {
  const { id, weekId } = request.params as any
  const response = await internalRequest({ method: 'GET', url: `/leagues/${id}/weeks/${weekId}/og-image` })
  return relayInjectedResponse(reply, response)
})

fastify.get('/leagues/:id/weeks/:weekId/og-image', async (request, reply) => {
  const { id, weekId } = request.params as any
  const leagueId = parseInt(id, 10)
  const wId = parseInt(weekId, 10)
  if (Number.isNaN(leagueId) || Number.isNaN(wId)) return reply.status(400).send({ error: 'Invalid IDs' })

  const league = sqlite.prepare('SELECT name FROM leagues WHERE id = ?').get(leagueId) as any
  if (!league) return reply.status(404).send({ error: 'League not found' })

  const week = sqlite.prepare('SELECT * FROM league_weeks WHERE id = ? AND league_id = ?').get(wId, leagueId) as any
  if (!week) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
      <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0d0d1a"/><stop offset="100%" stop-color="#1c1538"/></linearGradient></defs>
      <rect width="1200" height="630" fill="url(#bg)"/>
      <text x="600" y="280" text-anchor="middle" font-size="48" font-weight="800" fill="#a78bfa" font-family="Arial, sans-serif">🎳 BowlSense</text>
      <text x="600" y="340" text-anchor="middle" font-size="32" fill="#ffffff" font-family="Arial, sans-serif">No week data found</text>
      <text x="600" y="596" text-anchor="middle" font-size="20" fill="#6f7394" font-family="Arial, sans-serif">Track your game at BowlSense</text>
    </svg>`
    const png = await sharp(Buffer.from(svg)).png().toBuffer()
    reply.header('Content-Type', 'image/png')
    reply.header('Cache-Control', 'public, max-age=86400')
    return reply.send(png)
  }

  const gamesRows = sqlite.prepare('SELECT score FROM league_games WHERE week_id = ? ORDER BY game_number ASC').all(wId) as any[]
  const scores = gamesRows.map((g) => g.score).filter((s) => s != null)
  const average = scores.length ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : 0
  const highGame = scores.length ? Math.max(...scores) : 0
  const series = scores.reduce((a: number, b: number) => a + b, 0)

  const svg = buildLeagueRecapOgSvg({
    leagueName: league.name || 'League',
    weekNumber: week.week_number,
    date: week.date,
    opponent: week.opponent || 'League Play',
    scores,
    average,
    highGame,
    series,
    wins: week.games_won || 0,
    losses: week.games_lost || 0,
    ties: week.games_tied ?? 0,
  })

  const png = await sharp(Buffer.from(svg, 'utf8')).png().toBuffer()
  reply.header('Content-Type', 'image/png')
  reply.header('Cache-Control', 'public, max-age=86400')
  return reply.send(png)
})

fastify.get('/leagues/:id', async (request, reply) => {
  const { id } = request.params as any;
  // Guard: reject non-numeric IDs (new, edit, public, share, etc.) so they
  // fall through to the SPA fallback instead of returning JSON API responses.
  if (!id || !/^\d+$/.test(id)) {
    return reply.callNotFound();
  }
  const leagueId = parseInt(id);

  const league = sqlite.prepare('SELECT * FROM leagues WHERE id = ?').get(leagueId) as any;
  if (!league) return reply.status(404).send({ error: 'League not found' });

  const weeks = sqlite.prepare(`
    SELECT lw.*,
      COALESCE(json_group_array(
        CASE WHEN lg.id IS NULL THEN NULL ELSE json_object(
          'id', lg.id,
          'weekId', lg.week_id,
          'gameNumber', lg.game_number,
          'score', lg.score,
          'strikes', lg.strikes,
          'spares', lg.spares,
          'splits', lg.splits,
          'ballId', lg.ball_id,
          'frameData', lg.frame_data,
          'createdAt', lg.created_at
        ) END
      ), '[]') as gamesJson
    FROM league_weeks lw
    LEFT JOIN league_games lg ON lg.week_id = lw.id
    WHERE lw.league_id = ?
    GROUP BY lw.id
    ORDER BY lw.week_number ASC
  `).all(leagueId) as any[];

  const stats = await internalRequest({ method: 'GET', url: `/leagues/${leagueId}/stats` });
  const statsJson = stats.statusCode === 200 ? stats.json() : {};

  return {
    id: league.id,
    name: league.name,
    location: league.location,
    season: league.season,
    dayOfWeek: league.day_of_week,
    gamesPerWeek: league.games_per_week,
    startDate: league.start_date,
    endDate: league.end_date,
    notes: league.notes,
    active: league.active,
    createdAt: league.created_at,
    weeks: weeks.map((w) => ({
      id: w.id,
      leagueId: w.league_id,
      weekNumber: w.week_number,
      date: w.date,
      opponent: w.opponent,
      gamesWon: w.games_won,
      gamesLost: w.games_lost,
      notes: w.notes,
      createdAt: w.created_at,
      games: (JSON.parse(w.gamesJson || '[]') as any[]).filter(Boolean),
    })),
    stats: statsJson,
  };
});

fastify.put('/leagues/:id', async (request, reply) => {
  const { id } = request.params as any;
  const leagueId = parseInt(id);
  const existing = sqlite.prepare('SELECT * FROM leagues WHERE id = ?').get(leagueId);
  if (!existing) return reply.status(404).send({ error: 'League not found' });

  const { name, location, season, dayOfWeek, gamesPerWeek, startDate, endDate, notes, active } = request.body as any;
  sqlite.prepare(`
    UPDATE leagues
    SET name = ?, location = ?, season = ?, day_of_week = ?, games_per_week = ?, start_date = ?, end_date = ?, notes = ?, active = ?
    WHERE id = ?
  `).run(
    name,
    location || null,
    season || null,
    dayOfWeek || null,
    Math.max(1, Number(gamesPerWeek || 3)),
    startDate || null,
    endDate || null,
    notes || null,
    active === 0 ? 0 : 1,
    leagueId,
  );

  const league = sqlite.prepare('SELECT * FROM leagues WHERE id = ?').get(leagueId) as any;
  return {
    id: league.id,
    name: league.name,
    location: league.location,
    season: league.season,
    dayOfWeek: league.day_of_week,
    gamesPerWeek: league.games_per_week,
    startDate: league.start_date,
    endDate: league.end_date,
    notes: league.notes,
    active: league.active,
    createdAt: league.created_at,
  };
});

fastify.delete('/leagues/:id', async (request, reply) => {
  const { id } = request.params as any;
  const leagueId = parseInt(id);

  const tx = sqlite.transaction(() => {
    const weekIds = sqlite.prepare('SELECT id FROM league_weeks WHERE league_id = ?').all(leagueId) as any[];
    const deleteGames = sqlite.prepare('DELETE FROM league_games WHERE week_id = ?');
    for (const w of weekIds) deleteGames.run(w.id);
    sqlite.prepare('DELETE FROM league_weeks WHERE league_id = ?').run(leagueId);
    sqlite.prepare('DELETE FROM leagues WHERE id = ?').run(leagueId);
  });

  tx();
  return reply.status(204).send();
});

fastify.get('/leagues/:id/weeks', async (request) => {
  const { id } = request.params as any;
  const leagueId = parseInt(id);

  const rows = sqlite.prepare(`
    SELECT lw.*,
      COALESCE(json_group_array(
        CASE WHEN lg.id IS NULL THEN NULL ELSE json_object(
          'id', lg.id,
          'weekId', lg.week_id,
          'gameNumber', lg.game_number,
          'score', lg.score,
          'strikes', lg.strikes,
          'spares', lg.spares,
          'splits', lg.splits,
          'ballId', lg.ball_id,
          'frameData', lg.frame_data,
          'createdAt', lg.created_at
        ) END
      ), '[]') as gamesJson
    FROM league_weeks lw
    LEFT JOIN league_games lg ON lg.week_id = lw.id
    WHERE lw.league_id = ?
    GROUP BY lw.id
    ORDER BY lw.week_number ASC
  `).all(leagueId) as any[];

  return rows.map((w) => ({
    id: w.id,
    leagueId: w.league_id,
    weekNumber: w.week_number,
    date: w.date,
    opponent: w.opponent,
    gamesWon: w.games_won,
    gamesLost: w.games_lost,
    notes: w.notes,
    createdAt: w.created_at,
    games: (JSON.parse(w.gamesJson || '[]') as any[]).filter(Boolean),
  }));
});

fastify.post('/leagues/:id/weeks', async (request, reply) => {
  const { id } = request.params as any;
  const leagueId = parseInt(id);
  const { weekNumber, date, opponent, gamesWon, gamesLost, notes } = request.body as any;

  if (!date) return reply.status(400).send({ error: 'Date is required' });

  const result = sqlite.prepare(`
    INSERT INTO league_weeks (league_id, week_number, date, opponent, games_won, games_lost, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    leagueId,
    Number(weekNumber || 1),
    date,
    opponent || null,
    Number(gamesWon || 0),
    Number(gamesLost || 0),
    notes || null,
    Date.now(),
  );

  const row = sqlite.prepare('SELECT * FROM league_weeks WHERE id = ?').get(result.lastInsertRowid) as any;
  return {
    id: row.id,
    leagueId: row.league_id,
    weekNumber: row.week_number,
    date: row.date,
    opponent: row.opponent,
    gamesWon: row.games_won,
    gamesLost: row.games_lost,
    notes: row.notes,
    createdAt: row.created_at,
  };
});

fastify.get('/leagues/weeks/:weekId', async (request, reply) => {
  const { weekId } = request.params as any;
  const week = sqlite.prepare('SELECT * FROM league_weeks WHERE id = ?').get(parseInt(weekId)) as any;
  if (!week) return reply.status(404).send({ error: 'Week not found' });

  const gamesRows = sqlite.prepare('SELECT * FROM league_games WHERE week_id = ? ORDER BY game_number ASC').all(parseInt(weekId)) as any[];
  return {
    id: week.id,
    leagueId: week.league_id,
    weekNumber: week.week_number,
    date: week.date,
    opponent: week.opponent,
    gamesWon: week.games_won,
    gamesLost: week.games_lost,
    notes: week.notes,
    createdAt: week.created_at,
    games: gamesRows.map((g) => ({
      id: g.id,
      weekId: g.week_id,
      gameNumber: g.game_number,
      score: g.score,
      strikes: g.strikes,
      spares: g.spares,
      splits: g.splits,
      ballId: g.ball_id,
      frameData: g.frame_data,
      createdAt: g.created_at,
    })),
  };
});

fastify.put('/leagues/weeks/:weekId', async (request) => {
  const { weekId } = request.params as any;
  const { date, opponent, gamesWon, gamesLost, notes } = request.body as any;
  sqlite.prepare(
    'UPDATE league_weeks SET date=?, opponent=?, games_won=?, games_lost=?, notes=? WHERE id=?'
  ).run(date, opponent, gamesWon ?? 0, gamesLost ?? 0, notes ?? null, parseInt(weekId));
  return sqlite.prepare('SELECT * FROM league_weeks WHERE id=?').get(parseInt(weekId));
});

fastify.delete('/leagues/weeks/:weekId', async (request, reply) => {
  const { weekId } = request.params as any;
  const parsedWeekId = parseInt(weekId);
  sqlite.prepare('DELETE FROM league_games WHERE week_id = ?').run(parsedWeekId);
  sqlite.prepare('DELETE FROM league_weeks WHERE id = ?').run(parsedWeekId);
  return reply.status(204).send();
});

fastify.post('/leagues/weeks/:weekId/games', async (request, reply) => {
  const { weekId } = request.params as any;
  const { gameNumber, score, strikes, spares, splits, ballId, frameData } = request.body as any;

  const week = sqlite.prepare('SELECT id FROM league_weeks WHERE id = ?').get(parseInt(weekId));
  if (!week) return reply.status(404).send({ error: 'Week not found' });

  const result = sqlite.prepare(`
    INSERT INTO league_games (week_id, game_number, score, strikes, spares, splits, ball_id, frame_data, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    parseInt(weekId),
    Number(gameNumber || 1),
    score ?? null,
    strikes ?? 0,
    spares ?? 0,
    splits ?? 0,
    ballId || null,
    frameData || null,
    Date.now(),
  );

  const game = sqlite.prepare('SELECT * FROM league_games WHERE id = ?').get(result.lastInsertRowid) as any;
  return {
    id: game.id,
    weekId: game.week_id,
    gameNumber: game.game_number,
    score: game.score,
    strikes: game.strikes,
    spares: game.spares,
    splits: game.splits,
    ballId: game.ball_id,
    frameData: game.frame_data,
    createdAt: game.created_at,
  };
});

fastify.put('/leagues/games/:gameId', async (request, reply) => {
  const { gameId } = request.params as any;
  const parsedGameId = parseInt(gameId);
  const existing = sqlite.prepare('SELECT id FROM league_games WHERE id = ?').get(parsedGameId);
  if (!existing) return reply.status(404).send({ error: 'League game not found' });
  const { score, strikes, spares, splits, ballId, frameData } = request.body as any;
  sqlite.prepare(
    'UPDATE league_games SET score=?, strikes=?, spares=?, splits=?, ball_id=?, frame_data=? WHERE id=?'
  ).run(score, strikes ?? 0, spares ?? 0, splits ?? 0, ballId ?? null, frameData ?? null, parsedGameId);
  return sqlite.prepare('SELECT * FROM league_games WHERE id=?').get(parsedGameId);
});

fastify.delete('/leagues/games/:gameId', async (request, reply) => {
  const { gameId } = request.params as any;
  sqlite.prepare('DELETE FROM league_games WHERE id = ?').run(parseInt(gameId));
  return reply.status(204).send();
});

// Tournaments
fastify.get('/tournaments', async (request, reply) => {
  // Serve the SPA when the request looks like a browser navigation
  const accept = String((request.headers as any)?.accept || '');
  if (accept.includes('text/html')) {
    return reply.callNotFound();
  }

  const rows = sqlite.prepare(`
    SELECT t.*,
           COUNT(tg.id) as total_games,
           COALESCE(SUM(tg.score), 0) as series,
           COALESCE(MAX(tg.score), 0) as high_game
    FROM tournaments t
    LEFT JOIN tournament_games tg ON tg.tournament_id = t.id
    GROUP BY t.id
    ORDER BY t.date DESC, t.created_at DESC, t.id DESC
  `).all() as any[];

  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    location: t.location,
    date: t.date,
    endDate: t.end_date,
    format: t.format,
    entryFee: t.entry_fee,
    prizeFund: t.prize_fund,
    placement: t.placement,
    notes: t.notes,
    createdAt: t.created_at,
    totalGames: Number(t.total_games || 0),
    series: Number(t.series || 0),
    high: Number(t.high_game || 0),
  }));
});

// Alias /api/tournaments for SPA clients
fastify.get('/api/tournaments', async () => {
  const rows = sqlite.prepare(`
    SELECT t.*,
           COUNT(tg.id) as total_games,
           COALESCE(SUM(tg.score), 0) as series,
           COALESCE(MAX(tg.score), 0) as high_game
    FROM tournaments t
    LEFT JOIN tournament_games tg ON tg.tournament_id = t.id
    GROUP BY t.id
    ORDER BY t.date DESC, t.created_at DESC, t.id DESC
  `).all() as any[];

  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    location: t.location,
    date: t.date,
    endDate: t.end_date,
    format: t.format,
    entryFee: t.entry_fee,
    prizeFund: t.prize_fund,
    placement: t.placement,
    notes: t.notes,
    createdAt: t.created_at,
    totalGames: Number(t.total_games || 0),
    series: Number(t.series || 0),
    high: Number(t.high_game || 0),
  }));
});

fastify.post('/tournaments', async (request, reply) => {
  const { name, location, date, endDate, format, entryFee, prizeFund, placement, notes } = request.body as any;
  if (!name?.trim()) return reply.status(400).send({ error: 'Tournament name is required' });
  if (!date) return reply.status(400).send({ error: 'Tournament date is required' });

  const result = sqlite.prepare(`
    INSERT INTO tournaments (name, location, date, end_date, format, entry_fee, prize_fund, placement, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name.trim(),
    location || null,
    date,
    endDate || null,
    format || null,
    entryFee === '' || entryFee === undefined || entryFee === null ? null : Number(entryFee),
    prizeFund === '' || prizeFund === undefined || prizeFund === null ? null : Number(prizeFund),
    placement === '' || placement === undefined || placement === null ? null : Number(placement),
    notes || null,
    Date.now(),
  );

  const row = sqlite.prepare('SELECT * FROM tournaments WHERE id = ?').get(result.lastInsertRowid) as any;
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    date: row.date,
    endDate: row.end_date,
    format: row.format,
    entryFee: row.entry_fee,
    prizeFund: row.prize_fund,
    placement: row.placement,
    notes: row.notes,
    createdAt: row.created_at,
  };
});

fastify.get('/tournaments/:id/stats', async (request) => {
  const { id } = request.params as any;
  const tournamentId = parseInt(id);

  const row = sqlite.prepare(`
    SELECT COUNT(*) as total_games,
           COALESCE(SUM(score), 0) as series,
           COALESCE(ROUND(AVG(score)), 0) as average,
           COALESCE(MAX(score), 0) as high
    FROM tournament_games
    WHERE tournament_id = ?
  `).get(tournamentId) as any;

  const tournament = sqlite.prepare('SELECT placement FROM tournaments WHERE id = ?').get(tournamentId) as any;

  return {
    totalGames: Number(row?.total_games || 0),
    series: Number(row?.series || 0),
    average: Number(row?.average || 0),
    high: Number(row?.high || 0),
    placement: tournament?.placement ?? null,
  };
});

fastify.get('/tournaments/:id', async (request, reply) => {
  const { id } = request.params as any;
  // Guard: reject non-numeric IDs (new, edit, share, etc.) so they fall
  // through to the SPA fallback instead of returning JSON API responses.
  if (!id || !/^\d+$/.test(id)) {
    return reply.callNotFound();
  }
  const tournamentId = parseInt(id);

  const tournament = sqlite.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId) as any;
  if (!tournament) return reply.status(404).send({ error: 'Tournament not found' });

  const gamesRows = sqlite.prepare('SELECT * FROM tournament_games WHERE tournament_id = ? ORDER BY game_number ASC, id ASC').all(tournamentId) as any[];
  const statsRes = await internalRequest({ method: 'GET', url: `/tournaments/${tournamentId}/stats` });
  const stats = statsRes.statusCode === 200 ? statsRes.json() : { totalGames: 0, series: 0, average: 0, high: 0, placement: tournament.placement ?? null };

  return {
    id: tournament.id,
    name: tournament.name,
    location: tournament.location,
    date: tournament.date,
    endDate: tournament.end_date,
    format: tournament.format,
    entryFee: tournament.entry_fee,
    prizeFund: tournament.prize_fund,
    placement: tournament.placement,
    notes: tournament.notes,
    createdAt: tournament.created_at,
    games: gamesRows.map((g) => ({
      id: g.id,
      tournamentId: g.tournament_id,
      gameNumber: g.game_number,
      score: g.score,
      strikes: g.strikes,
      spares: g.spares,
      splits: g.splits,
      ballId: g.ball_id,
      squad: g.squad,
      frameData: g.frame_data,
      createdAt: g.created_at,
    })),
    stats,
  };
});

// GET /tournaments/:id/share — share-safe tournament summary with all games and stats
fastify.get('/tournaments/:id/share', async (request, reply) => {
  const { id } = request.params as any;
  const tournamentId = parseInt(id, 10);

  const tournament = sqlite.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId) as any;
  if (!tournament) return reply.status(404).send({ error: 'Tournament not found' });

  const games = sqlite.prepare(`
    SELECT tg.*, b.name as ball_name
    FROM tournament_games tg
    LEFT JOIN balls b ON b.id = tg.ball_id
    WHERE tg.tournament_id = ?
    ORDER BY tg.game_number ASC, tg.id ASC
  `).all(tournamentId) as any[];

  const scores = games.map((g) => g.score).filter((s) => s != null);
  const series = scores.reduce((a, b) => a + b, 0);
  const average = scores.length ? Math.round(series / scores.length) : 0;
  const highGame = scores.length ? Math.max(...scores) : 0;
  const net =
    tournament.prize_fund != null && tournament.entry_fee != null
      ? tournament.prize_fund - tournament.entry_fee
      : null;

  return {
    tournament: {
      id: tournament.id,
      name: tournament.name,
      location: tournament.location,
      date: tournament.date,
      endDate: tournament.end_date,
      format: tournament.format,
      entryFee: tournament.entry_fee,
      prizeFund: tournament.prize_fund,
      placement: tournament.placement,
      notes: null,
    },
    stats: {
      totalGames: scores.length,
      series,
      average,
      highGame,
      placement: tournament.placement,
      net,
    },
    games: games.map((g) => ({
      id: g.id,
      gameNumber: g.game_number,
      score: g.score,
      strikes: g.strikes,
      spares: g.spares,
      splits: g.splits,
      ballId: g.ball_id,
      ballName: g.ball_name || null,
      squad: g.squad || null,
      frameData: g.frame_data,
    })),
  };
});

fastify.get('/api/tournaments/:id/share', async (request, reply) => {
  const { id } = request.params as any;
  const response = await internalRequest({ method: 'GET', url: `/tournaments/${id}/share` });
  return relayInjectedResponse(reply, response);
});

// ── Tournament OG Image ──────────────────────────────────────────
function buildTournamentOgSvg(opts: {
  name: string
  location: string
  date: string
  format: string
  placement: number | null
  totalGames: number
  series: number
  average: number
  highGame: number
}): string {
  const { name, location, date, format, placement, totalGames, series, average, highGame } = opts
  const accent = '#a78bfa'
  const gold = '#fbbf24'

  const parts = [
    location,
    format,
    date ? new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null,
  ].filter(Boolean)
  const subtitle = parts.join(' · ')

  const placementLabel = placement != null ? (placement === 1 ? '🥇 1st' : placement === 2 ? '🥈 2nd' : placement === 3 ? '🥉 3rd' : `#${placement}`) : null

  // 5-stat grid: games | series | avg | high | place
  const statW = 196
  const statGap = 24
  const gridStartX = Math.round((1200 - (statW * 5 + statGap * 4)) / 2)
  const statY = 300

  const makeStat = (x: number, label: string, value: string, accentColor?: string) =>
    `<rect x="${x}" y="${statY}" width="${statW}" height="148" rx="18" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.1)" stroke-width="1.5"/>
    <text x="${x + statW / 2}" y="${statY + 24}" font-size="13" fill="rgba(255,255,255,0.55)" font-family="Arial, sans-serif" text-anchor="middle" letter-spacing="0.5">${label.toUpperCase()}</text>
    <text x="${x + statW / 2}" y="${statY + 96}" font-size="40" font-weight="900" fill="${accentColor || '#ffffff'}" font-family="Arial, sans-serif" text-anchor="middle">${escapeXml(value)}</text>`

  const statsRow = [
    makeStat(gridStartX, 'Games', String(totalGames)),
    makeStat(gridStartX + statW + statGap, 'Series', String(series)),
    makeStat(gridStartX + (statW + statGap) * 2, 'Average', String(average), accent),
    makeStat(gridStartX + (statW + statGap) * 3, 'High Game', String(highGame), highGame === 300 ? gold : undefined),
    placementLabel
      ? makeStat(gridStartX + (statW + statGap) * 4, 'Place', placementLabel, placement <= 3 ? gold : accent)
      : `<rect x="${gridStartX + (statW + statGap) * 4}" y="${statY}" width="${statW}" height="148" rx="18" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.1)" stroke-width="1.5"/>
         <text x="${gridStartX + (statW + statGap) * 4 + statW / 2}" y="${statY + 24}" font-size="13" fill="rgba(255,255,255,0.45)" font-family="Arial, sans-serif" text-anchor="middle" letter-spacing="0.5">PLACE</text>
         <text x="${gridStartX + (statW + statGap) * 4 + statW / 2}" y="${statY + 96}" font-size="28" font-weight="700" fill="rgba(255,255,255,0.3)" font-family="Arial, sans-serif" text-anchor="middle">—</text>`,
  ].join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f0f1a"/>
      <stop offset="100%" stop-color="#17172b"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="35%" r="50%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <ellipse cx="600" cy="200" rx="500" ry="260" fill="url(#glow)"/>
  <rect x="0" y="0" width="1200" height="5" fill="${accent}"/>

  <!-- Header badge -->
  <rect x="50" y="44" width="230" height="36" rx="18" fill="rgba(167,139,250,0.18)" stroke="rgba(167,139,250,0.45)" stroke-width="1.5"/>
  <text x="165" y="68" font-size="14" font-weight="700" fill="#c4b5fd" font-family="Arial, sans-serif" text-anchor="middle" letter-spacing="1">🎯 TOURNAMENT RESULTS</text>

  <!-- BowlSense mark -->
  <text x="1150" y="68" font-size="18" font-weight="700" fill="rgba(255,255,255,0.5)" font-family="Arial, sans-serif" text-anchor="end">🎳 BowlSense</text>

  <!-- Tournament name -->
  <text x="600" y="155" font-size="52" font-weight="900" fill="#ffffff" font-family="Arial, sans-serif" text-anchor="middle">${escapeXml(name || 'Tournament')}</text>

  <!-- Subtitle -->
  ${subtitle ? `<text x="600" y="192" font-size="20" fill="rgba(255,255,255,0.6)" font-family="Arial, sans-serif" text-anchor="middle">${escapeXml(subtitle)}</text>` : ''}

  <!-- Stats grid -->
  ${statsRow}

  <!-- Bottom tagline -->
  <text x="600" y="600" font-size="15" fill="rgba(255,255,255,0.3)" font-family="Arial, sans-serif" text-anchor="middle">Tracked with BowlSense</text>
</svg>`
}

fastify.get('/tournaments/:id/og-image', async (request, reply) => {
  const { id } = request.params as any
  const tournamentId = parseInt(id, 10)
  if (Number.isNaN(tournamentId)) return reply.status(400).send({ error: 'Invalid tournament ID' })

  const tournament = sqlite.prepare('SELECT name, location, date, format, placement FROM tournaments WHERE id = ?').get(tournamentId) as any
  if (!tournament) return reply.status(404).send({ error: 'Tournament not found' })

  const games = sqlite.prepare('SELECT score FROM tournament_games WHERE tournament_id = ? AND score IS NOT NULL ORDER BY game_number ASC, id ASC').all(tournamentId) as any[]
  const scores = games.map((g) => Number(g.score || 0)).filter((s) => s > 0)
  const series = scores.reduce((a, b) => a + b, 0)
  const average = scores.length ? Math.round(series / scores.length) : 0
  const highGame = scores.length ? Math.max(...scores) : 0

  const svg = buildTournamentOgSvg({
    name: tournament.name || 'Tournament',
    location: tournament.location || '',
    date: tournament.date || '',
    format: tournament.format || '',
    placement: tournament.placement ?? null,
    totalGames: scores.length,
    series,
    average,
    highGame,
  })

  const png = await sharp(Buffer.from(svg, 'utf8')).png().toBuffer()
  reply.header('Content-Type', 'image/png')
  reply.header('Cache-Control', 'public, max-age=86400')
  return reply.send(png)
})

fastify.get('/api/tournaments/:id/og-image', async (request, reply) => {
  const { id } = request.params as any
  const response = await internalRequest({ method: 'GET', url: `/tournaments/${id}/og-image` })
  return relayInjectedResponse(reply, response)
})

fastify.get('/api/tournaments/:id/standings', async (request, reply) => {
  const { id } = request.params as any
  const response = await internalRequest({ method: 'GET', url: `/tournaments/${id}/standings` })
  return relayInjectedResponse(reply, response)
})

fastify.get('/tournaments/:id/bracket', async (request, reply) => {
  const { id } = request.params as any;
  const tournamentId = parseInt(id, 10);

  const tournament = sqlite.prepare('SELECT id FROM tournaments WHERE id = ?').get(tournamentId);
  if (!tournament) return reply.status(404).send({ error: 'Tournament not found' });

  const rows = sqlite.prepare(`
    SELECT tg.id, tg.game_number, tg.score, tg.ball_id, tg.squad, b.name as ball_name
    FROM tournament_games tg
    LEFT JOIN balls b ON b.id = tg.ball_id
    WHERE tg.tournament_id = ?
    ORDER BY tg.game_number ASC, tg.id ASC
  `).all(tournamentId) as any[];

  const blockMap = new Map<string, { label: string; games: Array<{ gameNumber: number; score: number; ballId: number | null; ballName: string | null }> }>();
  let unnamedBlockCount = 0;

  const standingsMap = new Map<string, { ballId: number | null; ballName: string; games: number; total: number }>();

  for (const row of rows) {
    const score = row.score == null ? 0 : Number(row.score);
    const rawSquad = typeof row.squad === 'string' ? row.squad.trim() : '';

    const blockLabel = rawSquad || (() => {
      unnamedBlockCount += 1;
      return `Block ${unnamedBlockCount}`;
    })();

    if (!blockMap.has(blockLabel)) {
      blockMap.set(blockLabel, { label: blockLabel, games: [] });
    }

    blockMap.get(blockLabel)!.games.push({
      gameNumber: Number(row.game_number || 0),
      score,
      ballId: row.ball_id == null ? null : Number(row.ball_id),
      ballName: row.ball_name ?? null,
    });

    const ballKey = row.ball_id == null ? 'unknown' : String(row.ball_id);
    if (!standingsMap.has(ballKey)) {
      standingsMap.set(ballKey, {
        ballId: row.ball_id == null ? null : Number(row.ball_id),
        ballName: row.ball_name || 'Unknown Ball',
        games: 0,
        total: 0,
      });
    }

    const standing = standingsMap.get(ballKey)!;
    standing.games += 1;
    standing.total += score;
  }

  const standings = Array.from(standingsMap.values())
    .map((s) => ({
      ...s,
      average: s.games > 0 ? Number((s.total / s.games).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.total - a.total || b.average - a.average || a.ballName.localeCompare(b.ballName))
    .map((s, idx) => ({
      rank: idx + 1,
      ballId: s.ballId,
      ballName: s.ballName,
      games: s.games,
      total: s.total,
      average: s.average,
    }));

  return {
    blocks: Array.from(blockMap.values()),
    standings,
  };
});

fastify.get('/tournaments/:id/standings/og-image', async (request, reply) => {
  const { id } = request.params as any;
  const tournamentId = parseInt(id, 10);
  if (Number.isNaN(tournamentId)) return reply.status(400).send({ error: 'Invalid tournament ID' });

  const tournament = sqlite.prepare('SELECT name, location, date, format FROM tournaments WHERE id = ?').get(tournamentId) as any;
  if (!tournament) return reply.status(404).send({ error: 'Tournament not found' });

  const rows = sqlite.prepare(`
    SELECT tg.id, tg.game_number, tg.score, tg.ball_id, b.name as ball_name
    FROM tournament_games tg
    LEFT JOIN balls b ON b.id = tg.ball_id
    WHERE tg.tournament_id = ?
    ORDER BY tg.game_number ASC, tg.id ASC
  `).all(tournamentId) as any[];

  const standingsMap = new Map<string, { ballId: number | null; ballName: string; games: number; total: number }>();
  for (const row of rows) {
    const score = row.score == null ? 0 : Number(row.score);
    const ballKey = row.ball_id == null ? 'unknown' : String(row.ball_id);
    if (!standingsMap.has(ballKey)) {
      standingsMap.set(ballKey, { ballId: row.ball_id == null ? null : Number(row.ball_id), ballName: row.ball_name || 'Unknown Ball', games: 0, total: 0 });
    }
    const standing = standingsMap.get(ballKey)!;
    standing.games += 1;
    standing.total += score;
  }
  const sorted = Array.from(standingsMap.values())
    .map((s) => ({ ...s, average: s.games > 0 ? Number((s.total / s.games).toFixed(2)) : 0 }))
    .sort((a, b) => b.total - a.total || b.average - a.average || a.ballName.localeCompare(b.ballName));
  const top3 = sorted.slice(0, 3);
  const totalGames = rows.length;
  const totalPins = sorted.reduce((sum, s) => sum + s.total, 0);
  const overallAvg = totalGames > 0 ? Math.round(totalPins / totalGames) : 0;
  const highGame = rows.length ? Math.max(...rows.map((r) => Number(r.score || 0))) : 0;

  const svg = buildTournamentStandingsOgSvg({
    tournamentName: tournament.name || 'Tournament',
    location: tournament.location || '',
    date: tournament.date || '',
    format: tournament.format || '',
    top3: top3.map((s, i) => ({ rank: i + 1, ballName: s.ballName, games: s.games, total: s.total, average: s.average })),
    totalGames,
    totalPins,
    overallAvg,
    highGame,
  });
  const png = await sharp(Buffer.from(svg, 'utf8')).png().toBuffer();
  reply.header('Content-Type', 'image/png');
  reply.header('Cache-Control', 'public, max-age=86400');
  return reply.send(png);
});

fastify.get('/api/tournaments/:id/standings/og-image', async (request, reply) => {
  const { id } = request.params as any;
  const response = await internalRequest({ method: 'GET', url: `/tournaments/${id}/standings/og-image` });
  return relayInjectedResponse(reply, response);
});

function buildTournamentStandingsOgSvg(opts: {
  tournamentName: string;
  location: string;
  date: string;
  format: string;
  top3: { rank: number; ballName: string; games: number; total: number; average: number }[];
  totalGames: number;
  totalPins: number;
  overallAvg: number;
  highGame: number;
}): string {
  const { tournamentName, location, date, format, top3, totalGames, totalPins, overallAvg, highGame } = opts;
  const accent = '#a78bfa';
  const gold = '#fbbf24';
  const parts = [location, format, date ? new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null].filter(Boolean);
  const subtitle = parts.join(' · ');
  const medals = ['🥇', '🥈', '🥉'];
  const top3Rows = top3.length ? top3.map((t, i) => {
    const badge = medals[i] || `#${i + 1}`;
    const nameEsc = escapeXml(t.ballName);
    return `<div style="display:flex;align-items:center;gap:16px;margin-bottom:14px;">
      <div style="width:44px;height:44px;background:rgba(255,255,255,0.06);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px;">${badge}</div>
      <div style="flex:1;">
        <div style="font-size:17px;font-weight:700;color:#ffffff;font-family:Arial,sans-serif;">${nameEsc}</div>
        <div style="font-size:13px;color:rgba(255,255,255,0.55);font-family:Arial,sans-serif;">${t.games} games · ${t.total} pins</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:28px;font-weight:900;color:${i === 0 ? gold : '#ffffff'};font-family:Arial,sans-serif;">${t.average}</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.4);font-family:Arial,sans-serif;">avg</div>
      </div>
    </div>`;
  }).join('') : `<div style="font-size:15px;color:rgba(255,255,255,0.4);text-align:center;padding:20px 0;font-family:Arial,sans-serif;">No games logged yet</div>`;
  const statW = 240;
  const statGap = 20;
  const gridStartX = Math.round((1200 - (statW * 3 + statGap * 2)) / 2);
  const statY = 490;
  const makeStat = (x: number, label: string, value: string, accentColor?: string) =>
    `<rect x="${x}" y="${statY}" width="${statW}" height="100" rx="14" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.1)" stroke-width="1.5"/>
    <text x="${x + statW / 2}" y="${statY + 18}" font-size="11" fill="rgba(255,255,255,0.5)" font-family="Arial,sans-serif" text-anchor="middle" letter-spacing="0.5">${label.toUpperCase()}</text>
    <text x="${x + statW / 2}" y="${statY + 68}" font-size="32" font-weight="900" fill="${accentColor || '#ffffff'}" font-family="Arial,sans-serif" text-anchor="middle">${escapeXml(value)}</text>`;
  const statsRow = [
    makeStat(gridStartX, 'Total Games', String(totalGames)),
    makeStat(gridStartX + statW + statGap, 'Overall Avg', String(overallAvg), accent),
    makeStat(gridStartX + (statW + statGap) * 2, 'High Game', String(highGame), highGame === 300 ? gold : undefined),
  ].join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f0f1a"/>
      <stop offset="100%" stop-color="#17172b"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="28%" r="50%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <ellipse cx="600" cy="180" rx="520" ry="280" fill="url(#glow)"/>
  <rect x="0" y="0" width="1200" height="5" fill="${accent}"/>
  <rect x="50" y="44" width="230" height="36" rx="18" fill="rgba(167,139,250,0.18)" stroke="rgba(167,139,250,0.45)" stroke-width="1.5"/>
  <text x="165" y="68" font-size="14" font-weight="700" fill="#c4b5fd" font-family="Arial,sans-serif" text-anchor="middle" letter-spacing="1">🏆 TOURNAMENT STANDINGS</text>
  <text x="1150" y="68" font-size="18" font-weight="700" fill="rgba(255,255,255,0.5)" font-family="Arial,sans-serif" text-anchor="end">🎳 BowlSense</text>
  <text x="600" y="148" font-size="46" font-weight="900" fill="#ffffff" font-family="Arial,sans-serif" text-anchor="middle">${escapeXml(tournamentName || 'Tournament Standings')}</text>
  ${subtitle ? `<text x="600" y="184" font-size="18" fill="rgba(255,255,255,0.55)" font-family="Arial,sans-serif" text-anchor="middle">${escapeXml(subtitle)}</text>` : ''}
  <rect x="50" y="208" width="1100" height="270" rx="20" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" stroke-width="1.5"/>
  ${top3Rows}
  ${statsRow}
  <text x="600" y="618" font-size="14" fill="rgba(255,255,255,0.28)" font-family="Arial,sans-serif" text-anchor="middle">Tracked with BowlSense</text>
</svg>`;
}

fastify.get('/tournaments/:id/standings', async (request, reply) => {
  const { id } = request.params as any;
  const tournamentId = parseInt(id, 10);

  const tournament = sqlite.prepare('SELECT id FROM tournaments WHERE id = ?').get(tournamentId);
  if (!tournament) return reply.status(404).send({ error: 'Tournament not found' });

  const rows = sqlite.prepare(`
    SELECT tg.id, tg.game_number, tg.score, tg.ball_id, tg.squad, b.name as ball_name
    FROM tournament_games tg
    LEFT JOIN balls b ON b.id = tg.ball_id
    WHERE tg.tournament_id = ?
    ORDER BY tg.game_number ASC, tg.id ASC
  `).all(tournamentId) as any[];

  const standingsMap = new Map<string, { ballId: number | null; ballName: string; games: number; total: number }>();


  for (const row of rows) {
    const score = row.score == null ? 0 : Number(row.score);
    const ballKey = row.ball_id == null ? 'unknown' : String(row.ball_id);
    if (!standingsMap.has(ballKey)) {
      standingsMap.set(ballKey, {
        ballId: row.ball_id == null ? null : Number(row.ball_id),
        ballName: row.ball_name || 'Unknown Ball',
        games: 0,
        total: 0,
      });
    }
    const standing = standingsMap.get(ballKey)!;
    standing.games += 1;
    standing.total += score;
  }

  const standings = Array.from(standingsMap.values())
    .map((s) => ({
      ...s,
      average: s.games > 0 ? Number((s.total / s.games).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.total - a.total || b.average - a.average || a.ballName.localeCompare(b.ballName))
    .map((s, idx) => ({
      rank: idx + 1,
      ballId: s.ballId,
      ballName: s.ballName,
      games: s.games,
      total: s.total,
      average: s.average,
      highGame: s.games > 0 ? Math.max(...rows.filter(r => String(r.ball_id) === String(s.ballId)).map(r => Number(r.score || 0))) : 0,
    }));

  return { standings };
});

fastify.put('/tournaments/:id', async (request, reply) => {
  const { id } = request.params as any;
  const tournamentId = parseInt(id);
  const existing = sqlite.prepare('SELECT id FROM tournaments WHERE id = ?').get(tournamentId);
  if (!existing) return reply.status(404).send({ error: 'Tournament not found' });

  const { name, location, date, endDate, format, entryFee, prizeFund, placement, notes } = request.body as any;
  if (!name?.trim()) return reply.status(400).send({ error: 'Tournament name is required' });
  if (!date) return reply.status(400).send({ error: 'Tournament date is required' });

  sqlite.prepare(`
    UPDATE tournaments
    SET name = ?, location = ?, date = ?, end_date = ?, format = ?, entry_fee = ?, prize_fund = ?, placement = ?, notes = ?
    WHERE id = ?
  `).run(
    name.trim(),
    location || null,
    date,
    endDate || null,
    format || null,
    entryFee === '' || entryFee === undefined || entryFee === null ? null : Number(entryFee),
    prizeFund === '' || prizeFund === undefined || prizeFund === null ? null : Number(prizeFund),
    placement === '' || placement === undefined || placement === null ? null : Number(placement),
    notes || null,
    tournamentId,
  );

  const row = sqlite.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId) as any;
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    date: row.date,
    endDate: row.end_date,
    format: row.format,
    entryFee: row.entry_fee,
    prizeFund: row.prize_fund,
    placement: row.placement,
    notes: row.notes,
    createdAt: row.created_at,
  };
});

fastify.delete('/tournaments/:id', async (request, reply) => {
  const { id } = request.params as any;
  const tournamentId = parseInt(id);

  const tx = sqlite.transaction(() => {
    sqlite.prepare('DELETE FROM tournament_games WHERE tournament_id = ?').run(tournamentId);
    sqlite.prepare('DELETE FROM tournaments WHERE id = ?').run(tournamentId);
  });

  tx();
  return reply.status(204).send();
});

fastify.post('/tournaments/:id/games', async (request, reply) => {
  const { id } = request.params as any;
  const tournamentId = parseInt(id);
  const { gameNumber, score, strikes, spares, splits, ballId, squad, frameData } = request.body as any;

  const tournament = sqlite.prepare('SELECT id FROM tournaments WHERE id = ?').get(tournamentId);
  if (!tournament) return reply.status(404).send({ error: 'Tournament not found' });

  const result = sqlite.prepare(`
    INSERT INTO tournament_games (tournament_id, game_number, score, strikes, spares, splits, ball_id, squad, frame_data, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    tournamentId,
    Number(gameNumber || 1),
    score ?? null,
    strikes ?? 0,
    spares ?? 0,
    splits ?? 0,
    ballId || null,
    squad || null,
    frameData || null,
    Date.now(),
  );

  const g = sqlite.prepare('SELECT * FROM tournament_games WHERE id = ?').get(result.lastInsertRowid) as any;
  return {
    id: g.id,
    tournamentId: g.tournament_id,
    gameNumber: g.game_number,
    score: g.score,
    strikes: g.strikes,
    spares: g.spares,
    splits: g.splits,
    ballId: g.ball_id,
    squad: g.squad,
    frameData: g.frame_data,
    createdAt: g.created_at,
  };
});

fastify.put('/tournaments/games/:gameId', async (request, reply) => {
  const { gameId } = request.params as any;
  const parsedGameId = parseInt(gameId);
  const existing = sqlite.prepare('SELECT id FROM tournament_games WHERE id = ?').get(parsedGameId);
  if (!existing) return reply.status(404).send({ error: 'Tournament game not found' });
  const { score, strikes, spares, splits, ballId, squad, frameData } = request.body as any;
  sqlite.prepare(
    'UPDATE tournament_games SET score=?, strikes=?, spares=?, splits=?, ball_id=?, squad=?, frame_data=? WHERE id=?'
  ).run(score, strikes ?? 0, spares ?? 0, splits ?? 0, ballId ?? null, squad ?? null, frameData ?? null, parsedGameId);
  return sqlite.prepare('SELECT * FROM tournament_games WHERE id=?').get(parsedGameId);
});

fastify.delete('/tournaments/games/:gameId', async (request, reply) => {
  const { gameId } = request.params as any;
  sqlite.prepare('DELETE FROM tournament_games WHERE id = ?').run(parseInt(gameId));
  return reply.status(204).send();
});

// Full stats
fastify.get('/stats/full', async () => {
  const overallRow = sqlite.prepare(`
    SELECT
      ROUND(AVG(score)) as average,
      MAX(score) as high,
      MIN(score) as low,
      COUNT(*) as totalGames,
      COALESCE(SUM(strikes), 0) as totalStrikes,
      COALESCE(SUM(spares), 0) as totalSpares,
      SUM(CASE WHEN score = 300 THEN 1 ELSE 0 END) as perfectGames
    FROM games
  `).get() as any;

  const totalGames = Number(overallRow?.totalGames || 0);

  if (totalGames === 0) {
    return {
      overall: { average: 0, high: 0, low: 0, totalGames: 0, totalStrikes: 0, totalSpares: 0, strikeRate: 0, spareRate: 0, perfectGames: 0 },
      trend: { last5Avg: 0, last10Avg: 0, last20Avg: 0 },
      breakdown: { byMonth: [], byLocation: [], scoreDistribution: { sub150: 0, '150to179': 0, '180to199': 0, '200to224': 0, '225to249': 0, '250plus': 0 } },
    };
  }

  const trendRow = sqlite.prepare(`
    SELECT
      (SELECT ROUND(AVG(score)) FROM (SELECT score FROM games ORDER BY id DESC LIMIT 5)) as last5Avg,
      (SELECT ROUND(AVG(score)) FROM (SELECT score FROM games ORDER BY id DESC LIMIT 10)) as last10Avg,
      (SELECT ROUND(AVG(score)) FROM (SELECT score FROM games ORDER BY id DESC LIMIT 20)) as last20Avg
  `).get() as any;

  const byMonthRows = sqlite.prepare(`
    SELECT strftime('%Y-%m', s.date) as month,
           COUNT(g.id) as games,
           ROUND(AVG(g.score)) as average
    FROM games g
    JOIN sessions s ON g.session_id = s.id
    WHERE g.score IS NOT NULL
    GROUP BY month
    ORDER BY month ASC
  `).all() as any[];

  const byLocationRows = sqlite.prepare(`
    SELECT s.location,
           COUNT(g.id) as games,
           ROUND(AVG(g.score)) as average
    FROM games g
    JOIN sessions s ON g.session_id = s.id
    WHERE g.score IS NOT NULL AND s.location IS NOT NULL AND s.location != ''
    GROUP BY s.location
    ORDER BY games DESC
  `).all() as any[];

  const distRow = sqlite.prepare(`
    SELECT
      SUM(CASE WHEN score < 150 THEN 1 ELSE 0 END) as sub150,
      SUM(CASE WHEN score >= 150 AND score <= 179 THEN 1 ELSE 0 END) as [150to179],
      SUM(CASE WHEN score >= 180 AND score <= 199 THEN 1 ELSE 0 END) as [180to199],
      SUM(CASE WHEN score >= 200 AND score <= 224 THEN 1 ELSE 0 END) as [200to224],
      SUM(CASE WHEN score >= 225 AND score <= 249 THEN 1 ELSE 0 END) as [225to249],
      SUM(CASE WHEN score >= 250 THEN 1 ELSE 0 END) as [250plus]
    FROM games
  `).get() as any;

  const totalStrikes = Number(overallRow.totalStrikes || 0);
  const totalSpares = Number(overallRow.totalSpares || 0);

  return {
    overall: {
      average: Number(overallRow.average || 0),
      high: Number(overallRow.high || 0),
      low: Number(overallRow.low || 0),
      totalGames,
      totalStrikes,
      totalSpares,
      strikeRate: Math.round((totalStrikes / (totalGames * 12)) * 100),
      spareRate: Math.round((totalSpares / (totalGames * 12)) * 100),
      perfectGames: Number(overallRow.perfectGames || 0),
    },
    trend: {
      last5Avg: Number(trendRow?.last5Avg || 0),
      last10Avg: Number(trendRow?.last10Avg || 0),
      last20Avg: Number(trendRow?.last20Avg || 0),
    },
    breakdown: {
      byMonth: byMonthRows,
      byLocation: byLocationRows,
      scoreDistribution: {
        sub150: Number(distRow?.sub150 || 0),
        '150to179': Number(distRow?.['150to179'] || 0),
        '180to199': Number(distRow?.['180to199'] || 0),
        '200to224': Number(distRow?.['200to224'] || 0),
        '225to249': Number(distRow?.['225to249'] || 0),
        '250plus': Number(distRow?.['250plus'] || 0),
      },
    },
  };
});

// Arsenal routes

function getArsenalStats(arsenalId: number) {
  const overall = sqlite.prepare(`
    SELECT
      COUNT(*) as gamesPlayed,
      ROUND(AVG(score)) as averageScore,
      MAX(score) as highGame
    FROM (
      SELECT g.score as score
      FROM games g
      JOIN arsenal_balls ab ON ab.ball_id = g.ball_id
      WHERE ab.arsenal_id = ? AND g.score IS NOT NULL
      UNION ALL
      SELECT lg.score as score
      FROM league_games lg
      JOIN arsenal_balls ab ON ab.ball_id = lg.ball_id
      WHERE ab.arsenal_id = ? AND lg.score IS NOT NULL
      UNION ALL
      SELECT tg.score as score
      FROM tournament_games tg
      JOIN arsenal_balls ab ON ab.ball_id = tg.ball_id
      WHERE ab.arsenal_id = ? AND tg.score IS NOT NULL
    )
  `).get(arsenalId, arsenalId, arsenalId) as any;

  const byBall = sqlite.prepare(`
    SELECT
      ab.ball_id as ballId,
      b.name as ballName,
      ab.role as role,
      COUNT(scores.score) as gamesPlayed,
      ROUND(AVG(scores.score)) as averageScore,
      MAX(scores.score) as highGame
    FROM arsenal_balls ab
    JOIN balls b ON b.id = ab.ball_id
    LEFT JOIN (
      SELECT ball_id, score FROM games WHERE score IS NOT NULL
      UNION ALL
      SELECT ball_id, score FROM league_games WHERE score IS NOT NULL
      UNION ALL
      SELECT ball_id, score FROM tournament_games WHERE score IS NOT NULL
    ) scores ON scores.ball_id = ab.ball_id
    WHERE ab.arsenal_id = ?
    GROUP BY ab.id, ab.ball_id, b.name, ab.role
    ORDER BY gamesPlayed DESC, averageScore DESC
  `).all(arsenalId) as any[];

  const openRow = sqlite.prepare(`
    SELECT COUNT(*) as games, ROUND(AVG(score)) as average
    FROM games g
    JOIN arsenal_balls ab ON ab.ball_id = g.ball_id
    WHERE ab.arsenal_id = ? AND g.score IS NOT NULL
  `).get(arsenalId) as any;

  const leagueRow = sqlite.prepare(`
    SELECT COUNT(*) as games, ROUND(AVG(score)) as average
    FROM league_games lg
    JOIN arsenal_balls ab ON ab.ball_id = lg.ball_id
    WHERE ab.arsenal_id = ? AND lg.score IS NOT NULL
  `).get(arsenalId) as any;

  const tournamentRow = sqlite.prepare(`
    SELECT COUNT(*) as games, ROUND(AVG(score)) as average
    FROM tournament_games tg
    JOIN arsenal_balls ab ON ab.ball_id = tg.ball_id
    WHERE ab.arsenal_id = ? AND tg.score IS NOT NULL
  `).get(arsenalId) as any;

  return {
    gamesPlayed: Number(overall?.gamesPlayed || 0),
    averageScore: Number(overall?.averageScore || 0),
    highGame: Number(overall?.highGame || 0),
    byBall: byBall.map((b) => ({
      ballId: b.ballId,
      ballName: b.ballName,
      role: b.role,
      gamesPlayed: Number(b.gamesPlayed || 0),
      averageScore: Number(b.averageScore || 0),
      highGame: Number(b.highGame || 0),
    })),
    byUseCase: {
      open: { games: Number(openRow?.games || 0), average: Number(openRow?.average || 0) },
      league: { games: Number(leagueRow?.games || 0), average: Number(leagueRow?.average || 0) },
      tournament: { games: Number(tournamentRow?.games || 0), average: Number(tournamentRow?.average || 0) },
    },
  };
}

fastify.get('/arsenals', async (request, reply) => {
  // Serve the SPA when the request looks like a browser navigation
  const accept = String((request.headers as any)?.accept || '');
  if (accept.includes('text/html')) {
    return reply.callNotFound();
  }

  const rows = sqlite.prepare(`
    SELECT a.*, COUNT(ab.id) as ballCount
    FROM arsenals a
    LEFT JOIN arsenal_balls ab ON ab.arsenal_id = a.id
    GROUP BY a.id
    ORDER BY a.created_at DESC, a.id DESC
  `).all() as any[];

  return rows.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    useCase: a.use_case,
    maxSize: Number(a.max_size ?? 6),
    notes: a.notes,
    createdAt: a.created_at,
    ballCount: Number(a.ballCount || 0),
  }));
});

fastify.post('/arsenals', async (request, reply) => {
  const { name, description, useCase, maxSize, notes } = request.body as any;
  if (!name?.trim()) return reply.status(400).send({ error: 'Arsenal name is required' });

  const result = sqlite.prepare(`
    INSERT INTO arsenals (name, description, use_case, max_size, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(name.trim(), description || null, useCase || null, Number(maxSize || 6), notes || null, Date.now());

  const row = sqlite.prepare('SELECT * FROM arsenals WHERE id = ?').get(result.lastInsertRowid) as any;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    useCase: row.use_case,
    maxSize: Number(row.max_size ?? 6),
    notes: row.notes,
    createdAt: row.created_at,
  };
});

fastify.get('/arsenals/:id/stats', async (request, reply) => {
  const { id } = request.params as any;
  const arsenalId = parseInt(id);
  const exists = sqlite.prepare('SELECT id FROM arsenals WHERE id = ?').get(arsenalId);
  if (!exists) return reply.status(404).send({ error: 'Arsenal not found' });
  return getArsenalStats(arsenalId);
});

fastify.get('/arsenals/:id', async (request, reply) => {
  const { id } = request.params as any;
  // Guard: reject non-numeric IDs (new, etc.) so they fall through to the
  // SPA fallback instead of returning JSON API responses.
  if (!id || !/^\d+$/.test(id)) {
    return reply.callNotFound();
  }
  const arsenalId = parseInt(id);
  const arsenal = sqlite.prepare('SELECT * FROM arsenals WHERE id = ?').get(arsenalId) as any;
  if (!arsenal) return reply.status(404).send({ error: 'Arsenal not found' });

  const ballEntries = sqlite.prepare(`
    SELECT ab.id, ab.arsenal_id, ab.ball_id, ab.role, ab.slot_order, ab.notes, ab.created_at,
           b.name as ball_name, b.brand, b.color, b.thumbnail_image, b.core_type, b.core_rg, b.core_diff, b.coverstock_type
    FROM arsenal_balls ab
    JOIN balls b ON b.id = ab.ball_id
    WHERE ab.arsenal_id = ?
    ORDER BY ab.slot_order ASC, ab.id ASC
  `).all(arsenalId) as any[];

  return {
    id: arsenal.id,
    name: arsenal.name,
    description: arsenal.description,
    useCase: arsenal.use_case,
    maxSize: Number(arsenal.max_size ?? 6),
    notes: arsenal.notes,
    createdAt: arsenal.created_at,
    balls: ballEntries.map((ab) => ({
      id: ab.id,
      arsenalId: ab.arsenal_id,
      ballId: ab.ball_id,
      role: ab.role,
      slotOrder: Number(ab.slot_order ?? 0),
      notes: ab.notes,
      createdAt: ab.created_at,
      ball: {
        id: ab.ball_id,
        name: ab.ball_name,
        brand: ab.brand,
        color: ab.color,
        thumbnailImage: ab.thumbnail_image,
        coreType: ab.core_type,
        coreRg: ab.core_rg,
        coreDiff: ab.core_diff,
        coverstockType: ab.coverstock_type,
      },
    })),
    stats: getArsenalStats(arsenalId),
  };
});

fastify.put('/arsenals/:id', async (request, reply) => {
  const { id } = request.params as any;
  const arsenalId = parseInt(id);
  const existing = sqlite.prepare('SELECT id FROM arsenals WHERE id = ?').get(arsenalId);
  if (!existing) return reply.status(404).send({ error: 'Arsenal not found' });

  const { name, description, useCase, maxSize, notes } = request.body as any;
  if (!name?.trim()) return reply.status(400).send({ error: 'Arsenal name is required' });

  sqlite.prepare(`
    UPDATE arsenals
    SET name = ?, description = ?, use_case = ?, max_size = ?, notes = ?
    WHERE id = ?
  `).run(name.trim(), description || null, useCase || null, Number(maxSize || 6), notes || null, arsenalId);

  const row = sqlite.prepare('SELECT * FROM arsenals WHERE id = ?').get(arsenalId) as any;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    useCase: row.use_case,
    maxSize: Number(row.max_size ?? 6),
    notes: row.notes,
    createdAt: row.created_at,
  };
});

fastify.delete('/arsenals/:id', async (request, reply) => {
  const { id } = request.params as any;
  const arsenalId = parseInt(id);

  sqlite.transaction(() => {
    sqlite.prepare('DELETE FROM arsenal_balls WHERE arsenal_id = ?').run(arsenalId);
    sqlite.prepare('DELETE FROM arsenals WHERE id = ?').run(arsenalId);
  })();

  return reply.status(204).send();
});

fastify.post('/arsenals/:id/balls', async (request, reply) => {
  const { id } = request.params as any;
  const arsenalId = parseInt(id);
  const { ballId, role, slotOrder, notes } = request.body as any;

  if (!ballId) return reply.status(400).send({ error: 'ballId is required' });
  const arsenal = sqlite.prepare('SELECT id FROM arsenals WHERE id = ?').get(arsenalId);
  if (!arsenal) return reply.status(404).send({ error: 'Arsenal not found' });

  const existing = sqlite.prepare('SELECT id FROM arsenal_balls WHERE arsenal_id = ? AND ball_id = ?').get(arsenalId, Number(ballId));
  if (existing) return reply.status(400).send({ error: 'Ball already in this arsenal' });

  const autoSlot = sqlite.prepare('SELECT COALESCE(MAX(slot_order), 0) + 1 as nextSlot FROM arsenal_balls WHERE arsenal_id = ?').get(arsenalId) as any;
  const result = sqlite.prepare(`
    INSERT INTO arsenal_balls (arsenal_id, ball_id, role, slot_order, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(arsenalId, Number(ballId), role || null, slotOrder != null ? Number(slotOrder) : Number(autoSlot.nextSlot), notes || null, Date.now());

  const row = sqlite.prepare('SELECT * FROM arsenal_balls WHERE id = ?').get(result.lastInsertRowid) as any;
  return {
    id: row.id,
    arsenalId: row.arsenal_id,
    ballId: row.ball_id,
    role: row.role,
    slotOrder: Number(row.slot_order ?? 0),
    notes: row.notes,
    createdAt: row.created_at,
  };
});

fastify.put('/arsenals/balls/:entryId', async (request, reply) => {
  const { entryId } = request.params as any;
  const parsedId = parseInt(entryId);
  const existing = sqlite.prepare('SELECT * FROM arsenal_balls WHERE id = ?').get(parsedId) as any;
  if (!existing) return reply.status(404).send({ error: 'Entry not found' });

  const { role, slotOrder, notes } = request.body as any;
  sqlite.prepare(`
    UPDATE arsenal_balls
    SET role = ?, slot_order = ?, notes = ?
    WHERE id = ?
  `).run(
    role ?? existing.role,
    slotOrder != null ? Number(slotOrder) : existing.slot_order,
    notes ?? existing.notes,
    parsedId
  );

  const row = sqlite.prepare('SELECT * FROM arsenal_balls WHERE id = ?').get(parsedId) as any;
  return {
    id: row.id,
    arsenalId: row.arsenal_id,
    ballId: row.ball_id,
    role: row.role,
    slotOrder: Number(row.slot_order ?? 0),
    notes: row.notes,
    createdAt: row.created_at,
  };
});

fastify.delete('/arsenals/balls/:entryId', async (request, reply) => {
  const { entryId } = request.params as any;
  sqlite.prepare('DELETE FROM arsenal_balls WHERE id = ?').run(parseInt(entryId));
  return reply.status(204).send();
});

// Backup
fastify.get('/backup', async () => {
  const sessionsRows = sqlite.prepare('SELECT * FROM sessions ORDER BY id ASC').all();
  const gamesRows = sqlite.prepare('SELECT * FROM games ORDER BY id ASC').all();
  const ballsRows = sqlite.prepare('SELECT * FROM balls ORDER BY id ASC').all();
  const leaguesRows = sqlite.prepare('SELECT * FROM leagues ORDER BY id ASC').all();
  const leagueWeeksRows = sqlite.prepare('SELECT * FROM league_weeks ORDER BY id ASC').all();
  const leagueGamesRows = sqlite.prepare('SELECT * FROM league_games ORDER BY id ASC').all();
  const tournamentsRows = sqlite.prepare('SELECT * FROM tournaments ORDER BY id ASC').all();
  const tournamentGamesRows = sqlite.prepare('SELECT * FROM tournament_games ORDER BY id ASC').all();
  const arsenalsRows = sqlite.prepare('SELECT * FROM arsenals ORDER BY id ASC').all();
  const arsenalBallsRows = sqlite.prepare('SELECT * FROM arsenal_balls ORDER BY id ASC').all();
  return {
    exportedAt: new Date().toISOString(),
    sessions: sessionsRows,
    games: gamesRows,
    balls: ballsRows,
    leagues: leaguesRows,
    leagueWeeks: leagueWeeksRows,
    leagueGames: leagueGamesRows,
    tournaments: tournamentsRows,
    tournamentGames: tournamentGamesRows,
    arsenals: arsenalsRows,
    arsenalBalls: arsenalBallsRows,
  };
});

// Restore
fastify.post('/restore', async (request, reply) => {
  const { sessions: sessionsData, games: gamesData, balls: ballsData, leagues: leaguesData, leagueWeeks: leagueWeeksData, leagueGames: leagueGamesData, tournaments: tournamentsData, tournamentGames: tournamentGamesData, arsenals: arsenalsData, arsenalBalls: arsenalBallsData } = request.body as any;

  const restore = sqlite.transaction(() => {
    sqlite.prepare('DELETE FROM arsenal_balls').run();
    sqlite.prepare('DELETE FROM arsenals').run();
    sqlite.prepare('DELETE FROM tournament_games').run();
    sqlite.prepare('DELETE FROM tournaments').run();
    sqlite.prepare('DELETE FROM league_games').run();
    sqlite.prepare('DELETE FROM league_weeks').run();
    sqlite.prepare('DELETE FROM leagues').run();
    sqlite.prepare('DELETE FROM games').run();
    sqlite.prepare('DELETE FROM sessions').run();
    sqlite.prepare('DELETE FROM balls').run();

    const insertBall = sqlite.prepare(
      'INSERT INTO balls (id, name, brand, color, notes, bowwwl_id, core_type, core_rg, core_diff, coverstock_name, coverstock_type, factory_finish, thumbnail_image, created_at) VALUES (@id, @name, @brand, @color, @notes, @bowwwl_id, @core_type, @core_rg, @core_diff, @coverstock_name, @coverstock_type, @factory_finish, @thumbnail_image, @created_at)'
    );
    for (const b of ballsData || []) insertBall.run(b);

    const insertSession = sqlite.prepare(
      'INSERT INTO sessions (id, date, location, lanes, notes, created_at) VALUES (@id, @date, @location, @lanes, @notes, @created_at)'
    );
    for (const s of sessionsData || []) insertSession.run(s);

    const insertGame = sqlite.prepare(
      'INSERT INTO games (id, session_id, game_number, score, strikes, spares, splits, ball_id, frame_data, pin_leaves, created_at) VALUES (@id, @session_id, @game_number, @score, @strikes, @spares, @splits, @ball_id, @frame_data, @pin_leaves, @created_at)'
    );
    for (const g of gamesData || []) insertGame.run({ ...g, frame_data: g?.frame_data ?? null, pin_leaves: g?.pin_leaves ?? null });

    const insertLeague = sqlite.prepare(
      'INSERT INTO leagues (id, name, location, season, day_of_week, games_per_week, start_date, end_date, notes, active, created_at) VALUES (@id, @name, @location, @season, @day_of_week, @games_per_week, @start_date, @end_date, @notes, @active, @created_at)'
    );
    for (const l of leaguesData || []) insertLeague.run(l);

    const insertLeagueWeek = sqlite.prepare(
      'INSERT INTO league_weeks (id, league_id, week_number, date, opponent, games_won, games_lost, games_tied, notes, created_at) VALUES (@id, @league_id, @week_number, @date, @opponent, @games_won, @games_lost, @games_tied, @notes, @created_at)'
    );
    for (const lw of leagueWeeksData || []) insertLeagueWeek.run(lw);

    const insertLeagueGame = sqlite.prepare(
      'INSERT INTO league_games (id, week_id, game_number, score, strikes, spares, splits, ball_id, frame_data, created_at) VALUES (@id, @week_id, @game_number, @score, @strikes, @spares, @splits, @ball_id, @frame_data, @created_at)'
    );
    for (const lg of leagueGamesData || []) insertLeagueGame.run({ ...lg, frame_data: lg?.frame_data ?? null });

    const insertTournament = sqlite.prepare(
      'INSERT INTO tournaments (id, name, location, date, end_date, format, entry_fee, prize_fund, placement, notes, created_at) VALUES (@id, @name, @location, @date, @end_date, @format, @entry_fee, @prize_fund, @placement, @notes, @created_at)'
    );
    for (const t of tournamentsData || []) insertTournament.run(t);

    const insertTournamentGame = sqlite.prepare(
      'INSERT INTO tournament_games (id, tournament_id, game_number, score, strikes, spares, splits, ball_id, squad, frame_data, created_at) VALUES (@id, @tournament_id, @game_number, @score, @strikes, @spares, @splits, @ball_id, @squad, @frame_data, @created_at)'
    );
    for (const tg of tournamentGamesData || []) insertTournamentGame.run({ ...tg, frame_data: tg?.frame_data ?? null });

    const insertArsenal = sqlite.prepare(
      'INSERT INTO arsenals (id, name, description, use_case, max_size, notes, created_at) VALUES (@id, @name, @description, @use_case, @max_size, @notes, @created_at)'
    );
    for (const a of arsenalsData || []) insertArsenal.run(a);

    const insertArsenalBall = sqlite.prepare(
      'INSERT INTO arsenal_balls (id, arsenal_id, ball_id, role, slot_order, notes, created_at) VALUES (@id, @arsenal_id, @ball_id, @role, @slot_order, @notes, @created_at)'
    );
    for (const ab of arsenalBallsData || []) insertArsenalBall.run(ab);

    return {
      sessions: (sessionsData || []).length,
      games: (gamesData || []).length,
      balls: (ballsData || []).length,
      leagues: (leaguesData || []).length,
      leagueWeeks: (leagueWeeksData || []).length,
      leagueGames: (leagueGamesData || []).length,
      tournaments: (tournamentsData || []).length,
      tournamentGames: (tournamentGamesData || []).length,
      arsenals: (arsenalsData || []).length,
      arsenalBalls: (arsenalBallsData || []).length,
    };
  });

  const counts = restore();
  return reply.status(200).send({ imported: counts });
});

// CSV Score Import
// Accepts a CSV file with columns: date, location, game_number, score, [ball_name]
// Groups games by (date, location) into sessions automatically.
// Session-level columns (lanes, notes) are left blank.
fastify.post('/import/csv', async (request, reply) => {
  const req = request as any;
  let filedata: Buffer | undefined;
  let filename = 'unknown';

  try {
    const part = await req.file();
    if (!part) return reply.status(400).send({ error: 'No CSV file provided' });
    filename = part.filename;
    // Use toBuffer() for the file content (the standard @fastify/multipart API)
    filedata = await part.toBuffer();
  } catch (err) {
    console.error('[import/csv] parse error:', err);
    return reply.status(400).send({ error: 'Failed to parse file upload' });
  }

  if (!filedata) {
    return reply.status(400).send({ error: 'No CSV file provided' });
  }

  const text = filedata.toString('utf-8');
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) {
    return reply.status(400).send({ error: 'CSV must have a header row and at least one data row' });
  }

  const header = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/['"]/g, ''));
  const dateIdx = header.findIndex(h => h === 'date');
  const locationIdx = header.findIndex(h => h === 'location' || h === 'lane' || h === 'lanes');
  const gameNumIdx = header.findIndex(h => h === 'game_number' || h === 'game' || h === 'game#');
  const scoreIdx = header.findIndex(h => h === 'score' || h === 'game_score');
  const ballIdx = header.findIndex(h => h === 'ball' || h === 'ball_name' || h === 'ballname');

  if (scoreIdx === -1) {
    return reply.status(400).send({ error: 'CSV must have a "score" column' });
  }
  if (dateIdx === -1) {
    return reply.status(400).send({ error: 'CSV must have a "date" column' });
  }

  type RawRow = { date: string; location: string | null; gameNumber: number; score: number; ball: string | null };
  const rawRows: RawRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const score = parseInt(cols[scoreIdx]?.trim() || '');
    const date = (cols[dateIdx] || '').trim();
    if (!date || isNaN(score)) continue;
    rawRows.push({
      date,
      location: locationIdx >= 0 ? (cols[locationIdx] || '').trim() || null : null,
      gameNumber: gameNumIdx >= 0 ? (parseInt(cols[gameNumIdx] || '1') || 1) : 1,
      score,
      ball: ballIdx >= 0 ? (cols[ballIdx] || '').trim() || null : null,
    });
  }

  if (rawRows.length === 0) {
    return reply.status(400).send({ error: 'No valid data rows found in CSV' });
  }

  const sessionKeyMap = new Map<string, number>();
  const neededBalls = new Set<string>();

  const getSessionKey = (row: RawRow) => `${row.date}__${row.location ?? ''}`;
  for (const row of rawRows) {
    const key = getSessionKey(row);
    if (!sessionKeyMap.has(key)) {
      const result = sqlite.prepare(
        'INSERT INTO sessions (date, location, created_at) VALUES (?, ?, ?)'
      ).run(row.date, row.location, Date.now());
      sessionKeyMap.set(key, Number(result.lastInsertRowid));
    }
    if (row.ball) neededBalls.add(row.ball);
  }

  const ballMap = new Map<string, number>();
  if (neededBalls.size > 0) {
    const existing = sqlite.prepare(
      `SELECT id, name FROM balls WHERE ${[...neededBalls].map(() => 'LOWER(name) = LOWER(?)').join(' OR ')}`
    ).all(...[...neededBalls].map(b => b)) as any[];
    for (const b of existing) ballMap.set(b.name.toLowerCase(), b.id);

    const insertBall = sqlite.prepare('INSERT INTO balls (name, created_at) VALUES (?, ?)');
    for (const ballName of neededBalls) {
      if (![...ballMap.keys()].some(k => k === ballName.toLowerCase())) {
        const res = insertBall.run(ballName, Date.now());
        ballMap.set(ballName.toLowerCase(), Number(res.lastInsertRowid));
      }
    }
  }

  const insertGame = sqlite.prepare(
    'INSERT INTO games (session_id, game_number, score, ball_id) VALUES (?, ?, ?, ?)'
  );
  const insertMany = sqlite.transaction((rows: RawRow[]) => {
    for (const row of rows) {
      const sessionId = sessionKeyMap.get(getSessionKey(row))!;
      const ballId = row.ball ? (ballMap.get(row.ball.toLowerCase()) ?? null) : null;
      insertGame.run(sessionId, row.gameNumber, row.score, ballId);
    }
  });

  insertMany(rawRows);

  return reply.status(200).send({
    ok: true,
    imported: { sessions: sessionKeyMap.size, games: rawRows.length, balls: ballMap.size },
  });
});

// Parse a CSV line respecting quotes
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// API-prefixed alias for CSV import (used by the SPA)
fastify.post('/api/import/csv', async (request, reply) => {
  const req = request as any;
  let filedata: Buffer | undefined;
  let filename = 'unknown';

  try {
    const part = await req.file();
    if (!part) return reply.status(400).send({ error: 'No CSV file provided' });
    filename = part.filename;
    filedata = await part.toBuffer();
  } catch (err) {
    console.error('[api/import/csv] parse error:', err);
    return reply.status(400).send({ error: 'Failed to parse file upload' });
  }

  if (!filedata) {
    return reply.status(400).send({ error: 'No CSV file provided' });
  }

  const text = filedata.toString('utf-8');
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) {
    return reply.status(400).send({ error: 'CSV must have a header row and at least one data row' });
  }

  const header = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/['"]/g, ''));
  const dateIdx = header.findIndex(h => h === 'date');
  const locationIdx = header.findIndex(h => h === 'location' || h === 'lane' || h === 'lanes');
  const gameNumIdx = header.findIndex(h => h === 'game_number' || h === 'game' || h === 'game#');
  const scoreIdx = header.findIndex(h => h === 'score' || h === 'game_score');
  const ballIdx = header.findIndex(h => h === 'ball' || h === 'ball_name' || h === 'ballname');

  if (scoreIdx === -1) {
    return reply.status(400).send({ error: 'CSV must have a "score" column' });
  }
  if (dateIdx === -1) {
    return reply.status(400).send({ error: 'CSV must have a "date" column' });
  }

  type RawRow = { date: string; location: string | null; gameNumber: number; score: number; ball: string | null };
  const rawRows: RawRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const score = parseInt(cols[scoreIdx]?.trim() || '');
    const date = (cols[dateIdx] || '').trim();
    if (!date || isNaN(score)) continue;
    rawRows.push({
      date,
      location: locationIdx >= 0 ? (cols[locationIdx] || '').trim() || null : null,
      gameNumber: gameNumIdx >= 0 ? (parseInt(cols[gameNumIdx] || '1') || 1) : 1,
      score,
      ball: ballIdx >= 0 ? (cols[ballIdx] || '').trim() || null : null,
    });
  }

  if (rawRows.length === 0) {
    return reply.status(400).send({ error: 'No valid data rows found in CSV' });
  }

  const sessionKeyMap = new Map<string, number>();
  const neededBalls = new Set<string>();

  const getSessionKey = (row: RawRow) => `${row.date}__${row.location ?? ''}`;
  for (const row of rawRows) {
    const key = getSessionKey(row);
    if (!sessionKeyMap.has(key)) {
      const result = sqlite.prepare(
        'INSERT INTO sessions (date, location, created_at) VALUES (?, ?, ?)'
      ).run(row.date, row.location, Date.now());
      sessionKeyMap.set(key, Number(result.lastInsertRowid));
    }
    if (row.ball) neededBalls.add(row.ball);
  }

  const ballMap = new Map<string, number>();
  if (neededBalls.size > 0) {
    const existing = sqlite.prepare(
      `SELECT id, name FROM balls WHERE ${[...neededBalls].map(() => 'LOWER(name) = LOWER(?)').join(' OR ')}`
    ).all(...[...neededBalls].map(b => b)) as any[];
    for (const b of existing) ballMap.set(b.name.toLowerCase(), b.id);

    const insertBall = sqlite.prepare('INSERT INTO balls (name, created_at) VALUES (?, ?)');
    for (const ballName of neededBalls) {
      if (![...ballMap.keys()].some(k => k === ballName.toLowerCase())) {
        const res = insertBall.run(ballName, Date.now());
        ballMap.set(ballName.toLowerCase(), Number(res.lastInsertRowid));
      }
    }
  }

  const insertGame = sqlite.prepare(
    'INSERT INTO games (session_id, game_number, score, ball_id) VALUES (?, ?, ?, ?)'
  );
  const insertMany = sqlite.transaction((rows: RawRow[]) => {
    for (const row of rows) {
      const sessionId = sessionKeyMap.get(getSessionKey(row))!;
      const ballId = row.ball ? (ballMap.get(row.ball.toLowerCase()) ?? null) : null;
      insertGame.run(sessionId, row.gameNumber, row.score, ballId);
    }
  });

  insertMany(rawRows);

  return reply.status(200).send({
    ok: true,
    imported: { sessions: sessionKeyMap.size, games: rawRows.length, balls: ballMap.size },
  });
});

// =============================================================
// CSV EXPORT ENDPOINTS
// =============================================================

// CSV escape helper — wraps in quotes if value contains comma, quote, or newline
function csvEscape(value: any): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function csvRow(cells: any[]): string {
  return cells.map(csvEscape).join(',');
}

function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** GET /api/sessions/export.csv — Export sessions + games as CSV
 *  Optional query: ?ids=1,2,3 to export only specific sessions
 *  One row per GAME; session columns repeated per row.
 */
fastify.get('/api/sessions/export.csv', async (request, reply) => {
  const q = (request.query as any) || {};
  const idsParam = (q.ids as string | undefined)?.trim();
  let rows: any[];

  if (idsParam) {
    const ids = idsParam.split(',').map(s => parseInt(s.trim())).filter(n => Number.isFinite(n));
    if (ids.length === 0) return reply.status(400).send({ error: 'No valid ids provided' });
    const placeholders = ids.map(() => '?').join(',');
    rows = sqlite.prepare(`
      SELECT s.id as session_id, s.date as session_date, s.location, s.lanes, s.notes as session_notes,
             g.id as game_id, g.game_number, g.score, g.frame_data, g.notes as game_notes,
             b.name as ball_name
      FROM sessions s
      LEFT JOIN games g ON g.session_id = s.id
      LEFT JOIN balls b ON g.ball_id = b.id
      WHERE s.id IN (${placeholders})
      ORDER BY s.date DESC, s.id DESC, g.game_number ASC
    `).all(...ids) as any[];
  } else {
    rows = sqlite.prepare(`
      SELECT s.id as session_id, s.date as session_date, s.location, s.lanes, s.notes as session_notes,
             g.id as game_id, g.game_number, g.score, g.frame_data, g.notes as game_notes,
             b.name as ball_name
      FROM sessions s
      LEFT JOIN games g ON g.session_id = s.id
      LEFT JOIN balls b ON g.ball_id = b.id
      ORDER BY s.date DESC, s.id DESC, g.game_number ASC
    `).all() as any[];
  }

  const header = [
    'session_id', 'session_date', 'location', 'lanes', 'session_notes',
    'game_id', 'game_number', 'score', 'ball_name', 'frame_data', 'game_notes',
  ];
  const lines: string[] = [csvRow(header)];
  for (const r of rows) {
    lines.push(csvRow([
      r.session_id,
      r.session_date,
      r.location,
      r.lanes,
      r.session_notes,
      r.game_id,
      r.game_number,
      r.score,
      r.ball_name,
      r.frame_data,
      r.game_notes,
    ]));
  }
  const csv = lines.join('\n') + '\n';

  reply.header('Content-Type', 'text/csv; charset=utf-8');
  reply.header('Content-Disposition', `attachment; filename="bowlsense_sessions_${todayStamp()}.csv"`);
  return reply.send(csv);
});

/** GET /api/games/export.csv — Flat games export, one row per game
 *  Optional: ?session_id=N
 */
fastify.get('/api/games/export.csv', async (request, reply) => {
  const q = (request.query as any) || {};
  const sessionId = q.session_id ? parseInt(String(q.session_id)) : null;

  let rows: any[];
  if (sessionId) {
    rows = sqlite.prepare(`
      SELECT g.id as game_id, s.date, s.location, g.game_number, g.score, g.frame_data, g.notes,
             b.name as ball_name
      FROM games g
      JOIN sessions s ON g.session_id = s.id
      LEFT JOIN balls b ON g.ball_id = b.id
      WHERE g.session_id = ?
      ORDER BY s.date DESC, g.game_number ASC
    `).all(sessionId) as any[];
  } else {
    rows = sqlite.prepare(`
      SELECT g.id as game_id, s.date, s.location, g.game_number, g.score, g.frame_data, g.notes,
             b.name as ball_name
      FROM games g
      JOIN sessions s ON g.session_id = s.id
      LEFT JOIN balls b ON g.ball_id = b.id
      ORDER BY s.date DESC, g.game_number ASC
    `).all() as any[];
  }

  const header = ['game_id', 'date', 'location', 'game_number', 'score', 'ball_name', 'frame_data', 'notes'];
  const lines: string[] = [csvRow(header)];
  for (const r of rows) {
    lines.push(csvRow([
      r.game_id, r.date, r.location, r.game_number, r.score, r.ball_name, r.frame_data, r.notes,
    ]));
  }
  const csv = lines.join('\n') + '\n';

  reply.header('Content-Type', 'text/csv; charset=utf-8');
  reply.header('Content-Disposition', `attachment; filename="bowlsense_games_${todayStamp()}.csv"`);
  return reply.send(csv);
});

/** GET /api/balls/export.csv */
fastify.get('/api/balls/export.csv', async (_request, reply) => {
  const rows = sqlite.prepare(`
    SELECT id, name, brand, color, notes, bowwwl_id, core_type, core_rg, core_diff,
           coverstock_name, coverstock_type, factory_finish, created_at
    FROM balls
    ORDER BY name COLLATE NOCASE
  `).all() as any[];

  const header = ['id', 'name', 'brand', 'color', 'notes', 'bowwwl_id', 'core_type', 'core_rg', 'core_diff',
    'coverstock_name', 'coverstock_type', 'factory_finish', 'created_at'];
  const lines: string[] = [csvRow(header)];
  for (const r of rows) {
    lines.push(csvRow([
      r.id, r.name, r.brand, r.color, r.notes, r.bowwwl_id,
      r.core_type, r.core_rg, r.core_diff,
      r.coverstock_name, r.coverstock_type, r.factory_finish, r.created_at,
    ]));
  }
  const csv = lines.join('\n') + '\n';
  reply.header('Content-Type', 'text/csv; charset=utf-8');
  reply.header('Content-Disposition', `attachment; filename="bowlsense_balls_${todayStamp()}.csv"`);
  return reply.send(csv);
});

/** GET /api/tournaments/export.csv */
fastify.get('/api/tournaments/export.csv', async (_request, reply) => {
  const rows = sqlite.prepare(`
    SELECT t.id, t.name, t.date, t.end_date, t.location, t.format, t.entry_fee, t.prize_fund,
           t.placement, t.notes, t.created_at,
           (SELECT COUNT(*) FROM tournament_games tg WHERE tg.tournament_id = t.id) as game_count
    FROM tournaments t
    ORDER BY t.date DESC, t.id DESC
  `).all() as any[];

  const header = ['id', 'name', 'date', 'end_date', 'location', 'format', 'entry_fee', 'prize_fund',
    'placement', 'notes', 'game_count', 'created_at'];
  const lines: string[] = [csvRow(header)];
  for (const r of rows) {
    lines.push(csvRow([
      r.id, r.name, r.date, r.end_date, r.location, r.format, r.entry_fee, r.prize_fund,
      r.placement, r.notes, r.game_count, r.created_at,
    ]));
  }
  const csv = lines.join('\n') + '\n';
  reply.header('Content-Type', 'text/csv; charset=utf-8');
  reply.header('Content-Disposition', `attachment; filename="bowlsense_tournaments_${todayStamp()}.csv"`);
  return reply.send(csv);
});

/** DELETE /api/sessions/bulk — Bulk delete sessions
 *  Body: { ids: number[] }
 *  Deletes sessions + their games in a transaction.
 */
fastify.delete('/api/sessions/bulk', async (request, reply) => {
  const body = (request.body as any) || {};
  const ids: number[] = Array.isArray(body.ids) ? body.ids : [];
  const cleanIds = ids.map(n => Number(n)).filter(n => Number.isFinite(n) && n > 0);
  if (cleanIds.length === 0) {
    return reply.status(400).send({ error: 'ids must be a non-empty array of numbers' });
  }

  const placeholders = cleanIds.map(() => '?').join(',');
  const deleteGames = sqlite.prepare(`DELETE FROM games WHERE session_id IN (${placeholders})`);
  const deleteSessions = sqlite.prepare(`DELETE FROM sessions WHERE id IN (${placeholders})`);

  const tx = sqlite.transaction(() => {
    const gamesDeleted = deleteGames.run(...cleanIds).changes;
    const sessionsDeleted = deleteSessions.run(...cleanIds).changes;
    return { sessionsDeleted, gamesDeleted };
  });

  try {
    const result = tx();
    return reply.send({
      ok: true,
      deleted: result.sessionsDeleted,
      gamesDeleted: result.gamesDeleted,
      ids: cleanIds,
    });
  } catch (err) {
    console.error('[bulk delete] error:', err);
    return reply.status(500).send({ error: 'Bulk delete failed' });
  }
});

// Ball performance stats
fastify.get('/stats/by-ball', async () => {
  const rows = sqlite.prepare(`
    SELECT b.id as ballId, b.name as ballName, b.brand,
           COUNT(g.id) as gameCount,
           ROUND(AVG(g.score)) as average
    FROM games g
    JOIN balls b ON g.ball_id = b.id
    WHERE g.ball_id IS NOT NULL
    GROUP BY b.id
    HAVING COUNT(g.id) >= 1
    ORDER BY average DESC
  `).all() as any[];
  return rows;
});

// Recent games for trend chart (last 20, chronological order)
fastify.get('/games-recent', async () => {
  const allGames = sqlite.prepare('SELECT * FROM games ORDER BY id ASC').all() as any[];
  return allGames.slice(-20);
});

// ── Perfect Games ──────────────────────────────────────────
fastify.get('/games/perfect', async () => {
  const perfectGames = sqlite.prepare(`
    SELECT
      g.id,
      g.game_number as gameNumber,
      g.score,
      g.strikes,
      g.spares,
      g.splits,
      g.ball_id as ballId,
      g.frame_data as frameData,
      g.created_at as gameDate,
      s.id as sessionId,
      s.date,
      s.location,
      s.lanes
    FROM games g
    JOIN sessions s ON s.id = g.session_id
    WHERE g.score = 300
    ORDER BY s.date DESC, g.game_number ASC
  `).all() as any[];

  return perfectGames.map((g) => ({
    ...g,
    frameData: g.frameData,
    ballName: g.ballId
      ? (sqlite.prepare('SELECT name FROM balls WHERE id = ?').get(g.ballId) as any)?.name ?? null
      : null,
  }));
});


// ── API-prefixed routes for SPA Settings page (calls /api/backups, /api/backup, /api/restore) ──
fastify.get('/api/backups', async () => {
  const backups = listBackups();
  return {
    backups,
    latestMtime: backups[0]?.mtime || null,
    backupCount: backups.length,
    cloudRemote: process.env.CLOUD_REMOTE || null,
  };
});

fastify.post('/api/backups', async (request, reply) => {
  try {
    const raw = execSync(`bash "${BACKUP_SCRIPT}" 2>&1`, {
      cwd: __dirname + '/..',
      env: { ...process.env, CLOUD_REMOTE: process.env.CLOUD_REMOTE || '' },
    });
    const backups = listBackups();
    const result = typeof raw === 'string' ? raw : String(raw);
    return { ok: true, output: result.trim().split('\n').pop(), backups };
  } catch (e: any) {
    return reply.status(500).send({ error: e.message });
  }
});

fastify.get('/api/backup', async () => {
  const logFile = join(BACKUP_DIR, 'backup.log');
  try {
    const content = readFileSync(logFile, 'utf-8');
    const lines = content.trim().split('\n').slice(-50);
    return { log: lines.join('\n'), lineCount: lines.length };
  } catch {
    return { log: '', lineCount: 0 };
  }
});

function getDataHealth() {
  const dbList = sqlite.prepare('PRAGMA database_list').all() as any[];
  const mainDb = dbList.find((d) => d.name === 'main') || dbList[0] || null;
  const rawDbFile = typeof mainDb?.file === 'string' ? mainDb.file : '';
  const dbPath = rawDbFile
    ? (rawDbFile.startsWith('/') ? rawDbFile : resolve(__dirname, '..', rawDbFile))
    : resolve(__dirname, '..', 'bowling.db');

  let dbFile: any = null;
  try {
    const st = statSync(dbPath);
    dbFile = {
      exists: true,
      path: dbPath,
      sizeBytes: st.size,
      mtime: st.mtime.toISOString(),
      ageMinutes: Math.round((Date.now() - st.mtime.getTime()) / 60000),
    };
  } catch {
    dbFile = { exists: false, path: dbPath, sizeBytes: 0, mtime: null, ageMinutes: null };
  }

  const tableNames = [
    'sessions', 'games', 'balls', 'leagues', 'league_weeks', 'league_games',
    'tournaments', 'tournament_games', 'arsenals', 'arsenal_balls',
  ];

  const tableCounts = tableNames.map((table) => {
    try {
      const row = sqlite.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as any;
      return { table, count: Number(row?.count || 0) };
    } catch {
      return { table, count: -1 };
    }
  });

  const backups = listBackups();
  const latestBackup = backups[0] || null;
  const backupHealth = {
    count: backups.length,
    latest: latestBackup,
    latestAgeHours: latestBackup
      ? Number(((Date.now() - new Date(latestBackup.mtime).getTime()) / 3600000).toFixed(1))
      : null,
    hasRecentBackup: latestBackup
      ? (Date.now() - new Date(latestBackup.mtime).getTime()) <= 24 * 3600000
      : false,
  };

  const warnings: string[] = [];
  if (!dbFile.exists) warnings.push('Active SQLite file is missing.');
  if (dbFile.exists && dbFile.sizeBytes < 4096) warnings.push('Database file size is very small; verify this is the expected source-of-truth DB.');
  if (!backupHealth.count) warnings.push('No database backups found.');
  if (backupHealth.count && !backupHealth.hasRecentBackup) warnings.push('Latest backup is older than 24 hours.');

  return {
    generatedAt: new Date().toISOString(),
    dbFile,
    tableCounts,
    backupHealth,
    warnings,
  };
}

fastify.get('/data-health', async () => getDataHealth());
fastify.get('/api/data-health', async () => getDataHealth());

fastify.post('/api/restore', async (request, reply) => {
  const { filename } = request.body as any;
  if (!filename) return reply.status(400).send({ error: 'filename required' });
  const src = join(BACKUP_DIR, filename);
  if (!existsSync(src)) return reply.status(404).send({ error: 'Backup not found' });
  const restore = sqlite.transaction(() => {
    const backupDb = new Database(src, { readonly: true });
    // Copy all tables
    const tables = ['sessions', 'games', 'balls', 'leagues', 'league_weeks', 'league_games'];
    for (const table of tables) {
      sqlite.exec(`DELETE FROM ${table}`);
      const rows = backupDb.prepare(`SELECT * FROM ${table}`).all();
      if (rows.length > 0) {
        const columns = Object.keys(rows[0]);
        const insert = sqlite.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`);
        for (const row of rows) insert.run(...Object.values(row));
      }
    }
    backupDb.close();
  });
  try {
    restore();
    return { ok: true };
  } catch (e: any) {
    return reply.status(500).send({ error: e.message });
  }
});

// GET /api/games/perfect — used by PerfectGames page (SPA client-side route)
fastify.get('/api/games/perfect', async () => {
  const perfectGames = sqlite.prepare(`
    SELECT
      g.id,
      g.game_number as gameNumber,
      g.score,
      g.strikes,
      g.spares,
      g.splits,
      g.ball_id as ballId,
      g.frame_data as frameData,
      g.created_at as gameDate,
      s.id as sessionId,
      s.date,
      s.location,
      s.lanes
    FROM games g
    JOIN sessions s ON s.id = g.session_id
    WHERE g.score = 300
    ORDER BY s.date DESC, g.game_number ASC
  `).all() as any[];

  return perfectGames.map((g) => ({
    ...g,
    frameData: g.frameData,
    ballName: g.ballId
      ? (sqlite.prepare('SELECT name FROM balls WHERE id = ?').get(g.ballId) as any)?.name ?? null
      : null,
  }));
});

// OG image for a single perfect (300) game — used as og:image for share links
fastify.get('/api/games/:id/perfect-og-image', async (request, reply) => {
  const { id } = request.params as any;
  const gameId = parseInt(id, 10);
  if (Number.isNaN(gameId)) return reply.status(400).send({ error: 'Invalid game ID' });

  const row = sqlite.prepare(`
    SELECT
      g.id,
      g.game_number as gameNumber,
      g.score,
      g.frame_data as frameData,
      b.name as ballName,
      s.date,
      s.location,
      s.lanes
    FROM games g
    JOIN sessions s ON s.id = g.session_id
    LEFT JOIN balls b ON b.id = g.ball_id
    WHERE g.id = ? AND g.score = 300
  `).get(gameId) as any;

  if (!row) return reply.status(404).send({ error: 'Perfect game not found' });

  const marks = parseFramesOG(row.frame_data);
  const svg = buildGameOgSvg({
    score: Number(row.score || 0),
    gameNumber: Number(row.gameNumber || 0),
    marks,
    location: row.location || 'Unknown Alley',
    date: row.date || '',
    lanes: row.lanes || '',
    ballName: row.ballName || undefined,
  });

  const png = await sharp(Buffer.from(svg, 'utf8')).png().toBuffer();
  reply.header('Content-Type', 'image/png');
  reply.header('Cache-Control', 'public, max-age=86400');
  return reply.send(png);
});


// GET /api/games/perfect/:id — single 300 game with session info (for share page)
fastify.get('/api/games/perfect/:id', async (request, reply) => {
  const { id } = request.params as any;
  const gameId = parseInt(id, 10);
  if (Number.isNaN(gameId)) return reply.status(400).send({ error: 'Invalid game ID' });

  const row = sqlite.prepare(`
    SELECT
      g.id,
      g.game_number as gameNumber,
      g.score,
      g.strikes,
      g.spares,
      g.splits,
      g.frame_data as frameData,
      b.name as ballName,
      s.date,
      s.location,
      s.lanes
    FROM games g
    JOIN sessions s ON s.id = g.session_id
    LEFT JOIN balls b ON b.id = g.ball_id
    WHERE g.id = ? AND g.score = 300
  `).get(gameId) as any;

  if (!row) return reply.status(404).send({ error: 'Perfect game not found' });

  return {
    game: {
      id: row.id,
      gameNumber: row.gameNumber,
      score: row.score,
      strikes: row.strikes,
      spares: row.spares,
      splits: row.splits,
      frameData: row.frameData,
      ballName: row.ballName || null,
    },
    session: {
      date: row.date || '',
      location: row.location || 'Unknown Alley',
      lanes: row.lanes || null,
    },
  };
});

// ── Backup Management ─────────────────────────────────────
const BACKUP_DIR = join(__dirname, '..', 'backups');
const BACKUP_SCRIPT = join(__dirname, '..', 'scripts', 'backup.sh');

function listBackups() {
  try {
    const raw = execSync(`find "${BACKUP_DIR}" -name "bowling_20*.db" -type f ! -name "*_latest.db" -printf "%f\\n" 2>/dev/null || echo ""`, { encoding: 'utf8' });
    const files = String(raw).trim().split('\n').filter(Boolean).sort().reverse();

    return files.map((f) => {
      const path = join(BACKUP_DIR, f);
      const stat = statSync(path);
      const mtime = stat.mtime.toISOString();
      const size = stat.size;
      const timestamp = f.replace('bowling_', '').replace('.db', '');
      return { filename: f, timestamp, size, mtime };
    });
  } catch {
    return [];
  }
}

fastify.get('/backups', async () => {
  const backups = listBackups();
  const latest = join(BACKUP_DIR, 'bowling_latest.db');
  let latestMtime: string | null = null;
  try {
    latestMtime = statSync(latest).mtime.toISOString();
  } catch { /* noop */ }

  return { backups, latestMtime, backupCount: backups.length, cloudRemote: process.env.CLOUD_REMOTE || null };
});

fastify.post('/backups', async (request, reply) => {
  try {
    const raw = execSync(`bash "${BACKUP_SCRIPT}" 2>&1`, {
      encoding: 'utf8',
      env: { ...process.env, CLOUD_REMOTE: process.env.CLOUD_REMOTE || '' },
    });
    const result = typeof raw === 'string' ? raw : String(raw);
    const backups = listBackups();
    return { ok: true, output: result.trim().split('\n').pop(), backups };
  } catch (err: any) {
    return reply.status(500).send({ ok: false, error: err?.message || 'Backup failed' });
  }
});

fastify.get('/backups/:filename', async (request, reply) => {
  const { filename } = request.params as { filename: string };
  const safe = filename.replace(/[^a-zA-Z0-9_\-\.]/g, '');
  const filepath = join(BACKUP_DIR, safe);
  if (!filepath.startsWith(BACKUP_DIR)) {
    return reply.status(403).send({ error: 'Invalid filename' });
  }
  try {
    const stat = statSync(filepath);
    const file = readFileSync(filepath);
    return reply
      .header('Content-Type', 'application/x-sqlite3')
      .header('Content-Disposition', `attachment; filename="${safe}"`)
      .header('Content-Length', String(stat.size))
      .send(file);
  } catch {
    return reply.status(404).send({ error: 'Backup file not found' });
  }
});


// ── API prefix aliases for SPA clients ─────────────────────
// The React frontend uses /api/* for all data calls.
// These aliases ensure the backend responds correctly on port 3003 without a proxy.

// GET /api/arsenals — mirrors /arsenals
fastify.get('/api/arsenals', async () => {
  const rows = sqlite.prepare(`
    SELECT a.*, COUNT(ab.id) as ballCount
    FROM arsenals a
    LEFT JOIN arsenal_balls ab ON ab.arsenal_id = a.id
    GROUP BY a.id
    ORDER BY a.created_at DESC, a.id DESC
  `).all() as any[];
  return rows.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    useCase: a.use_case,
    maxSize: Number(a.max_size ?? 6),
    notes: a.notes,
    createdAt: a.created_at,
    ballCount: Number(a.ballCount || 0),
  }));
});

// GET /api/games — mirrors /games endpoint (list recent games)
fastify.get('/api/games', async () => {
  const rows = sqlite.prepare(`
    SELECT g.*, s.date, s.location
    FROM games g JOIN sessions s ON s.id = g.session_id
    ORDER BY s.date DESC, g.id DESC LIMIT 50
  `).all() as any[];
  return rows;
});

// GET /api/stats/full — returns the rich {overall, trend, breakdown} shape
// that the Stats page + PublicProfile expect. Mirrors /stats/full exactly.
fastify.get('/api/stats/full', async () => {
  const overallRow = sqlite.prepare(`
    SELECT
      ROUND(AVG(score)) as average,
      MAX(score) as high,
      MIN(score) as low,
      COUNT(*) as totalGames,
      COALESCE(SUM(strikes), 0) as totalStrikes,
      COALESCE(SUM(spares), 0) as totalSpares,
      SUM(CASE WHEN score = 300 THEN 1 ELSE 0 END) as perfectGames
    FROM games
  `).get() as any;

  const totalGames = Number(overallRow?.totalGames || 0);

  if (totalGames === 0) {
    return {
      overall: { average: 0, high: 0, low: 0, totalGames: 0, totalStrikes: 0, totalSpares: 0, strikeRate: 0, spareRate: 0, perfectGames: 0 },
      trend: { last5Avg: 0, last10Avg: 0, last20Avg: 0 },
      breakdown: { byMonth: [], byLocation: [], scoreDistribution: { sub150: 0, '150to179': 0, '180to199': 0, '200to224': 0, '225to249': 0, '250plus': 0 } },
    };
  }

  const trendRow = sqlite.prepare(`
    SELECT
      (SELECT ROUND(AVG(score)) FROM (SELECT score FROM games ORDER BY id DESC LIMIT 5)) as last5Avg,
      (SELECT ROUND(AVG(score)) FROM (SELECT score FROM games ORDER BY id DESC LIMIT 10)) as last10Avg,
      (SELECT ROUND(AVG(score)) FROM (SELECT score FROM games ORDER BY id DESC LIMIT 20)) as last20Avg
  `).get() as any;

  const byMonthRows = sqlite.prepare(`
    SELECT strftime('%Y-%m', s.date) as month,
           COUNT(g.id) as games,
           ROUND(AVG(g.score)) as average
    FROM games g
    JOIN sessions s ON g.session_id = s.id
    WHERE g.score IS NOT NULL
    GROUP BY month
    ORDER BY month ASC
  `).all() as any[];

  const byLocationRows = sqlite.prepare(`
    SELECT s.location,
           COUNT(g.id) as games,
           ROUND(AVG(g.score)) as average
    FROM games g
    JOIN sessions s ON g.session_id = s.id
    WHERE g.score IS NOT NULL AND s.location IS NOT NULL AND s.location != ''
    GROUP BY s.location
    ORDER BY games DESC
  `).all() as any[];

  const distRow = sqlite.prepare(`
    SELECT
      SUM(CASE WHEN score < 150 THEN 1 ELSE 0 END) as sub150,
      SUM(CASE WHEN score >= 150 AND score <= 179 THEN 1 ELSE 0 END) as [150to179],
      SUM(CASE WHEN score >= 180 AND score <= 199 THEN 1 ELSE 0 END) as [180to199],
      SUM(CASE WHEN score >= 200 AND score <= 224 THEN 1 ELSE 0 END) as [200to224],
      SUM(CASE WHEN score >= 225 AND score <= 249 THEN 1 ELSE 0 END) as [225to249],
      SUM(CASE WHEN score >= 250 THEN 1 ELSE 0 END) as [250plus]
    FROM games
  `).get() as any;

  const totalStrikes = Number(overallRow.totalStrikes || 0);
  const totalSpares = Number(overallRow.totalSpares || 0);

  return {
    overall: {
      average: Number(overallRow.average || 0),
      high: Number(overallRow.high || 0),
      low: Number(overallRow.low || 0),
      totalGames,
      totalStrikes,
      totalSpares,
      strikeRate: Math.round((totalStrikes / (totalGames * 12)) * 100),
      spareRate: Math.round((totalSpares / (totalGames * 12)) * 100),
      perfectGames: Number(overallRow.perfectGames || 0),
    },
    trend: {
      last5Avg: Number(trendRow?.last5Avg || 0),
      last10Avg: Number(trendRow?.last10Avg || 0),
      last20Avg: Number(trendRow?.last20Avg || 0),
    },
    breakdown: {
      byMonth: byMonthRows,
      byLocation: byLocationRows,
      scoreDistribution: {
        sub150: Number(distRow?.sub150 || 0),
        '150to179': Number(distRow?.['150to179'] || 0),
        '180to199': Number(distRow?.['180to199'] || 0),
        '200to224': Number(distRow?.['200to224'] || 0),
        '225to249': Number(distRow?.['225to249'] || 0),
        '250plus': Number(distRow?.['250plus'] || 0),
      },
    },
  };
});

// ── Public Profile OG Image ─────────────────────────────────
// GET /profile/og-image — 1200x630 PNG social card for public profile
// Optional ?name=Personalizes the card (used by the public profile page
// so social crawlers see the user's name, not a hardcoded default).
fastify.get('/profile/og-image', async (request, reply) => {
  const rawName = String((request.query as any)?.name ?? '').trim();
  // XML-escape and clamp to 40 chars to keep the card clean
  const safeName = rawName
    .replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c] as string))
    .slice(0, 40);
  const displayName = safeName ? `${safeName}'s BowlSense` : "BowlSense";

  const allGames = sqlite.prepare('SELECT score FROM games').all() as any[];
  const totalGames = allGames.length;

  if (totalGames === 0) {
    const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0d0d1a"/><stop offset="100%" stop-color="#1c1538"/>
      </linearGradient></defs>
      <rect width="1200" height="630" fill="url(#bgGrad)"/>
      <text x="600" y="280" text-anchor="middle" font-size="48" font-weight="800" fill="#a78bfa" font-family="Arial, sans-serif">🎳 ${displayName}</text>
      <text x="600" y="340" text-anchor="middle" font-size="32" fill="#ffffff" font-family="Arial, sans-serif">Start bowling to build your profile!</text>
      <text x="600" y="596" text-anchor="middle" font-size="20" fill="#6f7394" font-family="Arial, sans-serif">Track your game at BowlSense</text>
    </svg>`;
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    reply.header('Content-Type', 'image/png');
    reply.header('Cache-Control', 'public, max-age=86400');
    return reply.send(png);
  }

  const scores = allGames.map((g) => Number(g.score || 0));
  const totalScore = scores.reduce((sum, s) => sum + s, 0);
  const average = Math.round(totalScore / totalGames);
  const highScore = Math.max(...scores);
  const perfectGames = allGames.filter((g) => Number(g.score || 0) === 300).length;

  const accent = '#fbbf24'; // gold for highlight
  const purp = '#a78bfa';
  const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0d0d1a"/>
        <stop offset="55%" stop-color="#1c1538"/>
        <stop offset="100%" stop-color="#2a1d56"/>
      </linearGradient>
    </defs>
    <rect width="1200" height="630" fill="url(#bgGrad)"/>
    <!-- Background bowling ball decorative -->
    <circle cx="1050" cy="520" r="220" fill="rgba(167,139,250,0.07)"/>
    <circle cx="1050" cy="520" r="160" fill="rgba(167,139,250,0.04)"/>

    <!-- Top bar -->
    <rect x="70" y="70" width="8" height="44" rx="4" fill="${purp}"/>
    <text x="92" y="107" font-size="28" font-weight="800" fill="${purp}" font-family="Arial, sans-serif">🎳 BowlSense</text>

    <!-- Profile badge -->
    <rect x="70" y="136" width="200" height="34" rx="17" fill="rgba(167,139,250,0.18)" stroke="rgba(167,139,250,0.45)" stroke-width="1.5"/>
    <text x="170" y="159" text-anchor="middle" font-size="17" font-weight="700" fill="${purp}" font-family="Arial, sans-serif">PUBLIC PROFILE</text>

    <!-- Main heading -->
    <text x="70" y="220" font-size="58" font-weight="800" fill="#ffffff" font-family="Arial, sans-serif">${displayName}</text>
    <text x="70" y="260" font-size="24" fill="rgba(255,255,255,0.65)" font-family="Arial, sans-serif">${totalGames.toLocaleString()} games tracked</text>

    <!-- Stat grid — 2×2, right side -->
    <!-- Row 1 -->
    <rect x="660" y="120" width="230" height="130" rx="20" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.1)" stroke-width="1.5"/>
    <text x="775" y="160" text-anchor="middle" font-size="17" fill="rgba(255,255,255,0.65)" font-family="Arial, sans-serif">Average</text>
    <text x="775" y="222" text-anchor="middle" font-size="58" font-weight="800" fill="#ffffff" font-family="Arial, sans-serif">${average}</text>

    <rect x="900" y="120" width="230" height="130" rx="20" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.1)" stroke-width="1.5"/>
    <text x="1015" y="160" text-anchor="middle" font-size="17" fill="rgba(255,255,255,0.65)" font-family="Arial, sans-serif">High Score</text>
    <text x="1015" y="222" text-anchor="middle" font-size="58" font-weight="800" fill="${accent}" font-family="Arial, sans-serif">${highScore}</text>

    <!-- Row 2 -->
    <rect x="660" y="260" width="230" height="130" rx="20" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.1)" stroke-width="1.5"/>
    <text x="775" y="300" text-anchor="middle" font-size="17" fill="rgba(255,255,255,0.65)" font-family="Arial, sans-serif">Perfect Games</text>
    <text x="775" y="362" text-anchor="middle" font-size="58" font-weight="800" fill="${accent}" font-family="Arial, sans-serif">${perfectGames}</text>

    <rect x="900" y="260" width="230" height="130" rx="20" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.1)" stroke-width="1.5"/>
    <text x="1015" y="300" text-anchor="middle" font-size="17" fill="rgba(255,255,255,0.65)" font-family="Arial, sans-serif">Total Games</text>
    <text x="1015" y="362" text-anchor="middle" font-size="58" font-weight="800" fill="#ffffff" font-family="Arial, sans-serif">${totalGames}</text>

    <!-- Bottom tagline -->
    <text x="70" y="596" font-size="20" fill="#6f7394" font-family="Arial, sans-serif">View full profile →  BowlSense</text>
  </svg>`;

  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  reply.header('Content-Type', 'image/png');
  reply.header('Cache-Control', 'public, max-age=86400');
  return reply.send(png);
});

// API-prefixed mirror for SPA — preserves the ?name= param
fastify.get('/api/profile/og-image', async (request, reply) => {
  const name = String((request.query as any)?.name ?? '');
  const url = name
    ? `/profile/og-image?name=${encodeURIComponent(name)}`
    : '/profile/og-image';
  const response = await internalRequest({ method: 'GET', url });
  return relayInjectedResponse(reply, response);
});

// GET /api/leagues/:id — mirrors /leagues/:id
fastify.get('/api/leagues/:id', async (request, reply) => {
  const { id } = request.params as any;
  const response = await internalRequest({ method: 'GET', url: `/leagues/${id}` });
  return relayInjectedResponse(reply, response);
});

// GET /api/leagues/weeks/:weekId — mirrors /leagues/weeks/:weekId
fastify.get('/api/leagues/weeks/:weekId', async (request, reply) => {
  const { weekId } = request.params as any;
  const response = await internalRequest({ method: 'GET', url: `/leagues/weeks/${weekId}` });
  return relayInjectedResponse(reply, response);
});

// PUT /api/leagues/weeks/:weekId
fastify.put('/api/leagues/weeks/:weekId', async (request, reply) => {
  const { weekId } = request.params as any;
  const response = await internalRequest({ method: 'PUT', url: `/leagues/weeks/${weekId}`, payload: request.body });
  return relayInjectedResponse(reply, response);
});

// DELETE /api/leagues/weeks/:weekId
fastify.delete('/api/leagues/weeks/:weekId', async (request, reply) => {
  const { weekId } = request.params as any;
  const response = await internalRequest({ method: 'DELETE', url: `/leagues/weeks/${weekId}` });
  return relayInjectedResponse(reply, response);
});

// POST /api/leagues/weeks/:weekId/games
fastify.post('/api/leagues/weeks/:weekId/games', async (request, reply) => {
  const { weekId } = request.params as any;
  const response = await internalRequest({ method: 'POST', url: `/leagues/weeks/${weekId}/games`, payload: request.body });
  return relayInjectedResponse(reply, response);
});

// PUT /api/leagues/games/:gameId
fastify.put('/api/leagues/games/:gameId', async (request, reply) => {
  const { gameId } = request.params as any;
  const response = await internalRequest({ method: 'PUT', url: `/leagues/games/${gameId}`, payload: request.body });
  return relayInjectedResponse(reply, response);
});

// DELETE /api/leagues/games/:gameId
fastify.delete('/api/leagues/games/:gameId', async (request, reply) => {
  const { gameId } = request.params as any;
  const response = await internalRequest({ method: 'DELETE', url: `/leagues/games/${gameId}` });
  return relayInjectedResponse(reply, response);
});

// GET /leagues/:id/share — share-safe league summary with all weeks and stats
fastify.get('/leagues/:id/share', async (request, reply) => {
  const { id } = request.params as any;
  const leagueId = parseInt(id);

  const league = sqlite.prepare('SELECT * FROM leagues WHERE id = ?').get(leagueId) as any;
  if (!league) return reply.status(404).send({ error: 'League not found' });

  const weeks = sqlite.prepare(`
    SELECT lw.*,
      COALESCE(json_group_array(
        CASE WHEN lg.id IS NULL THEN NULL ELSE json_object(
          'gameNumber', lg.game_number,
          'score', lg.score,
          'strikes', lg.strikes,
          'spares', lg.spares,
          'splits', lg.splits,
          'ballId', lg.ball_id
        ) END
      ), '[]') as gamesJson
    FROM league_weeks lw
    LEFT JOIN league_games lg ON lg.week_id = lw.id
    WHERE lw.league_id = ?
    GROUP BY lw.id
    ORDER BY lw.week_number ASC
  `).all(leagueId) as any[];

  const parsedWeeks = weeks.map((w) => {
    const games = (JSON.parse(w.gamesJson || '[]') as any[]).filter(Boolean);
    const scores = games.map((g) => g.score).filter((s) => s != null);
    const series = scores.reduce((a, b) => a + b, 0);
    return {
      weekNumber: w.week_number,
      date: w.date,
      opponent: w.opponent || 'Unknown',
      games,
      series: scores.length ? series : null,
      gamesWon: w.games_won,
      gamesLost: w.games_lost,
      gamesTied: w.games_tied ?? 0,
    };
  });

  const allScores = parsedWeeks.flatMap((w) => w.games.map((g) => g.score).filter((s) => s != null));
  const avg = allScores.length ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : 0;
  const highGame = allScores.length ? Math.max(...allScores) : 0;
  const totalWon = parsedWeeks.reduce((a, w) => a + (w.gamesWon || 0), 0);
  const totalLost = parsedWeeks.reduce((a, w) => a + (w.gamesLost || 0), 0);
  const totalTied = parsedWeeks.reduce((a, w) => a + (w.gamesTied || 0), 0);

  return {
    league: {
      id: league.id,
      name: league.name,
      location: league.location,
      season: league.season,
      dayOfWeek: league.day_of_week,
    },
    stats: {
      average: avg,
      totalWeeks: parsedWeeks.length,
      gamesWon: totalWon,
      gamesLost: totalLost,
      gamesTied: totalTied,
      highGame,
    },
    weeks: parsedWeeks,
  };
});

// API-prefixed mirror
fastify.get('/api/leagues/:id/share', async (request, reply) => {
  const { id } = request.params as any;
  const response = await internalRequest({ method: 'GET', url: `/leagues/${id}/share` });
  return relayInjectedResponse(reply, response);
});

function buildLeagueShareOgSvg(opts: {
  name: string
  location: string | null
  season: string | null
  dayOfWeek: string | null
  average: number
  gamesWon: number
  gamesLost: number
  gamesTied: number
  totalWeeks: number
  highGame: number
}): string {
  const { name, location, season, dayOfWeek, average, gamesWon, gamesLost, gamesTied, totalWeeks, highGame } = opts
  const accent = '#a78bfa'
  const gold = '#fbbf24'

  const parts = [location, season, dayOfWeek].filter(Boolean)
  const subtitle = parts.join(' · ')

  const statW = 196
  const statGap = 24
  const gridStartX = Math.round((1200 - (statW * 4 + statGap * 3)) / 2)
  const statY = 325

  const makeStat = (x: number, label: string, value: string, accentColor?: string) =>
    `<rect x="${x}" y="${statY}" width="${statW}" height="148" rx="18" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.1)" stroke-width="1.5"/>
    <text x="${x + statW / 2}" y="${statY + 24}" font-size="13" fill="rgba(255,255,255,0.55)" font-family="Arial, sans-serif" text-anchor="middle" letter-spacing="0.5">${label.toUpperCase()}</text>
    <text x="${x + statW / 2}" y="${statY + 96}" font-size="40" font-weight="900" fill="${accentColor || '#ffffff'}" font-family="Arial, sans-serif" text-anchor="middle">${escapeXml(value)}</text>`

  const recordLabel = gamesTied > 0
    ? `${gamesWon}W – ${gamesLost}L – ${gamesTied}T`
    : `${gamesWon}W – ${gamesLost}L`

  const statsRow = [
    makeStat(gridStartX, 'Average', String(average), accent),
    makeStat(gridStartX + statW + statGap, 'Record', recordLabel),
    makeStat(gridStartX + (statW + statGap) * 2, 'Weeks', String(totalWeeks)),
    makeStat(gridStartX + (statW + statGap) * 3, 'High Game', String(highGame), highGame === 300 ? gold : undefined),
  ].join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f0f1a"/>
      <stop offset="100%" stop-color="#17172b"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="35%" r="50%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <ellipse cx="600" cy="200" rx="500" ry="260" fill="url(#glow)"/>
  <rect x="0" y="0" width="1200" height="5" fill="${accent}"/>
  <rect x="50" y="44" width="230" height="36" rx="18" fill="rgba(167,139,250,0.18)" stroke="rgba(167,139,250,0.45)" stroke-width="1.5"/>
  <text x="165" y="68" font-size="14" font-weight="700" fill="#c4b5fd" font-family="Arial, sans-serif" text-anchor="middle" letter-spacing="1">🏆 LEAGUE RESULTS</text>
  <text x="1150" y="68" font-size="18" font-weight="700" fill="rgba(255,255,255,0.5)" font-family="Arial, sans-serif" text-anchor="end">🎳 BowlSense</text>
  <text x="600" y="155" font-size="52" font-weight="900" fill="#ffffff" font-family="Arial, sans-serif" text-anchor="middle">${escapeXml(name || 'League')}</text>
  ${subtitle ? `<text x="600" y="192" font-size="20" fill="rgba(255,255,255,0.6)" font-family="Arial, sans-serif" text-anchor="middle">${escapeXml(subtitle)}</text>` : ''}
  <g transform="translate(460, 218)">
    <rect x="0" y="0" width="280" height="56" rx="28" fill="${gamesWon > gamesLost ? 'rgba(52,211,153,0.2)' : gamesLost > gamesWon ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.1)'}" stroke="${gamesWon > gamesLost ? 'rgba(52,211,153,0.5)' : gamesLost > gamesWon ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.2)'}" stroke-width="1.5"/>
    <text x="140" y="35" font-size="22" font-weight="800" fill="${gamesWon > gamesLost ? '#34d399' : gamesLost > gamesWon ? '#fc8181' : '#ffffff'}" font-family="Arial, sans-serif" text-anchor="middle">${escapeXml(recordLabel)}</text>
  </g>
  <text x="600" y="296" font-size="13" fill="rgba(255,255,255,0.4)" font-family="Arial, sans-serif" text-anchor="middle">${gamesWon + gamesLost + gamesTied} games tracked</text>
  ${statsRow}
  <text x="600" y="600" font-size="15" fill="rgba(255,255,255,0.3)" font-family="Arial, sans-serif" text-anchor="middle">Tracked with BowlSense</text>
</svg>`
}

fastify.get('/leagues/:id/share/og-image', async (request, reply) => {
  const { id } = request.params as any
  const leagueId = parseInt(id, 10)
  if (Number.isNaN(leagueId)) return reply.status(400).send({ error: 'Invalid league ID' })

  const league = sqlite.prepare('SELECT name, location, season, day_of_week FROM leagues WHERE id = ?').get(leagueId) as any
  if (!league) return reply.status(404).send({ error: 'League not found' })

  const weeks = sqlite.prepare(`
    SELECT lw.*, COALESCE(json_group_array(
      CASE WHEN lg.id IS NULL THEN NULL ELSE json_object('score', lg.score) END
    ), '[]') as gamesJson
    FROM league_weeks lw
    LEFT JOIN league_games lg ON lg.week_id = lw.id
    WHERE lw.league_id = ?
    GROUP BY lw.id
    ORDER BY lw.week_number ASC
  `).all(leagueId) as any[]


  const allScores: number[] = []
  let gamesWon = 0
  let gamesLost = 0
  let gamesTied = 0
  for (const w of weeks) {
    gamesWon += w.games_won || 0
    gamesLost += w.games_lost || 0
    gamesTied += w.games_tied ?? 0
    const games = (JSON.parse(w.gamesJson || '[]') as any[]).filter(Boolean)
    for (const g of games) {
      if (g.score != null) allScores.push(g.score)
    }
  }

  const avg = allScores.length ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : 0
  const highGame = allScores.length ? Math.max(...allScores) : 0

  const svg = buildLeagueShareOgSvg({
    name: league.name || 'League',
    location: league.location || null,
    season: league.season || null,
    dayOfWeek: league.day_of_week || null,
    average: avg,
    gamesWon,
    gamesLost,
    gamesTied,
    totalWeeks: weeks.length,
    highGame,
  })

  const png = await sharp(Buffer.from(svg, 'utf8')).png().toBuffer()
  reply.header('Content-Type', 'image/png')
  reply.header('Cache-Control', 'public, max-age=86400')
  return reply.send(png)
})

fastify.get('/api/leagues/:id/share/og-image', async (request, reply) => {
  const { id } = request.params as any
  const response = await internalRequest({ method: 'GET', url: `/leagues/${id}/share/og-image` })
  return relayInjectedResponse(reply, response)
})

// Same-origin SPA aliases. Keep these as thin relays so development and the
// production server exercise the exact same route contracts.
fastify.post('/api/sessions', async (request, reply) => {
  const response = await internalRequest({ method: 'POST', url: '/sessions', payload: request.body });
  return relayInjectedResponse(reply, response);
});

fastify.get('/api/sessions/:id', async (request, reply) => {
  const { id } = request.params as any;
  const response = await internalRequest({ method: 'GET', url: `/sessions/${id}` });
  return relayInjectedResponse(reply, response);
});

fastify.put('/api/sessions/:id', async (request, reply) => {
  const { id } = request.params as any;
  const response = await internalRequest({ method: 'PUT', url: `/sessions/${id}`, payload: request.body });
  return relayInjectedResponse(reply, response);
});

fastify.delete('/api/sessions/:id', async (request, reply) => {
  const { id } = request.params as any;
  const response = await internalRequest({ method: 'DELETE', url: `/sessions/${id}` });
  return relayInjectedResponse(reply, response);
});

fastify.post('/api/games', async (request, reply) => {
  const response = await internalRequest({ method: 'POST', url: '/games', payload: request.body });
  return relayInjectedResponse(reply, response);
});

fastify.put('/api/games/:id', async (request, reply) => {
  const { id } = request.params as any;
  const response = await internalRequest({ method: 'PUT', url: `/games/${id}`, payload: request.body });
  return relayInjectedResponse(reply, response);
});

fastify.delete('/api/games/:id', async (request, reply) => {
  const { id } = request.params as any;
  const response = await internalRequest({ method: 'DELETE', url: `/games/${id}` });
  return relayInjectedResponse(reply, response);
});

fastify.post('/api/arsenals', async (request, reply) => {
  const response = await internalRequest({ method: 'POST', url: '/arsenals', payload: request.body });
  return relayInjectedResponse(reply, response);
});

fastify.get('/api/arsenals/:id', async (request, reply) => {
  const { id } = request.params as any;
  const response = await internalRequest({ method: 'GET', url: `/arsenals/${id}` });
  return relayInjectedResponse(reply, response);
});

fastify.put('/api/arsenals/:id', async (request, reply) => {
  const { id } = request.params as any;
  const response = await internalRequest({ method: 'PUT', url: `/arsenals/${id}`, payload: request.body });
  return relayInjectedResponse(reply, response);
});

fastify.delete('/api/arsenals/:id', async (request, reply) => {
  const { id } = request.params as any;
  const response = await internalRequest({ method: 'DELETE', url: `/arsenals/${id}` });
  return relayInjectedResponse(reply, response);
});

fastify.post('/api/arsenals/:id/balls', async (request, reply) => {
  const { id } = request.params as any;
  const response = await internalRequest({ method: 'POST', url: `/arsenals/${id}/balls`, payload: request.body });
  return relayInjectedResponse(reply, response);
});

fastify.put('/api/arsenals/balls/:entryId', async (request, reply) => {
  const { entryId } = request.params as any;
  const response = await internalRequest({ method: 'PUT', url: `/arsenals/balls/${entryId}`, payload: request.body });
  return relayInjectedResponse(reply, response);
});

fastify.delete('/api/arsenals/balls/:entryId', async (request, reply) => {
  const { entryId } = request.params as any;
  const response = await internalRequest({ method: 'DELETE', url: `/arsenals/balls/${entryId}` });
  return relayInjectedResponse(reply, response);
});

fastify.put('/api/leagues/:id', async (request, reply) => {
  const { id } = request.params as any;
  const response = await internalRequest({ method: 'PUT', url: `/leagues/${id}`, payload: request.body });
  return relayInjectedResponse(reply, response);
});

fastify.delete('/api/leagues/:id', async (request, reply) => {
  const { id } = request.params as any;
  const response = await internalRequest({ method: 'DELETE', url: `/leagues/${id}` });
  return relayInjectedResponse(reply, response);
});

fastify.post('/api/leagues/:id/weeks', async (request, reply) => {
  const { id } = request.params as any;
  const response = await internalRequest({ method: 'POST', url: `/leagues/${id}/weeks`, payload: request.body });
  return relayInjectedResponse(reply, response);
});

fastify.get('/api/leagues/:id/stats', async (request, reply) => {
  const { id } = request.params as any;
  const response = await internalRequest({ method: 'GET', url: `/leagues/${id}/stats` });
  return relayInjectedResponse(reply, response);
});

fastify.get('/api/leagues/:id/standings', async (request, reply) => {
  const { id } = request.params as any;
  const response = await internalRequest({ method: 'GET', url: `/leagues/${id}/standings` });
  return relayInjectedResponse(reply, response);
});

fastify.post('/api/tournaments', async (request, reply) => {
  const response = await internalRequest({ method: 'POST', url: '/tournaments', payload: request.body });
  return relayInjectedResponse(reply, response);
});

fastify.get('/api/tournaments/:id', async (request, reply) => {
  const { id } = request.params as any;
  const response = await internalRequest({ method: 'GET', url: `/tournaments/${id}` });
  return relayInjectedResponse(reply, response);
});

fastify.put('/api/tournaments/:id', async (request, reply) => {
  const { id } = request.params as any;
  const response = await internalRequest({ method: 'PUT', url: `/tournaments/${id}`, payload: request.body });
  return relayInjectedResponse(reply, response);
});

fastify.delete('/api/tournaments/:id', async (request, reply) => {
  const { id } = request.params as any;
  const response = await internalRequest({ method: 'DELETE', url: `/tournaments/${id}` });
  return relayInjectedResponse(reply, response);
});

fastify.post('/api/tournaments/:id/games', async (request, reply) => {
  const { id } = request.params as any;
  const response = await internalRequest({ method: 'POST', url: `/tournaments/${id}/games`, payload: request.body });
  return relayInjectedResponse(reply, response);
});

fastify.get('/api/tournaments/:id/bracket', async (request, reply) => {
  const { id } = request.params as any;
  const response = await internalRequest({ method: 'GET', url: `/tournaments/${id}/bracket` });
  return relayInjectedResponse(reply, response);
});

fastify.put('/api/tournaments/games/:gameId', async (request, reply) => {
  const { gameId } = request.params as any;
  const response = await internalRequest({ method: 'PUT', url: `/tournaments/games/${gameId}`, payload: request.body });
  return relayInjectedResponse(reply, response);
});

fastify.delete('/api/tournaments/games/:gameId', async (request, reply) => {
  const { gameId } = request.params as any;
  const response = await internalRequest({ method: 'DELETE', url: `/tournaments/games/${gameId}` });
  return relayInjectedResponse(reply, response);
});

fastify.get('/api/export', async (_request, reply) => {
  const response = await internalRequest({ method: 'GET', url: '/backup' });
  return relayInjectedResponse(reply, response);
});

fastify.post('/api/import', async (request, reply) => {
  const response = await internalRequest({ method: 'POST', url: '/restore', payload: request.body });
  return relayInjectedResponse(reply, response);
});

fastify.get('/api/backups/:filename', async (request, reply) => {
  const { filename } = request.params as any;
  const response = await internalRequest({ method: 'GET', url: `/backups/${encodeURIComponent(filename)}` });
  return relayInjectedResponse(reply, response);
});

// ── Serve frontend build (SPA — all from one origin for OG images) ──
if (existsSync(FRONTEND_DIST)) {
  // Serve the SPA from the frontend build.
  // @fastify/static with prefix: '/' serves exact files, and when no file
  // matches it falls through (after all explicit API routes are checked).
  // Registering this LAST means API routes are always matched first.
  fastify.register(fastifyStatic, {
    root: FRONTEND_DIST,
    prefix: '/',
    decorateReply: false,
  });
}

// ── SPA fallback: serve index.html for all non-API, non-static routes ──
// Registered after all API + static routes, so it only fires for unmatched URLs.
// This enables client-side routing for React Router paths (perfect-games, settings, etc.)
fastify.setNotFoundHandler((request, reply) => {
  const url = request.url.split('?')[0];
  // Don't serve index.html for actual API namespaces or LeagueSecretary proxy routes
  const API_PREFIXES = ['/api', '/League', '/Bowler', '/Home', '/Bowl'];
  for (const prefix of API_PREFIXES) {
    if (url.startsWith(prefix)) {
      return reply.status(404).send({ error: 'Not found' });
    }
  }
  // Serve the SPA for all other routes (including /sessions/new and /tournaments)
  const indexPath = join(FRONTEND_DIST, 'index.html');
  if (existsSync(indexPath)) {
    return reply.type('text/html').send(readFileSync(indexPath));
  }
  return reply.status(404).send('Frontend not built');
});

// ── Serve static backup log ────────────────────────────────
fastify.get('/backup-log', async () => {
  const logFile = join(BACKUP_DIR, 'backup.log');
  try {
    const content = readFileSync(logFile, 'utf-8');
    const lines = content.trim().split('\n').slice(-50);
    return { log: lines.join('\n'), lineCount: lines.length };
  } catch {
    return { log: '', lineCount: 0 };
  }
});

const listenHost = process.env.BOWLSENSE_HOST || '127.0.0.1';
const exposesNetwork = listenHost !== '127.0.0.1' && listenHost !== '::1' && listenHost !== 'localhost';
if (exposesNetwork && !configuredAuthToken && !configuredProxySecret) {
  throw new Error('Refusing network exposure without BowlSense authentication configuration.');
}

const listenPort = Number(process.env.BOWLSENSE_PORT || 3003);
fastify.listen({ port: listenPort, host: listenHost }, (err) => {
  if (err) throw err;
  console.log(`BowlSense API running on http://localhost:${listenPort}`);
});
