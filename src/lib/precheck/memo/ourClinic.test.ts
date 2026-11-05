import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { CodeMap } from '@/types/precheck'
import { defaultPhrases, ourClinicPhrases, validatePhrases } from './index'

// 우리 병원 설정(design.md 19-3). 원본 기본값과 같은 메모가 나오는 값이다. 값이 맞는지는 golden.test.ts가 원본과 견주어 본다

const here = fileURLToPath(new URL('.', import.meta.url))
const codeMap = JSON.parse(readFileSync(join(here, '../data/codeMap.json'), 'utf-8')) as CodeMap
const codes = (kind: string) => Object.entries(codeMap).filter(([, row]) => row.k === kind)

describe('AC-014.7 ourClinicPhrases', () => {
  it('AC-014.7: 검사를 지나고 원본 칸은 기본값과 같다', () => {
    const our = ourClinicPhrases()
    expect(validatePhrases(our).ok).toBe(true)
    const { TPL, CODEMAP, CODEMAP_DEL } = defaultPhrases()
    expect({ TPL: our.TPL, CODEMAP: our.CODEMAP, CODEMAP_DEL: our.CODEMAP_DEL }).toEqual({ TPL, CODEMAP, CODEMAP_DEL })
  })

  it('AC-014.7: 기본 사전이 점검 표의 코드 표와 같다(표를 코드에 정적으로 부르지 않으려 사본을 둔다)', () => {
    expect(defaultPhrases().CODEMAP).toEqual(codeMap)
  })

  it('AC-014.7: 부를 때마다 새 값이라 고쳐도 다음 값에 번지지 않는다', () => {
    const first = ourClinicPhrases()
    first.TPL.mark = '바꿈'
    first.procedureDrugs.KK090 = {}
    expect(ourClinicPhrases().TPL.mark).toBe('◈')
    expect(Object.keys(ourClinicPhrases().procedureDrugs.KK090).length).toBeGreaterThan(0)
    expect(defaultPhrases().TPL.mark).toBe('◈')
  })

  it('AC-014.7: 메모 코드에 병원 값(약 코드·약 이름·병원 ID)이 없다. 병원 값은 ourClinic.json·defaults.json에만 있다', () => {
    const sources = readdirSync(here).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    expect(sources.length).toBeGreaterThan(0)
    for (const name of sources) {
      // 설정 칸 이름표('리도카인(국소마취제) 처방코드', 원본 diff)는 병원 값이 아니다
      const code = readFileSync(join(here, name), 'utf-8').replace(/^\s*(\/\/|\*|\/\*).*$/gm, '').replace('리도카인(국소마취제) 처방코드', '')
      expect(code, name).not.toMatch(/['"`]A(?:15|19|21|41|49)['"`]/)
      expect(code, name).not.toMatch(/리도카인|트리암|덱사/)
      expect(code, name).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
    }
  })

  it('AC-014.3: defaultPhrases의 약 칸은 비어 있고 검사를 지난다(병원 값을 고른 적이 없다)', () => {
    expect(defaultPhrases().procedureDrugs).toEqual({})
    expect(validatePhrases(defaultPhrases()).ok).toBe(true)
  })
})

describe('AC-014.9 우리 병원 시술별 약', () => {
  const drugs = ourClinicPhrases().procedureDrugs

  it('AC-014.9: 코드 표의 약 5개 × 시술 15개 칸마다 값이 있어 [약 확인]이 붙지 않는다', () => {
    expect(codes('drug')).toHaveLength(5)
    expect(codes('proc')).toHaveLength(15)
    for (const [proc] of codes('proc')) {
      for (const [, drug] of codes('drug')) {
        expect(drugs[proc]?.[drug.n], `${proc} ${drug.n}`).toBeDefined()
      }
    }
  })

  it('AC-014.9: 국소마취제는 모든 시술에서 빼기다', () => {
    for (const [proc] of codes('proc')) expect(drugs[proc].리도카인, proc).toEqual({ use: 'exclude' })
  })

  it('AC-014.9: 연골주사약은 연골주사 줄을 쓰는 시술에서만 넣기다', () => {
    for (const [proc] of codes('proc')) expect(drugs[proc].아라간.use, proc).toBe(proc === 'KK090' ? 'include' : 'exclude')
  })

  it('AC-014.9: 주사약은 {약제}가 있는 틀의 시술(KK090·KK062)에서만 넣기고 자리는 afterProc이다', () => {
    for (const name of ['트리암', '덱사', '조영제']) {
      for (const [proc] of codes('proc')) {
        const want = proc === 'KK090' || proc === 'KK062'
        expect(drugs[proc][name].use, `${proc} ${name}`).toBe(want ? 'include' : 'exclude')
        if (want) expect(drugs[proc][name].place).toBe('afterProc')
      }
    }
    expect(drugs.KK090.트리암.label).toBe('triam')
    expect(drugs.KK062.덱사.label).toBe('dexa')
  })
})
