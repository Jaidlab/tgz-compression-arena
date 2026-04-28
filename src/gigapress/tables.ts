export const codeLengthCodeOrder = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15] as const

export const lengthBases = [
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  13,
  15,
  17,
  19,
  23,
  27,
  31,
  35,
  43,
  51,
  59,
  67,
  83,
  99,
  115,
  131,
  163,
  195,
  227,
  258,
] as const

export const lengthExtraBits = [
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  1,
  2,
  2,
  2,
  2,
  3,
  3,
  3,
  3,
  4,
  4,
  4,
  4,
  5,
  5,
  5,
  5,
  0,
] as const

export const distanceBases = [
  1,
  2,
  3,
  4,
  5,
  7,
  9,
  13,
  17,
  25,
  33,
  49,
  65,
  97,
  129,
  193,
  257,
  385,
  513,
  769,
  1025,
  1537,
  2049,
  3073,
  4097,
  6145,
  8193,
  12_289,
  16_385,
  24_577,
] as const

export const distanceExtraBits = [
  0,
  0,
  0,
  0,
  1,
  1,
  2,
  2,
  3,
  3,
  4,
  4,
  5,
  5,
  6,
  6,
  7,
  7,
  8,
  8,
  9,
  9,
  10,
  10,
  11,
  11,
  12,
  12,
  13,
  13,
] as const

const makeLengthCodeTable = () => {
  const symbols = new Uint16Array(259)
  const extraValues = new Uint16Array(259)
  const extraBits = new Uint8Array(259)
  for (const [index, lengthBase] of lengthBases.entries()) {
    const base = lengthBase
    const bits = lengthExtraBits[index]
    const count = 1 << bits
    for (let offset = 0; offset < count && base + offset <= 258; offset++) {
      const length = base + offset
      symbols[length] = 257 + index
      extraValues[length] = offset
      extraBits[length] = bits
    }
  }
  return {
    extraBits,
    extraValues,
    symbols,
  }
}
const makeDistanceCodeTable = () => {
  const symbols = new Uint8Array(32_769)
  const extraValues = new Uint16Array(32_769)
  const extraBits = new Uint8Array(32_769)
  for (const [symbol, distanceBase] of distanceBases.entries()) {
    const base = distanceBase
    const bits = distanceExtraBits[symbol]
    const count = 1 << bits
    for (let offset = 0; offset < count && base + offset <= 32_768; offset++) {
      const distance = base + offset
      symbols[distance] = symbol
      extraValues[distance] = offset
      extraBits[distance] = bits
    }
  }
  return {
    extraBits,
    extraValues,
    symbols,
  }
}

export const lengthCodeTable = makeLengthCodeTable()
export const distanceCodeTable = makeDistanceCodeTable()
