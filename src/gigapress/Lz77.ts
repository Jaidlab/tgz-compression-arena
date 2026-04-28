export type GigapressToken = LiteralToken | MatchToken

export type LiteralToken = {
  literal: number
  type: 'literal'
}

export type MatchToken = {
  distance: number
  length: number
  type: 'match'
}

export type PositionMatches = {
  distances: Uint16Array
  maxLength: number
}

const maxWindowSize = 32_768
const maxMatchLength = 258
const minMatchLength = 3
const hashSize = 65_536
const hashAt = (data: Uint8Array, position: number) => (data[position] * 251 + data[position + 1] * 521 + data[position + 2] & hashSize - 1) >>> 0
const getMatchLength = (data: Uint8Array, left: number, right: number, maxLength: number) => {
  let length = 0
  while (length < maxLength && data[left + length] === data[right + length]) {
    length++
  }
  return length
}
const makeEmptyMatches = (): PositionMatches => ({
  distances: new Uint16Array(0),
  maxLength: 0,
})

export const findMatches = (data: Uint8Array) => {
  const result = Array.from({length: data.length}, makeEmptyMatches)
  const previous = new Int32Array(data.length)
  previous.fill(-1)
  const head = new Int32Array(hashSize)
  head.fill(-1)
  for (let position = 0; position + minMatchLength <= data.length; position++) {
    const key = hashAt(data, position)
    previous[position] = head[key]!
    head[key] = position
  }
  for (let position = 0; position + minMatchLength <= data.length; position++) {
    const maxLengthAtPosition = Math.min(maxMatchLength, data.length - position)
    const distances = new Uint16Array(maxLengthAtPosition + 1)
    let maxLength = 0
    let chainLength = 0
    let candidate = previous[position]
    while (candidate >= 0 && position - candidate <= maxWindowSize && chainLength < 32_768 && maxLength < maxLengthAtPosition) {
      chainLength++
      const length = getMatchLength(data, candidate, position, maxLengthAtPosition)
      if (length > maxLength) {
        const distance = position - candidate
        const cappedLength = Math.min(length, maxLengthAtPosition)
        for (let coveredLength = Math.max(maxLength + 1, minMatchLength); coveredLength <= cappedLength; coveredLength++) {
          distances[coveredLength] = distance
        }
        maxLength = cappedLength
      }
      candidate = previous[candidate]!
    }
    if (maxLength >= minMatchLength) {
      result[position] = {
        distances,
        maxLength,
      }
    }
  }
  return result
}

export const getGreedyTokens = (data: Uint8Array, matches: Array<PositionMatches>) => {
  const tokens: Array<GigapressToken> = []
  for (let position = 0; position < data.length;) {
    const positionMatches = matches[position]
    if (positionMatches.maxLength >= minMatchLength) {
      const length = positionMatches.maxLength
      tokens.push({
        distance: positionMatches.distances[length],
        length,
        type: 'match',
      })
      position += length
      continue
    }
    tokens.push({
      literal: data[position],
      type: 'literal',
    })
    position++
  }
  return tokens
}
