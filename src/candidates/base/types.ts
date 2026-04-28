export type CandidateAvailability = CandidateAvailable | CandidateUnavailable

export type CandidateAvailable = {
  available: true
}

export type CandidateResult = CandidateResultError | CandidateResultOk | CandidateResultSkipped

export type CandidateResultBase = {
  id: string
  label: string
  status: 'error' | 'ok' | 'skipped'
}

export type CandidateResultError = CandidateResultBase & {
  error: string
  status: 'error'
  steps: Array<MeasuredStep>
}

export type CandidateResultOk = CandidateResultBase & {
  output: string
  peakRamBytes: number
  runtimeMs: number
  size: number
  status: 'ok'
  steps: Array<MeasuredStep>
}

export type CandidateResultSkipped = CandidateResultBase & {
  reason: string
  status: 'skipped'
}

export type CandidateRunContext = {
  fixtureId: string
  outputFolder: string
  workFolder: string
}

export type CandidateRunInternalContext = CandidateRunContext & {
  steps: Array<MeasuredStep>
}

export type CandidateUnavailable = {
  available: false
  reason: string
}

export type MeasuredStep = {
  command: Array<string>
  exitCode: number
  peakRamBytes: number
  runtimeMs: number
  stderr?: string
  stdout?: string
}
