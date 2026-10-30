// 로고 마크 (REQ-103, ADR-018, 시안 docs/mockups/landing-v2 .logo svg). 막대 세 개를 currentColor 한 색으로 그린다
// → 색은 부모 글자색(ink)을 따른다. 랜딩 메뉴(22)·앱 틀(26)·인증 틀(26)이 모두 이것을 쓴다. 꾸밈이라 읽지 않는다
export function LogoMark({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      className={className}
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 30 30"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
    >
      <rect x="9" y="3" width="12" height="6" rx="3" />
      <rect x="11" y="12" width="12" height="6" rx="3" />
      <rect x="8" y="21" width="12" height="6" rx="3" />
    </svg>
  )
}
