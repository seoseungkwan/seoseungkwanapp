// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ourClinicPhrases } from '@/lib/precheck/memo'
import { HospitalPhrases } from './HospitalPhrases'

// 설정의 '병원 문구' 칸(AC-018.7·AC-018.18). 실제 DB에 붙지 않는다

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

beforeEach(() => {
  db.row = { phrases: ourClinicPhrases(), dx_links: [] }
  db.failRead = false
  db.failWrite = false
  db.upserts = []
})
afterEach(cleanup)

describe('AC-018.7 병원 문구', () => {
  it('AC-018.7: 세 묶음이 보이고 목업의 변경 기록·가입 보기 글 칸은 없다', async () => {
    render(<HospitalPhrases />)
    await screen.findByRole('group', { name: '메모 모양' })
    expect(screen.getByRole('group', { name: '시술별 문구와 약' })).toBeTruthy()
    expect(screen.getByRole('group', { name: '사유 문장' })).toBeTruthy()
    expect(screen.queryByText('변경 기록')).toBeNull()
    expect(screen.queryByText('가입 보기 글')).toBeNull()
  })

  it('AC-018.7: 고치고 [저장]하면 값의 모양 그대로 저장한다(상병 연결표는 그대로)', async () => {
    const user = userEvent.setup()
    db.row = { phrases: ourClinicPhrases(), dx_links: [['LA358', 'M751', '가상 상병', 0, 's']] }
    render(<HospitalPhrases />)
    const mark = await screen.findByLabelText('줄 앞 기호')
    await user.clear(mark)
    await user.type(mark, '★')
    await user.click(screen.getByRole('button', { name: '저장' }))
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
    const interval = await screen.findByLabelText('주사 간격 일수')
    await user.clear(interval)
    await user.type(interval, '0')
    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(db.upserts).toEqual([])
    expect((await screen.findByLabelText('주사 간격 일수')).getAttribute('aria-invalid')).toBe('true')
  })

  it('AC-018.7: 저장 실패면 값을 그대로 두고 오류와 [다시 저장]이다', async () => {
    const user = userEvent.setup()
    render(<HospitalPhrases />)
    const mark = (await screen.findByLabelText('줄 앞 기호')) as HTMLInputElement
    await user.clear(mark)
    await user.type(mark, '★')
    db.failWrite = true
    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(mark.value).toBe('★')
    db.failWrite = false
    await user.click(screen.getByRole('button', { name: '다시 저장' }))
    await waitFor(() => expect(db.upserts).toHaveLength(1))
  })

  describe('그사이 다른 PC가 고쳤을 때', () => {
    /** 다른 PC가 저장한 값: 문구 칸 하나, 코드 사전, 다른 시술의 약 */
    const otherPc = () => {
      const phrases = ourClinicPhrases()
      phrases.TPL.drugUnit = '다른 PC 단위'
      phrases.CODEMAP = { ...phrases.CODEMAP, LZ999: { n: '다른 PC 시술', k: 'proc', rg: null } }
      phrases.procedureDrugs = { ...phrases.procedureDrugs, LA251: { ...phrases.procedureDrugs.LA251, 리도카인: { use: 'include', place: 'ownLine' } } }
      return phrases
    }
    const savedPhrases = () => (db.upserts[0] as { phrases: ReturnType<typeof ourClinicPhrases> }).phrases

    it('AC-018.7: [저장]은 고친 칸만 그때 읽은 값에 얹어 그사이 다른 PC가 고친 문구 칸이 남고, 그 값을 새로 보여 준다', async () => {
      const user = userEvent.setup()
      render(<HospitalPhrases />)
      const mark = await screen.findByLabelText('줄 앞 기호')
      db.row = { phrases: otherPc(), dx_links: [['LA358', 'M751', '가상 상병', 0, 's']] }
      await user.clear(mark)
      await user.type(mark, '★')
      await user.click(screen.getByRole('button', { name: '저장' }))
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
      await user.selectOptions(screen.getByLabelText('고칠 시술'), 'LA247')
      await user.click(screen.getByRole('radio', { name: '덱사 넣기' }))
      await user.click(screen.getByRole('button', { name: '저장' }))
      await waitFor(() => expect(db.upserts).toHaveLength(1))
      const saved = savedPhrases()
      expect(saved.procedureDrugs.LA247.덱사.use).toBe('include')
      expect(saved.procedureDrugs.LA251.리도카인).toEqual({ use: 'include', place: 'ownLine' })
    })

    it('AC-018.7: 고치지 않은 칸은 저장해도 다른 PC 값을 덮지 않고, 두 번째 저장도 그 값 위에 얹는다', async () => {
      const user = userEvent.setup()
      render(<HospitalPhrases />)
      const mark = await screen.findByLabelText('줄 앞 기호')
      await user.clear(mark)
      await user.type(mark, '★')
      await user.click(screen.getByRole('button', { name: '저장' }))
      await waitFor(() => expect(db.upserts).toHaveLength(1))
      db.row = { phrases: { ...otherPc(), TPL: { ...otherPc().TPL, mark: '다른 PC 기호' } }, dx_links: [] }
      db.upserts = []
      const unit = screen.getByLabelText('약 양 단위')
      await user.clear(unit)
      await user.type(unit, '내 단위')
      await user.click(screen.getByRole('button', { name: '저장' }))
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
      await user.click(screen.getByRole('button', { name: '저장' }))
      await screen.findByRole('status', { name: '처음 질문' })
      expect(db.upserts).toEqual([])
    })
  })

  it('AC-018.7: [메모 시험해 보기]는 가짜 진료 한 건으로 문장을 보여 준다', async () => {
    const user = userEvent.setup()
    render(<HospitalPhrases />)
    await screen.findByRole('group', { name: '메모 모양' })
    await user.click(screen.getByRole('button', { name: '메모 시험해 보기' }))
    const preview = await screen.findByRole('region', { name: '시험한 메모' })
    expect(preview.textContent?.length).toBeGreaterThan(0)
    expect(preview.textContent).toContain('가짜 진료')
    expect(preview.textContent).toContain('MBB')
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
    expect(db.upserts).toEqual([])
  })

  it('AC-018.18: 읽지 못하면 안내가 아니라 오류와 [다시 불러오기]다', async () => {
    db.failRead = true
    render(<HospitalPhrases />)
    expect(within(await screen.findByRole('alert')).getByText(/오류 번호 E-SETTINGS-FAILED/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeTruthy()
  })
})
