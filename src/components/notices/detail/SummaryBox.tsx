import { useId } from 'react'
import { ds } from '@/components/ui/classes'
import { attachmentsOf, bodyOnlyReason, noFilesText, readModeText, safeLink } from '@/lib/notices/view'
import type { GroupPost, NoticeSource, NoticeView } from '@/types/notices'
import { ExternalIcon, FileIcon, InfoIcon, SparkIcon } from './icons'
import { helpText, sectionTitle } from './parts'

// AI 세 줄 요약 · 원문 · 붙임 (specs/notices AC-7420.3, 기본값 4·5·6, 승인 시안 .sum·.files).
// 요약 글은 글자 노드로만 그린다. 바깥 링크는 safeLink를 지난 두 사이트 주소만, 새 창(noopener noreferrer)으로 연다 — 아니면 링크로 만들지 않는다

// 묶음 제목을 정하는 차례(lib/notices/view TITLE_ORDER·notice_list posts 차례와 같다)
const TITLE_ORDER: readonly NoticeSource[] = ['mohw_rss', 'hira_notice', 'hira_crtr']

const WAIT = '요약을 만드는 중이에요.'
const FAILED = '요약을 만들지 못했어요. 원문에서 확인해 주세요.'

// [원문 보기] = 제목을 준 글. 제목이 같은 출처 글이 없으면 제목 차례로 앞선 출처 글
function titlePost(n: Pick<NoticeView, 'title' | 'posts'>): GroupPost | null {
  const same = n.posts.find((post) => post.title === n.title)
  if (same) return same
  const rank = (post: GroupPost) => TITLE_ORDER.indexOf(post.source)
  return [...n.posts].sort((a, b) => rank(a) - rank(b))[0] ?? null
}

// 붙임 이름은 시안 .files li a처럼 본문 글자(14px)이고 밑줄은 가리킬 때만
const linkClass = `flex min-h-8 items-center gap-2 rounded-control text-body font-medium text-accent no-underline underline-offset-3 hover:underline ${ds.focusRing}`

export function SummaryBox({ notice }: { notice: NoticeView }) {
  const headId = useId()
  const { summary, readMode, posts, state } = notice
  const modeText = summary ? readModeText(readMode) : null
  const reason = summary ? bodyOnlyReason(notice) : null
  const post = titlePost(notice)
  const original = post ? safeLink(post.url) : null
  const files = attachmentsOf(posts)
  const noFiles = noFilesText(posts)
  const pending = state === 'wait' || state === 'batch'

  return (
    <section aria-labelledby={headId} className={`${ds.panel} grid gap-4 p-5`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h2 id={headId} className={sectionTitle}>
          <SparkIcon className="text-accent" />
          AI 세 줄 요약
        </h2>
        {modeText && <span className={readMode === 'body' ? ds.chip.neutral : ds.chip.positive}>{modeText}</span>}
      </div>

      {summary ? (
        <>
          {reason && <p className={helpText}>{reason}</p>}
          <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-4 gap-y-2">
            <dt className="text-small font-semibold text-muted">무엇이 바뀌나</dt>
            <dd className="whitespace-pre-wrap break-words text-body text-ink">{summary.what}</dd>
            <dt className="text-small font-semibold text-muted">언제부터</dt>
            <dd className="whitespace-pre-wrap break-words text-body text-ink">{summary.when}</dd>
            <dt className="text-small font-semibold text-muted">누구 대상</dt>
            <dd className="whitespace-pre-wrap break-words text-body text-ink">{summary.who}</dd>
          </dl>
          <p className="grid grid-cols-[82px_minmax(0,1fr)] gap-x-4 gap-y-1 rounded-control bg-accent-soft p-3">
            <span className="text-small font-semibold text-accent-strong">우리 의원에는</span>
            <span className="whitespace-pre-wrap break-words text-body font-semibold text-ink">{summary.forUs}</span>
          </p>
          <p className="flex items-start gap-1.5 text-caption text-muted">
            <InfoIcon className="mt-px" />
            <span>AI가 만든 요약이라 틀릴 수 있어요. 중요한 내용은 원문에서 꼭 확인해 주세요.</span>
          </p>
        </>
      ) : (
        <p className="text-body text-muted">{pending ? WAIT : FAILED}</p>
      )}

      <div className="grid gap-3 border-t border-line pt-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {original && (
            <a className={`${ds.button.secondarySmall} no-underline`} href={original} target="_blank" rel="noopener noreferrer">
              원문 보기
              <ExternalIcon />
            </a>
          )}
          <span className={helpText}>원래 게시판에서 새 창으로 열려요. 파일은 이 앱에 저장하지 않아요.</span>
        </div>
        {files.length > 0 && (
          <div className="grid gap-1">
            <p className="text-caption font-semibold text-ink-2">붙임 파일</p>
            <ul className="grid list-none gap-0.5">
              {files.map((file) => {
                const href = safeLink(file.url)
                return (
                  <li key={file.url}>
                    {href ? (
                      <a className={linkClass} href={href} target="_blank" rel="noopener noreferrer">
                        <FileIcon className="text-muted" />
                        <span className="break-all">{file.name}</span>
                        <ExternalIcon className="text-muted" />
                      </a>
                    ) : (
                      <span className="flex min-h-8 items-center gap-2 text-body font-medium text-ink-2">
                        <FileIcon className="text-muted" />
                        <span className="break-all">{file.name}</span>
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}
        {files.length === 0 && noFiles && <p className={helpText}>{noFiles}</p>}
      </div>
    </section>
  )
}
