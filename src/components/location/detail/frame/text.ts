import { asOfText } from '@/components/location/common/text'
import type { CandidateStatus, RadiusM } from '@/types/location'

// 후보 자세히 틀의 화면 글(승인된 시안 docs/mockups/location/ ?s=candidate 그대로 — requirements '화면 글 기본값'에 없는 글).
// 묶음 열둘의 차례·이름은 AC-7909.1, 목차 글은 시안 TOC 그대로

/** 묶음 열둘(AC-7909.1 차례). id는 칸(slot) 이름이자 닻 `#sec-{id}` */
export const SECTIONS = [
  { id: 'people', title: '사는 사람' },
  { id: 'income', title: '소득·쓸 힘' },
  { id: 'demand', title: '정형외과 수요' },
  { id: 'rivals', title: '경쟁 의원' },
  { id: 'price', title: '경쟁 의원 진료비' },
  { id: 'hours', title: '진료 시간 빈틈' },
  { id: 'traffic', title: '교통·둘레 시설' },
  { id: 'photo', title: '거리 사진' },
  { id: 'building', title: '건물 서류' },
  { id: 'vacancy', title: '빈 칸 짐작' },
  { id: 'land', title: '땅 쓰임·계획' },
  { id: 'future', title: '앞으로 바뀔 것' },
] as const
export type SectionId = (typeof SECTIONS)[number]['id']

/** 살필 범위 일곱 값(AC-7908.1) */
export const RADII: readonly RadiusM[] = [300, 500, 700, 1000, 1500, 2000, 3000]

export const STATUS_TEXT: Record<CandidateStatus, string> = {
  watching: '보는 중',
  contacted: '중개사 연락',
  visited: '보러 감',
  reviewing: '계약 검토',
  dropped: '내려놓음',
}

export const FRAME_TEXT = {
  candidate: (letter: string) => `후보 ${letter}`,
  frozen: (day: string, again: boolean) => `${asOfText(day)}에 받은 값으로 굳혀 두었어요(${again ? '다시 받은 날' : '저장한 날'})`,
  noSnapshot: '아직 받은 값이 없어요.',
  progress: (done: number, total: number) => `자료 ${done}/${total}`,
  refresh: '오늘 값으로 다시 받기',
  report: '한 장 보고서',
  prep: '개원 준비',
  listings: '매물 보기',
  toc: '묶음 목차',

  flagsTitle: '위험 신호',
  flagsAside: '빨간 깃발은 계약 전에 꼭 풀어야 할 것이에요',
  flagsList: '위험 신호 목록',
  flagsNone: '찾은 위험 신호가 없어요.',
  check: '확인 필요',
  law: '법 근거',

  scoreTitle: '종합 점수',
  scoreAside: '무게는 동네 훑기에서 정한 무게를 따라요',
  outOf: '/ 100점',
  noScore: '점수 없음',
  noValue: '값 없음',
  noListing: '매물 없음',
  scoreHelp:
    '항목마다 0~100으로 바꾼 뒤 무게를 곱해 더해요. 항목 점수는 버린 뒤 더해요. 세부 무게와 만점 기준은 동네 훑기의 점수 무게 판 [세부]에서 정해요.',
  scoreHow: '매기는 법',

  range: '살필 범위',
  rangeHelp: '범위를 바꾸면 사는 사람·경쟁 의원·둘레 시설·진료 시간 빈틈을 다시 세요. 후보마다 따로 기억해요.',
  mapLegend: '파란 표시 = 후보 · 주황 점 = 정형외과·통증·재활 · 회색 점 = 한의원 · 검은 네모 = 역 · 흐린 점 = 범위 밖',
} as const
