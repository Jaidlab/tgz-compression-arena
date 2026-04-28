import type {CandidateAvailability, CandidateRunInternalContext} from './types.ts'

import {join} from 'node:path'

import fs from 'fs-extra'

import {runMeasuredCommand} from './command.ts'
import {CompressionCandidate} from './CompressionCandidate.ts'
import {getCommandPath} from './utils.ts'

export abstract class ZenzopCandidate extends CompressionCandidate {
  abstract readonly enhanced: boolean
  protected readonly iterations = Number(Bun.env.ZENZOP_ITERATIONS ?? 1000)

  protected async compress(input: string, context: CandidateRunInternalContext) {
    const zenzopCommand = this.getZenzopCommand()
    if (!zenzopCommand) {
      throw new Error('zenzop was not found in PATH')
    }
    const workInput = join(context.workFolder, `${this.id}.tar`)
    const workOutput = `${workInput}.gz`
    const output = this.getOutputFile(context)
    await fs.copy(input, workInput)
    context.steps.push(await runMeasuredCommand([zenzopCommand, workInput], {
      env: {
        ...this.enhanced ? {ZENZOP_ENHANCED: '1'} : {},
        ZENZOP_ITERATIONS: String(this.iterations),
      },
    }))
    await fs.copy(workOutput, output)
    return output
  }

  protected getZenzopCommand() {
    return getCommandPath('zenzop')
  }

  override async isAvailable(): Promise<CandidateAvailability> {
    return this.getZenzopCommand() ? {available: true} : {
      available: false,
      reason: 'zenzop was not found in PATH. Install it with “cargo install zenzop”.',
    }
  }
}
