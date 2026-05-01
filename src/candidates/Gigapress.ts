import type {CandidateRunInternalContext} from './base/types.ts'

import {CommandFailedError, runMeasuredCommand} from './base/command.ts'
import {CompressionCandidate} from './base/CompressionCandidate.ts'

const gigapressWorker = String.raw`
const [inputFile, outputFile, iterationsText, thoroughText, largeIterationsText, largeBlockSizeText] = Bun.argv.slice(1)
if (!inputFile || !outputFile || !iterationsText || !thoroughText || !largeIterationsText || !largeBlockSizeText) {
  throw new Error('Usage: bun --eval <worker> -- <input> <output> <iterations> <thorough> <largeIterations> <largeBlockSize>')
}
const parseThorough = value => {
  if (value === 'auto') {
    return 'auto'
  }
  if (value === 'true') {
    return true
  }
  if (value === 'false') {
    return false
  }
  throw new Error('thorough must be true, false or auto')
}
const {Gigapress} = await import('./src/gigapress/index.ts')
const input = new Uint8Array(await Bun.file(inputFile).arrayBuffer())
const output = new Gigapress({
  iterations: Number(iterationsText),
  largeBlockSize: Number(largeBlockSizeText),
  largeIterations: Number(largeIterationsText),
  thorough: parseThorough(thoroughText),
}).compress(input)
await Bun.write(outputFile, output)
`
const getThoroughFromEnv = () => {
  const value = Bun.env.GIGAPRESS_THOROUGH?.toLowerCase()
  if (!value) {
    return true
  }
  if (value === 'auto') {
    return 'auto'
  }
  if (['1', 'true', 'yes', 'on'].includes(value)) {
    return true
  }
  if (['0', 'false', 'no', 'off'].includes(value)) {
    return false
  }
  throw new Error('GIGAPRESS_THOROUGH must be true, false or auto')
}
const getPositiveIntegerFromEnv = (key: string, fallback: number, minimum = 1) => {
  const value = Number(Bun.env[key])
  if (!Number.isFinite(value)) {
    return fallback
  }
  return Math.max(minimum, Math.floor(value))
}
const largeBlockSize = getPositiveIntegerFromEnv('GIGAPRESS_LARGE_BLOCK_SIZE', 16_777_216, 1024)
const largeIterations = getPositiveIntegerFromEnv('GIGAPRESS_LARGE_ITERATIONS', 150)
const iterations = getPositiveIntegerFromEnv('GIGAPRESS_ITERATIONS', 1000)
const thorough = getThoroughFromEnv()
const formatMegabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(2)} mb`
const getCommand = (input: string, output: string, thoroughValue: typeof thorough) => [process.execPath, '--eval', gigapressWorker, '--', input, output, String(iterations), String(thoroughValue), String(largeIterations), String(largeBlockSize)]
const getDisplayCommand = (input: string, output: string, thoroughValue: typeof thorough) => [process.execPath, '--eval', '<gigapress worker>', '--', input, output, String(iterations), String(thoroughValue), String(largeIterations), String(largeBlockSize)]
const isOomFailure = (error: CommandFailedError) => {
  const output = [error.step.stdout, error.step.stderr].filter(Boolean).join('\n')
  if (/\b(allocation failed|cannot allocate|heap exhausted|heap limit|memory allocation|not enough memory|oom|out(?: |-)?of(?: |-)?memory)\b/iu.test(output)) {
    return true
  }
  return [-1_073_741_801, 137, 3_221_225_495].includes(error.step.exitCode)
}

export class Gigapress extends CompressionCandidate {
  readonly id = 'gigapress'
  readonly label = `Gigapress TypeScript (${iterations} iterations, thorough: ${thorough}, OOM fallback: ${thorough === false ? 'off' : 'non-thorough'}, large: ${largeIterations} × ${formatMegabytes(largeBlockSize)} blocks)`

  protected async compress(input: string, context: CandidateRunInternalContext) {
    const output = this.getOutputFile(context)
    try {
      context.steps.push(await runMeasuredCommand(getCommand(input, output, thorough), {displayCommand: getDisplayCommand(input, output, thorough)}))
    } catch (error) {
      if (!(error instanceof CommandFailedError) || thorough === false || !isOomFailure(error)) {
        throw error
      }
      context.steps.push(error.step)
      context.steps.push(await runMeasuredCommand(getCommand(input, output, false), {displayCommand: getDisplayCommand(input, output, false)}))
    }
    return output
  }
}
