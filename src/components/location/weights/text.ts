// 점수 무게 판 글(requirements '화면 글 기본값' › 점수 무게 판, 없는 글은 시안 ?s=weights 그대로)
import type { SubId } from '@/lib/location/score'

/** 세부 항목 하나의 화면 글.
 * 많을수록 좋음: `{pre} [칸]{more} 100점`(more = 단위 + 면·이면, 예 '명이면'·'% 늘면')
 * 적을수록 좋음: `[칸]{unit} 이하면 100점 · [칸]{unit} 이상이면 0점`
 * 고르는 값(pick): 칸 없이 `고른 값이 '{pick}'이면 100점`
 * scale: 칸 1 = 저장 값 scale(보증금·권리금은 만 원으로 적고 원으로 저장) */
export type SubText = { name: string; unit: string; pre?: string; more?: string; pick?: string; scale?: number }

export const SUB_TEXT: Record<SubId, SubText> = {
  'p-density': { name: '고른 나이대 인구 밀도', unit: '명', pre: '1km²에', more: '명이면' },
  'p-senior': { name: '60세 이상 비율', unit: '%', more: '%면' },
  'p-households': { name: '세대 수', unit: '세대', more: '세대면' },
  'p-apts': { name: '아파트 세대(입주 예정 포함)', unit: '세대', more: '세대면' },
  'p-trend': { name: '인구 추세(4년)', unit: '%', pre: '4년 사이', more: '% 늘면' },
  'p-accidents': { name: '교통사고 다발 지점', unit: '곳', more: '곳이면' },
  'p-industry': { name: '산업단지 고용 인원', unit: '명', more: '명이면' },
  'p-schools': { name: '학교 수', unit: '곳', more: '곳이면' },
  'p-facilities': { name: '경로당·체력단련장 수', unit: '곳', more: '곳이면' },
  'p-welfare': { name: '의료급여·차상위 비율', unit: '%', more: '%면' },
  'c-count': { name: '경쟁 의원 수', unit: '곳' },
  'c-perRival': { name: '1곳당 사는 사람', unit: '명', more: '명이면' },
  'c-newOpen': { name: '3년 새로 연 곳', unit: '곳' },
  'c-gaps': { name: '진료 시간 빈틈', unit: '칸', more: '칸이면' },
  'c-price': { name: '진료비 차이(둘레 평균이 지금 의원보다)', unit: '%', pre: '둘레 평균이', more: '% 비싸면' },
  't-station': { name: '역까지 거리', unit: 'm' },
  't-stops': { name: '400m 안 정류장 수', unit: '곳', more: '곳이면' },
  't-flow': { name: '하루 승하차(사람 흐름)', unit: '명', more: '명이면' },
  's-floor': { name: '층', unit: '층' },
  's-elevator': { name: '엘리베이터', unit: '대', more: '대면' },
  's-parking': { name: '주차', unit: '대', more: '대면' },
  's-age': { name: '지은 해(건물 나이)', unit: '년' },
  's-neighbors': { name: '이웃 약국(30m 안)', unit: '곳', more: '곳이면' },
  's-sign': { name: '간판 보임', unit: '', pick: '보여요' },
  's-violation': { name: '위반 건축물', unit: '', pick: '없음' },
  'k-rentPy': { name: '평당 월세', unit: '원' },
  'k-deposit': { name: '보증금', unit: '만 원', scale: 10_000 },
  'k-premium': { name: '권리금', unit: '만 원', scale: 10_000 },
  'k-vsAvg': { name: '저장 매물 평균과의 차이(평당 월세)', unit: '%' },
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
} as const
