import { addDays, monthOf, todayInKorea, weekdayOf, weekRange } from '@/lib/analytics/dates'
import type { Attachment, GroupPost, NoticeKind, NoticeSource, NoticeView, ReadMode, SourceRow } from '@/types/notices'

// 고시·공지 화면 글자(specs/notices TASK-12). 글자는 시안 notes.md '화면 글자'와 requirements 기본값 그대로다.
// 순수 함수만(화면이 부른다). 날짜 계산은 dates.ts, 시각은 Asia/Seoul로 읽어 PC 시간대와 상관없다.
// 시각 인자는 DB가 주는 ISO 글자(또는 Date)이고, 날짜 인자는 한국 날짜 'YYYY-MM-DD'다

// ── 출처 ────────────────────────────────────────────────

// 고르기 줄 출처 칩 차례
export const SOURCES: readonly NoticeSource[] = ['hira_notice', 'hira_crtr', 'mohw_rss']

export const SOURCE_NAMES: Readonly<Record<NoticeSource, string>> = {
  hira_notice: '심평원 공지',
  hira_crtr: '심평원 심사기준',
  mohw_rss: '보건복지부',
}

// 사람이 누르는 게시판 첫 쪽(design 5절). 서버가 읽는 주소가 아니다
export const BOARD_URLS: Readonly<Record<NoticeSource, string>> = {
  hira_notice: 'https://www.hira.or.kr/bbsDummy.do?pgmid=HIRAA020002000100',
  hira_crtr: 'https://www.hira.or.kr/rc/insu/insuadtcrtr/InsuAdtCrtrList.do?pgmid=HIRAA030069000410',
  mohw_rss: 'https://www.mohw.go.kr/board.es?mid=a10409020000&bid=0026',
}

// 묶음 제목을 정하는 차례(mergeGroup·notice_list의 출처 글 차례와 같다)
const TITLE_ORDER: readonly NoticeSource[] = ['mohw_rss', 'hira_notice', 'hira_crtr']

export function sourceName(source: NoticeSource): string {
  return SOURCE_NAMES[source]
}

// 줄의 출처: '보건복지부 · 심평원 심사기준'(겹침 없이 제목 차례)
export function sourcesText(posts: readonly Pick<GroupPost, 'source'>[]): string {
  const have = new Set(posts.map((p) => p.source))
  return TITLE_ORDER.filter((s) => have.has(s)).map(sourceName).join(' · ')
}

export function boardLinkText(source: NoticeSource): string {
  return `${sourceName(source)} 게시판 열기`
}

// ── 종류 · 글 번호 자리 (기본값 7) ────────────────────────

export const CRTR_KIND_NAMES: Readonly<Partial<Record<NoticeKind, string>>> = {
  interp: '행정해석',
  guide: '심사지침',
  case: '공개 심사사례',
}

// '2026-218' → '보건복지부 고시 제2026-218호'
export function noticeNoText(noticeNo: string): string {
  return `보건복지부 고시 제${noticeNo}호`
}

// 고시 번호가 있으면 번호, 없으면 심사기준 종류, 그 밖은 빈 글자
export function numberSlot(n: Pick<NoticeView, 'noticeNo' | 'kind'>): string {
  if (n.noticeNo) return noticeNoText(n.noticeNo)
  return CRTR_KIND_NAMES[n.kind] ?? ''
}

// ── 날짜 · 시각 ──────────────────────────────────────────

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] // weekdayOf: 1=월 … 7=일

// h23: 자정을 '24:00'이 아니라 '00:00'으로
const KOREA_TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function instant(at: string | Date): Date {
  const d = at instanceof Date ? new Date(at.getTime()) : new Date(at)
  if (Number.isNaN(d.getTime())) throw new RangeError(`시각은 ISO 글자로 주세요: ${String(at)}`)
  return d
}

// '2026-11-20' → '11월 20일'
export function dayText(ymd: string): string {
  monthOf(ymd)
  return `${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8, 10))}일`
}

// '2026-11-20' → '11월 20일 (금)'
export function dateText(ymd: string): string {
  return `${dayText(ymd)} (${WEEKDAYS[weekdayOf(ymd) - 1]})`
}

// 달 머리 줄: '2026-11-20' → '11월'
export function monthText(ymd: string): string {
  return `${Number(monthOf(ymd).slice(5, 7))}월`
}

// 그 시각의 한국 날짜
export function ymdOf(at: string | Date): string {
  return todayInKorea(instant(at))
}

// '07:02'
export function timeText(at: string | Date): string {
  const parts = Object.fromEntries(KOREA_TIME.formatToParts(instant(at)).map((p) => [p.type, p.value]))
  return `${parts.hour}:${parts.minute}`
}

// `{날짜 시각}`: '11월 19일 (목) 07:03'(오늘이어도 날짜로)
export function dateTimeText(at: string | Date): string {
  return `${dateText(ymdOf(at))} ${timeText(at)}`
}

// 기본값 1: 오늘 · 어제 · '11월 18일 (수)'
export function dayWord(ymd: string, today: string): string {
  if (ymd === today) return '오늘'
  if (ymd === addDays(today, -1)) return '어제'
  return dateText(ymd)
}

// '오늘 07:02' · '어제 07:02' · '11월 18일 (수) 07:02'
export function whenText(at: string | Date, now: Date): string {
  return `${dayWord(ymdOf(at), todayInKorea(now))} ${timeText(at)}`
}

// 주간 모음 기간: '11월 9일 (월) ~ 11월 15일 (일)'
export function weekPeriodText(weekStart: string): string {
  const { from, to } = weekRange(weekStart)
  return `${dateText(from)} ~ ${dateText(to)}`
}

// ── 확인 줄 · 못 가져옴 띠 (AC-7419.6, 기본값 1·2) ─────────

type SourceState = Pick<SourceRow, 'source' | 'state' | 'checkedAt' | 'lastOkAt' | 'stoppedSince'>

// '{출처}: 어제부터 못 가져왔어요'. 날짜 말은 처음 멈춘 날(없으면 마지막 확인, 그것도 없으면 오늘)
export function stoppedTitle(row: SourceState, now: Date): string {
  const since = row.stoppedSince ?? row.checkedAt ?? now
  return `${sourceName(row.source)}: ${dayWord(ymdOf(since), todayInKorea(now))}부터 못 가져왔어요`
}

// 확인 줄의 출처 하나: '{출처} 오늘 {시각} 확인' 또는 멈춘 글. 확인한 적이 없으면 null
export function checkedText(row: SourceState, now: Date): string | null {
  if (row.state === 'stopped') return stoppedTitle(row, now)
  if (!row.checkedAt) return null
  return `${sourceName(row.source)} ${whenText(row.checkedAt, now)} 확인`
}

// 띠 글. 가져온 적이 없으면 '마지막으로 …' 문장을, 다른 곳이 모두 오늘 성공하지 않았으면 '다른 곳 …' 문장을 뺀다
export function stoppedBody(row: SourceState, rows: readonly SourceState[], now: Date): string {
  const name = sourceName(row.source)
  const today = todayInKorea(now)
  const others = rows.filter((r) => r.source !== row.source)
  const othersOk = others.length > 0 && others.every((r) => r.state === 'ok' && r.lastOkAt !== null && ymdOf(r.lastOkAt) === today)
  return [
    `${name} 게시판 모양이 바뀌었거나 잠시 막힌 것 같아요.`,
    row.lastOkAt ? `마지막으로 ${dateTimeText(row.lastOkAt)}에 가져왔어요.` : null,
    othersOk ? '다른 곳 글은 오늘 아침에도 잘 가져왔어요.' : null,
    `고쳐질 때까지 ${name} 새 글은 직접 확인해 주세요.`,
  ]
    .filter((s): s is string => s !== null)
    .join(' ')
}

// ── 요약 칩 · 본문만 이유 · 붙임 없음 · 링크 (AC-7420.3, 기본값 4·5) ──

// 출처 글들의 붙임을 차례대로, 같은 주소는 한 번만
export function attachmentsOf(posts: readonly Pick<GroupPost, 'attachments'>[]): Attachment[] {
  const seen = new Set<string>()
  const out: Attachment[] = []
  for (const p of posts) {
    for (const a of p.attachments) {
      if (seen.has(a.url)) continue
      seen.add(a.url)
      out.push(a)
    }
  }
  return out
}

const hasMohw = (posts: readonly Pick<GroupPost, 'source'>[]) => posts.some((p) => p.source === 'mohw_rss')

export function readModeText(mode: ReadMode | null): string | null {
  if (mode === 'full' || mode === 'text') return '붙임 파일까지 읽고 요약'
  if (mode === 'body') return '본문만 보고 요약'
  return null
}

// 본문만 보고 요약한 이유 줄. 붙임 없는 심평원 글만의 묶음·본문만이 아닌 요약은 null
export function bodyOnlyReason(n: { readMode: ReadMode | null; posts: readonly GroupPost[] }): string | null {
  if (n.readMode !== 'body') return null
  if (attachmentsOf(n.posts).length > 0) return '붙임 파일을 읽지 못해 본문만 보고 요약했어요. 붙임 파일은 원문에서 확인해 주세요.'
  if (hasMohw(n.posts)) return '보건복지부는 붙임 파일 가져가기를 막아 두어 본문만 보고 요약했어요. 붙임 파일은 원문에서 확인해 주세요.'
  return null
}

// 붙임이 없고 보건복지부 글이 든 묶음만. 그 밖은 null(붙임 칸 없음)
export function noFilesText(posts: readonly GroupPost[]): string | null {
  return attachmentsOf(posts).length === 0 && hasMohw(posts) ? '붙임 파일은 원문에서 받아 주세요.' : null
}

// 두 사이트 주소(DB 제약과 같은 앞머리)만 링크로 쓴다. 아니면 null
const LINK_PREFIX = /^https:\/\/www\.(?:hira\.or\.kr|mohw\.go\.kr)\//
const LINK_HOSTS = new Set(['www.hira.or.kr', 'www.mohw.go.kr'])

export function safeLink(url: string): string | null {
  if (!LINK_PREFIX.test(url)) return null
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const ok =
    parsed.protocol === 'https:' && LINK_HOSTS.has(parsed.hostname) && parsed.port === '' && parsed.username === '' && parsed.password === ''
  return ok ? parsed.href : null
}

// ── 탭 숫자 (AC-7423.3, 기본값 10) ─────────────────────────

// 0이면 null(그리지 않음), 100 이상은 '99+'
export function badgeText(n: number): string | null {
  if (!(n > 0)) return null
  return n >= 100 ? '99+' : String(n)
}

// 화면 읽기 글은 실제 수
export function badgeLabel(n: number): string {
  return `안 읽은 관련 글 ${n}건`
}
