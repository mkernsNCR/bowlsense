import { schemaStatements } from "../db/schema";

interface D1Result<T = Record<string, unknown>> {
  results?: T[];
  meta?: { last_row_id?: number; changes?: number };
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<D1Result>;
}

interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

interface Env {
  DB: D1Database;
  ASSETS: { fetch(request: Request): Promise<Response> };
}

type Row = Record<string, any>;

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

let schemaReady: Promise<void> | undefined;

async function ensureSchema(db: D1Database): Promise<void> {
  if (!schemaReady) {
    schemaReady = db.batch(schemaStatements.map((statement) => db.prepare(statement)))
      .then(() => undefined)
      .catch((caught) => {
        schemaReady = undefined;
        throw caught;
      });
  }
  return schemaReady;
}

function json(value: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

function snakeToCamel(value: string): string {
  return value.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function camelToSnake(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function camelize<T extends Row>(row: T | null | undefined): Row | null {
  if (!row) return null;
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [snakeToCamel(key), value]));
}

function camelizeAll(rows: Row[]): Row[] {
  return rows.map((row) => camelize(row) as Row);
}

async function all(db: D1Database, sql: string, ...values: unknown[]): Promise<Row[]> {
  const result = await db.prepare(sql).bind(...values).all<Row>();
  return result.results ?? [];
}

async function first(db: D1Database, sql: string, ...values: unknown[]): Promise<Row | null> {
  return db.prepare(sql).bind(...values).first<Row>();
}

async function run(db: D1Database, sql: string, ...values: unknown[]): Promise<D1Result> {
  return db.prepare(sql).bind(...values).run();
}

async function body(request: Request): Promise<Row> {
  if (!request.headers.get("content-type")?.includes("application/json")) return {};
  return request.json<Row>();
}

function number(value: string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

const tableColumns: Record<string, string[]> = {
  sessions: ["date", "location", "lanes", "notes", "created_at"],
  games: ["session_id", "game_number", "score", "strikes", "spares", "splits", "ball_id", "frame_data", "pin_leaves", "created_at"],
  balls: ["name", "brand", "color", "notes", "bowwwl_id", "core_type", "core_rg", "core_diff", "coverstock_name", "coverstock_type", "factory_finish", "thumbnail_image", "created_at"],
  leagues: ["name", "location", "season", "day_of_week", "games_per_week", "start_date", "end_date", "notes", "active", "created_at"],
  league_weeks: ["league_id", "week_number", "date", "opponent", "games_won", "games_lost", "games_tied", "notes", "created_at"],
  league_games: ["week_id", "game_number", "score", "strikes", "spares", "splits", "ball_id", "frame_data", "created_at"],
  tournaments: ["name", "location", "date", "end_date", "format", "entry_fee", "prize_fund", "placement", "notes", "created_at"],
  tournament_games: ["tournament_id", "game_number", "score", "strikes", "spares", "splits", "ball_id", "squad", "frame_data", "created_at"],
  arsenals: ["name", "description", "use_case", "max_size", "notes", "created_at"],
  arsenal_balls: ["arsenal_id", "ball_id", "role", "slot_order", "notes", "created_at"],
};

function valuesFor(table: string, input: Row, includeCreatedAt = true): { columns: string[]; values: unknown[] } {
  const allowed = new Set(tableColumns[table]);
  const normalized: Row = {};
  for (const [key, value] of Object.entries(input)) {
    const column = key.includes("_") ? key : camelToSnake(key);
    if (allowed.has(column)) normalized[column] = value === "" ? null : value;
  }
  if (includeCreatedAt && allowed.has("created_at") && normalized.created_at == null) {
    normalized.created_at = Date.now();
  }
  return { columns: Object.keys(normalized), values: Object.values(normalized) };
}

async function insertRow(db: D1Database, table: string, input: Row, explicitId?: number): Promise<Row | null> {
  const prepared = valuesFor(table, input);
  const columns = explicitId == null ? prepared.columns : ["id", ...prepared.columns];
  const values = explicitId == null ? prepared.values : [explicitId, ...prepared.values];
  if (!columns.length) throw new Error(`No values supplied for ${table}`);
  const placeholders = columns.map(() => "?").join(", ");
  const result = await run(db, `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`, ...values);
  const id = explicitId ?? result.meta?.last_row_id;
  return id == null ? null : first(db, `SELECT * FROM ${table} WHERE id = ?`, id);
}

async function updateRow(db: D1Database, table: string, id: number, input: Row): Promise<Row | null> {
  const prepared = valuesFor(table, input, false);
  if (prepared.columns.length) {
    await run(db, `UPDATE ${table} SET ${prepared.columns.map((column) => `${column} = ?`).join(", ")} WHERE id = ?`, ...prepared.values, id);
  }
  return first(db, `SELECT * FROM ${table} WHERE id = ?`, id);
}

async function sessionList(db: D1Database, url: URL): Promise<Response> {
  const limit = Math.min(100, Math.max(1, number(url.searchParams.get("limit")) ?? 20));
  const page = Math.max(1, number(url.searchParams.get("page")) ?? 1);
  const explicitOffset = number(url.searchParams.get("offset"));
  const offset = explicitOffset ?? (page - 1) * limit;
  const location = (url.searchParams.get("location") ?? "").trim();
  const order = url.searchParams.get("order") === "asc" ? "ASC" : "DESC";
  const sort = url.searchParams.get("sort") === "score" ? "avg_score" : "s.date";
  const where = location ? "WHERE LOWER(COALESCE(s.location, '')) LIKE LOWER(?)" : "";
  const params = location ? [`%${location}%`] : [];
  const rows = await all(db, `
    SELECT s.*, COUNT(g.id) AS game_count, COALESCE(ROUND(AVG(g.score)), 0) AS avg_score,
      COALESCE(MAX(g.score), 0) AS high_score,
      SUM(CASE WHEN g.score = 300 THEN 1 ELSE 0 END) AS perfect_games
    FROM sessions s LEFT JOIN games g ON g.session_id = s.id
    ${where}
    GROUP BY s.id
    ORDER BY ${sort} ${order}, s.id ${order}
    LIMIT ? OFFSET ?
  `, ...params, limit, offset);
  const count = await first(db, `SELECT COUNT(*) AS total FROM sessions s ${where}`, ...params);
  return json({ sessions: camelizeAll(rows), total: Number(count?.total ?? 0), limit, offset });
}

async function statsSummary(db: D1Database): Promise<Row> {
  const row = await first(db, `
    SELECT COUNT(*) AS total_games, COALESCE(ROUND(AVG(score)), 0) AS average,
      COALESCE(SUM(score), 0) AS total_score, COALESCE(SUM(strikes), 0) AS total_strikes,
      COALESCE(SUM(spares), 0) AS total_spares
    FROM games WHERE score IS NOT NULL
  `) ?? {};
  const totalGames = Number(row.total_games ?? 0);
  const totalStrikes = Number(row.total_strikes ?? 0);
  const totalSpares = Number(row.total_spares ?? 0);
  return {
    average: Number(row.average ?? 0),
    strikeRate: totalGames ? Math.round((totalStrikes / (totalGames * 12)) * 100) : 0,
    spareRate: totalGames ? Math.round((totalSpares / (totalGames * 12)) * 100) : 0,
    totalGames,
    totalScore: Number(row.total_score ?? 0),
    totalStrikes,
    totalSpares,
  };
}

async function trend(db: D1Database): Promise<Row> {
  const rows = camelizeAll(await all(db, `
    SELECT g.id, g.score, g.game_number, s.date, s.location
    FROM games g JOIN sessions s ON s.id = g.session_id
    WHERE g.score IS NOT NULL ORDER BY s.date ASC, g.id ASC LIMIT 30
  `));
  const scores = rows.map((row) => Number(row.score ?? 0));
  const rolling = (size: number) => scores.map((_score, index) => average(scores.slice(Math.max(0, index - size + 1), index + 1)));
  return { games: rows, rolling5: rolling(5), rolling10: rolling(10), rolling20: rolling(20) };
}

async function fullStats(db: D1Database): Promise<Row> {
  const rows = camelizeAll(await all(db, `
    SELECT g.*, s.date, COALESCE(s.location, 'Unknown') AS location
    FROM games g JOIN sessions s ON s.id = g.session_id
    WHERE g.score IS NOT NULL ORDER BY s.date ASC, g.id ASC
  `));
  const scores = rows.map((row) => Number(row.score));
  const strikes = rows.reduce((sum, row) => sum + Number(row.strikes ?? 0), 0);
  const spares = rows.reduce((sum, row) => sum + Number(row.spares ?? 0), 0);
  const monthMap = new Map<string, number[]>();
  const locationMap = new Map<string, number[]>();
  for (const row of rows) {
    const month = String(row.date ?? "").slice(0, 7);
    const location = String(row.location ?? "Unknown");
    monthMap.set(month, [...(monthMap.get(month) ?? []), Number(row.score)]);
    locationMap.set(location, [...(locationMap.get(location) ?? []), Number(row.score)]);
  }
  const distribution = {
    sub150: scores.filter((score) => score < 150).length,
    "150to179": scores.filter((score) => score >= 150 && score <= 179).length,
    "180to199": scores.filter((score) => score >= 180 && score <= 199).length,
    "200to224": scores.filter((score) => score >= 200 && score <= 224).length,
    "225to249": scores.filter((score) => score >= 225 && score <= 249).length,
    "250plus": scores.filter((score) => score >= 250).length,
  };
  return {
    overall: {
      average: average(scores), high: scores.length ? Math.max(...scores) : 0,
      low: scores.length ? Math.min(...scores) : 0, totalGames: scores.length,
      totalStrikes: strikes, totalSpares: spares,
      strikeRate: scores.length ? Math.round((strikes / (scores.length * 12)) * 100) : 0,
      spareRate: scores.length ? Math.round((spares / (scores.length * 12)) * 100) : 0,
      perfectGames: scores.filter((score) => score === 300).length,
    },
    trend: {
      last5Avg: average(scores.slice(-5)), last10Avg: average(scores.slice(-10)), last20Avg: average(scores.slice(-20)),
    },
    breakdown: {
      byMonth: [...monthMap].map(([month, values]) => ({ month, games: values.length, average: average(values) })),
      byLocation: [...locationMap].map(([location, values]) => ({ location, games: values.length, average: average(values) })),
      scoreDistribution: distribution,
    },
  };
}

async function weeklyStats(db: D1Database): Promise<Row> {
  const rows = camelizeAll(await all(db, `SELECT g.score, g.strikes, g.spares, s.date FROM games g JOIN sessions s ON s.id = g.session_id`));
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() + (day === 0 ? -6 : 1 - day));
  monday.setHours(0, 0, 0, 0);
  const lastMonday = new Date(monday); lastMonday.setDate(monday.getDate() - 7);
  const summarize = (filtered: Row[]) => {
    const scores = filtered.map((row) => Number(row.score ?? 0));
    const totalStrikes = filtered.reduce((sum, row) => sum + Number(row.strikes ?? 0), 0);
    const totalSpares = filtered.reduce((sum, row) => sum + Number(row.spares ?? 0), 0);
    return { games: scores.length, average: average(scores), highGame: scores.length ? Math.max(...scores) : 0, totalStrikes, totalSpares,
      strikeRate: scores.length ? Math.round(totalStrikes / (scores.length * 12) * 100) : 0,
      spareRate: scores.length ? Math.round(totalSpares / (scores.length * 12) * 100) : 0 };
  };
  const thisRows = rows.filter((row) => new Date(`${row.date}T00:00:00`) >= monday);
  const lastRows = rows.filter((row) => { const date = new Date(`${row.date}T00:00:00`); return date >= lastMonday && date < monday; });
  const thisWeek = summarize(thisRows); const lastWeek = summarize(lastRows);
  return { thisWeek, lastWeek, delta: { average: thisWeek.average - lastWeek.average, games: thisWeek.games - lastWeek.games, highGame: thisWeek.highGame - lastWeek.highGame }, dayOfWeek: now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) };
}

async function leagueDetail(db: D1Database, id: number): Promise<Row | null> {
  const league = camelize(await first(db, "SELECT * FROM leagues WHERE id = ?", id));
  if (!league) return null;
  const weeks = camelizeAll(await all(db, "SELECT * FROM league_weeks WHERE league_id = ? ORDER BY week_number ASC, id ASC", id));
  const scores: number[] = [];
  let gamesWon = 0; let gamesLost = 0; let gamesTied = 0;
  for (const week of weeks) {
    week.games = camelizeAll(await all(db, "SELECT * FROM league_games WHERE week_id = ? ORDER BY game_number ASC, id ASC", week.id));
    scores.push(...week.games.map((game: Row) => game.score).filter((score: unknown) => score != null).map(Number));
    gamesWon += Number(week.gamesWon ?? 0);
    gamesLost += Number(week.gamesLost ?? 0);
    gamesTied += Number(week.gamesTied ?? 0);
  }
  return {
    ...league,
    weeks,
    stats: {
      average: average(scores), high: scores.length ? Math.max(...scores) : 0,
      low: scores.length ? Math.min(...scores) : 0,
      totalPins: scores.reduce((sum, score) => sum + score, 0), totalGames: scores.length,
      gamesWon, gamesLost, gamesTied, totalWeeks: weeks.length,
    },
  };
}

async function leagueList(db: D1Database): Promise<Row[]> {
  const leagues = camelizeAll(await all(db, "SELECT * FROM leagues ORDER BY active DESC, created_at DESC, id DESC"));
  return Promise.all(leagues.map(async (league) => {
    const detail = await leagueDetail(db, Number(league.id));
    return {
      ...league,
      weekCount: detail?.weeks?.length ?? 0,
      gamesWon: detail?.stats?.gamesWon ?? 0,
      gamesLost: detail?.stats?.gamesLost ?? 0,
      gamesTied: detail?.stats?.gamesTied ?? 0,
      stats: detail?.stats,
    };
  }));
}

async function tournamentDetail(db: D1Database, id: number): Promise<Row | null> {
  const tournament = camelize(await first(db, "SELECT * FROM tournaments WHERE id = ?", id));
  if (!tournament) return null;
  const games = camelizeAll(await all(db, "SELECT * FROM tournament_games WHERE tournament_id = ? ORDER BY game_number ASC, id ASC", id));
  const scores = games.map((game) => game.score).filter((score) => score != null).map(Number);
  return {
    ...tournament,
    games,
    stats: {
      average: average(scores), high: scores.length ? Math.max(...scores) : 0,
      low: scores.length ? Math.min(...scores) : 0,
      totalPins: scores.reduce((sum, score) => sum + score, 0), totalGames: scores.length,
    },
  };
}

async function tournamentList(db: D1Database): Promise<Row[]> {
  const tournaments = camelizeAll(await all(db, "SELECT * FROM tournaments ORDER BY date DESC, id DESC"));
  return Promise.all(tournaments.map(async (tournament) => tournamentDetail(db, Number(tournament.id)) as Promise<Row>));
}

async function arsenalDetail(db: D1Database, id: number): Promise<Row | null> {
  const arsenal = camelize(await first(db, "SELECT * FROM arsenals WHERE id = ?", id));
  if (!arsenal) return null;
  const entries = camelizeAll(await all(db, `
    SELECT ab.*, b.name AS ball_name, b.brand AS ball_brand, b.color AS ball_color, b.thumbnail_image AS ball_thumbnail_image
    FROM arsenal_balls ab JOIN balls b ON b.id = ab.ball_id
    WHERE ab.arsenal_id = ? ORDER BY ab.slot_order ASC, ab.id ASC
  `, id));
  const balls = entries.map((entry) => ({
    id: entry.id, arsenalId: entry.arsenalId, ballId: entry.ballId, role: entry.role,
    slotOrder: entry.slotOrder, notes: entry.notes,
    ball: { id: entry.ballId, name: entry.ballName, brand: entry.ballBrand, color: entry.ballColor, thumbnailImage: entry.ballThumbnailImage },
  }));
  const byBall = [];
  for (const entry of balls) {
    const row = await first(db, `
      SELECT COUNT(*) AS games_played, COALESCE(ROUND(AVG(score)), 0) AS average_score, COALESCE(MAX(score), 0) AS high_game
      FROM (
        SELECT score FROM games WHERE ball_id = ?
        UNION ALL SELECT score FROM league_games WHERE ball_id = ?
        UNION ALL SELECT score FROM tournament_games WHERE ball_id = ?
      ) WHERE score IS NOT NULL
    `, entry.ballId, entry.ballId, entry.ballId) ?? {};
    byBall.push({ ballId: entry.ballId, ballName: entry.ball.name, role: entry.role, gamesPlayed: Number(row.games_played ?? 0), averageScore: Number(row.average_score ?? 0), highGame: Number(row.high_game ?? 0) });
  }
  const useCase = async (table: string) => {
    const ids = balls.map((entry) => entry.ballId);
    if (!ids.length) return { games: 0, average: 0 };
    const placeholders = ids.map(() => "?").join(",");
    const row = await first(db, `SELECT COUNT(*) AS games, COALESCE(ROUND(AVG(score)), 0) AS average FROM ${table} WHERE ball_id IN (${placeholders}) AND score IS NOT NULL`, ...ids) ?? {};
    return { games: Number(row.games ?? 0), average: Number(row.average ?? 0) };
  };
  const open = await useCase("games"); const league = await useCase("league_games"); const tournament = await useCase("tournament_games");
  const gamesPlayed = byBall.reduce((sum, item) => sum + item.gamesPlayed, 0);
  const weightedPins = byBall.reduce((sum, item) => sum + item.averageScore * item.gamesPlayed, 0);
  return { ...arsenal, balls, ballCount: balls.length, stats: { gamesPlayed, averageScore: gamesPlayed ? Math.round(weightedPins / gamesPlayed) : 0, highGame: byBall.length ? Math.max(...byBall.map((item) => item.highGame)) : 0, byBall, byUseCase: { open, league, tournament } } };
}

async function arsenalList(db: D1Database): Promise<Row[]> {
  return camelizeAll(await all(db, `
    SELECT a.*, COUNT(ab.id) AS ball_count
    FROM arsenals a LEFT JOIN arsenal_balls ab ON ab.arsenal_id = a.id
    GROUP BY a.id ORDER BY a.created_at DESC, a.id DESC
  `));
}

async function tonightLeagues(db: D1Database): Promise<Row[]> {
  const today = new Date();
  const todayName = today.toLocaleDateString("en-US", { weekday: "long" });
  const todayIso = today.toISOString().slice(0, 10);
  const leagues = (await leagueList(db)).filter((league) => league.dayOfWeek === todayName && Number(league.active ?? 1) !== 0);
  return leagues.map((league) => ({
    ...league, todayName, todayIso, inSeason: (!league.startDate || todayIso >= league.startDate) && (!league.endDate || todayIso <= league.endDate),
    nextWeekNumber: Number(league.weekCount ?? 0) + 1,
    lastOpponent: league.weeks?.at?.(-1)?.opponent ?? null,
    lastWeekDate: league.weeks?.at?.(-1)?.date ?? null,
  }));
}

async function pinLeaves(db: D1Database): Promise<Row> {
  const rows = camelizeAll(await all(db, "SELECT pin_leaves, frame_data, created_at FROM games WHERE pin_leaves IS NOT NULL AND pin_leaves != ''"));
  const counts = new Map<string, { count: number; conversions: number }>();
  const months = new Map<string, Map<string, number>>();
  let total = 0;
  for (const row of rows) {
    let selections: number[][] = [];
    try { selections = JSON.parse(row.pinLeaves); } catch { continue; }
    for (const pins of selections) {
      if (!Array.isArray(pins) || pins.length >= 10) continue;
      const knocked = new Set(pins.map(Number));
      const standing = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((pin) => !knocked.has(pin)).join(",");
      const current = counts.get(standing) ?? { count: 0, conversions: 0 };
      current.count += 1;
      counts.set(standing, current);
      const month = new Date(Number(row.createdAt ?? Date.now())).toISOString().slice(0, 7);
      const monthCounts = months.get(month) ?? new Map<string, number>();
      monthCounts.set(standing, (monthCounts.get(standing) ?? 0) + 1);
      months.set(month, monthCounts);
      total += 1;
    }
  }
  return {
    totalFirstThrows: total,
    totalGames: rows.length,
    leaves: [...counts].sort((a, b) => b[1].count - a[1].count).map(([pins, entry]) => ({ pins, count: entry.count, pct: total ? Math.round(entry.count / total * 1000) / 10 : 0, conversions: entry.conversions, conversionRate: entry.count ? Math.round(entry.conversions / entry.count * 1000) / 10 : 0 })),
    neverLeft: [],
    byMonth: [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, entries]) => ({ month, leaves: [...entries].map(([pins, count]) => ({ pins, count })).sort((a, b) => b.count - a.count) })),
  };
}

const exportTables: Array<[string, string]> = [
  ["sessions", "sessions"], ["games", "games"], ["balls", "balls"], ["leagues", "leagues"],
  ["leagueWeeks", "league_weeks"], ["leagueGames", "league_games"], ["tournaments", "tournaments"],
  ["tournamentGames", "tournament_games"], ["arsenals", "arsenals"], ["arsenalBalls", "arsenal_balls"],
];

async function exportData(db: D1Database): Promise<Row> {
  const data: Row = { exportedAt: new Date().toISOString() };
  for (const [key, table] of exportTables) data[key] = await all(db, `SELECT * FROM ${table} ORDER BY id ASC`);
  return data;
}

async function restoreData(db: D1Database, data: Row): Promise<Row> {
  for (const [, table] of [...exportTables].reverse()) await run(db, `DELETE FROM ${table}`);
  const imported: Row = {};
  for (const [key, table] of exportTables) {
    const rows = Array.isArray(data[key]) ? data[key] as Row[] : [];
    for (const row of rows) await insertRow(db, table, row, Number(row.id));
    imported[key] = rows.length;
  }
  return imported;
}

async function dataHealth(db: D1Database): Promise<Row> {
  const tableCounts = [];
  for (const [, table] of exportTables) {
    const row = await first(db, `SELECT COUNT(*) AS count FROM ${table}`);
    tableCounts.push({ table, count: Number(row?.count ?? 0) });
  }
  return {
    generatedAt: new Date().toISOString(),
    dbFile: { exists: true, path: "Sites D1", sizeBytes: 0, mtime: null, ageMinutes: null },
    tableCounts,
    backupHealth: { count: 1, latest: { filename: "managed-d1", timestamp: new Date().toISOString(), size: 0, mtime: new Date().toISOString() }, latestAgeHours: 0, hasRecentBackup: true },
    warnings: [],
  };
}

function csvEscape(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function sessionCsv(db: D1Database): Promise<Response> {
  const rows = await all(db, `SELECT s.date, s.location, s.lanes, s.notes, g.game_number, g.score, g.strikes, g.spares, g.splits, b.name AS ball FROM sessions s LEFT JOIN games g ON g.session_id = s.id LEFT JOIN balls b ON b.id = g.ball_id ORDER BY s.date ASC, s.id ASC, g.game_number ASC`);
  const headers = ["date", "location", "lanes", "notes", "game_number", "score", "strikes", "spares", "splits", "ball"];
  const csv = [headers.join(","), ...rows.map((row) => headers.map((key) => csvEscape(row[key])).join(","))].join("\n");
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=bowlsense-sessions.csv" } });
}

function shareSvg(title: string, subtitle: string): Response {
  const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] as string));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#17112e"/><stop offset="1" stop-color="#090914"/></linearGradient></defs><rect width="1200" height="630" fill="url(#g)"/><circle cx="1040" cy="100" r="180" fill="#7c3aed" opacity=".25"/><text x="80" y="130" fill="#a78bfa" font-family="Arial,sans-serif" font-size="34" font-weight="700">BOWLSENSE</text><text x="80" y="300" fill="#fff" font-family="Arial,sans-serif" font-size="72" font-weight="800">${escape(title)}</text><text x="80" y="380" fill="#c4b5fd" font-family="Arial,sans-serif" font-size="34">${escape(subtitle)}</text><text x="80" y="550" fill="#8b8ba7" font-family="Arial,sans-serif" font-size="26">Track every frame. See every trend.</text></svg>`;
  return new Response(svg, { headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  const { DB: db } = env;
  const method = request.method.toUpperCase();
  const path = url.pathname;

  if (path === "/health") return json({ status: "ok", timestamp: new Date().toISOString() });
  if (path === "/api/stats" && method === "GET") return json(await statsSummary(db));
  if (path === "/api/stats/full" && method === "GET") return json(await fullStats(db));
  if (path === "/api/stats/trend" && method === "GET") return json(await trend(db));
  if (path === "/api/stats/weekly" && method === "GET") return json(await weeklyStats(db));
  if (path === "/api/stats/by-ball" && method === "GET") {
    return json(camelizeAll(await all(db, `
      SELECT b.id AS ball_id, b.name AS ball_name, b.brand, COUNT(g.id) AS game_count,
        COALESCE(ROUND(AVG(g.score)), 0) AS average, COALESCE(MAX(g.score), 0) AS high_game
      FROM balls b JOIN games g ON g.ball_id = b.id GROUP BY b.id ORDER BY game_count DESC
    `)));
  }
  if (path === "/api/games-recent" && method === "GET") {
    return json(camelizeAll(await all(db, `SELECT g.*, s.date, s.location FROM games g JOIN sessions s ON s.id = g.session_id ORDER BY s.date DESC, g.id DESC LIMIT 12`)));
  }
  if (path === "/api/dashboard/tonight" && method === "GET") return json(await tonightLeagues(db));
  if (path === "/api/analytics/pin-leaves" && method === "GET") return json(await pinLeaves(db));

  if (path === "/api/sessions" && method === "GET") return sessionList(db, url);
  if (path === "/api/sessions" && method === "POST") {
    const created = await insertRow(db, "sessions", await body(request));
    return json(camelize(created), 201);
  }
  if (path === "/api/sessions/export.csv" && method === "GET") return sessionCsv(db);
  const sessionMatch = path.match(/^\/api\/sessions\/(\d+)$/);
  if (sessionMatch) {
    const id = Number(sessionMatch[1]);
    if (method === "GET") {
      const session = camelize(await first(db, "SELECT * FROM sessions WHERE id = ?", id));
      if (!session) return error("Session not found", 404);
      session.games = camelizeAll(await all(db, "SELECT * FROM games WHERE session_id = ? ORDER BY game_number ASC, id ASC", id));
      return json(session);
    }
    if (method === "PUT") return json(camelize(await updateRow(db, "sessions", id, await body(request))));
    if (method === "DELETE") {
      await db.batch([db.prepare("DELETE FROM games WHERE session_id = ?").bind(id), db.prepare("DELETE FROM sessions WHERE id = ?").bind(id)]);
      return new Response(null, { status: 204 });
    }
  }
  const sessionPublicMatch = path.match(/^\/api\/sessions\/(\d+)\/(public|share-card)$/);
  if (sessionPublicMatch && method === "GET") {
    const id = Number(sessionPublicMatch[1]);
    const session = camelize(await first(db, "SELECT * FROM sessions WHERE id = ?", id));
    if (!session) return error("Session not found", 404);
    session.games = camelizeAll(await all(db, "SELECT g.*, b.name AS ball_name FROM games g LEFT JOIN balls b ON b.id = g.ball_id WHERE g.session_id = ? ORDER BY g.game_number", id));
    return json(sessionPublicMatch[2] === "share-card" ? { session, games: session.games } : session);
  }

  if (path === "/api/games" && method === "POST") return json(camelize(await insertRow(db, "games", await body(request))), 201);
  if (path === "/api/games" && method === "GET") return json(camelizeAll(await all(db, "SELECT * FROM games ORDER BY id DESC")));
  if (path === "/api/games/perfect" && method === "GET") {
    return json(camelizeAll(await all(db, `SELECT g.*, b.name AS ball_name, s.id AS session_id, s.date AS game_date, s.date, s.location, s.lanes FROM games g JOIN sessions s ON s.id = g.session_id LEFT JOIN balls b ON b.id = g.ball_id WHERE g.score = 300 ORDER BY s.date DESC, g.id DESC`)));
  }
  const perfectMatch = path.match(/^\/api\/games\/perfect\/(\d+)$/);
  if (perfectMatch && method === "GET") {
    const row = camelize(await first(db, `SELECT g.*, b.name AS ball_name, s.date, s.location, s.lanes FROM games g JOIN sessions s ON s.id = g.session_id LEFT JOIN balls b ON b.id = g.ball_id WHERE g.id = ? AND g.score = 300`, Number(perfectMatch[1])));
    return row ? json(row) : error("Perfect game not found", 404);
  }
  const gamePublicMatch = path.match(/^\/api\/games\/(\d+)\/public$/);
  if (gamePublicMatch && method === "GET") {
    const row = camelize(await first(db, `SELECT g.*, b.name AS ball_name, s.date, s.location, s.lanes FROM games g JOIN sessions s ON s.id = g.session_id LEFT JOIN balls b ON b.id = g.ball_id WHERE g.id = ?`, Number(gamePublicMatch[1])));
    return row ? json({ game: row, session: { id: row.sessionId, date: row.date, location: row.location, lanes: row.lanes }, ballName: row.ballName ?? null }) : error("Game not found", 404);
  }
  const gameMatch = path.match(/^\/api\/games\/(\d+)$/);
  if (gameMatch) {
    const id = Number(gameMatch[1]);
    if (method === "GET") return json(camelize(await first(db, "SELECT * FROM games WHERE id = ?", id)));
    if (method === "PUT") return json(camelize(await updateRow(db, "games", id, await body(request))));
    if (method === "DELETE") { await run(db, "DELETE FROM games WHERE id = ?", id); return new Response(null, { status: 204 }); }
  }

  if (path === "/api/balls" && method === "GET") return json(camelizeAll(await all(db, "SELECT * FROM balls ORDER BY created_at DESC, id DESC")));
  if (path === "/api/balls" && method === "POST") return json(camelize(await insertRow(db, "balls", await body(request))), 201);
  const ballMatch = path.match(/^\/api\/balls\/(\d+)$/);
  if (ballMatch) {
    const id = Number(ballMatch[1]);
    if (method === "GET") return json(camelize(await first(db, "SELECT * FROM balls WHERE id = ?", id)));
    if (method === "PUT") return json(camelize(await updateRow(db, "balls", id, await body(request))));
    if (method === "DELETE") { await run(db, "DELETE FROM balls WHERE id = ?", id); return new Response(null, { status: 204 }); }
  }
  if (path === "/balls/search" && method === "GET") {
    const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    if (query.length < 2) return json([]);
    const upstream = await fetch("https://www.bowwwl.com/restapi/balls?_format=json");
    if (!upstream.ok) return error("Ball catalog unavailable", 502);
    const catalog = await upstream.json<Row[]>();
    return json(catalog.filter((item) => `${item.ball_name ?? ""} ${item.brand_name ?? ""}`.toLowerCase().includes(query)).slice(0, 20));
  }
  if (path === "/api/balls/image-proxy" && method === "GET") {
    const imagePath = url.searchParams.get("path");
    if (!imagePath?.startsWith("/")) return error("Invalid image path");
    const upstream = await fetch(`https://www.bowwwl.com${imagePath}`);
    return new Response(upstream.body, { status: upstream.status, headers: { "content-type": upstream.headers.get("content-type") ?? "image/jpeg", "cache-control": "public, max-age=86400" } });
  }

  if (path === "/api/leagues" && method === "GET") return json(await leagueList(db));
  if (path === "/api/leagues" && method === "POST") return json(camelize(await insertRow(db, "leagues", await body(request))), 201);
  const leagueWeekCreateMatch = path.match(/^\/api\/leagues\/(\d+)\/weeks$/);
  if (leagueWeekCreateMatch && method === "POST") {
    return json(camelize(await insertRow(db, "league_weeks", { ...(await body(request)), leagueId: Number(leagueWeekCreateMatch[1]) })), 201);
  }
  const leagueWeekDetailMatch = path.match(/^\/api\/leagues\/(\d+)\/weeks\/(\d+)$/);
  if (leagueWeekDetailMatch && method === "GET") {
    const week = camelize(await first(db, "SELECT * FROM league_weeks WHERE id = ? AND league_id = ?", Number(leagueWeekDetailMatch[2]), Number(leagueWeekDetailMatch[1])));
    if (!week) return error("Week not found", 404);
    week.games = camelizeAll(await all(db, "SELECT * FROM league_games WHERE week_id = ? ORDER BY game_number", week.id));
    return json(week);
  }
  const leagueGameCreateMatch = path.match(/^\/api\/leagues\/weeks\/(\d+)\/games$/);
  if (leagueGameCreateMatch && method === "POST") return json(camelize(await insertRow(db, "league_games", { ...(await body(request)), weekId: Number(leagueGameCreateMatch[1]) })), 201);
  const leagueWeekMatch = path.match(/^\/api\/leagues\/weeks\/(\d+)$/);
  if (leagueWeekMatch) {
    const id = Number(leagueWeekMatch[1]);
    if (method === "GET") {
      const week = camelize(await first(db, "SELECT * FROM league_weeks WHERE id = ?", id));
      if (!week) return error("Week not found", 404);
      week.games = camelizeAll(await all(db, "SELECT * FROM league_games WHERE week_id = ? ORDER BY game_number", id));
      return json(week);
    }
    if (method === "PUT") return json(camelize(await updateRow(db, "league_weeks", id, await body(request))));
    if (method === "DELETE") { await db.batch([db.prepare("DELETE FROM league_games WHERE week_id = ?").bind(id), db.prepare("DELETE FROM league_weeks WHERE id = ?").bind(id)]); return new Response(null, { status: 204 }); }
  }
  const leagueGameMatch = path.match(/^\/api\/leagues\/games\/(\d+)$/);
  if (leagueGameMatch) {
    const id = Number(leagueGameMatch[1]);
    if (method === "PUT") return json(camelize(await updateRow(db, "league_games", id, await body(request))));
    if (method === "DELETE") { await run(db, "DELETE FROM league_games WHERE id = ?", id); return new Response(null, { status: 204 }); }
  }
  const leagueSpecialMatch = path.match(/^\/api\/leagues\/(\d+)\/(stats|standings|share|leaderboard|recap)$/);
  if (leagueSpecialMatch && method === "GET") {
    const detail = await leagueDetail(db, Number(leagueSpecialMatch[1]));
    if (!detail) return error("League not found", 404);
    const kind = leagueSpecialMatch[2];
    if (kind === "stats") return json(detail.stats);
    if (kind === "standings" || kind === "leaderboard") return json({ league: detail, weeks: detail.weeks, stats: detail.stats, standings: [] });
    const week = detail.weeks.at(-1) ?? null;
    const games = week?.games?.map((game: Row) => Number(game.score ?? 0)) ?? [];
    if (kind === "recap") return json({ league: { id: detail.id, name: detail.name, location: detail.location, season: detail.season }, week: week ? { weekNumber: week.weekNumber, date: week.date, opponent: week.opponent, won: week.gamesWon, lost: week.gamesLost, tied: week.gamesTied } : null, games, stats: { average: average(games), highGame: games.length ? Math.max(...games) : 0, totalGames: games.length, series: games.reduce((sum: number, score: number) => sum + score, 0) } });
    return json({ league: detail, weeks: detail.weeks, stats: detail.stats });
  }
  const leagueMatch = path.match(/^\/api\/leagues\/(\d+)$/);
  if (leagueMatch) {
    const id = Number(leagueMatch[1]);
    if (method === "GET") { const detail = await leagueDetail(db, id); return detail ? json(detail) : error("League not found", 404); }
    if (method === "PUT") return json(camelize(await updateRow(db, "leagues", id, await body(request))));
    if (method === "DELETE") {
      const weeks = await all(db, "SELECT id FROM league_weeks WHERE league_id = ?", id);
      const statements = weeks.map((week) => db.prepare("DELETE FROM league_games WHERE week_id = ?").bind(week.id));
      statements.push(db.prepare("DELETE FROM league_weeks WHERE league_id = ?").bind(id), db.prepare("DELETE FROM leagues WHERE id = ?").bind(id));
      await db.batch(statements); return new Response(null, { status: 204 });
    }
  }

  if (path === "/api/tournaments" && method === "GET") return json(await tournamentList(db));
  if (path === "/api/tournaments" && method === "POST") return json(camelize(await insertRow(db, "tournaments", await body(request))), 201);
  const tournamentGameCreateMatch = path.match(/^\/api\/tournaments\/(\d+)\/games$/);
  if (tournamentGameCreateMatch && method === "POST") return json(camelize(await insertRow(db, "tournament_games", { ...(await body(request)), tournamentId: Number(tournamentGameCreateMatch[1]) })), 201);
  const tournamentGameMatch = path.match(/^\/api\/tournaments\/games\/(\d+)$/);
  if (tournamentGameMatch) {
    const id = Number(tournamentGameMatch[1]);
    if (method === "PUT") return json(camelize(await updateRow(db, "tournament_games", id, await body(request))));
    if (method === "DELETE") { await run(db, "DELETE FROM tournament_games WHERE id = ?", id); return new Response(null, { status: 204 }); }
  }
  const tournamentSpecialMatch = path.match(/^\/api\/tournaments\/(\d+)\/(share|standings|bracket)$/);
  if (tournamentSpecialMatch && method === "GET") {
    const detail = await tournamentDetail(db, Number(tournamentSpecialMatch[1]));
    if (!detail) return error("Tournament not found", 404);
    if (tournamentSpecialMatch[2] === "bracket") return json({ tournament: detail, blocks: [], standings: [] });
    return json({ tournament: detail, games: detail.games, stats: detail.stats, standings: [] });
  }
  const tournamentMatch = path.match(/^\/api\/tournaments\/(\d+)$/);
  if (tournamentMatch) {
    const id = Number(tournamentMatch[1]);
    if (method === "GET") { const detail = await tournamentDetail(db, id); return detail ? json(detail) : error("Tournament not found", 404); }
    if (method === "PUT") return json(camelize(await updateRow(db, "tournaments", id, await body(request))));
    if (method === "DELETE") { await db.batch([db.prepare("DELETE FROM tournament_games WHERE tournament_id = ?").bind(id), db.prepare("DELETE FROM tournaments WHERE id = ?").bind(id)]); return new Response(null, { status: 204 }); }
  }

  if (path === "/api/arsenals" && method === "GET") return json(await arsenalList(db));
  if (path === "/api/arsenals" && method === "POST") return json(camelize(await insertRow(db, "arsenals", await body(request))), 201);
  const arsenalBallCreateMatch = path.match(/^\/api\/arsenals\/(\d+)\/balls$/);
  if (arsenalBallCreateMatch && method === "POST") return json(camelize(await insertRow(db, "arsenal_balls", { ...(await body(request)), arsenalId: Number(arsenalBallCreateMatch[1]) })), 201);
  const arsenalBallMatch = path.match(/^\/api\/arsenals\/balls\/(\d+)$/);
  if (arsenalBallMatch) {
    const id = Number(arsenalBallMatch[1]);
    if (method === "PUT") return json(camelize(await updateRow(db, "arsenal_balls", id, await body(request))));
    if (method === "DELETE") { await run(db, "DELETE FROM arsenal_balls WHERE id = ?", id); return new Response(null, { status: 204 }); }
  }
  const arsenalMatch = path.match(/^\/api\/arsenals\/(\d+)$/);
  if (arsenalMatch) {
    const id = Number(arsenalMatch[1]);
    if (method === "GET") { const detail = await arsenalDetail(db, id); return detail ? json(detail) : error("Arsenal not found", 404); }
    if (method === "PUT") return json(camelize(await updateRow(db, "arsenals", id, await body(request))));
    if (method === "DELETE") { await db.batch([db.prepare("DELETE FROM arsenal_balls WHERE arsenal_id = ?").bind(id), db.prepare("DELETE FROM arsenals WHERE id = ?").bind(id)]); return new Response(null, { status: 204 }); }
  }

  if (path === "/api/backup" && method === "GET") return json(await exportData(db), 200, { "content-disposition": "attachment; filename=bowlsense-backup.json" });
  if (path === "/api/restore" && method === "POST") return json({ ok: true, imported: await restoreData(db, await body(request)) });
  if (path === "/api/backups" && method === "GET") return json({ backups: [], latestMtime: null, backupCount: 0, cloudRemote: "Sites managed database" });
  if (path === "/api/backups" && method === "POST") return json({ ok: true, output: "Sites continuously manages the BowlSense database.", backups: [] });
  if (path === "/api/data-health" && method === "GET") return json(await dataHealth(db));

  if (path === "/api/import/csv" && method === "POST") {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return error("CSV file is required");
    const lines = (await file.text()).split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return error("CSV contains no rows");
    const headers = lines[0].split(",").map((item) => item.trim().toLowerCase());
    const imported = { sessions: 0, games: 0, balls: 0 };
    const sessionIds = new Map<string, number>();
    for (const line of lines.slice(1)) {
      const values = line.split(",").map((item) => item.trim().replace(/^"|"$/g, ""));
      const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
      if (!row.date || !row.score) continue;
      const key = `${row.date}|${row.location ?? ""}`;
      let sessionId = sessionIds.get(key);
      if (!sessionId) {
        const session = await insertRow(db, "sessions", { date: row.date, location: row.location || null });
        sessionId = Number(session?.id); sessionIds.set(key, sessionId); imported.sessions += 1;
      }
      await insertRow(db, "games", { sessionId, gameNumber: Number(row.game_number || 1), score: Number(row.score), strikes: Number(row.strikes || 0), spares: Number(row.spares || 0), splits: Number(row.splits || 0) });
      imported.games += 1;
    }
    return json({ ok: true, imported });
  }

  if (path.endsWith("/og-image") && method === "GET") {
    const gameId = path.match(/^\/api\/games\/(\d+)/)?.[1];
    if (gameId) {
      const game = await first(db, `SELECT g.score, s.location, s.date FROM games g JOIN sessions s ON s.id = g.session_id WHERE g.id = ?`, Number(gameId));
      return shareSvg(game ? `Game ${game.score ?? "—"}` : "BowlSense", game ? `${game.location ?? "Bowling"} · ${game.date ?? ""}` : "Bowling tracker");
    }
    return shareSvg("BowlSense", "Track every frame. See every trend.");
  }

  return error("Not found", 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/health" || url.pathname.startsWith("/api/") || url.pathname === "/balls/search") {
        await ensureSchema(env.DB);
        return await handleApi(request, env, url);
      }
      const asset = await env.ASSETS.fetch(request);
      if (asset.status !== 404) return asset;
      return env.ASSETS.fetch(new Request(new URL("/index.html", request.url), request));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unexpected error";
      return error(message, 500);
    }
  },
};
