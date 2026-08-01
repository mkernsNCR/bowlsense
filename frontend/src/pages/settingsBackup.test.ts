import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('Settings only presents native backup controls for the SQLite backend', async () => {
  const source = await readFile(new URL('./Settings.tsx', import.meta.url), 'utf8')
  assert.match(source, /backupBackend: 'sqlite' \| 'sites-managed'/)
  assert.match(source, /backups\?\.backupBackend === 'sqlite' && <div/)
  assert.match(source, /Run backup now/)
  assert.match(source, /role="alertdialog"/)
  assert.match(source, /title="Replace all BowlSense data\?"/)
  assert.match(source, /onClick=\{\(\) => void confirmImport\(\)\}/)
})
