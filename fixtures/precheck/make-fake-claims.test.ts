import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { FAKE_CLAIM_CASES, FAKE_SEED, buildFakeClaims, fakeClaimText, writeFakeClaims } from './make-fake-claims'

// 가짜 한 달 자료 생성기(REQ-009). 도우미 claim.month JSON과 같은 모양(Step 1 counts 포함)을 씨앗 고정으로 만든다.
// 원본 tests/test_claim_precheck.py의 가짜 사례 v1~v18을 옮기고 달을 넘기는 기간 사례를 하나 더 둔다

const FAKE_DIR = fileURLToPath(new URL('./fake/', import.meta.url))
const ORIGINAL_IDS = [
  'v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v7b', 'v8', 'v9', 'v10', 'v11', 'v12', 'v13', 'v14', 'v15', 'v16',
  'v16b', 'v17', 'v18',
]

const temp: string[] = []
afterAll(() => {
  for (const dir of temp) rmSync(dir, { recursive: true, force: true })
})

describe('AC-009.3 가짜 한 달 자료 생성기', () => {
  it('AC-009.3: 같은 씨앗이면 같은 결과다(두 번 만들어 비교). 씨앗을 바꾸면 이력 채움이 달라진다', () => {
    expect(buildFakeClaims()).toEqual(buildFakeClaims())
    expect(buildFakeClaims(FAKE_SEED)).toEqual(buildFakeClaims())
    expect(buildFakeClaims(FAKE_SEED + 1)).not.toEqual(buildFakeClaims())
  }, 60_000) // 사례가 많아 여섯 번 만들면 바쁜 기계에서는 5초를 넘는다

  it('AC-009.3: 저장소의 fixtures/precheck/fake/*.json은 생성기로 다시 만든 것과 같다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fake-claims-'))
    temp.push(dir)
    const written = writeFakeClaims(dir).map((path) => path.slice(dir.length + 1)).sort()
    const committed = readdirSync(FAKE_DIR).filter((name) => name.endsWith('.json')).sort()
    expect(committed).toEqual(written)
    for (const name of written) {
      expect(readFileSync(join(FAKE_DIR, name), 'utf-8'), name).toBe(readFileSync(join(dir, name), 'utf-8'))
    }
  })

  it('AC-009.3: 사례마다 이름이 있고 파일 이름이 겹치지 않는다(뒤 TASK가 사례를 더한다)', () => {
    const names = FAKE_CLAIM_CASES.map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
    expect(new Set(FAKE_CLAIM_CASES.map((c) => c.file)).size).toBe(names.length)
    for (const c of FAKE_CLAIM_CASES) {
      expect(c.file, c.name).toMatch(/^claim-month-[a-z0-9-]+\.json$/)
      expect(c.note.length, c.name).toBeGreaterThan(0)
    }
    expect(names).toEqual(expect.arrayContaining(['rules-v1-v18', 'cross-month']))
  })

  it('AC-009.3: 원본 test_claim_precheck.py의 가짜 사례 v1~v18(v7b·v16b 포함)이 내원번호 그대로 들어 있다', () => {
    const json = buildFakeClaims().find((c) => c.name === 'rules-v1-v18')!.json
    const visitIds = new Set(json.s83.map((row) => row['내원번호']))
    for (const id of ORIGINAL_IDS) expect(visitIds.has(id), id).toBe(true)
    // v1: MBB L4,5 both · LA358 2.5 · LA357 1.0 · A21 1 · 주상병 M5456
    const v1 = json.s83.find((row) => row['내원번호'] === 'v1')!
    const chart = v1['차트번호']
    const rx = json.s47.filter((row) => row['차트번호'] === chart && row['처방일자'] === v1['기록날짜'])
    expect(rx.map((row) => [row['처방코드'], row['수량']])).toEqual([
      ['LA358', '2.5'],
      ['LA357', '1.0'],
      ['A21', '1'],
    ])
    expect(json.s83d.filter((row) => row['내원번호'] === 'v1').map((row) => [row['상병청구코드'], row['주상병여부']])).toEqual([
      ['M5456', '주상병'],
    ])
  })

  it('AC-009.3: 가짜 신원만 쓴다 — 이름 가상환자NN, 차트번호 9로 시작하는 6자리, 주민번호·전화 모양 없음', () => {
    for (const { name, json } of buildFakeClaims()) {
      // 비트 표 끝의 건수·합계 줄(83 【총계】, 47 ▶ 합계)은 환자 줄이 아니다. 그 줄은 이름·차트번호가 비었다
      const patient83 = json.s83.filter((row) => row['내원번호'] !== '【총계】')
      const total83 = json.s83.filter((row) => row['내원번호'] === '【총계】')
      const patient47 = json.s47.filter((row) => !row['처방코드'].startsWith('▶'))
      const total47 = json.s47.filter((row) => row['처방코드'].startsWith('▶'))
      expect(total83.length + total47.length, name).toBe(2)
      for (const row of [...total83, ...total47]) expect(row['차트번호'] + (row['환자명'] ?? ''), name).toMatch(/^(\d+건)?$/)
      for (const row of patient83) {
        expect(row['환자명'], name).toMatch(/^가상환자\d{2}$/)
        expect(row['차트번호'], name).toMatch(/^9\d{5}$/)
      }
      for (const row of [...json.s83d, ...patient47]) expect(row['차트번호'], name).toMatch(/^9\d{5}$/)
      for (const row of json.history) expect(row.p, name).toMatch(/^9\d{5}$/)
      const text = fakeClaimText(json)
      expect(text, name).not.toMatch(/\d{6}-?[1-4]\d{6}/)
      for (const phone of text.match(/01[016789]-?\d{3,4}-?\d{4}/g) ?? []) expect(phone, name).toMatch(/^010-0000-\d{4}$/)
    }
  })
})

describe('AC-009.4 생성기는 도우미처럼 선언한 줄 수(counts)를 머리에 넣는다', () => {
  it('AC-009.4: 사례마다 counts의 s83·s83d·s47·history가 배열 줄 수와 같다', () => {
    for (const { name, json } of buildFakeClaims()) {
      expect(json.version, name).toBe(1)
      expect(json.counts, name).toEqual({
        s83: json.s83.length,
        s83d: json.s83d.length,
        s47: json.s47.length,
        history: json.history.length,
      })
      expect(json.s83.length, name).toBeGreaterThan(0)
      expect(json.s47.length, name).toBeGreaterThan(0)
      expect(json.history.length, name).toBeGreaterThan(0)
    }
  })

  it('AC-009.4: 12개월 이력 범위는 기간 시작 365일 전부터 기간 끝까지다(도우미와 같음)', () => {
    const json = buildFakeClaims().find((c) => c.name === 'rules-v1-v18')!.json
    expect(json.period).toEqual({ from: '2026-10-01', to: '2026-10-07' })
    expect(json.historyRange).toEqual({ from: '2025-10-01', to: '2026-10-07' })
  })
})

describe('AC-009.5 달을 넘기는 기간 사례', () => {
  it('AC-009.5: cross-month 사례는 10/30~11/2이고 두 달의 진료가 다 있다', () => {
    const json = buildFakeClaims().find((c) => c.name === 'cross-month')!.json
    expect(json.period).toEqual({ from: '2026-10-30', to: '2026-11-02' })
    const months = new Set(json.s83.filter((row) => row['증상']).map((row) => row['기록날짜'].slice(0, 6)))
    expect([...months].sort()).toEqual(['202610', '202611'])
  })
})
