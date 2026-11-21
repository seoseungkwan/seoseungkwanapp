import { useId } from 'react'
import { ds } from '@/components/ui/classes'
import { sourceName } from '@/lib/notices/view'
import type { GroupPost } from '@/types/notices'
import { helpText, safeDateText, sectionTitle } from './parts'

// 올라온 곳 (specs/notices AC-7420.5, 승인 시안 .origin). 출처 글마다 이름·날짜, 출처가 둘 이상이면 묶은 까닭 한 줄

export function OriginBox({ posts }: { posts: GroupPost[] }) {
  const headId = useId()
  const grouped = new Set(posts.map((post) => post.source)).size > 1
  return (
    <section aria-labelledby={headId} className={`${ds.panel} grid gap-3 px-5 py-4`}>
      <h2 id={headId} className={sectionTitle}>
        올라온 곳
      </h2>
      <ul>
        {posts.map((post, i) => (
          <li key={`${post.source}-${i}`} className="flex justify-between gap-2 border-b border-line py-1.5 text-small last:border-b-0">
            <b className="font-semibold text-ink">{sourceName(post.source)}</b>
            <span className="whitespace-nowrap text-muted">{safeDateText(post.postedOn)}</span>
          </li>
        ))}
      </ul>
      {grouped && <p className={helpText}>같은 고시 번호라 한 글로 묶었어요.</p>}
    </section>
  )
}
