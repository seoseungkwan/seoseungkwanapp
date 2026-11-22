// 점수 무게 판 글(requirements '화면 글 기본값' › 점수 무게 판, 없는 글은 시안 ?s=weights 그대로)
import type { SubId } from '@/lib/location/score'

/** 세부 항목 하나의 기준 줄 글(이름은 score.ts label 한 곳 — requirements '화면 글 기본값' 그대로).
 * 많을수록 좋음: `{pre} [칸]{more} 100점`(more = 단위 + 면·이면, 예 '명이면'·'% 늘면')
 * 적을수록 좋음: `[칸]{unit} 이하면 100점 · [칸]{unit} 이상이면 0점`
 * 고르는 값(pick): 칸 없이 `고른 값이 '{pick}'이면 100점`
 * scale: 칸 1 = 저장 값 scale(보증금·권리금은 만 원으로 적고 원으로 저장) */
export type SubText = { unit: string; pre?: string; more?: string; pick?: string; scale?: number }

export const SUB_TEXT: Record<SubId, SubText> = {
  'p-density': { unit: '명', pre: '1km²에', more: '명이면' },
  'p-senior': { unit: '%', more: '%면' },
  'p-households': { unit: '세대', more: '세대면' },
  'p-apts': { unit: '세대', more: '세대면' },
  'p-trend': { unit: '%', pre: '4년 사이', more: '% 늘면' },
  'p-accidents': { unit: '곳', more: '곳이면' },
  'p-industry': { unit: '명', more: '명이면' },
  'p-schools': { unit: '곳', more: '곳이면' },
  'p-facilities': { unit: '곳', more: '곳이면' },
  'p-welfare': { unit: '%', more: '%면' },
  'c-count': { unit: '곳' },
  'c-perRival': { unit: '명', more: '명이면' },
  'c-newOpen': { unit: '곳' },
  'c-gaps': { unit: '칸', more: '칸이면' },
  'c-price': { unit: '%', pre: '둘레 평균이', more: '% 비싸면' },
  't-station': { unit: 'm' },
  't-stops': { unit: '곳', more: '곳이면' },
  't-flow': { unit: '명', more: '명이면' },
  's-floor': { unit: '층' },
  's-elevator': { unit: '대', more: '대면' },
  's-parking': { unit: '대', more: '대면' },
  's-age': { unit: '년' },
  's-neighbors': { unit: '곳', more: '곳이면' },
  's-sign': { unit: '', pick: '보여요' },
  's-violation': { unit: '', pick: '없음' },
  's-clinics': { unit: '곳', more: '곳이면' },
  'k-rentPy': { unit: '원' },
  'k-deposit': { unit: '만 원', scale: 10_000 },
  'k-premium': { unit: '만 원', scale: 10_000 },
  'k-vsAvg': { unit: '%' },
}

export const WEIGHTS_TEXT = {
  title: '점수 무게',
  resetWeights: '기본 무게로',
  help: '중요하게 볼 것을 무겁게 해요. 지도 색·순위·후보 점수가 바로 바뀌어요. 동네 훑기는 앞의 세 항목만 쓰고, 자리·비용 무게는 후보 점수에 써요. [세부]를 펼치면 항목 안의 세부 무게와 만점 기준을 직접 정해요.',
  detail: '세부',
  sumTail: ' · 합이 100이 아니어도 비율로 계산해요',
  bandsTitle: '셀 나이대',
  bandsNote: "'고른 나이대 인구 밀도'에 셀 나이",
  subsTitle: '세부 무게 · 만점 기준',
  candidateGroup: '후보 점수에만 써요',
  candidateSub: '후보에서만',
  subSumTail: ' · 비율로 계산해요',
  resetGroup: '기본값으로',
  more: '많을수록 좋음',
  less: '적을수록 좋음',
  // 과목 고르기(시안 승인 3 ?s=weights·kinds, requirements '의원 과목 고르기 판' 여는 곳 셋 가운데 둘)
  pickDepts: '과목 고르기',
  rivalDepts: '경쟁 의원으로 보는 과목',
  noRival: '없음',
} as const
