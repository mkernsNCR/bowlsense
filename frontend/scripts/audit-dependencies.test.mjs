import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  ALLOWED_ADVISORY,
  evaluateAuditReport,
  findRscUsage,
} from './audit-dependencies.mjs'

function acceptedReport() {
  return {
    auditReportVersion: 2,
    vulnerabilities: {
      'react-router': {
        severity: 'high',
        via: [
          {
            source: ALLOWED_ADVISORY.source,
            name: 'react-router',
            dependency: 'react-router',
            url: ALLOWED_ADVISORY.url,
            severity: 'high',
          },
        ],
      },
      'react-router-dom': {
        severity: 'high',
        via: ['react-router'],
      },
    },
    metadata: {
      vulnerabilities: {
        info: 0,
        low: 0,
        moderate: 0,
        high: 2,
        critical: 0,
        total: 2,
      },
    },
  }
}

test('accepts only the approved RSC advisory and its propagation', () => {
  assert.deepEqual(evaluateAuditReport(acceptedReport()), {
    ok: true,
    exceptionUsed: true,
  })
})

test('passes without an exception when npm reports no vulnerabilities', () => {
  const report = acceptedReport()
  report.vulnerabilities = {}
  assert.deepEqual(evaluateAuditReport(report), {
    ok: true,
    exceptionUsed: false,
  })
})

test('rejects an additional vulnerable package', () => {
  const report = acceptedReport()
  report.vulnerabilities.other = {
    severity: 'high',
    via: [{ url: 'https://example.test/other' }],
  }
  assert.equal(evaluateAuditReport(report).ok, false)
})

test('rejects a changed advisory on react-router', () => {
  const report = acceptedReport()
  report.vulnerabilities['react-router'].via[0].url =
    'https://github.com/advisories/GHSA-different'
  assert.equal(evaluateAuditReport(report).ok, false)
})

test('rejects indirect findings beyond react-router propagation', () => {
  const report = acceptedReport()
  report.vulnerabilities['react-router-dom'].via.push('another-package')
  assert.equal(evaluateAuditReport(report).ok, false)
})

test('detects React Server Components API usage', () => {
  const root = mkdtempSync(join(tmpdir(), 'bowlsense-audit-'))
  mkdirSync(join(root, 'nested'))
  writeFileSync(join(root, 'client.tsx'), "import { BrowserRouter } from 'react-router-dom'\n")
  writeFileSync(
    join(root, 'nested', 'server.ts'),
    "import { decodeAction } from 'react-server-dom-webpack/server'\n",
  )

  assert.deepEqual(findRscUsage(root), [join(root, 'nested', 'server.ts')])
})
