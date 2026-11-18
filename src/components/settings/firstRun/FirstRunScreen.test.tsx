// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { neutralPhrases, ourClinicPhrases, validatePhrases, type Phrases } from '@/lib/precheck/memo'
import { applyAnswers, answersOf, type Answers } from '@/lib/precheck/memo/onboarding/answers'
import { NONE_PRESET, PRESETS } from '@/lib/precheck/memo/onboarding/presets'
import { previewMemos } from '@/lib/precheck/memo/onboarding/preview'
import { SAMPLE_LABELS } from '@/lib/precheck/memo/onboarding/sampleVisits'
import { FirstRunScreen } from './FirstRunScreen'

// 처음 질문 화면(clinic-profile REQ-6614, design.md 16절): 시작 → 붙여 넣기 / 보기 고르기 / [비슷한 게 없어요] → 질문 네 쪽 + 보기 메모 → 확인 → 저장.
// 실제 Supabase에 붙지 않는다(흉내 client). 보기 메모는 진짜 메모 엔진 글이다

vi.setConfig({ testTimeout: 60_000 })

const DX = [{ dx: 'M17.0', codes: ['KK090'] }]
const db = vi.hoisted(() => ({ row: null as { phrases: unknown; dx_links: unknown } | null, failRead: false, failWrite: 0, reads: 0, upserts: [] as unknown[] }))
vi.mock('@/lib/supabase/browser', () => ({
  supabaseBrowser: () => ({
    from: () => ({
      select: () => ({
        maybeSingle: () => {
          db.reads += 1
          return Promise.resolve(db.failRead ? { data: null, error: { message: 'x' } } : { data: db.row, error: null })
        },
      }),
      upsert: (value: unknown) => {
        if (db.failWrite > 0) {
          db.failWrite -= 1
          return Promise.resolve({ data: null, error: { message: 'x' } })
        }
        db.upserts.push(value)
        return Promise.resolve({ data: null, error: null })
      },
    }),
  }),
}))

const TITLE = '우리 병원 메모 모양 맞추기'
const LEAD = '똑같지 않아도 괜찮아요. 고른 뒤 쪽마다 바꿀 수 있어요. 예시는 가짜 진료예요.'
const DRUG_NOTE = '약은 비트를 연결한 뒤 설정 → 병원 문구 → 시술별 문구와 약에서 정해요.'
const SAVED = '저장했어요. 다음에 만드는 메모부터 이 모양이에요.'
const PICK = '골라 주세요'
const MARKER = '홍길동'
const PASTED = ['◈MBB L4,5,S1 both 홍길동', '◈SNB 우측', '◈IA injection of - Rt shoulder', '◈K-L grade (3)/(3)'].join('\n')

type User = ReturnType<typeof userEvent.setup>
const button = (name: string) => screen.getByRole('button', { name })
const radio = (name: string) => screen.getByRole('radio', { name }) as HTMLInputElement
/** 질문 묶음(fieldset). 이름 = 질문 이름(+ '골라 주세요' 표시) */
const group = (name: string) => screen.getByRole('group', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( ${PICK})?$`) })
const checkedIn = (name: string) => within(group(name)).getAllByRole('radio').filter((item) => (item as HTMLInputElement).checked).map((item) => item.getAttribute('aria-label') ?? item.closest('label')?.textContent)
const aside = () => screen.getByRole('complementary', { name: '보기 메모' })
const memosIn = (el: HTMLElement) => [...el.querySelectorAll('pre')].map((pre) => pre.textContent)
const sentPhrases = () => (db.upserts.at(-1) as { phrases: Phrases }).phrases

async function openStart() {
  render(<FirstRunScreen />)
  return screen.findByRole('button', { name: '예전 메모 붙여 넣기' })
}
/** [다음]을 n번 */
async function next(user: User, times = 1) {
  for (let i = 0; i < times; i++) await user.click(button('다음'))
}

beforeEach(() => {
  db.row = null
  db.failRead = false
  db.failWrite = 0
  db.reads = 0
  db.upserts = []
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('AC-6614.1 시작', () => {
  it("AC-6614.1: 제목 '우리 병원 메모 모양 맞추기', 글, [예전 메모 붙여 넣기]·[예시에서 고르기]·[비슷한 게 없어요]가 보인다", async () => {
    await openStart()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(TITLE)
    expect(screen.getByText(LEAD)).toBeTruthy()
    for (const name of ['예전 메모 붙여 넣기', '예시에서 고르기', '비슷한 게 없어요']) expect(button(name)).toBeTruthy()
  })

  it('AC-6614.1: [비슷한 게 없어요]는 보기 2 값으로 첫 쪽을 연다(골라 주세요 표시 없음)', async () => {
    const user = userEvent.setup()
    await openStart()
    await user.click(button('비슷한 게 없어요'))
    expect(screen.getByRole('heading', { level: 2, name: '1쪽 / 4쪽 · 좌우' })).toBeTruthy()
    expect(checkedIn('좌우 모양')).toEqual(['Rt·Lt·both'])
    expect(checkedIn('연골주사 좌우')).toEqual(['영어'])
    expect(checkedIn('좌우 쓰는 경우')).toEqual(['차트 그대로'])
    expect(checkedIn('앞에 적힌 좌우')).toEqual(['뒤 시술 모두에'])
    expect(screen.queryByText(PICK)).toBeNull()
    await next(user)
    expect(checkedIn('신경차단술 C-arm 글자')).toEqual(['C-arm guide 하에'])
    expect(checkedIn('관절 주사 초음파 글자')).toEqual(['Sono guide 하에'])
    expect(checkedIn('끝맺음')).toEqual(['시행함'])
    // 보기 메모는 보기 2의 진짜 엔진 글
    expect(memosIn(aside())).toEqual(previewMemos(applyAnswers(neutralPhrases(), PRESETS[NONE_PRESET].answers)))
  })

  it('AC-6614.1: 병원 문구를 읽지 못하면 오류 칸과 [다시 불러오기]가 보이고, 다시 읽으면 시작 단추가 나온다', async () => {
    const user = userEvent.setup()
    db.failRead = true
    render(<FirstRunScreen />)
    expect((await screen.findByRole('alert')).textContent).toContain('E-SETTINGS-FAILED')
    expect(screen.queryByRole('button', { name: '예전 메모 붙여 넣기' })).toBeNull()
    db.failRead = false
    await user.click(button('다시 불러오기'))
    expect(await screen.findByRole('button', { name: '예전 메모 붙여 넣기' })).toBeTruthy()
  })
})

describe('AC-6614.4 예시에서 고르기', () => {
  it("AC-6614.4: 보기 4개('기호 + 영어 짧게' · '가이드 + 영어 + 시행함' · '한글 문장' · '한 줄 이어쓰기')가 고르기 카드로 보이고 카드마다 가짜 진료 3건 메모가 진짜 엔진 글로 보인다", async () => {
    const user = userEvent.setup()
    await openStart()
    await user.click(button('예시에서 고르기'))
    const cards = within(screen.getByRole('radiogroup', { name: '보기' })).getAllByRole('radio')
    expect(cards.map((card) => card.getAttribute('aria-label'))).toEqual(['기호 + 영어 짧게', '가이드 + 영어 + 시행함', '한글 문장', '한 줄 이어쓰기'])
    PRESETS.forEach((preset, at) => {
      const card = radio(preset.name).closest('li') as HTMLElement
      expect(memosIn(card)).toEqual(previewMemos(applyAnswers(neutralPhrases(), preset.answers)))
      for (const label of SAMPLE_LABELS) expect(card.textContent).toContain(label)
      if (at === 0) expect(memosIn(card)[0]).toBe('◈MBB L4,5,S1 both\n◈SNB Rt')
      if (at === 3) expect(memosIn(card)[0]).toBe('C-arm 가이드하에 MBB L4-5-S1 both 시행함, C-arm 가이드하에 SNB Rt 시행함')
    })
    expect(button('비슷한 게 없어요')).toBeTruthy()
  })

  it('AC-6614.4: [이 모양으로 시작]은 카드를 고르기 전에는 막혀 있고, 고르면 그 보기 값으로 첫 쪽을 연다', async () => {
    const user = userEvent.setup()
    await openStart()
    await user.click(button('예시에서 고르기'))
    expect((button('이 모양으로 시작') as HTMLButtonElement).disabled).toBe(true)
    await user.click(radio('한글 문장'))
    await user.click(button('이 모양으로 시작'))
    expect(screen.getByRole('heading', { level: 2, name: '1쪽 / 4쪽 · 좌우' })).toBeTruthy()
    expect(checkedIn('좌우 모양')).toEqual(['우측·좌측·양측'])
    await next(user, 2)
    expect(checkedIn('레벨')).toEqual(['L4-5-S1'])
    expect(checkedIn('K-L 문장')).toEqual(['K-L 등급 n/n'])
  })

  it('AC-6614.4: 고르기 화면의 [비슷한 게 없어요]도 보기 2 값으로 첫 쪽을 연다', async () => {
    const user = userEvent.setup()
    await openStart()
    await user.click(button('예시에서 고르기'))
    await user.click(button('비슷한 게 없어요'))
    expect(checkedIn('연골주사 좌우')).toEqual(['영어'])
  })
})

describe('AC-6614.5 질문 네 쪽', () => {
  it("AC-6614.5: 네 쪽이 차례로 '좌우' · '가이드·끝맺음' · '레벨·검사' · '모양·기호'이고 머리에 '{n}쪽 / 4쪽 · {쪽 이름}'과 [이전]·[다음]이 있다", async () => {
    const user = userEvent.setup()
    await openStart()
    await user.click(button('비슷한 게 없어요'))
    const names = ['좌우', '가이드·끝맺음', '레벨·검사', '모양·기호']
    for (const [at, name] of names.entries()) {
      expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(`${at + 1}쪽 / 4쪽 · ${name}`)
      expect(button('이전')).toBeTruthy()
      expect(button('다음')).toBeTruthy()
      if (at < 3) await next(user)
    }
    // [이전]으로 돌아간다
    await user.click(button('이전'))
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('3쪽 / 4쪽 · 레벨·검사')
  })

  it("AC-6614.5: '좌우' 쪽 — 좌우 모양 6가지 · 연골주사 좌우 한글/영어 · 좌우 쓰는 경우 '차트 그대로'/'1.5 이상만 both' · 앞에 적힌 좌우 '뒤 시술 모두에'/'바로 옆 시술만'", async () => {
    const user = userEvent.setup()
    await openStart()
    await user.click(button('비슷한 게 없어요'))
    const labels = (name: string) => within(group(name)).getAllByRole('radio').map((item) => item.closest('label')?.textContent)
    expect(labels('좌우 모양')).toEqual(['Rt·Lt·both', 'RT·LT·BOTH', 'Rt.·Lt.·Both', 'Rt·Lt·Bil', '우측·좌측·양측', '우·좌·양'])
    expect(labels('연골주사 좌우')).toEqual(['한글', '영어'])
    expect(labels('좌우 쓰는 경우')).toEqual(['차트 그대로', '1.5 이상만 both'])
    expect(labels('앞에 적힌 좌우')).toEqual(['뒤 시술 모두에', '바로 옆 시술만'])
  })

  it("AC-6614.5: '가이드·끝맺음' 쪽 — C-arm 글자 3가지 + '안 씀' + 직접 20자 · 초음파 글자 3가지 + '안 씀' + 직접 20자 · 끝맺음 '시행함'/'시행'/'시행하였음'/'없음' + 직접 20자", async () => {
    const user = userEvent.setup()
    await openStart()
    await user.click(button('비슷한 게 없어요'))
    await next(user)
    const labels = (name: string) => within(group(name)).getAllByRole('radio').map((item) => item.closest('label')?.textContent)
    expect(labels('신경차단술 C-arm 글자')).toEqual(['C-arm guide 하에', 'C-arm 가이드 하에', 'C-arm 가이드하에', '안 씀', '직접 적기'])
    expect(labels('관절 주사 초음파 글자')).toEqual(['Sono guide 하에', '초음파 가이드 하에', 'Sono 가이드하에', '안 씀', '직접 적기'])
    expect(labels('끝맺음')).toEqual(['시행함', '시행', '시행하였음', '없음', '직접 적기'])
    // 직접 적기: 고르면 칸이 열리고 20자까지
    await user.click(within(group('신경차단술 C-arm 글자')).getByRole('radio', { name: '직접 적기' }))
    const typed = within(group('신경차단술 C-arm 글자')).getByRole('textbox', { name: '신경차단술 C-arm 글자 직접 적기' }) as HTMLInputElement
    expect(typed.maxLength).toBe(20)
    await user.type(typed, '투시 하에')
    expect(memosIn(aside())[0]).toBe('투시 하에 MBB L4,5,S1 both 시행함\n투시 하에 SNB Rt 시행함')
    // 중괄호는 넣지 않는다(문구 검사에 걸리는 글자)
    await user.paste('{x}')
    expect(typed.value).toBe('투시 하에x')
    // '안 씀'
    await user.click(within(group('관절 주사 초음파 글자')).getByRole('radio', { name: '안 씀' }))
    expect(memosIn(aside())[1]).toBe('IA injection of - Rt shoulder 시행함')
    await user.click(within(group('끝맺음')).getByRole('radio', { name: '직접 적기' }))
    expect((within(group('끝맺음')).getByRole('textbox') as HTMLInputElement).maxLength).toBe(20)
    expect((within(group('관절 주사 초음파 글자')).queryByRole('textbox'))).toBeNull()
  })

  it("AC-6614.5: '레벨·검사' 쪽 — 레벨 3가지 · K-L 문장 3가지, '모양·기호' 쪽 — 줄 머리 기호 9개 / '없음' / 직접 16자 · 줄 나눔 '시술마다 한 줄'/'한 줄로 이어 쓰기'", async () => {
    const user = userEvent.setup()
    await openStart()
    await user.click(button('비슷한 게 없어요'))
    await next(user, 2)
    const labels = (name: string) => within(group(name)).getAllByRole('radio').map((item) => item.closest('label')?.textContent)
    expect(labels('레벨')).toEqual(['L4,5,S1', 'L4-5-S1', 'L4, L5, S1'])
    expect(labels('K-L 문장')).toEqual(['K-L grade (n)/(n)', 'K-L grade n/n', 'K-L 등급 n/n'])
    await next(user)
    expect(labels('줄 머리 기호')).toEqual(['◈', '◆', '▶', '→', '-', '·', '*', '※', '□', '없음', '직접 적기'])
    expect(labels('줄 나눔')).toEqual(['시술마다 한 줄', '한 줄로 이어 쓰기'])
    expect(checkedIn('줄 머리 기호')).toEqual(['없음'])
    await user.click(within(group('줄 머리 기호')).getByRole('radio', { name: '직접 적기' }))
    const typed = within(group('줄 머리 기호')).getByRole('textbox') as HTMLInputElement
    expect(typed.maxLength).toBe(16)
    await user.type(typed, '#')
    expect(memosIn(aside())[1]).toBe('#Sono guide 하에 IA injection of - Rt shoulder 시행함')
  })

  it("AC-6614.5: 붙여 넣기에서 '섞여 있어요'·'못 찾았어요'였던 항목 옆에 '골라 주세요'가 보인다(읽은 항목에는 없다). 답을 고르면 그 표시는 사라진다", async () => {
    const user = userEvent.setup()
    await openStart()
    await user.click(button('예전 메모 붙여 넣기'))
    await user.click(screen.getByRole('textbox', { name: '예전 메모' }))
    await user.paste(PASTED)
    await user.click(button('읽기'))
    await user.click(button('이 답으로 시작'))
    // 1쪽: 좌우 모양 섞임, 나머지 셋은 읽는 규칙이 없다 → 넷 모두
    for (const name of ['좌우 모양', '연골주사 좌우', '좌우 쓰는 경우', '앞에 적힌 좌우']) expect(within(group(name)).getByText(PICK)).toBeTruthy()
    // 못 읽은 칸은 보기 2 값에서 시작한다(처음인 병원)
    expect(checkedIn('연골주사 좌우')).toEqual(['영어'])
    await user.click(radio('우측·좌측·양측'))
    expect(within(group('좌우 모양')).queryByText(PICK)).toBeNull()
    expect(within(group('연골주사 좌우')).getByText(PICK)).toBeTruthy()
    // 이미 골라져 있던 값을 그대로 눌러도 고른 것이다
    await user.click(radio('영어'))
    expect(within(group('연골주사 좌우')).queryByText(PICK)).toBeNull()
    expect(checkedIn('연골주사 좌우')).toEqual(['영어'])
    await next(user)
    for (const name of ['신경차단술 C-arm 글자', '관절 주사 초음파 글자', '끝맺음']) expect(within(group(name)).getByText(PICK)).toBeTruthy()
    await next(user)
    // 레벨·K-L은 읽었다
    expect(screen.queryByText(PICK)).toBeNull()
    expect(checkedIn('레벨')).toEqual(['L4,5,S1'])
    await next(user)
    expect(within(group('줄 머리 기호')).queryByText(PICK)).toBeNull()
    expect(checkedIn('줄 머리 기호')).toEqual(['◈'])
    expect(within(group('줄 나눔')).getByText(PICK)).toBeTruthy()
  })

  it('AC-6614.5: 다시 할 때(맞는 병원 문구가 있을 때) 붙여 넣기에서 못 읽은 칸은 지금 문구의 답에서 시작한다', async () => {
    const user = userEvent.setup()
    const current = applyAnswers(neutralPhrases(), PRESETS[2].answers)
    db.row = { phrases: current, dx_links: DX }
    await openStart()
    await user.click(button('예전 메모 붙여 넣기'))
    await user.click(screen.getByRole('textbox', { name: '예전 메모' }))
    await user.paste(PASTED)
    await user.click(button('읽기'))
    await user.click(button('이 답으로 시작'))
    expect(checkedIn('연골주사 좌우')).toEqual(['한글'])
    await next(user)
    expect(checkedIn('신경차단술 C-arm 글자')).toEqual([answersOf(current).carm])
  })
})

describe('AC-6614.6 보기 메모 칸', () => {
  it("AC-6614.6: 답을 바꾸면 가짜 진료 3건 메모가 바로 다시 만들어지고, 칸 아래에 '약은 비트를 연결한 뒤 …'가 보인다", async () => {
    const user = userEvent.setup()
    await openStart()
    await user.click(button('비슷한 게 없어요'))
    expect(memosIn(aside())).toEqual([
      'C-arm guide 하에 MBB L4,5,S1 both 시행함\nC-arm guide 하에 SNB Rt 시행함',
      'Sono guide 하에 IA injection of - Rt shoulder 시행함',
      'Rt 슬관절 강내 연골주사 2회차 시행함\nK-L grade (3)/(3)',
    ])
    for (const label of SAMPLE_LABELS) expect(within(aside()).getByText(label)).toBeTruthy()
    await user.click(radio('우측·좌측·양측'))
    expect(memosIn(aside())[0]).toBe('C-arm guide 하에 MBB L4,5,S1 양측 시행함\nC-arm guide 하에 SNB 우측 시행함')
    // 쪽을 옮겨도 칸은 그대로 있다
    await next(user, 3)
    await user.click(radio('한 줄로 이어 쓰기'))
    expect(memosIn(aside())[0]).toBe('C-arm guide 하에 MBB L4,5,S1 양측 시행함, C-arm guide 하에 SNB 우측 시행함')
    const note = within(aside()).getByText(DRUG_NOTE)
    const lastMemo = [...aside().querySelectorAll('pre')].at(-1)!
    expect(lastMemo.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('AC-6614.6: 보기 메모 칸은 질문 뒤에 놓여(폰은 아래) 넓은 화면에서만 오른쪽으로 간다(md:flex-row)', async () => {
    const user = userEvent.setup()
    await openStart()
    await user.click(button('비슷한 게 없어요'))
    const questions = screen.getByRole('heading', { level: 2 }).closest('section') as HTMLElement
    expect(questions.compareDocumentPosition(aside()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const row = aside().parentElement as HTMLElement
    expect(row.contains(questions)).toBe(true)
    expect(row.className.split(/\s+/)).toEqual(expect.arrayContaining(['flex', 'flex-col', 'md:flex-row']))
  })
})

describe('AC-6614.8 확인 쪽·저장', () => {
  async function toConfirm(user: User) {
    await openStart()
    await user.click(button('비슷한 게 없어요'))
    await next(user, 4)
    return screen.getByRole('heading', { level: 2, name: '확인' })
  }
  const table = () => screen.getByRole('table', { name: '바뀌는 것' })
  const rowsOf = () => within(table()).getAllByRole('row').slice(1).map((tr) => [...tr.children].map((td) => td.textContent))

  it("AC-6614.8: 처음이면 가짜 진료 3건 메모, '바뀌는 것'에 '처음 만들어요', [저장]이 있다. [저장]은 neutralPhrases()에 답을 넣어 검사 뒤 저장하고 상병 연결표는 []다", async () => {
    const user = userEvent.setup()
    await toConfirm(user)
    expect(memosIn(aside())).toEqual(previewMemos(applyAnswers(neutralPhrases(), PRESETS[NONE_PRESET].answers)))
    expect(screen.getByText('처음 만들어요')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    await user.click(button('저장'))
    expect(await screen.findByText(SAVED)).toBeTruthy()
    expect(db.upserts).toHaveLength(1)
    const expected = validatePhrases(applyAnswers(neutralPhrases(), PRESETS[NONE_PRESET].answers))
    expect(expected.ok).toBe(true)
    expect(db.upserts[0]).toEqual({ phrases: expected.ok ? expected.value : null, dx_links: [] })
    const link = screen.getByRole('link', { name: '병원 문구로 가기' })
    expect(link.getAttribute('href')).toBe('/settings')
  })

  it("AC-6614.8: 맞는 병원 문구가 있으면 '바뀌는 것' 표(칸 · 전 · 후)가 그 문구와 견주고, [저장]은 그 문구에 답을 넣고 상병 연결표는 그대로 둔다", async () => {
    const user = userEvent.setup()
    const current = applyAnswers(neutralPhrases(), PRESETS[0].answers)
    db.row = { phrases: current, dx_links: DX }
    await toConfirm(user)
    expect(within(table()).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['칸', '전', '후'])
    const rows = rowsOf()
    // 답 칸은 쉬운 말로(질문의 이름과 고르는 글), 고정 멘트는 토큰마다
    expect(rows).toEqual(
      expect.arrayContaining([
        ['연골주사 좌우', '한글', '영어'],
        ['신경차단술 C-arm 글자', '안 씀', 'C-arm guide 하에'],
        ['관절 주사 초음파 글자', '안 씀', 'Sono guide 하에'],
        ['끝맺음', '없음', '시행함'],
        ['줄 머리 기호', '◈', '없음'],
        ['기본 시술 문구', '{시술}', '{C-arm} {시술} {시행함}'],
      ]),
    )
    expect(rows.map((row) => row[0])).not.toContain('고정 멘트')
    expect(rows.flat().join(' ')).not.toContain('"token"')
    // 안 바뀐 칸은 없다
    for (const row of rows) expect(row[1]).not.toBe(row[2])
    await user.click(button('저장'))
    expect(await screen.findByText(SAVED)).toBeTruthy()
    const expected = validatePhrases(applyAnswers(current, PRESETS[NONE_PRESET].answers))
    expect(expected.ok && db.upserts[0]).toEqual({ phrases: expected.ok ? expected.value : null, dx_links: DX })
  })

  it('AC-6614.8: 우리 의원 문구(약·코드)에 저장해도 처방코드·시술별 약은 그대로고 답 칸만 바뀐다', async () => {
    const user = userEvent.setup()
    db.row = { phrases: ourClinicPhrases(), dx_links: DX }
    await toConfirm(user)
    await user.click(button('저장'))
    await screen.findByText(SAVED)
    const saved = sentPhrases()
    expect(saved.CODEMAP).toEqual(ourClinicPhrases().CODEMAP)
    expect(saved.procedureDrugs).toEqual(ourClinicPhrases().procedureDrugs)
    expect(answersOf(saved)).toEqual(PRESETS[NONE_PRESET].answers as Answers)
  })

  it('AC-6614.8: 병원 문구 줄은 있는데 문구가 틀렸으면 처음처럼 neutralPhrases()에 넣고 상병 연결표는 그대로 둔다', async () => {
    const user = userEvent.setup()
    db.row = { phrases: { broken: true }, dx_links: DX }
    await toConfirm(user)
    expect(screen.getByText('처음 만들어요')).toBeTruthy()
    await user.click(button('저장'))
    await screen.findByText(SAVED)
    const expected = validatePhrases(applyAnswers(neutralPhrases(), PRESETS[NONE_PRESET].answers))
    expect(db.upserts[0]).toEqual({ phrases: expected.ok ? expected.value : null, dx_links: DX })
  })

  it('AC-6614.8: 저장이 실패하면 오류 칸(E-FIRST-RUN-SAVE-FAILED)과 [다시 저장]이 보이고, 다시 저장하면 된다', async () => {
    const user = userEvent.setup()
    db.failWrite = 1
    await toConfirm(user)
    await user.click(button('저장'))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('E-FIRST-RUN-SAVE-FAILED')
    expect(alert.textContent).toContain('고른 메모 모양을 저장하지 못했어요')
    expect(screen.queryByText(SAVED)).toBeNull()
    await user.click(button('다시 저장'))
    expect(await screen.findByText(SAVED)).toBeTruthy()
    expect(db.upserts).toHaveLength(1)
  })

  it('AC-6614.8: 저장할 때 병원 문구를 다시 읽지 못해도 오류 칸이다(쓰지 않는다)', async () => {
    const user = userEvent.setup()
    await toConfirm(user)
    db.failRead = true
    await user.click(button('저장'))
    expect((await screen.findByRole('alert')).textContent).toContain('E-FIRST-RUN-SAVE-FAILED')
    expect(db.upserts).toHaveLength(0)
  })

  it('AC-6614.8: 확인 쪽 [이전]은 4쪽으로 돌아간다', async () => {
    const user = userEvent.setup()
    await toConfirm(user)
    await user.click(button('이전'))
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('4쪽 / 4쪽 · 모양·기호')
  })
})

describe('AC-6614.2 붙여 넣기 → 질문 → 저장', () => {
  it('AC-6614.2: 붙인 글은 시작한 뒤 화면에서 사라지고, 저장하는 문구에도 요청에도 들어가지 않는다(브라우저 저장소에도 없다)', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((name) => vi.spyOn(console, name))
    await openStart()
    await user.click(button('예전 메모 붙여 넣기'))
    expect(screen.getByText('환자 이름·번호는 빼고 붙여 주세요. 이 글은 이 PC 밖으로 나가지 않아요.')).toBeTruthy()
    await user.click(screen.getByRole('textbox', { name: '예전 메모' }))
    await user.paste(PASTED)
    await user.click(button('읽기'))
    expect(screen.getByRole('table')).toBeTruthy()
    await user.click(button('이 답으로 시작'))
    expect(document.body.textContent).not.toContain(MARKER)
    expect(screen.queryByRole('textbox', { name: '예전 메모' })).toBeNull()
    await next(user, 4)
    await user.click(button('저장'))
    await screen.findByText(SAVED)
    expect(JSON.stringify(db.upserts)).not.toContain(MARKER)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
    for (const spy of logs) expect(JSON.stringify(spy.mock.calls)).not.toContain(MARKER)
    setItem.mockRestore()
    for (const spy of logs) spy.mockRestore()
  })

  it('AC-6614.2: 붙여 넣기 화면의 [이전]은 시작으로 돌아가고, 다시 열면 칸은 비어 있다', async () => {
    const user = userEvent.setup()
    await openStart()
    await user.click(button('예전 메모 붙여 넣기'))
    await user.click(screen.getByRole('textbox', { name: '예전 메모' }))
    await user.paste(PASTED)
    await user.click(button('이전'))
    expect(screen.getByText(LEAD)).toBeTruthy()
    await user.click(button('예전 메모 붙여 넣기'))
    expect((screen.getByRole('textbox', { name: '예전 메모' }) as HTMLTextAreaElement).value).toBe('')
  })

  it('AC-6614.2: 처음 질문의 답은 브라우저 저장소에 두지 않는다(쪽을 옮기고 답을 바꿔도)', async () => {
    const user = userEvent.setup()
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    await openStart()
    await user.click(button('비슷한 게 없어요'))
    await user.click(radio('우측·좌측·양측'))
    await next(user)
    await waitFor(() => expect(button('이전')).toBeTruthy())
    expect(setItem).not.toHaveBeenCalled()
    setItem.mockRestore()
  })
})
