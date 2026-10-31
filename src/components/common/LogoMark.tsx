// 로고 마크 (REQ-103, ADR-018, 비교 시안 docs/mockups/landing-v2/logo-options.html C③). 병원 십자:
// 둥근 네모 테두리(청록 #14C8BA, 선 2.4) 안에 꽉 찬 둥근 십자(보라 #6D5DF5). 색은 고정이다(currentColor 아님) —
// 강조색 하나 규칙의 유일한 예외라 색 값은 이 파일에만 둔다. 빨강 계열은 쓰지 않는다(적십자 표장).
// 쓰는 곳: 랜딩 메뉴(24)·바닥글(18)·미리보기(18)·앱 틀(24)·인증 틀(28), 로그인 좁은 화면은 같은 28을 클래스로 24로 줄인다(b2b-redesign). 옮기는 동안 남는 옛 크기: 랜딩 메뉴(22)·옛 히어로 미리보기(20)·앱 틀과 인증 틀(26)
// 모두 이 하나를 쓴다. 꾸밈이라 읽지 않는다
export function LogoMark({ size, className }: { size: number; className?: string }) {
  return (
    <svg className={className} aria-hidden="true" width={size} height={size} viewBox="0 0 30 30">
      <rect x="3" y="3" width="24" height="24" rx="6" fill="none" stroke="#14C8BA" strokeWidth="2.4" />
      <path
        d="M13.5 8h3a1 1 0 0 1 1 1v3.5H21a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3.5V21a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-3.5H9a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h3.5V9a1 1 0 0 1 1-1z"
        fill="#6D5DF5"
      />
    </svg>
  )
}
