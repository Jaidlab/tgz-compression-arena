import type {CandidateAvailability, CandidateRunInternalContext} from './types.ts'

import {runMeasuredCommand} from './command.ts'
import {CompressionCandidate} from './CompressionCandidate.ts'

const bunGzipWorker = String.raw`
const [inputFile, outputFile, levelText] = Bun.argv.slice(1)
if (!inputFile || !outputFile || !levelText) {
  throw new Error('Usage: bun --eval <worker> -- <input.tar> <output.tgz> <level>')
}
const input = await Bun.file(inputFile).arrayBuffer()
const output = Bun.gzipSync(input, {level: Number(levelText)})
await Bun.write(outputFile, output)
`

export abstract class BunGzipCandidate extends CompressionCandidate {
  abstract readonly level: -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

  protected async compress(input: string, context: CandidateRunInternalContext) {
    const output = this.getOutputFile(context)
    context.steps.push(await runMeasuredCommand([process.execPath, '--eval', bunGzipWorker, '--', input, output, String(this.level)], {displayCommand: [process.execPath, '--eval', '<bun gzip worker>', '--', input, output, String(this.level)]}))
    return output
  }

  override async isAvailable(): Promise<CandidateAvailability> {
    try {
      Bun.gzipSync(new Uint8Array, {level: this.level})
      return {available: true}
    } catch (error) {
      return {
        available: false,
        reason: `Bun gzip level ${this.level} is not supported by this Bun version: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }
}
