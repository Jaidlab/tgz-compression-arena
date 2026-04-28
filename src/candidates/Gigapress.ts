import type {CandidateRunInternalContext} from './base/types.ts'

import {runMeasuredCommand} from './base/command.ts'
import {CompressionCandidate} from './base/CompressionCandidate.ts'

const gigapressWorker = String.raw`
const [inputFile, outputFile, iterationsText] = Bun.argv.slice(1)
if (!inputFile || !outputFile || !iterationsText) {
  throw new Error('Usage: bun --eval <worker> -- <input.tar> <output.tgz> <iterations>')
}
const {Gigapress} = await import('./src/gigapress/index.ts')
const input = new Uint8Array(await Bun.file(inputFile).arrayBuffer())
const output = new Gigapress({iterations: Number(iterationsText)}).compress(input)
await Bun.write(outputFile, output)
`
const iterations = Number(Bun.env.GIGAPRESS_ITERATIONS ?? 1000)

export class Gigapress extends CompressionCandidate {
  readonly id = 'gigapress'
  readonly label = `Gigapress TypeScript (${iterations} iterations)`

  protected async compress(input: string, context: CandidateRunInternalContext) {
    const output = this.getOutputFile(context)
    context.steps.push(await runMeasuredCommand([process.execPath, '--eval', gigapressWorker, '--', input, output, String(iterations)], {displayCommand: [process.execPath, '--eval', '<gigapress worker>', '--', input, output, String(iterations)]}))
    return output
  }
}
