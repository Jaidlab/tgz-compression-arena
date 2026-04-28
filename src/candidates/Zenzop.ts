import {ZenzopCandidate} from './base/ZenzopCandidate.ts'

export class Zenzop extends ZenzopCandidate {
  readonly enhanced = false
  readonly id = 'zenzop'
  readonly label = `zenzop / zenflate (${Number(Bun.env.ZENZOP_ITERATIONS ?? 1000)} iterations)`
}
