import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LANDING_IMAGES } from './images'

const ROOT = process.cwd()
const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex')

// 승인된 목업의 그림 이름·alt 그대로
const APPROVED = {
  'tile-injection.jpg': '주사기와 밴드',
  'tile-physio.jpg': '치료 침대, 전기 치료기, 패드와 찜질팩',
  'tile-noncovered.jpg': '동전과 지폐',
  'tile-report.jpg': '차트가 담긴 월말 보고서',
  'feature-stats.jpg': '차트가 뜬 노트북과 척추·무릎 모형이 있는 책상',
  'feature-payroll.jpg': '계산기와 서류, 표가 뜬 태블릿이 놓인 책상',
} as const

describe('AC-006.1: 그림 목록', () => {
  it('AC-006.1: 6장이 /landing/ 경로와 목업의 alt를 가진다', () => {
    const list = Object.values(LANDING_IMAGES)
    expect(list).toHaveLength(6)
    const byName = Object.fromEntries(list.map((img) => [img.src.replace('/landing/', ''), img.alt]))
    expect(byName).toEqual(APPROVED)
  })

  it('AC-006.1: width·height가 승인본 그림 크기다(타일 880×1168, 기능 1344×752)', () => {
    for (const img of Object.values(LANDING_IMAGES)) {
      const expected = img.src.includes('/tile-') ? [880, 1168] : [1344, 752]
      expect([img.width, img.height], img.src).toEqual(expected)
    }
  })
})

describe('AC-006.2: public/landing 그림 파일', () => {
  it.each(Object.keys(APPROVED))('AC-006.2: %s가 승인본과 내용이 같다', (name) => {
    const served = join(ROOT, 'public/landing', name)
    expect(existsSync(served), served).toBe(true)
    expect(sha256(served)).toBe(sha256(join(ROOT, 'docs/mockups/landing/images', name)))
  })
})
