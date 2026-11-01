// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import type { ClaimRuleSettingRow } from '@/types/db'
import type { RuleSummary } from '@/types/precheck'
import { RuleSettings } from './RuleSettings'

// 시험 내용과 상관없이, PC가 바쁠 때 기본 5초를 넘겨 실패하는 일만 막는다
vi.setConfig({ testTimeout: 60_000 })

// 설정 화면 '점검 규칙' 칸 (precheck REQ-012 AC-012.6, 목업 화면 10). 실제 Supabase·실제 Worker에 붙지 않는다:
// 가짜 Worker는 ruleList에 정해 둔 답을 주고, 가짜 표(db)는 저장 코드가 보낸 upsert·delete를 적용하고 적어 둔다.
// 저장 코드(lib/storage/claimSettings)는 진짜를 쓴다 → [저장]이 실제로 무엇을 보내는지 본다

const { db, supabaseBrowser } = vi.hoisted(() => {
  const state = {
    rows: [] as ClaimRuleSettingRow[],
    upserts: [] as unknown[][],
    deletes: [] as string[][],
    /** 부른 차례(읽기·쓰기 순서를 본다) */
    calls: [] as string[],
    /** upsertLost: 서버에는 들어갔는데 답을 못 받음 */
    fail: { select: false, upsert: false, upsertLost: false, delete: false },
    /** 잡아 두면 upsert 답이 release를 부를 때까지 오지 않는다 */
    hold: null as null | Promise<void>,
  }
  const answer = (failed: boolean) => (failed ? { data: null, error: { message: 'relation does not exist' } } : { data: null, error: null })
  const client = {
    from: () => ({
      select: () => ({
        then: (ok: (value: unknown) => unknown) => {
          state.calls.push('select')
          return Promise.resolve(state.fail.select ? answer(true) : { data: state.rows.map((row) => ({ ...row })), error: null }).then(ok)
        },
      }),
      upsert: async (rows: { rule_id: string; enabled: boolean; grade: ClaimRuleSettingRow['grade'] }[]) => {
        state.calls.push('upsert')
        state.upserts.push(rows)
        if (state.hold) await state.hold
        if (state.fail.upsert) return answer(true)
        for (const row of rows) {
          state.rows = state.rows.filter((r) => r.rule_id !== row.rule_id)
          state.rows.push({ hospital_id: 'h', updated_at: '2026-11-04T07:40:00Z', ...row })
        }
        return answer(state.fail.upsertLost)
      },
      delete: () => ({
        in: async (_column: string, ids: string[]) => {
          state.calls.push('delete')
          state.deletes.push(ids)
          if (state.fail.delete) return answer(true)
          state.rows = state.rows.filter((r) => !ids.includes(r.rule_id))
          return answer(false)
        },
      }),
    }),
  }
  return { db: state, supabaseBrowser: () => client }
})
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser }))

type WorkerAnswer = { ok: true; rules: RuleSummary[] } | { ok: false; code: string } | 'crash' | 'silent'

class FakeWorker {
  static instances: FakeWorker[] = []
  static answer: WorkerAnswer = 'silent'
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  onmessageerror: ((event: unknown) => void) | null = null
  posted: unknown[] = []
  terminated = false
  constructor() {
    FakeWorker.instances.push(this)
  }
  postMessage(message: unknown) {
    this.posted.push(message)
    const answer = FakeWorker.answer
    if (answer === 'silent') return
    queueMicrotask(() => {
      if (answer === 'crash') this.onerror?.({})
      else this.onmessage?.({ data: { type: 'ruleList', ...answer } } as MessageEvent)
    })
  }
  terminate() {
    this.terminated = true
  }
}

const rule = (id: string, title: string, domain: string, grade: RuleSummary['grade'], number: string, enabled_default = true): RuleSummary => ({
  id,
  title,
  domain,
  grade,
  basis: [{ doc: '문서', number }],
  enabled_default,
})
const LA = rule('LA-01', '신경차단술 12개월 횟수', '신경차단술', '확인필요', '고시 제2025-001호')
const PT = rule('PT-02', '같은 날 물리치료 3가지', '물리치료', '알림', '심사기준 2024-7')
const MT = rule('MT-03', '도수치료 주 횟수', '도수치료', '참고', '고시 제2024-9호', false)
const RULES = [LA, PT, MT]

const row = (rule_id: string, enabled: boolean, grade: ClaimRuleSettingRow['grade'] = null, updated_at = '2026-10-30T02:00:00Z'): ClaimRuleSettingRow => ({
  hospital_id: 'h',
  rule_id,
  enabled,
  grade,
  updated_at,
})

beforeEach(() => {
  db.rows = []
  db.upserts = []
  db.deletes = []
  db.calls = []
  db.fail = { select: false, upsert: false, upsertLost: false, delete: false }
  db.hold = null
  FakeWorker.instances = []
  FakeWorker.answer = { ok: true, rules: RULES }
  vi.stubGlobal('Worker', FakeWorker)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const ruleRow = (id: string) => screen.getByText(id).closest('tr') as HTMLElement
const toggle = (id: string) => screen.getByRole<HTMLInputElement>('checkbox', { name: `${id} 켜기` })
const gradeBox = (id: string) => screen.getByRole<HTMLSelectElement>('combobox', { name: `${id} 등급` })
const resetButton = (id: string) => screen.getByRole<HTMLButtonElement>('button', { name: `${id} 기본값으로` })
const saveButton = () => screen.getByRole<HTMLButtonElement>('button', { name: '저장' })
const undoButton = () => screen.getByRole<HTMLButtonElement>('button', { name: '되돌리기' })
const visibleIds = () => Array.from(document.querySelectorAll('tbody tr')).map((tr) => tr.querySelector('[data-rule-id]')?.textContent)

async function renderReady() {
  const user = userEvent.setup()
  render(<RuleSettings />)
  await screen.findByText('LA-01')
  return user
}

describe('AC-012.6 규칙 목록', () => {
  it('AC-012.6: 규칙 목록은 Worker에 ruleList를 보내 받고, 받으면 Worker를 끝낸다', async () => {
    await renderReady()
    expect(FakeWorker.instances).toHaveLength(1)
    expect(FakeWorker.instances[0]?.posted).toEqual([{ type: 'ruleList' }])
    expect(FakeWorker.instances[0]?.terminated).toBe(true)
  })

  it('AC-012.6·AC-007.4: 화면 코드는 규칙표 JSON을 직접 불러오지 않고 hospital_id를 보내지 않는다', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/settings/RuleSettings.tsx'), 'utf8')
    expect(source).not.toMatch(/rules\.json|lib\/precheck\/data/)
    expect(source).not.toContain('hospital_id')
  })

  it('AC-012.6: 받기 전에는 불러오는 중이라고 알린다', async () => {
    FakeWorker.answer = 'silent'
    render(<RuleSettings />)
    expect(screen.getByRole('status').textContent).toContain('불러오는 중')
    expect(screen.queryByRole('button', { name: '저장' })).toBeNull()
  })

  it('AC-012.6: 규칙마다 ID·제목·분야·기본 등급·근거(고시 번호)와 켜기·등급 고르기가 있다', async () => {
    await renderReady()
    const line = within(ruleRow('LA-01'))
    expect(line.getByText('신경차단술 12개월 횟수')).toBeTruthy()
    expect(line.getByText('신경차단술')).toBeTruthy()
    expect(line.getByText('기본: 확인 필요')).toBeTruthy()
    expect(line.getByText('고시 제2025-001호')).toBeTruthy()
    expect(toggle('LA-01').checked).toBe(true)
    expect(Array.from(gradeBox('LA-01').options).map((o) => [o.value, o.textContent])).toEqual([
      ['확인필요', '확인 필요'],
      ['알림', '알림'],
      ['참고', '참고'],
    ])
    expect(gradeBox('LA-01').value).toBe('확인필요')
    // 기본으로 꺼진 규칙은 꺼진 채로 나온다
    expect(toggle('MT-03').checked).toBe(false)
    expect(within(ruleRow('MT-03')).getByText('기본: 참고')).toBeTruthy()
  })

  it('AC-012.6: 표 머리 칸마다 이름이 있다(빈 칸 없음)', async () => {
    await renderReady()
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['켜기', '규칙', '묶음', '등급', '고시 근거', '바꾼 날', '기본값'])
  })

  it('AC-012.6: 근거가 여럿이면 고시 번호를 모두 보인다', async () => {
    FakeWorker.answer = {
      ok: true,
      rules: [{ ...LA, basis: [{ doc: '문서', number: '고시 제1호' }, { doc: '문서', number: '심사기준 2호' }] }],
    }
    await renderReady()
    expect(within(ruleRow('LA-01')).getByText('고시 제1호 · 심사기준 2호')).toBeTruthy()
  })

  it('AC-012.6: 저장된 설정을 보인다 — 끈 규칙은 꺼짐, 기본이 꺼진 규칙을 켰으면 켜짐, 고른 등급', async () => {
    db.rows = [row('LA-01', false), row('MT-03', true, '확인필요')]
    await renderReady()
    expect(toggle('LA-01').checked).toBe(false)
    expect(toggle('MT-03').checked).toBe(true)
    expect(gradeBox('MT-03').value).toBe('확인필요')
    expect(within(ruleRow('MT-03')).getByText('기본: 참고')).toBeTruthy()
  })

  it('AC-012.6: 머리에 전체·켜짐·꺼짐 수가 있고 바꾸면 따라 바뀐다', async () => {
    const user = await renderReady()
    expect(screen.getByText('3개 · 켜짐 2 · 꺼짐 1')).toBeTruthy()
    await user.click(toggle('MT-03'))
    expect(screen.getByText('3개 · 켜짐 3 · 꺼짐 0')).toBeTruthy()
  })

  it('AC-012.6: 바꾼 날은 한국 날짜 월/일이고 줄이 없으면 —', async () => {
    db.rows = [row('LA-01', false, null, '2026-10-30T15:30:00Z')] // 한국 시각 10월 31일 00:30
    await renderReady()
    expect(within(ruleRow('LA-01')).getByText('10/31')).toBeTruthy()
    expect(within(ruleRow('PT-02')).getByText('—')).toBeTruthy()
  })
})

describe('AC-012.6 [저장]은 바뀐 것만', () => {
  it('AC-012.6: 바뀐 것이 없으면 [저장]·[되돌리기]가 막혀 있다', async () => {
    await renderReady()
    expect(saveButton().disabled).toBe(true)
    expect(undoButton().disabled).toBe(true)
    expect(screen.getByText('바꾼 것 0개')).toBeTruthy()
  })

  it('AC-012.6: 끄면 그 규칙 줄 하나만 upsert한다(hospital_id·updated_at 없음)', async () => {
    const user = await renderReady()
    await user.click(toggle('LA-01'))
    expect(toggle('LA-01').checked).toBe(false)
    expect(screen.getByText('바꾼 것 1개')).toBeTruthy()
    expect(within(ruleRow('LA-01')).getByText('바꿈')).toBeTruthy()
    await user.click(saveButton())
    await waitFor(() => expect(db.upserts).toEqual([[{ rule_id: 'LA-01', enabled: false, grade: null }]]))
    expect(db.deletes).toEqual([])
  })

  it('AC-012.6: 등급을 고르면 그 등급으로 저장한다. 기본으로 꺼진 규칙은 켜지지 않는다', async () => {
    const user = await renderReady()
    await user.selectOptions(gradeBox('LA-01'), '알림')
    await user.selectOptions(gradeBox('MT-03'), '확인필요')
    expect(toggle('MT-03').checked).toBe(false)
    await user.click(saveButton())
    await waitFor(() => expect(db.upserts).toHaveLength(1))
    expect(db.upserts[0]).toEqual(
      expect.arrayContaining([
        { rule_id: 'LA-01', enabled: true, grade: '알림' },
        { rule_id: 'MT-03', enabled: false, grade: '확인필요' },
      ]),
    )
    expect(db.upserts[0]).toHaveLength(2)
  })

  it('AC-012.6: 저장한 뒤에는 바뀐 것이 0개이고 바꾼 날이 새로 나온다. 다시 저장할 것이 없다', async () => {
    const user = await renderReady()
    await user.click(toggle('LA-01'))
    await user.click(saveButton())
    await waitFor(() => expect(screen.getByText('바꾼 것 0개')).toBeTruthy())
    await waitFor(() => expect(within(ruleRow('LA-01')).getByText('11/4')).toBeTruthy())
    expect(within(ruleRow('LA-01')).queryByText('바꿈')).toBeNull()
    expect(saveButton().disabled).toBe(true)
  })

  it('AC-012.6: 저장은 됐는데 바꾼 날을 다시 읽지 못해도 오류를 보이지 않는다', async () => {
    const user = await renderReady()
    await user.click(toggle('LA-01'))
    db.fail.select = true
    await user.click(saveButton())
    await waitFor(() => expect(screen.getByText('바꾼 것 0개')).toBeTruthy())
    expect(screen.queryByRole('alert')).toBeNull()
    expect(toggle('LA-01').checked).toBe(false)
  })

  it('AC-012.6: 바꿨다가 기본값으로 돌아오면 바뀐 것이 아니다', async () => {
    const user = await renderReady()
    await user.click(toggle('LA-01'))
    await user.click(toggle('LA-01'))
    await user.selectOptions(gradeBox('PT-02'), '참고')
    await user.selectOptions(gradeBox('PT-02'), '알림')
    expect(screen.getByText('바꾼 것 0개')).toBeTruthy()
    expect(saveButton().disabled).toBe(true)
  })

  it('AC-012.6: [되돌리기]는 저장하지 않은 것을 저장된 값으로 되돌리고 아무것도 보내지 않는다', async () => {
    db.rows = [row('LA-01', false)]
    const user = await renderReady()
    await user.click(toggle('LA-01'))
    await user.selectOptions(gradeBox('PT-02'), '참고')
    expect(screen.getByText('바꾼 것 2개')).toBeTruthy()
    await user.click(undoButton())
    expect(toggle('LA-01').checked).toBe(false)
    expect(gradeBox('PT-02').value).toBe('알림')
    expect(screen.getByText('바꾼 것 0개')).toBeTruthy()
    expect(db.upserts).toEqual([])
    expect(db.deletes).toEqual([])
  })

  it('AC-012.6: 저장 중에는 [저장]이 기다림 모양이고 다시 눌러도 한 번만 보낸다', async () => {
    let release = () => {}
    db.hold = new Promise((resolve) => {
      release = resolve
    })
    const user = await renderReady()
    await user.click(toggle('LA-01'))
    await user.click(saveButton())
    await waitFor(() => expect(saveButton().getAttribute('aria-busy')).toBe('true'))
    await user.click(saveButton())
    expect(db.upserts).toHaveLength(1)
    await act(async () => release())
    await waitFor(() => expect(screen.getByText('바꾼 것 0개')).toBeTruthy())
    expect(saveButton().getAttribute('aria-busy')).toBeNull()
  })

  it('AC-012.6: 저장 중에는 [되돌리기]가 막혀 있다(화면만 옛 값으로 돌아가 서버와 어긋나지 않게)', async () => {
    let release = () => {}
    db.hold = new Promise((resolve) => {
      release = resolve
    })
    const user = await renderReady()
    await user.click(toggle('LA-01'))
    await user.click(saveButton())
    await waitFor(() => expect(saveButton().getAttribute('aria-busy')).toBe('true'))
    expect(undoButton().disabled).toBe(true)
    await user.click(undoButton())
    await act(async () => release())
    await waitFor(() => expect(screen.getByText('바꾼 것 0개')).toBeTruthy())
    expect(toggle('LA-01').checked).toBe(false)
    expect(db.rows.map((r) => [r.rule_id, r.enabled])).toEqual([['LA-01', false]])
  })

  it('AC-012.6: 저장하는 동안 더 바꾼 것은 저장 뒤에도 바뀐 것으로 남는다', async () => {
    let release = () => {}
    db.hold = new Promise((resolve) => {
      release = resolve
    })
    const user = await renderReady()
    await user.click(toggle('LA-01'))
    await user.click(saveButton())
    await waitFor(() => expect(saveButton().getAttribute('aria-busy')).toBe('true'))
    await user.click(toggle('PT-02'))
    await act(async () => release())
    await waitFor(() => expect(screen.getByText('바꾼 것 1개')).toBeTruthy())
    expect(toggle('PT-02').checked).toBe(false)
  })
})

describe('AC-012.6 [기본값으로]', () => {
  it('AC-012.6: 저장된 줄이 있는 규칙의 [기본값으로]를 누르고 저장하면 그 규칙 줄을 지운다. 다른 줄은 그대로다', async () => {
    db.rows = [row('LA-01', false, '알림'), row('PT-02', false)]
    const user = await renderReady()
    await user.click(resetButton('LA-01'))
    expect(toggle('LA-01').checked).toBe(true)
    expect(gradeBox('LA-01').value).toBe('확인필요')
    expect(screen.getByText('바꾼 것 1개')).toBeTruthy()
    expect(db.deletes).toEqual([]) // 저장하기 전에는 보내지 않는다
    await user.click(saveButton())
    await waitFor(() => expect(db.deletes).toEqual([['LA-01']]))
    expect(db.upserts).toEqual([])
    await waitFor(() => expect(db.rows.map((r) => r.rule_id)).toEqual(['PT-02']))
    await waitFor(() => expect(within(ruleRow('LA-01')).getByText('—')).toBeTruthy())
  })

  it('AC-012.6: 저장된 줄이 있는데 직접 기본값으로 돌려놔도 그 줄을 지운다', async () => {
    db.rows = [row('LA-01', false)]
    const user = await renderReady()
    await user.click(toggle('LA-01'))
    await user.click(saveButton())
    await waitFor(() => expect(db.deletes).toEqual([['LA-01']]))
    expect(db.upserts).toEqual([])
  })

  it('AC-012.6: 기본값 그대로인 규칙은 [기본값으로]가 막혀 있고, 저장 안 한 바꿈이 있으면 풀린다', async () => {
    const user = await renderReady()
    expect(resetButton('PT-02').disabled).toBe(true)
    await user.click(toggle('PT-02'))
    expect(resetButton('PT-02').disabled).toBe(false)
    await user.click(resetButton('PT-02'))
    expect(toggle('PT-02').checked).toBe(true)
    expect(screen.getByText('바꾼 것 0개')).toBeTruthy()
  })
})

describe('AC-012.6 실패', () => {
  it('AC-012.6: 저장이 실패하면 값을 그대로 두고 오류 카드 + [다시 저장]. 원래 오류 글은 보이지 않는다', async () => {
    db.fail.upsert = true
    const user = await renderReady()
    await user.click(toggle('LA-01'))
    await user.click(saveButton())
    const card = await screen.findByRole('alert')
    expect(card.textContent).toContain('E-SETTINGS-FAILED')
    expect(document.body.textContent).not.toContain('does not exist')
    expect(toggle('LA-01').checked).toBe(false)
    expect(screen.getByText('바꾼 것 1개')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '저장' })).toBeNull()
    db.fail.upsert = false
    await user.click(screen.getByRole('button', { name: '다시 저장' }))
    await waitFor(() => expect(screen.getByText('바꾼 것 0개')).toBeTruthy())
    expect(db.upserts).toEqual([
      [{ rule_id: 'LA-01', enabled: false, grade: null }],
      [{ rule_id: 'LA-01', enabled: false, grade: null }],
    ])
    expect(screen.queryByRole('alert')).toBeNull()
    expect(saveButton()).toBeTruthy()
  })

  it('AC-012.6: 지우기가 실패해도 값을 그대로 두고 다시 저장하면 같은 줄을 다시 지운다', async () => {
    db.rows = [row('LA-01', false)]
    db.fail.delete = true
    const user = await renderReady()
    await user.click(resetButton('LA-01'))
    await user.click(saveButton())
    expect((await screen.findByRole('alert')).textContent).toContain('E-SETTINGS-FAILED')
    expect(toggle('LA-01').checked).toBe(true)
    db.fail.delete = false
    await user.click(screen.getByRole('button', { name: '다시 저장' }))
    await waitFor(() => expect(db.deletes).toEqual([['LA-01'], ['LA-01']]))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('AC-012.6: 저장 실패 뒤 [되돌리기]를 누르면 오류 카드도 사라진다', async () => {
    db.fail.upsert = true
    const user = await renderReady()
    await user.click(toggle('LA-01'))
    await user.click(saveButton())
    await screen.findByRole('alert')
    await user.click(undoButton())
    expect(screen.queryByRole('alert')).toBeNull()
    await waitFor(() => expect(toggle('LA-01').checked).toBe(true))
  })

  it('AC-012.6: 고친 줄은 들어가고 지우기만 실패한 뒤 [되돌리기]를 누르면 서버를 다시 읽어 실제 값을 보인다', async () => {
    db.rows = [row('LA-01', false)]
    db.fail.delete = true
    const user = await renderReady()
    await user.click(resetButton('LA-01'))
    await user.click(toggle('PT-02'))
    await user.click(saveButton())
    await screen.findByRole('alert')
    db.fail.delete = false
    await user.click(undoButton())
    // PT-02를 끈 것은 서버에 들어갔다. 옛 값(켜짐)을 보이면 화면과 서버가 어긋난다
    await waitFor(() => expect(toggle('PT-02').checked).toBe(false))
    expect(toggle('LA-01').checked).toBe(false)
    expect(screen.getByText('바꾼 것 0개')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-012.6: 저장 실패 뒤 손으로 되돌려 바뀐 것이 없어도 [되돌리기]로 오류 카드를 닫을 수 있다', async () => {
    db.fail.upsert = true
    const user = await renderReady()
    await user.click(toggle('LA-01'))
    await user.click(saveButton())
    await screen.findByRole('alert')
    await user.click(toggle('LA-01'))
    expect(screen.getByText('바꾼 것 0개')).toBeTruthy()
    expect(undoButton().disabled).toBe(false)
    await user.click(undoButton())
    expect(screen.queryByRole('alert')).toBeNull()
    await waitFor(() => expect(toggle('LA-01').checked).toBe(true))
  })

  it.each([
    ['ok:false 답', { ok: false, code: 'E-RULES-LOAD-FAILED' } as WorkerAnswer],
    ['Worker 오류', 'crash' as WorkerAnswer],
  ])('AC-012.6: 규칙표를 못 받으면(%s) E-RULES-LOAD-FAILED 카드와 [다시 불러오기]. 새 Worker로 다시 받는다', async (_name, answer) => {
    FakeWorker.answer = answer
    const user = userEvent.setup()
    render(<RuleSettings />)
    expect((await screen.findByRole('alert')).textContent).toContain('E-RULES-LOAD-FAILED')
    expect(FakeWorker.instances[0]?.terminated).toBe(true)
    FakeWorker.answer = { ok: true, rules: RULES }
    await user.click(screen.getByRole('button', { name: '다시 불러오기' }))
    await screen.findByText('LA-01')
    expect(FakeWorker.instances).toHaveLength(2)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-012.6: Worker를 만들지 못해도 E-RULES-LOAD-FAILED', async () => {
    vi.stubGlobal('Worker', function BrokenWorker() {
      throw new Error('blocked by policy')
    })
    render(<RuleSettings />)
    const card = await screen.findByRole('alert')
    expect(card.textContent).toContain('E-RULES-LOAD-FAILED')
    expect(document.body.textContent).not.toContain('blocked by policy')
  })

  it('AC-012.6: Worker가 30초 동안 답하지 않으면 E-RULES-LOAD-FAILED이고 Worker를 끝낸다', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    FakeWorker.answer = 'silent'
    render(<RuleSettings />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(screen.getByRole('alert').textContent).toContain('E-RULES-LOAD-FAILED')
    expect(FakeWorker.instances[0]?.terminated).toBe(true)
  })

  it('AC-012.6: 설정을 못 읽으면 E-SETTINGS-FAILED 카드와 [다시 불러오기]. 표를 그리지 않아 잘못된 값으로 저장할 수 없다', async () => {
    db.fail.select = true
    const user = userEvent.setup()
    render(<RuleSettings />)
    expect((await screen.findByRole('alert')).textContent).toContain('E-SETTINGS-FAILED')
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByRole('button', { name: '저장' })).toBeNull()
    db.fail.select = false
    db.rows = [row('LA-01', false)]
    await user.click(screen.getByRole('button', { name: '다시 불러오기' }))
    await screen.findByText('LA-01')
    expect(toggle('LA-01').checked).toBe(false)
  })

  it('AC-012.6: 답을 받기 전에 화면을 떠나면 Worker를 끝낸다', async () => {
    FakeWorker.answer = 'silent'
    const { unmount } = render(<RuleSettings />)
    await waitFor(() => expect(FakeWorker.instances).toHaveLength(1))
    unmount()
    expect(FakeWorker.instances[0]?.terminated).toBe(true)
  })
})

// 쓰기는 두 번(upsert·delete)이라 앞쪽만 들어갈 수 있고, 들어갔는데 답만 못 받을 수도 있다. 실패 뒤에는 서버가 saved와 같다고 볼 수 없다
// 누름이 많은 시험이라 PC가 바쁘면 기본 5초를 넘는다(내용과 상관없는 실패를 막는다)
describe('AC-012.6 일부만 저장된 뒤 다시 저장', { timeout: 30_000 }, () => {
  const serverRows = () => db.rows.map((r) => [r.rule_id, r.enabled, r.grade])
  const resaveButton = () => screen.getByRole<HTMLButtonElement>('button', { name: '다시 저장' })

  /** PT-02를 끈 줄은 서버에 들어가고, LA-01을 지우는 것만 실패한 상태 */
  async function partlySaved(change: (user: ReturnType<typeof userEvent.setup>) => Promise<unknown>) {
    db.rows = [row('LA-01', false)]
    db.fail.delete = true
    const user = await renderReady()
    await user.click(resetButton('LA-01'))
    await change(user)
    await user.click(saveButton())
    await screen.findByRole('alert')
    db.fail.delete = false
    return user
  }

  it('AC-012.6: 들어간 줄을 손으로 되돌리고 [다시 저장]하면 서버도 화면과 같아진다', async () => {
    const user = await partlySaved((u) => u.click(toggle('PT-02')))
    expect(serverRows()).toEqual([
      ['LA-01', false, null],
      ['PT-02', false, null],
    ])
    await user.click(toggle('PT-02'))
    await user.click(resaveButton())
    await waitFor(() => expect(serverRows()).toEqual([]))
    await waitFor(() => expect(screen.getByText('바꾼 것 0개')).toBeTruthy())
    expect(toggle('PT-02').checked).toBe(true)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-012.6: 들어간 줄을 [기본값으로]로 되돌리고 [다시 저장]해도 서버가 화면과 같아진다', async () => {
    const user = await partlySaved((u) => u.selectOptions(gradeBox('PT-02'), '참고'))
    expect(serverRows()).toContainEqual(['PT-02', true, '참고'])
    await user.click(resetButton('PT-02'))
    await user.click(resaveButton())
    await waitFor(() => expect(serverRows()).toEqual([]))
    await waitFor(() => expect(screen.getByText('바꾼 것 0개')).toBeTruthy())
    expect(gradeBox('PT-02').value).toBe('알림')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-012.6: 들어갔는데 답만 못 받은 저장도 같다 — 손으로 되돌려 바뀐 것이 0개여도 [다시 저장]으로 서버를 화면에 맞춘다', async () => {
    db.fail.upsertLost = true
    const user = await renderReady()
    await user.click(toggle('LA-01'))
    await user.click(saveButton())
    await screen.findByRole('alert')
    expect(serverRows()).toEqual([['LA-01', false, null]])
    db.fail.upsertLost = false
    await user.click(toggle('LA-01'))
    expect(screen.getByText('바꾼 것 0개')).toBeTruthy()
    expect(resaveButton().disabled).toBe(false)
    await user.click(resaveButton())
    await waitFor(() => expect(serverRows()).toEqual([]))
    await waitFor(() => expect(saveButton().disabled).toBe(true))
    expect(toggle('LA-01').checked).toBe(true)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-012.6: 실패 뒤 [다시 저장]은 서버 줄을 먼저 읽고 그것과 다른 줄만 보낸다', async () => {
    const user = await partlySaved((u) => u.click(toggle('PT-02')))
    db.calls = []
    db.upserts = []
    db.deletes = []
    await user.click(resaveButton())
    await waitFor(() => expect(screen.getByText('바꾼 것 0개')).toBeTruthy())
    // 읽기 → 남은 지우기 → 바꾼 날 읽기. PT-02는 이미 들어가 있어 다시 보내지 않는다
    expect(db.calls).toEqual(['select', 'delete', 'select'])
    expect(db.upserts).toEqual([])
    expect(db.deletes).toEqual([['LA-01']])
    expect(serverRows()).toEqual([['PT-02', false, null]])
  })

  it('AC-012.6: 실패가 없었던 저장은 먼저 읽지 않는다', async () => {
    const user = await renderReady()
    await user.click(toggle('LA-01'))
    db.calls = []
    await user.click(saveButton())
    await waitFor(() => expect(screen.getByText('바꾼 것 0개')).toBeTruthy())
    expect(db.calls).toEqual(['upsert', 'select'])
  })

  it('AC-012.6: 실패 뒤 먼저 읽기가 실패하면 아무것도 보내지 않고 값과 오류 카드를 그대로 둔다', async () => {
    const user = await partlySaved((u) => u.click(toggle('PT-02')))
    db.fail.select = true
    db.calls = []
    await user.click(resaveButton())
    await screen.findByRole('alert')
    expect(db.calls).toEqual(['select'])
    expect(toggle('LA-01').checked).toBe(true)
    expect(toggle('PT-02').checked).toBe(false)
    expect(resaveButton()).toBeTruthy()
  })

  // [저장]은 바뀐 것만 보낸다: 실패 뒤에도 내가 건드린 규칙만 맞춘다. 실패한 동안 다른 탭(휴대폰 등)이 고친 규칙은 서버 값을 따른다
  const otherTab = (r: ClaimRuleSettingRow) => {
    db.rows = [...db.rows.filter((x) => x.rule_id !== r.rule_id), r]
  }
  const PT_OFF = { rule_id: 'PT-02', enabled: false, grade: null }

  /** PT-02를 끄는 저장이 실패한 상태(서버에 아무것도 안 들어감) */
  async function failedSave() {
    db.fail.upsert = true
    const user = await renderReady()
    await user.click(toggle('PT-02'))
    await user.click(saveButton())
    await screen.findByRole('alert')
    db.fail.upsert = false
    db.upserts = []
    return user
  }

  it('AC-012.6: 실패 뒤 다른 탭이 끈 규칙을 [다시 저장]이 지우지 않는다 — 내가 고친 줄만 보내고 서버·화면 모두 다른 탭 값이다', async () => {
    const user = await failedSave()
    otherTab(row('LA-01', false))
    await user.click(resaveButton())
    await waitFor(() => expect(toggle('LA-01').checked).toBe(false))
    expect(db.upserts).toEqual([[PT_OFF]])
    expect(db.deletes).toEqual([])
    expect(serverRows()).toContainEqual(['LA-01', false, null])
    expect(serverRows()).toContainEqual(['PT-02', false, null])
    expect(toggle('PT-02').checked).toBe(false)
    expect(screen.getByText('바꾼 것 0개')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-012.6: 손으로 되돌려 바뀐 것이 0개여도 다른 탭이 끈 규칙을 지우지 않는다', async () => {
    const user = await failedSave()
    await user.click(toggle('PT-02'))
    otherTab(row('LA-01', false))
    await user.click(resaveButton())
    await waitFor(() => expect(toggle('LA-01').checked).toBe(false))
    expect(db.upserts).toEqual([])
    expect(db.deletes).toEqual([])
    expect(serverRows()).toEqual([['LA-01', false, null]])
    expect(toggle('PT-02').checked).toBe(true)
    expect(screen.getByText('바꾼 것 0개')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-012.6: 다른 탭이 고친 줄을 옛 값으로 덮어쓰지 않는다 — 켜기와 등급 모두 서버·화면이 다른 탭 값이다', async () => {
    db.rows = [row('LA-01', false)]
    const user = await failedSave()
    otherTab(row('LA-01', true, '참고'))
    await user.click(resaveButton())
    await waitFor(() => expect(toggle('LA-01').checked).toBe(true))
    expect(gradeBox('LA-01').value).toBe('참고')
    expect(db.upserts).toEqual([[PT_OFF]])
    expect(db.deletes).toEqual([])
    expect(serverRows()).toContainEqual(['LA-01', true, '참고'])
    expect(screen.getByText('바꾼 것 0개')).toBeTruthy()
  })

  it('AC-012.6: 내가 고친 규칙을 다른 탭도 고쳤으면 보통 저장처럼 화면 값이 이긴다', async () => {
    db.fail.upsert = true
    const user = await renderReady()
    await user.selectOptions(gradeBox('PT-02'), '참고')
    await user.click(saveButton())
    await screen.findByRole('alert')
    db.fail.upsert = false
    otherTab(row('PT-02', false))
    await user.click(resaveButton())
    await waitFor(() => expect(serverRows()).toEqual([['PT-02', true, '참고']]))
    await waitFor(() => expect(screen.getByText('바꾼 것 0개')).toBeTruthy())
    expect(toggle('PT-02').checked).toBe(true)
    expect(gradeBox('PT-02').value).toBe('참고')
  })

  it('AC-012.6: 실패 뒤 손으로 되돌렸고 다른 변화도 없으면 [다시 저장]은 읽기만 하고 아무것도 보내지 않는다', async () => {
    const user = await failedSave()
    await user.click(toggle('PT-02'))
    db.calls = []
    await user.click(resaveButton())
    await waitFor(() => expect(db.calls).toEqual(['select', 'select']))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(serverRows()).toEqual([])
    expect(saveButton().disabled).toBe(true)
  })

  it('AC-012.6: 실패가 거듭되어도 앞선 저장이 건드린 규칙을 잊지 않는다', async () => {
    db.fail.upsertLost = true
    const user = await renderReady()
    await user.click(toggle('PT-02'))
    await user.click(saveButton())
    await screen.findByRole('alert')
    db.fail.upsertLost = false
    // 들어간 줄을 손으로 되돌렸는데 다음 저장도 실패한다(이때 바뀐 것은 0개다)
    await user.click(toggle('PT-02'))
    db.fail.select = true
    await user.click(resaveButton())
    await screen.findByRole('alert')
    db.fail.select = false
    await user.click(resaveButton())
    await waitFor(() => expect(serverRows()).toEqual([]))
    expect(db.deletes).toEqual([['PT-02']])
    expect(toggle('PT-02').checked).toBe(true)
  })

  it('AC-012.6: [다시 저장]하는 동안 더 바꾼 것은 바뀐 것으로 남고, 다른 탭 값도 함께 들어온다', async () => {
    const user = await failedSave()
    otherTab(row('LA-01', false))
    let release = () => {}
    db.hold = new Promise((resolve) => {
      release = resolve
    })
    await user.click(resaveButton())
    await waitFor(() => expect(db.upserts).toHaveLength(1))
    await user.click(toggle('MT-03'))
    await act(async () => release())
    await waitFor(() => expect(screen.getByText('바꾼 것 1개')).toBeTruthy())
    expect(toggle('MT-03').checked).toBe(true)
    expect(toggle('LA-01').checked).toBe(false)
    expect(toggle('PT-02').checked).toBe(false)
    expect(serverRows()).toContainEqual(['LA-01', false, null])
    expect(serverRows().map(([id]) => id)).not.toContain('MT-03')
  })

  it('AC-012.6: [되돌리기] 뒤에는 앞선 실패를 잊는다 — 다음 실패의 [다시 저장]이 그 규칙을 건드리지 않는다', async () => {
    const user = await failedSave()
    await user.click(undoButton())
    await waitFor(() => expect(toggle('PT-02').checked).toBe(true))
    db.fail.upsert = true
    await user.click(toggle('MT-03'))
    await user.click(saveButton())
    await screen.findByRole('alert')
    db.fail.upsert = false
    otherTab(row('PT-02', false))
    db.upserts = []
    await user.click(resaveButton())
    await waitFor(() => expect(toggle('PT-02').checked).toBe(false))
    expect(db.upserts).toEqual([[{ rule_id: 'MT-03', enabled: true, grade: null }]])
    expect(db.deletes).toEqual([])
    expect(serverRows()).toContainEqual(['PT-02', false, null])
  })

  it('AC-012.6: 실패 뒤 아직 보낸 적 없는 규칙을 더 고치고 [다시 저장]하면 그 고침도 함께 들어간다', async () => {
    const user = await partlySaved((u) => u.click(toggle('PT-02')))
    db.upserts = []
    db.deletes = []
    await user.click(toggle('MT-03'))
    await user.click(resaveButton())
    await waitFor(() => expect(screen.getByText('바꾼 것 0개')).toBeTruthy())
    expect(db.upserts).toEqual([[{ rule_id: 'MT-03', enabled: true, grade: null }]])
    expect(db.deletes).toEqual([['LA-01']])
    expect(toggle('MT-03').checked).toBe(true)
  })

  it('AC-012.6: [다시 저장]이 성공하면 앞선 실패를 잊는다 — 다음 실패의 [다시 저장]이 다른 탭이 고친 그 규칙을 덮어쓰지 않는다', async () => {
    const user = await failedSave()
    await user.click(resaveButton())
    // 바꾼 날을 읽는 것까지 끝나야 다음 저장을 받는다
    await waitFor(() => expect(saveButton().getAttribute('aria-busy')).toBeNull())
    db.fail.upsert = true
    await user.click(toggle('MT-03'))
    await user.click(saveButton())
    await screen.findByRole('alert')
    db.fail.upsert = false
    otherTab(row('PT-02', true, '참고'))
    db.upserts = []
    db.deletes = []
    await user.click(resaveButton())
    await waitFor(() => expect(screen.getByText('바꾼 것 0개')).toBeTruthy())
    expect(db.upserts).toEqual([[{ rule_id: 'MT-03', enabled: true, grade: null }]])
    expect(db.deletes).toEqual([])
    expect(serverRows()).toContainEqual(['PT-02', true, '참고'])
  })
})

describe('AC-012.6 찾기·거르기', () => {
  const MANY = Array.from({ length: 45 }, (_, i) =>
    rule(`LA-${String(i + 10)}`, `차단술 ${i}`, i % 2 === 0 ? '신경차단술' : '물리치료', i % 3 === 0 ? '참고' : '알림', `고시 ${i}`),
  )

  it('AC-012.6: 이름·번호로 찾는다. 없으면 안내 줄이 나온다', async () => {
    const user = await renderReady()
    const search = screen.getByRole('searchbox', { name: '규칙 찾기' })
    await user.type(search, '물리치료')
    expect(visibleIds()).toEqual(['PT-02'])
    await user.clear(search)
    await user.type(search, 'mt-03')
    expect(visibleIds()).toEqual(['MT-03'])
    await user.clear(search)
    await user.type(search, '없는 규칙')
    expect(screen.getByText('찾는 규칙이 없어요.')).toBeTruthy()
  })

  it('AC-012.6: 묶음으로 거른다. 묶음 목록은 규칙에서 만든다', async () => {
    const user = await renderReady()
    const group = screen.getByRole<HTMLSelectElement>('combobox', { name: '묶음' })
    expect(Array.from(group.options).map((o) => o.textContent)).toEqual(['묶음: 전체', '신경차단술', '물리치료', '도수치료'])
    await user.selectOptions(group, '도수치료')
    expect(visibleIds()).toEqual(['MT-03'])
  })

  it('AC-012.6: 지금 등급으로 거른다(고른 등급을 따른다). 등급은 색이 아니라 글자로 보인다', async () => {
    const user = await renderReady()
    await user.selectOptions(gradeBox('LA-01'), '참고')
    const grade = screen.getByRole<HTMLSelectElement>('combobox', { name: '등급' })
    expect(Array.from(grade.options).map((o) => o.textContent)).toEqual(['등급: 전체', '확인 필요', '알림', '참고'])
    await user.selectOptions(grade, '참고')
    expect(visibleIds()).toEqual(['LA-01', 'MT-03'])
  })

  it('AC-012.6: 20개씩 보이고 [다음 N개]로 더 본다. 거르면 처음부터 다시 센다', async () => {
    FakeWorker.answer = { ok: true, rules: MANY }
    const user = userEvent.setup()
    render(<RuleSettings />)
    await screen.findByText('LA-10')
    expect(visibleIds()).toHaveLength(20)
    await user.click(screen.getByRole('button', { name: '다음 20개' }))
    expect(visibleIds()).toHaveLength(40)
    await user.click(screen.getByRole('button', { name: '다음 5개' }))
    expect(visibleIds()).toHaveLength(45)
    expect(screen.queryByRole('button', { name: /^다음/ })).toBeNull()
    await user.selectOptions(screen.getByRole('combobox', { name: '묶음' }), '신경차단술')
    expect(visibleIds()).toHaveLength(20)
  })

  it('AC-012.6: 거른 동안 안 보이는 규칙의 바꿈도 함께 저장된다', async () => {
    const user = await renderReady()
    await user.click(toggle('LA-01'))
    await user.selectOptions(screen.getByRole('combobox', { name: '묶음' }), '물리치료')
    expect(visibleIds()).toEqual(['PT-02'])
    await user.click(saveButton())
    await waitFor(() => expect(db.upserts).toEqual([[{ rule_id: 'LA-01', enabled: false, grade: null }]]))
  })
})

describe('AC-012.6 모양(공통 묶음)', () => {
  it('AC-012.6: 패널·머리·제목·단추·칩·입력은 components/ui/classes.ts 묶음을 쓴다', async () => {
    const user = await renderReady()
    const title = screen.getByRole('heading', { level: 2, name: '점검 규칙' })
    expect(title.className).toBe(ds.panelTitle)
    expect(title.parentElement?.className).toBe(ds.panelHead)
    await user.click(toggle('LA-01'))
    expect(saveButton().className).toBe(ds.button.primarySmall)
    expect(undoButton().className).toBe(ds.button.secondarySmall)
    expect(toggle('LA-01').className).toBe(ds.checkbox)
    expect(within(ruleRow('LA-01')).getByText('바꿈').className).toBe(ds.chip.neutral)
    expect(screen.getByRole('searchbox', { name: '규칙 찾기' }).className).toBe(ds.input)
  })

  it('AC-012.6: 저장 뒤 어디서 적용되는지 안내한다(목업 문구)', async () => {
    await renderReady()
    expect(screen.getByText('저장하면 바로 적용돼요. 비트 PC에서 청구 작업 중이면 그 화면에 "설정이 바뀌었어요, 다시 점검하세요"가 떠요.')).toBeTruthy()
  })

  it('AC-012.6: 폰(768px 미만)에서는 표 머리를 숨기고 줄을 세로로 쌓아 옆으로 밀지 않아도 모든 칸이 보인다', async () => {
    await renderReady()
    expect(document.querySelector('thead')?.className).toContain('max-md:hidden')
    expect(ruleRow('LA-01').className).toContain('max-md:grid')
  })
})
