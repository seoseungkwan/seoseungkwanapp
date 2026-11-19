import type { SupabaseClient } from '@supabase/supabase-js'
import { checkNotice } from '@/lib/forms/notice'
import { DEFAULT_STYLE, type FormStyle } from '@/lib/forms/style'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { ClosureNotice, SavedNotice } from '@/types/forms'

// 서식 탭 휴진 안내문 읽기·저장 (specs/forms design.md 8절, REQ-3507). 브라우저 Supabase 클라이언트 + RLS로만 한다(ADR-004).
// 보내는 몸통은 year·month·cards(카드마다 start·end·name·status)·theme·accent 다섯과 글씨·로고 여섯 칸뿐이고, 열쇠를 골라 새 객체로 만든다(AC-3507.7).
// 글자 색 accent는 자동이어도 null로 늘 보낸다(칸이 빠지지 않는다, specs/forms-accent AC-4703.1).
// 글씨·로고 여섯 칸(title_scale·body_scale·logo_scale·title_color·body_color·logo_color)도 늘 보낸다: 크기 100·색 없음은 null
// (specs/form-style AC-6806.2). 읽을 때 null 크기는 100, null 색은 없음이다.
// hospital_id·kind·updated_at은 DB가 정하고, 어느 병원 줄인지는 RLS가 고른다.
// 읽은 줄은 저장할 때와 같은 checkNotice를 넘어야 하고, 못 넘는 줄은 뺀다(고쳐 쓰지 않는다, AC-3507.6).
// 실패는 'failed'(지우기는 false) 하나뿐이다. Supabase 오류 글은 버리고 밖으로 내지 않는다

const TABLE = 'form_notices'
const COLUMNS = 'id, year, month, cards, theme, accent, title_scale, body_scale, logo_scale, title_color, body_color, logo_color, updated_at'
const LIST_LIMIT = 100

type Reply = { data: unknown; error: unknown }

const isFilled = (value: unknown): value is string => typeof value === 'string' && value !== ''

type StyleColumns = {
  title_scale: number | null
  body_scale: number | null
  logo_scale: number | null
  title_color: string | null
  body_color: string | null
  logo_color: string | null
}

// 크기 칸: null이면 처음 크기 100. 칸이 없는 줄(undefined)은 그대로 넘겨 checkStyle이 버리게 한다
const scaleOf = (value: unknown, fallback: number): unknown => (value === null ? fallback : value)

/** 표 줄 → SavedNotice. 칸 모양이 하나라도 어긋나면 null(고쳐 쓰지 않는다).
 * 글자 색 null은 자동(결과에 accent 열쇠 없음). 틀린 모양이거나 accent 칸이 없는 줄(undefined)도 버린다(AC-4703.3).
 * 글씨·로고 여섯 칸은 style로 모아 같은 검사를 넘긴다: null 크기 100·null 색 없음, 처음대로면 결과에 style 열쇠가 없다.
 * 범위 밖·5의 배수 아님·색 모양 틀림·칸 없음(undefined)이면 그 줄을 버린다(AC-6806.2) */
function savedOf(row: unknown): SavedNotice | null {
  if (typeof row !== 'object' || row === null) return null
  const r = row as Record<string, unknown>
  const { id, year, month, cards, theme, accent, updated_at: updatedAt } = r
  if (!isFilled(id) || !isFilled(updatedAt)) return null
  const style = {
    titleScale: scaleOf(r.title_scale, DEFAULT_STYLE.titleScale),
    bodyScale: scaleOf(r.body_scale, DEFAULT_STYLE.bodyScale),
    logoScale: scaleOf(r.logo_scale, DEFAULT_STYLE.logoScale),
    titleColor: r.title_color,
    bodyColor: r.body_color,
    logoColor: r.logo_color,
  }
  const notice = checkNotice({ year, month, cards, theme, accent, style })
  return notice === null ? null : { id, updatedAt, ...notice }
}

// 크기 100 → null(처음대로는 칸을 비워 둔다)
const scaleColumn = (value: number, fallback: number): number | null => (value === fallback ? null : value)

function styleColumns(style: FormStyle): StyleColumns {
  return {
    title_scale: scaleColumn(style.titleScale, DEFAULT_STYLE.titleScale),
    body_scale: scaleColumn(style.bodyScale, DEFAULT_STYLE.bodyScale),
    logo_scale: scaleColumn(style.logoScale, DEFAULT_STYLE.logoScale),
    title_color: style.titleColor,
    body_color: style.bodyColor,
    logo_color: style.logoColor,
  }
}

type NoticeBody = Omit<ClosureNotice, 'accent' | 'style'> & { accent: string | null } & StyleColumns

/** 받은 값을 펼치지 않고 정해 둔 열쇠만 골라 검사한다. 검사를 못 넘으면 보내지 않는다(읽을 때 빠질 줄을 넣지 않으려고).
 * 보내는 객체는 검사를 넘은 값에서 다섯 열쇠와 글씨·로고 여섯 칸을 골라 새로 만든다 —
 * 자동 글자 색도 accent: null로, 처음대로 글씨·로고 값도 여섯 칸 null로 실어 DB 값을 지운다 */
function bodyOf(n: ClosureNotice): NoticeBody | null {
  const picked: Record<string, unknown> = {
    year: n.year,
    month: n.month,
    cards: n.cards.map((card) => ({ start: card.start, end: card.end, name: card.name, status: card.status })),
    theme: n.theme ?? null, // 저절로 = null. 빈 글은 DB가 거부한다
    accent: n.accent ?? null, // 자동 = null
  }
  // style 열쇠가 있을 때만 싣는다: 모양 검사는 checkNotice가 한다(틀리면 null → 보내지 않는다)
  if (n.style !== undefined) picked.style = n.style
  const checked = checkNotice(picked)
  if (checked === null) return null
  return {
    year: checked.year,
    month: checked.month,
    cards: checked.cards,
    theme: checked.theme,
    accent: checked.accent ?? null,
    ...styleColumns(checked.style ?? DEFAULT_STYLE),
  }
}

export async function listNotices(): Promise<SavedNotice[] | 'failed'> {
  try {
    const { data, error }: Reply = await supabaseBrowser()
      .from(TABLE)
      .select(COLUMNS)
      .order('updated_at', { ascending: false })
      .limit(LIST_LIMIT)
    // 읽기 실패를 빈 목록으로 보이지 않는다
    if (error || !Array.isArray(data)) return 'failed'
    return data.flatMap((row: unknown) => savedOf(row) ?? [])
  } catch {
    return 'failed'
  }
}

/** 넣기·고치기 공통: 몸통 만들기·클라이언트 만들기·보내기·답 검사 어디서 어긋나도 'failed'. 원래 오류는 버린다 */
async function saveOne(
  n: ClosureNotice,
  send: (client: SupabaseClient, body: NoticeBody) => PromiseLike<Reply>,
): Promise<SavedNotice | 'failed'> {
  try {
    const body = bodyOf(n)
    if (body === null) return 'failed'
    const { data, error } = await send(supabaseBrowser(), body)
    if (error) return 'failed'
    return savedOf(data) ?? 'failed'
  } catch {
    return 'failed'
  }
}

export function insertNotice(n: ClosureNotice): Promise<SavedNotice | 'failed'> {
  return saveOne(n, (client, body) => client.from(TABLE).insert(body).select(COLUMNS).single())
}

/** 연 안내문을 고친다. 그 id 줄 하나만 바뀌고 새 줄은 생기지 않는다(AC-3507.1). 줄이 없으면 single이 오류를 준다 → 'failed' */
export function updateNotice(id: string, n: ClosureNotice): Promise<SavedNotice | 'failed'> {
  return saveOne(n, (client, body) => client.from(TABLE).update(body).eq('id', id).select(COLUMNS).single())
}

/** 없는 줄을 지워도 오류가 없으면 true다 */
export async function deleteNotice(id: string): Promise<boolean> {
  try {
    const { error } = await supabaseBrowser().from(TABLE).delete().eq('id', id)
    return !error
  } catch {
    return false
  }
}
