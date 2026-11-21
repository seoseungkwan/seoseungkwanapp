import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { hiraNoticeListUrl, parseHiraNoticeList, parseHiraNoticeView } from './hiraNotice'

// 심평원 공지 목록·글 읽기(specs/notices requirements REQ-7405, design 5절).
// 견본은 조사 때 받은 쪽에서 표·본문만 잘라 둔 것(fixtures/notices/hira-notice-*, 전화는 지움)
const fixture = (name: string) => readFileSync(new URL(`../../../../../../fixtures/notices/${name}`, import.meta.url), 'utf8')
const LIST = fixture('hira-notice-list.html')
const NO_TABLE = fixture('hira-notice-list-no-table.html')
const VIEW = fixture('hira-notice-view.html')

const VIEW_URL = 'https://www.hira.or.kr/bbsDummy.do?pgmid=HIRAA020002000100&brdScnBltNo=4&brdBltNo='
const DOWN = 'https://www.hira.or.kr/bbs/bbsCDownLoad.do?'

// 목록 줄 하나(사이트 모양 그대로: 번호·제목·부서·날짜·조회수·첨부 칸)
const row = (o: { num?: string; title?: string; href?: string; date?: string; extra?: string }) =>
  `<tr><td class="col-num">${o.num ?? '1'}</td>` +
  `<td  class="col-tit"><a href="${o.href ?? '?pgmid=HIRAA020002000100&brdScnBltNo=4&brdBltNo=100&amp;pageIndex=1'}">${o.title ?? '제목'}</a>${o.extra ?? ''}</td>` +
  `<td class="col-depart">기준운영부</td><td class="col-date">${o.date ?? '2026-11-20'}</td>` +
  `<td class="col-views">10</td><td class="col-file"><i class="icon-file-pdf" title="pdf"></i></td></tr>`
const table = (...rows: string[]) => `<div class="tb-type01"><table><tbody>${rows.join('')}</tbody></table></div>`
const href = (key: string) => `?pgmid=HIRAA020002000100&brdScnBltNo=4&brdBltNo=${key}&amp;pageIndex=1&amp;pageIndex2=1`

describe('AC-7405.1 parseHiraNoticeList', () => {
  it('AC-7405.1: 목록 견본은 10줄이고 줄마다 key·제목·날짜·글 주소·종류·찾는 글이다', () => {
    const items = parseHiraNoticeList(LIST)
    expect(items).toHaveLength(10)
    expect(items[0]).toEqual({
      source: 'hira_notice',
      key: '12353',
      title: '「검체검사 위·수탁기관 계약 현황 신고」 안내 자료 게시',
      url: `${VIEW_URL}12353`,
      postedOn: '2026-11-20',
      kind: 'notice',
      numberText: '「검체검사 위·수탁기관 계약 현황 신고」 안내 자료 게시',
      body: null,
    })
    expect(items.map((i) => i.key)).toEqual(['12353', '12352', '12351', '12350', '12349', '12348', '12347', '12346', '12345', '12344'])
    expect(items.map((i) => i.postedOn)).toEqual([
      '2026-11-20',
      '2026-11-20',
      '2026-11-18',
      '2026-11-17',
      '2026-11-17',
      '2026-11-16',
      '2026-11-12',
      '2026-11-12',
      '2026-11-11',
      '2026-11-11',
    ])
    for (const i of items) {
      expect(i.url).toBe(`${VIEW_URL}${i.key}`)
      expect(i.numberText).toBe(i.title)
      expect(i.body).toBeNull()
      expect(i).not.toHaveProperty('tab')
      expect(i).not.toHaveProperty('ref')
    }
  })

  it("AC-7405.1: 제목에 '새글' 표시는 빼고(링크 밖·안 모두), 실체는 풀어 한 줄로 둔다", () => {
    const items = parseHiraNoticeList(LIST)
    expect(items.slice(0, 6).every((i) => !i.title.includes('새글'))).toBe(true)
    expect(items[1].title).toBe('2026년 보건의료 빅데이터 미래포럼 개최 안내')

    const inside = parseHiraNoticeList(
      table(row({ title: '약제&nbsp;안내 <i class="icon-new">새글</i>', href: href('7') }), row({ title: '첫 줄<br>둘째 줄', href: href('8') })),
    )
    expect(inside.map((i) => i.title)).toEqual(['약제 안내', '첫 줄 둘째 줄'])
  })

  it('AC-7405.1: 제목에 복지부 고시 번호가 있으면 gosi, 공고·행정해석·번호 없는 글은 notice다', () => {
    const items = parseHiraNoticeList(LIST)
    const kindOf = (key: string) => items.find((i) => i.key === key)?.kind
    expect(kindOf('12345')).toBe('gosi') // [행위] 고시 제2026-234호 「…」 일부개정
    expect(kindOf('12344')).toBe('gosi') // [행위] 고시 제2026-233호
    expect(kindOf('12346')).toBe('notice') // [보건복지부 공고 제2026 - 866호]
    expect(kindOf('12347')).toBe('notice') // [행정해석] …
    expect(items.filter((i) => i.kind === 'gosi')).toHaveLength(2)

    const titles = [
      '보건복지부고시 제2026-237호 「요양급여비용」 개정',
      '「약제 급여 목록」 고시 제 2026 - 0236 호 일부개정',
      '고시 제2026-234호(행위) 안내',
      '질병관리청 고시 제2025-5호 안내',
      '훈령 제309호 개정',
      '[보건복지부 공고 제2026-866호] 공모',
      '「요양급여 기준」 고시 개정 안내',
    ]
    const kinds = parseHiraNoticeList(table(...titles.map((t, n) => row({ title: t, href: href(String(n + 1)) })))).map((i) => i.kind)
    expect(kinds).toEqual(['gosi', 'gosi', 'gosi', 'notice', 'notice', 'notice', 'notice'])
  })

  // 통계청 고시 '한국표준질병·사인분류'가 심평원 공지에 자주 붙는다(design 7절, 2026-11-21 더함)
  it('AC-7405.1: 통계청 고시 번호만 있는 제목은 복지부 고시가 아니어서 notice이고, 뒤에 복지부 고시가 있으면 gosi다', () => {
    const titles = [
      '통계청 고시 제2025-1호 「한국표준질병·사인분류」 개정 안내',
      '「한국표준질병·사인분류」(통계청 고시 제2025-1호) 적용 안내',
      '통계청 고시 제2025-1호 및 보건복지부 고시 제2026-218호 안내',
    ]
    const kinds = parseHiraNoticeList(table(...titles.map((t, n) => row({ title: t, href: href(String(n + 1)) })))).map((i) => i.kind)
    expect(kinds).toEqual(['notice', 'notice', 'gosi'])
  })

  it('AC-7405.1: 고시 번호 판정은 noticeNo.ts 한 곳 것을 불러 쓴다(사본 식·기관 목록을 두지 않는다)', () => {
    const source = readFileSync(new URL('./hiraNotice.ts', import.meta.url), 'utf8')
    expect(source).toMatch(/^import \{ noticeNo \} from '\.\.\/noticeNo'$/m)
    expect(source).not.toMatch(/OTHER_AGENCY|hasGosiNo|GOSI_NO|질병관리청/)
  })

  it('AC-7405.1: 날짜는 YYYY-MM-DD로 맞추고, 같은 key 줄은 한 번만, 제목은 300자까지다', () => {
    const items = parseHiraNoticeList(
      table(
        row({ href: href('1'), date: '2026.11.05' }),
        row({ href: href('2'), date: ' 2026-11-06 ' }),
        row({ href: href('2'), date: '2026-11-06' }),
        row({ href: href('3'), title: '가'.repeat(400) }),
      ),
    )
    expect(items.map((i) => [i.key, i.postedOn])).toEqual([
      ['1', '2026-11-05'],
      ['2', '2026-11-06'],
      ['3', '2026-11-20'],
    ])
    expect(items[2].title).toHaveLength(300)
  })

  it('AC-7405.1: 목록 쪽 주소는 정해 둔 목록 길에 쪽 번호만 붙인다', () => {
    expect(hiraNoticeListUrl(1)).toBe('https://www.hira.or.kr/bbsDummy.do?pgmid=HIRAA020002000100&pageIndex=1')
    expect(hiraNoticeListUrl(3)).toBe('https://www.hira.or.kr/bbsDummy.do?pgmid=HIRAA020002000100&pageIndex=3')
    expect(hiraNoticeListUrl(0)).toBe('https://www.hira.or.kr/bbsDummy.do?pgmid=HIRAA020002000100&pageIndex=1')
    expect(hiraNoticeListUrl(2.7)).toBe('https://www.hira.or.kr/bbsDummy.do?pgmid=HIRAA020002000100&pageIndex=2')
  })
})

describe('AC-7405.2 parseHiraNoticeView', () => {
  it('AC-7405.2: 글 견본은 붙임 3개(이름·내려받기 주소)다', () => {
    const { attachments } = parseHiraNoticeView(VIEW)
    expect(attachments).toEqual([
      {
        name: '「검체검사 위·수탁기관 계약 현황 신고」 안내문',
        url: `${DOWN}apndNo=1&apndBrdBltNo=12353&apndBrdTyNo=2&apndBltNo=157`,
      },
      {
        name: '[붙임1] 「검체검사 위수탁기관 계약 현황 신고」 사용자 매뉴얼',
        url: `${DOWN}apndNo=2&apndBrdBltNo=12353&apndBrdTyNo=2&apndBltNo=157`,
      },
      {
        name: '[붙임2] 「검체검사 위수탁기관 계약 현황 신고」 관련 질의응답',
        url: `${DOWN}apndNo=3&apndBrdBltNo=12353&apndBrdTyNo=2&apndBltNo=157`,
      },
    ])
  })

  it('AC-7405.2: 본문은 .view 안 글자만(태그·스타일·주석 없음)이고 제목·붙임 칸·이전글은 담지 않는다', () => {
    const { body } = parseHiraNoticeView(VIEW)
    expect(body).toBe(
      [
        '1. 「검체검사 위탁에 관한 기준」 행정예고(보건복지부 공고 제2026-870호, 2026.11.16.) 관련 「검체검사 위·수탁기관 계약 현황 신고」 자료를 게시하오니, 관련 업무에 참고하시기 바랍니다.',
        '2. 「검체검사 위·수탁기관 계약 현황 신고」 안내',
        '○ (신고주체) 검체검사를 의뢰하는 요양기관(위탁기관)',
        '○ (신고기간) 2026. 11. 23.(월)~2026. 12. 18.(금)',
        '※ 신고기간 이후에도 상시 신고 가능하나, 2027년 1월 청구를 위해서는 2026년 12월 31일 이전 신고를 완료해야 합니다.',
        '청구시점 전에 계약현황 신고가 되지않은 요양기관은 향후 요양급여비용 지급이 제한될 수 있음을 알려드립니다.',
        '○ (신고방법) 보건의료자원통합신고포털의 ‘검체검사 위·수탁기관 계약 현황 신고’ 메뉴에서 현황 신고',
        '○ (문의사항) 고객센터(T.0000-0000), 심사기준실 기준운영부(T.000-000-0000)',
      ].join('\n'),
    )
    for (const bad of ['<', '>', 'FONT-FAMILY', 'mso-', 'hwpjson', '숨은 글', '첨부파일 다운로드', '자료가 다운되지', '이전글', '스크랩', '447']) {
      expect(body).not.toContain(bad)
    }
  })

  it('AC-7405.2: 붙임 이름이 비면 차례 이름을 달고, 숫자가 아닌 값은 주소로 만들지 않으며, 10개까지·같은 주소는 한 번이다', () => {
    const li = (args: string, name = '파일') =>
      `<li><i class="icon-file-hwp"></i><span class="obj-sr-only">hwp</span>${name} <a href="#none" onclick="downLoadBbs(${args});" class="btn_file">첨부파일 다운로드</a></li>`
    const page = (lis: string[]) =>
      `<div class="viewCont"><div class="fileBox"><ul>${lis.join('')}</ul><ul><li>자료가 다운되지 않을 경우 담당부서로 연락주시기 바랍니다.</li></ul></div><div class="view"><p>본문</p></div></div>`

    const odd = parseHiraNoticeView(
      page([
        li(`&#39;1&#39;,&#39;9&#39;,&#39;2&#39;,&#39;5&#39;`, ''),
        li(`&quot;2&quot;, &quot;9&quot;, &quot;2&quot;, &quot;5&quot;`, '둘째 &amp; 붙임'),
        li(`'3','9;alert(1)','2','5'`),
        li(`'1','9','2','5'`, '같은 주소'),
      ]),
    )
    expect(odd).toEqual({
      body: '본문',
      attachments: [
        { name: '첨부파일 1', url: `${DOWN}apndNo=1&apndBrdBltNo=9&apndBrdTyNo=2&apndBltNo=5` },
        { name: '둘째 & 붙임', url: `${DOWN}apndNo=2&apndBrdBltNo=9&apndBrdTyNo=2&apndBltNo=5` },
      ],
    })

    const many = parseHiraNoticeView(page(Array.from({ length: 12 }, (_, n) => li(`'${n + 1}','9','2','5'`, `붙임${n + 1}`))))
    expect(many.attachments).toHaveLength(10)
    expect(many.attachments[9].name).toBe('붙임10')

    const long = parseHiraNoticeView(page([li(`'1','9','2','5'`, '나'.repeat(250))]))
    expect(long.attachments[0].name).toHaveLength(200)
  })
})

describe('AC-7405.1·AC-7405.2 만든 주소는 fetchSite 허용 길 모양이다', () => {
  // fetchSite(TASK-3)는 칸 이름을 정확히 이 모음만 받고(빠짐·더함 없음) 값은 모양이 맞아야 부른다
  const shapeOf = (u: string) => {
    const url = new URL(u)
    const params = [...url.searchParams.entries()]
    return {
      origin: `${url.protocol}//${url.host}`,
      path: url.pathname,
      names: params.map(([k]) => k).sort(),
      numbersOnly: params.filter(([k]) => k !== 'pgmid').every(([, v]) => /^\d{1,20}$/.test(v)),
      pgmid: url.searchParams.get('pgmid'),
      hash: url.hash,
    }
  }

  it('AC-7405.1: 목록 쪽 주소는 pgmid·pageIndex, 글 주소는 pgmid·brdScnBltNo·brdBltNo만 숫자로 담는다', () => {
    expect(shapeOf(hiraNoticeListUrl(5))).toEqual({
      origin: 'https://www.hira.or.kr',
      path: '/bbsDummy.do',
      names: ['pageIndex', 'pgmid'],
      numbersOnly: true,
      pgmid: 'HIRAA020002000100',
      hash: '',
    })
    for (const item of parseHiraNoticeList(LIST)) {
      expect(shapeOf(item.url)).toEqual({
        origin: 'https://www.hira.or.kr',
        path: '/bbsDummy.do',
        names: ['brdBltNo', 'brdScnBltNo', 'pgmid'],
        numbersOnly: true,
        pgmid: 'HIRAA020002000100',
        hash: '',
      })
    }
  })

  it('AC-7405.2: 붙임 주소는 bbs/bbsCDownLoad.do에 apndNo·apndBrdBltNo·apndBrdTyNo·apndBltNo만 숫자로 담는다', () => {
    const { attachments } = parseHiraNoticeView(VIEW)
    expect(attachments).toHaveLength(3)
    for (const a of attachments) {
      expect(shapeOf(a.url)).toEqual({
        origin: 'https://www.hira.or.kr',
        path: '/bbs/bbsCDownLoad.do',
        names: ['apndBltNo', 'apndBrdBltNo', 'apndBrdTyNo', 'apndNo'],
        numbersOnly: true,
        pgmid: null,
        hash: '',
      })
    }
  })
})

describe('AC-7405.3 틀린 모양', () => {
  it('AC-7405.3: 표가 없는 쪽·빈 글·HTML이 아닌 글은 빈 목록이다', () => {
    expect(parseHiraNoticeList(NO_TABLE)).toEqual([])
    expect(parseHiraNoticeList('')).toEqual([])
    expect(parseHiraNoticeList('{"error":"점검 중"}')).toEqual([])
    expect(parseHiraNoticeList('<html><body><p>서비스 점검 중입니다</p></body></html>')).toEqual([])
  })

  it('AC-7405.3: 제목·날짜·key가 빠진 줄은 버리고 나머지 줄만 남긴다', () => {
    const items = parseHiraNoticeList(
      table(
        row({ title: '남는 줄', href: href('1') }),
        row({ title: '', href: href('2') }),
        row({ title: '<i class="icon-new">새글</i>', href: href('3') }),
        row({ title: '날짜 없음', href: href('4'), date: '' }),
        row({ title: '틀린 날짜', href: href('5'), date: '2026-13-45' }),
        row({ title: 'key 없음', href: '?pgmid=HIRAA020002000100&brdScnBltNo=4&pageIndex=1' }),
        row({ title: '다른 key', href: '?pgmid=HIRAA020002000100&apndBrdBltNo=6' }),
        row({ title: '숫자 아닌 key', href: '?pgmid=HIRAA020002000100&brdBltNo=abc' }),
        '<tr><td class="col-num">9</td><td class="col-tit">링크 없는 제목</td><td class="col-date">2026-11-20</td></tr>',
        row({ title: '또 남는 줄', href: href('10') }),
      ),
    )
    expect(items.map((i) => [i.key, i.title])).toEqual([
      ['1', '남는 줄'],
      ['10', '또 남는 줄'],
    ])
  })

  it('AC-7405.3: 본문·붙임 칸이 없는 글 쪽은 빈 본문·빈 붙임이다', () => {
    expect(parseHiraNoticeView(NO_TABLE)).toEqual({ body: '', attachments: [] })
    expect(parseHiraNoticeView('')).toEqual({ body: '', attachments: [] })
  })
})
