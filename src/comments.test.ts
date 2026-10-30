import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// 옛 주석 정리 (REQ-113 AC-113.2, specs/landing-v2 TASK-15). 파일을 글자로 읽어 주석이 지금 동작과 맞는지 본다.
// 코드는 바꾸지 않는다. 새 주석에 색 값을 쓰지 않는다(AC-103.2가 AppShell·AuthFrame을 주석까지 읽는다)

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

// 파일 안 주석 줄(// 줄과 JSX {/* */} 줄)만
const commentLines = (src: string) => src.split('\n').filter((line) => /^\s*(\/\/|\{\/\*)/.test(line))

// 시험 파일 밖 src/ 의 .tsx 전부(상대 경로)
function tsxFiles(dir = 'src'): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) return tsxFiles(rel)
    return entry.name.endsWith('.tsx') && !/\.test\.tsx$/.test(entry.name) ? [rel] : []
  })
}

const FRAMES = ['src/components/shell/AppShell.tsx', 'src/components/auth/AuthFrame.tsx']

describe('AC-113.2: 옛 주석이 지금 동작과 맞다', () => {
  it.each(FRAMES)('AC-113.2: %s에 "한 색"·"글자색 ink를 따"·"자리표시"가 없고, 로고 주석이 LogoMark 고정 두 색(C③)을 말한다', (file) => {
    const src = read(file)
    for (const old of ['한 색', '글자색 ink를 따', '자리표시']) {
      expect(src, `${file}: ${old}`).not.toContain(old)
    }
    const logoComments = commentLines(src).filter((line) => line.includes('LogoMark'))
    expect(logoComments.some((line) => line.includes('C③') && line.includes('고정 두 색')), file).toBe(true)
  })

  it('AC-113.2: src/middleware.ts에 "랜딩 그림"이 없고, matcher의 landing/ 제외는 그대로다', () => {
    const src = read('src/middleware.ts')
    expect(src).not.toContain('랜딩 그림')
    expect(src).toContain('landing/|')
  })

  it('AC-113.2: src/components/shell/TabBar.tsx에 "teal"(옛 랜딩 색 이야기)이 없다', () => {
    expect(read('src/components/shell/TabBar.tsx')).not.toMatch(/teal/i)
  })

  it('AC-113.2: LogoMark.tsx 주석의 쓰는 곳 크기 목록에 히어로 미리보기(20)가 있고, src/에서 쓰는 크기가 모두 들어 있다', () => {
    const lists = commentLines(read('src/components/common/LogoMark.tsx')).filter((line) => line.includes('(22)'))
    expect(lists).toHaveLength(1)
    const [list = ''] = lists
    expect(list).toMatch(/히어로 미리보기\(20\)/)
    const used = new Set(tsxFiles().flatMap((rel) => [...read(rel).matchAll(/<LogoMark size=\{(\d+)\}/g)].map((m) => m[1])))
    expect([...used].sort()).toEqual(['20', '22', '26'])
    for (const size of used) expect(list, size).toContain(`(${size})`)
  })

  it.each([...FRAMES, 'src/middleware.ts', 'src/components/shell/TabBar.tsx'])('AC-113.2: %s 주석에 색 값(#xxxxxx)이 없다', (file) => {
    expect(commentLines(read(file)).filter((line) => /#[0-9a-f]{3,8}\b/i.test(line)), file).toEqual([])
  })
})
