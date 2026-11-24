// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useReadOnly, useViewing } from './viewing'
import { ViewGate } from './ViewGate'

// 보는 중 문지기 (admin-view REQ-8006 AC-8006.3, design.md '앱 틀'). TabGate와 같은 틀:
// 예약·환자·청구 주소와 그 아래(비트 PC 연결 /claim/setup 포함)는 본문을 그리지 않고 /dashboard로 한 번 바꾼다(글 없음).
// 그 밖은 본문을 ViewingProvider 안에 그린다 — 관리자 화면(/admin·/admin/compare)은 viewing={null}(읽기만이 아님)

const { pathname, router } = vi.hoisted(() => ({ pathname: vi.fn(() => '/dashboard'), router: { replace: vi.fn() } }))
vi.mock('next/navigation', () => ({ usePathname: pathname, useRouter: () => router }))

const VIEWING = { hospitalId: '22222222-2222-4222-8222-222222222222', name: '다라 정형외과의원' }

function Probe() {
  const viewing = useViewing()
  return <p data-testid="probe">{`${viewing?.name ?? '없음'}|${useReadOnly() ? '읽기만' : '쓰기'}`}</p>
}

const gate = () =>
  render(
    <ViewGate viewing={VIEWING}>
      <Probe />
    </ViewGate>,
  )

beforeEach(() => {
  pathname.mockReturnValue('/dashboard')
  router.replace.mockReset()
})
afterEach(cleanup)

describe('AC-8006.3 ViewGate — 예약·환자·청구 주소는 대시보드로', () => {
  it.each(['/calendar', '/patients', '/claim', '/claim/setup', '/calendar/2026-11', '/patients/x/y', '/claim/memo'])(
    'AC-8006.3: %s이면 본문을 그리지 않고 router.replace("/dashboard")를 한 번 부른다(글 없음)',
    (path) => {
      pathname.mockReturnValue(path)
      const { container } = gate()
      expect(container.innerHTML).toBe('')
      expect(router.replace).toHaveBeenCalledTimes(1)
      expect(router.replace).toHaveBeenCalledWith('/dashboard')
    },
  )

  it.each(['/dashboard', '/stats', '/claims', '/calendars', '/patient', '/sunap', '/settings', '/staff', '/location', '/admin', '/admin/compare'])(
    'AC-8006.3: %s이면 본문을 그리고 돌려보내지 않는다',
    (path) => {
      pathname.mockReturnValue(path)
      gate()
      expect(screen.getByTestId('probe')).toBeTruthy()
      expect(router.replace).not.toHaveBeenCalled()
    },
  )

  it('AC-8006.3: 다시 그려도(같은 막힌 주소) 바꾸기는 한 번이다', () => {
    pathname.mockReturnValue('/claim')
    const { rerender } = gate()
    rerender(
      <ViewGate viewing={VIEWING}>
        <Probe />
      </ViewGate>,
    )
    expect(router.replace).toHaveBeenCalledTimes(1)
  })
})

describe('AC-8006.2 ViewGate — 본문은 ViewingProvider 안, 관리자 화면은 읽기만이 아님', () => {
  it.each(['/dashboard', '/stats', '/staff', '/settings', '/location'])('AC-8006.2: %s에서는 본문이 보는 의원·읽기만이다', (path) => {
    pathname.mockReturnValue(path)
    gate()
    expect(screen.getByTestId('probe').textContent).toBe('다라 정형외과의원|읽기만')
  })

  it.each(['/admin', '/admin/compare'])('AC-8006.2: 관리자 화면 %s에서는 viewing={null} — 보는 의원 없음·읽기만 아님', (path) => {
    pathname.mockReturnValue(path)
    gate()
    expect(screen.getByTestId('probe').textContent).toBe('없음|쓰기')
  })

  it('AC-8006.2: /administrator처럼 비슷한 이름은 관리자 화면이 아니다(읽기만)', () => {
    pathname.mockReturnValue('/administrator')
    gate()
    expect(screen.getByTestId('probe').textContent).toBe('다라 정형외과의원|읽기만')
  })

  it('AC-8006.7: 소스에 폰 전용 모양(max-md:)이 없다', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/shell/ViewGate.tsx'), 'utf8')
    expect(source).not.toContain('max-md:')
  })
})
