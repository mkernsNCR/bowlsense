import { sqliteTable, text, integer, real, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const sessions = sqliteTable('sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull(),
  location: text('location'),
  lanes: text('lanes'),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const games = sqliteTable('games', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: integer('session_id').notNull().references(() => sessions.id),
  gameNumber: integer('game_number').notNull(),
  score: integer('score'),
  strikes: integer('strikes'),
  spares: integer('spares'),
  splits: integer('splits'),
  ballId: integer('ball_id'),
  frameData: text('frame_data'),
  pinLeaves: text('pin_leaves'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const balls = sqliteTable('balls', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  brand: text('brand'),
  color: text('color'),
  notes: text('notes'),
  bowwwlId: text('bowwwl_id'),
  coreType: text('core_type'),
  coreRg: text('core_rg'),
  coreDiff: text('core_diff'),
  coverstockName: text('coverstock_name'),
  coverstockType: text('coverstock_type'),
  factoryFinish: text('factory_finish'),
  thumbnailImage: text('thumbnail_image'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const leagues = sqliteTable('leagues', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  location: text('location'),
  season: text('season'),
  dayOfWeek: text('day_of_week'),
  gamesPerWeek: integer('games_per_week').default(3),
  startDate: text('start_date'),
  endDate: text('end_date'),
  notes: text('notes'),
  active: integer('active').default(1),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const leagueWeeks = sqliteTable('league_weeks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  leagueId: integer('league_id').notNull().references(() => leagues.id),
  weekNumber: integer('week_number').notNull(),
  date: text('date').notNull(),
  opponent: text('opponent'),
  gamesWon: integer('games_won').default(0),
  gamesLost: integer('games_lost').default(0),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [uniqueIndex('league_weeks_league_number_unique').on(table.leagueId, table.weekNumber)]);

export const leagueGames = sqliteTable('league_games', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  weekId: integer('week_id').notNull().references(() => leagueWeeks.id),
  gameNumber: integer('game_number').notNull(),
  score: integer('score'),
  strikes: integer('strikes'),
  spares: integer('spares'),
  splits: integer('splits'),
  ballId: integer('ball_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [uniqueIndex('league_games_week_number_unique').on(table.weekId, table.gameNumber)]);

export const tournaments = sqliteTable('tournaments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  location: text('location'),
  date: text('date'),
  endDate: text('end_date'),
  format: text('format'),
  entryFee: real('entry_fee'),
  prizeFund: real('prize_fund'),
  placement: integer('placement'),
  notes: text('notes'),
  active: integer('active').default(1),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const tournamentGames = sqliteTable('tournament_games', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tournamentId: integer('tournament_id').notNull().references(() => tournaments.id),
  gameNumber: integer('game_number').notNull(),
  score: integer('score'),
  strikes: integer('strikes'),
  spares: integer('spares'),
  splits: integer('splits'),
  ballId: integer('ball_id'),
  squad: text('squad'),
  frameData: text('frame_data'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const arsenals = sqliteTable('arsenals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  useCase: text('use_case'),
  maxSize: integer('max_size').default(6),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const arsenalBalls = sqliteTable('arsenal_balls', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  arsenalId: integer('arsenal_id').notNull().references(() => arsenals.id),
  ballId: integer('ball_id').notNull().references(() => balls.id),
  role: text('role'),
  slotOrder: integer('slot_order').default(0),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export type Session = typeof sessions.$inferSelect;
export type Game = typeof games.$inferSelect;
export type Ball = typeof balls.$inferSelect;
export type League = typeof leagues.$inferSelect;
export type LeagueWeek = typeof leagueWeeks.$inferSelect;
export type LeagueGame = typeof leagueGames.$inferSelect;
export type Tournament = typeof tournaments.$inferSelect;
export type TournamentGame = typeof tournamentGames.$inferSelect;
export type Arsenal = typeof arsenals.$inferSelect;
export type ArsenalBall = typeof arsenalBalls.$inferSelect;
