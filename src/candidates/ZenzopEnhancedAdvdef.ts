import {ZenzopAdvdefCandidate} from './base/ZenzopAdvdefCandidate.ts'

const advdefIterations = Number(Bun.env.ADVDEF_ITERATIONS ?? 1000)
const zenzopIterations = Number(Bun.env.ZENZOP_ITERATIONS ?? 1000)

export class ZenzopEnhancedAdvdef extends ZenzopAdvdefCandidate {
  readonly enhanced = true
  readonly id = 'zenzop-enhanced-advdef'
  readonly label = `zenzop / zenflate enhanced + advdef insane (${zenzopIterations} × ${advdefIterations})`
}
