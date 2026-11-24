// spec erp-copy-list TASK-3 AC-3906.3: 저장만 하는 zip(zip.ts, 압축 없음)
// - CRC-32는 알려진 값('123456789' → CBF43926, 빈 바이트 0)과 node:zlib crc32(다른 구현)로 견준다
// - zipStore 결과를 이 시험의 작은 읽개로 바이트 그대로 읽어 파일 머리·가운데 목록·끝 머리 수·이름·차례·크기·CRC·압축 방식 0을 본다
// - 저장소의 xlsx 0.20.3 CFB(zip 읽개, 시험에서만 씀)로도 다시 읽어 같은 바이트가 나오는지 본다
import { crc32 as zlibCrc32 } from 'node:zlib'
import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'

// zip.ts가 없을 때 파일 전체가 아니라 그 시험만 실패하게 시험 안에서 불러온다
const load = () => import('./zip')

const utf8 = (text: string) => new TextEncoder().encode(text)

/** 이 시험의 바이트 무늬(0~255를 여러 번, 길이마다 다른 값) */
function pattern(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length)
  let x = seed >>> 0
  for (let i = 0; i < length; i += 1) {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0
    out[i] = (x >>> 16) & 0xff
  }
  return out
}

const LOCAL_SIG = 0x04034b50
const CENTRAL_SIG = 0x02014b50
const END_SIG = 0x06054b50

type Entry = {
  name: string
  flags: number
  method: number
  time: number
  date: number
  crc: number
  compressed: number
  size: number
  extra: number
}
type Local = Entry & { offset: number; data: Uint8Array }
type Central = Entry & { comment: number; disk: number; localOffset: number; external: number }
type End = { offset: number; disk: number; cdDisk: number; diskEntries: number; entries: number; cdSize: number; cdOffset: number; comment: number }

/** zip 바이트를 머리마다 그대로 읽는다(이 시험의 읽개, zip.ts와 따로 썼다) */
function readZip(bytes: Uint8Array): { locals: Local[]; centrals: Central[]; end: End; localSigs: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const u16 = (at: number) => view.getUint16(at, true)
  const u32 = (at: number) => view.getUint32(at, true)
  const text = (at: number, length: number) => new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(at, at + length))

  // 끝 머리: 설명 글이 없으므로 맨 끝 22바이트
  const endAt = bytes.length - 22
  expect(endAt).toBeGreaterThanOrEqual(0)
  expect(u32(endAt)).toBe(END_SIG)
  const end: End = {
    offset: endAt,
    disk: u16(endAt + 4),
    cdDisk: u16(endAt + 6),
    diskEntries: u16(endAt + 8),
    entries: u16(endAt + 10),
    cdSize: u32(endAt + 12),
    cdOffset: u32(endAt + 16),
    comment: u16(endAt + 20),
  }

  const centrals: Central[] = []
  let at = end.cdOffset
  while (at < end.cdOffset + end.cdSize) {
    expect(u32(at)).toBe(CENTRAL_SIG)
    const nameLength = u16(at + 28)
    const extra = u16(at + 30)
    const comment = u16(at + 32)
    centrals.push({
      flags: u16(at + 8),
      method: u16(at + 10),
      time: u16(at + 12),
      date: u16(at + 14),
      crc: u32(at + 16),
      compressed: u32(at + 20),
      size: u32(at + 24),
      extra,
      comment,
      disk: u16(at + 34),
      external: u32(at + 38),
      localOffset: u32(at + 42),
      name: text(at + 46, nameLength),
    })
    at += 46 + nameLength + extra + comment
  }
  expect(at).toBe(end.cdOffset + end.cdSize)

  // 파일 머리는 앞에서부터 차례로 붙어 있다
  const locals: Local[] = []
  at = 0
  while (at < end.cdOffset) {
    expect(u32(at)).toBe(LOCAL_SIG)
    const nameLength = u16(at + 26)
    const extra = u16(at + 28)
    const compressed = u32(at + 18)
    const dataAt = at + 30 + nameLength + extra
    locals.push({
      offset: at,
      flags: u16(at + 6),
      method: u16(at + 8),
      time: u16(at + 10),
      date: u16(at + 12),
      crc: u32(at + 14),
      compressed,
      size: u32(at + 22),
      extra,
      name: text(at + 30, nameLength),
      data: bytes.slice(dataAt, dataAt + compressed),
    })
    at = dataAt + compressed
  }
  expect(at).toBe(end.cdOffset)

  // 바이트 안 어디서든 파일 머리 서명 수(이름·자료에 우연히 같은 바이트가 없게 시험 자료를 골랐다)
  let localSigs = 0
  for (let i = 0; i + 4 <= bytes.length; i += 1) if (u32(i) === LOCAL_SIG) localSigs += 1
  return { locals, centrals, end, localSigs }
}

const ENTRIES = [
  { name: '[Content_Types].xml', data: utf8('<?xml version="1.0"?><Types/>') },
  { name: '_rels/.rels', data: utf8('<Relationships/>') },
  { name: 'empty.bin', data: new Uint8Array(0) },
  { name: 'xl/worksheets/sheet1.xml', data: utf8('<worksheet>가나다 &amp; 350000</worksheet>') },
  { name: 'bytes/all.bin', data: Uint8Array.from({ length: 256 }, (_, i) => i).filter((b) => b !== 0x50) },
]
// 이 PC 시각(TZ=Asia/Seoul) 2026-11-24 13:45:31 → DOS 초는 2초 단위라 30
const WHEN = new Date(2026, 10, 24, 13, 45, 31)
const DOS_TIME = (13 << 11) | (45 << 5) | (30 >> 1)
const DOS_DATE = ((2026 - 1980) << 9) | (11 << 5) | 24

describe('AC-3906.3 crc32', () => {
  it("AC-3906.3: crc32('123456789') = 0xCBF43926이고 빈 바이트는 0이다", async () => {
    const { crc32 } = await load()
    expect(crc32(utf8('123456789'))).toBe(0xcbf43926)
    expect(crc32(new Uint8Array(0))).toBe(0)
  })

  it('AC-3906.3: crc32는 부호 없는 32비트 수이고 node:zlib crc32와 같다(여러 길이·모든 바이트 값·한글 UTF-8)', async () => {
    const { crc32 } = await load()
    const samples = [
      new Uint8Array([0]),
      new Uint8Array([0xff]),
      Uint8Array.from({ length: 256 }, (_, i) => i),
      pattern(1, 1),
      pattern(1000, 7),
      pattern(70_000, 42),
      utf8('ERP 마감일지 입력 목록 &<>"\''),
    ]
    for (const bytes of samples) {
      const got = crc32(bytes)
      expect(Number.isInteger(got) && got >= 0 && got <= 0xffffffff, `길이 ${bytes.length}`).toBe(true)
      expect(got, `길이 ${bytes.length}`).toBe(zlibCrc32(bytes))
    }
  })

  it('AC-3906.3: crc32는 받은 바이트를 고치지 않고, Uint8Array 조각(subarray)도 그 조각만 센다', async () => {
    const { crc32 } = await load()
    const whole = utf8('xx123456789yy')
    const copy = whole.slice()
    expect(crc32(whole.subarray(2, 11))).toBe(0xcbf43926)
    expect(whole).toEqual(copy)
  })
})

describe('AC-3906.3 zipStore: 저장만 하는 zip', () => {
  it('AC-3906.3: 첫 4바이트는 파일 머리 서명 PK\\x03\\x04이고 파일 머리·가운데 목록·끝 머리 수가 넣은 수와 같다', async () => {
    const { zipStore } = await load()
    const bytes = zipStore(ENTRIES, WHEN)
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect([...bytes.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04])
    const zip = readZip(bytes)
    expect(zip.locals).toHaveLength(ENTRIES.length)
    expect(zip.localSigs).toBe(ENTRIES.length)
    expect(zip.centrals).toHaveLength(ENTRIES.length)
    expect(zip.end).toMatchObject({ disk: 0, cdDisk: 0, diskEntries: ENTRIES.length, entries: ENTRIES.length, comment: 0 })
    // 끝 머리 바로 앞이 가운데 목록이다
    expect(zip.end.cdOffset + zip.end.cdSize).toBe(zip.end.offset)
  })

  it('AC-3906.3: 이름·차례·크기·CRC가 넣은 것과 같고 압축 방식은 0(저장만)이며 자료는 넣은 바이트 그대로다', async () => {
    const { zipStore } = await load()
    const zip = readZip(zipStore(ENTRIES, WHEN))
    expect(zip.locals.map((e) => e.name)).toEqual(ENTRIES.map((e) => e.name))
    expect(zip.centrals.map((e) => e.name)).toEqual(ENTRIES.map((e) => e.name))
    ENTRIES.forEach((entry, i) => {
      const local = zip.locals[i]
      const central = zip.centrals[i]
      const expected = {
        name: entry.name,
        method: 0,
        crc: zlibCrc32(entry.data),
        compressed: entry.data.length,
        size: entry.data.length,
        time: DOS_TIME,
        date: DOS_DATE,
      }
      expect(local, entry.name).toMatchObject(expected)
      expect(central, entry.name).toMatchObject(expected)
      // 이름은 ASCII라 UTF-8 표시(0x0800)·데이터 설명자(0x0008) 없이 같은 표시
      expect(local.flags & 0x0808, entry.name).toBe(0)
      expect(central.flags, entry.name).toBe(local.flags)
      expect(central.localOffset, entry.name).toBe(local.offset)
      expect(central.disk, entry.name).toBe(0)
      expect(local.data, entry.name).toEqual(entry.data)
    })
  })

  it('AC-3906.3: 파일 시각은 when의 이 PC 날짜·시각을 DOS 꼴로 적는다(초는 2초 단위)', async () => {
    const { zipStore } = await load()
    const zip = readZip(zipStore([{ name: 'a.txt', data: utf8('a') }], new Date(2027, 0, 2, 3, 4, 58)))
    expect(zip.locals[0].time).toBe((3 << 11) | (4 << 5) | (58 >> 1))
    expect(zip.locals[0].date).toBe(((2027 - 1980) << 9) | (1 << 5) | 2)
  })

  it('AC-3906.3: 저장소 xlsx 0.20.3 CFB(zip 읽개)로 다시 읽으면 같은 이름에 같은 바이트가 나온다', async () => {
    const { zipStore } = await load()
    const cfb = XLSX.CFB.read(zipStore(ENTRIES, WHEN), { type: 'array' })
    for (const entry of ENTRIES) {
      const found = XLSX.CFB.find(cfb, `/${entry.name}`)
      expect(found, entry.name).toBeTruthy()
      expect(Uint8Array.from(found?.content ?? []), entry.name).toEqual(entry.data)
    }
  })

  it('AC-3906.3: 넣을 것이 없으면 끝 머리 하나(22바이트, 0개)만 나온다', async () => {
    const { zipStore } = await load()
    const bytes = zipStore([], WHEN)
    expect(bytes).toHaveLength(22)
    expect(readZip(bytes).end).toMatchObject({ entries: 0, diskEntries: 0, cdSize: 0, cdOffset: 0 })
  })

  it('AC-3906.3: 받은 자료 배열·바이트를 고치지 않는다', async () => {
    const { zipStore } = await load()
    const entries = ENTRIES.map((e) => ({ name: e.name, data: e.data.slice() }))
    zipStore(entries, WHEN)
    expect(entries).toEqual(ENTRIES)
  })

  it('AC-3906.3: 이름이 ASCII가 아니거나 비었으면 던진다(이름은 ASCII만)', async () => {
    const { zipStore } = await load()
    expect(() => zipStore([{ name: '시트.xml', data: utf8('a') }], WHEN)).toThrow()
    expect(() => zipStore([{ name: '', data: utf8('a') }], WHEN)).toThrow()
  })
})
