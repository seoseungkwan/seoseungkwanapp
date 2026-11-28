// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FIELD_PLACE, fieldPlace, ourClinicPhrases, PHRASE_TAB_LABELS, type Phrases } from '@/lib/precheck/memo'
import { TABS } from '../HospitalPhrases'
import { CodesTab } from './CodesTab'
import { REGIONS } from './constants'
import { ProcTab } from './ProcTab'
import { ReasonTab } from './ReasonTab'

// [왜 이렇게?] 출처 표(claim-learn AC-9306.2, design.md 8절): why.ts의 FIELD_PLACE·fieldPlace가 적어 둔 탭 이름·칸 이름이
// 설정 › 병원 문구 화면(HospitalPhrases TABS, 각 *Tab의 칸 이름)과 한 글자도 같은지 본다. 다르면 why.ts가 아니라 이 시험이 알린다(주소로 칸을 찾을 때 칸 이름으로 찾는다)

vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({}) }))

afterEach(cleanup)

const noop = () => {}
const draft = (): Phrases => ({ ...ourClinicPhrases(), TPL: { ...ourClinicPhrases().TPL, byProc: { SSNB: '{시술}' } } })
/** 그 탭 화면을 그린다(칸이 있는 탭만) */
function renderTab(tab: string) {
  const props = { draft: draft(), errors: [], onChange: noop }
  if (tab === 'proc') return render(createElement(ProcTab, props))
  if (tab === 'reason') return render(createElement(ReasonTab, props))
  if (tab === 'codes') return render(createElement(CodesTab, { ...props, saved: props.draft, days: [], state: 'failed', today: '2026-11-28', onRetry: noop }))
  throw new Error(`칸 표에 없는 탭: ${tab}`)
}

describe('AC-9306.2 출처 표와 설정 화면 이름', () => {
  it('AC-9306.2: 탭 키·탭 이름(PHRASE_TAB_LABELS)은 설정 화면 묶음 단추(TABS)와 같다', () => {
    expect(Object.fromEntries(TABS.map((tab) => [tab.key, tab.label]))).toEqual(PHRASE_TAB_LABELS)
    expect(Object.keys(PHRASE_TAB_LABELS).sort()).toEqual(TABS.map((tab) => tab.key).sort())
  })

  it('AC-9306.2: FIELD_PLACE의 탭 이름은 그 탭 키의 묶음 단추 이름과 같다', () => {
    for (const [field, place] of Object.entries(FIELD_PLACE)) {
      expect(TABS.find((tab) => tab.key === place.tab)?.label, field).toBe(place.tabLabel)
    }
  })

  it.each([...new Set(Object.values(FIELD_PLACE).map((place) => place.tab))])('AC-9306.2: FIELD_PLACE의 칸 이름은 %s 탭 화면의 칸 이름과 같다', (tab) => {
    renderTab(tab)
    for (const [field, place] of Object.entries(FIELD_PLACE).filter(([, place]) => place.tab === tab)) {
      expect(screen.getAllByText(place.label, { selector: 'label' }), field).toHaveLength(1)
      expect(screen.getByLabelText(place.label), field).toBeTruthy()
    }
  })

  it('AC-9306.2: 부위별 문구(byRegion) 칸 이름은 시술별 문구와 약 탭의 부위별 문구 칸 이름과 같다', () => {
    renderTab('proc')
    const group = screen.getByRole('group', { name: '부위별 문구' })
    for (const { key, ko } of REGIONS) {
      const place = fieldPlace(`byRegion.${key}`)
      expect(place, key).toEqual({ tab: 'proc', tabLabel: '시술별 문구와 약', label: ko })
      expect(within(group).getByLabelText(place!.label), key).toBeTruthy()
    }
    expect(fieldPlace('byRegion.nope')).toBeNull()
  })

  it('AC-9306.2: 시술 이름별 문구(byProc) 칸 이름은 그 시술 이름 칸과 같다', () => {
    renderTab('proc')
    const place = fieldPlace('byProc.SSNB')
    expect(place).toEqual({ tab: 'proc', tabLabel: '시술별 문구와 약', label: 'SSNB' })
    expect(within(screen.getByRole('group', { name: '시술 이름별 문구' })).getByLabelText(place!.label)).toBeTruthy()
  })

  it('AC-9306.2: 코드별 메모 문구(CODEMAP.{코드}.memo) 칸 이름은 처방코드 탭에서 그 코드 메모 문구를 열 때의 칸 이름과 같다', async () => {
    const user = userEvent.setup()
    renderTab('codes')
    const place = fieldPlace('CODEMAP.KK090.memo')
    expect(place?.tab).toBe('codes')
    expect(place?.tabLabel).toBe(TABS.find((tab) => tab.key === 'codes')?.label)
    await user.click(screen.getByRole('button', { name: 'KK090 메모 문구 고치기' }))
    expect(screen.getByLabelText(place!.label)).toBeTruthy()
  })
})
