// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import { errorInfo } from '@/lib/errors'
import type { AiErrorCode, CardTag, ShownReport } from '@/types/aiReport'
import type { ErrorCode } from '@/types/errors'
import { ReportBody, type ReportBodyState } from './ReportBody'

// AI 리포트 본문(spec ai-report-screen REQ-708~711의 그리는 부분, 시안 docs/mockups/ai-report/index.html reportView·main).
// 부품은 props만 받아 그린다. 숫자는 이 파일 안에서만 지어낸다. jsdom은 CSS를 계산하지 않아 모양은 클래스로 본다

afterEach(cleanup)

const TODAY = '2026-11-18'
const NOW = new Date('2026-11-18T05:20:00.000Z')
const SUMMARY = '10월은 신환이 9월보다 크게 늘었습니다.'
const REPORT: ShownReport = {
  month: '2026-10',
  partial: false,
  summary: SUMMARY,
  cards: [
    { tag: 'up', text: '신환이 늘었습니다.', metric: 'total.newPatients', basis: '근거 · 신환 9월 486명 → 10월 524명 · 작년 10월 470명' },
    { tag: 'down', text: '도수치료 환자가 줄었습니다.', metric: 'group:1.patients', basis: "근거 · 처방 그룹 '도수치료' 환자 9월 412명 → 10월 368명" },
    { tag: 'watch', text: '재방문율을 살펴볼 만합니다.', metric: 'revisit.within7', basis: '근거 · 신환 7일 재방문율 9월 41.2% → 10월 38.6%' },
    { tag: 'guess', text: '연휴로 예약이 밀린 것으로 보입니다.', metric: 'group:1.patients', basis: '근거 · 전체 환자 9월 3,182명 → 10월 3,341명' },
  ],
  model: 'claude-opus-5-5',
  createdAt: '2026-11-02T00:12:00.000Z', // 한국 시각 11월 2일 오전 9:12
}
const THIS_MONTH_REPORT: ShownReport = { ...REPORT, month: '2026-11', partial: true }
const ENDED_PARTIAL_REPORT: ShownReport = { ...REPORT, partial: true }

const STALE_TITLE = '이 리포트를 만든 뒤 숫자가 바뀌었어요'
const STALE_BODY = '[다시 분석]을 누르면 새 숫자로 다시 써요.'

type ReportState = Extract<ReportBodyState, { kind: 'report' }>
const reportState = (over: Partial<ReportState> = {}): ReportState => ({
  kind: 'report',
  report: REPORT,
  stale: false,
  error: null,
  busySeconds: null,
  copied: false,
  ...over,
})

function draw(state: ReportBodyState, over: Partial<ComponentProps<typeof ReportBody>> = {}) {
  const handlers = { onAnalyze: vi.fn(), onRetryRead: vi.fn(), onCopy: vi.fn() }
  const { container } = render(<ReportBody state={state} month="2026-10" today={TODAY} now={NOW} {...handlers} {...over} />)
  return { ...handlers, container }
}

const buttonNames = () => screen.queryAllByRole('button').map((button) => button.textContent)
const isBefore = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

// 오류 상자 하나: 무엇·어떻게·번호
function expectErrorCard(code: ErrorCode): HTMLElement {
  const alert = screen.getByRole('alert')
  within(alert).getByText(errorInfo(code).what)
  within(alert).getByText(errorInfo(code).fix)
  within(alert).getByText(`오류 번호 ${code}`)
  return alert
}

describe('AC-709.1: 리포트 본문', () => {
  it('AC-709.1: 달 이름 보고·만든 때와 모델 이름이 한 줄로 있다("에 만들었어요"가 겹치지 않는다)', () => {
    draw(reportState())
    screen.getByText('2026년 10월 보고')
    screen.getByText('11월 2일 오전 9:12에 만들었어요 · Claude Opus 5.5')
  })

  it('AC-709.1: 만든 때는 받은 now로 잰다 — 1분 안이면 "방금 만들었어요"', () => {
    draw(reportState(), { now: new Date('2026-11-02T00:12:30.000Z') })
    screen.getByText('방금 만들었어요 · Claude Opus 5.5')
  })

  it('AC-709.1: 모르는 모델 이름은 받은 글자 그대로다', () => {
    draw(reportState({ report: { ...REPORT, model: 'claude-other-1' } }))
    screen.getByText('11월 2일 오전 9:12에 만들었어요 · claude-other-1')
  })

  it('AC-709.1: 요약은 제목 2단계다', () => {
    draw(reportState())
    screen.getByRole('heading', { level: 2, name: SUMMARY })
  })

  it('AC-709.1: 카드 목록은 <ol>이고 카드마다 칩·문장·근거가 저장 순서대로 있다', () => {
    draw(reportState())
    const list = screen.getByRole('list')
    expect(list.tagName).toBe('OL')
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(REPORT.cards.length)
    const labels = ['늘었어요', '줄었어요', '살펴볼 것', '추정']
    REPORT.cards.forEach((card, i) => {
      within(items[i]).getByText(labels[i])
      within(items[i]).getByText(card.text)
      within(items[i]).getByText(card.basis)
    })
  })

  it('AC-709.1: 본문에는 [복사] 단추 하나뿐이다(머리의 [다시 분석]은 TASK-9가 그린다)', () => {
    draw(reportState())
    expect(buttonNames()).toEqual(['복사'])
  })
})

describe('AC-709.2: 카드 꼬리표', () => {
  it.each<[CardTag, string, string, boolean, boolean]>([
    ['up', '늘었어요', ds.chip.positive, true, true],
    ['down', '줄었어요', ds.chip.negative, true, false],
    ['watch', '살펴볼 것', ds.chip.warning, false, false],
    ['guess', '추정', ds.chip.neutral, false, false],
  ])('AC-709.2: %s는 "%s", 칩 모양과 아이콘이 표대로다', (tag, label, chipClass, hasIcon, rotated) => {
    draw(reportState({ report: { ...REPORT, cards: [{ tag, text: '문장', metric: 'm', basis: '근거' }] } }))
    const chip = screen.getByText(label)
    expect(chip.getAttribute('class')).toBe(chipClass)
    const icon = chip.querySelector('svg')
    expect(icon !== null).toBe(hasIcon)
    if (icon) {
      expect(icon.getAttribute('width')).toBe('12')
      expect(icon.getAttribute('class')?.split(' ').includes('rotate-180') ?? false).toBe(rotated)
    }
  })
})

describe('AC-709.3: AI 답은 글자로만 그린다', () => {
  it('AC-709.3: 요약·문장·근거의 태그 글자가 그대로 보이고 b·script 요소가 생기지 않는다', () => {
    const summary = '<b>x</b> 요약 <script>alert(1)</script>'
    const text = '<b>x</b> 문장 <script>alert(1)</script>'
    const basis = '<b>x</b> 근거 <script>alert(1)</script>'
    const { container } = draw(reportState({ report: { ...REPORT, summary, cards: [{ tag: 'up', text, metric: 'm', basis }] } }))
    screen.getByText(summary)
    screen.getByText(text)
    screen.getByText(basis)
    expect(container.querySelector('b, script')).toBeNull()
  })
})

describe('AC-709.4: 달이 끝나기 전 숫자로 만든 리포트', () => {
  it('AC-709.4: partial + 이번 달 → 칩 "진행 중"과 안내', () => {
    draw(reportState({ report: THIS_MONTH_REPORT }), { month: '2026-11' })
    expect(screen.getByText('진행 중').getAttribute('class')).toBe(ds.chip.warning)
    screen.getByText('11월은 아직 끝나지 않은 달이에요')
    screen.getByText('숫자가 적게 보일 수 있어요. 달이 끝난 뒤 다시 분석하면 다 찬 숫자로 써요.')
  })

  it('AC-2008.3: partial + 지난 달 → warning 칩 "덜 찬 숫자"와 통계 탭에서 다시 불러오라는 안내, 옛 "달 끝나기 전" 글은 없다', () => {
    draw(reportState({ report: ENDED_PARTIAL_REPORT }))
    expect(screen.getByText('덜 찬 숫자').getAttribute('class')).toBe(ds.chip.warning)
    screen.getByText('이 리포트는 10월 숫자가 다 차기 전에 만들었어요')
    screen.getByText('숫자가 적게 잡혀 있을 수 있어요. 통계 탭에서 그 달을 다시 불러온 뒤 [다시 분석]을 눌러 주세요.')
    expect(screen.queryByText('달 끝나기 전')).toBeNull()
    expect(screen.queryByText(/끝나기 전에 만들었어요/)).toBeNull()
  })

  it('AC-709.4·AC-2008.2: partial false → 칩도 안내도 없다', () => {
    draw(reportState())
    expect(screen.queryByText('진행 중')).toBeNull()
    expect(screen.queryByText('달 끝나기 전')).toBeNull()
    expect(screen.queryByText('덜 찬 숫자')).toBeNull()
    expect(screen.queryByText(/아직 끝나지 않은 달/)).toBeNull()
    expect(screen.queryByText(/끝나기 전에 만들었어요/)).toBeNull()
    expect(screen.queryByText(/다 차기 전에 만들었어요/)).toBeNull()
  })
})

describe('AC-709.5: 숫자가 바뀐 리포트(안내 부분)', () => {
  it('AC-709.5: stale 참이면 두 글이 있고 안내 상자 어디에도 달 이름이 없다', () => {
    draw(reportState({ stale: true }))
    const title = screen.getByText(STALE_TITLE)
    screen.getByText(STALE_BODY)
    expect(title.parentElement?.textContent).toContain(STALE_BODY)
    expect(title.parentElement?.textContent).not.toContain('월')
  })

  it('AC-709.5: stale 거짓이면 안내가 없다', () => {
    draw(reportState())
    expect(screen.queryByText(STALE_TITLE)).toBeNull()
    expect(screen.queryByText(STALE_BODY)).toBeNull()
  })

  it('AC-709.5: stale 거짓이면 다른 안내(오류)가 있어도 숫자 바뀜 안내는 없다', () => {
    draw(reportState({ error: 'E-AI-BUSY' }))
    screen.getByRole('alert')
    expect(screen.queryByText(STALE_TITLE)).toBeNull()
    expect(screen.queryByText(STALE_BODY)).toBeNull()
  })
})

describe('AC-709.6: [복사] 단추(그리는 부분)', () => {
  it('AC-709.6: 복사 전 글자는 "복사"이고 누르면 onCopy가 한 번 불린다', async () => {
    const { onCopy } = draw(reportState())
    const button = screen.getByRole('button', { name: '복사' })
    expect(button.querySelector('rect')).not.toBeNull() // copy 아이콘
    await userEvent.setup().click(button)
    expect(onCopy).toHaveBeenCalledTimes(1)
  })

  it('AC-709.6: copied면 글자가 "복사했어요"이고 check 아이콘이다', () => {
    draw(reportState({ copied: true }))
    const button = screen.getByRole('button', { name: '복사했어요' })
    expect(button.querySelector('svg')).not.toBeNull()
    expect(button.querySelector('rect')).toBeNull()
    expect(screen.queryByRole('button', { name: '복사' })).toBeNull()
  })

  it('AC-709.6: 두 글자 모두 같은 작은 보조 단추이고 폭이 흔들리지 않게 최소 폭 112px을 갖는다', () => {
    const { unmount } = render(<ReportBody state={reportState()} month="2026-10" today={TODAY} now={NOW} onAnalyze={vi.fn()} onRetryRead={vi.fn()} onCopy={vi.fn()} />)
    const before = screen.getByRole('button', { name: '복사' }).getAttribute('class')
    unmount()
    draw(reportState({ copied: true }))
    expect(screen.getByRole('button', { name: '복사했어요' }).getAttribute('class')).toBe(before)
    expect(before).toContain(ds.button.secondarySmall)
    expect(before?.split(' ')).toContain('min-w-28')
  })
})

describe('AC-708.4: 읽는 중', () => {
  it.each([
    ['2026-10', '10월 리포트를 읽고 있어요'],
    ['2026-01', '1월 리포트를 읽고 있어요'],
  ])('AC-708.4: %s는 status에 "%s"이고 단추가 없으며 움직임이 없다', (month, text) => {
    const { container } = draw({ kind: 'loading' }, { month })
    expect(screen.getByRole('status').textContent).toBe(text)
    expect(screen.queryByRole('button')).toBeNull()
    expect(container.innerHTML).not.toMatch(/animate-/)
  })
})

describe('AC-708.5: 읽기 실패', () => {
  it('AC-708.5: 오류 상자에 무엇·어떻게·번호가 있고 [다시 읽기]가 보조 단추다', () => {
    draw({ kind: 'readError' })
    expectErrorCard('E-AI-READ')
    screen.getByText('저장한 AI 리포트를 읽지 못했어요')
    expect(screen.getByRole('button', { name: '다시 읽기' }).getAttribute('class')).toContain(ds.button.secondary)
  })

  it('AC-708.5: [다시 읽기]를 누르면 onRetryRead가 한 번이고 [AI 분석]·[다시 분석]은 없다', async () => {
    const { onRetryRead, onAnalyze } = draw({ kind: 'readError' })
    expect(buttonNames()).toEqual(['다시 읽기'])
    await userEvent.setup().click(screen.getByRole('button', { name: '다시 읽기' }))
    expect(onRetryRead).toHaveBeenCalledTimes(1)
    expect(onAnalyze).not.toHaveBeenCalled()
  })
})

describe('AC-710.1: 리포트 없는 달', () => {
  it('AC-710.1: 제목 2단계와 견주는 달이 든 설명이 있다', () => {
    draw({ kind: 'empty', error: null })
    screen.getByRole('heading', { level: 2, name: '10월 리포트를 아직 만들지 않았어요' })
    screen.getByText('[AI 분석]을 누르면 9월, 작년 10월과 견줘 원장님께 드릴 보고를 1분쯤 걸려 써 드려요.')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-710.1: 1월이면 지난달 자리가 "작년 12월"이다', () => {
    draw({ kind: 'empty', error: null }, { month: '2026-01' })
    screen.getByRole('heading', { level: 2, name: '1월 리포트를 아직 만들지 않았어요' })
    screen.getByText('[AI 분석]을 누르면 작년 12월, 작년 1월과 견줘 원장님께 드릴 보고를 1분쯤 걸려 써 드려요.')
  })

  it('AC-710.1: 큰 주 단추 [AI 분석]을 누르면 onAnalyze가 한 번이고 [다시 분석]은 없다', async () => {
    const { onAnalyze } = draw({ kind: 'empty', error: null })
    expect(buttonNames()).toEqual(['AI 분석'])
    const button = screen.getByRole('button', { name: 'AI 분석' })
    expect(button.getAttribute('class')).toContain(ds.button.primaryLarge)
    await userEvent.setup().click(button)
    expect(onAnalyze).toHaveBeenCalledTimes(1)
  })
})

describe('AC-710.2·AC-710.3: 리포트 없는 달의 분석 중', () => {
  it('AC-710.2: 제목·status 글·초 글자가 있고 초는 받은 값이다', () => {
    draw({ kind: 'busyEmpty', seconds: 12 })
    screen.getByRole('heading', { level: 2, name: '10월 숫자를 읽고 있어요' })
    expect(screen.getByRole('status').textContent).toBe('1분쯤 걸려요. 이 화면을 그대로 두고 기다려 주세요.')
    screen.getByText('지금까지 12초')
  })

  it('AC-710.2: 0초도 그린다', () => {
    draw({ kind: 'busyEmpty', seconds: 0 })
    screen.getByText('지금까지 0초')
  })

  it('AC-710.2: "분석 중"은 aria-busy 큰 주 단추이고 disabled가 아니다', () => {
    draw({ kind: 'busyEmpty', seconds: 12 })
    const button = screen.getByRole('button', { name: '분석 중' })
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(button.hasAttribute('disabled')).toBe(false)
    expect(button.getAttribute('class')).toContain(ds.button.primaryLarge)
  })

  it('AC-710.3: "분석 중"을 눌러도 아무것도 부르지 않는다', async () => {
    const { onAnalyze, onCopy, onRetryRead } = draw({ kind: 'busyEmpty', seconds: 12 })
    await userEvent.setup().click(screen.getByRole('button', { name: '분석 중' }))
    expect(onAnalyze).not.toHaveBeenCalled()
    expect(onCopy).not.toHaveBeenCalled()
    expect(onRetryRead).not.toHaveBeenCalled()
  })
})

describe('AC-710.5: 통계가 없는 달', () => {
  it('AC-710.5: 제목 2단계·설명·오류 번호가 있고 빨간 오류 상자는 아니다', () => {
    draw({ kind: 'noData' })
    screen.getByRole('heading', { level: 2, name: '이 달 통계가 아직 없어요' })
    screen.getByText('통계 탭에서 그 달 비트 자료를 먼저 넣어 주세요.')
    screen.getByText('오류 번호 E-AI-NO-DATA')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-710.5: /stats로 가는 보조 단추 모양 링크에 화살표가 있고 [AI 분석]이 없다', () => {
    draw({ kind: 'noData' })
    const link = screen.getByRole('link', { name: '통계 탭으로' })
    expect(link.getAttribute('href')).toBe('/stats')
    expect(link.getAttribute('class')).toContain(ds.button.secondary)
    expect(link.getAttribute('class')?.split(' ')).toContain('no-underline')
    expect(link.querySelector('svg')).not.toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('AC-710.6: 분석 오류', () => {
  const CODES = ['E-AI-BUSY', 'E-AI-LIMIT', 'E-AI-FAILED'] as const

  it.each(CODES)('AC-710.6: 리포트 없는 달 + %s → 오류 상자가 위이고 [AI 분석] 빈 화면이 그대로다', (error) => {
    draw({ kind: 'empty', error })
    const alert = expectErrorCard(error)
    const heading = screen.getByRole('heading', { level: 2, name: '10월 리포트를 아직 만들지 않았어요' })
    expect(isBefore(alert, heading)).toBe(true)
    screen.getByRole('button', { name: 'AI 분석' })
  })

  it.each(CODES)('AC-710.6: 리포트 있는 달 + %s → 오류 상자와 리포트가 함께 있다', (error) => {
    draw(reportState({ error }))
    expectErrorCard(error)
    screen.getByRole('heading', { level: 2, name: SUMMARY })
    screen.getByRole('list')
  })
})

describe('AC-711.3: 리포트 있는 달의 다시 분석 중', () => {
  it('AC-711.3: 옛 리포트와 accent 안내가 함께 있다', () => {
    draw(reportState({ busySeconds: 12 }))
    const status = screen.getByRole('status')
    within(status).getByText('새 리포트를 만들고 있어요')
    within(status).getByText('1분쯤 걸려요. 다 되면 아래 리포트가 바뀌어요.')
    expect(status.getAttribute('class')?.split(' ')).toContain('bg-accent-soft')
    screen.getByRole('heading', { level: 2, name: SUMMARY })
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(REPORT.cards.length)
  })

  it('AC-711.3: 초 글자는 받은 값이고 1초마다 읽지 않게 aria-live="off"다', () => {
    draw(reportState({ busySeconds: 12 }))
    expect(within(screen.getByRole('status')).getByText('지금까지 12초').getAttribute('aria-live')).toBe('off')
  })

  it('AC-711.3: 0초도 다시 분석 중이다', () => {
    draw(reportState({ busySeconds: 0 }))
    within(screen.getByRole('status')).getByText('지금까지 0초')
  })

  it('AC-711.3: busySeconds가 null이면 안내가 없다', () => {
    draw(reportState())
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByText('새 리포트를 만들고 있어요')).toBeNull()
  })
})

describe('AC-711.4: 리포트 있는 달의 다시 분석 오류', () => {
  it.each<AiErrorCode>(['E-AI-BUSY', 'E-AI-LIMIT', 'E-AI-FAILED', 'E-AI-NO-DATA'])('AC-711.4: %s → 오류 상자가 리포트 위에 있다', (error) => {
    draw(reportState({ error }))
    const alert = expectErrorCard(error)
    expect(isBefore(alert, screen.getByText('2026년 10월 보고'))).toBe(true)
    expect(isBefore(alert, screen.getByRole('heading', { level: 2, name: SUMMARY }))).toBe(true)
  })

  it('AC-711.4: E-AI-NO-DATA여도 통계 없음 빈 화면으로 바뀌지 않는다', () => {
    draw(reportState({ error: 'E-AI-NO-DATA' }))
    expect(screen.queryByRole('link', { name: '통계 탭으로' })).toBeNull()
    expect(screen.queryByRole('heading', { level: 2, name: '이 달 통계가 아직 없어요' })).toBeNull()
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(REPORT.cards.length)
  })
})

describe('AC-711.3·AC-711.4·AC-709.4·AC-709.5: 안내 묶음의 차례', () => {
  it('AC-711.3·AC-711.4·AC-709.4·AC-709.5: 다시 분석 안내 → 오류 → 진행 중 → 숫자 바뀜 → 리포트 순서다', () => {
    draw(reportState({ report: THIS_MONTH_REPORT, stale: true, error: 'E-AI-BUSY', busySeconds: 5 }), { month: '2026-11' })
    const order = [
      screen.getByText('새 리포트를 만들고 있어요'),
      screen.getByRole('alert'),
      screen.getByText('11월은 아직 끝나지 않은 달이에요'),
      screen.getByText(STALE_TITLE),
      screen.getByText('2026년 11월 보고'),
    ]
    for (let i = 1; i < order.length; i += 1) {
      expect(isBefore(order[i - 1], order[i]), `${i - 1}번 뒤에 ${i}번`).toBe(true)
    }
  })

  it('AC-709.4·AC-709.5: 안내 상자는 warning 바탕이다', () => {
    draw(reportState({ report: THIS_MONTH_REPORT, stale: true }), { month: '2026-11' })
    for (const title of ['11월은 아직 끝나지 않은 달이에요', STALE_TITLE]) {
      expect(screen.getByText(title).parentElement?.getAttribute('class')?.split(' ')).toContain('bg-warning-soft')
    }
  })

  it('AC-709.1: 안내가 하나도 없으면 묶음 상자도 그리지 않는다', () => {
    const { container } = draw(reportState())
    expect(container.querySelectorAll('div:empty')).toHaveLength(0)
    expect(container.textContent?.startsWith('2026년 10월 보고')).toBe(true)
  })
})
