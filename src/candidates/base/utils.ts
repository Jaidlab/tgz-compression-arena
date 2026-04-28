import {relative} from 'node:path'

import fs from 'fs-extra'

export const toPortablePath = (file: string) => file.replaceAll('\\', '/')

export const getCommandPath = (...commands: Array<string>) => {
  for (const command of commands) {
    const found = Bun.which(command)
    if (found) {
      return toPortablePath(found)
    }
  }
}

export const getFileSize = async (file: string) => {
  const fileStat = await fs.stat(file)
  return fileStat.size
}

export const toRelativePortablePath = (file: string) => toPortablePath(relative(process.cwd(), file) || '.')
