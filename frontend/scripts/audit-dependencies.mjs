import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ALLOWED_ADVISORY = Object.freeze({
  source: 1124282,
  url: 'https://github.com/advisories/GHSA-qwww-vcr4-c8h2',
  package: 'react-router',
  propagatedPackage: 'react-router-dom',
  severity: 'high',
})

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx'])
const RSC_PATTERNS = [
  /\breact-server-dom(?:-webpack|-parcel|-turbopack)?\b/,
  /\b@vitejs\/plugin-rsc\b/,
  /\breact-router\/(?:dom-)?rsc\b/,
  /\bunstable_RSC\w*\b/,
  /\bcreateCallServer\b/,
  /\bdecodeAction\b/,
  /\bdecodeFormState\b/,
  /\bdecodeReply\b/,
  /\bloadServerAction\b/,
]

function isAllowedAdvisory(advisory) {
  return (
    advisory &&
    typeof advisory === 'object' &&
    advisory.source === ALLOWED_ADVISORY.source &&
    advisory.url === ALLOWED_ADVISORY.url &&
    advisory.name === ALLOWED_ADVISORY.package &&
    advisory.dependency === ALLOWED_ADVISORY.package &&
    advisory.severity === ALLOWED_ADVISORY.severity
  )
}

export function evaluateAuditReport(report) {
  if (report?.auditReportVersion !== 2 || !report.vulnerabilities) {
    return { ok: false, reason: 'npm returned an unsupported or incomplete audit report.' }
  }

  const entries = Object.entries(report.vulnerabilities)
  if (entries.length === 0) {
    return { ok: true, exceptionUsed: false }
  }

  const packageNames = entries.map(([name]) => name).sort()
  const expectedNames = [
    ALLOWED_ADVISORY.package,
    ALLOWED_ADVISORY.propagatedPackage,
  ].sort()

  if (
    packageNames.length !== expectedNames.length ||
    packageNames.some((name, index) => name !== expectedNames[index])
  ) {
    return {
      ok: false,
      reason: `Audit contains unapproved vulnerable packages: ${packageNames.join(', ') || 'unknown'}.`,
    }
  }

  const router = report.vulnerabilities[ALLOWED_ADVISORY.package]
  const routerDom = report.vulnerabilities[ALLOWED_ADVISORY.propagatedPackage]
  const routerAdvisories = Array.isArray(router?.via)
    ? router.via.filter((item) => typeof item === 'object')
    : []

  if (
    router?.severity !== ALLOWED_ADVISORY.severity ||
    routerAdvisories.length !== 1 ||
    !isAllowedAdvisory(routerAdvisories[0])
  ) {
    return {
      ok: false,
      reason: `${ALLOWED_ADVISORY.package} contains an advisory outside the approved exception.`,
    }
  }

  if (
    routerDom?.severity !== ALLOWED_ADVISORY.severity ||
    !Array.isArray(routerDom.via) ||
    routerDom.via.length !== 1 ||
    routerDom.via[0] !== ALLOWED_ADVISORY.package
  ) {
    return {
      ok: false,
      reason: `${ALLOWED_ADVISORY.propagatedPackage} is not solely a propagation of the approved advisory.`,
    }
  }

  const metadata = report.metadata?.vulnerabilities
  if (
    metadata?.critical !== 0 ||
    metadata?.high !== 2 ||
    metadata?.total !== 2
  ) {
    return {
      ok: false,
      reason: 'Audit severity totals do not match the two expected package entries.',
    }
  }

  return { ok: true, exceptionUsed: true }
}

export function findRscUsage(sourceRoot) {
  const matches = []

  function visit(path) {
    const stats = statSync(path)
    if (stats.isDirectory()) {
      for (const entry of readdirSync(path)) {
        visit(join(path, entry))
      }
      return
    }

    if (!SOURCE_EXTENSIONS.has(extname(path))) return
    const source = readFileSync(path, 'utf8')
    if (RSC_PATTERNS.some((pattern) => pattern.test(source))) {
      matches.push(path)
    }
  }

  visit(sourceRoot)
  return matches
}

function run() {
  const audit = spawnSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['audit', '--json'],
    { encoding: 'utf8' },
  )

  let report
  try {
    report = JSON.parse(audit.stdout)
  } catch {
    console.error(audit.stderr || audit.stdout || 'npm audit did not return JSON.')
    process.exit(1)
  }

  const result = evaluateAuditReport(report)
  if (!result.ok) {
    console.error(`Dependency audit failed: ${result.reason}`)
    process.exit(1)
  }

  if (!result.exceptionUsed) {
    console.log('Dependency audit passed with no vulnerabilities.')
    return
  }

  const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url))
  const rscUsage = findRscUsage(sourceRoot)
  if (rscUsage.length > 0) {
    console.error(
      `Dependency audit failed: the approved RSC-only exception is invalid because RSC usage was found in:\n${rscUsage.join('\n')}`,
    )
    process.exit(1)
  }

  console.warn(
    `Dependency audit passed with the approved RSC-only exception ${ALLOWED_ADVISORY.url}.`,
  )
}

const invokedPath = process.argv[1]
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  run()
}
