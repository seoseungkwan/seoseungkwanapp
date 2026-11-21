// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BOOK, installMatchMedia, MEDICAL, TODAY, widthClasses } from './book.test.data'
import { CompanyDetail } from './CompanyDetail'
import { CompanyList } from './CompanyList'
import { CompanyPanel } from './CompanyPanel'
import { AddCompanyButton, ContactsHeader } from './ContactsHeader'
import { EmptyBook } from './EmptyBook'
import { FindRow } from './FindRow'
import { NoSelection } from './NoSelection'
import { ShortNotice } from './ShortNotice'
import type { SaveResult } from './types'

// 부품 울타리(spec contacts design.md '화면' parts/ — props·콜백만, tasks.md TASK-4 '폰 전용 모양을 쓰지 않는다').
// 부품 소스는 읽기·저장·Supabase·lib/storage·네트워크·브라우저 저장소를 쓰지 않고, 화면 폭 접두사(md:·max-md: …)를 쓰지 않는다.
// 자세히 두 칸(화면 폭 1200px 이상, 시안 기본값 5)만 min-[1200px]: 하나를 쓴다

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'matchMedia')
})

const DIR = join(process.cwd(), 'src/components/contacts/parts')
const sourceFiles = () => readdirSync(DIR).filter((name) => /\.tsx?$/.test(name) && !/\.test\./.test(name))
const read = (name: string) => readFileSync(join(DIR, name), 'utf8')

describe('AC-6505.1: 부품 소스 울타리', () => {
  it('AC-6505.1: 부품 파일이 있다(빈 검사가 아니다)', () => {
    expect(sourceFiles()).toEqual(
      expect.arrayContaining([
        'CompanyDetail.tsx',
        'CompanyList.tsx',
        'CompanyPanel.tsx',
        'ContactsHeader.tsx',
        'CopyButton.tsx',
        'DeleteDialog.tsx',
        'EmptyBook.tsx',
        'FindRow.tsx',
        'InlineForms.tsx',
        'NoSelection.tsx',
        'PhoneNumber.tsx',
        'ShortNotice.tsx',
        'WarrantyChip.tsx',
        'types.ts',
      ]),
    )
  })

  it('AC-6505.1: supabase·lib/storage·Next·네트워크·브라우저 저장소·console을 쓰지 않는다', () => {
    const banned = [
      /@supabase\//,
      /@\/lib\/supabase/,
      /@\/lib\/storage/,
      /from ['"]next(?:\/|['"])/,
      /\bfetch\s*\(/,
      /XMLHttpRequest|WebSocket|EventSource|sendBeacon/,
      /localStorage|sessionStorage|indexedDB|document\.cookie/,
      /\bconsole\./,
    ]
    for (const file of sourceFiles()) {
      const text = read(file)
      for (const pattern of banned) expect(text, `${file} ${pattern}`).not.toMatch(pattern)
    }
  })

  it('AC-6505.1: 화면 폭 접두사(sm:·md:·lg:·xl:·max-*:·min-[…]:)를 쓰지 않는다 — 자세히 두 칸 min-[1200px]: 하나만', () => {
    const width = /(?:^|[\s"'`])(?:max-|min-)?(?:sm|md|lg|\d*xl):|(?:^|[\s"'`])(?:min|max)-\[(?!1200px\])[^\]]*\]:/m
    for (const file of sourceFiles()) expect(read(file), file).not.toMatch(width)
    expect(sourceFiles().filter((file) => read(file).includes('min-[1200px]:'))).toEqual(['CompanyDetail.tsx'])
  })

  it('AC-6505.1: 콜백 답 모양 SaveResult는 ok 또는 duplicate·failed다', () => {
    const results: SaveResult[] = [{ ok: true }, { ok: true, id: 'x' }, { ok: false, reason: 'duplicate' }, { ok: false, reason: 'failed' }]
    expect(results).toHaveLength(4)
  })
})

describe('AC-6505.1: 그려진 부품에 폰 전용 모양(화면 폭으로 바뀌는 클래스)이 없다', () => {
  const ok = async (): Promise<SaveResult> => ({ ok: true })

  it('AC-6505.1: 머리 줄·찾기 줄·목록·빈 자리·빈 주소록·알림', () => {
    const { container } = render(
      <>
        <ContactsHeader count={8} actions={<AddCompanyButton onClick={() => {}} />} />
        <FindRow book={BOOK} query="충격파" onQuery={() => {}} category="all" onCategory={() => {}} />
        <CompanyList book={BOOK} query="예시" category="all" today={TODAY} selectedId={MEDICAL.id} onSelect={() => {}} />
        <NoSelection />
        <EmptyBook actions={<AddCompanyButton onClick={() => {}} />} />
        <ShortNotice notice={{ text: '저장했어요.', n: 1 }} />
      </>,
    )
    expect(widthClasses(container)).toEqual([])
  })

  it('AC-6505.1: 자세히(열린 칸·확인 창 포함)는 min-[1200px]: 두 칸만', () => {
    installMatchMedia(false)
    const { container } = render(
      <CompanyDetail
        book={BOOK}
        company={MEDICAL}
        today={TODAY}
        onEdit={() => {}}
        onDeleteCompany={ok}
        onSavePerson={ok}
        onDeletePerson={ok}
        onSaveEquipment={ok}
        onDeleteEquipment={ok}
        onSaveRepair={ok}
        onDeleteRepair={ok}
        onNotice={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '충격파 기계 수리 기록 더하기' }))
    expect(widthClasses(container)).toEqual([])
    expect(container.innerHTML).toContain('min-[1200px]:grid-cols-2')
    fireEvent.click(screen.getByRole('button', { name: '예시메디칼 지우기' }))
    expect(widthClasses(document.body)).toEqual([])
  })

  it('AC-6505.4: 업체 판', () => {
    render(<CompanyPanel mode="edit" company={MEDICAL} category="all" companies={BOOK.companies} onSave={ok} onClose={() => {}} onNotice={() => {}} />)
    expect(widthClasses(document.body)).toEqual([])
  })
})
