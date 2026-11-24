import type { ReactNode } from 'react'

// 16px 선 아이콘 한 곳 (b2b-redesign REQ-204, UI_GUIDE '아이콘·로고'). 그림은 승인 시안 그대로다: 처음 16개는 docs/mockups/b2b-redesign/parts.mjs의 I,
// copy·userCheck는 docs/mockups/dashboard-home/index.html의 [복사]·[가입 승인] 단추(tab-frame REQ-315), logout은 docs/mockups/ui-90/app/gen.py의 ICONS(ui-90 AC-416.7),
// info·reload는 docs/mockups/worklog/bitfill.html의 ICON_INFO·ICON_LOAD(viewBox 24)를 16 칸으로 ×2/3 한 것(worklog AC-017.9, design.md 20-5절).
// alert는 docs/mockups/worklog/memo-font.html의 ICON_WARN을 info와 같은 원(반지름 6)에 맞춘 것(worklog-memo-font AC-1507.3, 업무일지 잘림 안내).
// eye는 docs/mockups/admin-view/index.html의 I.eye 그대로(admin-view, 보는 의원 단추·맨 위 띠·승인 목록 이름).
// 늘 꾸밈이다(aria-hidden). 아이콘만 있는 단추는 단추에 aria-label을 준다. 색은 글자색을 따른다(currentColor) → 놓는 자리가 text-* 토큰 클래스로 정한다.
// 크기는 size(12·14·16)가 너비·높이이고 viewBox·선 굵기 1.5는 그대로다. 서버에서 그대로 그린다(훅 없음)

export const ICON_NAMES = [
  'shield',
  'lock',
  'clock',
  'cal',
  'upload',
  'user',
  'chev',
  'check',
  'x',
  'arrow',
  'arrowDown',
  'monitor',
  'server',
  'sigma',
  'doc',
  'stop',
  // tab-frame REQ-315: 그림은 시안 docs/mockups/dashboard-home/index.html의 [복사]·[가입 승인] 단추 그대로다
  'copy',
  'userCheck',
  // ui-90 AC-416.7: 계정 메뉴 [로그아웃]. 그림은 시안 docs/mockups/ui-90/app/gen.py의 ICONS['logout'] 그대로다
  'logout',
  // worklog AC-017.9: 업무일지 비트 안내 줄·[지금 불러오기]. 그림은 시안 docs/mockups/worklog/bitfill.html의 ICON_INFO·ICON_LOAD ×2/3
  'info',
  'reload',
  // worklog-memo-font AC-1507.3: 업무일지 잘림 안내. 그림은 시안 docs/mockups/worklog/memo-font.html의 ICON_WARN(원은 info와 같게)
  'alert',
  // admin-view AC-8006.2·AC-8006.4·AC-8012.1: 다른 의원 보기(보는 의원 단추·띠·승인 목록 이름). 그림은 시안 docs/mockups/admin-view/index.html의 I.eye 그대로다
  'eye',
] as const

export type IconName = (typeof ICON_NAMES)[number]

const SHAPES: Record<IconName, ReactNode> = {
  shield: (
    <>
      <path d="M8 1.75 3 3.6v3.9c0 3 2.1 5.5 5 6.75 2.9-1.25 5-3.75 5-6.75V3.6L8 1.75z" />
      <path d="m5.9 8 1.5 1.5 2.8-2.9" />
    </>
  ),
  lock: (
    <>
      <rect x="3.25" y="7" width="9.5" height="7" rx="1" />
      <path d="M5.5 7V5.25a2.5 2.5 0 0 1 5 0V7" />
    </>
  ),
  clock: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.75V8l2.25 1.5" />
    </>
  ),
  cal: (
    <>
      <rect x="2.25" y="3.25" width="11.5" height="10.5" rx="1" />
      <path d="M2.25 6.5h11.5M5.5 1.75v3M10.5 1.75v3" />
    </>
  ),
  upload: <path d="M8 10.25V2.75M5 5.5l3-2.75 3 2.75M2.75 10.5v2.75h10.5V10.5" />,
  user: (
    <>
      <circle cx="8" cy="5.5" r="2.75" />
      <path d="M2.75 14c.6-2.5 2.7-3.9 5.25-3.9s4.65 1.4 5.25 3.9" />
    </>
  ),
  chev: <path d="m4.75 6.25 3.25 3.25 3.25-3.25" />,
  check: <path d="m3.5 8.25 2.9 2.9 6.1-6.65" />,
  x: <path d="m4.75 4.75 6.5 6.5m0-6.5-6.5 6.5" />,
  arrow: <path d="M2.75 8h10.5M9.25 4l4 4-4 4" />,
  arrowDown: <path d="M8 2.75v10.5M4 9.25l4 4 4-4" />,
  monitor: (
    <>
      <rect x="1.75" y="2.75" width="12.5" height="8.5" rx="1" />
      <path d="M5.5 13.75h5M8 11.25v2.5" />
    </>
  ),
  server: (
    <>
      <rect x="2.25" y="2.5" width="11.5" height="4.5" rx="1" />
      <rect x="2.25" y="9" width="11.5" height="4.5" rx="1" />
      <path d="M4.75 4.75h.5M4.75 11.25h.5" />
    </>
  ),
  sigma: <path d="M12 3H4.25l4.25 5-4.25 5H12" />,
  doc: (
    <>
      <path d="M4 1.75h5.25L12 4.5v9.75H4z" />
      <path d="M9.25 1.75V4.5H12M6 8h4M6 10.75h4" />
    </>
  ),
  stop: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="m3.9 3.9 8.2 8.2" />
    </>
  ),
  copy: (
    <>
      <rect x="5.25" y="5.25" width="8" height="8" rx="1" />
      <path d="M10.75 5.25V3.75a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h1.5" />
    </>
  ),
  userCheck: (
    <>
      <circle cx="6.5" cy="5.25" r="2.5" />
      <path d="M1.75 13.5c.5-2.4 2.4-3.75 4.75-3.75 1.15 0 2.2.3 3.05.9" />
      <path d="m10 12 1.6 1.6 3-3.35" />
    </>
  ),
  logout: (
    <>
      <path d="M9.5 2.75h2.75a1 1 0 0 1 1 1v8.5a1 1 0 0 1-1 1H9.5" />
      <path d="M6.5 5 3.5 8l3 3M3.5 8h6.5" />
    </>
  ),
  info: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 7.33v3.67" />
      <path d="M8 5h.01" />
    </>
  ),
  reload: (
    <>
      <path d="M13.33 8a5.33 5.33 0 1 1-1.56-3.77" />
      <path d="M13.33 2.67v3.33h-3.33" />
    </>
  ),
  alert: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.67v3.66" />
      <path d="M8 11h.01" />
    </>
  ),
  eye: (
    <>
      <path d="M1.5 8s2.4-4.75 6.5-4.75S14.5 8 14.5 8 12.1 12.75 8 12.75 1.5 8 1.5 8z" />
      <circle cx="8" cy="8" r="2" />
    </>
  ),
}

export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {SHAPES[name]}
    </svg>
  )
}
