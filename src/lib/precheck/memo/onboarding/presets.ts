import type { Answers } from './answers'

// 처음 질문 보기 4개(AC-6614.4·AC-6614.9). 보기 메모 글은 이 값으로 진짜 엔진이 만든다(presets.test.ts가 그 글을 정한다).
// 좌우는 네 보기 모두 '차트 그대로'다: 가짜 진료의 SNB Rt·Rt shoulder가 메모에 보이게(수량 기준이면 수량 1 시술의 좌우가 빠진다) [환자 자료 구역]

export type Preset = { readonly name: string; readonly answers: Readonly<Answers> }

const preset = (name: string, answers: Answers): Preset => Object.freeze({ name, answers: Object.freeze(answers) })

export const PRESETS: readonly Preset[] = Object.freeze([
  preset('기호 + 영어 짧게', { sideStyle: 'Rt', cartilageSideLang: 'ko', sideMode: 'chart', sideSpread: 'all', carm: null, sono: null, ending: null, levelSep: 'comma', klg: 'paren', mark: '◈', lineJoin: 'lines' }),
  preset('가이드 + 영어 + 시행함', { sideStyle: 'Rt', cartilageSideLang: 'en', sideMode: 'chart', sideSpread: 'all', carm: 'C-arm guide 하에', sono: 'Sono guide 하에', ending: '시행함', levelSep: 'comma', klg: 'paren', mark: '', lineJoin: 'lines' }),
  preset('한글 문장', { sideStyle: 'ko', cartilageSideLang: 'ko', sideMode: 'chart', sideSpread: 'all', carm: 'C-arm 가이드 하에', sono: '초음파 가이드 하에', ending: '시행함', levelSep: 'dash', klg: 'ko', mark: '', lineJoin: 'lines' }),
  preset('한 줄 이어쓰기', { sideStyle: 'Rt', cartilageSideLang: 'en', sideMode: 'chart', sideSpread: 'all', carm: 'C-arm 가이드하에', sono: 'Sono 가이드하에', ending: '시행함', levelSep: 'dash', klg: 'plain', mark: '', lineJoin: 'oneLine' }),
])

/** [비슷한 게 없어요]·붙여 넣기에서 못 읽은 칸이 시작하는 보기(보기 2, 0부터 셈) */
export const NONE_PRESET = 1
