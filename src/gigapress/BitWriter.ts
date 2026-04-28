export class BitWriter {
  private bitBuffer = 0
  private bitCount = 0
  private bytes: Array<number> = []

  get bitLength() {
    return this.bytes.length * 8 + this.bitCount
  }

  finish() {
    if (this.bitCount > 0) {
      this.bytes.push(this.bitBuffer)
      this.bitBuffer = 0
      this.bitCount = 0
    }
    return Uint8Array.from(this.bytes)
  }

  writeBits(value: number, count: number) {
    let remainingValue = value
    for (let index = 0; index < count; index++) {
      this.bitBuffer |= (remainingValue & 1) << this.bitCount
      remainingValue >>>= 1
      this.bitCount++
      if (this.bitCount === 8) {
        this.bytes.push(this.bitBuffer)
        this.bitBuffer = 0
        this.bitCount = 0
      }
    }
  }
}
