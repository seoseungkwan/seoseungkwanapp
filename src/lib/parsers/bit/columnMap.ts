import type { Cell } from '@/types/parse'

// 비트 '환자별 소모 통계'에서 읽는 허용 칸 8개만 안다. 나머지 칸 이름은 적지도 않는다(읽지 않는 칸은 처음부터 모른다).
// 순서 = 없는 칸을 알릴 때의 순서
const ALLOWED = [
  { key: 'rxCode', name: '처방코드', aliases: [], required: true },
  { key: 'rxName', name: '처방명칭', aliases: ['처방명'], required: true },
  { key: 'rxType', name: '유형', aliases: [], required: false },
  { key: 'date', name: '처방일자', aliases: [], required: true },
  { key: 'chart', name: '차트번호', aliases: ['등록번호'], required: true },
  { key: 'visit', name: '초재진구분', aliases: ['초재진'], required: true },
  { key: 'inOut', name: '외래/입원', aliases: ['외래입원'], required: false },
  { key: 'address', name: '주소', aliases: [], required: true },
] as const

type AllowedKey = (typeof ALLOWED)[number]['key']
type OptionalKey = Extract<(typeof ALLOWED)[number], { required: false }>['key']

// 칸 자리(0부터). 없어도 되는 칸(유형·외래/입원)이 없으면 null
export type ColumnIndex = { [K in AllowedKey]: K extends OptionalKey ? number | null : number }

export type ColumnMapping = { ok: true; columns: ColumnIndex } | { ok: false; missingColumns: string[] }

// 공백·괄호를 뺀 글자로 비교한다(처방 코드 = 처방코드, 처방일자(조제일) → 처방일자조제일)
export function normalizeColumnName(name: string): string {
  return name.replace(/[\s()[\]]/g, '')
}

// 딱 맞는 이름(별칭 포함)을 먼저, 없으면 그 이름으로 시작하는 칸(처방일자조제일)
export function mapColumns(header: readonly Cell[]): ColumnMapping {
  const names = header.map((cell) => (typeof cell === 'string' ? normalizeColumnName(cell) : ''))
  const find = (candidates: readonly string[]) => {
    const exact = names.findIndex((name) => candidates.includes(name))
    if (exact !== -1) return exact
    return names.findIndex((name) => name !== '' && candidates.some((candidate) => name.startsWith(candidate)))
  }
  const found = new Map<AllowedKey, number | null>()
  const missingColumns: string[] = []
  for (const column of ALLOWED) {
    const at = find([column.name, ...column.aliases])
    if (at === -1 && column.required) missingColumns.push(column.name)
    found.set(column.key, at === -1 ? null : at)
  }
  if (missingColumns.length > 0) return { ok: false, missingColumns }
  // 꼭 있어야 하는 칸은 위에서 모두 찾았다
  return { ok: true, columns: Object.fromEntries(found) as ColumnIndex }
}

// 신환·재진 값 표(사용자 확인: 실제 값은 '신환'·'재진'). '30 초진'은 재진으로 센다(rx-picker REQ-813).
// 실제 파일의 띄어쓰기가 확인되지 않아 '30 초진'만 빈칸을 모두 뺀 뒤 견준다(다른 값은 앞뒤 빈칸만 뺀다). 그 밖(진찰료산정안함 등)은 알 수 없음
export function readVisit(value: string): boolean | null {
  const v = value.trim()
  return v === '신환' ? true : v === '재진' || v.replace(/\s+/g, '') === '30초진' ? false : null
}

export function readOutpatient(value: string): boolean | null {
  const v = value.trim()
  return v === '외래' ? true : v === '입원' ? false : null
}
