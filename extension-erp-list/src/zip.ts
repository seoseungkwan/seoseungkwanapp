// 저장만 하는 zip(압축 없음) — spec erp-copy-list design.md 5절, AC-3906.3
// - [엑셀로 받기] xlsx 파일을 묶는 데만 쓴다. 남의 묶음 코드를 싣지 않으려고 직접 쓴다(design.md 결정 3)
// - 머리 셋(파일 머리 · 가운데 목록 · 끝 머리)만 쓰고, 압축 방식은 0(저장만), 이름은 ASCII만, 데이터 설명자·zip64는 쓰지 않는다
// - 숫자는 모두 작은 끝(little-endian)이다

/** CRC-32(IEEE, 다항식 0xEDB88320) 표 */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

/** CRC-32. '123456789' → 0xCBF43926, 빈 바이트 → 0. 부호 없는 32비트 수 */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const LOCAL_SIG = 0x04034b50
const CENTRAL_SIG = 0x02014b50
const END_SIG = 0x06054b50
/** 풀 때 필요한 판(2.0) */
const VERSION = 20
const LOCAL_SIZE = 30
const CENTRAL_SIZE = 46
const END_SIZE = 22

/** 이 PC 날짜·시각 → DOS 날짜·시각(초는 2초 단위, 1980년 앞은 1980-01-01 00:00) */
function dosTime(when: Date): { time: number; date: number } {
  const year = when.getFullYear()
  if (year < 1980) return { time: 0, date: (1 << 5) | 1 }
  return {
    time: (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1),
    date: ((Math.min(year, 2107) - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate(),
  }
}

/** 이름 → ASCII 바이트. 비었거나 ASCII(0x20~0x7E) 밖 글자가 있으면 throw */
function asciiName(name: string): Uint8Array {
  if (name === '') throw new Error('zip 안 파일 이름이 비었다')
  const out = new Uint8Array(name.length)
  for (let i = 0; i < name.length; i += 1) {
    const c = name.charCodeAt(i)
    if (c < 0x20 || c > 0x7e) throw new Error(`zip 안 파일 이름은 ASCII만 쓴다: ${name}`)
    out[i] = c
  }
  return out
}

/**
 * 저장만 하는 zip 바이트. entries 차례 그대로 넣는다. 이름은 ASCII만. when = 파일 시각(DOS 날짜·시각, 이 PC 시각).
 * 받은 배열·바이트는 고치지 않는다
 */
export function zipStore(entries: readonly { name: string; data: Uint8Array }[], when: Date): Uint8Array {
  if (entries.length > 0xffff) throw new Error('zip 안 파일이 너무 많다')
  const { time, date } = dosTime(when)
  const files = entries.map((entry) => ({ name: asciiName(entry.name), data: entry.data, crc: crc32(entry.data) }))

  const localTotal = files.reduce((sum, f) => sum + LOCAL_SIZE + f.name.length + f.data.length, 0)
  const centralTotal = files.reduce((sum, f) => sum + CENTRAL_SIZE + f.name.length, 0)
  if (localTotal + centralTotal + END_SIZE > 0xffffffff) throw new Error('zip 파일이 너무 크다')

  const out = new Uint8Array(localTotal + centralTotal + END_SIZE)
  const view = new DataView(out.buffer)
  const u16 = (at: number, value: number) => view.setUint16(at, value, true)
  const u32 = (at: number, value: number) => view.setUint32(at, value >>> 0, true)

  const offsets: number[] = []
  let at = 0
  for (const f of files) {
    offsets.push(at)
    u32(at, LOCAL_SIG)
    u16(at + 4, VERSION)
    u16(at + 6, 0) // 표시 없음(이름 ASCII, 데이터 설명자 없음)
    u16(at + 8, 0) // 저장만
    u16(at + 10, time)
    u16(at + 12, date)
    u32(at + 14, f.crc)
    u32(at + 18, f.data.length)
    u32(at + 22, f.data.length)
    u16(at + 26, f.name.length)
    u16(at + 28, 0)
    out.set(f.name, at + LOCAL_SIZE)
    out.set(f.data, at + LOCAL_SIZE + f.name.length)
    at += LOCAL_SIZE + f.name.length + f.data.length
  }

  const centralAt = at
  files.forEach((f, i) => {
    u32(at, CENTRAL_SIG)
    u16(at + 4, VERSION) // 만든 판
    u16(at + 6, VERSION) // 풀 때 필요한 판
    u16(at + 8, 0)
    u16(at + 10, 0)
    u16(at + 12, time)
    u16(at + 14, date)
    u32(at + 16, f.crc)
    u32(at + 20, f.data.length)
    u32(at + 24, f.data.length)
    u16(at + 28, f.name.length)
    u16(at + 30, 0) // 덧붙임 없음
    u16(at + 32, 0) // 설명 없음
    u16(at + 34, 0) // 첫 디스크
    u16(at + 36, 0) // 안쪽 속성
    u32(at + 38, 0) // 바깥 속성
    u32(at + 42, offsets[i])
    out.set(f.name, at + CENTRAL_SIZE)
    at += CENTRAL_SIZE + f.name.length
  })

  u32(at, END_SIG)
  u16(at + 4, 0)
  u16(at + 6, 0)
  u16(at + 8, files.length)
  u16(at + 10, files.length)
  u32(at + 12, at - centralAt)
  u32(at + 16, centralAt)
  u16(at + 20, 0)
  return out
}
