import type { RxGroupDef } from '@/types/analysis'

// 묶음 정의를 새 객체로 옮긴다(불러오기 길이 Worker·runAnalysis로 실을 때). 제외할 처방이 있을 때만 exclude 칸을 새 배열로 싣는다 —
// 없으면(열쇠 없음·빈 배열) 지금처럼 { id, codes }. 이름 등 다른 칸은 싣지 않는다 (specs/rx-group-exclude)
export function copyGroupDef(def: RxGroupDef): RxGroupDef {
  const copy: RxGroupDef = { id: def.id, codes: [...def.codes] }
  if (def.exclude !== undefined && def.exclude.length > 0) copy.exclude = [...def.exclude]
  return copy
}
