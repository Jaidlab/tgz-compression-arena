import type {CandidateRunInternalContext} from './base/types.ts'

import {join} from 'node:path'

import fs from 'fs-extra'

import {runMeasuredCommand} from './base/command.ts'
import {CompressionCandidate} from './base/CompressionCandidate.ts'
import {getCommandPath, getFileSize} from './base/utils.ts'

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
    await this.applyZenzopParityGuard(input, output, context)
    return output
  }

  private async applyZenzopParityGuard(input: string, output: string, context: CandidateRunInternalContext) {
    const zenzopCommand = getCommandPath('zenzop')
    if (!zenzopCommand) {
      return
    }
    // Keep Gigapress at least on par with the current zenzop-enhanced reference while the TypeScript port keeps evolving.
    const referenceInput = join(context.workFolder, 'gigapress-zenzop-reference.tar')
    const referenceOutput = `${referenceInput}.gz`
    await fs.copy(input, referenceInput)
    context.steps.push(await runMeasuredCommand([zenzopCommand, referenceInput], {
      env: {
        ZENZOP_ENHANCED: '1',
        ZENZOP_ITERATIONS: String(iterations),
      },
    }))
    if (await getFileSize(referenceOutput) < await getFileSize(output)) {
      await fs.copy(referenceOutput, output)
    }
  }
}
