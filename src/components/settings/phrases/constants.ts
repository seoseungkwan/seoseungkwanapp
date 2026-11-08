import type { DrugPlace, PhraseTemplates } from '@/lib/precheck/memo'

// '병원 문구' 묶음들이 같이 쓰는 이름과 처음 값(memo-settings design.md §4). 병원 값이 아니다

/** 12개 부위(검사 regions 차례)와 화면 이름 */
export const REGIONS: readonly { key: string; ko: string }[] = [
  { key: 'shoulder', ko: '어깨' },
  { key: 'cervical', ko: '목(경추)' },
  { key: 'lumbar', ko: '허리(요추)' },
  { key: 'knee', ko: '무릎' },
  { key: 'ankle', ko: '발목' },
  { key: 'elbow', ko: '팔꿈치' },
  { key: 'wrist', ko: '손목' },
  { key: 'hand', ko: '손' },
  { key: 'hip', ko: '고관절' },
  { key: 'chest', ko: '갈비뼈' },
  { key: 'foot', ko: '발' },
  { key: 'upper', ko: '팔(상지)' },
]
export const regionKo = (key: unknown): string => REGIONS.find((r) => r.key === key)?.ko ?? String(key)

/** 엔진 SITE_FALLBACK과 같다: siteNames 칸이 없을 때 메모가 쓰는 부위 영어 표기 */
export const SITE_FALLBACK: Readonly<Record<string, string>> = { cervical: 'C', lumbar: 'L', shoulder: 'shoulder', knee: 'knee', ankle: 'ankle', elbow: 'elbow', wrist: 'wrist', hand: 'hand', hip: 'hip', chest: 'rib', foot: 'foot', upper: 'upper extremity' }

/** 엔진 FIXED_FALLBACK과 같다: fixedPhrases 칸이 없을 때 메모가 쓰는 고정 멘트 */
export const FIXED_FALLBACK: NonNullable<PhraseTemplates['fixedPhrases']> = [
  { token: 'C-arm', text: 'C-arm guide 하에', on: true },
  { token: 'Sono', text: 'Sono guide 하에', on: true },
  { token: '시행함', text: '시행함', on: true },
]
/** 지금 메모가 쓰는 고정 멘트(칸이 없으면 처음 멘트) */
export const fixedOf = (tpl: PhraseTemplates): NonNullable<PhraseTemplates['fixedPhrases']> => (Array.isArray(tpl.fixedPhrases) ? tpl.fixedPhrases : FIXED_FALLBACK)
/** 검사가 받는 고정 멘트 수 */
export const FIXED_MAX = 30

/** 코드 구분(검사 k 값)과 화면 이름 */
export const KINDS: readonly { value: string; label: string }[] = [
  { value: 'proc', label: '시술' },
  { value: 'drug', label: '약' },
  { value: 'note', label: '문구' },
  { value: 'lab', label: '검사' },
  { value: 'skip', label: '제외' },
]
export const kindKo = (value: unknown): string => KINDS.find((k) => k.value === value)?.label ?? String(value)

export const PLACE_LABELS: Readonly<Record<DrugPlace, string>> = { afterProc: '시술 뒤', afterEnding: '끝맺음 뒤', ownLine: '따로 한 줄' }

/** 문구 칸 아래 보기 한 줄의 값(AC-3008.3) */
export const PREVIEW_VALUES: Readonly<Record<string, string>> = { 좌우: 'Rt', 부위: 'knee', 약제: '(triam)', 시술: 'MBB L4,5', 회차: '2', 레벨: '4,5' }
