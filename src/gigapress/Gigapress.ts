import type {HuffmanCoding} from './Huffman.ts'
import type {GigapressToken, PositionMatches} from './Lz77.ts'

import {BitWriter} from './BitWriter.ts'
import {getCrc32} from './crc32.ts'
import {getCodeLengths, getHuffmanCoding, writeHuffmanSymbol} from './Huffman.ts'
import {findMatches, getGreedyTokens} from './Lz77.ts'
import {codeLengthCodeOrder, distanceCodeTable, lengthCodeTable} from './tables.ts'

export type GigapressOptions = {
  iterations?: number
}

type CostModel = {
  distance: Float64Array
  literalLength: Float64Array
}

type EncodedBlock = {
  bitLength: number
  bytes: Uint8Array
  tokens: Array<GigapressToken>
}

type ParsedBlock = {
  distanceCoding: HuffmanCoding
  distanceLengths: Uint8Array
  literalLengthCoding: HuffmanCoding
  literalLengthLengths: Uint8Array
  tokens: Array<GigapressToken>
}

type SymbolFrequencies = ReturnType<typeof getFrequencies>

type RleCodeLengthToken = {
  extraBits: number
  extraValue: number
  symbol: number
}

const defaultIterations = 1000
const endOfBlockSymbol = 256
const maxDistanceSymbol = 29
const maxLiteralLengthSymbol = 285
const minMatchLength = 3
const fixedLiteralLengthCosts = new Float64Array(286)
for (let symbol = 0; symbol <= 143; symbol++) {
  fixedLiteralLengthCosts[symbol] = 8
}
for (let symbol = 144; symbol <= 255; symbol++) {
  fixedLiteralLengthCosts[symbol] = 9
}
for (let symbol = 256; symbol <= 279; symbol++) {
  fixedLiteralLengthCosts[symbol] = 7
}
for (let symbol = 280; symbol <= 285; symbol++) {
  fixedLiteralLengthCosts[symbol] = 8
}
const fixedDistanceCosts = new Float64Array(30)
fixedDistanceCosts.fill(5)
const getInitialCostModel = (): CostModel => ({
  distance: new Float64Array(fixedDistanceCosts),
  literalLength: new Float64Array(fixedLiteralLengthCosts),
})
const getEntropyCosts = (frequencies: ArrayLike<number>) => {
  const result = new Float64Array(frequencies.length)
  const sum = Array.from({length: frequencies.length}, (_, symbol) => frequencies[symbol]).reduce((total, frequency) => total + frequency, 0)
  const log2Sum = Math.log2(sum || frequencies.length)
  for (const symbol of Array.from({length: frequencies.length}, (_, index) => index)) {
    const frequency = frequencies[symbol]
    result[symbol] = frequency === 0 ? log2Sum : log2Sum - Math.log2(frequency)
  }
  return result
}
const getCostModelFromFrequencies = (literalLengthFrequencies: ArrayLike<number>, distanceFrequencies: ArrayLike<number>): CostModel => ({
  distance: getEntropyCosts(distanceFrequencies),
  literalLength: getEntropyCosts(literalLengthFrequencies),
})
const getCostModelFromSymbolFrequencies = (frequencies: SymbolFrequencies) => getCostModelFromFrequencies(frequencies.literalLength, frequencies.distance)
const getFrequencies = (tokens: Array<GigapressToken>) => {
  const literalLength = new Uint32Array(286)
  const distance = new Uint32Array(30)
  for (const token of tokens) {
    if (token.type === 'literal') {
      literalLength[token.literal]++
      continue
    }
    literalLength[lengthCodeTable.symbols[token.length]]++
    distance[distanceCodeTable.symbols[token.distance]]++
  }
  literalLength[endOfBlockSymbol]++
  if (distance.every(frequency => frequency === 0)) {
    distance[0] = 1
  }
  return {
    distance,
    literalLength,
  }
}
const cloneFrequencies = (frequencies: Uint32Array) => new Uint32Array(frequencies)
const setCountsToCount = (counts: Uint32Array, count: number, end: number, stride: number) => {
  for (let index = end - stride; index < end; index++) {
    counts[index] = count
  }
}
const optimizeHuffmanForRle = (counts: Uint32Array) => {
  let length = counts.length
  while (length > 0 && counts[length - 1] === 0) {
    length--
  }
  if (length === 0) {
    return counts
  }
  const goodForRle = Array.from({length: counts.length}).fill(false)
  let symbol = counts[0]
  let stride = 0
  for (let index = 0; index < length; index++) {
    const count = counts[index]
    if (count === symbol) {
      stride++
      continue
    }
    if (symbol === 0 && stride >= 5 || symbol !== 0 && stride >= 7) {
      for (let offset = 0; offset < stride; offset++) {
        goodForRle[index - offset - 1] = true
      }
    }
    stride = 1
    symbol = count
  }
  stride = 0
  let limit = counts[0]
  let sum = 0
  for (let index = 0; index <= length; index++) {
    if (index === length || goodForRle[index] || Math.abs(counts[index] - limit) >= 4) {
      if (stride >= 4 || stride >= 3 && sum === 0) {
        const count = sum === 0 ? 0 : Math.max(Math.floor((sum + Math.floor(stride / 2)) / stride), 1)
        setCountsToCount(counts, count, index, stride)
      }
      stride = 0
      sum = 0
      if (length > 2 && index < length - 3) {
        limit = Math.floor((counts[index] + counts[index + 1] + counts[index + 2] + counts[index + 3] + 2) / 4)
      } else if (index < length) {
        limit = counts[index]!
      } else {
        limit = 0
      }
    }
    stride++
    if (index !== length) {
      sum += counts[index]
    }
  }
  return counts
}
const optimizeHuffmanForRleBrotli = (counts: Uint32Array) => {
  let length = counts.length
  while (length > 0 && counts[length - 1] === 0) {
    length--
  }
  if (length === 0) {
    return counts
  }
  let index = 0
  while (index < length) {
    let stride = 1
    let sum = counts[index]
    while (index + stride < length) {
      const next = counts[index + stride]
      const average = sum / stride
      if (next === 0 && average !== 0 || next !== 0 && average === 0) {
        break
      }
      const ratio = average === 0 ? 1 : Math.max(next, average) / Math.max(1, Math.min(next, average))
      if (ratio > 1.21) {
        break
      }
      sum += next
      stride++
    }
    if (stride >= 4 || stride >= 3 && sum === 0) {
      const count = sum === 0 ? 0 : Math.max(Math.ceil(sum / stride), 1)
      setCountsToCount(counts, count, index + stride, stride)
    }
    index += stride
  }
  return counts
}
const cloneSymbolFrequencies = (frequencies: SymbolFrequencies): SymbolFrequencies => ({
  distance: cloneFrequencies(frequencies.distance),
  literalLength: cloneFrequencies(frequencies.literalLength),
})
const addWeightedFrequencies = (left: SymbolFrequencies, leftWeight: number, right: SymbolFrequencies, rightWeight: number): SymbolFrequencies => {
  const literalLength = new Uint32Array(left.literalLength.length)
  const distance = new Uint32Array(left.distance.length)
  for (let symbol = 0; symbol < literalLength.length; symbol++) {
    literalLength[symbol] = Math.floor(left.literalLength[symbol] * leftWeight + right.literalLength[symbol] * rightWeight)
  }
  for (let symbol = 0; symbol < distance.length; symbol++) {
    distance[symbol] = Math.floor(left.distance[symbol] * leftWeight + right.distance[symbol] * rightWeight)
  }
  literalLength[endOfBlockSymbol] = 1
  if (distance.every(frequency => frequency === 0)) {
    distance[0] = 1
  }
  return {
    distance,
    literalLength,
  }
}
const randomizeFrequencies = (frequencies: SymbolFrequencies, seed: number): SymbolFrequencies => {
  const randomized = cloneSymbolFrequencies(frequencies)
  let mW = seed + 1 >>> 0
  let mZ = seed + 2 >>> 0
  const next = () => {
    mZ = Math.imul(36_969, mZ & 65_535) + (mZ >>> 16) >>> 0
    mW = Math.imul(18_000, mW & 65_535) + (mW >>> 16) >>> 0
    return (mZ << 16) + mW >>> 0
  }
  const randomize = (values: Uint32Array) => {
    for (let index = 0; index < values.length; index++) {
      if ((next() >>> 4) % 3 === 0) {
        values[index] = values[next() % values.length]!
      }
    }
  }
  randomize(randomized.literalLength)
  randomize(randomized.distance)
  randomized.literalLength[endOfBlockSymbol] = 1
  if (randomized.distance.every(frequency => frequency === 0)) {
    randomized.distance[0] = 1
  }
  return randomized
}
const makeParsedBlock = (tokens: Array<GigapressToken>, literalLengthLengths: Uint8Array, distanceLengths: Uint8Array): ParsedBlock => ({
  distanceCoding: getHuffmanCoding(distanceLengths),
  distanceLengths,
  literalLengthCoding: getHuffmanCoding(literalLengthLengths),
  literalLengthLengths,
  tokens,
})
const parseCodeLengths = (lengths: Array<number>) => {
  const tokens: Array<RleCodeLengthToken> = []
  for (let index = 0; index < lengths.length;) {
    const length = lengths[index]
    let runLength = 1
    while (index + runLength < lengths.length && lengths[index + runLength] === length) {
      runLength++
    }
    if (length === 0) {
      let remaining = runLength
      while (remaining >= 11) {
        const count = Math.min(138, remaining)
        tokens.push({
          extraBits: 7,
          extraValue: count - 11,
          symbol: 18,
        })
        remaining -= count
      }
      if (remaining >= 3) {
        tokens.push({
          extraBits: 3,
          extraValue: remaining - 3,
          symbol: 17,
        })
        remaining = 0
      }
      while (remaining-- > 0) {
        tokens.push({
          extraBits: 0,
          extraValue: 0,
          symbol: 0,
        })
      }
    } else {
      tokens.push({
        extraBits: 0,
        extraValue: 0,
        symbol: length,
      })
      let remaining = runLength - 1
      while (remaining >= 3) {
        const count = Math.min(6, remaining)
        tokens.push({
          extraBits: 2,
          extraValue: count - 3,
          symbol: 16,
        })
        remaining -= count
      }
      while (remaining-- > 0) {
        tokens.push({
          extraBits: 0,
          extraValue: 0,
          symbol: length,
        })
      }
    }
    index += runLength
  }
  return tokens
}
const parseCodeLengthsWithCosts = (lengths: Array<number>, costsBySymbol: Float64Array) => {
  const costs = new Float64Array(lengths.length + 1)
  const choiceSymbol = new Uint8Array(lengths.length)
  const choiceExtraBits = new Uint8Array(lengths.length)
  const choiceExtraValue = new Uint8Array(lengths.length)
  const choiceCount = new Uint8Array(lengths.length)
  costs[lengths.length] = 0
  for (let index = lengths.length - 1; index >= 0; index--) {
    const length = lengths[index]
    let bestCost = costsBySymbol[length] + costs[index + 1]
    choiceSymbol[index] = length
    choiceExtraBits[index] = 0
    choiceExtraValue[index] = 0
    choiceCount[index] = 1
    let runLength = 1
    while (index + runLength < lengths.length && lengths[index + runLength] === length) {
      runLength++
    }
    if (length === 0) {
      const max17 = Math.min(10, runLength)
      for (let count = 3; count <= max17; count++) {
        const cost = costsBySymbol[17] + 3 + costs[index + count]
        if (cost < bestCost) {
          bestCost = cost
          choiceSymbol[index] = 17
          choiceExtraBits[index] = 3
          choiceExtraValue[index] = count - 3
          choiceCount[index] = count
        }
      }
      const max18 = Math.min(138, runLength)
      for (let count = 11; count <= max18; count++) {
        const cost = costsBySymbol[18] + 7 + costs[index + count]
        if (cost < bestCost) {
          bestCost = cost
          choiceSymbol[index] = 18
          choiceExtraBits[index] = 7
          choiceExtraValue[index] = count - 11
          choiceCount[index] = count
        }
      }
    } else if (index > 0 && lengths[index - 1] === length) {
      const max16 = Math.min(6, runLength)
      for (let count = 3; count <= max16; count++) {
        const cost = costsBySymbol[16] + 2 + costs[index + count]
        if (cost < bestCost) {
          bestCost = cost
          choiceSymbol[index] = 16
          choiceExtraBits[index] = 2
          choiceExtraValue[index] = count - 3
          choiceCount[index] = count
        }
      }
    }
    costs[index] = bestCost
  }
  const tokens: Array<RleCodeLengthToken> = []
  for (let index = 0; index < lengths.length;) {
    tokens.push({
      extraBits: choiceExtraBits[index],
      extraValue: choiceExtraValue[index],
      symbol: choiceSymbol[index],
    })
    index += choiceCount[index]
  }
  return tokens
}
const getCodeLengthLengths = (tokens: Array<RleCodeLengthToken>) => {
  const codeLengthFrequencies = new Uint32Array(19)
  for (const token of tokens) {
    codeLengthFrequencies[token.symbol]++
  }
  return getCodeLengths(codeLengthFrequencies, 7)
}
const getCodeLengthHeaderBitLength = (tokens: Array<RleCodeLengthToken>, codeLengthLengths: Uint8Array) => {
  let codeLengthCount = 4
  for (let index = 4; index < codeLengthCodeOrder.length; index++) {
    if (codeLengthLengths[codeLengthCodeOrder[index]] !== 0) {
      codeLengthCount = index + 1
    }
  }
  let bitLength = 14 + codeLengthCount * 3
  for (const token of tokens) {
    bitLength += codeLengthLengths[token.symbol] + token.extraBits
  }
  return bitLength
}
const optimizeCodeLengthTokens = (lengths: Array<number>) => {
  const candidates: Array<{
    codeLengthLengths: Uint8Array
    tokens: Array<RleCodeLengthToken>
  }> = []
  const addCandidate = (tokens: Array<RleCodeLengthToken>) => {
    candidates.push({
      codeLengthLengths: getCodeLengthLengths(tokens),
      tokens,
    })
  }
  let tokens = parseCodeLengths(lengths)
  addCandidate(tokens)
  for (let iteration = 0; iteration < 8; iteration++) {
    const codeLengthLengths = getCodeLengthLengths(tokens)
    const costs = new Float64Array(19)
    costs.fill(7)
    for (const [symbol, codeLengthLength] of codeLengthLengths.entries()) {
      if (codeLengthLength) {
        costs[symbol] = codeLengthLength!
      }
    }
    tokens = parseCodeLengthsWithCosts(lengths, costs)
    addCandidate(tokens)
  }
  return candidates.toSorted((a, b) => getCodeLengthHeaderBitLength(a.tokens, a.codeLengthLengths) - getCodeLengthHeaderBitLength(b.tokens, b.codeLengthLengths))[0]
}
const trimCodeLengths = (lengths: Uint8Array, minimum: number) => {
  let count = lengths.length
  while (count > minimum && lengths[count - 1] === 0) {
    count--
  }
  return count
}
const writeDynamicHeader = (writer: BitWriter, parsed: ParsedBlock) => {
  const literalLengthCount = trimCodeLengths(parsed.literalLengthLengths, 257)
  const distanceCount = trimCodeLengths(parsed.distanceLengths, 1)
  const codeLengthEncoding = optimizeCodeLengthTokens([
    ...parsed.literalLengthLengths.slice(0, literalLengthCount),
    ...parsed.distanceLengths.slice(0, distanceCount),
  ])
  const {codeLengthLengths, tokens: codeLengthTokens} = codeLengthEncoding
  const codeLengthCoding = getHuffmanCoding(codeLengthLengths)
  let codeLengthCount = 4
  for (let index = 4; index < codeLengthCodeOrder.length; index++) {
    if (codeLengthLengths[codeLengthCodeOrder[index]] !== 0) {
      codeLengthCount = index + 1
    }
  }
  writer.writeBits(literalLengthCount - 257, 5)
  writer.writeBits(distanceCount - 1, 5)
  writer.writeBits(codeLengthCount - 4, 4)
  for (let index = 0; index < codeLengthCount; index++) {
    writer.writeBits(codeLengthLengths[codeLengthCodeOrder[index]], 3)
  }
  for (const token of codeLengthTokens) {
    writeHuffmanSymbol(writer, codeLengthCoding, token.symbol)
    writer.writeBits(token.extraValue, token.extraBits)
  }
}
const writeTokens = (writer: BitWriter, parsed: ParsedBlock) => {
  for (const token of parsed.tokens) {
    if (token.type === 'literal') {
      writeHuffmanSymbol(writer, parsed.literalLengthCoding, token.literal)
      continue
    }
    const lengthSymbol = lengthCodeTable.symbols[token.length]
    writeHuffmanSymbol(writer, parsed.literalLengthCoding, lengthSymbol)
    writer.writeBits(lengthCodeTable.extraValues[token.length], lengthCodeTable.extraBits[token.length])
    const distanceSymbol = distanceCodeTable.symbols[token.distance]
    writeHuffmanSymbol(writer, parsed.distanceCoding, distanceSymbol)
    writer.writeBits(distanceCodeTable.extraValues[token.distance], distanceCodeTable.extraBits[token.distance])
  }
  writeHuffmanSymbol(writer, parsed.literalLengthCoding, endOfBlockSymbol)
}
const getParsedBlockBitLength = (parsed: ParsedBlock, final: boolean) => {
  const writer = new BitWriter
  writer.writeBits(final ? 1 : 0, 1)
  writer.writeBits(2, 2)
  writeDynamicHeader(writer, parsed)
  writeTokens(writer, parsed)
  return writer.bitLength
}
const buildParsedBlock = (tokens: Array<GigapressToken>): ParsedBlock => {
  const frequencies = getFrequencies(tokens)
  const candidates: Array<ParsedBlock> = []
  const addCandidate = (literalLengthFrequencies: Uint32Array, distanceFrequencies: Uint32Array, maxBits: number) => {
    const literalLengthLengths = getCodeLengths(literalLengthFrequencies, maxBits)
    const distanceLengths = getCodeLengths(distanceFrequencies, maxBits)
    candidates.push(makeParsedBlock(tokens, literalLengthLengths, distanceLengths))
  }
  addCandidate(frequencies.literalLength, frequencies.distance, 15)
  const rleLiteralLengthFrequencies = optimizeHuffmanForRle(cloneFrequencies(frequencies.literalLength))
  const rleDistanceFrequencies = optimizeHuffmanForRle(cloneFrequencies(frequencies.distance))
  addCandidate(rleLiteralLengthFrequencies, rleDistanceFrequencies, 15)
  const brotliLiteralLengthFrequencies = optimizeHuffmanForRleBrotli(cloneFrequencies(frequencies.literalLength))
  const brotliDistanceFrequencies = optimizeHuffmanForRleBrotli(cloneFrequencies(frequencies.distance))
  addCandidate(brotliLiteralLengthFrequencies, brotliDistanceFrequencies, 15)
  for (const maxBits of [14, 13, 12, 11, 10, 9]) {
    addCandidate(rleLiteralLengthFrequencies, rleDistanceFrequencies, maxBits)
    addCandidate(brotliLiteralLengthFrequencies, brotliDistanceFrequencies, maxBits)
  }
  return candidates.toSorted((a, b) => getParsedBlockBitLength(a, true) - getParsedBlockBitLength(b, true))[0]
}
const writeDeflateBlock = (writer: BitWriter, tokens: Array<GigapressToken>, final: boolean) => {
  const parsed = buildParsedBlock(tokens)
  writer.writeBits(final ? 1 : 0, 1)
  writer.writeBits(2, 2)
  writeDynamicHeader(writer, parsed)
  writeTokens(writer, parsed)
}
const encodeDeflateBlock = (tokens: Array<GigapressToken>, final: boolean): EncodedBlock => {
  const writer = new BitWriter
  writeDeflateBlock(writer, tokens, final)
  const bitLength = writer.bitLength
  return {
    bitLength,
    bytes: writer.finish(),
    tokens,
  }
}
const encodeDeflateBlocks = (tokenBlocks: Array<Array<GigapressToken>>): EncodedBlock => {
  const writer = new BitWriter
  for (const [index, tokens] of tokenBlocks.entries()) {
    writeDeflateBlock(writer, tokens, index === tokenBlocks.length - 1)
  }
  const bitLength = writer.bitLength
  return {
    bitLength,
    bytes: writer.finish(),
    tokens: tokenBlocks.flat(),
  }
}
const getTokenByteLength = (token: GigapressToken) => {
  return token.type === 'literal' ? 1 : token.length
}
const getTokenBoundaryPositions = (tokens: Array<GigapressToken>) => {
  const positions = [0]
  let position = 0
  for (const token of tokens) {
    position += getTokenByteLength(token)
    positions.push(position)
  }
  return positions
}
const findSplitPoints = (tokens: Array<GigapressToken>, maxBlocks = 4) => {
  const positions = getTokenBoundaryPositions(tokens)
  const tokenCount = tokens.length
  const costCache = new Map<string, number>
  const getCost = (start: number, end: number) => {
    const key = `${start}:${end}`
    const cached = costCache.get(key)
    if (cached !== undefined) {
      return cached
    }
    const cost = getParsedBlockBitLength(buildParsedBlock(tokens.slice(start, end)), false)
    costCache.set(key, cost)
    return cost
  }
  const addNearestCandidate = (candidates: Set<number>, target: number, tokenIndex: number) => {
    while (tokenIndex + 1 < positions.length && positions[tokenIndex + 1] < target) {
      tokenIndex++
    }
    const left = tokenIndex
    const right = Math.min(tokenIndex + 1, tokenCount)
    candidates.add(Math.abs(positions[left] - target) <= Math.abs(positions[right] - target) ? left : right)
    return tokenIndex
  }
  const getCandidates = (start: number, end: number, step: number, center?: number) => {
    const candidates = new Set<number>
    const byteStart = positions[start]
    const byteEnd = positions[end]
    const searchStart = center === undefined ? byteStart + 256 : Math.max(byteStart + 256, center - 512)
    const searchEnd = center === undefined ? byteEnd - 256 : Math.min(byteEnd - 256, center + 512)
    let tokenIndex = start
    for (let target = Math.ceil(searchStart / step) * step; target < searchEnd; target += step) {
      tokenIndex = addNearestCandidate(candidates, target, tokenIndex)
    }
    return candidates
  }
  const getBestSplit = (start: number, end: number, candidates: Set<number>) => {
    const wholeCost = getCost(start, end)
    let bestSplit = -1
    let bestCost = wholeCost
    for (const split of candidates) {
      if (split <= start || split >= end) {
        continue
      }
      const cost = getCost(start, split) + getCost(split, end)
      if (cost < bestCost) {
        bestCost = cost
        bestSplit = split
      }
    }
    return {
      bestCost,
      bestSplit,
      wholeCost,
    }
  }
  const splitRanges = (start: number, end: number, blockBudget: number): Array<number> => {
    if (blockBudget <= 1 || end - start < 16) {
      return []
    }
    const coarse = getBestSplit(start, end, getCandidates(start, end, 256))
    const refined = coarse.bestSplit === -1 ? coarse : getBestSplit(start, end, getCandidates(start, end, 16, positions[coarse.bestSplit]))
    const {bestCost, bestSplit, wholeCost} = refined.bestSplit === -1 || coarse.bestCost < refined.bestCost ? coarse : refined
    if (bestSplit === -1) {
      return []
    }
    const leftWholeCost = getCost(start, bestSplit)
    const rightWholeCost = getCost(bestSplit, end)
    if (leftWholeCost > rightWholeCost) {
      return [...splitRanges(start, bestSplit, blockBudget - 1), bestSplit]
    }
    return [bestSplit, ...splitRanges(bestSplit, end, blockBudget - 1)]
  }
  return splitRanges(0, tokenCount, maxBlocks).toSorted((a, b) => a - b).map(index => positions[index])
}
const parseOptimally = (data: Uint8Array, matches: Array<PositionMatches>, model: CostModel, start = 0, end = data.length) => {
  const costs = new Float64Array(end + 1)
  const bestLength = new Uint16Array(end)
  const bestDistance = new Uint16Array(end)
  costs.fill(Number.POSITIVE_INFINITY)
  costs[end] = 0
  for (let position = end - 1; position >= start; position--) {
    let bestCost = model.literalLength[data[position]] + costs[position + 1]
    bestLength[position] = 1
    const positionMatches = matches[position]
    const maxLength = Math.min(positionMatches.maxLength, end - position)
    for (let length = minMatchLength; length <= maxLength; length++) {
      const distance = positionMatches.distances[length]
      if (distance === 0) {
        continue
      }
      const lengthSymbol = lengthCodeTable.symbols[length]
      const distanceSymbol = distanceCodeTable.symbols[distance]
      const cost = model.literalLength[lengthSymbol] + lengthCodeTable.extraBits[length] + model.distance[distanceSymbol] + distanceCodeTable.extraBits[distance] + costs[position + length]
      if (cost < bestCost) {
        bestCost = cost
        bestLength[position] = length
        bestDistance[position] = distance
      }
    }
    costs[position] = bestCost
  }
  const tokens: Array<GigapressToken> = []
  for (let position = start; position < end;) {
    const length = bestLength[position]
    if (length > 1) {
      tokens.push({
        distance: bestDistance[position],
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
const makeGzip = (data: Uint8Array, deflateBytes: Uint8Array) => {
  const result = new Uint8Array(10 + deflateBytes.length + 8)
  result.set([0x1F, 0x8B, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0x03], 0)
  result.set(deflateBytes, 10)
  const view = new DataView(result.buffer)
  view.setUint32(10 + deflateBytes.length, getCrc32(data), true)
  view.setUint32(14 + deflateBytes.length, data.length >>> 0, true)
  return result
}
const chooseBest = (current: EncodedBlock | undefined, candidate: EncodedBlock) => {
  if (!current || candidate.bytes.length < current.bytes.length || candidate.bytes.length === current.bytes.length && candidate.bitLength < current.bitLength) {
    return candidate
  }
  return current
}
const optimizeTokenRange = (data: Uint8Array, matches: Array<PositionMatches>, iterations: number, start = 0, end = data.length) => {
  const greedyTokens = getGreedyTokens(data, matches, start, end)
  let best = encodeDeflateBlock(greedyTokens, true)
  const fixedTokens = parseOptimally(data, matches, getInitialCostModel(), start, end)
  best = chooseBest(best, encodeDeflateBlock(fixedTokens, true))
  let frequencies = getFrequencies(greedyTokens)
  let bestFrequencies = cloneSymbolFrequencies(frequencies)
  let bestBitLength = best.bitLength
  let lastBitLength = Number.POSITIVE_INFINITY
  let randomized = false
  let stableIterations = 0
  for (let iteration = 0; iteration < iterations; iteration++) {
    const parseModel = getCostModelFromSymbolFrequencies(frequencies)
    const tokens = parseOptimally(data, matches, parseModel, start, end)
    const encoded = encodeDeflateBlock(tokens, true)
    const previousBestLength = best.bytes.length
    best = chooseBest(best, encoded)
    const tokenFrequencies = getFrequencies(tokens)
    if (encoded.bitLength < bestBitLength || encoded.bytes.length < previousBestLength) {
      stableIterations = 0
      bestFrequencies = cloneSymbolFrequencies(tokenFrequencies)
      bestBitLength = Math.min(bestBitLength, encoded.bitLength)
    } else {
      stableIterations++
    }
    if (iteration > 5 && encoded.bitLength === lastBitLength) {
      frequencies = randomizeFrequencies(bestFrequencies, Math.imul(data.length + start + end + iteration, 0x9E_37_79_B9))
      randomized = true
    } else if (randomized) {
      frequencies = addWeightedFrequencies(tokenFrequencies, 1, frequencies, 0.5)
    } else {
      frequencies = tokenFrequencies
    }
    lastBitLength = encoded.bitLength
    if (stableIterations >= 96 && iteration >= 128) {
      break
    }
  }
  return best.tokens
}

export class Gigapress {
  readonly iterations: number

  constructor(options: GigapressOptions = {}) {
    this.iterations = Math.max(1, Math.floor(options.iterations ?? defaultIterations))
  }

  compress(data: Uint8Array) {
    const matches = findMatches(data)
    const tokens = optimizeTokenRange(data, matches, this.iterations)
    let best = encodeDeflateBlock(tokens, true)
    const splitPoints = findSplitPoints(tokens)
    if (splitPoints.length > 0) {
      const rangeStarts = [0, ...splitPoints]
      const rangeEnds = [...splitPoints, data.length]
      const blockTokens = rangeStarts.map((start, index) => optimizeTokenRange(data, matches, this.iterations, start, rangeEnds[index]))
      best = chooseBest(best, encodeDeflateBlocks(blockTokens))
    }
    return makeGzip(data, best.bytes)
  }
}
