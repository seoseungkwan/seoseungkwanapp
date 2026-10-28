import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const GLOBALS = join(ROOT, 'src/app/globals.css')
const LANDING = join(ROOT, 'src/components/landing')

const read = (path: string) => readFileSync(path, 'utf8')
const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

// 랜딩 CSS 전부: globals.css + 섹션 CSS Module
const landingCss = () => [
  GLOBALS,
  ...readdirSync(LANDING)
    .filter((name) => name.endsWith('.module.css'))
    .map((name) => join(LANDING, name)),
]

describe('AC-004.3: 모션 줄이기', () => {
  it('AC-004.3: prefers-reduced-motion: reduce 안에서 모든 요소의 animation·transition을 끈다', () => {
    const css = withoutComments(read(GLOBALS))
    const block = css.match(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{([\s\S]*?\})\s*\}/)
    expect(block, 'reduced-motion 블록이 없다').not.toBeNull()
    const body = block![1]
    expect(body).toMatch(/\*\s*,\s*\*::before\s*,\s*\*::after\s*\{/)
    expect(body).toMatch(/animation:\s*none\s*!important/)
    expect(body).toMatch(/transition:\s*none\s*!important/)
  })
})

describe('AC-005.3: 금지한 장식', () => {
  it('AC-005.3: 랜딩 CSS에 그라데이션 글자(background-clip: text)가 없다', () => {
    for (const path of landingCss()) {
      expect(withoutComments(read(path)), path).not.toMatch(/background-clip:\s*text/)
    }
  })
})
