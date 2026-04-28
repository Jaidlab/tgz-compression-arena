import type {CandidateResult, CandidateResultOk} from '#src/candidates/index.ts'

import {dirname, join} from 'node:path'

import fs from 'fs-extra'
import YAML from 'yaml'

type RunResult = {
  candidates?: Array<CandidateEntry>
  fixtures: Array<{
    bestCandidateId?: string
    candidates: Array<CandidateResult>
    input: string
    inputSize: number
    name: string
  }>
  generatedAt: string
}

type CandidateEntry = {
  id: string
  label: string
}

const resultsFile = 'out/results.yml'
const reportFile = 'out/report.html'
const escapeHtml = (value: unknown) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')
const formatNumber = (value: number, digits = 0) => new Intl.NumberFormat('en-US', {
  maximumFractionDigits: digits,
  minimumFractionDigits: digits,
}).format(value).replaceAll(',', ' ')
const formatBytes = (bytes: number) => {
  if (bytes < 10_000) {
    return `${formatNumber(bytes)} b`
  }
  if (bytes < 10_000_000) {
    return `${formatNumber(bytes / 1000, 2)} kb`
  }
  return `${formatNumber(bytes / 1_000_000, 2)} mb`
}
const formatRuntime = (ms: number) => {
  if (ms < 1000) {
    return `${formatNumber(ms, 1)} ms`
  }
  return `${formatNumber(ms / 1000, 2)} s`
}
const getOkCandidates = (candidates: Array<CandidateResult>) => candidates.filter((candidate): candidate is CandidateResultOk => candidate.status === 'ok')
const getSortedCandidates = (candidates: Array<CandidateResult>) => candidates.toSorted((a, b) => {
  if (a.status === 'ok' && b.status === 'ok') {
    return a.size - b.size
  }
  if (a.status === 'ok') {
    return -1
  }
  if (b.status === 'ok') {
    return 1
  }
  return a.label.localeCompare(b.label)
})
const makeBar = (value: number, max: number) => {
  const width = max > 0 ? Math.max(2, value / max * 100) : 0
  return `<span class="bar" style="--bar-width: ${width.toFixed(2)}%"></span>`
}
const getCandidateEntries = (result: RunResult) => {
  if (result.candidates) {
    return result.candidates
  }
  const candidatesById = new Map<string, CandidateEntry>
  for (const fixture of result.fixtures) {
    for (const candidate of fixture.candidates) {
      candidatesById.set(candidate.id, {
        id: candidate.id,
        label: candidate.label,
      })
    }
  }
  return [...candidatesById.values()]
}
const renderOverview = (result: RunResult) => {
  const fixtureCount = result.fixtures.length
  const inputSize = result.fixtures.reduce((sum, fixture) => sum + fixture.inputSize, 0)
  const summaries = getCandidateEntries(result).map(candidate => {
    const okResults = result.fixtures
      .map(fixture => fixture.candidates.find(resultCandidate => resultCandidate.id === candidate.id))
      .filter((candidateResult): candidateResult is CandidateResultOk => candidateResult?.status === 'ok')
    return {
      ...candidate,
      maxPeakRamBytes: Math.max(...okResults.map(okResult => okResult.peakRamBytes), 0),
      okCount: okResults.length,
      runtimeMs: okResults.reduce((sum, okResult) => sum + okResult.runtimeMs, 0),
      size: okResults.reduce((sum, okResult) => sum + okResult.size, 0),
      wins: result.fixtures.filter(fixture => fixture.bestCandidateId === candidate.id).length,
    }
  }).toSorted((a, b) => {
    const okDelta = Number(b.okCount === fixtureCount) - Number(a.okCount === fixtureCount)
    if (okDelta !== 0) {
      return okDelta
    }
    if (a.okCount !== b.okCount) {
      return b.okCount - a.okCount
    }
    if (a.size !== b.size) {
      return a.size - b.size
    }
    return a.label.localeCompare(b.label)
  })
  return `<section class="fixture overview">
    <header>
      <div>
        <h2>Overview</h2>
        <p>${fixtureCount} fixture${fixtureCount === 1 ? '' : 's'} · source tar total ${formatBytes(inputSize)}</p>
      </div>
    </header>
    <table>
      <thead><tr><th>Compressor</th><th>Fixtures</th><th>Total size</th><th>Ratio</th><th>Total runtime</th><th>Peak RAM</th><th>Wins</th></tr></thead>
      <tbody>${summaries.map(candidate => `<tr class="${candidate.okCount === fixtureCount ? '' : 'muted'}">
        <td><div class="name">${escapeHtml(candidate.label)}</div><div class="path">${escapeHtml(candidate.id)}</div></td>
        <td>${candidate.okCount}/${fixtureCount}</td>
        <td>${candidate.okCount > 0 ? formatBytes(candidate.size) : '–'}</td>
        <td>${candidate.okCount === fixtureCount ? `${formatNumber(candidate.size / inputSize * 100, 2)}%` : '–'}</td>
        <td>${candidate.okCount > 0 ? formatRuntime(candidate.runtimeMs) : '–'}</td>
        <td>${candidate.okCount > 0 ? formatBytes(candidate.maxPeakRamBytes) : '–'}</td>
        <td>${candidate.wins}</td>
      </tr>`).join('')}</tbody>
    </table>
  </section>`
}
const renderCandidateRow = (candidate: CandidateResult, bestCandidateId: string | undefined, maxSize: number, maxRuntime: number, maxPeakRam: number) => {
  if (candidate.status !== 'ok') {
    return `<tr class="muted"><td>${escapeHtml(candidate.label)}</td><td colspan="4">${candidate.status === 'skipped' ? `Skipped: ${escapeHtml(candidate.reason)}` : `Failed: ${escapeHtml(candidate.error)}`}</td></tr>`
  }
  const isBest = candidate.id === bestCandidateId
  return `<tr class="${isBest ? 'best' : ''}">
    <td><div class="name">${escapeHtml(candidate.label)}${isBest ? '<span class="badge">best</span>' : ''}</div><div class="path">${escapeHtml(candidate.output)}</div></td>
    <td><div class="metric">${formatBytes(candidate.size)}</div>${makeBar(candidate.size, maxSize)}</td>
    <td><div class="metric">${formatRuntime(candidate.runtimeMs)}</div>${makeBar(candidate.runtimeMs, maxRuntime)}</td>
    <td><div class="metric">${formatBytes(candidate.peakRamBytes)}</div>${makeBar(candidate.peakRamBytes, maxPeakRam)}</td>
    <td>${formatNumber(candidate.size)} bytes</td>
  </tr>`
}
const renderFixture = (fixture: RunResult['fixtures'][number]) => {
  const okCandidates = getOkCandidates(fixture.candidates)
  const maxSize = Math.max(...okCandidates.map(candidate => candidate.size), 0)
  const maxRuntime = Math.max(...okCandidates.map(candidate => candidate.runtimeMs), 0)
  const maxPeakRam = Math.max(...okCandidates.map(candidate => candidate.peakRamBytes), 0)
  const best = okCandidates.find(candidate => candidate.id === fixture.bestCandidateId)
  const ratio = best ? best.size / fixture.inputSize * 100 : undefined
  return `<section class="fixture">
    <header>
      <div>
        <h2>${escapeHtml(fixture.name)}</h2>
        <p>${escapeHtml(fixture.input)} · source tar ${formatBytes(fixture.inputSize)}</p>
      </div>
      <div class="summary">
        ${best ? `<strong>${formatBytes(best.size)}</strong><span>${formatNumber(ratio!, 2)}% of tar</span>` : '<strong>No successful result</strong>'}
      </div>
    </header>
    <table>
      <thead><tr><th>Compressor</th><th>Size</th><th>Runtime</th><th>Peak RAM</th><th>Raw size</th></tr></thead>
      <tbody>${getSortedCandidates(fixture.candidates).map(candidate => renderCandidateRow(candidate, fixture.bestCandidateId, maxSize, maxRuntime, maxPeakRam)).join('')}</tbody>
    </table>
  </section>`
}
const renderReport = (result: RunResult) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>tgz compression arena</title>
  <style>
    :root { color-scheme: dark; font: 15px/1.45 system-ui, sans-serif; background: #111217; color: #f2f4f8; }
    body { margin: 0; padding: 32px; }
    main { max-width: 1200px; margin: 0 auto; }
    h1, h2, p { margin: 0; }
    h1 { font-size: 32px; letter-spacing: -0.04em; }
    h2 { font-size: 22px; letter-spacing: -0.03em; }
    .intro { display: flex; justify-content: space-between; gap: 24px; align-items: end; margin-bottom: 28px; }
    .intro p, .fixture header p, .path { color: #9aa4b2; }
    .fixture { background: #191c24; border: 1px solid #2b3040; border-radius: 18px; margin-top: 18px; overflow: hidden; box-shadow: 0 20px 60px #0006; }
    .overview { background: #171b29; }
    .fixture header { display: flex; justify-content: space-between; gap: 24px; padding: 22px 24px; border-bottom: 1px solid #2b3040; }
    .summary { text-align: right; }
    .summary strong { display: block; font-size: 24px; }
    .summary span { color: #9aa4b2; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 14px 16px; text-align: left; vertical-align: top; border-bottom: 1px solid #242938; }
    th { color: #9aa4b2; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
    tr:last-child td { border-bottom: 0; }
    tr.best { background: color-mix(in srgb, #4ade80 11%, transparent); }
    tr.muted { color: #9aa4b2; }
    .name { font-weight: 700; display: flex; align-items: center; gap: 8px; }
    .path { font-size: 12px; margin-top: 2px; }
    .badge { background: #4ade80; color: #06210f; border-radius: 999px; padding: 2px 7px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
    .metric { font-variant-numeric: tabular-nums; margin-bottom: 7px; }
    .bar { display: block; width: 160px; max-width: 100%; height: 7px; border-radius: 999px; background: #2b3040; overflow: hidden; }
    .bar::before { content: ''; display: block; width: var(--bar-width); height: 100%; background: linear-gradient(90deg, #60a5fa, #a78bfa); border-radius: inherit; }
    @media (max-width: 800px) { body { padding: 18px; } .intro, .fixture header { display: block; } table { font-size: 13px; } th, td { padding: 10px; } .summary { text-align: left; margin-top: 12px; } }
  </style>
</head>
<body>
  <main>
    <div class="intro">
      <div>
        <h1>tgz compression arena</h1>
        <p>Generated from <code>${escapeHtml(resultsFile)}</code>.</p>
      </div>
      <p>${escapeHtml(new Date(result.generatedAt).toLocaleString('en-DE'))}</p>
    </div>
    ${renderOverview(result)}
    ${result.fixtures.map(renderFixture).join('')}
  </main>
</body>
</html>
`
const run = async () => {
  const result = YAML.parse(await Bun.file(resultsFile).text()) as RunResult
  await fs.ensureDir(dirname(reportFile))
  await Bun.write(join(process.cwd(), reportFile), renderReport(result))
  console.log(`Wrote ${reportFile}`)
}
await run()
