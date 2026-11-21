import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// 올리기 부품 폴더 규칙(specs/contacts AC-6506.2·AC-6506.3, design.md '화면' import/).
// 파일은 브라우저 메모리에서만 읽고, 미리 보기·창은 plan·결과를 props로 받는다 → 저장·Supabase·네트워크·브라우저 저장소·console을 쓰지 않는다.
// [넣기]의 importContacts는 화면 잇기(TASK-7)가 부른다
const DIR = join(process.cwd(), 'src', 'components', 'contacts', 'import')
const files = readdirSync(DIR).filter((name) => /\.(?:ts|tsx)$/.test(name) && !/\.test\.(?:ts|tsx)$/.test(name))
const withoutComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1')
const read = (name: string) => withoutComments(readFileSync(join(DIR, name), 'utf8'))

describe('AC-6506.2·AC-6506.3 components/contacts/import는 props·콜백만 쓴다', () => {
  it('AC-6506.2: 부품 파일이 다 있다', () => {
    for (const name of ['readUpload.ts', 'UploadButton.tsx', 'TemplateLink.tsx', 'FileProblemDialog.tsx', 'ImportPreview.tsx', 'problemText.ts', 'changeLabels.ts', 'ImportDoneNotice.tsx'])
      expect(files).toContain(name)
  })

  it('AC-6506.3: supabase·lib/storage·auth를 불러오지 않는다', () => {
    const found = files.flatMap((name) =>
      [...read(name).matchAll(/(?:\bfrom|\bimport)\s*\(?\s*['"]([^'"]+)['"]/g)]
        .map((m) => m[1])
        .filter((spec) => /^@supabase\/|^@\/lib\/(?:supabase|storage|auth)(?:\/|$)|^@\/services\//.test(spec))
        .map((spec) => `${name}: ${spec}`),
    )
    expect(found).toEqual([])
  })

  it('AC-6506.2: 네트워크·브라우저 저장소·console을 쓰지 않는다', () => {
    const words = /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|console)\b/g
    expect(files.flatMap((name) => (read(name).match(words) ?? []).map((word) => `${name}: ${word}`))).toEqual([])
  })
})
