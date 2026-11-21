// @vitest-environment jsdom
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import { TEMPLATE_DOWNLOADED, TEMPLATE_FILE_NAME, TEMPLATE_HREF, TemplateLink } from './TemplateLink'

// [양식 받기](specs/contacts AC-6506.1, design.md '흐름' 양식 받기). 같은 사이트의 정적 파일을 주소록-양식.xlsx 이름으로 내려받는 링크다.
// 앱이 양식을 만들지 않고 서버 코드·Supabase·fetch를 부르지 않는다

vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn(() => ({})) }))

const fetchSpy = vi.fn()
// jsdom은 링크 이동을 못 한다 → 화면의 누름 처리가 끝난 뒤(문서까지 올라온 뒤) 이동만 막는다
const stopNavigation = (e: Event) => e.preventDefault()
beforeEach(() => {
  vi.stubGlobal('fetch', fetchSpy)
  document.addEventListener('click', stopNavigation)
})
afterEach(() => {
  cleanup()
  document.removeEventListener('click', stopNavigation)
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('AC-6506.1 TemplateLink', () => {
  it('AC-6506.1: /contacts/contacts-template.xlsx를 가리키고 내려받을 이름이 주소록-양식.xlsx인 링크다', () => {
    render(<TemplateLink onDownloaded={vi.fn()} />)
    const link = screen.getByRole('link', { name: '양식 받기' })
    expect(link.getAttribute('href')).toBe('/contacts/contacts-template.xlsx')
    expect(link.getAttribute('download')).toBe('주소록-양식.xlsx')
    expect(link.getAttribute('target')).toBeNull()
    expect(link.className).toBe(ds.button.secondary)
    expect([TEMPLATE_HREF, TEMPLATE_FILE_NAME]).toEqual(['/contacts/contacts-template.xlsx', '주소록-양식.xlsx'])
  })

  it('AC-6506.1: 링크가 가리키는 파일이 저장소 public/에 있다', () => {
    expect(existsSync(join(process.cwd(), 'public', ...TEMPLATE_HREF.split('/').filter(Boolean)))).toBe(true)
  })

  it('AC-6506.1: 누르면 onDownloaded를 한 번 부른다(알림 글은 주소록-양식.xlsx를 받았어요.)', () => {
    const onDownloaded = vi.fn()
    render(<TemplateLink onDownloaded={onDownloaded} />)
    fireEvent.click(screen.getByRole('link', { name: '양식 받기' }))
    expect(onDownloaded).toHaveBeenCalledTimes(1)
    expect(TEMPLATE_DOWNLOADED).toBe('주소록-양식.xlsx를 받았어요.')
  })

  it('AC-6506.1: 서버 코드·Supabase·fetch를 부르지 않는다', async () => {
    const { supabaseBrowser } = await import('@/lib/supabase/browser')
    render(<TemplateLink onDownloaded={vi.fn()} />)
    fireEvent.click(screen.getByRole('link', { name: '양식 받기' }))
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(supabaseBrowser).not.toHaveBeenCalled()
  })
})
