// 시트 보기 그림 넷 — 승인 시안 docs/mockups/google-link/sunap.html의 EXT(새 창)·FILEICON(시트)·WARNICON(경고)·.spin(넣는 중) 모양 그대로.
// 늘 꾸밈이다(aria-hidden). 색은 토큰 클래스(글자색·fill/stroke 토큰)로 준다.
// 넣는 중 그림(FillingIcon)은 시안의 도는 그림(.spin)과 같은 원·호지만 돌지 않는다 — 앱에서 도는 표시는 대시보드 ReadStatus의
// .bit-read-spin 하나뿐이다(UI_GUIDE '움직임', classes.test.ts AC-601.17). 넣는 중은 글 '넣는 중…'과 [지금 넣기] aria-busy가 알린다

/** [새 창으로 열기 ↗]·[11월 파일 열기 ↗]의 ↗ */
export function ExtIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0">
      <path d="M9 3h4v4M13 3 7.5 8.5M12 9.5V13H3V4h3.5" />
    </svg>
  )
}

/** 띠 왼쪽 시트 그림(초록) */
export function SheetIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
      <rect x="2.5" y="1.5" width="13" height="15" rx="2" strokeWidth="1.2" className="fill-positive-soft stroke-positive" />
      <path d="M5 6.5h8M5 9.5h8M5 12.5h8M9 6.5v6" strokeWidth="1.1" className="stroke-positive" />
    </svg>
  )
}

/** 주황 알림·err-frame 판 머리의 경고 그림 */
export function WarnIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 text-warning">
      <path d="M9 2.5 16 15H2z" />
      <path d="M9 7v4M9 12.8v.4" />
    </svg>
  )
}

/** 띠 '넣는 중…' 앞 그림(시안 .spin 14px 원 + 호, 움직이지 않음) */
export function FillingIcon() {
  return (
    <svg aria-hidden="true" data-icon="filling" width="14" height="14" viewBox="0 0 14 14" fill="none" strokeWidth="2" className="shrink-0">
      <circle cx="7" cy="7" r="6" className="stroke-accent-soft" />
      <path d="M7 1a6 6 0 0 1 6 6" strokeLinecap="round" className="stroke-accent" />
    </svg>
  )
}
