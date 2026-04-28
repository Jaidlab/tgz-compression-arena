import type {CandidateAvailability, CandidateRunInternalContext} from './types.ts'

import {runMeasuredCommand} from './command.ts'
import {getCommandPath} from './utils.ts'

export abstract class AdvdefRecompressingCandidate {
  protected readonly advdefIterations = Number(Bun.env.ADVDEF_ITERATIONS ?? 1000)

  async getAdvdefAvailability(): Promise<CandidateAvailability> {
    return this.getAdvdefCommand() ? {available: true} : {
      available: false,
      reason: 'advdef was not found in PATH',
    }
  }

  protected getAdvdefCommand() {
    return getCommandPath('advdef')
  }

  async recompressWithAdvdef(output: string, context: CandidateRunInternalContext) {
    const advdefCommand = this.getAdvdefCommand()
    if (!advdefCommand) {
      throw new Error('advdef was not found in PATH')
    }
    context.steps.push(await runMeasuredCommand([advdefCommand, '--recompress', '--shrink-insane', '--iter', String(this.advdefIterations), output]))
  }
}
