// TASK-6 (spec erp-uisarang) design.md 7-2: 저장만 하는 zip(zip.ts).
// erp-copy-list zip.ts와 같은 이름·모양(crc32 · zipStore). 머리는 이 시험이 바이트를 직접 읽어 보고,
// 저장소의 SheetJS `xlsx` 0.20.3 zip 읽개(CFB)로도 한 번 더 연다(시험에서만 씀, dist에 안 실림)
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

const SRC = path.dirname(fileURLToPath(import.meta.url))

// zip.ts가 없을 때 파일 전체가 아니라 그 시험만 실패하게 시험 안에서 불러온다
const loadZip = () => import('./zip')

const ascii = (s: string) => new TextEncoder().encode(s)

const LOCAL = 0x04034b50
const CENTRAL = 0x02014b50
const END = 0x06054b50

type Local = { offset: number; flags: number; method: number; time: number; date: number; crc: number; csize: number; usize: number; name: string; data: Uint8Array }
type Central = { flags: number; method: number; time: number; date: number; crc: number; csize: number; usize: number; name: string; extraLen: number; commentLen: number; disk: number; offset: number }

/** zip 바이트를 머리마다 읽는다(압축 없음만) */
function parseZip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const u16 = (at: number) => view.getUint16(at, true)
  const u32 = (at: number) => view.getUint32(at, true)
  const text = (at: number, len: number) => new TextDecoder().decode(bytes.subarray(at, at + len))

  const locals: Local[] = []
  let at = 0
  while (at + 4 <= bytes.length && u32(at) === LOCAL) {
    const nameLen = u16(at + 26)
    const extraLen = u16(at + 28)
    const csize = u32(at + 18)
    const start = at + 30 + nameLen + extraLen
    locals.push({
      offset: at,
      flags: u16(at + 6),
      method: u16(at + 8),
      time: u16(at + 10),
      date: u16(at + 12),
      crc: u32(at + 14),
      csize,
      usize: u32(at + 22),
      name: text(at + 30, nameLen),
      data: bytes.slice(start, start + csize),
    })
    at = start + csize
  }

  const centralStart = at
  const centrals: Central[] = []
  while (at + 4 <= bytes.length && u32(at) === CENTRAL) {
    const nameLen = u16(at + 28)
    const extraLen = u16(at + 30)
    const commentLen = u16(at + 32)
    centrals.push({
      flags: u16(at + 8),
      method: u16(at + 10),
      time: u16(at + 12),
      date: u16(at + 14),
      crc: u32(at + 16),
      csize: u32(at + 20),
      usize: u32(at + 24),
      name: text(at + 46, nameLen),
      extraLen,
      commentLen,
      disk: u16(at + 34),
      offset: u32(at + 42),
    })
    at += 46 + nameLen + extraLen + commentLen
  }
  const centralSize = at - centralStart

  expect(u32(at), '끝 머리 서명').toBe(END)
  const end = {
    at,
    disk: u16(at + 4),
    centralDisk: u16(at + 6),
    onDisk: u16(at + 8),
    total: u16(at + 10),
    centralSize: u32(at + 12),
    centralOffset: u32(at + 16),
    commentLen: u16(at + 20),
  }
  return { locals, centrals, centralStart, centralSize, end }
}

describe('AC-4213.2 crc32', () => {
  it('AC-4213.2: 알려진 값 — "123456789" = 0xCBF43926, 빈 바이트 = 0', async () => {
    const { crc32 } = await loadZip()
    expect(crc32(ascii('123456789'))).toBe(0xcbf43926)
    expect(crc32(new Uint8Array(0))).toBe(0)
  })

  it('AC-4213.2: 알려진 값 — 영어 문장·한 바이트, 늘 0 이상(부호 없는 32비트)', async () => {
    const { crc32 } = await loadZip()
    expect(crc32(ascii('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339)
    expect(crc32(ascii('a'))).toBe(0xe8b7be43)
    expect(crc32(new Uint8Array([0xff, 0xff, 0xff, 0xff]))).toBe(0xffffffff)
  })
})

describe('AC-4213.2 zipStore — 압축 없는 zip', () => {
  const when = new Date(2026, 10, 23, 14, 5, 9) // 한국 시간(시험 TZ=Asia/Seoul) 2026-11-23 14:05:09
  const DOS_TIME = (14 << 11) | (5 << 5) | (9 >> 1)
  const DOS_DATE = ((2026 - 1980) << 9) | (11 << 5) | 23
  const entries = [
    { name: '[Content_Types].xml', data: ascii('<Types/>') },
    { name: 'xl/worksheets/sheet1.xml', data: new TextEncoder().encode('<c>한글 칸</c>') },
    { name: 'empty.bin', data: new Uint8Array(0) },
  ]

  it('AC-4213.2: 파일 머리(PK\\x03\\x04)마다 이름·차례·크기·CRC가 넣은 것과 같고 압축 방식 0, 내용은 그대로', async () => {
    const { crc32, zipStore } = await loadZip()
    const bytes = zipStore(entries, when)
    expect(Array.from(bytes.subarray(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04])
    const { locals } = parseZip(bytes)
    expect(locals.map((l) => l.name)).toEqual(entries.map((e) => e.name))
    locals.forEach((l, i) => {
      const data = entries[i].data
      expect(l.method, l.name).toBe(0)
      expect(l.flags, l.name).toBe(0)
      expect(l.csize, l.name).toBe(data.length)
      expect(l.usize, l.name).toBe(data.length)
      expect(l.crc, l.name).toBe(crc32(data))
      expect(Array.from(l.data), l.name).toEqual(Array.from(data))
    })
  })

  it('AC-4213.2: 가운데 목록이 파일 머리 수만큼, 같은 이름·차례·크기·CRC, 파일 머리 자리를 가리킨다', async () => {
    const { zipStore } = await loadZip()
    const bytes = zipStore(entries, when)
    const { locals, centrals } = parseZip(bytes)
    expect(centrals).toHaveLength(entries.length)
    centrals.forEach((c, i) => {
      const l = locals[i]
      expect(c.name).toBe(l.name)
      expect(c.method).toBe(0)
      expect(c.flags).toBe(0)
      expect(c.crc).toBe(l.crc)
      expect(c.csize).toBe(l.csize)
      expect(c.usize).toBe(l.usize)
      expect(c.time).toBe(l.time)
      expect(c.date).toBe(l.date)
      expect(c.offset).toBe(l.offset)
      expect(c.disk).toBe(0)
      expect(c.extraLen).toBe(0)
      expect(c.commentLen).toBe(0)
    })
  })

  it('AC-4213.2: 끝 머리 — 파일 수·가운데 목록 크기·자리가 맞고 맨 끝 22바이트, 설명 없음', async () => {
    const { zipStore } = await loadZip()
    const bytes = zipStore(entries, when)
    const { centralStart, centralSize, end } = parseZip(bytes)
    expect(end.at).toBe(bytes.length - 22)
    expect(end.disk).toBe(0)
    expect(end.centralDisk).toBe(0)
    expect(end.onDisk).toBe(entries.length)
    expect(end.total).toBe(entries.length)
    expect(end.centralSize).toBe(centralSize)
    expect(end.centralOffset).toBe(centralStart)
    expect(end.commentLen).toBe(0)
  })

  it('AC-4213.2: DOS 시각 — 파일 머리·가운데 목록 모두 when의 한국 시각(초는 2초 단위)', async () => {
    const { zipStore } = await loadZip()
    const { locals, centrals } = parseZip(zipStore(entries, when))
    for (const x of [...locals, ...centrals]) {
      expect(x.time, x.name).toBe(DOS_TIME)
      expect(x.date, x.name).toBe(DOS_DATE)
    }
  })

  it('AC-4213.2: DOS 시각 — 1980년 앞은 1980-01-01 00:00:00으로 둔다', async () => {
    const { zipStore } = await loadZip()
    const { locals } = parseZip(zipStore([{ name: 'a', data: ascii('a') }], new Date(1970, 0, 1, 9, 0, 0)))
    expect(locals[0].time).toBe(0)
    expect(locals[0].date).toBe((0 << 9) | (1 << 5) | 1)
  })

  it('AC-4213.2: 파일 없으면 끝 머리 22바이트만', async () => {
    const { zipStore } = await loadZip()
    const bytes = zipStore([], when)
    expect(bytes).toHaveLength(22)
    const { locals, centrals, end } = parseZip(bytes)
    expect(locals).toEqual([])
    expect(centrals).toEqual([])
    expect(end.total).toBe(0)
    expect(end.centralSize).toBe(0)
    expect(end.centralOffset).toBe(0)
  })

  it('AC-4213.2: 이름은 ASCII만 — 한글·빈 이름은 던진다', async () => {
    const { zipStore } = await loadZip()
    expect(() => zipStore([{ name: '시트.xml', data: ascii('x') }], when)).toThrow()
    expect(() => zipStore([{ name: '', data: ascii('x') }], when)).toThrow()
  })

  it('AC-4213.2: 저장소의 SheetJS zip 읽개(CFB)로 열면 같은 이름·내용', async () => {
    const { zipStore } = await loadZip()
    const cfb = XLSX.CFB.read(zipStore(entries, when), { type: 'array' })
    for (const e of entries) {
      const found = XLSX.CFB.find(cfb, '/' + e.name) // '/'로 시작하면 뿌리부터 온 경로로 찾는다
      expect(found, e.name).toBeTruthy()
      expect(Array.from(found!.content as ArrayLike<number>), e.name).toEqual(Array.from(e.data))
    }
  })

  it('AC-4213.2: zip.ts는 다른 모듈을 import하지 않는다(erp-copy-list와 한 벌로 합칠 수 있게, SheetJS 없음)', () => {
    const code = readFileSync(path.join(SRC, 'zip.ts'), 'utf8')
    expect(code).not.toMatch(/^\s*import\b/m)
    expect(code).not.toMatch(/\bimport\s*\(/)
    expect(code).not.toMatch(/\brequire\s*\(/)
  })
})
