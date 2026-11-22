import type { MouseEvent } from 'react'
import { ds } from '@/components/ui/classes'
import type { SourceId } from '@/types/location'
import { sourceHref, sourceText } from './text'

// 출처 줄(시안 .src): 숫자 아래 작은 글씨 `{기관} {자료} · 기준 {날짜}` — 누르면 '근거와 출처'의 그 출처 줄로 간다(AC-7906.2).
// SOURCES에 없는 출처 id면 그리지 않는다. 여는 콜백(onOpen)을 주면 그냥 누를 때 주소 이동 대신 그 콜백을 부른다(새 탭 누르기는 그대로).
// 평범한 <a href>다(next/link 아님): 입지 분석 화면은 주소의 tab을 처음 열 때만 읽어, Next가 화면을 그대로 둔 채 주소만 바꾸면
// 탭이 바뀌지 않는다. 콜백이 없으면 주소 이동으로 화면을 새로 열어 '근거와 출처' 탭이 열린다(셸 ShellLink·틀 TabLink와 같음)
const LINE =
  'mt-0.5 block rounded-control text-caption text-muted no-underline underline-offset-2 transition hover:text-ink-2 hover:underline'

export type SourceLineProps = {
  src: SourceId
  /** 기준 날짜 'YYYY-MM-DD'(또는 'YYYY-MM'). 없으면 `{기관} {자료}`만 */
  asOf?: string | null
  /** 한 칸에 출처가 둘 이상일 때 끝에 붙이는 글(` · {덧붙임}`) */
  extra?: string
  onOpen?: (id: SourceId) => void
}

const plainClick = (e: MouseEvent) => e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey

export function SourceLine({ src, asOf, extra, onOpen }: SourceLineProps) {
  const text = sourceText(src, asOf, extra)
  if (text === null) return null
  const onClick = onOpen
    ? (e: MouseEvent<HTMLAnchorElement>) => {
        if (!plainClick(e)) return
        e.preventDefault()
        onOpen(src)
      }
    : undefined
  return (
    <a href={sourceHref(src)} className={`${LINE} ${ds.focusRing}`} onClick={onClick}>
      {text}
    </a>
  )
}
