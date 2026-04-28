import {BunGzipAdvdefCandidate} from './base/BunGzipAdvdefCandidate.ts'

export class BunGzip9Advdef extends BunGzipAdvdefCandidate {
  readonly id = 'bun-gzip-9-advdef'
  readonly label = `Bun gzip level 9 + advdef insane (${Number(Bun.env.ADVDEF_ITERATIONS ?? 1000)} iterations)`
  readonly level = 9
}
