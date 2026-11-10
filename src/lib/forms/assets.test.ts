import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// 서식 탭 안내문 그림 파일에 넣는 글꼴·테마 그림(specs/forms TASK-6, design.md 4절 끝 '그림 파일 규칙').
// 파일을 바이트로 읽어 본다. 짝 시험: src/app/fonts.test.ts(앱 글꼴)
const ROOT = process.cwd()
const POSTER_FONT_DIR = 'public/poster/fonts'
const THEME_DIR = 'public/poster/themes'
const MOCKUP_THEME_DIR = 'docs/mockups/forms/themes'
const APP_FONT_DIR = 'src/app/fonts'

// npm pretendard@1.3.9 꾸러미의 dist/web/static/woff2-subset/ 두 파일(고치지 않음).
// 2026-11-10 npm pack pretendard@1.3.9(integrity sha512-PaQAADyL…IaywSw==)를 풀어 잰 값
const POSTER_FONT_FILES: Record<string, string> = {
  'Pretendard-Bold.subset.woff2': '78eb71c33101ee7d4f8d1b777d193a12d00f8a296e712a8c417cf27abe946397',
  'Pretendard-Black.subset.woff2': '439823f6076b12390af89a9d8883d79530f60539319e4b244633057d5a0cff6f',
}
// 같은 꾸러미의 dist/LICENSE.txt(fonts.test.ts의 LICENSE_SHA256과 같은 값)
const LICENSE_SHA256 = 'b04538c9abec39a3db75108cf0af0fd9c77032fe8aa2cf38345b4d250e98e38e'
// src/app/fonts의 세 글꼴(fonts.test.ts FONT_FILES 그대로). 서식 TASK가 이 폴더를 건드리지 않았는지 본다
const APP_FONT_FILES: Record<string, string> = {
  'Pretendard-Regular.subset.woff2': '01dd73155fdfab7ce9b25224523e85a96927e21aef97f21957d41f1bfa7e3878',
  'Pretendard-Medium.subset.woff2': '6f4e897a59138903ae64e814df059790cf0e0ff73b8595810145aee23204469f',
  'Pretendard-SemiBold.subset.woff2': '4247dc5e260b92640c2cbd0e75091154647b71e1d5884116655e2903468c54cc',
}

// 테마 열쇠 23개(design.md 4절 표): 공휴일 11개 뒤 달 12개
const THEME_KEYS = [
  'newyear', 'seollal', 'samiljeol', 'children', 'buddha', 'memorial', 'liberation', 'chuseok', 'foundation', 'hangul', 'christmas',
  'm01', 'm02', 'm03', 'm04', 'm05', 'm06', 'm07', 'm08', 'm09', 'm10', 'm11', 'm12',
] as const
const THEME_BYTES_MAX = 60_000

const files = (dir: string) => readdirSync(join(ROOT, dir)).sort()
const bytes = (rel: string) => readFileSync(join(ROOT, rel))
const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest('hex')

// 줄바꿈: 이 저장소는 core.autocrlf=true(Git for Windows 기본)이고 .gitattributes에 eol 규칙이 없다.
// 그래서 글 파일(OFL.txt·SVG)은 저장소 안에는 LF로 들지만 윈도우에서 새로 꺼내면(checkout·worktree) CRLF가 된다.
// (src/app/fonts/OFL.txt가 그렇다: git ls-files --eol이 i/lf w/crlf. fonts.test.ts는 바이트 그대로 재서 새 checkout에서 어긋난다.)
// woff2는 git이 바이너리(-text)로 보아 바꾸지 않으므로 그대로 잰다. 글 파일은 CRLF를 LF로 되돌린 뒤 잰다:
// 저장소에 든 바이트(= 꾸러미 원본·승인 시안)와 같아지고, 사이트에 올라가는 리눅스 checkout도 그 바이트다.
// latin1은 바이트를 한 글자씩 그대로 옮기므로 \r\n 말고는 한 바이트도 바뀌지 않는다
const asLf = (buf: Buffer) => Buffer.from(buf.toString('latin1').replace(/\r\n/g, '\n'), 'latin1')
const textBytes = (rel: string) => asLf(bytes(rel))

const themeRel = (key: string) => `${THEME_DIR}/${key}.svg`
const themeText = (key: string) => textBytes(themeRel(key)).toString('utf8')

describe('AC-3510.1: public/poster/fonts/의 Pretendard 파일', () => {
  it('AC-3510.1: 폴더에는 Bold·Black 두 글꼴과 OFL.txt만 있다', () => {
    expect(files(POSTER_FONT_DIR)).toEqual([...Object.keys(POSTER_FONT_FILES), 'OFL.txt'].sort())
  })

  it.each(Object.entries(POSTER_FONT_FILES))('AC-3510.1: %s는 pretendard@1.3.9 꾸러미 파일 그대로다(sha256)', (name, hash) => {
    expect(sha256(bytes(`${POSTER_FONT_DIR}/${name}`))).toBe(hash)
  })

  it('AC-3510.1: OFL.txt는 같은 꾸러미의 dist/LICENSE.txt(SIL OFL 1.1, Reserved Font Name Pretendard) 그대로다(LF로 잰 sha256)', () => {
    const license = textBytes(`${POSTER_FONT_DIR}/OFL.txt`)
    expect(sha256(license)).toBe(LICENSE_SHA256)
    const words = license.toString('utf8')
    expect(words).toContain('SIL Open Font License, Version 1.1')
    expect(words).toContain('Reserved Font Name')
    expect(words).toContain('Pretendard')
  })

  it('AC-3510.1: 줄바꿈 되돌리기는 CRLF만 LF로 바꾸고 다른 바이트는 그대로 둔다', () => {
    const raw = Buffer.from([0x61, 0x0d, 0x0a, 0x0d, 0x62, 0x0a, 0xff, 0x00, 0x0d, 0x0a])
    expect([...asLf(raw)]).toEqual([0x61, 0x0a, 0x0d, 0x62, 0x0a, 0xff, 0x00, 0x0a])
  })
})

describe('AC-3510.1: src/app/fonts의 세 글꼴은 그대로다', () => {
  it('AC-3510.1: 폴더에는 지금 세 글꼴과 OFL.txt만 있다', () => {
    expect(files(APP_FONT_DIR)).toEqual([...Object.keys(APP_FONT_FILES), 'OFL.txt'].sort())
  })

  it.each(Object.entries(APP_FONT_FILES))('AC-3510.1: %s는 바뀌지 않았다(fonts.test.ts와 같은 sha256)', (name, hash) => {
    expect(sha256(bytes(`${APP_FONT_DIR}/${name}`))).toBe(hash)
  })
})

describe('AC-3504.5: public/poster/themes/의 테마 그림 23개', () => {
  it('AC-3504.5: 폴더에는 열쇠 23개의 <열쇠>.svg만 있다', () => {
    expect(THEME_KEYS).toHaveLength(23)
    expect(new Set(THEME_KEYS).size).toBe(23)
    expect(files(THEME_DIR)).toEqual(THEME_KEYS.map((key) => `${key}.svg`).sort())
  })

  it.each(THEME_KEYS)('AC-3504.5: %s.svg는 맨 바깥 <svg>가 viewBox="0 0 794 1123"이다', (key) => {
    const root = themeText(key).match(/<svg\b[^>]*>/)?.[0]
    expect(root, `${key}: <svg> 태그가 없다`).toBeDefined()
    expect(root).toContain('viewBox="0 0 794 1123"')
  })

  it.each(THEME_KEYS)('AC-3504.5: %s.svg에는 글자(<text>)·스크립트·<foreignObject>·이벤트 속성(on…=)이 없다', (key) => {
    const text = themeText(key)
    expect(text).not.toMatch(/<text\b/i)
    expect(text).not.toMatch(/<script\b/i)
    expect(text).not.toMatch(/<foreignObject\b/i)
    expect(text).not.toMatch(/\son[a-z]+\s*=/i)
  })

  it.each(THEME_KEYS)('AC-3504.5: %s.svg의 href·xlink:href·url()은 모두 #로 시작한다(바깥 주소 없음)', (key) => {
    const text = themeText(key)
    const hrefs = [...text.matchAll(/(?:xlink:)?href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)].map((m) => m[1] ?? m[2] ?? m[3])
    for (const href of hrefs) expect(href, `${key}: href="${href}"`).toMatch(/^#/)
    const urls = [...text.matchAll(/url\(\s*['"]?([^'")\s]*)/gi)].map((m) => m[1])
    for (const url of urls) expect(url, `${key}: url(${url})`).toMatch(/^#/)
  })

  it.each(THEME_KEYS)('AC-3504.5: %s.svg는 60KB(60,000바이트) 이하다', (key) => {
    expect(textBytes(themeRel(key)).length).toBeLessThanOrEqual(THEME_BYTES_MAX)
  })

  it.each(THEME_KEYS)('AC-3504.5: %s.svg는 승인 시안 docs/mockups/forms/themes/의 같은 파일과 바이트가 같다(LF로 견줌)', (key) => {
    const copy = textBytes(themeRel(key))
    const approved = textBytes(`${MOCKUP_THEME_DIR}/${key}.svg`)
    expect(sha256(copy)).toBe(sha256(approved))
  })
})
