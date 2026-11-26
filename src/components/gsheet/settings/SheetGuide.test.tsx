// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SheetGuide } from './SheetGuide'

// 수납 안내문(spec google-link REQ-8517 AC-8517.1): 비트시트 apps-script/SETUP.md를 웹앱 말로 고친 것.
// 순서(1~8단계·알아 두면 좋은 것)와 낱말 풀이 표는 그대로, 프로그램 → 웹앱 [설정], 사진·환자 값 없음

afterEach(cleanup)

const open = () => {
  const onClose = vi.fn()
  const view = render(<SheetGuide onClose={onClose} />)
  return { onClose, view, user: userEvent.setup() }
}

describe('AC-8517.1 수납 안내문', () => {
  it('AC-8517.1: 제목과 단계 차례가 비트시트 안내문 그대로다', () => {
    open()
    expect(screen.getByRole('heading', { level: 2, name: '수납일지 구글 쪽 준비하기 (처음 한 번)' })).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      '먼저 낱말 풀이',
      '1. 병원 구글 계정으로 들어가기',
      '2. 원본 시트를 병원 계정에 두기',
      '3. 프로젝트 만들고 코드 붙이기',
      '4. 배포하기 (심부름꾼 일하게 내보내기)',
      '5. 권한 승인하기',
      '6. 주소를 웹앱에 넣고 시험하기',
      '7. 나중에 코드를 고칠 때 (새 버전)',
      '8. 잘 안 될 때',
      '알아 두면 좋은 것',
    ])
  })

  it('AC-8517.1: 낱말 풀이 표의 낱말 아홉이 그대로이고, 프로그램 말만 웹앱 말로 바뀐다', () => {
    open()
    const table = within(screen.getByRole('table', { name: '먼저 낱말 풀이' }))
    const rows = table.getAllByRole('row').slice(1)
    expect(rows.map((row) => row.querySelector('th, td')!.textContent)).toEqual([
      '앱스 스크립트',
      '프로젝트',
      '코드',
      '웹 앱',
      '배포',
      '버전',
      '권한 승인',
      '비밀 글자',
      '웹 앱 URL',
    ])
    expect(table.getByText('구글 계정 안에 두는 작은 심부름꾼 프로그램입니다. 내 구글 드라이브 안에서만 일합니다.')).toBeTruthy()
    expect(table.getByText('심부름꾼을 실제로 일하게 내보내는 것입니다. 가게 문을 여는 것과 같습니다.')).toBeTruthy()
    expect(table.getByText('심부름꾼의 인터넷 주소입니다(URL = 인터넷 주소).')).toBeTruthy()
  })

  it('AC-8517.1: 프로그램 대신 웹앱 [설정]으로 안내하고, 주소를 넣을 때 이 PC 확인 창 [바꾸기]를 알린다', () => {
    const { view } = open()
    const text = view.container.textContent!
    expect(text).not.toContain('비트시트 프로그램')
    expect(text).not.toContain('BitSheet ok')
    expect(text).toContain('Seoseungkwan sheet ok')
    expect(text).toContain('[설정] › 구글 연결 › [구글에 붙일 코드 복사]')
    expect(text).toContain('[설정] › 시트의 원본 시트 주소')
    expect(text).toContain('[바꾸기]')
    expect(text).toContain('[연결 시험]')
  })

  it('AC-8517.1: 사진·환자 값이 없다', () => {
    const { view } = open()
    expect(view.container.querySelector('img, picture, svg image, iframe')).toBeNull()
    expect(view.container.textContent).not.toContain('양지바른')
  })

  it('AC-8517.1: [‹ 돌아가기]로 닫는다', async () => {
    const { onClose, user } = open()
    await user.click(screen.getByRole('button', { name: '‹ 돌아가기' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
