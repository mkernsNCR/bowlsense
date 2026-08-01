import Database from 'better-sqlite3'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export async function buildTestApp(t, { legacyCompetitions = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'bowlsense-backend-test-'))
  const databasePath = join(root, 'bowling.db')
  const frontendPath = join(root, 'frontend')
  await mkdir(frontendPath, { recursive: true })
  await writeFile(join(frontendPath, 'index.html'), '<!doctype html><html><head><title>Generic BowlSense</title><meta property="og:title" content="Generic"><meta property="og:url" content="http://private.example/"></head><body><div id="root"></div></body></html>')

  if (legacyCompetitions) {
    const legacy = new Database(databasePath)
    legacy.exec(`
      CREATE TABLE leagues (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, location TEXT,
        season TEXT, day_of_week TEXT, games_per_week INTEGER DEFAULT 3,
        start_date TEXT, end_date TEXT, notes TEXT, created_at INTEGER
      );
      CREATE TABLE tournaments (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, location TEXT,
        date TEXT, end_date TEXT, format TEXT, entry_fee REAL, prize_fund REAL,
        placement INTEGER, notes TEXT, created_at INTEGER
      );
      INSERT INTO leagues (id, name, created_at) VALUES (1, 'Legacy League', 1);
      INSERT INTO tournaments (id, name, date, created_at) VALUES (1, 'Legacy Tournament', '2026-01-01', 1);
    `)
    legacy.close()
  }

  const previous = {
    databasePath: process.env.BOWLSENSE_DB_PATH,
    frontendPath: process.env.BOWLSENSE_FRONTEND_DIST,
    disableListen: process.env.BOWLSENSE_DISABLE_LISTEN,
    testMode: process.env.BOWLSENSE_TEST_MODE,
    publicOrigin: process.env.BOWLSENSE_PUBLIC_ORIGIN,
  }
  process.env.BOWLSENSE_DB_PATH = databasePath
  process.env.BOWLSENSE_FRONTEND_DIST = frontendPath
  process.env.BOWLSENSE_DISABLE_LISTEN = '1'
  process.env.BOWLSENSE_TEST_MODE = '1'
  process.env.BOWLSENSE_PUBLIC_ORIGIN = 'https://bowlsense.example'

  const serverUrl = new URL(`./server.ts?test=${randomUUID()}`, import.meta.url)
  const { fastify, sqlite } = await import(serverUrl.href)
  await fastify.ready()

  t.after(async () => {
    await fastify.close()
    sqlite.close()
    const restore = (key, value) => {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    restore('BOWLSENSE_DB_PATH', previous.databasePath)
    restore('BOWLSENSE_FRONTEND_DIST', previous.frontendPath)
    restore('BOWLSENSE_DISABLE_LISTEN', previous.disableListen)
    restore('BOWLSENSE_TEST_MODE', previous.testMode)
    restore('BOWLSENSE_PUBLIC_ORIGIN', previous.publicOrigin)
    await rm(root, { recursive: true, force: true })
  })

  return { fastify, sqlite }
}
