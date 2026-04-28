import type {CandidateAvailability, CandidateRunInternalContext} from './types.ts'

import {AdvdefRecompressingCandidate} from './AdvdefRecompressingCandidate.ts'
import {BunGzipCandidate} from './BunGzipCandidate.ts'

export abstract class BunGzipAdvdefCandidate extends BunGzipCandidate {
  private readonly advdef = new class extends AdvdefRecompressingCandidate {}

  protected override async compress(input: string, context: CandidateRunInternalContext) {
    const output = await super.compress(input, context)
    await this.advdef.recompressWithAdvdef(output, context)
    return output
  }

  override async isAvailable(): Promise<CandidateAvailability> {
    const bunAvailability = await super.isAvailable()
    if (!bunAvailability.available) {
      return bunAvailability
    }
    return this.advdef.getAdvdefAvailability()
  }
}
