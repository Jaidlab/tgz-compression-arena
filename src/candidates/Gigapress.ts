import type {CandidateRunInternalContext} from './base/types.ts'

import {runMeasuredCommand} from './base/command.ts'
import {CompressionCandidate} from './base/CompressionCandidate.ts'

const gigapressWorker = String.raw`
const [inputFile, outputFile, iterationsText, thoroughText, largeIterationsText, largeBlockSizeText] = Bun.argv.slice(1)
if (!inputFile || !outputFile || !iterationsText || !thoroughText || !largeIterationsText || !largeBlockSizeText) {
  throw new Error('Usage: bun --eval <worker> -- <input.tar> <output.tgz> <iterations> <thorough> <largeIterations> <largeBlockSize>')
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
  if (!value || value === 'auto') {
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
const largeBlockSize = getPositiveIntegerFromEnv('GIGAPRESS_LARGE_BLOCK_SIZE', 4_194_304, 1024)
const largeIterations = getPositiveIntegerFromEnv('GIGAPRESS_LARGE_ITERATIONS', 8)
const iterations = getPositiveIntegerFromEnv('GIGAPRESS_ITERATIONS', 1000)
const thorough = getThoroughFromEnv()
const formatMegabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(2)} mb`

export class Gigapress extends CompressionCandidate {
  readonly id = 'gigapress'
  readonly label = `Gigapress TypeScript (${iterations} iterations, thorough: ${thorough}, large: ${largeIterations} × ${formatMegabytes(largeBlockSize)} blocks)`

  protected async compress(input: string, context: CandidateRunInternalContext) {
    const output = this.getOutputFile(context)
    context.steps.push(await runMeasuredCommand([process.execPath, '--eval', gigapressWorker, '--', input, output, String(iterations), String(thorough), String(largeIterations), String(largeBlockSize)], {displayCommand: [process.execPath, '--eval', '<gigapress worker>', '--', input, output, String(iterations), String(thorough), String(largeIterations), String(largeBlockSize)]}))
    return output
  }
}
