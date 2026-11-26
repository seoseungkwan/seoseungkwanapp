// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FillJob, FillReply } from '@/lib/gsheet/shapes'
import type { FillDone, FillStatus } from '@/lib/gsheet/status'
import { ResultLine } from './ResultLine'
import { OldVersionNotice, SheetBand, StopNotice } from './SheetBand'

// 수납일지 구글 시트 위 한 줄 띠·결과 줄·멈춤 알림·옛 판 안내(spec google-link REQ-8514·8515·8541, TASK-15).
// 기대 글은 승인 시안 notes-sunap.md '공통'·filling·done·done-warn·nobit·err-google 글자를 그대로 적었다(labels.ts 상수를 쓰지 않는다).
// 옛 판 두 줄은 design.md 2절 표 2. 시각은 한국 시간(TZ=Asia/Seoul): 05:35Z = 14:35

const TODAY = '2026-11-26'
const norm = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()

function done(over: Partial<FillDone> = {}): FillDone {
  return { at: '2026-11-26T05:35:00Z', day: TODAY, via: 'auto', mode: 'fillEmpty', outcome: 'ok', code: null, rows: 12, ...over }
}

function status(over: Partial<FillStatus> = {}): FillStatus {
  return { pc: 'filler', oldHelper: false, oldExtension: false, filling: null, last: null, lastOk: null, stopped: null, result: null, ...over }
}

function reply(over: Partial<FillReply> = {}): FillReply {
  return {
    rows: 12,
    patients: 10,
    added: 0,
    filled: 0,
    overwritten: 0,
    skipped: 0,
    full: false,
    cancelCleared: 0,
    cancelKept: 0,
    freeFixed: 0,
    inserted: 0,
    cleaned: 0,
    shareFailed: 0,
    created: false,
    ratioFixed: 0,
    ratioSkipped: [],
    ratioSkippedCount: 0,
    ratioFailed: false,
    split: 0,
    free: 0,
    paidOnly: 0,
    notes: 0,
    notPut: { noName: 0, unlinked: 0, negative: 0, noChart: 0 },
    fileId: null,
    sheetGid: null,
    version: '8',
    oldCode: false,
    ...over,
  }
}

const handlers = () => ({ onFillNow: vi.fn(), onOverwrite: vi.fn(), onOpenSettings: vi.fn() })

function renderBand(s: FillStatus, over: { autoOn?: boolean; everyMin?: number; openHref?: string | null } = {}) {
  const h = handlers()
  render(
    <SheetBand
      title="샘플정형외과의원 일일수납일지"
      picker={<button type="button">2026년 11월</button>}
      day={26}
      status={s}
      autoOn={over.autoOn ?? true}
      everyMin={over.everyMin ?? 5}
      today={TODAY}
      openHref={over.openHref === undefined ? 'https://docs.google.com/spreadsheets/d/FakeFileNov2026xxxxxxxxxx/edit#gid=123456' : over.openHref}
      {...h}
    />,
  )
  return h
}

const band = () => screen.getByTestId('sheet-band')
const statusPart = () => screen.getByTestId('sheet-band-status')

afterEach(cleanup)

describe('AC-8514.3: 위 한 줄 띠 — 시트 그림 + 파일 이름 + 달 고르기 + 그날 시트', () => {
  it('AC-8514.3: 파일 이름 앞(달 자리 뺀 것) · 달 고르기 · "· 26일 시트"가 차례대로 있다', () => {
    renderBand(status({ lastOk: done() }))
    const text = norm(band())
    expect(text.startsWith('샘플정형외과의원 일일수납일지 2026년 11월 · 26일 시트')).toBe(true)
  })

  it('AC-8514.3: [새 창으로 열기 ↗]는 받은 주소를 새 창(noopener)으로 여는 링크다', () => {
    renderBand(status({ lastOk: done() }))
    const link = screen.getByRole('link', { name: '새 창으로 열기' })
    expect(link.getAttribute('href')).toBe('https://docs.google.com/spreadsheets/d/FakeFileNov2026xxxxxxxxxx/edit#gid=123456')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('AC-8514.3: [새 창으로 열기]는 단추 모양 링크라 밑줄이 없다(시안, 화면 사진에서 밑줄 보임 — TASK-23 (아))', () => {
    renderBand(status({ lastOk: done() }))
    expect(screen.getByRole('link', { name: '새 창으로 열기' }).className.split(/\s+/)).toContain('no-underline')
  })
})

describe('AC-8515.1: 넣는 PC 띠 — 켜짐·꺼짐·확인 필요·오늘 아직', () => {
  it('AC-8515.1: 켜짐 = 초록 칩 [저절로 넣기 켜짐] + "웹앱이 열려 있는 동안 5분마다 · 마지막 14:35 (12줄)"', () => {
    renderBand(status({ lastOk: done({ rows: 12 }) }))
    const chip = screen.getByText('저절로 넣기 켜짐')
    expect(chip.className).toContain('text-positive')
    expect(norm(statusPart())).toBe('저절로 넣기 켜짐 웹앱이 열려 있는 동안 5분마다 · 마지막 14:35 (12줄)')
  })

  it('AC-8515.1: (n줄)은 마지막으로 넣은 오늘 시트 줄 수, 간격은 설정 몇 분마다', () => {
    renderBand(status({ lastOk: done({ at: '2026-11-26T06:05:00Z', rows: 7 }) }), { everyMin: 10 })
    expect(norm(statusPart())).toBe('저절로 넣기 켜짐 웹앱이 열려 있는 동안 10분마다 · 마지막 15:05 (7줄)')
  })

  it('AC-8515.1: 오늘 아직 안 넣음 = "웹앱이 열려 있는 동안 5분마다 · 오늘 아직 넣지 않음"(어제 넣은 것은 오늘 것이 아님)', () => {
    renderBand(status({ lastOk: done({ at: '2026-11-25T05:35:00Z', day: '2026-11-25' }) }))
    expect(norm(statusPart())).toBe('저절로 넣기 켜짐 웹앱이 열려 있는 동안 5분마다 · 오늘 아직 넣지 않음')
  })

  it('AC-8515.1: 꺼짐 = 회색 칩 [저절로 넣기 꺼짐] + "설정 › 저절로 넣기에서 켤 수 있어요"', () => {
    renderBand(status({ lastOk: done() }), { autoOn: false })
    expect(norm(statusPart())).toBe('저절로 넣기 꺼짐 설정 › 저절로 넣기에서 켤 수 있어요')
    expect(screen.getByText('저절로 넣기 꺼짐').className).toContain('text-ink-2')
  })

  it('AC-8515.1: 확인 필요 = 주황 칩 [저절로 넣기 켜짐 · 확인 필요] + 마지막 시각 그대로(done-warn)', () => {
    renderBand(status({ lastOk: done({ at: '2026-11-26T05:40:00Z', outcome: 'warn' }) }))
    const chip = screen.getByText('저절로 넣기 켜짐 · 확인 필요')
    expect(chip.className).toContain('text-warning')
    expect(norm(statusPart())).toBe('저절로 넣기 켜짐 · 확인 필요 웹앱이 열려 있는 동안 5분마다 · 마지막 14:40 (12줄)')
  })

  it('AC-8515.1: 넣는 PC 단추는 [지금 넣기](파란) [덮어쓰기…] [새 창으로 열기 ↗] [설정] 차례', () => {
    const h = renderBand(status({ lastOk: done() }))
    const names = [...band().querySelectorAll('button, a')].map((el) => norm(el)).filter((t) => t !== '2026년 11월')
    expect(names).toEqual(['지금 넣기', '덮어쓰기…', '새 창으로 열기', '설정'])
    const now = screen.getByRole('button', { name: '지금 넣기' })
    expect(now.className).toContain('bg-accent')
    fireEvent.click(now)
    fireEvent.click(screen.getByRole('button', { name: '덮어쓰기…' }))
    fireEvent.click(screen.getByRole('button', { name: '설정' }))
    expect(h.onFillNow).toHaveBeenCalledTimes(1)
    expect(h.onOverwrite).toHaveBeenCalledTimes(1)
    expect(h.onOpenSettings).toHaveBeenCalledTimes(1)
  })
})

describe('AC-8515.2: 넣는 중 띠', () => {
  const job: FillJob = { day: TODAY, mode: 'fillEmpty', via: 'hand', auto: false }

  it('AC-8515.2: 넣는 중 = 넣는 중 그림 + "넣는 중…" + "26일 시트 · 빈 칸만 채우기 · 비트에서 읽어 구글 시트에 넣고 있어요"', () => {
    renderBand(status({ filling: job, lastOk: done() }))
    expect(norm(statusPart())).toBe('넣는 중… 26일 시트 · 빈 칸만 채우기 · 비트에서 읽어 구글 시트에 넣고 있어요')
    // 시안의 도는 그림 자리 — 돌지 않는 그림(앱에서 도는 표시는 ReadStatus의 .bit-read-spin뿐, classes.test.ts AC-601.17)
    expect(statusPart().querySelector('svg[data-icon="filling"]')).not.toBeNull()
    expect(statusPart().querySelector('.bit-read-spin')).toBeNull()
  })

  it('AC-8515.2: 덮어쓰기로 넣는 중이면 "덮어쓰기", 날짜는 넣는 날', () => {
    renderBand(status({ filling: { day: '2026-11-03', mode: 'overwrite', via: 'hand', auto: false } }))
    expect(norm(statusPart())).toBe('넣는 중… 3일 시트 · 덮어쓰기 · 비트에서 읽어 구글 시트에 넣고 있어요')
  })

  it('AC-8515.2: [지금 넣기]·[덮어쓰기…] 잠김, [새 창으로 열기]·[설정]은 그대로', () => {
    const h = renderBand(status({ filling: job }))
    const now = screen.getByRole('button', { name: '지금 넣기' })
    expect(now).toHaveProperty('disabled', true)
    expect(now.getAttribute('aria-busy')).toBe('true')
    expect(screen.getByRole('button', { name: '덮어쓰기…' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('link', { name: '새 창으로 열기' })).toBeTruthy()
    const settings = screen.getByRole('button', { name: '설정' })
    expect(settings).toHaveProperty('disabled', false)
    fireEvent.click(now)
    expect(h.onFillNow).not.toHaveBeenCalled()
  })
})

describe('AC-8514.7: 넣는 PC가 아님(nobit)', () => {
  it.each(['viewer', 'unknown'] as const)('AC-8514.7: %s — [보기만] 칩 + "이 PC에서는 넣기를 못 해요." + 비트 PC 마지막 넣기, 단추는 [새 창으로 열기 ↗]만', (pc) => {
    renderBand(status({ pc, lastOk: done() }))
    expect(screen.getByText('보기만').className).toContain('text-ink-2')
    expect(norm(statusPart())).toBe('보기만 이 PC에서는 넣기를 못 해요. 비트 PC에서 웹앱이 열려 있으면 저절로 넣어요. · 비트 PC 마지막 넣기 14:35 (12줄)')
    expect(screen.queryByRole('button', { name: '지금 넣기' })).toBeNull()
    expect(screen.queryByRole('button', { name: '덮어쓰기…' })).toBeNull()
    expect(screen.queryByRole('button', { name: '설정' })).toBeNull()
    expect(screen.queryByRole('button', { name: '다시 해 보기' })).toBeNull()
    expect(screen.getByRole('link', { name: '새 창으로 열기' })).toBeTruthy()
  })

  it('AC-8514.7: 오늘 넣은 것이 없으면 마지막 넣기 글은 뺀다', () => {
    renderBand(status({ pc: 'viewer' }))
    expect(norm(statusPart())).toBe('보기만 이 PC에서는 넣기를 못 해요. 비트 PC에서 웹앱이 열려 있으면 저절로 넣어요.')
  })

  it('AC-8514.7: 넣는 PC가 아니면 넣기가 멈춰 있어도 [다시 해 보기]·멈춤 글이 없다', () => {
    renderBand(status({ pc: 'viewer', stopped: done({ outcome: 'fail', code: 'E-GSHEET-NET' }) }))
    expect(screen.queryByText('넣기 멈춤')).toBeNull()
    expect(screen.queryByRole('button', { name: '다시 해 보기' })).toBeNull()
  })
})

describe('AC-8514.7·AC-8541.2: 옛 도우미·옛 확장 안내(design.md 2절 표 2)', () => {
  const HELPER = '이 PC의 도우미가 옛 판이라 넣지 못해요. 비트 PC 연결 화면에서 새 도우미를 받아 설치해 주세요.'
  const EXT = '이 PC의 크롬 확장이 옛 판이라 넣지 못해요. 비트 PC 연결 화면에서 새 확장을 받아 바꾼 뒤 웹앱을 새로 고쳐 주세요.'

  it('AC-8541.2: 도우미만 옛 판 — 도우미 줄 하나 + [비트 PC 연결](/claim/setup)', () => {
    render(<OldVersionNotice helper extension={false} />)
    expect(screen.getByText(HELPER)).toBeTruthy()
    expect(screen.queryByText(EXT)).toBeNull()
    expect(screen.getByRole('link', { name: '비트 PC 연결' }).getAttribute('href')).toBe('/claim/setup')
  })

  it('AC-8541.2: 확장만 옛 판 — 확장 줄 하나(E-GSHEET-EXT 글)', () => {
    render(<OldVersionNotice helper={false} extension />)
    expect(screen.getByText(EXT)).toBeTruthy()
    expect(screen.queryByText(HELPER)).toBeNull()
  })

  it('AC-8541.2: 둘 다 옛 판이면 두 줄(도우미 먼저)', () => {
    render(<OldVersionNotice helper extension />)
    const text = norm(screen.getByRole('status'))
    expect(text.indexOf(HELPER)).toBeGreaterThanOrEqual(0)
    expect(text.indexOf(EXT)).toBeGreaterThan(text.indexOf(HELPER))
  })

  it('AC-8541.2: 둘 다 새 판이면 아무것도 그리지 않는다', () => {
    const { container } = render(<OldVersionNotice helper={false} extension={false} />)
    expect(container.innerHTML).toBe('')
  })
})

describe('AC-8515.5: 넣기 멈춤(err-google)', () => {
  const stopped = done({ at: '2026-11-26T05:40:00Z', outcome: 'fail', code: 'E-GSHEET-NET', rows: 0 })

  it('AC-8515.5: 띠 = 주황 칩 [넣기 멈춤] + "구글 코드에 닿지 못했어요 · 14:40 · 5분 뒤 다시 해요"', () => {
    renderBand(status({ stopped, last: stopped, lastOk: done() }))
    expect(screen.getByText('넣기 멈춤').className).toContain('text-warning')
    expect(norm(statusPart())).toBe('넣기 멈춤 구글 코드에 닿지 못했어요 · 14:40 · 5분 뒤 다시 해요')
  })

  it('AC-8515.5: 단추 = [다시 해 보기](파란) [덮어쓰기…](잠김) [새 창으로 열기 ↗] [설정]', () => {
    const h = renderBand(status({ stopped, lastOk: done() }))
    const names = [...band().querySelectorAll('button, a')].map((el) => norm(el)).filter((t) => t !== '2026년 11월')
    expect(names).toEqual(['다시 해 보기', '덮어쓰기…', '새 창으로 열기', '설정'])
    expect(screen.queryByRole('button', { name: '지금 넣기' })).toBeNull()
    expect(screen.getByRole('button', { name: '덮어쓰기…' })).toHaveProperty('disabled', true)
    const retry = screen.getByRole('button', { name: '다시 해 보기' })
    expect(retry.className).toContain('bg-accent')
    fireEvent.click(retry)
    expect(h.onFillNow).toHaveBeenCalledTimes(1)
  })

  it('AC-8515.5: 비트·통로 번호면 칩은 같고 굵은 글만 "비트를 읽지 못했어요"', () => {
    const bit = done({ at: '2026-11-26T05:40:00Z', outcome: 'fail', code: 'E-BIT-READ-FAILED', rows: 0 })
    renderBand(status({ stopped: bit }))
    expect(norm(statusPart())).toBe('넣기 멈춤 비트를 읽지 못했어요 · 14:40 · 5분 뒤 다시 해요')
  })

  it('AC-8515.5: 주황 알림 = 까닭 글(굵게) + "14:35까지 넣은 줄은 시트에 그대로 있어요." + [연결 시험] 안내', () => {
    render(<StopNotice stopped={stopped} lastOk={done()} today={TODAY} />)
    const alert = screen.getByRole('alert')
    expect(norm(alert)).toBe(
      '구글 연결 안 됨: 인터넷 연결을 확인해 주세요. 14:35까지 넣은 줄은 시트에 그대로 있어요. 인터넷이 되는데도 계속 이러면 [설정] › 구글 연결에서 [연결 시험]을 눌러 보세요.',
    )
    expect(alert.querySelector('.font-semibold')?.textContent).toBe('구글 연결 안 됨: 인터넷 연결을 확인해 주세요.')
  })

  it.each([
    ['E-GSHEET-TIMEOUT', '구글이 제때 답하지 않았어요. 잠시 뒤 다시 해 보세요.'],
    ['E-GSHEET-LOGIN', "구글이 웹 앱 대신 로그인·안내 화면을 보냈어요. 안내문대로 '액세스 권한: 모든 사용자'로 배포하고 권한 허용까지 했는지, 주소가 /exec 로 끝나는지 확인해 주세요."],
    ['E-GSHEET-KEY', '비밀 글자가 맞지 않아요. [구글에 붙일 코드 복사]로 다시 붙이고 새 버전으로 배포해 주세요.'],
    ['E-GSHEET-SECRET', '이 PC에서 비밀 글자를 읽지 못했어요. 설정 › 구글 연결 › [구글에 붙일 코드 복사]로 비밀 글자를 새로 만들어 구글에 다시 붙여 주세요.'],
    ['E-GSHEET-NOTEMPLATE', "설정 › 시트에서 '원본 시트 주소'를 넣어 주세요."],
    ['E-GSHEET-FAILED', '구글 쪽에서 일을 마치지 못했어요.'],
    ['E-BIT-READ-FAILED', '비트 도우미 연결을 확인해 주세요.'],
    ['E-BRIDGE-BAD-REPLY', '비트 도우미 연결을 확인해 주세요.'],
    ['E-HELPER-MISSING', '비트 도우미 연결을 확인해 주세요.'],
    ['E-WHAT-ELSE', '뜻밖의 오류가 났어요(E-WHAT-ELSE).'],
  ])('AC-8515.5: %s의 까닭 글(design.md 9-3)', (code, why) => {
    render(<StopNotice stopped={done({ outcome: 'fail', code, rows: 0 })} lastOk={null} today={TODAY} />)
    expect(screen.getByRole('alert').querySelector('.font-semibold')?.textContent).toBe(why)
  })

  it('AC-8515.5: 오늘 넣은 줄이 없으면 "…까지 넣은 줄은" 글은 뺀다', () => {
    render(<StopNotice stopped={stopped} lastOk={done({ at: '2026-11-25T05:35:00Z', day: '2026-11-25' })} today={TODAY} />)
    expect(norm(screen.getByRole('alert'))).toBe(
      '구글 연결 안 됨: 인터넷 연결을 확인해 주세요. 인터넷이 되는데도 계속 이러면 [설정] › 구글 연결에서 [연결 시험]을 눌러 보세요.',
    )
  })
})

describe('AC-8515.4: 결과 줄', () => {
  const doneReply = reply({ patients: 10, added: 2, filled: 1, skipped: 0, split: 1, free: 1, inserted: 1, freeFixed: 1, cancelCleared: 1, paidOnly: 1, notes: 2, notPut: { noName: 0, unlinked: 0, negative: 0, noChart: 1 } })

  it('AC-8515.4: 손으로 넣은 결과(done) — 1줄 "✔ 넣었어요 — 11월 26일 시트 · 빈 칸만 채우기 · 14:41 | 네 숫자", 2줄 덧붙임, 3줄 넣지 않음', () => {
    const onClose = vi.fn()
    render(<ResultLine done={done({ at: '2026-11-26T05:41:00Z', via: 'hand', reply: doneReply })} onClose={onClose} />)
    const line = screen.getByRole('status')
    const rows = [...line.children].map((el) => norm(el))
    expect(rows[0]).toBe('✔ 넣었어요 — 11월 26일 시트 · 빈 칸만 채우기 · 14:41 오늘 환자 10명 · 새로 넣은 줄 2 · 채운 줄 1 · 건너뛴 줄 0')
    expect(rows[1]).toBe('나눠 낸 돈 1명(두 줄로) · FREE 1명 · 늦게 낸 돈 끼워 넣은 줄 1 · FREE로 고침 1명 · 취소된 접수 지움 1명 · 미수만 낸 환자 1명(이름 줄) · 비고 넣음 2칸 · 새 달 파일: 이번 달 파일 그대로 씀')
    expect(rows[2]).toBe('넣지 않음: 차트번호 없는 내원 1건')
    expect(rows).toHaveLength(3)
    expect(screen.getByText('✔ 넣었어요').className).toContain('text-positive')
    // 숫자는 굵게
    expect([...line.querySelectorAll('b')].map((b) => b.textContent)).toEqual(['10', '2', '1', '0'])
  })

  it('AC-8515.4: 덮어쓰기면 "덮어쓰기"·"바꾼 줄"', () => {
    render(<ResultLine done={done({ at: '2026-11-26T05:41:00Z', via: 'hand', mode: 'overwrite', reply: reply({ overwritten: 3 }) })} onClose={vi.fn()} />)
    expect(norm(screen.getByRole('status').children[0])).toBe('✔ 넣었어요 — 11월 26일 시트 · 덮어쓰기 · 14:41 오늘 환자 10명 · 새로 넣은 줄 0 · 바꾼 줄 3 · 건너뛴 줄 0')
  })

  it('AC-8515.4: [✕](결과 닫기)를 누르면 onClose', () => {
    const onClose = vi.fn()
    render(<ResultLine done={done({ via: 'hand', reply: doneReply })} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: '결과 닫기' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('AC-8515.4: 저절로 넣은 확인 필요(done-warn) — 1줄 ⚠, 2줄(주황) 확인 필요 글, 3줄 풀이', () => {
    const warn = reply({ patients: 10, added: 1, filled: 0, skipped: 1, cancelKept: 1 })
    render(<ResultLine done={done({ at: '2026-11-26T05:40:00Z', via: 'auto', outcome: 'warn', reply: warn })} onClose={vi.fn()} />)
    const line = screen.getByRole('status')
    const rows = [...line.children].map((el) => norm(el))
    expect(rows).toEqual([
      '⚠ 넣었어요 · 확인 필요 — 11월 26일 시트 · 저절로 넣기 · 14:40 오늘 환자 10명 · 새로 넣은 줄 1 · 채운 줄 0 · 건너뛴 줄 1',
      '취소된 접수 1명 · 건너뛴 줄 1개 — 시트에서 확인해 주세요',
      '취소된 접수: 비고나 예약관리 칸에 직원 글이 있어서 그 줄을 지우지 않았어요. 건너뛴 줄: 늦게 낸 돈을 붙일 바로 아래 줄이 차 있고 맨 아래 줄도 차 있어서 넣지 못했어요.',
    ])
    expect(screen.getByText('⚠ 넣었어요 · 확인 필요').className).toContain('text-warning')
    expect(line.className).toContain('border-l-warning')
  })

  it('AC-8515.4: 답 숫자가 없는 결과는 줄을 그리지 않는다', () => {
    const { container } = render(<ResultLine done={done({ via: 'hand', reply: null })} onClose={vi.fn()} />)
    expect(container.innerHTML).toBe('')
  })
})
