// 저장만 하는 zip(압축 없음) — design.md 7-2 (spec erp-uisarang TASK-6).
// erp-copy-list zip.ts와 같은 이름·모양(crc32 · zipStore)이라 합칠 때 한 벌로 줄인다. 다른 모듈을 import하지 않는다.
// 파일 머리·가운데 목록·끝 머리만 쓰는 가장 작은 꼴(zip64·데이터 설명·암호 없음). 파일 하나 4GB·65,535개 안

let table: Uint32Array | undefined

function crcTable(): Uint32Array {
  if (table) return table
  table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
}

/** CRC-32(zip·PNG가 쓰는 IEEE 802.3 꼴). 부호 없는 32비트 수 */
export function crc32(bytes: Uint8Array): number {
  const t = crcTable()
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** when(이 PC 시각)을 DOS 날짜·시각으로. 초는 2초 단위, 1980년 앞은 1980-01-01 00:00:00, 2107년 뒤는 2107-12-31 23:59:58 */
function dosTime(when: Date): { time: number; date: number } {
  const year = when.getFullYear()
  if (year < 1980) return { time: 0, date: (1 << 5) | 1 }
  if (year > 2107) return { time: (23 << 11) | (59 << 5) | 29, date: (127 << 9) | (12 << 5) | 31 }
  return {
    time: (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate(),
  }
}

/** 이름은 ASCII만(빈 이름 안 됨). 글자 칸 하나가 바이트 하나 */
function nameBytes(name: string): Uint8Array {
  if (name.length === 0 || name.length > 0xffff || !/^[\x20-\x7e]+$/.test(name)) {
    throw new RangeError('zip 파일 이름은 ASCII 글자만 쓴다')
  }
  const out = new Uint8Array(name.length)
  for (let i = 0; i < name.length; i++) out[i] = name.charCodeAt(i)
  return out
}

const VERSION = 20 // 2.0 — 폴더 이름·저장만 하는 파일을 읽는 가장 흔한 판

/** 압축 없는 zip 한 파일. 넣은 차례 그대로, 파일 시각은 모두 when(DOS 날짜·시각) */
export function zipStore(entries: readonly { name: string; data: Uint8Array }[], when: Date): Uint8Array {
  if (entries.length > 0xffff) throw new RangeError('zip 파일은 65,535개까지 넣는다')
  const { time, date } = dosTime(when)
  const items = entries.map((e) => ({ name: nameBytes(e.name), data: e.data, crc: crc32(e.data), offset: 0 }))

  let localSize = 0
  let centralSize = 0
  for (const it of items) {
    it.offset = localSize
    localSize += 30 + it.name.length + it.data.length
    centralSize += 46 + it.name.length
  }
  if (localSize + centralSize > 0xffffffff) throw new RangeError('zip 파일은 4GB 안이어야 한다')

  const out = new Uint8Array(localSize + centralSize + 22)
  const view = new DataView(out.buffer)
  let at = 0
  const u16 = (v: number) => {
    view.setUint16(at, v, true)
    at += 2
  }
  const u32 = (v: number) => {
    view.setUint32(at, v, true)
    at += 4
  }
  const put = (bytes: Uint8Array) => {
    out.set(bytes, at)
    at += bytes.length
  }

  for (const it of items) {
    u32(0x04034b50) // 파일 머리 서명 PK\x03\x04
    u16(VERSION) // 풀 때 필요한 판
    u16(0) // 표시(이름 ASCII · 데이터 설명 없음)
    u16(0) // 압축 방식 0 = 저장만
    u16(time)
    u16(date)
    u32(it.crc)
    u32(it.data.length) // 압축한 크기 = 원래 크기
    u32(it.data.length)
    u16(it.name.length)
    u16(0) // 덧붙임 길이
    put(it.name)
    put(it.data)
  }

  const centralStart = at
  for (const it of items) {
    u32(0x02014b50) // 가운데 목록 서명 PK\x01\x02
    u16(VERSION) // 만든 판
    u16(VERSION) // 풀 때 필요한 판
    u16(0)
    u16(0)
    u16(time)
    u16(date)
    u32(it.crc)
    u32(it.data.length)
    u32(it.data.length)
    u16(it.name.length)
    u16(0) // 덧붙임 길이
    u16(0) // 설명 길이
    u16(0) // 시작 디스크
    u16(0) // 안쪽 속성
    u32(0) // 바깥 속성
    u32(it.offset) // 파일 머리 자리
    put(it.name)
  }

  u32(0x06054b50) // 끝 머리 서명 PK\x05\x06
  u16(0) // 이 디스크 번호
  u16(0) // 가운데 목록이 시작하는 디스크
  u16(items.length) // 이 디스크의 파일 수
  u16(items.length) // 모든 파일 수
  u32(centralSize)
  u32(centralStart)
  u16(0) // 설명 길이
  return out
}
