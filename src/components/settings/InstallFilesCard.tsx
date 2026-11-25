import Link from 'next/link'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'

// 설정 탭의 '설치 파일' 작은 칸 (specs/library REQ-8109 AC-8109.1, design.md '설정·관리자 칸과 받기 단추', 승인 시안 docs/mockups/library ?s=settings의 .mini-card).
// 옛 '비트 PC 연결 · 설치 파일' 받기 표 자리(병원 정보 칸 다음)에 h2 · 글 한 줄 · [자료실 열기 →](/library)만 둔다.
// 설치 파일과 설명서는 자료실(/library)에서 받는다. 이 칸은 목록을 읽지 않는다. 보는 중(admin-view)에도 같은 칸이다(자료실 받기는 읽기).
// 같은 모양의 관리자 화면 칸은 LibraryLinkCard를 함께 쓴다(components/admin/InstallFilesAdmin)

/** 자료실로 가는 작은 칸: 제목·글(왼쪽) · [자료실 열기 →](오른쪽). 패널 안쪽 20px, 사이 16px */
export function LibraryLinkCard({ text }: { text: string }) {
  return (
    <section aria-label="설치 파일" className={`${ds.panel} flex items-center justify-between gap-4 p-5`}>
      <div className="min-w-0">
        <h2 className={ds.panelTitle}>설치 파일</h2>
        <p className="mt-0.5 text-body text-ink-2">{text}</p>
      </div>
      <Link href="/library" className={ds.button.secondary}>
        자료실 열기
        <Icon name="arrow" />
      </Link>
    </section>
  )
}

export function InstallFilesCard() {
  return <LibraryLinkCard text="설치 파일은 자료실에서 받아요. 청구 도우미·크롬 확장과 설명서가 모두 거기 있어요." />
}
