import type {CandidateResult, CandidateResultOk} from '#src/candidates/index.ts'

import {basename, join, parse} from 'node:path'

import fs from 'fs-extra'
import YAML from 'yaml'

import {getCommandPath, getFileSize, toPortablePath, toRelativePortablePath} from '#src/candidates/base/utils.ts'
import {candidates} from '#src/candidates/index.ts'

type RunResult = {
  candidates: Array<{
    id: string
    label: string
  }>
  commands: Record<string, string | null>
  fixtures: Array<{
    bestCandidateId?: string
    candidates: Array<CandidateResult>
    input: string
    inputSize: number
    name: string
  }>
  generatedAt: string
}

const fixtureFolder = 'assets/fixture'
const outFolder = 'out'
const artifactFolder = join(outFolder, 'artifacts')
const workRoot = join(outFolder, 'work')
const resultsFile = join(outFolder, 'results.yml')
const run = async () => {
  await fs.remove(workRoot)
  await fs.ensureDir(artifactFolder)
  await fs.ensureDir(workRoot)
  const fixtureFileNames = await fs.readdir(fixtureFolder)
  const fixtureFiles = fixtureFileNames
    .filter(file => file.endsWith('.tar'))
    .toSorted((a, b) => a.localeCompare(b))
    .map(file => join(fixtureFolder, file))
  const result: RunResult = {
    candidates: candidates.map(candidate => ({
      id: candidate.id,
      label: candidate.label,
    })),
    commands: {
      '7za': getCommandPath('7za') ?? null,
      advdef: getCommandPath('advdef') ?? null,
      'gzip.exe': getCommandPath('gzip.exe', 'gzip') ?? null,
      zenzop: getCommandPath('zenzop') ?? null,
    },
    fixtures: [],
    generatedAt: (new Date).toISOString(),
  }
  for (const input of fixtureFiles) {
    const fixtureId = parse(basename(input)).name
    const outputFolder = join(artifactFolder, fixtureId)
    const workFolder = join(workRoot, fixtureId)
    await fs.remove(outputFolder)
    await fs.ensureDir(outputFolder)
    await fs.ensureDir(workFolder)
    console.log(`Compressing ${toPortablePath(input)}`)
    const candidateResults: Array<CandidateResult> = []
    for (const candidate of candidates) {
      const candidateWorkFolder = join(workFolder, candidate.id)
      await fs.ensureDir(candidateWorkFolder)
      const candidateResult = await candidate.run(input, {
        fixtureId,
        outputFolder,
        workFolder: candidateWorkFolder,
      })
      candidateResults.push(candidateResult)
      if (candidateResult.status === 'ok') {
        console.log(`  ✓ ${candidateResult.label}: ${candidateResult.size} bytes in ${candidateResult.runtimeMs.toFixed(1)} ms`)
      } else if (candidateResult.status === 'skipped') {
        console.log(`  - ${candidateResult.label}: ${candidateResult.reason}`)
      } else {
        console.log(`  ✗ ${candidateResult.label}: ${candidateResult.error}`)
      }
    }
    const okResults = candidateResults.filter((candidate): candidate is CandidateResultOk => candidate.status === 'ok')
    const bestCandidate = okResults.toSorted((a, b) => a.size - b.size).at(0)
    result.fixtures.push({
      ...bestCandidate ? {bestCandidateId: bestCandidate.id} : {},
      candidates: candidateResults,
      input: toRelativePortablePath(input),
      inputSize: await getFileSize(input),
      name: fixtureId,
    })
  }
  await fs.remove(workRoot)
  await fs.ensureDir(outFolder)
  await Bun.write(resultsFile, YAML.stringify(result, {
    lineWidth: 0,
  }))
  console.log(`Wrote ${toPortablePath(resultsFile)}`)
}
await run()
