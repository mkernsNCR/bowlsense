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
  BOWLSENSE_ALLOWED_EMAILS?: string;
  BOWLSENSE_PUBLIC_PROFILE_NAME?: string;
  BOWLSENSE_TIME_ZONE?: string;
}

type Row = Record<string, any>;

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const MAX_BODY_BYTES = 256 * 1024;
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_STRUCTURED_JSON_BYTES = 256 * 1024;
const MAX_D1_JSON_BIND_BYTES = 1024 * 1024;
const MAX_D1_STATEMENTS_PER_REQUEST = 50;
const DEFAULT_TIME_ZONE = "America/New_York";

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

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

function isPublicApiRequest(method: string, path: string): boolean {
  if (method !== "GET") return false;
  return path === "/health"
    || path === "/api/stats"
    || /^\/api\/games\/\d+\/(?:public|og-image|perfect-og-image)$/.test(path)
    || /^\/api\/games\/perfect\/\d+$/.test(path)
    || /^\/api\/sessions\/\d+\/(?:public|share-card|og-image)$/.test(path)
    || path === "/api/profile/og-image"
    || /^\/api\/leagues\/\d+\/(?:share|leaderboard|recap)(?:\/og-image)?$/.test(path)
    || /^\/api\/leagues\/\d+\/(?:stats|standings)$/.test(path)
    || /^\/api\/leagues\/\d+\/weeks\/\d+(?:\/og-image)?$/.test(path)
    || /^\/api\/tournaments\/\d+\/(?:share|og-image|standings(?:\/og-image)?)$/.test(path);
}

function isAuthorizedRequest(request: Request, env: Env): boolean {
  const email = (request.headers.get("oai-authenticated-user-email") || "").trim().toLowerCase();
  if (!email) return false;
  const allowed = (env.BOWLSENSE_ALLOWED_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return allowed.length > 0 && allowed.includes(email);
}

function publicProfileName(env: Env): string | null {
  const name = (env.BOWLSENSE_PUBLIC_PROFILE_NAME || "").trim();
  return name ? name.slice(0, 80) : null;
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
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) throw new HttpError(413, "Request body is too large");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new HttpError(413, "Request body is too large");
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Row;
  } catch {
    throw new HttpError(400, "Request body must be a valid JSON object");
  }
}

async function limitedJsonBody(request: Request): Promise<Row> {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_IMPORT_BYTES) throw new HttpError(413, "Import is too large");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) throw new HttpError(413, "Import is too large");
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Row;
  } catch {
    throw new HttpError(400, "Import must be a valid JSON object");
  }
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

const requiredColumns: Record<string, string[]> = {
  sessions: ["date"], games: ["session_id", "game_number"], balls: ["name"],
  leagues: ["name"], league_weeks: ["league_id", "week_number", "date"],
  league_games: ["week_id", "game_number"], tournaments: ["name"],
  tournament_games: ["tournament_id", "game_number"], arsenals: ["name"],
  arsenal_balls: ["arsenal_id", "ball_id"],
};

const integerRanges: Record<string, [number, number]> = {
  id: [1, Number.MAX_SAFE_INTEGER], session_id: [1, Number.MAX_SAFE_INTEGER], ball_id: [1, Number.MAX_SAFE_INTEGER],
  league_id: [1, Number.MAX_SAFE_INTEGER], week_id: [1, Number.MAX_SAFE_INTEGER], tournament_id: [1, Number.MAX_SAFE_INTEGER],
  arsenal_id: [1, Number.MAX_SAFE_INTEGER], game_number: [1, 99], week_number: [1, 999], score: [0, 300],
  strikes: [0, 12], spares: [0, 10], splits: [0, 12], games_per_week: [1, 12], games_won: [0, 99],
  games_lost: [0, 99], games_tied: [0, 99], placement: [1, 100000], max_size: [1, 24], slot_order: [0, 99],
  active: [0, 1], created_at: [0, Number.MAX_SAFE_INTEGER],
};

const foreignKeys: Record<string, Array<[string, string]>> = {
  games: [["session_id", "sessions"], ["ball_id", "balls"]],
  league_weeks: [["league_id", "leagues"]],
  league_games: [["week_id", "league_weeks"], ["ball_id", "balls"]],
  tournament_games: [["tournament_id", "tournaments"], ["ball_id", "balls"]],
  arsenal_balls: [["arsenal_id", "arsenals"], ["ball_id", "balls"]],
};

function normalizedInput(table: string, input: Row): Row {
  const allowed = new Set(tableColumns[table]);
  return Object.fromEntries(Object.entries(input).flatMap(([key, value]) => {
    const column = key.includes("_") ? key : camelToSnake(key);
    return allowed.has(column) ? [[column, value === "" ? null : value]] : [];
  }));
}

function validIsoDate(value: unknown): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function validateRecord(
  table: string,
  input: Row,
  partial = false,
  options: { allowLegacyTournamentDate?: boolean } = {},
): Row {
  const normalized = normalizedInput(table, input);
  if (!partial) {
    for (const column of requiredColumns[table] || []) {
      if (normalized[column] == null || normalized[column] === "") throw new HttpError(422, `${column} is required`);
    }
    if (table === "tournaments" && !options.allowLegacyTournamentDate && normalized.date == null) {
      throw new HttpError(422, "date is required");
    }
  }
  if (partial && Object.keys(normalized).length === 0) throw new HttpError(422, "No supported fields supplied");
  for (const [column, value] of Object.entries(normalized)) {
    if (value == null) {
      if ((requiredColumns[table] || []).includes(column)) throw new HttpError(422, `${column} is required`);
      continue;
    }
    if (column === "date" || column === "start_date" || column === "end_date") {
      if (!validIsoDate(value)) throw new HttpError(422, `${column} must be YYYY-MM-DD`);
    }
    if (column === "entry_fee" || column === "prize_fund") {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1_000_000) throw new HttpError(422, `${column} is invalid`);
    }
    const range = integerRanges[column];
    if (range && (!Number.isInteger(value) || value < range[0] || value > range[1])) throw new HttpError(422, `${column} is out of range`);
    if (!range && column !== "entry_fee" && column !== "prize_fund" && typeof value !== "string") throw new HttpError(422, `${column} must be text`);
    if ((column === "frame_data" || column === "pin_leaves") && typeof value === "string") {
      if (new TextEncoder().encode(value).byteLength > MAX_STRUCTURED_JSON_BYTES) {
        throw new HttpError(422, `${column} is too long`);
      }
      try { JSON.parse(value); } catch { throw new HttpError(422, `${column} must be valid JSON`); }
    } else if (typeof value === "string" && value.length > (column === "notes" || column === "description" ? 10_000 : 500)) {
      throw new HttpError(422, `${column} is too long`);
    }
  }
  return normalized;
}

async function validateForeignKeys(db: D1Database, table: string, input: Row): Promise<void> {
  for (const [column, parent] of foreignKeys[table] || []) {
    const value = input[column];
    if (value == null) continue;
    if (!await first(db, `SELECT id FROM ${parent} WHERE id = ?`, value)) throw new HttpError(422, `${column} does not reference an existing record`);
  }
}

function valuesFor(table: string, input: Row, includeCreatedAt = true): { columns: string[]; values: unknown[] } {
  const allowed = new Set(tableColumns[table]);
  const normalized = normalizedInput(table, input);
  if (includeCreatedAt && allowed.has("created_at") && normalized.created_at == null) {
    normalized.created_at = Date.now();
  }
  return { columns: Object.keys(normalized), values: Object.values(normalized) };
}

async function insertRow(db: D1Database, table: string, input: Row, explicitId?: number): Promise<Row | null> {
  const validated = validateRecord(table, input);
  await validateForeignKeys(db, table, validated);
  const prepared = valuesFor(table, validated);
  const columns = explicitId == null ? prepared.columns : ["id", ...prepared.columns];
  const values = explicitId == null ? prepared.values : [explicitId, ...prepared.values];
  if (!columns.length) throw new Error(`No values supplied for ${table}`);
  const placeholders = columns.map(() => "?").join(", ");
  const result = await run(db, `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`, ...values);
  const id = explicitId ?? result.meta?.last_row_id;
  return id == null ? null : first(db, `SELECT * FROM ${table} WHERE id = ?`, id);
}

async function updateRow(db: D1Database, table: string, id: number, input: Row): Promise<Row | null> {
  if (!await first(db, `SELECT id FROM ${table} WHERE id = ?`, id)) return null;
  const validated = validateRecord(table, input, true);
  await validateForeignKeys(db, table, validated);
  const prepared = valuesFor(table, validated, false);
  if (prepared.columns.length) {
    await run(db, `UPDATE ${table} SET ${prepared.columns.map((column) => `${column} = ?`).join(", ")} WHERE id = ?`, ...prepared.values, id);
  }
  return first(db, `SELECT * FROM ${table} WHERE id = ?`, id);
}

async function insertResponse(db: D1Database, table: string, input: Row): Promise<Response> {
  return json(camelize(await insertRow(db, table, input)), 201);
}

async function updateResponse(db: D1Database, table: string, id: number, input: Row, label: string): Promise<Response> {
  const row = await updateRow(db, table, id, input);
  return row ? json(camelize(row)) : error(`${label} not found`, 404);
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
    SELECT * FROM (
      SELECT g.id, g.score, g.game_number, s.date, s.location
      FROM games g JOIN sessions s ON s.id = g.session_id
      WHERE g.score IS NOT NULL ORDER BY s.date DESC, g.id DESC LIMIT 30
    ) recent
    ORDER BY date ASC, id ASC
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

function zonedCalendar(date: Date, timeZone: string): { iso: string; weekday: string; weekdayIndex: number; label: string } {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "long" });
  } catch {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone: DEFAULT_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", weekday: "long" });
  }
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const iso = `${parts.year}-${parts.month}-${parts.day}`;
  const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return { iso, weekday: parts.weekday, weekdayIndex: weekdays.indexOf(parts.weekday), label: formatter.format(date) };
}

function offsetIsoDate(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function weeklyStats(db: D1Database, timeZone: string): Promise<Row> {
  const rows = camelizeAll(await all(db, `SELECT g.score, g.strikes, g.spares, s.date FROM games g JOIN sessions s ON s.id = g.session_id`));
  const calendar = zonedCalendar(new Date(), timeZone);
  const monday = offsetIsoDate(calendar.iso, calendar.weekdayIndex === 0 ? -6 : 1 - calendar.weekdayIndex);
  const lastMonday = offsetIsoDate(monday, -7);
  const summarize = (filtered: Row[]) => {
    const scores = filtered.map((row) => Number(row.score ?? 0));
    const totalStrikes = filtered.reduce((sum, row) => sum + Number(row.strikes ?? 0), 0);
    const totalSpares = filtered.reduce((sum, row) => sum + Number(row.spares ?? 0), 0);
    return { games: scores.length, average: average(scores), highGame: scores.length ? Math.max(...scores) : 0, totalStrikes, totalSpares,
      strikeRate: scores.length ? Math.round(totalStrikes / (scores.length * 12) * 100) : 0,
      spareRate: scores.length ? Math.round(totalSpares / (scores.length * 12) * 100) : 0 };
  };
  const thisRows = rows.filter((row) => String(row.date) >= monday);
  const lastRows = rows.filter((row) => String(row.date) >= lastMonday && String(row.date) < monday);
  const thisWeek = summarize(thisRows); const lastWeek = summarize(lastRows);
  return { thisWeek, lastWeek, delta: { average: thisWeek.average - lastWeek.average, games: thisWeek.games - lastWeek.games, highGame: thisWeek.highGame - lastWeek.highGame }, dayOfWeek: calendar.label };
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
      weekByWeekAverages: weeks.map((week: Row) => {
        const weekScores = (week.games || []).map((game: Row) => game.score).filter((score: unknown) => score != null).map(Number);
        return { weekId: week.id, weekNumber: week.weekNumber, date: week.date, average: average(weekScores), games: weekScores.length };
      }),
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
      lastOpponent: detail?.weeks?.at(-1)?.opponent ?? null,
      lastWeekDate: detail?.weeks?.at(-1)?.date ?? null,
      stats: detail?.stats,
    };
  }));
}

async function tournamentDetail(db: D1Database, id: number): Promise<Row | null> {
  const tournament = camelize(await first(db, "SELECT * FROM tournaments WHERE id = ?", id));
  if (!tournament) return null;
  const games = camelizeAll(await all(db, `
    SELECT tg.*, b.name AS ball_name
    FROM tournament_games tg LEFT JOIN balls b ON b.id = tg.ball_id
    WHERE tg.tournament_id = ? ORDER BY tg.game_number ASC, tg.id ASC
  `, id));
  const scores = games.map((game) => game.score).filter((score) => score != null).map(Number);
  return {
    ...tournament,
    games,
    stats: {
      average: average(scores), high: scores.length ? Math.max(...scores) : 0,
      low: scores.length ? Math.min(...scores) : 0,
      highGame: scores.length ? Math.max(...scores) : 0,
      totalPins: scores.reduce((sum, score) => sum + score, 0),
      series: scores.reduce((sum, score) => sum + score, 0),
      totalGames: scores.length,
      placement: tournament.placement ?? null,
      net: tournament.prizeFund == null && tournament.entryFee == null
        ? null
        : Number(tournament.prizeFund ?? 0) - Number(tournament.entryFee ?? 0),
    },
  };
}

async function tournamentList(db: D1Database): Promise<Row[]> {
  const tournaments = camelizeAll(await all(db, "SELECT * FROM tournaments ORDER BY date DESC, id DESC"));
  return Promise.all(tournaments.map(async (tournament) => {
    const detail = await tournamentDetail(db, Number(tournament.id)) as Row;
    return { ...tournament, totalGames: detail.stats?.totalGames ?? 0, series: detail.stats?.series ?? 0, high: detail.stats?.high ?? 0 };
  }));
}

async function publicSessionPayload(db: D1Database, id: number): Promise<Row | null> {
  const session = camelize(await first(db, "SELECT id, date, location, lanes FROM sessions WHERE id = ?", id));
  if (!session) return null;
  const games = camelizeAll(await all(db, `
    SELECT id, game_number, score, strikes, spares, splits
    FROM games WHERE session_id = ? ORDER BY game_number ASC, id ASC
  `, id));
  const scores = games.map((game) => Number(game.score ?? 0));
  return {
    session,
    summary: {
      totalGames: games.length,
      series: scores.reduce((sum, score) => sum + score, 0),
      average: average(scores),
      highGame: scores.length ? Math.max(...scores) : 0,
      perfectGames: scores.filter((score) => score === 300).length,
    },
    games,
  };
}

async function publicGamePayload(db: D1Database, id: number, perfectOnly = false): Promise<Row | null> {
  const row = camelize(await first(db, `
    SELECT g.id, g.game_number, g.score, g.strikes, g.spares, g.splits, g.frame_data,
      b.name AS ball_name, s.date, s.location, s.lanes
    FROM games g JOIN sessions s ON s.id = g.session_id
    LEFT JOIN balls b ON b.id = g.ball_id
    WHERE g.id = ?${perfectOnly ? " AND g.score = 300" : ""}
  `, id));
  if (!row) return null;
  return {
    game: {
      id: row.id,
      gameNumber: row.gameNumber,
      score: row.score,
      strikes: row.strikes,
      spares: row.spares,
      splits: row.splits,
      frameData: row.frameData,
      ballName: row.ballName ?? null,
    },
    session: { date: row.date, location: row.location, lanes: row.lanes },
    player: null,
  };
}

function leagueSharePayload(detail: Row): Row {
  const weeks = (detail.weeks || []).map((week: Row) => {
    const games = (week.games || []).map((game: Row) => ({
      gameNumber: game.gameNumber,
      score: game.score,
      strikes: game.strikes,
      spares: game.spares,
      splits: game.splits,
      ballId: game.ballId,
    }));
    const scores = games.map((game: Row) => game.score).filter((score: unknown) => score != null).map(Number);
    return {
      weekNumber: week.weekNumber,
      date: week.date,
      opponent: week.opponent || "Unknown",
      games,
      series: scores.length ? scores.reduce((sum: number, score: number) => sum + score, 0) : null,
      gamesWon: Number(week.gamesWon ?? 0),
      gamesLost: Number(week.gamesLost ?? 0),
      gamesTied: Number(week.gamesTied ?? 0),
    };
  });
  return {
    league: {
      id: detail.id,
      name: detail.name,
      location: detail.location ?? null,
      season: detail.season ?? null,
      dayOfWeek: detail.dayOfWeek ?? null,
    },
    stats: {
      average: Number(detail.stats?.average ?? 0),
      totalWeeks: weeks.length,
      gamesWon: Number(detail.stats?.gamesWon ?? 0),
      gamesLost: Number(detail.stats?.gamesLost ?? 0),
      gamesTied: Number(detail.stats?.gamesTied ?? 0),
      highGame: Number(detail.stats?.high ?? 0),
    },
    weeks,
  };
}

function leagueLeaderboardPayload(detail: Row): Row {
  const opponents = new Map<string, number[]>();
  for (const week of detail.weeks || []) {
    const name = String(week.opponent || "Unknown");
    const scores = (week.games || []).map((game: Row) => game.score).filter((score: unknown) => score != null).map(Number);
    opponents.set(name, [...(opponents.get(name) || []), ...scores]);
  }
  const rankedOpponents = [...opponents.entries()]
    .map(([name, scores]) => ({ name, avg: average(scores), games: scores.length, totalPins: scores.reduce((sum, score) => sum + score, 0), highGame: scores.length ? Math.max(...scores) : 0 }))
    .sort((a, b) => b.avg - a.avg || b.totalPins - a.totalPins)
    .map((entry, index) => ({ rank: index + 1, ...entry }));
  return {
    leagueId: detail.id,
    leagueAverage: detail.stats?.average ?? null,
    record: { wins: Number(detail.stats?.gamesWon ?? 0), losses: Number(detail.stats?.gamesLost ?? 0), ties: Number(detail.stats?.gamesTied ?? 0) },
    totalWeeks: detail.weeks?.length ?? 0,
    rankedOpponents,
  };
}

function leagueStandingsPayload(detail: Row): Row {
  let pins = 0;
  let games = 0;
  let wins = 0;
  let losses = 0;
  let ties = 0;
  const weeks = (detail.weeks || []).map((week: Row) => {
    const scores = (week.games || []).map((game: Row) => game.score).filter((score: unknown) => score != null).map(Number);
    const weekPins = scores.reduce((sum: number, score: number) => sum + score, 0);
    const weekWins = Number(week.gamesWon ?? 0);
    const weekLosses = Number(week.gamesLost ?? 0);
    const weekTies = Number(week.gamesTied ?? 0);
    pins += weekPins;
    games += scores.length;
    wins += weekWins;
    losses += weekLosses;
    ties += weekTies;
    return {
      weekId: week.id,
      weekNumber: week.weekNumber,
      date: week.date,
      yourAvg: average(scores),
      opponentAvg: 0,
      result: weekWins > weekLosses ? "W" : weekLosses > weekWins ? "L" : "T",
      margin: weekWins - weekLosses,
      bestGame: scores.length ? Math.max(...scores) : 0,
      games: scores.length,
      weekPins,
      cumulative: { pins, games, average: games ? Math.round(pins / games) : 0, wins, losses, ties },
    };
  });
  return {
    leagueId: detail.id,
    seasonRecord: { wins, losses, ties, totalPins: pins, totalGames: games, average: games ? Math.round(pins / games) : 0 },
    totals: { wins, losses, ties },
    weeks,
  };
}

function tournamentSharePayload(detail: Row): Row {
  return {
    tournament: {
      id: detail.id,
      name: detail.name,
      location: detail.location ?? null,
      date: detail.date,
      endDate: detail.endDate ?? null,
      format: detail.format ?? null,
      entryFee: detail.entryFee ?? null,
      prizeFund: detail.prizeFund ?? null,
      placement: detail.placement ?? null,
    },
    games: (detail.games || []).map((game: Row) => ({
      id: game.id,
      gameNumber: game.gameNumber,
      score: game.score,
      strikes: game.strikes,
      spares: game.spares,
      splits: game.splits,
      ballId: game.ballId,
      ballName: game.ballName ?? null,
      squad: game.squad ?? null,
      frameData: game.frameData ?? null,
    })),
    stats: detail.stats,
  };
}

function tournamentStandingsPayload(detail: Row): Row {
  const byBall = new Map<string, { ballId: number | null; ballName: string; scores: number[] }>();
  for (const game of detail.games || []) {
    const ballId = game.ballId == null ? null : Number(game.ballId);
    const key = ballId == null ? "unknown" : String(ballId);
    const current = byBall.get(key) || { ballId, ballName: game.ballName || "Unknown ball", scores: [] };
    if (game.score != null) current.scores.push(Number(game.score));
    byBall.set(key, current);
  }
  const standings = [...byBall.values()]
    .map((entry) => ({ ballId: entry.ballId, ballName: entry.ballName, games: entry.scores.length, total: entry.scores.reduce((sum, score) => sum + score, 0), average: average(entry.scores), highGame: entry.scores.length ? Math.max(...entry.scores) : 0 }))
    .sort((a, b) => b.average - a.average || b.total - a.total)
    .map((entry, index) => ({ rank: index + 1, ...entry }));
  return { standings };
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

async function tonightLeagues(db: D1Database, timeZone: string): Promise<Row[]> {
  const calendar = zonedCalendar(new Date(), timeZone);
  const todayName = calendar.weekday;
  const todayIso = calendar.iso;
  const leagues = (await leagueList(db)).filter((league) => league.dayOfWeek === todayName && Number(league.active ?? 1) !== 0);
  return leagues.map((league) => ({
    ...league, todayName, todayIso, inSeason: (!league.startDate || todayIso >= league.startDate) && (!league.endDate || todayIso <= league.endDate),
    nextWeekNumber: Number(league.weekCount ?? 0) + 1,
    lastOpponent: league.lastOpponent ?? null,
    lastWeekDate: league.lastWeekDate ?? null,
  }));
}

async function pinLeaves(db: D1Database): Promise<Row> {
  const rows = camelizeAll(await all(db, `
    SELECT g.pin_leaves, g.frame_data, g.score, s.date
    FROM games g JOIN sessions s ON s.id = g.session_id
    WHERE g.pin_leaves IS NOT NULL AND g.pin_leaves != ''
  `));
  const counts = new Map<string, { count: number; conversions: number }>();
  const months = new Map<string, Map<string, { count: number; conversions: number }>>();
  const allPins = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  let total = 0;
  for (const row of rows) {
    let parsedLeaves: unknown;
    try { parsedLeaves = JSON.parse(row.pinLeaves); } catch { continue; }
    if (!Array.isArray(parsedLeaves)) continue;
    const selections = parsedLeaves.filter(Array.isArray) as unknown[][];
    const legacyLeaves = parsedLeaves.filter((value): value is { pins: unknown[]; converted?: unknown } => (
      Boolean(value) && typeof value === "object" && !Array.isArray(value) && Array.isArray((value as Row).pins)
    ));
    let frames: Row[] = [];
    try {
      const parsed = row.frameData ? JSON.parse(row.frameData) : {};
      frames = Array.isArray(parsed?.frames) ? parsed.frames : [];
    } catch { /* Invalid legacy frame data does not invalidate the game. */ }
    const record = (pins: unknown, converted: boolean, pinsAreStanding = false) => {
      if (!Array.isArray(pins) || pins.length >= 10) return;
      const selected = new Set(pins.map(Number).filter((pin) => allPins.includes(pin)));
      const standingPins = pinsAreStanding
        ? allPins.filter((pin) => selected.has(pin))
        : allPins.filter((pin) => !selected.has(pin));
      if (!standingPins.length) return;
      const standing = standingPins.join(",");
      const current = counts.get(standing) ?? { count: 0, conversions: 0 };
      current.count += 1;
      if (converted) current.conversions += 1;
      counts.set(standing, current);
      const month = String(row.date || "unknown").slice(0, 7);
      const monthCounts = months.get(month) ?? new Map<string, { count: number; conversions: number }>();
      const monthEntry = monthCounts.get(standing) ?? { count: 0, conversions: 0 };
      monthEntry.count += 1;
      if (converted) monthEntry.conversions += 1;
      monthCounts.set(standing, monthEntry);
      months.set(month, monthCounts);
      total += 1;
    };

    if (legacyLeaves.length) {
      for (const leave of legacyLeaves) record(leave.pins, Boolean(leave.converted), true);
      continue;
    }

    let rollIndex = 0;
    for (let frameIndex = 0; frameIndex < 9 && rollIndex < selections.length; frameIndex += 1) {
      const firstThrow = selections[rollIndex] ?? [];
      const isStrike = new Set(firstThrow.map(Number)).size === 10;
      if (!isStrike) {
        const frame = frames[frameIndex];
        record(firstThrow, Boolean(frame?.isSpare));
        rollIndex += 2;
      } else {
        rollIndex += 1;
      }
    }
    const tenth = frames[9] ?? {};
    const tenthSelections = selections.slice(rollIndex, rollIndex + 3);
    const firstCount = new Set((tenthSelections[0] || []).map(Number)).size;
    const secondCount = new Set((tenthSelections[1] || []).map(Number)).size;
    const thirdCount = new Set((tenthSelections[2] || []).map(Number)).size;
    if (tenthSelections[0] && firstCount < 10) record(tenthSelections[0], Boolean(tenth.isSpare));
    if (firstCount === 10 && tenthSelections[1] && secondCount < 10) {
      record(tenthSelections[1], secondCount + thirdCount === 10);
    }
    if ((firstCount === 10 && secondCount === 10 || Boolean(tenth.isSpare)) && tenthSelections[2] && thirdCount < 10) {
      record(tenthSelections[2], false);
    }
  }
  return {
    totalFirstThrows: total,
    totalGames: rows.length,
    leaves: [...counts].sort((a, b) => b[1].count - a[1].count).map(([pins, entry]) => ({ pins, count: entry.count, pct: total ? Math.round(entry.count / total * 1000) / 10 : 0, conversions: entry.conversions, conversionRate: entry.count ? Math.round(entry.conversions / entry.count * 1000) / 10 : 0 })),
    neverLeft: [],
    byMonth: [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, entries]) => ({ month, leaves: [...entries].map(([pins, entry]) => ({ pins, count: entry.count })).sort((a, b) => b.count - a.count) })),
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

function chunkJsonRows(rows: Row[]): string[] {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let entries: string[] = [];
  let bytes = 2;
  for (const row of rows) {
    const serialized = JSON.stringify(row);
    const serializedBytes = encoder.encode(serialized).byteLength;
    const entryBytes = serializedBytes + (entries.length ? 1 : 0);
    if (entries.length && bytes + entryBytes > MAX_D1_JSON_BIND_BYTES) {
      chunks.push(`[${entries.join(",")}]`);
      entries = [];
      bytes = 2;
    }
    if (serializedBytes + 2 > MAX_D1_JSON_BIND_BYTES) {
      throw new HttpError(413, "An import record is too large");
    }
    entries.push(serialized);
    bytes += serializedBytes + (entries.length > 1 ? 1 : 0);
  }
  if (entries.length) chunks.push(`[${entries.join(",")}]`);
  return chunks;
}

function multiRowInsertStatements(
  db: D1Database,
  table: string,
  inputs: Row[],
  includeExplicitId = false,
): D1PreparedStatement[] {
  if (!inputs.length) return [];
  const columns = includeExplicitId ? ["id", ...tableColumns[table]] : tableColumns[table];
  const rows = inputs.map((input) => {
    const prepared = valuesFor(table, input);
    const row = Object.fromEntries(prepared.columns.map((column, index) => [column, prepared.values[index]]));
    if (includeExplicitId) row.id = input.id;
    return row;
  });
  const expressions = columns.map((column) => `json_extract(value, '$.${column}')`);
  const sql = `INSERT INTO ${table} (${columns.join(", ")}) SELECT ${expressions.join(", ")} FROM json_each(?)`;
  return chunkJsonRows(rows).map((chunk) => db.prepare(sql).bind(chunk));
}

function enforceD1StatementBudget(statements: D1PreparedStatement[], directQueries = 0): void {
  if (schemaStatements.length + directQueries + statements.length > MAX_D1_STATEMENTS_PER_REQUEST) {
    throw new HttpError(413, "Import is too complex to process safely");
  }
}

function validateRestorePayload(data: Row): Map<string, Row[]> {
  const validated = new Map<string, Row[]>();
  let totalRows = 0;
  for (const [key, table] of exportTables) {
    if (!Array.isArray(data[key])) throw new HttpError(422, `${key} must be an array`);
    const ids = new Set<number>();
    const rows = (data[key] as unknown[]).map((value, index) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(422, `${key}[${index}] must be an object`);
      const row = value as Row;
      if (!Number.isInteger(row.id) || row.id < 1 || ids.has(row.id)) throw new HttpError(422, `${key}[${index}].id is invalid or duplicated`);
      ids.add(row.id);
      return { id: row.id, ...validateRecord(table, row, false, { allowLegacyTournamentDate: true }) };
    });
    totalRows += rows.length;
    if (totalRows > 50_000) throw new HttpError(413, "Import contains too many records");
    validated.set(table, rows);
  }
  const requireParent = (table: string, column: string, parent: string) => {
    const parentIds = new Set((validated.get(parent) || []).map((row) => Number(row.id)));
    for (const row of validated.get(table) || []) {
      if (row[column] != null && !parentIds.has(Number(row[column]))) throw new HttpError(422, `${table}.${column} references a missing ${parent} record`);
    }
  };
  for (const [table, relationships] of Object.entries(foreignKeys)) {
    for (const [column, parent] of relationships) requireParent(table, column, parent);
  }
  return validated;
}

async function restoreData(db: D1Database, data: Row): Promise<Row> {
  const validated = validateRestorePayload(data);
  const statements = [...exportTables].reverse().map(([, table]) => db.prepare(`DELETE FROM ${table}`));
  const imported: Row = {};
  for (const [key, table] of exportTables) {
    const rows = validated.get(table) || [];
    statements.push(...multiRowInsertStatements(db, table, rows, true));
    imported[key] = rows.length;
  }
  enforceD1StatementBudget(statements);
  await db.batch(statements);
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
    backupHealth: { count: 0, latest: null, latestAgeHours: null, hasRecentBackup: false, status: "unavailable" },
    warnings: ["Sites does not expose verifiable backup timestamps to this application. Export data manually before destructive changes."],
  };
}

function csvEscape(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field.length === 0) quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field); field = "";
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
    } else field += char;
  }
  if (quoted) throw new HttpError(422, "CSV contains an unterminated quoted field");
  row.push(field);
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

function csvInteger(row: Row, field: string, fallback: number, minimum: number, maximum: number): number {
  const raw = row[field];
  if (raw == null || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new HttpError(422, `${field} is out of range`);
  return value;
}

async function sessionCsv(db: D1Database): Promise<Response> {
  const rows = await all(db, `SELECT s.date, s.location, s.lanes, s.notes, g.game_number, g.score, g.strikes, g.spares, g.splits, b.name AS ball FROM sessions s LEFT JOIN games g ON g.session_id = s.id LEFT JOIN balls b ON b.id = g.ball_id ORDER BY s.date ASC, s.id ASC, g.game_number ASC`);
  const headers = ["date", "location", "lanes", "notes", "game_number", "score", "strikes", "spares", "splits", "ball"];
  const csv = [headers.join(","), ...rows.map((row) => headers.map((key) => csvEscape(row[key])).join(","))].join("\n");
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=bowlsense-sessions.csv" } });
}

const BITMAP_FONT: Record<string, number[]> = {
  " ": [0,0,0,0,0,0,0], "-": [0,0,0,31,0,0,0], ".": [0,0,0,0,0,12,12], ":": [0,12,12,0,12,12,0], "/": [1,2,4,8,16,0,0],
  A:[14,17,17,31,17,17,17], B:[30,17,17,30,17,17,30], C:[14,17,16,16,16,17,14], D:[30,17,17,17,17,17,30], E:[31,16,16,30,16,16,31],
  F:[31,16,16,30,16,16,16], G:[14,17,16,23,17,17,15], H:[17,17,17,31,17,17,17], I:[31,4,4,4,4,4,31], J:[7,2,2,2,18,18,12],
  K:[17,18,20,24,20,18,17], L:[16,16,16,16,16,16,31], M:[17,27,21,21,17,17,17], N:[17,25,21,19,17,17,17], O:[14,17,17,17,17,17,14],
  P:[30,17,17,30,16,16,16], Q:[14,17,17,17,21,18,13], R:[30,17,17,30,20,18,17], S:[15,16,16,14,1,1,30], T:[31,4,4,4,4,4,4],
  U:[17,17,17,17,17,17,14], V:[17,17,17,17,17,10,4], W:[17,17,17,21,21,21,10], X:[17,17,10,4,10,17,17], Y:[17,17,10,4,4,4,4], Z:[31,1,2,4,8,16,31],
  "0":[14,17,19,21,25,17,14], "1":[4,12,4,4,4,4,14], "2":[14,17,1,2,4,8,31], "3":[30,1,1,14,1,1,30], "4":[2,6,10,18,31,2,2],
  "5":[31,16,16,30,1,1,30], "6":[14,16,16,30,17,17,14], "7":[31,1,2,4,8,8,8], "8":[14,17,17,14,17,17,14], "9":[14,17,17,15,1,1,14],
};

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(arrays.reduce((sum, item) => sum + item.length, 0));
  let offset = 0;
  for (const item of arrays) { result.set(item, offset); offset += item.length; }
  return result;
}

function uint32(value: number): Uint8Array {
  return new Uint8Array([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  return concatBytes(uint32(data.length), typeBytes, data, uint32(crc32(concatBytes(typeBytes, data))));
}

function cardText(value: unknown): string {
  return String(value ?? "").normalize("NFKD").replace(/[^A-Za-z0-9 .:\/-]/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
}

async function sharePng(title: string, subtitle: string): Promise<Response> {
  const width = 1200;
  const height = 630;
  const pixels = new Uint8Array((width + 1) * height);
  const setPixel = (x: number, y: number, color: number) => {
    if (x >= 0 && x < width && y >= 0 && y < height) pixels[y * (width + 1) + 1 + x] = color;
  };
  for (let y = 0; y < height; y += 1) {
    pixels[y * (width + 1)] = 0;
    for (let x = 0; x < width; x += 1) {
      if ((x + y * 2) % 160 < 5) setPixel(x, y, 1);
    }
  }
  for (let y = 0; y < 260; y += 1) for (let x = 900; x < width; x += 1) {
    const dx = x - 1050; const dy = y - 90;
    if (dx * dx + dy * dy < 170 * 170) setPixel(x, y, 2);
  }
  const drawText = (text: string, x: number, y: number, requestedScale: number, color: number, maxWidth = 1040) => {
    const normalized = cardText(text) || "BOWLSENSE";
    const scale = Math.max(2, Math.min(requestedScale, Math.floor(maxWidth / Math.max(1, normalized.length * 6))));
    normalized.split("").forEach((char, charIndex) => {
      const glyph = BITMAP_FONT[char] || BITMAP_FONT[" "];
      glyph.forEach((bits, row) => {
        for (let column = 0; column < 5; column += 1) {
          if (!(bits & (1 << (4 - column)))) continue;
          for (let py = 0; py < scale; py += 1) for (let px = 0; px < scale; px += 1) {
            setPixel(x + charIndex * 6 * scale + column * scale + px, y + row * scale + py, color);
          }
        }
      });
    });
  };
  drawText("BOWLSENSE", 80, 80, 6, 3);
  drawText(title, 80, 220, 13, 4);
  drawText(subtitle, 80, 355, 6, 3);
  drawText("TRACK EVERY FRAME. SEE EVERY TREND.", 80, 530, 4, 3);

  const compressed = new Uint8Array(await new Response(
    new Blob([pixels]).stream().pipeThrough(new CompressionStream("deflate")),
  ).arrayBuffer());
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width); view.setUint32(4, height);
  ihdr.set([8, 3, 0, 0, 0], 8);
  const palette = new Uint8Array([
    9,9,20, 23,17,46, 56,35,110, 196,181,253, 255,255,255,
  ]);
  const png = concatBytes(
    new Uint8Array([137,80,78,71,13,10,26,10]),
    pngChunk("IHDR", ihdr), pngChunk("PLTE", palette), pngChunk("IDAT", compressed), pngChunk("IEND", new Uint8Array()),
  );
  return new Response(new Uint8Array(png).buffer, { headers: { "content-type": "image/png", "cache-control": "public, max-age=3600" } });
}

interface ShareMetadata { title: string; description: string; image: string }

function normalizeSharePath(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

function isPublicSharePage(rawPath: string): boolean {
  const path = normalizeSharePath(rawPath);
  return path === "/bowl"
    || /^\/(?:score|perfect-games)\/\d+$/.test(path)
    || /^\/sessions\/\d+\/share$/.test(path)
    || /^\/leagues\/\d+\/(?:public|leaderboard|share|recap\/share|week\/\d+\/share)$/.test(path)
    || /^\/tournaments\/\d+\/(?:share|standings|standings\/share)$/.test(path);
}

async function shareMetadata(env: Env, rawPath: string, origin: string): Promise<ShareMetadata | null> {
  const db = env.DB;
  const path = normalizeSharePath(rawPath);
  const absolute = (pathname: string) => new URL(pathname, origin).toString();
  const gameId = path.match(/^\/(?:score|perfect-games)\/(\d+)$/)?.[1];
  if (gameId) {
    const payload = await publicGamePayload(db, Number(gameId), path.startsWith("/perfect-games/"));
    if (!payload) return null;
    return {
      title: `${payload.game.score ?? "Bowling"} game | BowlSense`,
      description: `${payload.session.location || "Bowling"} on ${payload.session.date || "BowlSense"}`,
      image: absolute(`/api/games/${gameId}/og-image`),
    };
  }
  const sessionId = path.match(/^\/sessions\/(\d+)\/share$/)?.[1];
  if (sessionId) {
    const payload = await publicSessionPayload(db, Number(sessionId));
    if (!payload) return null;
    return {
      title: `${payload.summary.series} series | BowlSense`,
      description: `${payload.summary.totalGames} games at ${payload.session.location || "Bowling"}, averaging ${payload.summary.average}.`,
      image: absolute(`/api/sessions/${sessionId}/og-image`),
    };
  }
  const leagueMatch = path.match(/^\/leagues\/(\d+)\/(public|leaderboard|share|recap\/share|week\/(\d+)\/share)$/);
  if (leagueMatch) {
    const detail = await leagueDetail(db, Number(leagueMatch[1]));
    if (!detail) return null;
    const kind = leagueMatch[2];
    const weekId = leagueMatch[3];
    if (weekId && !(detail.weeks || []).some((week: Row) => Number(week.id) === Number(weekId))) return null;
    if (kind === "recap/share" && !(detail.weeks || []).length) return null;
    const suffix = kind === "leaderboard" ? " leaderboard" : kind === "recap/share" ? " recap" : weekId ? " week recap" : "";
    const imagePath = kind === "leaderboard" ? `/api/leagues/${detail.id}/leaderboard/og-image`
      : kind === "recap/share" ? `/api/leagues/${detail.id}/recap/og-image`
      : weekId ? `/api/leagues/${detail.id}/weeks/${weekId}/og-image` : `/api/leagues/${detail.id}/share/og-image`;
    return {
      title: `${detail.name}${suffix} | BowlSense`,
      description: `${detail.location || "League bowling"} - ${detail.stats?.totalGames ?? 0} games at a ${detail.stats?.average ?? 0} average.`,
      image: absolute(imagePath),
    };
  }
  const tournamentMatch = path.match(/^\/tournaments\/(\d+)\/(share|standings|standings\/share)$/);
  if (tournamentMatch) {
    const detail = await tournamentDetail(db, Number(tournamentMatch[1]));
    if (!detail) return null;
    const standings = tournamentMatch[2].startsWith("standings");
    return {
      title: `${detail.name}${standings ? " standings" : ""} | BowlSense`,
      description: `${detail.location || "Tournament bowling"} - ${detail.stats?.series ?? 0} series across ${detail.stats?.totalGames ?? 0} games.`,
      image: absolute(`/api/tournaments/${detail.id}/${standings ? "standings/" : ""}og-image`),
    };
  }
  if (path === "/bowl") {
    const profileName = publicProfileName(env);
    return {
      title: profileName ? `${profileName}'s BowlSense` : "BowlSense public profile",
      description: "Bowling scores, form, and milestones tracked with BowlSense.",
      image: absolute("/api/profile/og-image"),
    };
  }
  return null;
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function injectShareMetadata(html: string, metadata: ShareMetadata, canonical: string): string {
  const values = {
    title: escapeHtmlAttribute(metadata.title), description: escapeHtmlAttribute(metadata.description),
    image: escapeHtmlAttribute(metadata.image), canonical: escapeHtmlAttribute(canonical),
  };
  let updated = html.replace(/<title>[^<]*<\/title>/i, `<title>${values.title}</title>`);
  const replaceMeta = (attribute: "name" | "property", key: string, value: string) => {
    const pattern = new RegExp(`<meta\\s+${attribute}=["']${key}["']\\s+content=["'][^"']*["']\\s*\\/?\\s*>`, "i");
    const tag = `<meta ${attribute}="${key}" content="${value}" />`;
    updated = pattern.test(updated) ? updated.replace(pattern, tag) : updated.replace("</head>", `  ${tag}\n  </head>`);
  };
  replaceMeta("name", "description", values.description);
  replaceMeta("property", "og:title", values.title);
  replaceMeta("property", "og:description", values.description);
  replaceMeta("property", "og:image", values.image);
  replaceMeta("property", "og:url", values.canonical);
  replaceMeta("name", "twitter:title", values.title);
  replaceMeta("name", "twitter:description", values.description);
  replaceMeta("name", "twitter:image", values.image);
  return updated.replace("</head>", `  <link rel="canonical" href="${values.canonical}" />\n  </head>`);
}

function injectNoIndex(html: string): string {
  const tag = '<meta name="robots" content="noindex, nofollow" />';
  const pattern = /<meta\s+name=["']robots["']\s+content=["'][^"']*["']\s*\/?\s*>/i;
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace("</head>", `  ${tag}\n  </head>`);
}

function dynamicHtmlHeaders(source: Headers): Headers {
  const headers = new Headers(source);
  for (const name of ["etag", "last-modified", "content-length", "content-encoding", "accept-ranges"]) {
    headers.delete(name);
  }
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "public, max-age=60");
  return headers;
}

async function spaResponse(request: Request, env: Env, url: URL, requireShareMetadata = false): Promise<Response> {
  const assetHeaders = new Headers(request.headers);
  for (const name of ["if-match", "if-none-match", "if-modified-since", "if-unmodified-since", "if-range", "range"]) {
    assetHeaders.delete(name);
  }
  const indexResponse = await env.ASSETS.fetch(new Request(new URL("/index.html", request.url), {
    method: "GET",
    headers: assetHeaders,
  }));
  if (!indexResponse.ok) {
    return new Response("<!doctype html><html><head><meta name=\"robots\" content=\"noindex, nofollow\" /></head><body>Not found</body></html>", {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }
  const html = await indexResponse.text();
  const metadata = await shareMetadata(env, url.pathname, url.origin);
  const headers = dynamicHtmlHeaders(indexResponse.headers);
  if (!metadata) {
    if (!requireShareMetadata) return new Response(html, { status: 200, headers });
    headers.set("cache-control", "no-store");
    return new Response(injectNoIndex(html), { status: 404, headers });
  }
  const canonical = new URL(normalizeSharePath(url.pathname), url.origin).toString();
  return new Response(injectShareMetadata(html, metadata, canonical), { status: 200, headers });
}

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  const { DB: db } = env;
  const method = request.method.toUpperCase();
  const path = url.pathname;

  if (path === "/health") return json({ status: "ok", timestamp: new Date().toISOString() });
  if (path === "/api/stats" && method === "GET") {
    return json({
      ...await statsSummary(db),
      profileName: publicProfileName(env),
      generatedAt: new Date().toISOString(),
    });
  }
  if (path === "/api/stats/full" && method === "GET") return json(await fullStats(db));
  if (path === "/api/stats/trend" && method === "GET") return json(await trend(db));
  if (path === "/api/stats/weekly" && method === "GET") return json(await weeklyStats(db, env.BOWLSENSE_TIME_ZONE || DEFAULT_TIME_ZONE));
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
  if (path === "/api/dashboard/tonight" && method === "GET") return json(await tonightLeagues(db, env.BOWLSENSE_TIME_ZONE || DEFAULT_TIME_ZONE));
  if (path === "/api/analytics/pin-leaves" && method === "GET") return json(await pinLeaves(db));

  if (path === "/api/sessions" && method === "GET") return sessionList(db, url);
  if (path === "/api/sessions" && method === "POST") return insertResponse(db, "sessions", await body(request));
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
    if (method === "PUT") return updateResponse(db, "sessions", id, await body(request), "Session");
    if (method === "DELETE") {
      await db.batch([db.prepare("DELETE FROM games WHERE session_id = ?").bind(id), db.prepare("DELETE FROM sessions WHERE id = ?").bind(id)]);
      return new Response(null, { status: 204 });
    }
  }
  const sessionPublicMatch = path.match(/^\/api\/sessions\/(\d+)\/public$/);
  if (sessionPublicMatch && method === "GET") {
    const payload = await publicSessionPayload(db, Number(sessionPublicMatch[1]));
    return payload ? json(payload) : error("Session not found", 404);
  }

  if (path === "/api/games" && method === "POST") return insertResponse(db, "games", await body(request));
  if (path === "/api/games" && method === "GET") return json(camelizeAll(await all(db, "SELECT * FROM games ORDER BY id DESC")));
  if (path === "/api/games/perfect" && method === "GET") {
    return json(camelizeAll(await all(db, `SELECT g.*, b.name AS ball_name, s.id AS session_id, s.date AS game_date, s.date, s.location, s.lanes FROM games g JOIN sessions s ON s.id = g.session_id LEFT JOIN balls b ON b.id = g.ball_id WHERE g.score = 300 ORDER BY s.date DESC, g.id DESC`)));
  }
  const perfectMatch = path.match(/^\/api\/games\/perfect\/(\d+)$/);
  if (perfectMatch && method === "GET") {
    const payload = await publicGamePayload(db, Number(perfectMatch[1]), true);
    return payload ? json(payload) : error("Perfect game not found", 404);
  }
  const gamePublicMatch = path.match(/^\/api\/games\/(\d+)\/public$/);
  if (gamePublicMatch && method === "GET") {
    const payload = await publicGamePayload(db, Number(gamePublicMatch[1]));
    return payload ? json(payload) : error("Game not found", 404);
  }
  const gameMatch = path.match(/^\/api\/games\/(\d+)$/);
  if (gameMatch) {
    const id = Number(gameMatch[1]);
    if (method === "GET") { const game = camelize(await first(db, "SELECT * FROM games WHERE id = ?", id)); return game ? json(game) : error("Game not found", 404); }
    if (method === "PUT") return updateResponse(db, "games", id, await body(request), "Game");
    if (method === "DELETE") { await run(db, "DELETE FROM games WHERE id = ?", id); return new Response(null, { status: 204 }); }
  }

  if (path === "/api/balls" && method === "GET") return json(camelizeAll(await all(db, "SELECT * FROM balls ORDER BY created_at DESC, id DESC")));
  if (path === "/api/balls" && method === "POST") return insertResponse(db, "balls", await body(request));
  const ballMatch = path.match(/^\/api\/balls\/(\d+)$/);
  if (ballMatch) {
    const id = Number(ballMatch[1]);
    if (method === "GET") { const ball = camelize(await first(db, "SELECT * FROM balls WHERE id = ?", id)); return ball ? json(ball) : error("Ball not found", 404); }
    if (method === "PUT") return updateResponse(db, "balls", id, await body(request), "Ball");
    if (method === "DELETE") { await run(db, "DELETE FROM balls WHERE id = ?", id); return new Response(null, { status: 204 }); }
  }
  if (path === "/balls/search" && method === "GET") {
    const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    if (query.length < 2) return json([]);
    const upstream = await fetch("https://www.bowwwl.com/restapi/balls?_format=json");
    if (!upstream.ok) return error("Ball catalog unavailable", 502);
    const catalog = (await upstream.json()) as Row[];
    return json(catalog.filter((item) => `${item.ball_name ?? ""} ${item.brand_name ?? ""}`.toLowerCase().includes(query)).slice(0, 20));
  }
  if (path === "/api/balls/image-proxy" && method === "GET") {
    const imagePath = url.searchParams.get("path");
    if (!imagePath?.startsWith("/sites/default/files/")) return error("Only bowwwl.com media paths are allowed");
    const upstreamUrl = new URL(imagePath, "https://www.bowwwl.com");
    if (upstreamUrl.origin !== "https://www.bowwwl.com") return error("Invalid media path");
    const upstream = await fetch(upstreamUrl);
    if (!upstream.ok) return error(`Upstream ${upstream.status}`, 502);
    const contentType = (upstream.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
    if (!allowedTypes.has(contentType)) return error("Upstream response is not a supported image", 415);
    const maxBytes = 5 * 1024 * 1024;
    const declaredBytes = Number(upstream.headers.get("content-length") || 0);
    if (declaredBytes > maxBytes) return error("Image is too large", 413);
    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength > maxBytes) return error("Image is too large", 413);
    return new Response(bytes, { headers: { "content-type": contentType, "cache-control": "public, max-age=86400" } });
  }

  if (path === "/api/leagues" && method === "GET") return json(await leagueList(db));
  if (path === "/api/leagues" && method === "POST") return insertResponse(db, "leagues", await body(request));
  const leagueWeekCreateMatch = path.match(/^\/api\/leagues\/(\d+)\/weeks$/);
  if (leagueWeekCreateMatch && method === "POST") {
    return insertResponse(db, "league_weeks", { ...(await body(request)), leagueId: Number(leagueWeekCreateMatch[1]) });
  }
  const leagueWeekDetailMatch = path.match(/^\/api\/leagues\/(\d+)\/weeks\/(\d+)$/);
  if (leagueWeekDetailMatch && method === "GET") {
    const leagueId = Number(leagueWeekDetailMatch[1]);
    const weekId = Number(leagueWeekDetailMatch[2]);
    const league = camelize(await first(db, "SELECT id, name, location, season FROM leagues WHERE id = ?", leagueId));
    if (!league) return error("League not found", 404);
    const week = camelize(await first(db, "SELECT * FROM league_weeks WHERE id = ? AND league_id = ?", weekId, leagueId));
    if (!week) return error("Week not found", 404);
    const gameRows = camelizeAll(await all(db, "SELECT * FROM league_games WHERE week_id = ? ORDER BY game_number", week.id));
    const scores = gameRows.map((game) => game.score).filter((score) => score != null).map(Number);
    return json({
      league,
      week: { id: week.id, weekNumber: week.weekNumber, date: week.date, opponent: week.opponent || "League Play", gamesWon: Number(week.gamesWon ?? 0), gamesLost: Number(week.gamesLost ?? 0), gamesTied: Number(week.gamesTied ?? 0) },
      games: scores,
      stats: { average: average(scores), highGame: scores.length ? Math.max(...scores) : 0, totalGames: scores.length, series: scores.reduce((sum, score) => sum + score, 0) },
    });
  }
  const leagueGameCreateMatch = path.match(/^\/api\/leagues\/weeks\/(\d+)\/games$/);
  if (leagueGameCreateMatch && method === "POST") return insertResponse(db, "league_games", { ...(await body(request)), weekId: Number(leagueGameCreateMatch[1]) });
  const leagueWeekMatch = path.match(/^\/api\/leagues\/weeks\/(\d+)$/);
  if (leagueWeekMatch) {
    const id = Number(leagueWeekMatch[1]);
    if (method === "GET") {
      const week = camelize(await first(db, "SELECT * FROM league_weeks WHERE id = ?", id));
      if (!week) return error("Week not found", 404);
      week.games = camelizeAll(await all(db, "SELECT * FROM league_games WHERE week_id = ? ORDER BY game_number", id));
      return json(week);
    }
    if (method === "PUT") return updateResponse(db, "league_weeks", id, await body(request), "Week");
    if (method === "DELETE") { await db.batch([db.prepare("DELETE FROM league_games WHERE week_id = ?").bind(id), db.prepare("DELETE FROM league_weeks WHERE id = ?").bind(id)]); return new Response(null, { status: 204 }); }
  }
  const leagueGameMatch = path.match(/^\/api\/leagues\/games\/(\d+)$/);
  if (leagueGameMatch) {
    const id = Number(leagueGameMatch[1]);
    if (method === "PUT") return updateResponse(db, "league_games", id, await body(request), "League game");
    if (method === "DELETE") { await run(db, "DELETE FROM league_games WHERE id = ?", id); return new Response(null, { status: 204 }); }
  }
  const leagueSpecialMatch = path.match(/^\/api\/leagues\/(\d+)\/(stats|standings|share|leaderboard|recap)$/);
  if (leagueSpecialMatch && method === "GET") {
    const detail = await leagueDetail(db, Number(leagueSpecialMatch[1]));
    if (!detail) return error("League not found", 404);
    const kind = leagueSpecialMatch[2];
    if (kind === "stats") return json(detail.stats);
    if (kind === "standings") return json(leagueStandingsPayload(detail));
    if (kind === "leaderboard") return json(leagueLeaderboardPayload(detail));
    const week = detail.weeks.at(-1) ?? null;
    const games = week?.games?.map((game: Row) => Number(game.score ?? 0)) ?? [];
    if (kind === "recap") {
      if (!week) return error("League recap not found", 404);
      return json({ league: { id: detail.id, name: detail.name, location: detail.location, season: detail.season }, week: { weekNumber: week.weekNumber, date: week.date, opponent: week.opponent, won: week.gamesWon, lost: week.gamesLost, tied: week.gamesTied }, games, stats: { average: average(games), highGame: games.length ? Math.max(...games) : 0, totalGames: games.length, series: games.reduce((sum: number, score: number) => sum + score, 0) } });
    }
    return json(leagueSharePayload(detail));
  }
  const leagueMatch = path.match(/^\/api\/leagues\/(\d+)$/);
  if (leagueMatch) {
    const id = Number(leagueMatch[1]);
    if (method === "GET") { const detail = await leagueDetail(db, id); return detail ? json(detail) : error("League not found", 404); }
    if (method === "PUT") return updateResponse(db, "leagues", id, await body(request), "League");
    if (method === "DELETE") {
      const weeks = await all(db, "SELECT id FROM league_weeks WHERE league_id = ?", id);
      const statements = weeks.map((week) => db.prepare("DELETE FROM league_games WHERE week_id = ?").bind(week.id));
      statements.push(db.prepare("DELETE FROM league_weeks WHERE league_id = ?").bind(id), db.prepare("DELETE FROM leagues WHERE id = ?").bind(id));
      await db.batch(statements); return new Response(null, { status: 204 });
    }
  }

  if (path === "/api/tournaments" && method === "GET") return json(await tournamentList(db));
  if (path === "/api/tournaments" && method === "POST") return insertResponse(db, "tournaments", await body(request));
  const tournamentGameCreateMatch = path.match(/^\/api\/tournaments\/(\d+)\/games$/);
  if (tournamentGameCreateMatch && method === "POST") return insertResponse(db, "tournament_games", { ...(await body(request)), tournamentId: Number(tournamentGameCreateMatch[1]) });
  const tournamentGameMatch = path.match(/^\/api\/tournaments\/games\/(\d+)$/);
  if (tournamentGameMatch) {
    const id = Number(tournamentGameMatch[1]);
    if (method === "PUT") return updateResponse(db, "tournament_games", id, await body(request), "Tournament game");
    if (method === "DELETE") { await run(db, "DELETE FROM tournament_games WHERE id = ?", id); return new Response(null, { status: 204 }); }
  }
  const tournamentSpecialMatch = path.match(/^\/api\/tournaments\/(\d+)\/(share|standings|bracket)$/);
  if (tournamentSpecialMatch && method === "GET") {
    const detail = await tournamentDetail(db, Number(tournamentSpecialMatch[1]));
    if (!detail) return error("Tournament not found", 404);
    const kind = tournamentSpecialMatch[2];
    const standings = tournamentStandingsPayload(detail).standings;
    if (kind === "bracket") return json({ tournament: detail, blocks: [], standings });
    if (kind === "standings") return json({ standings });
    return json(tournamentSharePayload(detail));
  }
  const tournamentMatch = path.match(/^\/api\/tournaments\/(\d+)$/);
  if (tournamentMatch) {
    const id = Number(tournamentMatch[1]);
    if (method === "GET") { const detail = await tournamentDetail(db, id); return detail ? json(detail) : error("Tournament not found", 404); }
    if (method === "PUT") return updateResponse(db, "tournaments", id, await body(request), "Tournament");
    if (method === "DELETE") { await db.batch([db.prepare("DELETE FROM tournament_games WHERE tournament_id = ?").bind(id), db.prepare("DELETE FROM tournaments WHERE id = ?").bind(id)]); return new Response(null, { status: 204 }); }
  }

  if (path === "/api/arsenals" && method === "GET") return json(await arsenalList(db));
  if (path === "/api/arsenals" && method === "POST") return insertResponse(db, "arsenals", await body(request));
  const arsenalBallCreateMatch = path.match(/^\/api\/arsenals\/(\d+)\/balls$/);
  if (arsenalBallCreateMatch && method === "POST") return insertResponse(db, "arsenal_balls", { ...(await body(request)), arsenalId: Number(arsenalBallCreateMatch[1]) });
  const arsenalBallMatch = path.match(/^\/api\/arsenals\/balls\/(\d+)$/);
  if (arsenalBallMatch) {
    const id = Number(arsenalBallMatch[1]);
    if (method === "PUT") return updateResponse(db, "arsenal_balls", id, await body(request), "Arsenal ball");
    if (method === "DELETE") { await run(db, "DELETE FROM arsenal_balls WHERE id = ?", id); return new Response(null, { status: 204 }); }
  }
  const arsenalMatch = path.match(/^\/api\/arsenals\/(\d+)$/);
  if (arsenalMatch) {
    const id = Number(arsenalMatch[1]);
    if (method === "GET") { const detail = await arsenalDetail(db, id); return detail ? json(detail) : error("Arsenal not found", 404); }
    if (method === "PUT") return updateResponse(db, "arsenals", id, await body(request), "Arsenal");
    if (method === "DELETE") { await db.batch([db.prepare("DELETE FROM arsenal_balls WHERE arsenal_id = ?").bind(id), db.prepare("DELETE FROM arsenals WHERE id = ?").bind(id)]); return new Response(null, { status: 204 }); }
  }

  if ((path === "/api/backup" || path === "/api/export") && method === "GET") return json(await exportData(db), 200, { "content-disposition": "attachment; filename=bowlsense-backup.json" });
  if ((path === "/api/restore" || path === "/api/import") && method === "POST") return json({ ok: true, imported: await restoreData(db, await limitedJsonBody(request)) });
  if (path === "/api/backups" && method === "GET") return json({ backups: [], latestMtime: null, backupCount: 0, cloudRemote: "Sites managed database" });
  if (path === "/api/backups" && method === "POST") return json({ ok: true, output: "Sites continuously manages the BowlSense database.", backups: [] });
  if (path === "/api/data-health" && method === "GET") return json(await dataHealth(db));

  if (path === "/api/import/csv" && method === "POST") {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return error("CSV file is required");
    if (file.size > MAX_IMPORT_BYTES) throw new HttpError(413, "CSV import is too large");
    const rows = parseCsv(await file.text());
    if (rows.length < 2) return error("CSV contains no rows");
    const headers = rows[0].map((item) => item.trim().toLowerCase());
    if (!headers.includes("date") || !headers.includes("score")) throw new HttpError(422, "CSV requires date and score columns");
    const imported = { sessions: 0, games: 0, balls: 0 };
    const sessionIds = new Map<string, number>();
    const maxSession = await first(db, "SELECT COALESCE(MAX(id), 0) AS id FROM sessions");
    let nextSessionId = Number(maxSession?.id ?? 0) + 1;
    const sessionRows: Row[] = [];
    const gameRows: Row[] = [];
    for (const values of rows.slice(1)) {
      if (values.length > headers.length || values.length < headers.length) throw new HttpError(422, "CSV row has a different number of columns than its header");
      const row = Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""]));
      if (!row.date || row.score === "") throw new HttpError(422, "Every CSV row requires date and score");
      const key = `${row.date}|${row.location ?? ""}`;
      let sessionId = sessionIds.get(key);
      if (!sessionId) {
        sessionId = nextSessionId; nextSessionId += 1;
        const session = validateRecord("sessions", { date: row.date, location: row.location || null });
        sessionRows.push({ id: sessionId, ...session });
        sessionIds.set(key, sessionId); imported.sessions += 1;
      }
      const game = validateRecord("games", {
        sessionId,
        gameNumber: csvInteger(row, "game_number", 1, 1, 99),
        score: csvInteger(row, "score", 0, 0, 300),
        strikes: csvInteger(row, "strikes", 0, 0, 12),
        spares: csvInteger(row, "spares", 0, 0, 10),
        splits: csvInteger(row, "splits", 0, 0, 12),
      });
      gameRows.push(game);
      imported.games += 1;
    }
    const statements = [
      ...multiRowInsertStatements(db, "sessions", sessionRows, true),
      ...multiRowInsertStatements(db, "games", gameRows),
    ];
    if (!statements.length) throw new HttpError(422, "CSV contains no importable rows");
    enforceD1StatementBudget(statements, 1);
    await db.batch(statements);
    return json({ ok: true, imported });
  }

  if ((path.endsWith("/og-image") || path.endsWith("/share-card")) && method === "GET") {
    if (path === "/api/profile/og-image") {
      const profileName = publicProfileName(env);
      return await sharePng(profileName ? `${profileName}'s BowlSense` : "BowlSense", "Public bowling profile");
    }
    const sessionId = path.match(/^\/api\/sessions\/(\d+)\/(?:og-image|share-card)$/)?.[1];
    if (sessionId) {
      const payload = await publicSessionPayload(db, Number(sessionId));
      if (!payload) return error("Session not found", 404);
      return await sharePng(`Series ${payload.summary.series}`, `${payload.session.location || "Bowling"} - Avg ${payload.summary.average}`);
    }
    const gameId = path.match(/^\/api\/games\/(\d+)/)?.[1];
    if (gameId) {
      const perfectOnly = path.endsWith("/perfect-og-image");
      const game = await first(db, `SELECT g.score, s.location, s.date FROM games g JOIN sessions s ON s.id = g.session_id WHERE g.id = ?${perfectOnly ? " AND g.score = 300" : ""}`, Number(gameId));
      return game ? await sharePng(`Game ${game.score ?? "-"}`, `${game.location ?? "Bowling"} - ${game.date ?? ""}`) : error("Game not found", 404);
    }
    const leagueId = path.match(/^\/api\/leagues\/(\d+)/)?.[1];
    if (leagueId) {
      const detail = await leagueDetail(db, Number(leagueId));
      if (!detail) return error("League not found", 404);
      const weekId = path.match(/\/weeks\/(\d+)\/og-image$/)?.[1];
      if (weekId && !(detail.weeks || []).some((week: Row) => Number(week.id) === Number(weekId))) return error("Week not found", 404);
      if (path.endsWith("/recap/og-image") && !(detail.weeks || []).length) return error("League recap not found", 404);
      return await sharePng(detail.name || "League", `${detail.location || "BowlSense"} - Avg ${detail.stats?.average ?? 0}`);
    }
    const tournamentId = path.match(/^\/api\/tournaments\/(\d+)/)?.[1];
    if (tournamentId) {
      const detail = await tournamentDetail(db, Number(tournamentId));
      return detail ? await sharePng(detail.name || "Tournament", `${detail.location || "BowlSense"} - Avg ${detail.stats?.average ?? 0}`) : error("Tournament not found", 404);
    }
    return await sharePng("BowlSense", "Track every frame. See every trend.");
  }

  return error("Not found", 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/health" || url.pathname.startsWith("/api/") || url.pathname === "/balls/search") {
        if (!isPublicApiRequest(request.method.toUpperCase(), url.pathname) && !isAuthorizedRequest(request, env)) {
          return error("Authentication required", 401);
        }
        await ensureSchema(env.DB);
        return await handleApi(request, env, url);
      }
      if (isPublicSharePage(url.pathname)) {
        await ensureSchema(env.DB);
        return await spaResponse(request, env, url, true);
      }
      const asset = await env.ASSETS.fetch(request);
      if (asset.status !== 404) return asset;
      return await spaResponse(request, env, url);
    } catch (caught) {
      if (caught instanceof HttpError && caught.status < 500) return error(caught.message, caught.status);
      console.error("BowlSense worker request failed", caught);
      return error("Unexpected server error", 500);
    }
  },
};
