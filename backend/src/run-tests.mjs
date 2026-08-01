import { readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const directory = dirname(fileURLToPath(import.meta.url))
const testFiles = (await readdir(directory))
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()

if (testFiles.length === 0) throw new Error('No backend test files were found')

// Explicit imports avoid platform-specific shell glob expansion while preserving
// node:test's normal exit status and reporting for every discovered test file.
for (const testFile of testFiles) {
  await import(pathToFileURL(join(directory, testFile)).href)
}
