import { LibraryLinkCard } from '@/components/settings/InstallFilesCard'

// 관리자 화면(가입 승인)의 '설치 파일' 작은 칸 (specs/library REQ-8109 AC-8109.2, design.md '설정·관리자 칸과 받기 단추', 승인 시안 docs/mockups/library ?s=admin-tab).
// 옛 '설치 파일' 올리기 표 자리(제목 묶음 아래·신청 탭 위, admin/page.tsx의 top 자리)에 설정 칸과 같은 모양의 칸 — h2 · 관리자 글 · [자료실 열기 →](/library)만 둔다.
// 도우미·확장 zip과 설명서 같은 다른 파일은 이제 자료실에서 관리자가 올리고 지운다. 이 칸은 아무것도 읽지 않는다(서버 그리기에서도 h2가 보인다)

export function InstallFilesAdmin() {
  return <LibraryLinkCard text="설치 파일은 이제 자료실에서 올리고 지워요. 자료실에는 설명서 같은 다른 파일도 올릴 수 있어요." />
}
