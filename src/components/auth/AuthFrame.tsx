import type { ReactNode } from 'react'
import { LogoMark } from '@/components/common/LogoMark'

// 로그인 전후 화면(로그인·가입 신청·승인 대기·거절)의 틀 (b2b-redesign REQ-213, design.md '인증 화면', UI_GUIDE '인증 화면').
// 두 모양 모두 surface 바탕 .app-ui 뿌리, 맨 위 줄 header(로고 + headerEnd) 하나, main 하나다. 띠 테두리·[서비스 이름]은 없다.
// - aside 없음(가입 신청·승인 대기·거절): 가운데 480 한 칸. 위 줄과 본문이 같은 칸이라 로고 왼쪽 끝 = 본문 왼쪽 끝
// - aside 있음(로그인): 1024px 이상 두 칸(반반). 왼쪽 400 칸은 위 로고 · 세로 가운데 본문 · 아래 소개 줄, 오른쪽은 canvas aside.
//   1024px 미만은 한 칸이고 aside와 소개 줄을 숨기며 같은 로고를 클래스로 24px로 줄인다
// 로고는 랜딩·앱 틀과 같은 LogoMark이고 LogoMark가 정한 고정 두 색(로고 C③)으로 그리며 읽지 않는다.
// headerEnd = 위 줄 오른쪽 끝에 둘 것(승인 대기·거절 화면의 [로그아웃]). 없으면 아무것도 그리지 않는다
export function AuthFrame({ children, headerEnd, aside }: { children: ReactNode; headerEnd?: ReactNode; aside?: ReactNode }) {
  const split = aside != null
  const header = (
    <header className={split ? 'flex items-center max-lg:h-14' : 'flex h-18 items-center max-md:h-14'}>
      <LogoMark size={28} className={split ? 'shrink-0 max-lg:size-6' : 'shrink-0'} />
      {headerEnd != null && <div className="ml-auto flex items-center">{headerEnd}</div>}
    </header>
  )
  const main = (
    <main className={split ? 'max-lg:pt-8 max-lg:pb-8 lg:flex lg:flex-1 lg:flex-col lg:justify-center' : 'pb-12 max-md:pb-8'}>
      {children}
    </main>
  )

  if (!split) {
    return (
      <div className="app-ui min-h-dvh bg-surface text-ink max-md:px-4">
        <div className="mx-auto w-full max-w-120">
          {header}
          {main}
        </div>
      </div>
    )
  }
  return (
    <div className="app-ui min-h-dvh bg-surface text-ink lg:grid lg:grid-cols-2">
      <div>
        <div className="mx-auto flex min-h-dvh w-full flex-col max-md:px-4 md:max-w-100 lg:py-8">
          {header}
          {main}
          <p className="text-caption text-muted max-lg:hidden">통증 의원 관리자를 위한 AI 업무 도구</p>
        </div>
      </div>
      {/* 1024px 미만은 숨는다(display: none → 화면 읽기에서도 빠진다). 좁은 1024 폭에서도 넘치지 않게 좌우 24px */}
      <aside aria-label="미리보기" className="items-center justify-center border-l border-line bg-canvas px-6 py-8 max-lg:hidden lg:flex">
        <div className="w-full max-w-140">{aside}</div>
      </aside>
    </div>
  )
}
