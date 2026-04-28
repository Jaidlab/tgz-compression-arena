import type {BitWriter} from './BitWriter.ts'

export type HuffmanCoding = {
  codes: Uint16Array
  lengths: Uint8Array
}

type KatajainenLeaf = {
  count: number
  weight: number
}

type KatajainenList = {
  lookahead0: number
  lookahead1: number
}

type KatajainenNode = {
  count: number
  tail: number
  weight: number
}

const reverseBits = (value: number, bitCount: number) => {
  let result = 0
  let remainingValue = value
  for (let index = 0; index < bitCount; index++) {
    result = result << 1 | remainingValue & 1
    remainingValue >>>= 1
  }
  return result
}
const noTail = -1
const boundaryPackageMerge = (nodes: Array<KatajainenNode>, leaves: Array<KatajainenLeaf>, lists: Array<KatajainenList>, index: number) => {
  const lastCount = nodes[lists[index].lookahead1].count
  if (index === 0 && lastCount >= leaves.length) {
    return
  }
  lists[index].lookahead0 = lists[index].lookahead1
  if (index === 0) {
    lists[index].lookahead1 = nodes.push({
      count: lastCount + 1,
      tail: nodes[lists[index].lookahead0].tail,
      weight: leaves[lastCount].weight,
    }) - 1
    return
  }
  const previousList = lists[index - 1]
  const weightSum = nodes[previousList.lookahead0].weight + nodes[previousList.lookahead1].weight
  if (lastCount < leaves.length && weightSum > leaves[lastCount].weight) {
    lists[index].lookahead1 = nodes.push({
      count: lastCount + 1,
      tail: nodes[lists[index].lookahead0].tail,
      weight: leaves[lastCount].weight,
    }) - 1
    return
  }
  lists[index].lookahead1 = nodes.push({
    count: lastCount,
    tail: previousList.lookahead1,
    weight: weightSum,
  }) - 1
  boundaryPackageMerge(nodes, leaves, lists, index - 1)
  boundaryPackageMerge(nodes, leaves, lists, index - 1)
}
const boundaryPackageMergeFinal = (nodes: Array<KatajainenNode>, leaves: Array<KatajainenLeaf>, lists: Array<KatajainenList>, index: number) => {
  const lastCount = nodes[lists[index].lookahead1].count
  const previousList = lists[index - 1]
  const weightSum = nodes[previousList.lookahead0].weight + nodes[previousList.lookahead1].weight
  if (lastCount < leaves.length && weightSum > leaves[lastCount].weight) {
    lists[index].lookahead1 = nodes.push({
      count: lastCount + 1,
      tail: nodes[lists[index].lookahead1].tail,
      weight: 0,
    }) - 1
    return
  }
  nodes[lists[index].lookahead1].tail = previousList.lookahead1
}

export const getCodeLengths = (frequencies: ArrayLike<number>, maxBits: number) => {
  const lengths = new Uint8Array(frequencies.length)
  const leaves: Array<KatajainenLeaf> = []
  for (const symbol of Array.from({length: frequencies.length}, (_, index) => index)) {
    const frequency = frequencies[symbol]
    if (frequency <= 0) {
      continue
    }
    leaves.push({
      count: symbol,
      weight: frequency,
    })
  }
  if (leaves.length === 0) {
    return lengths
  }
  if (leaves.length <= 2) {
    for (const leaf of leaves) {
      lengths[leaf.count] = 1
    }
    return lengths
  }
  leaves.sort((a, b) => a.weight - b.weight || a.count - b.count)
  const effectiveMaxBits = Math.min(leaves.length - 1, maxBits)
  const nodes: Array<KatajainenNode> = [
    {
      count: 1,
      tail: noTail,
      weight: leaves[0].weight,
    },
    {
      count: 2,
      tail: noTail,
      weight: leaves[1].weight,
    },
  ]
  const lists = Array.from({length: effectiveMaxBits}, () => ({
    lookahead0: 0,
    lookahead1: 1,
  }))
  for (let run = 0; run < 2 * leaves.length - 5; run++) {
    boundaryPackageMerge(nodes, leaves, lists, effectiveMaxBits - 1)
  }
  boundaryPackageMergeFinal(nodes, leaves, lists, effectiveMaxBits - 1)
  const counts = new Uint16Array(16)
  let end = 16
  let nodeIndex = lists[effectiveMaxBits - 1].lookahead1
  end--
  counts[end] = nodes[nodeIndex].count
  for (let tail = nodes[nodeIndex].tail; tail !== noTail; tail = nodes[nodeIndex].tail) {
    end--
    nodeIndex = tail
    counts[end] = nodes[nodeIndex].count
  }
  let value = 1
  let leafIndex = counts[15]
  for (let pointer = 15; pointer >= end; pointer--) {
    while (leafIndex > counts[pointer - 1]) {
      lengths[leaves[leafIndex - 1].count] = value
      leafIndex--
    }
    value++
  }
  return lengths
}

export const getHuffmanCoding = (lengths: Uint8Array): HuffmanCoding => {
  const maxBits = Math.max(...lengths)
  const bitCounts = new Uint16Array(maxBits + 1)
  for (const length of lengths) {
    if (length > 0) {
      bitCounts[length]++
    }
  }
  const nextCodes = new Uint16Array(maxBits + 1)
  let code = 0
  for (let bits = 1; bits <= maxBits; bits++) {
    code = code + bitCounts[bits - 1] << 1
    nextCodes[bits] = code
  }
  const codes = new Uint16Array(lengths.length)
  for (const symbol of Array.from({length: lengths.length}, (_, index) => index)) {
    const length = lengths[symbol]
    if (length === 0) {
      continue
    }
    codes[symbol] = reverseBits(nextCodes[length], length)
    nextCodes[length]++
  }
  return {
    codes,
    lengths,
  }
}

export const writeHuffmanSymbol = (writer: BitWriter, coding: HuffmanCoding, symbol: number) => {
  const length = coding.lengths[symbol]
  if (length === 0) {
    throw new Error(`Cannot write Huffman symbol ${symbol} with zero code length`)
  }
  writer.writeBits(coding.codes[symbol], length)
}
