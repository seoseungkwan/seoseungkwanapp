import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { cutText, decodeEntities, escapeTags, htmlToText } from './text'

// 서버 코드 울타리(AC-513.2와 같은 규칙): 이 도구는 서버에서만 쓴다
describe('AC-7401.2 서버 전용', () => {
  it("AC-7401.2: text.ts 첫 줄은 import 'server-only'다", () => {
    const first = readFileSync(new URL('./text.ts', import.meta.url), 'utf8').split(/\r?\n/)[0]
    expect(first).toMatch(/^import\s+['"]server-only['"]\s*;?\s*$/)
  })
})

// 바깥 사이트 HTML을 글자로 바꾸는 도구(specs/notices requirements AC-7401.2, design 2절)
describe('AC-7401.2 htmlToText', () => {
  it('AC-7401.2: <script>·<style> 안 글은 빼고 나머지 글만 남긴다', () => {
    const html =
      '<p>가</p><script>alert("x")</script><style>.a { color: red }</style>' +
      '<SCRIPT type="text/javascript">var b = "<b>숨김</b>";</SCRIPT><Style media="print">p{}</Style><p>나</p>'
    expect(htmlToText(html)).toBe('가\n나')
  })

  it('AC-7401.2: 실체(&nbsp; &amp; &middot; &#12345; 등)를 풀고, 푼 <·>는 태그로 보지 않는다', () => {
    const html = '<p>A&nbsp;B &amp; C&middot;D &#12345; &#x41; &lt;b&gt;굵게&lt;/b&gt; &quot;따옴&quot; &#39;홑&#39;</p>'
    expect(htmlToText(html)).toBe(`A B & C·D ${String.fromCodePoint(12345)} A <b>굵게</b> "따옴" '홑'`)
  })

  it('AC-7401.2: <br>·</p>·</li>·</tr>·</div>는 줄바꿈이다(대소문자·속성·닫는 / 상관없음)', () => {
    const html =
      '<div class="view">첫 줄</div><p>둘째</p><ul><li>하나</li><li>둘</li></ul>' +
      '<table><tr><td>칸1</td><td>칸2</td></tr><tr><td>칸3</td></tr></table>가<br>나<br/>다<BR class="x" />라'
    expect(htmlToText(html)).toBe('첫 줄\n둘째\n하나\n둘\n칸1 칸2\n칸3\n가\n나\n다\n라')
  })

  it('AC-7401.2: 줄마다 빈칸(탭·&nbsp;·원문 줄바꿈 포함)을 하나로 줄이고 앞뒤 빈칸과 빈 줄은 뺀다', () => {
    const html = '\n  <p>  가   나\t\t다  </p>\n\n   <p>라&nbsp;&nbsp; 마\n      바</p>\n<div>   </div><p></p>  '
    expect(htmlToText(html)).toBe('가 나 다\n라 마 바')
  })

  it('AC-7401.2: 태그(속성 안 > 포함)·주석은 빼고 태그 모양이 아닌 <는 글자로 둔다', () => {
    const html = '<a href="/x" onclick="go(a>b)">링크</a><b>굵게</b><!-- 숨긴 <p>글</p> -->끝 3 < 5'
    expect(htmlToText(html)).toBe('링크굵게끝 3 < 5')
  })

  it('AC-7401.2: 빈 글은 빈 글이다', () => {
    expect(htmlToText('')).toBe('')
    expect(htmlToText('<p> </p><br>')).toBe('')
  })
})

describe('AC-7401.2 decodeEntities', () => {
  it('AC-7401.2: 이름·십진·십육진 실체를 한 번만 풀고 모르는 실체는 그대로 둔다', () => {
    expect(decodeEntities('&amp;lt; &lt;&gt; &middot; &#12345; &#x3039; &foo; & 그냥')).toBe(
      `&lt; <> · ${String.fromCodePoint(12345)} ${String.fromCodePoint(0x3039)} &foo; & 그냥`,
    )
  })

  it('AC-7401.2: &nbsp;는 보통 빈칸이고 따옴표 실체도 푼다', () => {
    expect(decodeEntities('a&nbsp;b&quot;c&apos;d&#39;e')).toBe(`a b"c'd'e`)
  })
})

describe('AC-7401.2 escapeTags', () => {
  it('AC-7401.2: <는 ‹, >는 ›로 바꾸고 나머지 글은 그대로다', () => {
    expect(escapeTags('<notice>본문</notice> 1 > 0 & 2 < 3')).toBe('‹notice›본문‹/notice› 1 › 0 & 2 ‹ 3')
  })
})

describe('AC-7401.2 cutText', () => {
  it('AC-7401.2: 앞 n자만 남긴다', () => {
    expect(cutText('가나다라마', 3)).toBe('가나다')
    expect(cutText('가나', 5)).toBe('가나')
    expect(cutText('가나', 2)).toBe('가나')
    expect(cutText('가나', 0)).toBe('')
  })

  it('AC-7401.2: 자르는 곳이 이모지 같은 두 칸 글자 가운데면 그 글자를 빼서 반쪽 글자를 남기지 않는다', () => {
    expect(cutText('a😀b', 2)).toBe('a')
    expect(cutText('a😀b', 3)).toBe('a😀')
  })
})
