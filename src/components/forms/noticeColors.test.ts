import { describe, expect, it } from 'vitest'
import { onWhite, type GuideColors } from '@/lib/forms/logoColors'
import { contrastWithWhite } from '@/lib/forms/themes'
import { NOTICE_INK, NOTICE_LEAD, noticeAutoColors } from './noticeColors'

// 진료일정(휴진) 안내의 [자동] 제목·강조 색 (spec form-style REQ-6803 AC-6803.1·AC-6803.2, design.md 4절, TASK-3).
// 로고 두 색이 있으면 로고 색, 없으면 지금 색(제목 #262626, 강조 = 배경 그림 강조색 → 테마 강조색)

const YELLOW_LOGO: GuideColors = { main: '#e6e006', dark: '#33310a' } // 옅은 바탕색 → onWhite로 어둡게
const BLUE_LOGO: GuideColors = { main: '#1f5fbf', dark: '#0f1a2e' } // 이미 흰색과 대비 3 이상

describe('AC-6803.1: 진료일정 안내 글자 지금 색', () => {
  it("AC-6803.1: '진료일정안내'·카드 이름의 지금 색은 #262626이다", () => {
    expect(NOTICE_INK).toBe('#262626')
  })

  it('AC-6803.4: 안내 두 줄의 지금 색은 #3a3a3a다(본문 직접 고르기 시작 색, AC-6801.3)', () => {
    expect(NOTICE_LEAD).toBe('#3a3a3a')
  })
})

describe('AC-6803.1: noticeAutoColors — [자동] 제목 색', () => {
  it('AC-6803.1: 로고 두 색이 있으면 제목은 로고 띠 색(dark)이다', () => {
    expect(noticeAutoColors({ logoColors: YELLOW_LOGO, backgroundAccent: null, themeAccent: '#2b5bb5' }).title).toBe('#33310a')
    expect(noticeAutoColors({ logoColors: BLUE_LOGO, backgroundAccent: '#aa3355', themeAccent: '#2b5bb5' }).title).toBe('#0f1a2e')
  })

  it('AC-6803.1: 로고 두 색이 없으면 제목은 지금 색 #262626이다(배경·테마와 상관없다)', () => {
    expect(noticeAutoColors({ logoColors: null, backgroundAccent: null, themeAccent: '#2b5bb5' }).title).toBe(NOTICE_INK)
    expect(noticeAutoColors({ logoColors: null, backgroundAccent: '#aa3355', themeAccent: '#d9432f' }).title).toBe(NOTICE_INK)
  })
})

describe('AC-6803.2: noticeAutoColors — [자동] 강조 색', () => {
  it('AC-6803.2: 로고 두 색이 있으면 강조 색은 onWhite(main)이다 — 옅은 바탕색은 흰색과 대비 3 이상이 되게 어둡게', () => {
    const auto = noticeAutoColors({ logoColors: YELLOW_LOGO, backgroundAccent: '#aa3355', themeAccent: '#2b5bb5' })
    expect(auto.accent).toBe(onWhite(YELLOW_LOGO.main))
    expect(auto.accent).not.toBe(YELLOW_LOGO.main)
    expect(contrastWithWhite(auto.accent)).toBeGreaterThanOrEqual(3)
  })

  it('AC-6803.2: 로고 바탕색이 이미 흰색과 대비 3 이상이면 그 색 그대로다(배경 그림 강조색보다 앞선다)', () => {
    expect(noticeAutoColors({ logoColors: BLUE_LOGO, backgroundAccent: '#aa3355', themeAccent: '#2b5bb5' }).accent).toBe('#1f5fbf')
  })

  it('AC-6803.2: 로고 두 색이 없으면 지금처럼 배경 그림 강조색 → 테마 강조색 차례다', () => {
    expect(noticeAutoColors({ logoColors: null, backgroundAccent: '#aa3355', themeAccent: '#2b5bb5' }).accent).toBe('#aa3355')
    expect(noticeAutoColors({ logoColors: null, backgroundAccent: null, themeAccent: '#2b5bb5' }).accent).toBe('#2b5bb5')
  })

  it('AC-6803.2: 돌려주는 값은 { title, accent } 두 열쇠뿐이다', () => {
    expect(Object.keys(noticeAutoColors({ logoColors: null, backgroundAccent: null, themeAccent: '#2b5bb5' })).sort()).toEqual(['accent', 'title'])
  })
})
