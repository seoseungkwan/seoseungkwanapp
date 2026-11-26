// Postgres jsonb 글 모양(payload::text). 표 제약 octet_length(payload::text)와 같은 크기를 브라우저에서 재려고 쓴다.
// 콜론·콤마 뒤에 빈칸이 하나 있어 JSON.stringify로 재면 약 10% 적게 나온다. 열쇠는 jsonb처럼 짧은 것(UTF-8 바이트)부터, 길이가 같으면 바이트 차례다.
// 값이 undefined인 열쇠는 보낼 때 JSON에서 빠지므로 빼고, 배열 안 undefined는 null이다.
// 환자 자료 구역(lib/payload)에 둔다 — lib/storage/stats.ts와 lib/payload/uisarang.ts가 같은 셈 하나를 쓴다(specs/uisarang-upload design.md §6)

const UTF8 = new TextEncoder()

function compareKeys(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) return a.length - b.length
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}

function objectText(value: object): string {
  const keyed = Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .map(([key, item]) => ({ key, item, bytes: UTF8.encode(key) }))
    .sort((a, b) => compareKeys(a.bytes, b.bytes))
  return `{${keyed.map(({ key, item }) => `${JSON.stringify(key)}: ${jsonbText(item)}`).join(', ')}}`
}

export function jsonbText(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item: unknown) => (item === undefined ? 'null' : jsonbText(item))).join(', ')}]`
  if (typeof value === 'object' && value !== null) return objectText(value)
  return JSON.stringify(value) ?? 'null'
}

/** jsonbText의 UTF-8 바이트 수(DB octet_length(payload::text)) */
export const jsonbBytes = (value: unknown): number => UTF8.encode(jsonbText(value)).length
