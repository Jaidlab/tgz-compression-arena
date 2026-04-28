import type {CandidateAvailability, CandidateRunInternalContext} from './base/types.ts'

import fs from 'fs-extra'

import {runMeasuredCommand} from './base/command.ts'
import {CompressionCandidate} from './base/CompressionCandidate.ts'
import {getCommandPath} from './base/utils.ts'

export class SevenZipGzip extends CompressionCandidate {
  readonly id = '7za-gzip-9'
  readonly label = '7za a -tgzip -mx9'

  protected async compress(input: string, context: CandidateRunInternalContext) {
    const sevenZipCommand = this.getSevenZipCommand()
    if (!sevenZipCommand) {
      throw new Error('7za was not found in PATH')
    }
    const output = this.getOutputFile(context)
    await fs.remove(output)
    context.steps.push(await runMeasuredCommand([sevenZipCommand, 'a', '-tgzip', '-mx9', '-bd', '-y', output, input]))
    return output
  }

  override async isAvailable(): Promise<CandidateAvailability> {
    return this.getSevenZipCommand() ? {available: true} : {
      available: false,
      reason: '7za was not found in PATH',
    }
  }

  private getSevenZipCommand() {
    return getCommandPath('7za')
  }
}
