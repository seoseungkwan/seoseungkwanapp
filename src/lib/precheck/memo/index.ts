import type { ClaimMonth, Visit } from '@/types/precheck'
import { createMemoEngine } from './engine'
import type { MemoParts, MemoTables, MemoVisit, Phrases, Region } from './types'

// 청구메모 문장(precheck TASK-14). 순수 함수만 있다. 부르는 곳은 Worker(jobs.ts)와, 문구 검사·기본값만 쓰는 설정 화면(TASK-18)이다 [환자 자료 구역]

export * from './types'
export { createMemoEngine, unfinished, type MemoEngine } from './engine'
export { defaultPhrases, diffPhrases, migratePhrases, ourClinicPhrases, validatePhrases } from './phrases'
export { defaultDictionary, dictionaryTerms, normalizeDictionary } from './dictionary'

/** 한 달 진료를 분석한다(원본 analyze·applyRx·computeIntervals). 내원 간격은 여기서만 계산된다 */
export const analyzeMonth = (month: Pick<ClaimMonth, 'visits' | 'rxByDay'>, phrases: Phrases, tables: MemoTables): MemoVisit[] => createMemoEngine(phrases, tables).analyzeMonth(month)
/** 진료 하나를 분석한다(내원 간격 없이) */
export const prepareVisit = (visit: Visit, phrases: Phrases, tables: MemoTables): MemoVisit => createMemoEngine(phrases, tables).prepareVisit(visit)
/** 비트에 들어가는 글(AC-014.5). 메모 칸 초안도 이 글이다 */
export const fullText = (visit: Visit | MemoVisit, phrases: Phrases, tables: MemoTables): string => createMemoEngine(phrases, tables).fullText(visit)
/** 부위 메모 조각(원본 buildMemo) */
export const buildMemo = (visit: Visit | MemoVisit, region: Region, phrases: Phrases, tables: MemoTables): MemoParts => createMemoEngine(phrases, tables).buildMemo(visit, region)
/** 부위 메모 문장(원본 memoText·compose). 비트에 들어가는 글은 이것이 아니라 fullText다 */
export const memoText = (visit: MemoVisit, parts: MemoParts, phrases: Phrases, tables: MemoTables): string => createMemoEngine(phrases, tables).memoText(visit, parts)
/** 문구 틀의 말 채우기(원본 fill) */
export const fill = (tpl: string, vars: Record<string, unknown>, phrases: Phrases, tables: MemoTables): string => createMemoEngine(phrases, tables).fill(tpl, vars)
/** 고친 메모에서 빠진 사유 문장(원본 savedMemoMissing). 고친 메모는 건드리지 않는다 */
export const savedMemoMissing = (saved: string | undefined, visit: Visit | MemoVisit, phrases: Phrases, tables: MemoTables): string[] => createMemoEngine(phrases, tables).savedMemoMissing(saved, visit)
