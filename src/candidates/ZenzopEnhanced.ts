import {ZenzopCandidate} from './base/ZenzopCandidate.ts'

export class ZenzopEnhanced extends ZenzopCandidate {
  readonly enhanced = true
  readonly id = 'zenzop-enhanced'
  readonly label = `zenzop / zenflate enhanced (${Number(Bun.env.ZENZOP_ITERATIONS ?? 1000)} iterations)`
}
