import type {CandidateAvailability, CandidateResult, CandidateResultError, CandidateResultOk, CandidateResultSkipped, CandidateRunContext, CandidateRunInternalContext, MeasuredStep} from './types.ts'

import {join} from 'node:path'

import {CommandFailedError} from './command.ts'
import {getFileSize, toRelativePortablePath} from './utils.ts'

export abstract class CompressionCandidate {
  abstract readonly id: string
  abstract readonly label: string

  protected abstract compress(input: string, context: CandidateRunInternalContext): Promise<string>

  protected getOutputFile(context: CandidateRunContext) {
    return join(context.outputFolder, `${this.id}.tgz`)
  }

  async isAvailable(): Promise<CandidateAvailability> {
    return {available: true}
  }

  async run(input: string, context: CandidateRunContext): Promise<CandidateResult> {
    const availability = await this.isAvailable()
    if (!availability.available) {
      return this.makeSkippedResult(availability.reason)
    }
    const steps: Array<MeasuredStep> = []
    try {
      const output = await this.compress(input, {
        ...context,
        steps,
      })
      return await this.makeOkResult(output, steps)
    } catch (error) {
      if (error instanceof CommandFailedError) {
        steps.push(error.step)
      }
      return this.makeErrorResult(error, steps)
    }
  }

  private makeErrorResult(error: unknown, steps: Array<MeasuredStep>) {
    return {
      error: error instanceof Error ? error.message : String(error),
      id: this.id,
      label: this.label,
      status: 'error',
      steps,
    } satisfies CandidateResultError
  }

  private async makeOkResult(output: string, steps: Array<MeasuredStep>) {
    return {
      id: this.id,
      label: this.label,
      output: toRelativePortablePath(output),
      peakRamBytes: Math.max(...steps.map(step => step.peakRamBytes)),
      runtimeMs: Number(steps.reduce((sum, step) => sum + step.runtimeMs, 0).toFixed(3)),
      size: await getFileSize(output),
      status: 'ok',
      steps,
    } satisfies CandidateResultOk
  }

  private makeSkippedResult(reason: string) {
    return {
      id: this.id,
      label: this.label,
      reason,
      status: 'skipped',
    } satisfies CandidateResultSkipped
  }
}
