import 'server-only'

import type { RuleHit } from '@/types/notices'
import type { Outcome } from '@/types/parse'
import type { Tables } from '@/types/precheck'
import { loadTables } from '@/workers/precheck/tables'
import { noticeNo, noticeNos } from './noticeNo'

// 고시 번호 → 점검 규칙 연결(specs/notices REQ-7409 AC-7409.4·AC-7409.5, design 7절). 규칙표는 읽기만 한다.
// 규칙표 파일은 workers/precheck/tables.ts의 loadTables로만 부른다(REQ-007 AC-007.4: 표 파일을 import하는 곳은 그 파일 하나)

/** 복지부 고시 번호('2026-183') → 그 고시를 근거로 둔 규칙들(id 차례) */
export type RuleBasisIndex = ReadonlyMap<string, readonly RuleHit[]>

const HITS_MAX = 50 // notices.rule_hits 배열 50개까지

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const byId = (a: RuleHit, b: RuleHit) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** 규칙표(rules.json 모양)의 rules[].basis[].number에서 복지부 고시 번호마다 규칙 { id, title } 목록. 모양이 틀린 줄은 건너뛴다 */
export function ruleBasisIndex(rulesJson: unknown): RuleBasisIndex {
  const index = new Map<string, RuleHit[]>()
  const rules = isRecord(rulesJson) && Array.isArray(rulesJson.rules) ? (rulesJson.rules as unknown[]) : []
  for (const rule of rules) {
    if (!isRecord(rule) || typeof rule.id !== 'string' || typeof rule.title !== 'string' || !Array.isArray(rule.basis)) continue
    const nos = new Set<string>()
    for (const basis of rule.basis as unknown[]) {
      if (isRecord(basis) && typeof basis.number === 'string') for (const no of noticeNos(basis.number)) nos.add(no)
    }
    for (const no of nos) {
      const list = index.get(no) ?? []
      if (!list.some((h) => h.id === rule.id)) list.push(Object.freeze({ id: rule.id, title: rule.title }))
      index.set(no, list)
    }
  }
  for (const list of index.values()) Object.freeze(list.sort(byId))
  return index
}

/** 규칙표 불러오기로 색인을 한 번만 만들어 기억한다. 불러오기가 실패하면 null이고 다음에 다시 부른다(시험은 가짜 불러오기를 넣는다) */
export function createRuleIndexLoader(load: () => Promise<Outcome<Tables>>): () => Promise<RuleBasisIndex | null> {
  let memo: RuleBasisIndex | null = null
  return async () => {
    if (memo) return memo
    const tables = await load()
    if (!tables.ok) return null
    memo = ruleBasisIndex(tables.value.rules)
    return memo
  }
}

/** 실제 규칙표(lib/precheck/data/rules.json)의 색인. 서버가 한 번 만들어 기억한다. 불러오기 실패면 null */
export const defaultRuleIndex = createRuleIndexLoader(loadTables)

// AI가 준 번호 한 개: '2026-183'·'제2026-183호'·'고시 제2026-183호'·'보건복지부 고시 제2026-0183호'. 그 밖은 noticeNo로 읽는다
const BARE_NO = /^\s*(?:보건복지부\s*)?(?:고시\s*)?제?\s*(\d{4})\s*-\s*(\d{1,4})\s*호?\s*$/
// 본문의 '변경 전 고시 (고시 제2024-297호, …' (심사기준 팝업 글)
const BEFORE_NO = /변경\s*전\s*고시\s*\(\s*(?:보건복지부\s*)?고시\s*제\s*(\d{4})\s*-\s*(\d+)\s*호/g

function amendNo(s: unknown): string | null {
  if (typeof s !== 'string') return null
  const bare = BARE_NO.exec(s)
  return bare ? `${bare[1]}-${Number.parseInt(bare[2], 10)}` : noticeNo(s)
}

/**
 * 글이 바꾸는 고시 번호(AI가 준 amends ∪ 본문의 '변경 전 고시' 번호 − 글 자신의 번호)를 규칙과 맞춘 { id, title }.
 * 겹침 없이 id 차례, DB 한도 50개까지. 돌려준 값은 새 객체라 고쳐도 색인은 그대로다
 */
export function matchRules(amends: readonly string[], body: string, ownNo: string | null, index: RuleBasisIndex): RuleHit[] {
  const nos = new Set<string>()
  for (const a of amends) {
    const no = amendNo(a)
    if (no) nos.add(no)
  }
  for (const m of body.matchAll(BEFORE_NO)) nos.add(`${m[1]}-${Number.parseInt(m[2], 10)}`)
  const own = ownNo === null ? null : amendNo(ownNo)
  if (own) nos.delete(own)

  const hits = new Map<string, RuleHit>()
  for (const no of nos) for (const h of index.get(no) ?? []) if (!hits.has(h.id)) hits.set(h.id, { id: h.id, title: h.title })
  return [...hits.values()].sort(byId).slice(0, HITS_MAX)
}
