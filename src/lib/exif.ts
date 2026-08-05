/** Best-effort JPEG EXIF date reader — no dependency, reads only the header
 * bytes needed to find DateTimeOriginal/DateTime. Returns null for
 * non-JPEGs, missing EXIF, or anything unexpected. */
export async function readExifDate(file: File): Promise<string | null> {
  try {
    const buffer = await file.slice(0, 128 * 1024).arrayBuffer()
    const view = new DataView(buffer)
    if (view.getUint16(0) !== 0xffd8) return null

    let offset = 2
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset)
      if ((marker & 0xff00) !== 0xff00) break
      if (marker === 0xffe1) {
        const segLength = view.getUint16(offset + 2)
        const segStart = offset + 4
        if (segStart + 6 <= view.byteLength && view.getUint32(segStart) === 0x45786966) {
          return parseExifTiff(view, segStart + 6)
        }
        offset += 2 + segLength
      } else if (marker === 0xffd8 || marker === 0xffd9) {
        offset += 2
      } else {
        const segLength = view.getUint16(offset + 2)
        offset += 2 + segLength
      }
    }
  } catch {
    // ignore malformed files, just fall through to null
  }
  return null
}

function parseExifTiff(view: DataView, tiffStart: number): string | null {
  const byteOrder = view.getUint16(tiffStart)
  const little = byteOrder === 0x4949
  if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) return null
  const get16 = (o: number) => view.getUint16(o, little)
  const get32 = (o: number) => view.getUint32(o, little)
  if (get16(tiffStart + 2) !== 0x002a) return null

  function readDateFromIfd(ifdOffset: number): string | null {
    if (ifdOffset + 2 > view.byteLength) return null
    const count = get16(ifdOffset)
    let exifIfdOffset: number | null = null
    for (let i = 0; i < count; i++) {
      const entryOffset = ifdOffset + 2 + i * 12
      if (entryOffset + 12 > view.byteLength) break
      const tag = get16(entryOffset)
      if (tag === 0x9003 || tag === 0x0132) {
        const valueCount = get32(entryOffset + 4)
        const valueOffset = valueCount > 4 ? tiffStart + get32(entryOffset + 8) : entryOffset + 8
        if (valueOffset + 10 > view.byteLength) continue
        let str = ''
        for (let j = 0; j < 10; j++) str += String.fromCharCode(view.getUint8(valueOffset + j))
        const m = str.match(/^(\d{4}):(\d{2}):(\d{2})/)
        if (m) return `${m[1]}-${m[2]}-${m[3]}`
      }
      if (tag === 0x8769) exifIfdOffset = tiffStart + get32(entryOffset + 8)
    }
    if (exifIfdOffset !== null) return readDateFromIfd(exifIfdOffset)
    return null
  }

  return readDateFromIfd(tiffStart + get32(tiffStart + 4))
}
