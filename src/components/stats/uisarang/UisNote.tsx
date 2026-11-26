import { EmptyNote, Section } from '@/components/stats/sections/parts'
import { UIS_NA } from './texts'

// 셀 수 없음 안내(specs/uisarang-upload '화면 글자' 셀 수 없음 안내): 지금 통계 탭 EmptyNote 그대로 — 굵게 '의사랑 엑셀로는 셀 수 없어요' · 까닭.
// 칸을 없애지 않고 자리를 둔 채 그 자리에 보인다(UisNoteSection = 칸 제목 + 안내)

export function UisNote({ children }: { children: string }) {
  return <EmptyNote title={UIS_NA}>{children}</EmptyNote>
}

export function UisNoteSection({ title, why, className }: { title: string; why: string; className?: string }) {
  return (
    <Section title={title} className={className}>
      <UisNote>{why}</UisNote>
    </Section>
  )
}
