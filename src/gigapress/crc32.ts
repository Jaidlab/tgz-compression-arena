const makeCrc32Table = () => {
  const table = new Uint32Array(256)
  for (let value = 0; value < table.length; value++) {
    let crc = value
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? 0xED_B8_83_20 ^ crc >>> 1 : crc >>> 1
    }
    table[value] = crc >>> 0
  }
  return table
}
const crc32Table = makeCrc32Table()

export const getCrc32 = (data: Uint8Array) => {
  let crc = 0xFF_FF_FF_FF
  for (const byte of data) {
    crc = crc32Table[(crc ^ byte) & 0xFF] ^ crc >>> 8
  }
  return (crc ^ 0xFF_FF_FF_FF) >>> 0
}
