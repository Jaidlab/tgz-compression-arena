import type {MeasuredStep} from './types.ts'

import {dirname} from 'node:path'

import fs from 'fs-extra'

import {toPortablePath} from './utils.ts'

export type RunMeasuredCommandOptions = {
  displayCommand?: Array<string>
  env?: Record<string, string | undefined>
  stdoutFile?: string
}

const commandToText = (command: Array<string>) => command.map(part => {
  return /[\s"']/u.test(part) ? JSON.stringify(part) : part
}).join(' ')
const maxRssToBytes = (maxRSS: number) => maxRSS * 1024
const roundMilliseconds = (milliseconds: number) => Number(milliseconds.toFixed(3))

export class CommandFailedError extends Error {
  name = 'CommandFailedError'
  step: MeasuredStep
  constructor(step: MeasuredStep) {
    const output = [step.stdout?.trim(), step.stderr?.trim()].filter(Boolean).join('\n')
    super(`Command failed with exit code ${step.exitCode}: ${commandToText(step.command)}${output ? `\n${output}` : ''}`)
    this.step = step
  }
}

export const runMeasuredCommand = async (command: Array<string>, options: RunMeasuredCommandOptions = {}) => {
  const startedAt = performance.now()
  const subprocess = Bun.spawn({
    cmd: command,
    env: options.env ? {
      ...process.env,
      ...options.env,
    } : process.env,
    stderr: 'pipe',
    stdout: 'pipe',
  })
  const stdoutPromise = options.stdoutFile ? (async () => {
    const stdoutFile = options.stdoutFile!
    const stdoutBuffer = await new Response(subprocess.stdout).arrayBuffer()
    await fs.ensureDir(dirname(stdoutFile))
    await Bun.write(stdoutFile, stdoutBuffer)
  })() : subprocess.stdout.text()
  const [exitCode, stdout, stderr] = await Promise.all([
    subprocess.exited,
    stdoutPromise,
    subprocess.stderr.text(),
  ])
  const resourceUsage = subprocess.resourceUsage()
  const step = {
    command: (options.displayCommand ?? command).map(toPortablePath),
    exitCode,
    peakRamBytes: resourceUsage ? maxRssToBytes(resourceUsage.maxRSS) : 0,
    runtimeMs: roundMilliseconds(performance.now() - startedAt),
    ...typeof stdout === 'string' && stdout.trim() ? {stdout: stdout.trim()} : {},
    ...stderr.trim() ? {stderr: stderr.trim()} : {},
  } satisfies MeasuredStep
  if (exitCode !== 0) {
    throw new CommandFailedError(step)
  }
  return step
}
