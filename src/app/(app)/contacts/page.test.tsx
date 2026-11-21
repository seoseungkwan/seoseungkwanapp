// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ContactsPage, { metadata } from './page'

// /contacts 주소록 페이지 (spec contacts AC-6508.2, design.md '화면' page.tsx). 화면 자체는 components/contacts 시험이 본다.
// 여기서는 탭 이름이 '주소록'인지, 준비 중 화면이 아니라 주소록 화면을 그리는지, 주소의 c 값(글자 하나)만 처음 고를 업체 id로 넘기는지 본다.
// 문지기와 앱 틀은 (app)/layout이 준다(데스크는 DeskGate가 막는다 — shell.test.tsx AC-6508.3)
const { ContactsScreen } = vi.hoisted(() => ({
  ContactsScreen: vi.fn<(props: Record<string, unknown>) => null>(() => null),
}))
vi.mock('@/components/contacts/ContactsScreen', () => ({ ContactsScreen }))

const SOURCE = readFileSync(join(process.cwd(), 'src/app/(app)/contacts/page.tsx'), 'utf8')

type Query = { c?: string | string[] }
async function propsFor(query: Query) {
  render(await ContactsPage({ searchParams: Promise.resolve(query) }))
  expect(ContactsScreen).toHaveBeenCalledTimes(1)
  return ContactsScreen.mock.calls[0]![0]
}

describe('/contacts 페이지 (AC-6508.2)', () => {
  beforeEach(() => ContactsScreen.mockClear())
  afterEach(() => cleanup())

  it('AC-6508.2: 탭 이름(metadata.title)은 주소록이다', () => {
    expect(metadata.title).toBe('주소록')
  })

  it('AC-6508.2: 준비 중 화면이 아니라 주소록 화면(ContactsScreen)을 그린다', async () => {
    await propsFor({})
    expect(SOURCE).not.toMatch(/NotReadyScreen|notReadyFeature/)
    expect(SOURCE).toMatch(/from '@\/components\/contacts\/ContactsScreen'/)
  })

  it('AC-6508.2: 주소의 c 값(글자 하나)을 처음 고를 업체 id(initialCompanyId)로 넘긴다', async () => {
    expect(await propsFor({ c: 'c-medical' })).toEqual({ initialCompanyId: 'c-medical' })
  })

  it.each<[string, Query]>([
    ['c 없음', {}],
    ['c가 여럿', { c: ['c-medical', 'c-pharm'] }],
    ['c가 빈 글자', { c: '' }],
  ])('AC-6508.2: %s이면 아무것도 넘기지 않는다(아무것도 안 고른 모양)', async (_name, query) => {
    expect(await propsFor(query)).toEqual({})
  })

  it('AC-6508.2: 페이지는 병원 id·다른 주소 값을 넘기지 않는다', () => {
    expect(SOURCE).not.toMatch(/hospital/i)
    expect([...SOURCE.matchAll(/searchParams/g)].length).toBeGreaterThan(0)
  })
})
