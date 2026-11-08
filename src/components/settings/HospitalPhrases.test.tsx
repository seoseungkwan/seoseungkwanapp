// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, todayInKorea } from '@/lib/analytics/dates'
import { ourClinicPhrases } from '@/lib/precheck/memo'
import type { DayPayload } from '@/types/payload'
import { HospitalPhrases } from './HospitalPhrases'

// 설정의 '병원 문구' 칸(AC-018.7·AC-018.18, memo-settings REQ-3007). 실제 DB에 붙지 않는다

const db = vi.hoisted(() => ({ row: null as { phrases: unknown; dx_links: unknown[] } | null, failRead: false, failWrite: false, upserts: [] as unknown[] }))
vi.mock('@/lib/supabase/browser', () => ({
  supabaseBrowser: () => ({
    from: () => ({
      select: () => ({ maybeSingle: () => Promise.resolve(db.failRead ? { data: null, error: { message: 'x' } } : { data: db.row, error: null }) }),
      upsert: (value: unknown) => {
        if (db.failWrite) return Promise.resolve({ data: null, error: { message: 'x' } })
        db.upserts.push(value)
        return Promise.resolve({ data: null, error: null })
      },
    }),
  }),
}))

// 처방코드 묶음이 읽는 통계 날별 처방(memo-settings design.md §3). 집계뿐이고 코드·이름은 가짜다
const stats = vi.hoisted(() => ({ fail: false, rows: [] as unknown[], calls: 0 }))
vi.mock('@/lib/storage/stats', () => ({
  readDays: () => {
    stats.calls += 1
    return stats.fail ? Promise.reject(new Error('x')) : Promise.resolve({ rows: stats.rows, dropped: 0, latest: null, fromFile: false })
  },
}))
function statsDay(date: string, rx: [code: string, name: string, type: string][]): DayPayload {
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: date,
    partial: false,
    totals: {} as DayPayload['totals'],
    rx: rx.map(([code, name, type]) => ({ code, name, type, patients: 1, newPatients: 0, returning: 1 })),
    groups: [],
    revisit: { cohort: 0, within7: null, within14: null },
  }
}

beforeEach(() => {
  db.row = { phrases: ourClinicPhrases(), dx_links: [] }
  db.failRead = false
  db.failWrite = false
  db.upserts = []
  stats.fail = false
  stats.rows = []
  stats.calls = 0
})
afterEach(cleanup)

type User = ReturnType<typeof userEvent.setup>
const TABS = ['기본', '시술별 문구와 약', '처방코드', '표기 규칙', '사유 문장', '메모 시험']
const openTab = (user: User, name: string) => user.click(screen.getByRole('tab', { name }))
/** [저장] → 바뀐 부분 표 → [이대로 저장] */
async function saveAndConfirm(user: User, button = '저장') {
  await user.click(screen.getByRole('button', { name: button }))
  await user.click(await screen.findByRole('button', { name: '이대로 저장' }))
}
const savedPhrases = () => (db.upserts[0] as { phrases: ReturnType<typeof ourClinicPhrases> }).phrases

describe('AC-3007.1 묶음 단추', () => {
  it('AC-3007.1: 묶음 단추 여섯 개로 나뉘고 저장 단추는 묶음과 상관없이 아래에 하나다', async () => {
    const user = userEvent.setup()
    render(<HospitalPhrases />)
    const tablist = await screen.findByRole('tablist', { name: '병원 문구 묶음' })
    expect(within(tablist).getAllByRole('tab').map((t) => t.textContent)).toEqual(TABS)
    expect(screen.getByRole('tab', { name: '기본' }).getAttribute('aria-selected')).toBe('true')
    const shown: Record<string, () => unknown> = {
      기본: () => screen.getByLabelText('줄 앞 기호'),
      '시술별 문구와 약': () => screen.getByLabelText('고칠 시술'),
      처방코드: () => screen.getByRole('tabpanel', { name: '처방코드' }),
      '표기 규칙': () => screen.getByLabelText('좌우 기본 표기'),
      '사유 문장': () => screen.getByLabelText('주사 간격 일수'),
      '메모 시험': () => screen.getByRole('button', { name: '메모 만들기' }),
    }
    for (const name of TABS) {
      await openTab(user, name)
      expect(screen.getByRole('tab', { name }).getAttribute('aria-selected')).toBe('true')
      expect(shown[name]()).toBeTruthy()
      expect(screen.getAllByRole('button', { name: '저장' })).toHaveLength(1)
    }
    expect(screen.queryByText('변경 기록')).toBeNull()
    expect(screen.queryByText('가입 보기 글')).toBeNull()
  })

  it('AC-3007.1: 화살표 글쇠로 묶음을 옮긴다', async () => {
    const user = userEvent.setup()
    render(<HospitalPhrases />)
    await screen.findByRole('tablist', { name: '병원 문구 묶음' })
    screen.getByRole('tab', { name: '기본' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: '시술별 문구와 약' }).getAttribute('aria-selected')).toBe('true')
    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(screen.getByRole('tab', { name: '메모 시험' }).getAttribute('aria-selected')).toBe('true')
  })
})

describe('AC-3007.5 저장 전 비교', () => {
  it('AC-3007.5: [저장]은 바로 쓰지 않고 바뀐 칸의 이름·전·후 표를 보이고, [이대로 저장]을 눌러야 저장한다', async () => {
    const user = userEvent.setup()
    render(<HospitalPhrases />)
    const mark = await screen.findByLabelText('줄 앞 기호')
    await user.clear(mark)
    await user.type(mark, '★')
    await user.click(screen.getByRole('button', { name: '저장' }))
    const diff = await screen.findByRole('region', { name: '바뀐 부분' })
    expect(within(diff).getByText('바뀐 부분을 확인해 주세요')).toBeTruthy()
    const rows = within(within(diff).getByRole('table')).getAllByRole('row')
    expect(rows.map((r) => within(r).queryAllByRole('cell').map((c) => c.textContent))).toEqual([[], ['줄머리 기호', '◈', '★']])
    expect(db.upserts).toEqual([])
    await user.click(within(diff).getByRole('button', { name: '이대로 저장' }))
    await waitFor(() => expect(db.upserts).toHaveLength(1))
    expect(savedPhrases().TPL.mark).toBe('★')
    expect(screen.queryByRole('region', { name: '바뀐 부분' })).toBeNull()
    expect(screen.getByText('저장했어요. 다음에 만드는 메모부터 바뀌어요.')).toBeTruthy()
  })

  it('AC-3007.5: [더 고치기]는 표를 닫고 저장하지 않는다. 표가 열린 뒤 더 고치면 표가 닫힌다', async () => {
    const user = userEvent.setup()
    render(<HospitalPhrases />)
    const mark = await screen.findByLabelText('줄 앞 기호')
    await user.type(mark, '★')
    await user.click(screen.getByRole('button', { name: '저장' }))
    await user.click(await screen.findByRole('button', { name: '더 고치기' }))
    expect(screen.queryByRole('region', { name: '바뀐 부분' })).toBeNull()
    await user.click(screen.getByRole('button', { name: '저장' }))
    await screen.findByRole('region', { name: '바뀐 부분' })
    await user.type(mark, '★')
    expect(screen.queryByRole('region', { name: '바뀐 부분' })).toBeNull()
    expect(db.upserts).toEqual([])
  })

  it("AC-3007.5: 바뀐 칸이 없으면 '바뀐 것이 없어요'이고 쓰지 않는다", async () => {
    const user = userEvent.setup()
    render(<HospitalPhrases />)
    await screen.findByLabelText('줄 앞 기호')
    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(await screen.findByText('바뀐 것이 없어요')).toBeTruthy()
    expect(screen.queryByRole('region', { name: '바뀐 부분' })).toBeNull()
    expect(db.upserts).toEqual([])
  })

  it('AC-3007.5: 새 켜기 칸을 고치면 쉬운 이름표로 보인다', async () => {
    const user = userEvent.setup()
    render(<HospitalPhrases />)
    await screen.findByLabelText('줄 앞 기호')
    await openTab(user, '표기 규칙')
    await user.click(screen.getByRole('checkbox', { name: 'IA·건초내주사 줄에 좌우 넣기' }))
    await user.click(screen.getByRole('button', { name: '저장' }))
    const diff = await screen.findByRole('region', { name: '바뀐 부분' })
    expect(within(diff).getByRole('row', { name: 'IA·건초내주사 줄에 좌우 넣기 끔 켬' })).toBeTruthy()
  })
})

describe('AC-018.7 병원 문구', () => {
  it('AC-018.7: 고치고 저장하면 값의 모양 그대로 저장한다(상병 연결표는 그대로)', async () => {
    const user = userEvent.setup()
    db.row = { phrases: ourClinicPhrases(), dx_links: [['LA358', 'M751', '가상 상병', 0, 's']] }
    render(<HospitalPhrases />)
    const mark = await screen.findByLabelText('줄 앞 기호')
    await user.clear(mark)
    await user.type(mark, '★')
    await saveAndConfirm(user)
    await waitFor(() => expect(db.upserts).toHaveLength(1))
    const saved = db.upserts[0] as { phrases: { TPL: { mark: string }; CODEMAP: unknown; procedureDrugs: unknown }; dx_links: unknown }
    expect(saved.phrases.TPL.mark).toBe('★')
    expect(saved.phrases.CODEMAP).toEqual(ourClinicPhrases().CODEMAP)
    expect(saved.phrases.procedureDrugs).toEqual(ourClinicPhrases().procedureDrugs)
    expect(saved.dx_links).toEqual([['LA358', 'M751', '가상 상병', 0, 's']])
  })

  it('AC-018.7: [저장] 전에 validatePhrases로 검사해 틀린 칸을 보이고 저장하지 않는다', async () => {
    const user = userEvent.setup()
    render(<HospitalPhrases />)
    await screen.findByLabelText('줄 앞 기호')
    await openTab(user, '사유 문장')
    const interval = screen.getByLabelText('주사 간격 일수')
    await user.clear(interval)
    await user.type(interval, '0')
    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(db.upserts).toEqual([])
    expect(screen.queryByRole('region', { name: '바뀐 부분' })).toBeNull()
    expect((await screen.findByLabelText('주사 간격 일수')).getAttribute('aria-invalid')).toBe('true')
  })

  it('AC-3007.1: 틀린 칸이 다른 묶음에 있으면 그 묶음을 열어 보인다', async () => {
    const user = userEvent.setup()
    render(<HospitalPhrases />)
    await screen.findByLabelText('줄 앞 기호')
    await openTab(user, '시술별 문구와 약')
    const ia = screen.getByLabelText('일반 IA')
    await user.type(ia, '{{없는말}')
    await openTab(user, '기본')
    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(screen.getByRole('tab', { name: '시술별 문구와 약' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByLabelText('일반 IA').getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('틀린 칸이 1개 있어요. 칸 아래 글을 보고 고쳐 주세요.')).toBeTruthy()
  })

  it('AC-018.7: 저장 실패면 값을 그대로 두고 오류와 [다시 저장]이다', async () => {
    const user = userEvent.setup()
    render(<HospitalPhrases />)
    const mark = (await screen.findByLabelText('줄 앞 기호')) as HTMLInputElement
    await user.clear(mark)
    await user.type(mark, '★')
    db.failWrite = true
    await saveAndConfirm(user)
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(mark.value).toBe('★')
    db.failWrite = false
    await saveAndConfirm(user, '다시 저장')
    await waitFor(() => expect(db.upserts).toHaveLength(1))
  })

  describe('그사이 다른 PC가 고쳤을 때', () => {
    /** 다른 PC가 저장한 값: 문구 칸 하나, 코드 사전, 다른 시술의 약, 줄 순서 */
    const otherPc = () => {
      const phrases = ourClinicPhrases()
      phrases.TPL.drugUnit = '다른 PC 단위'
      phrases.CODEMAP = { ...phrases.CODEMAP, LZ999: { n: '다른 PC 시술', k: 'proc', rg: null } }
      phrases.procedureDrugs = { ...phrases.procedureDrugs, LA251: { ...phrases.procedureDrugs.LA251, 리도카인: { use: 'include', place: 'ownLine' } } }
      phrases.memoRules = { order: { LA358: 2 } }
      return phrases
    }

    it('AC-018.7: 저장은 고친 칸만 그때 읽은 값에 얹어 그사이 다른 PC가 고친 문구 칸이 남고, 그 값을 새로 보여 준다', async () => {
      const user = userEvent.setup()
      render(<HospitalPhrases />)
      const mark = await screen.findByLabelText('줄 앞 기호')
      db.row = { phrases: otherPc(), dx_links: [['LA358', 'M751', '가상 상병', 0, 's']] }
      await user.clear(mark)
      await user.type(mark, '★')
      await saveAndConfirm(user)
      await waitFor(() => expect(db.upserts).toHaveLength(1))
      const saved = savedPhrases()
      expect(saved.TPL.mark).toBe('★')
      expect(saved.TPL.drugUnit).toBe('다른 PC 단위')
      expect(saved.CODEMAP.LZ999).toEqual({ n: '다른 PC 시술', k: 'proc', rg: null })
      expect(saved.procedureDrugs).toEqual(otherPc().procedureDrugs)
      expect((db.upserts[0] as { dx_links: unknown }).dx_links).toEqual([['LA358', 'M751', '가상 상병', 0, 's']])
      await waitFor(() => expect((screen.getByLabelText('약 양 단위') as HTMLInputElement).value).toBe('다른 PC 단위'))
      expect((screen.getByLabelText('줄 앞 기호') as HTMLInputElement).value).toBe('★')
    })

    it('AC-018.7: 시술별 약은 고친 시술만 얹는다: 다른 시술은 다른 PC 값이 남는다', async () => {
      const user = userEvent.setup()
      render(<HospitalPhrases />)
      await screen.findByLabelText('줄 앞 기호')
      db.row = { phrases: otherPc(), dx_links: [] }
      await openTab(user, '시술별 문구와 약')
      await user.selectOptions(screen.getByLabelText('고칠 시술'), 'LA247')
      await user.click(screen.getByRole('radio', { name: '덱사 넣기' }))
      await saveAndConfirm(user)
      await waitFor(() => expect(db.upserts).toHaveLength(1))
      const saved = savedPhrases()
      expect(saved.procedureDrugs.LA247.덱사.use).toBe('include')
      expect(saved.procedureDrugs.LA251.리도카인).toEqual({ use: 'include', place: 'ownLine' })
    })

    it('AC-3007.6: 메모 규칙은 고친 칸만 얹는다: 다른 PC가 정한 줄 순서와 코드가 남는다', async () => {
      const user = userEvent.setup()
      render(<HospitalPhrases />)
      await screen.findByLabelText('줄 앞 기호')
      db.row = { phrases: otherPc(), dx_links: [] }
      await openTab(user, '표기 규칙')
      await user.click(screen.getByRole('checkbox', { name: 'IA·건초내주사 줄에 좌우 넣기' }))
      await openTab(user, '시술별 문구와 약')
      await user.click(screen.getByRole('checkbox', { name: "시술이 2개 이상인 날, '넣기'인 시술이 하나뿐이면 그 시술 줄에 자동으로 넣기" }))
      await saveAndConfirm(user)
      await waitFor(() => expect(db.upserts).toHaveLength(1))
      const saved = savedPhrases()
      expect(saved.memoRules).toEqual({ order: { LA358: 2 }, iaSide: true, singleOwnerDrug: false })
      expect(saved.CODEMAP.LZ999).toEqual({ n: '다른 PC 시술', k: 'proc', rg: null })
      expect(saved.TPL.drugUnit).toBe('다른 PC 단위')
    })

    it('AC-018.7: 고치지 않은 칸은 저장해도 다른 PC 값을 덮지 않고, 두 번째 저장도 그 값 위에 얹는다', async () => {
      const user = userEvent.setup()
      render(<HospitalPhrases />)
      const mark = await screen.findByLabelText('줄 앞 기호')
      await user.clear(mark)
      await user.type(mark, '★')
      await saveAndConfirm(user)
      await waitFor(() => expect(db.upserts).toHaveLength(1))
      db.row = { phrases: { ...otherPc(), TPL: { ...otherPc().TPL, mark: '다른 PC 기호' } }, dx_links: [] }
      db.upserts = []
      const unit = screen.getByLabelText('약 양 단위')
      await user.clear(unit)
      await user.type(unit, '내 단위')
      await saveAndConfirm(user)
      await waitFor(() => expect(db.upserts).toHaveLength(1))
      const saved = savedPhrases()
      expect(saved.TPL.drugUnit).toBe('내 단위')
      expect(saved.TPL.mark).toBe('다른 PC 기호') // 지난 저장의 내 값이 이번에 되살아나지 않는다
    })

    it('AC-018.18: 그사이 병원 설정 줄이 없어졌으면 쓰지 않고 처음 질문 안내로 돌아간다', async () => {
      const user = userEvent.setup()
      render(<HospitalPhrases />)
      const mark = await screen.findByLabelText('줄 앞 기호')
      db.row = null
      await user.clear(mark)
      await user.type(mark, '★')
      await saveAndConfirm(user)
      await screen.findByRole('status', { name: '처음 질문' })
      expect(db.upserts).toEqual([])
    })
  })

  it('AC-018.7: 메모 시험 묶음은 가짜 진료 한 건으로 문장을 보여 준다', async () => {
    const user = userEvent.setup()
    render(<HospitalPhrases />)
    await screen.findByLabelText('줄 앞 기호')
    await openTab(user, '메모 시험')
    await user.click(screen.getByRole('button', { name: '메모 만들기' }))
    const preview = await screen.findByRole('region', { name: '시험한 메모' })
    expect(preview.textContent).toContain('MBB')
  })
})

describe('AC-3004 처방코드 묶음', () => {
  it('AC-3004.5: 통계를 못 읽으면 사전 코드와 안내·[다시 읽기]이고, 다시 읽으면 처방된 코드가 나온다', async () => {
    const user = userEvent.setup()
    stats.fail = true
    render(<HospitalPhrases />)
    await screen.findByLabelText('줄 앞 기호')
    await openTab(user, '처방코드')
    expect(await screen.findByText('통계를 읽지 못했어요')).toBeTruthy()
    expect(screen.queryByLabelText('AA254 구분')).toBeNull()
    stats.fail = false
    stats.rows = [statsDay(addDays(todayInKorea(), -1), [['AA254', '재진진찰료', '진찰']])]
    await user.click(screen.getByRole('button', { name: '다시 읽기' }))
    expect(await screen.findByLabelText('AA254 구분')).toBeTruthy()
    expect(screen.queryByText('통계를 읽지 못했어요')).toBeNull()
    expect(stats.calls).toBe(2)
  })

  it('AC-3004.3: 묶음 단추에 정하지 않은 새 코드 수가 보이고, 코드를 고쳐 저장하면 CODEMAP[코드]와 memoRules.order에 들어간다', async () => {
    const user = userEvent.setup()
    stats.rows = [statsDay(addDays(todayInKorea(), -1), [['AA254', '재진진찰료', '진찰'], ['KK090', '관절강내주사', '처치']])]
    render(<HospitalPhrases />)
    await screen.findByLabelText('줄 앞 기호')
    await user.click(await screen.findByRole('tab', { name: '처방코드 새 코드 1개' }))
    await user.selectOptions(screen.getByLabelText('AA254 구분'), 'proc')
    expect(screen.getByRole('tab', { name: '처방코드' })).toBeTruthy()
    await user.type(screen.getByLabelText('KK090 줄 순서'), '1')
    await user.click(screen.getByRole('button', { name: '저장' }))
    const diff = await screen.findByRole('region', { name: '바뀐 부분' })
    expect(within(diff).getByRole('row', { name: 'AA254 · 구분 (없음) 시술' })).toBeTruthy()
    expect(within(diff).getByRole('row', { name: 'KK090 · 줄 순서 (없음) 1' })).toBeTruthy()
    await user.click(within(diff).getByRole('button', { name: '이대로 저장' }))
    await waitFor(() => expect(db.upserts).toHaveLength(1))
    expect(savedPhrases().CODEMAP.AA254).toEqual({ n: '재진진찰료', k: 'proc', rg: null })
    expect(savedPhrases().memoRules).toEqual({ order: { KK090: 1 } })
  })
})

describe('AC-3007.4 메모 시험 묶음', () => {
  it('AC-3007.4: 차트 글·처방을 바꿔 메모를 만들고, 그 글은 묶음을 옮겨도 남지만 저장하지 않는다', async () => {
    const user = userEvent.setup()
    render(<HospitalPhrases />)
    await screen.findByLabelText('줄 앞 기호')
    await openTab(user, '메모 시험')
    const chart = screen.getByLabelText(/차트 글/)
    await user.clear(chart)
    await user.type(chart, 'Rt knee IA triam')
    await user.clear(screen.getByLabelText(/처방/))
    await user.type(screen.getByLabelText(/처방/), 'KK090 1')
    await user.click(screen.getByRole('button', { name: '메모 만들기' }))
    expect((await screen.findByRole('region', { name: '시험한 메모' })).textContent).toContain('IA injection of')
    await openTab(user, '기본')
    await openTab(user, '메모 시험')
    expect((screen.getByLabelText(/차트 글/) as HTMLTextAreaElement).value).toBe('Rt knee IA triam')
    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(await screen.findByText('바뀐 것이 없어요')).toBeTruthy()
    expect(db.upserts).toEqual([])
  })
})

describe('AC-018.18 처음 질문', () => {
  it.each([
    ['줄 없음', null],
    ['빈 {}', { phrases: {}, dx_links: [] }],
  ])('AC-018.18: %s면 파란 안내뿐이고 저장 단추가 없고 쓰지 않는다', async (_, row) => {
    db.row = row
    render(<HospitalPhrases />)
    const info = await screen.findByRole('status', { name: '처음 질문' })
    expect(info.textContent).toBe('처음 질문을 먼저 해 주세요')
    expect(info.getAttribute('class')).toContain('bg-accent-soft')
    expect(info.textContent).not.toContain('오류 번호')
    expect(screen.queryByRole('button', { name: '저장' })).toBeNull()
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(db.upserts).toEqual([])
  })

  it('AC-018.18: 읽지 못하면 안내가 아니라 오류와 [다시 불러오기]다', async () => {
    db.failRead = true
    render(<HospitalPhrases />)
    expect(within(await screen.findByRole('alert')).getByText(/오류 번호 E-SETTINGS-FAILED/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeTruthy()
  })
})
