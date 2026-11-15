import { checkBackgroundRow, isJpegBase64, wordsOf, wordsProblem } from '@/lib/forms/background'
import { supabaseBrowser } from '@/lib/supabase/browser'
import { BG_IMAGE_MAX_BYTES, BG_THUMB_MAX, MAX_BACKGROUNDS, type SavedBackground } from '@/types/formBackground'

// 서식 탭 휴진 안내 '내 배경' 읽기·저장·지우기 (specs/forms-themes design.md 8-3절, REQ-4609).
// 브라우저 Supabase 클라이언트 + RLS로만 한다(ADR-004): 표 form_backgrounds(작은 그림·적은 말·강조색)와 그림 저장소 form-backgrounds(큰 그림).
// 넣는 몸통은 words·accent·thumb 셋뿐이다. hospital_id·id·path·created_at은 DB가 정하고, 큰 그림은 DB가 돌려준 path로만 올린다
// (저장소 올리기 정책이 내 병원 줄의 path만 받는다 — 그래서 '줄 넣기 → 그 path로 올리기' 차례다).
// 읽은 줄은 checkBackgroundRow를 넘어야 하고, 못 넘는 줄은 뺀다(고쳐 쓰지 않는다).
// 실패는 'failed'(내려받기는 null, 지우기는 false) 하나뿐이다. Supabase 오류 글은 버리고 밖으로 내지 않는다

const TABLE = 'form_backgrounds'
const BUCKET = 'form-backgrounds'
const COLUMNS = 'id, words, accent, thumb, path, created_at'
const ACCENT = /^#[0-9a-f]{6}$/
const JPEG_TYPE = 'image/jpeg'

type Reply = { data: unknown; error: unknown }
type NewBackground = { words: string; accent: string; thumb: string; image: Uint8Array }
type Body = { words: string; accent: string; thumb: string }

/** JPEG 머리(FF D8 FF)로 시작하는 바이트면 참 */
const isJpegBytes = (bytes: unknown): bytes is Uint8Array =>
  bytes instanceof Uint8Array && bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff

/** 받은 값을 펼치지 않고 세 칸만 골라 새로 만든다. 적은 말은 앞뒤 공백을 뗀다. 검사를 못 넘으면 null(보내지 않는다) */
function bodyOf(b: NewBackground): Body | null {
  const words = wordsOf(b.words)
  if (words === null || wordsProblem(words)) return null
  if (typeof b.accent !== 'string' || !ACCENT.test(b.accent)) return null
  if (typeof b.thumb !== 'string' || b.thumb.length > BG_THUMB_MAX || !isJpegBase64(b.thumb)) return null
  return { words, accent: b.accent, thumb: b.thumb }
}

export async function listBackgrounds(): Promise<SavedBackground[] | 'failed'> {
  try {
    const { data, error }: Reply = await supabaseBrowser()
      .from(TABLE)
      .select(COLUMNS)
      .order('created_at', { ascending: false })
      .limit(MAX_BACKGROUNDS)
    // 읽기 실패를 빈 목록으로 보이지 않는다
    if (error || !Array.isArray(data)) return 'failed'
    return data.flatMap((row: unknown) => checkBackgroundRow(row) ?? [])
  } catch {
    return 'failed'
  }
}

/** 줄을 넣고 받은 path로 그림을 올린다. 올리기가 실패하면 넣은 줄을 지운다(목록에 그림 없는 줄을 남기지 않으려고) */
export async function saveBackground(b: NewBackground): Promise<SavedBackground | 'failed'> {
  try {
    const body = bodyOf(b)
    if (body === null || !isJpegBytes(b.image) || b.image.length > BG_IMAGE_MAX_BYTES) return 'failed'
    const file = new Blob([b.image.slice()], { type: JPEG_TYPE }) // 복사해 둔다(보내는 동안 바뀌지 않게)
    const client = supabaseBrowser()
    const { data, error }: Reply = await client.from(TABLE).insert(body).select(COLUMNS).single()
    if (error) return 'failed'
    const saved = checkBackgroundRow(data)
    if (saved === null) return 'failed'
    let uploaded = false
    try {
      const { error: uploadError } = await client.storage.from(BUCKET).upload(saved.path, file, { contentType: JPEG_TYPE, upsert: false })
      uploaded = !uploadError
    } catch {
      uploaded = false
    }
    if (uploaded) return saved
    await client.from(TABLE).delete().eq('id', saved.id)
    return 'failed'
  } catch {
    return 'failed'
  }
}

/** 그 path의 큰 그림을 내려받는다. JPEG가 아니거나 오류면 null */
export async function readBackgroundImage(b: SavedBackground): Promise<Uint8Array | null> {
  try {
    const { data, error }: Reply = await supabaseBrowser().storage.from(BUCKET).download(b.path)
    if (error || !(data instanceof Blob)) return null
    const bytes = new Uint8Array(await data.arrayBuffer())
    return isJpegBytes(bytes) ? bytes : null
  } catch {
    return null
  }
}

/** 그림을 먼저 지우고 줄을 지운다. 없는 그림을 지워도 오류가 없으면 줄을 지운다(다시 눌러 마저 지울 수 있다) */
export async function deleteBackground(b: SavedBackground): Promise<boolean> {
  try {
    const client = supabaseBrowser()
    const { error: removeError } = await client.storage.from(BUCKET).remove([b.path])
    if (removeError) return false
    const { error } = await client.from(TABLE).delete().eq('id', b.id)
    return !error
  } catch {
    return false
  }
}
