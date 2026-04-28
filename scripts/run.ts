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
const getArgumentValues = (...names: Array<string>) => {
  const result: Array<string> = []
  const args = Bun.argv.slice(2)
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    for (const name of names) {
      if (arg === `--${name}`) {
        const value = args[index + 1]
        if (value && !value.startsWith('--')) {
          result.push(value)
          index++
        }
      } else if (arg.startsWith(`--${name}=`)) {
        result.push(arg.slice(name.length + 3))
      }
    }
  }
  return result
}
const parseFilter = (...values: Array<string | undefined>) => {
  const items = values.flatMap(value => value?.split(/[\s,]+/u) ?? []).filter(Boolean)
  return items.length > 0 ? new Set(items) : undefined
}
const formatFilterValues = (values: Iterable<string>) => [...values].toSorted((a, b) => a.localeCompare(b)).join(', ')
const run = async () => {
  const candidateFilter = parseFilter(Bun.env.CANDIDATES, Bun.env.CANDIDATE, ...getArgumentValues('candidate', 'candidates'))
  const fixtureFilter = parseFilter(Bun.env.FIXTURES, Bun.env.FIXTURE, ...getArgumentValues('fixture', 'fixtures'))
  const selectedCandidates = candidateFilter ? candidates.filter(candidate => candidateFilter.has(candidate.id)) : candidates
  if (selectedCandidates.length === 0) {
    throw new Error(`Candidate filter matched nothing. Available candidates: ${formatFilterValues(candidates.map(candidate => candidate.id))}`)
  }
  await fs.remove(workRoot)
  await fs.ensureDir(artifactFolder)
  await fs.ensureDir(workRoot)
  const fixtureFileNames = await fs.readdir(fixtureFolder)
  const fixtureFiles = fixtureFileNames
    .filter(file => file.endsWith('.tar'))
    .filter(file => !fixtureFilter || fixtureFilter.has(parse(file).name) || fixtureFilter.has(file))
    .toSorted((a, b) => parse(a).name.localeCompare(parse(b).name))
    .map(file => join(fixtureFolder, file))
  if (fixtureFiles.length === 0) {
    throw new Error(`Fixture filter matched nothing. Available fixtures: ${formatFilterValues(fixtureFileNames.filter(file => file.endsWith('.tar')).flatMap(file => [file, parse(file).name]))}`)
  }
  const result: RunResult = {
    candidates: selectedCandidates.map(candidate => ({
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
    for (const candidate of selectedCandidates) {
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
