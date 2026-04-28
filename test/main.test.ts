import {expect, it} from 'bun:test'

const {default: tgzCompressionArena} = await import('#src/main.ts')

it('should run', () => {
  expect(tgzCompressionArena).toBe(1) // TODO Test actual functionality
})
