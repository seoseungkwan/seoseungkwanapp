import { wonText } from '@/lib/contacts/fields'
import { particle } from '@/lib/contacts/korean'
import type { RowProblem } from '@/lib/contacts/plan'

// 넣지 않는 줄의 글(requirements.md '화면 글자' 엑셀 미리 보기 까닭 글 + '시안에 없어 이 명세가 정한 글' 둘).
// 보이는 값은 분류·날짜 칸 값(RowProblem.value)과 업체·담당자·장비 이름뿐이다. 다른 칸 값(비밀번호·계좌 등)은 RowProblem에 없다

const CHOOSE_CATEGORY = '거래처·수리·관리·기관·보험·기타 가운데 하나로 골라 주세요.'

/** 까닭 글 하나. '{값}'은/는·'{이름}'이/가는 끝 글자 받침으로 고른다 */
export function problemText(p: RowProblem): string {
  switch (p.reason) {
    case 'category':
      return `분류 '${p.value}'${particle(p.value, '은/는')} 쓸 수 없어요. ${CHOOSE_CATEGORY}`
    case 'no-category':
      return `분류가 비었어요. ${CHOOSE_CATEGORY}`
    case 'no-company':
      return '업체 이름이 비었어요.'
    case 'no-person-name':
      return '담당자 이름이 비었어요. 담당자 휴대폰·맡은 일만 적힌 줄이에요.'
    case 'same-person':
      return `담당자 '${p.item}'${particle(p.item, '이/가')} 같은 업체에 두 줄 있어요. 한 줄만 남겨 주세요.`
    case 'unknown-company':
      return `업체 '${p.company}'${particle(p.company, '이/가')} 연락처 시트에도 주소록에도 없어요.`
    case 'no-equipment-name':
      return '장비 이름이 비었어요.'
    case 'date': {
      const field = p.field ?? ''
      return `${field} '${p.value}'${particle(p.value, '은/는')} 날짜 모양이 아니에요. 2026-11-21처럼 적어 주세요.`
    }
    case 'too-long': {
      const field = p.field ?? ''
      return `${field}${particle(field, '은/는')} ${wonText(p.limit ?? 0)}자까지 적을 수 있어요.`
    }
    case 'which-equipment':
      return `장비 '${p.item}'${particle(p.item, '이/가')} 주소록에 여러 대 있어요. 일련번호를 적어 주세요.`
  }
}

/** 줄 자리: '연락처 시트 {n}번째 줄' · '장비 시트 {n}번째 줄'(머리글이 1번째 줄) */
export function problemPlace(p: RowProblem): string {
  return `${p.sheet === 'contacts' ? '연락처' : '장비'} 시트 ${p.row}번째 줄`
}

/** 줄 이름: 업체 이름, 담당자 까닭은 '업체 · 담당자', 장비 줄은 '업체 · 장비'. 업체 이름이 비면 '' */
export function problemSubject(p: RowProblem): string {
  if (p.company === '') return ''
  return p.item === '' ? p.company : `${p.company} · ${p.item}`
}
