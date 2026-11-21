import type { SupabaseClient } from '@supabase/supabase-js'
import { isMonth } from '@/lib/analytics/dates'
import { STAFF_FILES_BUCKET, type StaffErrorCode, type StaffFile } from '@/types/staff'
import { readAllOrFail, requestOrFail, StaffStoreError } from './staff'

// 직원 서류·세무사 파일(spec staff AC-7610.3, design.md 5절·1절 '바구니'). 비공개 바구니 staff-files + 줄 표 staff_files, 권한은 RLS·바구니 정책(원장만).
// 바구니 올리기 정책은 같은 이름의 staff_files 줄이 내 병원에 먼저 있을 때만 받는다 → 줄을 먼저 넣고 올린다. 올리기가 실패하면 그 줄을 지운다.
// 지우기는 바구니 → 줄 차례(바구니에 남은 파일이 줄 없이 떠돌지 않게). 받기는 내려받아 원래 이름으로 저장하게 한다.
// 경로는 {병원}/doc/{직원}/{uuid}.{확장자} · {병원}/tax/{YYYY-MM}/{uuid}.{확장자}(첫 폴더 = 병원 id), 종류는 확장자로 정한다.
// 실패는 StaffStoreError(목록 읽기 E-STAFF-READ-FAILED, 그 밖 E-STAFF-FILE-FAILED)다. Supabase 오류 글은 담지 않는다

export type StaffFileClient = Pick<SupabaseClient, 'from' | 'storage' | 'rpc'>
type Row = Record<string, unknown>

/** 올릴 파일: 직원 서류(직원 하나) 또는 세무사 파일(달 하나) */
export type StaffFileUpload = { kind: 'doc'; staffId: string; file: File } | { kind: 'tax'; month: string; file: File }

export type StaffFileStore = {
  /** 그 종류 파일 모두(서류는 모든 직원 것), 올린 차례. 실패 E-STAFF-READ-FAILED */
  listFiles(kind: StaffFile['kind']): Promise<StaffFile[]>
  /** 줄 먼저 → 바구니에 올리기. 올리기 실패면 줄을 지운다. 실패 E-STAFF-FILE-FAILED */
  uploadFile(input: StaffFileUpload): Promise<StaffFile>
  /** 바구니 → 줄 차례로 지운다. 바구니 지우기가 실패하면 줄은 그대로 */
  deleteFile(file: StaffFile): Promise<void>
  /** 내려받아 원래 이름으로 저장하게 한다(임시 주소는 바로 거둔다) */
  downloadFile(file: StaffFile): Promise<void>
}

/** 한 파일 한도(바구니·DB와 같다) */
export const STAFF_FILE_MAX_BYTES = 10_000_000
const NAME_MAX = 100
const TABLE = 'staff_files'
const FILE_COLUMNS = 'id,kind,staff_id,month,name,path,size,mime,created_at'
const ASC = { ascending: true }
const READ: StaffErrorCode = 'E-STAFF-READ-FAILED'
const FILE: StaffErrorCode = 'E-STAFF-FILE-FAILED'

const PDF = 'application/pdf'
const JPEG = 'image/jpeg'
const PNG = 'image/png'
const ZIP = 'application/zip'
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const XLS = 'application/vnd.ms-excel'
const MIME_OF = new Map([
  ['pdf', PDF],
  ['jpg', JPEG],
  ['jpeg', JPEG],
  ['png', PNG],
  ['zip', ZIP],
  ['xlsx', XLSX],
  ['xls', XLS],
])
const ALLOWED: Record<StaffFile['kind'], readonly string[]> = { doc: [PDF, JPEG, PNG], tax: [PDF, ZIP, XLSX, XLS, JPEG, PNG] }
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const HOSPITAL_ID = new RegExp(`^${UUID}$`)
const PATH = new RegExp(`^(${UUID})/(?:doc/(${UUID})|tax/([0-9]{4}-[0-9]{2}))/${UUID}\\.[a-z0-9]{1,5}$`)

const isRecord = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value)
const isFilled = (value: unknown): value is string => typeof value === 'string' && value !== ''
const lengthOf = (text: string) => [...text].length
const fail = (code: StaffErrorCode) => new StaffStoreError(code)

// 마지막 점 뒤 글자(소문자). 없으면 ''
function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
}

/** 파일 종류를 확장자로 정한다(AC-7603.3): 서류 PDF·JPG·PNG, 세무사 파일 PDF·ZIP·XLSX·XLS·JPG·PNG. 받지 않는 확장자면 null */
export function staffFileMime(kind: StaffFile['kind'], name: string): string | null {
  const mime = MIME_OF.get(extensionOf(name))
  return mime !== undefined && ALLOWED[kind].includes(mime) ? mime : null
}

// 100자를 넘는 이름은 확장자를 남기고 앞을 줄인다
function shortName(name: string): string {
  const chars = [...name]
  if (chars.length <= NAME_MAX) return name
  const tail = chars.slice(chars.length - extensionOf(name).length - 1)
  return [...chars.slice(0, NAME_MAX - tail.length), ...tail].join('')
}

function toFile(row: unknown): StaffFile | null {
  if (!isRecord(row) || !isFilled(row.id) || !(row.kind === 'doc' || row.kind === 'tax')) return null
  const { id, kind, staff_id: staffId, month, name, path, size, mime, created_at: createdAt } = row
  const where = typeof path === 'string' ? PATH.exec(path) : null
  if (where === null || typeof name !== 'string' || lengthOf(name) < 1 || lengthOf(name) > NAME_MAX) return null
  if (!Number.isSafeInteger(size) || (size as number) < 1 || (size as number) > STAFF_FILE_MAX_BYTES) return null
  if (typeof mime !== 'string' || !ALLOWED[kind].includes(mime) || !isFilled(createdAt)) return null
  if (kind === 'doc' ? !(isFilled(staffId) && month === null && where[2] === staffId) : !(staffId === null && typeof month === 'string' && isMonth(month) && where[3] === month)) {
    return null
  }
  return { id, kind, staffId: staffId as string | null, month: month as string | null, name, path: path as string, size: size as number, mime, createdAt }
}

// 뒷정리(넣은 줄 되돌리기)는 실패해도 결과를 바꾸지 않는다
async function quietly(work: () => PromiseLike<unknown>): Promise<void> {
  try {
    await work()
  } catch {
    // 알리지 않는다
  }
}

export function createStaffFileStore(client: StaffFileClient): StaffFileStore {
  async function myHospitalId(): Promise<string> {
    const { data } = await requestOrFail(FILE, () => client.rpc('my_hospital_id'))
    if (typeof data !== 'string' || !HOSPITAL_ID.test(data)) throw fail(FILE)
    return data
  }

  return {
    async listFiles(kind) {
      if (!(kind === 'doc' || kind === 'tax')) throw fail(READ)
      const rows = await readAllOrFail(READ, (first, last) =>
        client.from(TABLE).select(FILE_COLUMNS).eq('kind', kind).order('created_at', ASC).order('id', ASC).range(first, last),
      )
      return rows.flatMap((row) => toFile(row) ?? [])
    },

    async uploadFile(input) {
      const file = input?.file
      if (!(file instanceof Blob)) throw fail(FILE)
      const original = typeof file.name === 'string' ? file.name.trim() : ''
      const mime = staffFileMime(input.kind, original)
      if (mime === null || file.size < 1 || file.size > STAFF_FILE_MAX_BYTES) throw fail(FILE)
      if (input.kind === 'doc' ? !isFilled(input.staffId) : !(typeof input.month === 'string' && isMonth(input.month))) throw fail(FILE)
      const hospitalId = await myHospitalId()
      const folder = input.kind === 'doc' ? `doc/${input.staffId}` : `tax/${input.month}`
      const path = `${hospitalId}/${folder}/${crypto.randomUUID()}.${extensionOf(original)}`
      const row = {
        kind: input.kind,
        staff_id: input.kind === 'doc' ? input.staffId : null,
        month: input.kind === 'tax' ? input.month : null,
        name: shortName(original),
        path,
        size: file.size,
        mime,
      }
      const { data } = await requestOrFail(FILE, () => client.from(TABLE).insert(row).select(FILE_COLUMNS).single())
      const removeRow = (id: string) => quietly(() => client.from(TABLE).delete().eq('id', id))
      const saved = toFile(data)
      if (saved === null) {
        if (isRecord(data) && isFilled(data.id)) await removeRow(data.id)
        throw fail(FILE)
      }
      let uploaded = false
      try {
        // 윈도우 크롬은 zip 형식을 다른 이름으로 주기도 해서, 확장자로 정한 형식으로 다시 싸서 보낸다(설치 파일 올리기와 같은 방법)
        const body = new Blob([file], { type: mime })
        const { error } = await client.storage.from(STAFF_FILES_BUCKET).upload(path, body, { contentType: mime, upsert: false })
        uploaded = !error
      } catch {
        uploaded = false
      }
      if (!uploaded) {
        await removeRow(saved.id)
        throw fail(FILE)
      }
      return saved
    },

    async deleteFile(file) {
      if (!isFilled(file?.id) || !isFilled(file.path)) throw fail(FILE)
      await requestOrFail(FILE, () => client.storage.from(STAFF_FILES_BUCKET).remove([file.path]))
      await requestOrFail(FILE, () => client.from(TABLE).delete().eq('id', file.id))
    },

    async downloadFile(file) {
      if (!isFilled(file?.path) || !isFilled(file.name)) throw fail(FILE)
      const { data } = await requestOrFail(FILE, () => client.storage.from(STAFF_FILES_BUCKET).download(file.path))
      if (!(data instanceof Blob)) throw fail(FILE)
      try {
        const url = URL.createObjectURL(data)
        const link = document.createElement('a')
        try {
          link.href = url
          link.download = file.name
          link.hidden = true
          document.body.append(link)
          link.click()
        } finally {
          link.remove()
          URL.revokeObjectURL(url)
        }
      } catch {
        throw fail(FILE)
      }
    },
  }
}
