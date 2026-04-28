import type {CandidateAvailability, CandidateRunInternalContext} from './types.ts'

import {AdvdefRecompressingCandidate} from './AdvdefRecompressingCandidate.ts'
import {ZenzopCandidate} from './ZenzopCandidate.ts'

export abstract class ZenzopAdvdefCandidate extends ZenzopCandidate {
  private readonly advdef = new class extends AdvdefRecompressingCandidate {}

  protected override async compress(input: string, context: CandidateRunInternalContext) {
    const output = await super.compress(input, context)
    await this.advdef.recompressWithAdvdef(output, context)
    return output
  }

  override async isAvailable(): Promise<CandidateAvailability> {
    const zenzopAvailability = await super.isAvailable()
    if (!zenzopAvailability.available) {
      return zenzopAvailability
    }
    return this.advdef.getAdvdefAvailability()
  }
}
