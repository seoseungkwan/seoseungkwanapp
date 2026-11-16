import type { RxGroupDef } from '@/types/analysis'

// 환자 한 명·하루에 받은 처방코드가 묶음 하나에 드는지 [환자 자료 구역] (spec sunap-ilji AC-4901.2).
// aggregate.ts의 groupRules·countsAs와 같은 규칙이다(aggregate는 고치지 않는다, groupMatch.test.ts가 같은 예로 견준다):
// 대소문자를 가리지 않고, (가) 빼는 처방을 하나라도 받았으면 거짓, (나) 넣는 처방 중 그 처방의 조건 처방을 하나도 안 받은 것이 있으면 참.
// 조건은 넣는 처방에 있는 code만 보고, 같은 code는 합치고, unless의 code 자신은 뺀다(남은 unless가 비면 조건 없음)
const codeKey = (code: string) => code.toUpperCase()

export function groupMatches(def: RxGroupDef | null, codes: readonly string[]): boolean {
  if (def === null) return false
  const got = new Set(codes.map(codeKey))
  if ((def.out ?? []).some((code) => got.has(codeKey(code)))) return false
  for (const code of new Set(def.codes.map(codeKey))) {
    if (!got.has(code)) continue
    const blocked = (def.cond ?? []).some(
      (item) => codeKey(item.code) === code && item.unless.some((other) => codeKey(other) !== code && got.has(codeKey(other))),
    )
    if (!blocked) return true
  }
  return false
}
