import type { SupabaseClient } from '@supabase/supabase-js'
import { checkGuideValue, savableGuide } from '@/lib/forms/guide'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { GuideContent, SavedGuide } from '@/types/formGuide'

// 서식 탭 환자 안내문 읽기·저장 (specs/forms-guide design.md 7절, REQ-4507). 브라우저 Supabase 클라이언트 + RLS로만 한다(ADR-004).
// 보내는 몸통은 { content } 하나다. content는 열쇠 13개(줄마다 text·em)를 골라 새로 만든 뒤 checkGuideValue(savableGuide(…))를 넘은 값이다.
// 그림이 custom이 아니면 drawing은 null로 보내고, 대충 적은 글·그릴 것은 보내지 않는다(AC-4507.5).
// hospital_id·created_at·updated_at은 DB가 정하고, 어느 병원 줄인지는 RLS가 고른다.
// 읽은 줄은 저장할 때와 같은 checkGuideValue를 넘어야 하고, 못 넘는 줄은 뺀다(고쳐 쓰지 않는다).
// 실패는 'failed'(지우기는 false) 하나뿐이다. Supabase 오류 글은 버리고 밖으로 내지 않는다

const TABLE = 'form_guides'
const COLUMNS = 'id, content, updated_at'
const LIST_LIMIT = 100

type Reply = { data: unknown; error: unknown }
type Body = { content: GuideContent }

const isFilled = (value: unknown): value is string => typeof value === 'string' && value !== ''

/** 표 줄 → SavedGuide. id·updated_at이 없거나 content가 checkGuideValue를 못 넘으면 null */
function savedOf(row: unknown): SavedGuide | null {
  if (typeof row !== 'object' || row === null) return null
  const { id, content, updated_at: updatedAt } = row as Record<string, unknown>
  if (!isFilled(id) || !isFilled(updatedAt)) return null
  const checked = checkGuideValue(content)
  return checked === null ? null : { id, updatedAt, content: checked }
}

/** 받은 값을 펼치지 않고 정해 둔 열쇠 13개만 골라 만든 뒤 검사한다. 검사를 못 넘으면 보내지 않는다(읽을 때 빠질 줄을 넣지 않으려고) */
function bodyOf(c: GuideContent): Body | null {
  const picked: GuideContent = {
    tag: c.tag,
    subtitle: c.subtitle,
    big1: c.big1,
    big2: c.big2,
    firstSmall: c.firstSmall,
    boxTop: c.boxTop,
    boxBottom: c.boxBottom,
    picture: c.picture,
    drawing: c.drawing,
    bandTitle: c.bandTitle,
    mark: c.mark,
    lines: c.lines.map((line) => ({ text: line.text, em: line.em })),
    note: c.note,
  }
  // savableGuide: custom이 아니면 drawing을 비운다. checkGuideValue: 앞뒤 공백을 뗀 새 객체(그림도 새로 만든다)
  const content = checkGuideValue(savableGuide(picked))
  return content === null ? null : { content }
}

export async function listGuides(): Promise<SavedGuide[] | 'failed'> {
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
async function saveOne(c: GuideContent, send: (client: SupabaseClient, body: Body) => PromiseLike<Reply>): Promise<SavedGuide | 'failed'> {
  try {
    const body = bodyOf(c)
    if (body === null) return 'failed'
    const { data, error } = await send(supabaseBrowser(), body)
    if (error) return 'failed'
    return savedOf(data) ?? 'failed'
  } catch {
    return 'failed'
  }
}

export function insertGuide(c: GuideContent): Promise<SavedGuide | 'failed'> {
  return saveOne(c, (client, body) => client.from(TABLE).insert(body).select(COLUMNS).single())
}

/** 연 안내문을 고친다. 그 id 줄 하나만 바뀌고 새 줄은 생기지 않는다(AC-4507.1). 줄이 없으면 single이 오류를 준다 → 'failed' */
export function updateGuide(id: string, c: GuideContent): Promise<SavedGuide | 'failed'> {
  return saveOne(c, (client, body) => client.from(TABLE).update(body).eq('id', id).select(COLUMNS).single())
}

/** 없는 줄을 지워도 오류가 없으면 true다 */
export async function deleteGuide(id: string): Promise<boolean> {
  try {
    const { error } = await supabaseBrowser().from(TABLE).delete().eq('id', id)
    return !error
  } catch {
    return false
  }
}
