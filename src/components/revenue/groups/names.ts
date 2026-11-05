import { addGroup, renameGroup, type GroupEditError } from '@/lib/revenue/treatments'
import { RX_GROUP_NAME_MAX, RX_GROUPS_MAX, type RxGroup } from '@/types/rxGroups'

// 이름 칸은 치는 글자를 그대로 둔다(한글 조합·띄어쓰기가 끊기지 않게). 맞는지는 treatments.ts의 함수만 정한다

const NEW_GROUP = '새 묶음'

/** 시안에 있는 글은 겹침과 50개뿐이고 나머지는 같은 말투로 더했다 */
export const NAME_REASON: Record<GroupEditError, string> = {
  empty: '묶음 이름을 써 주세요.',
  tooLong: `묶음 이름은 ${RX_GROUP_NAME_MAX}자까지 쓸 수 있어요.`,
  duplicate: '같은 이름의 묶음이 있어요. 다른 이름을 써 주세요.',
  badChars: '줄바꿈 같은 제어 문자는 넣을 수 없어요.',
  digits: '숫자를 6개 이상 이어 쓸 수 없어요.',
  tooMany: `묶음은 ${RX_GROUPS_MAX}개까지 만들 수 있어요.`,
}

/**
 * 칸마다 이유(없으면 null)와 앞뒤 공백을 뗀 목록. 겹치면 뒤쪽 칸에만 이유를 둔다(시안의 '이름 겹침' 그림).
 * after는 errors가 모두 null일 때만 저장한다
 */
export function checkNames(rows: RxGroup[]): { errors: (GroupEditError | null)[]; after: RxGroup[] } {
  const after = rows.map((row) => ({ ...row, name: row.name.trim() }))
  const errors = after.map((row, index) => {
    const result = renameGroup(after.slice(0, index + 1), index, row.name)
    return typeof result === 'string' ? result : null
  })
  return { errors, after }
}

/** [새 묶음]: 비어 있는 이름은 addGroup이 받지 않으므로 겹치지 않는 이름을 채워 끝에 더한다. 고쳐 쓰라고 이름 칸에 초점을 준다 */
export function addNewGroup(rows: RxGroup[]): RxGroup[] | GroupEditError {
  for (let n = 1; ; n += 1) {
    const result = addGroup(rows, n === 1 ? NEW_GROUP : `${NEW_GROUP} ${n}`)
    if (result !== 'duplicate') return result
  }
}
