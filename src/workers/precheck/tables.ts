import { checkTables } from '@/lib/precheck/tables'
import type { Outcome } from '@/types/parse'
import type { Tables } from '@/types/precheck'

// 점검 표 네 개(lib/precheck/data의 JSON)를 부르는 유일한 곳(REQ-007 AC-007.4).
// 글자로 고정한 동적 import()라 청구 Worker가 처음 부를 때만 받는다. 다른 화면 번들에 표가 들어가지 않고, 환자 자료 구역 안에서 fetch를 쓰지 않는다
// 한 번 불러 검사한 표는 기억한다. 실패하면 기억을 비우고 번호만 돌려준다 — 점검을 시작하지 않는다(AC-007.5)

/** 불러온 그대로의 네 표(검사 전) */
export type RawTables = Record<keyof Tables, unknown>

async function importTables(): Promise<RawTables> {
  const [rules, dxFlags, drugInfo, codeMap] = await Promise.all([
    import('@/lib/precheck/data/rules.json'),
    import('@/lib/precheck/data/dxFlags.json'),
    import('@/lib/precheck/data/drugInfo.json'),
    import('@/lib/precheck/data/codeMap.json'),
  ])
  return { rules: rules.default, dxFlags: dxFlags.default, drugInfo: drugInfo.default, codeMap: codeMap.default }
}

/** 표 불러오기를 만든다. 같이 부른 것도 한 번의 불러오기를 나눠 쓴다(시험은 가짜 importAll을 넣는다) */
export function createTableLoader(importAll: () => Promise<RawTables>): () => Promise<Outcome<Tables>> {
  let memo: Promise<Outcome<Tables>> | null = null
  return () => {
    memo ??= Promise.resolve()
      .then(importAll) // 로더가 바로 던져도 같은 길로 받는다
      .then((raw): Outcome<Tables> => ({ ok: true, value: checkTables(raw) }))
      .catch((): Outcome<Tables> => {
        // 원래 오류 글(어느 칸·어느 청크)은 싣지 않는다
        memo = null
        return { ok: false, code: 'E-RULES-LOAD-FAILED' }
      })
    return memo
  }
}

/** 네 표를 한 번만 불러 검사해 기억한다. 실패하면 { ok: false, code: 'E-RULES-LOAD-FAILED' } */
export const loadTables = createTableLoader(importTables)
