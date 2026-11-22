// 의원 과목 고르기 판 글(requirements '화면 글 기본값' › 의원 과목 고르기 판, 거기 없는 글은 시안 ?s=kinds 그대로).
// 과목 이름은 depts.ts DEPTS 한 곳. 영어 낱말 없음(m·km 단위는 됨, AC-7917.1)
import { distText } from '@/lib/location/coords'
import type { DeptRole } from '@/lib/location/depts'

export const KINDS_TEXT = {
  title: '의원 과목 고르기',
  close: '닫기',
  // 맨 위 요약 · 0개면 노란 안내
  summaryHead: '경쟁 의원으로 보는 과목:',
  none: '없음',
  warn: '경쟁 의원 과목을 하나 이상 골라 주세요. 지금은 경쟁 점수를 셀 수 없어요',
  // 요약 아래 도움말(b = 굵게)
  help: [
    { b: '경쟁 의원', rest: ' = 경쟁 수 · 1곳당 사는 사람 · 진료비 · 진료 시간 빈틈 · 새로 연 곳 알림과 점수에 넣어요. ' },
    { b: '둘레로 보기', rest: " = 후보 자세히 '둘레 다른 과 의원'에 과목마다 수만 보여요. " },
    { b: '안 보기', rest: ' = 어디에도 안 보여요.' },
  ],
  // 과목 줄
  list: '과목마다 고르기',
  role: { rival: '경쟁 의원', around: '둘레로 보기', hide: '안 보기' } satisfies Record<DeptRole, string>,
  firstRival: '처음 경쟁',
  koreanNote: '처음엔 경쟁 수에 넣지 않고 따로 한 줄',
  // 판 아래 곁글 둘
  notes: [
    '새로 경쟁 의원에 넣은 과목은 [다시 받기]를 누르면 의사 수·장비·진료비가 채워져요',
    '의원마다 대표 과목 하나로 셌어요(이름에 든 과목 먼저). 과목 목록은 심평원 의원 진료과목 열아홉과 치과의원·한의원이에요.',
  ],
  // 판 바닥
  foot: '바꾸면 바로 저장돼요(점수 무게 판과 같아요).',
  reset: '기본값으로',
} as const

/** 요약의 과목 이름들(목록 차례로 받은 이름을 ' · '로). 없으면 '없음' */
export const rivalNamesText = (names: readonly string[]) => (names.length > 0 ? names.join(' · ') : KINDS_TEXT.none)
/** 요약 끝 개수 `({n}개)` */
export const rivalCountText = (n: number) => `(${n}개)`
/** 요약 머리 뒤 글 전부 — `{이름들} ({n}개)` */
export const summaryText = (names: readonly string[]) => `${rivalNamesText(names)} ${rivalCountText(names.length)}`

/** 줄 오른쪽 `후보 {글자} {범위} 안 {n}곳` */
export const countText = (letter: string, radiusM: number, n: number) => `후보 ${letter} ${distText(radiusM)} 안 ${n.toLocaleString('ko-KR')}곳`
