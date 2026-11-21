import 'server-only'

// 바깥 사이트(심평원·보건복지부) HTML을 글자로 바꾸고, Claude에 보낼 글을 감싸기 좋게 다듬는 도구(specs/notices AC-7401.2). 순수 함수만 둔다

// 이름 실체. 사이트 글에 흔한 것만 두고, 모르는 이름은 풀지 않고 그대로 둔다. &nbsp;류는 보통 빈칸으로 푼다
const NAMED: ReadonlyMap<string, string> = new Map([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
  ['nbsp', ' '],
  ['ensp', ' '],
  ['emsp', ' '],
  ['thinsp', ' '],
  ['middot', '·'],
  ['sdot', '⋅'],
  ['bull', '•'],
  ['hellip', '…'],
  ['ndash', '–'],
  ['mdash', '—'],
  ['lsquo', '‘'],
  ['rsquo', '’'],
  ['ldquo', '“'],
  ['rdquo', '”'],
  ['laquo', '«'],
  ['raquo', '»'],
  ['lsaquo', '‹'],
  ['rsaquo', '›'],
  ['times', '×'],
  ['divide', '÷'],
  ['plusmn', '±'],
  ['deg', '°'],
  ['sim', '∼'],
  ['le', '≤'],
  ['ge', '≥'],
  ['ne', '≠'],
  ['larr', '←'],
  ['rarr', '→'],
  ['uarr', '↑'],
  ['darr', '↓'],
  ['harr', '↔'],
  ['lArr', '⇐'],
  ['rArr', '⇒'],
  ['hArr', '⇔'],
  ['permil', '‰'],
  ['micro', 'µ'],
  ['sup2', '²'],
  ['sup3', '³'],
  ['frac12', '½'],
  ['frac14', '¼'],
  ['frac34', '¾'],
  ['sect', '§'],
  ['para', '¶'],
  ['copy', '©'],
  ['reg', '®'],
  ['trade', '™'],
  ['cent', '¢'],
  ['pound', '£'],
  ['yen', '¥'],
  ['euro', '€'],
  ['shy', ''],
  ['zwnj', ''],
  ['zwj', ''],
  ['lrm', ''],
  ['rlm', ''],
])

const ENTITY = /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([A-Za-z][A-Za-z0-9]{1,31}));/g

function fromCodePoint(cp: number): string {
  // 0·대리 쌍 반쪽·유니코드 밖 번호는 글자로 만들 수 없다 → 대체 글자
  if (cp === 0 || (cp >= 0xd800 && cp <= 0xdfff) || cp > 0x10ffff) return '�'
  return String.fromCodePoint(cp)
}

/** HTML 실체(&amp; &nbsp; &middot; &#12345; &#x3039; 등)를 한 번만 푼다. 모르는 이름 실체는 그대로 둔다 */
export function decodeEntities(s: string): string {
  return s.replace(ENTITY, (whole: string, dec: string | undefined, hex: string | undefined, name: string | undefined) => {
    if (dec !== undefined) return fromCodePoint(Number.parseInt(dec, 10))
    if (hex !== undefined) return fromCodePoint(Number.parseInt(hex, 16))
    return NAMED.get(name ?? '') ?? whole
  })
}

const SCRIPT_STYLE = /<(script|style)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi
const COMMENT = /<!--[\s\S]*?(?:-->|$)/g
const RAW_NEWLINE = /\r\n|[\r\n]/g
const BREAK = /<br\b[^>]*>/gi
const BLOCK_END = /<\/(?:p|li|tr|div|h[1-6])\s*>/gi
const CELL_END = /<\/t[dh]\s*>/gi
// 태그 모양(<글자·</·<!·<?로 시작)만 뺀다. 따옴표 속성 값 안의 >는 태그 끝으로 보지 않는다.
// 따옴표가 닫히지 않은 태그는 두 번째 식이 > 까지 뺀다. '3 < 5'처럼 태그 모양이 아닌 <는 글자로 남는다
const TAG = /<[A-Za-z/!?](?:"[^"<]*"|'[^'<]*'|[^'"<>])*>/g
const TAG_LOOSE = /<[A-Za-z/!?][^<>]*>/g

/**
 * HTML → 글자. <script>·<style> 안 글과 주석은 빼고, <br>·</p>·</li>·</tr>·</div>·</h1~6>는 줄바꿈, </td>·</th>는 빈칸,
 * 나머지 태그는 지운 뒤 실체를 푼다. 원문의 줄바꿈은 HTML처럼 빈칸으로 본다.
 * 줄마다 빈칸(탭·&nbsp; 포함)을 하나로 줄이고 앞뒤 빈칸을 떼며, 빈 줄은 뺀다
 */
export function htmlToText(html: string): string {
  const flat = html
    .replace(SCRIPT_STYLE, '')
    .replace(COMMENT, '')
    .replace(RAW_NEWLINE, ' ')
    .replace(BREAK, '\n')
    .replace(BLOCK_END, '\n')
    .replace(CELL_END, ' ')
    .replace(TAG, '')
    .replace(TAG_LOOSE, '')
  return decodeEntities(flat)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line !== '')
    .join('\n')
}

/** Claude에 보내는 <notice>·<attachment>·<question> 안 글이 감싸개를 흉내 내지 못하게 <·>를 ‹·›로 바꾼다 */
export function escapeTags(s: string): string {
  return s.replace(/</g, '‹').replace(/>/g, '›')
}

/**
 * 앞 n자만 남긴다(자는 JS 글자 길이 = UTF-16 칸, DB 글자 수 제약보다 길어지지 않는다).
 * 자르는 곳이 두 칸 글자(이모지 등) 가운데면 그 글자를 빼서 반쪽 글자를 남기지 않는다
 */
export function cutText(s: string, n: number): string {
  if (s.length <= n) return s
  if (n <= 0) return ''
  const last = s.charCodeAt(n - 1)
  const end = last >= 0xd800 && last <= 0xdbff ? n - 1 : n
  return s.slice(0, end)
}
