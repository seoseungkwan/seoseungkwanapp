import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import type { ListItem } from '@/types/notices'
import { createFetchSite, type SiteFetch } from '../fetchSite'
import { MOHW_RSS_URL, parseMohwRss } from './mohwRss'

// 보건복지부 훈령/고시 RSS 읽기(specs/notices requirements REQ-7407, design 5절).
// 견본은 2026-11-21에 받은 RSS에서 담당자 이름(author)·문의 전화만 지운 것이다. 진짜 사이트는 부르지 않는다

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../../../fixtures/notices/${name}`, import.meta.url)), 'utf8')

const KEYS = [
  '1492620', '1492618', '1492597', '1492584', '1492582', '1492581', '1492514', '1492513', '1492505', '1492479',
  '1492466', '1492447', '1492434', '1492423', '1492415', '1492413', '1492392', '1492391', '1492387', '1492386',
  '1492373', '1492371', '1492368', '1492366', '1492365', '1492348', '1492330', '1492323', '1492322', '1492321',
]
// 고시 번호가 없는 글(훈령·예규·공고·안내)
const NOTICE_KEYS = ['1492618', '1492597', '1492584', '1492466', '1492434', '1492415', '1492413', '1492371', '1492323', '1492322']
const POSTED = [
  '2026-11-20', '2026-11-20', '2026-11-19', '2026-11-18', '2026-11-18', '2026-11-18', '2026-11-11', '2026-11-11', '2026-11-10', '2026-11-09',
  '2026-11-06', '2026-11-05', '2026-11-04', '2026-11-03', '2026-11-03', '2026-11-03', '2026-10-30', '2026-10-30', '2026-10-30', '2026-10-30',
  '2026-10-30', '2026-10-30', '2026-10-29', '2026-10-29', '2026-10-29', '2026-10-29', '2026-10-27', '2026-10-26', '2026-10-26', '2026-10-26',
]
const FIELDS = ['body', 'key', 'kind', 'numberText', 'postedOn', 'source', 'title', 'url']
const viewUrl = (key: string) => `https://www.mohw.go.kr/board.es?mid=a10409020000&bid=0026&list_no=${key}&act=view`

type Item = { title?: string; link?: string; description?: string; pubDate?: string; author?: string; raw?: string }
const itemXml = (i: Item) =>
  i.raw ??
  [
    '<item>',
    i.title === undefined ? '' : `<title><![CDATA[${i.title}]]></title>`,
    i.link === undefined ? '' : `<link>${i.link}</link>`,
    i.description === undefined ? '' : `<description><![CDATA[${i.description}]]></description>`,
    i.pubDate === undefined ? '' : `<pubDate>${i.pubDate}</pubDate>`,
    i.author === undefined ? '' : `<author>${i.author}</author>`,
    '</item>',
  ].join('\n')
const rss = (...items: Item[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n<channel>\n<title>보건복지부</title>\n${items.map(itemXml).join('\n')}\n</channel>\n</rss>\n`
const link = (key: string) => `https://www.mohw.go.kr/board.es?mid=a10409020000&amp;bid=0026&amp;list_no=${key}&amp;act=view`
const ok = (over: Item = {}): Item => ({
  title: '「가짜 고시」 일부개정',
  link: link('1'),
  description: '보건복지부 고시 제2026-1호 가짜 설명',
  pubDate: 'Fri, 20 Nov 2026 01:00:00 GMT',
  ...over,
})

describe('AC-7407.1 parseMohwRss — 견본 RSS', () => {
  const rows = parseMohwRss(fixture('mohw-rss.xml'))

  it('AC-7407.1: 견본은 30줄이고 key = list_no, 출처는 mohw_rss, 칸은 정해 둔 것만이다', () => {
    expect(rows).toHaveLength(30)
    expect(rows.map((r) => r.key)).toEqual(KEYS)
    for (const r of rows) {
      expect(r.source).toBe('mohw_rss')
      expect(Object.keys(r).sort()).toEqual(FIELDS)
    }
  })

  it('AC-7407.1: 첫 줄(고시)과 둘째 줄(훈령)은 제목(CDATA 안)·날짜·본문·주소·종류·번호 글이 이렇다', () => {
    const firstBody =
      '보건복지부고시 제2026-237호 「국민건강보험법」제49조 및 같은 법 시행규칙 제23조에 의한 「요양비의 보험급여 기준 및 방법」을 다음과 같이 개정？발령합니다. 2026년 11월 20일 보건복지부장관 요양비의 보험급여 기준 및 방법 일부개정고시 가. 주요내용 ○ 요양비 지급 확대 등에 따른 급여기준 마련 및 서식 개정 - 인슐린자동주입기, 연속혈당측정용 전극 지급 대상자 확대 - 인슐린자동주입기 품목 세분화 - 자가도뇨소모성재료 지급금액 및 개수 확대 나. 시행일 : 2026. 12. 1.'
    const firstTitle = '「요양비의 보험급여 기준 및 방법」 고시 일부개정'
    expect(rows[0]).toEqual<ListItem>({
      source: 'mohw_rss',
      key: '1492620',
      title: firstTitle,
      url: viewUrl('1492620'),
      postedOn: '2026-11-20',
      kind: 'gosi',
      numberText: `${firstTitle}\n${firstBody.slice(0, 200)}`,
      body: firstBody,
    })
    const secondTitle = '「국민연금 기금운용관련 직원의 유가증권 보유 및 거래 제한에 관한 규정」일부개정'
    const secondBody =
      '보건복지부 훈령 제309호 국민연금 기금운용관련 직원의 유가증권 보유 및 거래 제한에 관한 규정 일부개정 「국민연금 기금운용관련 직원의 유가증권 보유 및 거래 제한에 관한 규정」을 다음과 같이 일부개정·발령합니다. 2026년 11월 20일 보건복지부장관'
    expect(rows[1]).toEqual<ListItem>({
      source: 'mohw_rss',
      key: '1492618',
      title: secondTitle,
      url: viewUrl('1492618'),
      postedOn: '2026-11-20',
      kind: 'notice',
      numberText: `${secondTitle}\n${secondBody.slice(0, 200)}`,
      body: secondBody,
    })
  })

  it('AC-7407.1: 날짜는 pubDate의 한국 날짜다', () => {
    expect(rows.map((r) => r.postedOn)).toEqual(POSTED)
  })

  it('AC-7407.1: 본문은 description 글자이고 실체(&middot;·&ldquo; 등)를 푼다', () => {
    for (const r of rows) {
      expect(r.body).not.toBeNull()
      expect(r.body).not.toMatch(/&[A-Za-z]+;|&#\d+;|<!\[CDATA\[|\]\]>/)
      expect(r.body).not.toMatch(/\s{2,}/)
    }
    const byKey = new Map(rows.map((r) => [r.key, r]))
    expect(byKey.get('1492618')?.body).toContain('일부개정·발령합니다')
    expect(byKey.get('1492582')?.body).toContain('“관상동맥 전산화단층촬영 혈관조영술 영상을 이용한 관상동맥 내 압력측정술”')
    expect(byKey.get('1492584')?.body).toBe(
      '「의료기술재평가사업 운영지침」을 붙임과 같이 일부개정하여 안내하오니 업무에 참고하시기 바랍니다.',
    )
  })

  it('AC-7407.1: 주소는 link 그대로다(&amp;만 &로 읽음)', () => {
    expect(rows.map((r) => r.url)).toEqual(KEYS.map(viewUrl))
  })

  it('AC-7407.1: 종류는 고시 번호가 있으면 gosi, 없으면(훈령·예규·공고·안내) notice다', () => {
    for (const r of rows) expect([r.key, r.kind]).toEqual([r.key, NOTICE_KEYS.includes(r.key) ? 'notice' : 'gosi'])
  })

  it('AC-7407.1: 고시 번호를 찾는 글은 제목 + 설명 앞 200자다', () => {
    for (const r of rows) expect(r.numberText).toBe(`${r.title}\n${(r.body ?? '').slice(0, 200)}`)
    const long = rows.find((r) => r.key === '1492582')
    expect(long?.body?.length).toBeGreaterThan(200)
    expect(long?.numberText.length).toBe((long?.title.length ?? 0) + 1 + 200)
  })

  it('AC-7407.1: author(담당자 이름)는 담지 않는다', () => {
    const [row] = parseMohwRss(rss(ok({ author: '가짜담당자' })))
    expect(Object.keys(row).sort()).toEqual(FIELDS)
    expect(JSON.stringify(row)).not.toContain('가짜담당자')
  })
})

describe('AC-7407.1 parseMohwRss — 한 줄씩', () => {
  it('AC-7407.1: 한국 날짜 — GMT 15시 넘으면 다음 날, +0900·KST는 그 날', () => {
    const rows = parseMohwRss(
      rss(
        ok({ link: link('1'), pubDate: 'Thu, 19 Nov 2026 14:59:59 GMT' }),
        ok({ link: link('2'), pubDate: 'Thu, 19 Nov 2026 15:00:00 GMT' }),
        ok({ link: link('3'), pubDate: 'Thu, 31 Dec 2026 16:30:00 GMT' }),
        ok({ link: link('4'), pubDate: 'Fri, 20 Nov 2026 00:30:00 +0900' }),
        ok({ link: link('5'), pubDate: 'Thu, 19 Nov 2026 23:59:59 KST' }),
        ok({ link: link('6'), pubDate: '1 Dec 2026 09:00 UTC' }),
        ok({ link: link('7'), pubDate: '  Mon, 26 Oct 2026 00:59:00 GMT  ' }),
      ),
    )
    expect(rows.map((r) => [r.key, r.postedOn])).toEqual([
      ['1', '2026-11-19'],
      ['2', '2026-11-20'],
      ['3', '2027-01-01'],
      ['4', '2026-11-20'],
      ['5', '2026-11-19'],
      ['6', '2026-12-01'],
      ['7', '2026-10-26'],
    ])
  })

  it('AC-7407.1: 종류 — 다른 기관 고시·공고·훈령은 notice, 번호가 설명 앞 200자 밖이면 notice', () => {
    const rows = parseMohwRss(
      rss(
        ok({ link: link('1'), title: '[제2026-235호] 인증현황 고시 일부개정', description: '보건복지부 고시 제2026-235호 내용' }),
        ok({ link: link('2'), title: '알림', description: '질병관리청 고시 제2025-5호 내용' }),
        ok({ link: link('3'), title: '알림', description: '⊙보건복지부공고 제2026-817호 「아동수당 신청 제출서류 등에 관한 고시」를 개정함에 앞서' }),
        ok({ link: link('4'), title: '알림', description: '보건복지부 훈령 제309호 내용' }),
        ok({ link: link('5'), title: '알림', description: `${'가'.repeat(200)} 보건복지부 고시 제2026-1호` }),
        ok({ link: link('6'), title: '「요양급여」 고시 제 2026 - 0236 호 안내', description: '' }),
      ),
    )
    expect(rows.map((r) => [r.key, r.kind])).toEqual([
      ['1', 'gosi'],
      ['2', 'notice'],
      ['3', 'notice'],
      ['4', 'notice'],
      ['5', 'notice'],
      ['6', 'gosi'],
    ])
  })

  // 통계청 고시 '한국표준질병·사인분류'(design 7절, 2026-11-21 더함)
  it('AC-7407.1: 종류 — 통계청 고시 번호만 있으면 notice, 뒤에 복지부 고시 번호가 있으면 gosi다', () => {
    const rows = parseMohwRss(
      rss(
        ok({ link: link('1'), title: '알림', description: '통계청 고시 제2025-1호 「한국표준질병·사인분류」' }),
        ok({ link: link('2'), title: '「한국표준질병·사인분류」(통계청 고시 제2025-1호) 안내', description: '' }),
        ok({ link: link('3'), title: '알림', description: '통계청 고시 제2025-1호 및 보건복지부 고시 제2026-218호' }),
      ),
    )
    expect(rows.map((r) => [r.key, r.kind])).toEqual([
      ['1', 'notice'],
      ['2', 'notice'],
      ['3', 'gosi'],
    ])
  })

  it('AC-7407.1: 고시 번호 판정은 noticeNo.ts 한 곳 것을 불러 쓴다(사본 식·기관 목록을 두지 않는다)', () => {
    const source = readFileSync(fileURLToPath(new URL('./mohwRss.ts', import.meta.url)), 'utf8')
    expect(source).toMatch(/^import \{ noticeNo \} from '\.\.\/noticeNo'$/m)
    expect(source).not.toMatch(/OTHER_AGENCY|hasGosiNo|GOSI_NO|질병관리청/)
  })

  it('AC-7407.1: 설명이 비거나 없어도 본문은 빈 글자(null 아님) — 글 쪽(board.es)을 읽으러 가지 않는다', () => {
    const rows = parseMohwRss(rss(ok({ link: link('1'), description: '' }), ok({ link: link('2'), description: undefined })))
    expect(rows.map((r) => [r.key, r.body, r.numberText])).toEqual([
      ['1', '', '「가짜 고시」 일부개정'],
      ['2', '', '「가짜 고시」 일부개정'],
    ])
  })

  it('AC-7407.1: CDATA가 아닌 칸은 XML 실체를 풀고, 설명 안 HTML 태그는 글자로 바꾼다', () => {
    const [row] = parseMohwRss(
      rss({
        raw: [
          '<item>',
          '<title>약제 &amp; 치료재료 &lt;안내&gt; 고시&middot;공고</title>',
          `<link>${link('77')}</link>`,
          '<description>&lt;p&gt;첫 줄&lt;/p&gt;&lt;p&gt;둘째&amp;nbsp;줄&lt;/p&gt;</description>',
          '<pubDate>Fri, 20 Nov 2026 01:00:00 GMT</pubDate>',
          '</item>',
        ].join('\n'),
      }),
    )
    expect(row.title).toBe('약제 & 치료재료 <안내> 고시·공고')
    expect(row.body).toBe('첫 줄\n둘째 줄')
    expect(row.url).toBe(viewUrl('77'))
  })

  it('AC-7407.1: CDATA 안의 </item>·<title> 글은 줄을 나누지 않는다', () => {
    const rows = parseMohwRss(rss(ok({ link: link('1'), description: '앞 </item><item><title>가짜</title> 뒤' }), ok({ link: link('2') })))
    expect(rows.map((r) => r.key)).toEqual(['1', '2'])
    expect(rows[0].title).toBe('「가짜 고시」 일부개정')
  })

  it('AC-7407.1: 제목은 300자까지 자르고, 같은 list_no가 두 번이면 앞 줄만 남긴다', () => {
    const rows = parseMohwRss(
      rss(ok({ link: link('1'), title: '가'.repeat(400) }), ok({ link: link('2'), title: '앞' }), ok({ link: link('2'), title: '뒤' })),
    )
    expect(rows.map((r) => [r.key, r.title.length])).toEqual([
      ['1', 300],
      ['2', 1],
    ])
    expect(rows[1].title).toBe('앞')
  })

  it('AC-7407.1: list_no·제목·날짜가 없거나 주소가 복지부 https가 아닌 item은 버린다', () => {
    const rows = parseMohwRss(
      rss(
        ok({ link: link('1') }),
        ok({ link: 'https://www.mohw.go.kr/board.es?mid=a10409020000&amp;bid=0026&amp;act=view' }),
        ok({ link: 'https://www.mohw.go.kr/board.es?list_no=abc' }),
        ok({ link: 'https://www.mohw.go.kr/board.es?list_no=3&amp;list_no=4' }),
        ok({ link: 'http://www.mohw.go.kr/board.es?list_no=5' }),
        ok({ link: 'https://evil.example/board.es?list_no=6' }),
        ok({ link: 'https://www.mohw.go.kr.evil.example/board.es?list_no=7' }),
        ok({ link: 'https://www.mohw.go.kr/board.es?list_no=8 "x"' }),
        ok({ link: `https://www.mohw.go.kr/board.es?list_no=9&amp;q=${'a'.repeat(500)}` }),
        ok({ link: undefined }),
        ok({ link: link('10'), title: '' }),
        ok({ link: link('11'), title: '<b> </b>' }),
        ok({ link: link('12'), title: undefined }),
        ok({ link: link('13'), pubDate: undefined }),
        ok({ link: link('14'), pubDate: '어제' }),
        ok({ link: link('15'), pubDate: 'Mon, 31 Feb 2026 01:00:00 GMT' }),
        ok({ link: link('16'), pubDate: 'Mon, 02 Nov 2026 25:00:00 GMT' }),
        ok({ link: link('17'), pubDate: '2026-11-20' }),
        ok({ link: `https://www.mohw.go.kr/board.es?list_no=${'1'.repeat(21)}` }),
        ok({ link: link('18') }),
      ),
    )
    expect(rows.map((r) => r.key)).toEqual(['1', '18'])
  })
})

describe('AC-7407.1 RSS 주소와 fetchSite(robots: RSS만 읽는다)', () => {
  it('AC-7407.1: MOHW_RSS_URL은 fetchSite가 부르는 길이고, 글 주소(link)는 fetchSite가 막는다', async () => {
    expect(MOHW_RSS_URL).toBe('https://www.mohw.go.kr/rss/board.es?mid=a10409020000&bid=0026')
    const fetchImpl = vi.fn<SiteFetch>(async () => new Response(fixture('mohw-rss.xml'), { status: 200 }))
    const site = createFetchSite({ fetchImpl })
    const got = await site({ url: MOHW_RSS_URL, kind: 'page' })
    expect(got.ok).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0][0]).toBe(MOHW_RSS_URL)
    if (!got.ok || !('text' in got)) throw new Error('글 답이 아님')
    const rows = parseMohwRss(got.text)
    expect(rows).toHaveLength(30)
    for (const r of rows) {
      expect(await site({ url: r.url, kind: 'page' })).toEqual({ ok: false, fail: 'blocked-url' })
      expect(await site({ url: r.url, kind: 'file' })).toEqual({ ok: false, fail: 'blocked-url' })
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('AC-7407.2 parseMohwRss — item 없음·XML 아님', () => {
  it('AC-7407.2: item이 없는 RSS는 빈 목록이다', () => {
    expect(parseMohwRss(fixture('mohw-rss-noitems.xml'))).toEqual([])
    expect(parseMohwRss(rss())).toEqual([])
  })

  it('AC-7407.2: XML(RSS)이 아닌 글은 빈 목록이다', () => {
    const items = rss(ok()).replace(/^[\s\S]*?<channel>/, '').replace(/<\/channel>[\s\S]*$/, '')
    for (const text of [
      '',
      '   ',
      '점검 중입니다',
      '{"items":[{"title":"가짜"}]}',
      '<!DOCTYPE html><html><body>잠시 후 다시 시도해 주세요</body></html>',
      `<!DOCTYPE html><html><body>${items}</body></html>`,
      `<?xml version="1.0"?><feed>${items}</feed>`,
    ]) {
      expect(parseMohwRss(text)).toEqual([])
    }
  })

  it('AC-7407.2: 주석 안의 item은 읽지 않는다', () => {
    const text = rss(ok({ link: link('1') })).replace('<item>', `<!-- ${itemXml(ok({ link: link('9') }))} -->\n<item>`)
    expect(parseMohwRss(text).map((r) => r.key)).toEqual(['1'])
  })
})
