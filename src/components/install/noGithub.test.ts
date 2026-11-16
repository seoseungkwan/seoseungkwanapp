import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// 도우미·확장은 웹앱 보관함에서만 받는다(helper-download AC-5103.4).
// src/ 어디에도 옛 받는 곳(비공개 GitHub 릴리스 주소)과 그 상수 이름이 남지 않는다. 이 시험 파일은 찾을 글자를 적어야 해서 뺀다
const SRC = fileURLToPath(new URL('../../', import.meta.url))
const SELF = fileURLToPath(import.meta.url)
const NEEDLES = ['github.com/seoseungkwan/seoseungkwanapp/releases', 'HELPER_RELEASES_URL']

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path))
    else if (/\.(ts|tsx|mjs|js|css|json)$/.test(name) && path !== SELF) out.push(path)
  }
  return out
}

describe('AC-5103.4 GitHub 받는 곳이 남지 않음', () => {
  it('AC-5103.4: src/의 어떤 파일에도 GitHub 릴리스 주소·HELPER_RELEASES_URL이 없다', () => {
    const found = sourceFiles(SRC).flatMap((path) => {
      const text = readFileSync(path, 'utf-8')
      return NEEDLES.filter((needle) => text.includes(needle)).map((needle) => `${relative(SRC, path).split(sep).join('/')}: ${needle}`)
    })
    expect(found).toEqual([])
  })
})
