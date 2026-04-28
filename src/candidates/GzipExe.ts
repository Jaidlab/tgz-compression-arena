import type {CandidateAvailability, CandidateRunInternalContext} from './base/types.ts'

import {runMeasuredCommand} from './base/command.ts'
import {CompressionCandidate} from './base/CompressionCandidate.ts'
import {getCommandPath} from './base/utils.ts'

export class GzipExe extends CompressionCandidate {
  readonly id = 'gzip-exe-9'
  readonly label = 'gzip.exe --best --no-name'

  protected async compress(input: string, context: CandidateRunInternalContext) {
    const gzipCommand = this.getGzipCommand()
    if (!gzipCommand) {
      throw new Error('gzip.exe was not found in PATH')
    }
    const output = this.getOutputFile(context)
    context.steps.push(await runMeasuredCommand([gzipCommand, '--stdout', '--no-name', '--best', input], {
      stdoutFile: output,
    }))
    return output
  }

  override async isAvailable(): Promise<CandidateAvailability> {
    return this.getGzipCommand() ? {available: true} : {
      available: false,
      reason: 'gzip.exe was not found in PATH',
    }
  }

  private getGzipCommand() {
    return getCommandPath('gzip.exe', 'gzip')
  }
}
