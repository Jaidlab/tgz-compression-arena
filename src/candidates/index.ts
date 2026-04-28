import {BunGzip9} from './BunGzip9.ts'
import {BunGzip9Advdef} from './BunGzip9Advdef.ts'
import {Gigapress} from './Gigapress.ts'
import {GzipExe} from './GzipExe.ts'
import {SevenZipGzip} from './SevenZipGzip.ts'
import {Zenzop} from './Zenzop.ts'
import {ZenzopEnhanced} from './ZenzopEnhanced.ts'
import {ZenzopEnhancedAdvdef} from './ZenzopEnhancedAdvdef.ts'

export const candidates = [
  new BunGzip9,
  new BunGzip9Advdef,
  new GzipExe,
  new SevenZipGzip,
  new Zenzop,
  new ZenzopEnhanced,
  new ZenzopEnhancedAdvdef,
  new Gigapress,
]

export type {CompressionCandidate} from './base/CompressionCandidate.ts'
export type {CandidateResult, CandidateResultOk, CandidateRunContext, MeasuredStep} from './base/types.ts'
