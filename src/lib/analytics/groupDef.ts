import type { RxGroupDef } from '@/types/analysis'

// Worker로 보내는 묶음 정의의 새 사본(spec group-exclude, 불러오기 길). 열쇠(id)와 코드만 싣는다: 이름·차례·저장 id는 싣지 않는다.
// 빈 out·cond는 싣지 않아, 빼는 처방·조건이 없는 묶음은 지금 메시지 { id, codes }와 글자까지 같다. 조건 항목은 { code, unless }만
export function copyGroupDef({ id, codes, out, cond }: RxGroupDef): RxGroupDef {
  return {
    id,
    codes: [...codes],
    ...(out !== undefined && out.length > 0 ? { out: [...out] } : {}),
    ...(cond !== undefined && cond.length > 0 ? { cond: cond.map(({ code, unless }) => ({ code, unless: [...unless] })) } : {}),
  }
}
