import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { SiteRequest } from '@/types/notices'
import { createFetchSite } from '../fetchSite'
import { CRTR_LIST_URL, CRTR_TABS, crtrListBody, crtrListRequest, parseHiraCrtrList, parseHiraCrtrPopup } from './hiraCrtr'

// 심평원 보험인정기준(고시·행정해석·심사지침·공개사례 탭) 목록·팝업 읽기(specs/notices requirements REQ-7406, design 5절).
// 견본은 2026-11-21 받은 쪽(목록은 POST tabGbn=탭&pageIndex=1)에서 표·본문 부분만 잘라 둔 것(fixtures/notices/hira-crtr-*)
const fixture = (name: string) => readFileSync(new URL(`../../../../../../fixtures/notices/${name}`, import.meta.url), 'utf8')
const LIST_01 = fixture('hira-crtr-list-01.html')
const LIST_02 = fixture('hira-crtr-list-02.html')
const LIST_09 = fixture('hira-crtr-list-09.html')
const LIST_10 = fixture('hira-crtr-list-10.html')
const NO_TABLE = fixture('hira-crtr-list-no-table.html')
const POPUP = fixture('hira-crtr-popup.html')

const POPUP_URL = 'https://www.hira.or.kr/rc/insu/insuadtcrtr/InsuAdtCrtrPopup.do?'

// 목록 줄 하나(사이트 모양 그대로: 분류·관련근거·제목·첨부·작성일·조회수 칸)
const row = (o: { gubun?: string; ref?: string; call?: string; title?: string; date?: string }) =>
  `<tr><td class="col-gubun">${o.gubun ?? '고시'}</td><td class="col-num2">${o.ref ?? '고시 제2026-1호(행위)'}</td>` +
  `<td class="col-tit"><a href="#none" onclick="${o.call ?? "viewInsuAdtCrtr(1, '20261112', '1', '0004', '1')"}; return false;" title="제목  새창으로 열기">${o.title ?? '제목'}</a></td>` +
  `<td class="col-file"></td><td class="col-date">${o.date ?? '2026-11-12'}</td><td class="col-views">10</td></tr>`
const table = (...rows: string[]) => `<div class="tb-type01 type3"><table><tbody>${rows.join('')}</tbody></table></div>`

describe('AC-7406.1 parseHiraCrtrList', () => {
  it('AC-7406.1: 탭 01 견본은 10줄이고 줄마다 key·제목·관련근거·날짜·종류 gosi·팝업 주소다', () => {
    const items = parseHiraCrtrList(LIST_01, '01')
    expect(items).toHaveLength(10)
    expect(items[0]).toEqual({
      source: 'hira_crtr',
      key: '20261112-1-0004',
      title: '가10 격리실 입원료 급여기준(일반원칙)',
      url: `${POPUP_URL}mtgHmeDd=20261112&sno=1&mtgMtrRegSno=0004`,
      postedOn: '2026-11-12',
      kind: 'gosi',
      numberText: '고시 제2026-234호(행위) 가10 격리실 입원료 급여기준(일반원칙)',
      tab: '01',
      ref: '고시 제2026-234호(행위)',
      body: null,
    })
    expect(items.map((i) => i.key)).toEqual([
      '20261112-1-0004',
      '20261112-1-0007',
      '20261112-1-0008',
      '20261112-1-0011',
      '20261112-1-0012',
      '20261112-1-0006',
      '20261112-1-0002',
      '20261112-1-0003',
      '20261112-1-0001',
      '20261112-1-0010',
    ])
    expect(items.map((i) => i.url)).toEqual(items.map((i) => `${POPUP_URL}mtgHmeDd=20261112&sno=1&mtgMtrRegSno=${i.key.slice(-4)}`))
    expect(items[4].title).toBe(
      '누406 심장표지자 뇌성나트륨이뇨 펩타이드(Brain Natriuretic Peptide, BNP), Pro-Brain Natriuretic Peptide 검사의 급여기준',
    )
  })

  it('AC-7406.1: 고시 하나가 여러 줄로 오면 줄마다 같은 관련근거가 numberText 앞에 붙는다(고시 번호로 묶을 수 있게)', () => {
    const items = parseHiraCrtrList(LIST_01, '01')
    for (const item of items) {
      expect(item.kind).toBe('gosi')
      expect(item.tab).toBe('01')
      expect(item.ref).toBe('고시 제2026-234호(행위)')
      expect(item.postedOn).toBe('2026-11-12')
      expect(item.numberText).toBe(`고시 제2026-234호(행위) ${item.title}`)
    }
  })

  it('AC-7406.1: 탭 02 견본은 10줄이고 종류 interp, 관련근거·제목 글자는 그대로다', () => {
    const items = parseHiraCrtrList(LIST_02, '02')
    expect(items).toHaveLength(10)
    expect(items.every((i) => i.kind === 'interp' && i.tab === '02' && i.source === 'hira_crtr')).toBe(true)
    expect(items[2]).toEqual({
      source: 'hira_crtr',
      key: '20260701-6-0001',
      title: '(행정해석) 필수의료총괄과-2168호 「도수치료 관리급여 기준 관련 질의응답 안내」',
      url: `${POPUP_URL}mtgHmeDd=20260701&sno=6&mtgMtrRegSno=0001`,
      postedOn: '2026-07-01',
      kind: 'interp',
      numberText: '필수의료총괄과-2168호 (행정해석) 필수의료총괄과-2168호 「도수치료 관리급여 기준 관련 질의응답 안내」',
      tab: '02',
      ref: '필수의료총괄과-2168호',
      body: null,
    })
    // 실체가 아닌 &는 글자로 남는다
    expect(items[7].title).toBe('PTCA&PTA용 MICRO GUIDE WIRE의 허가범위 초과사용 급여기준 관련 질의응답 변경 안내')
    expect(items.map((i) => i.postedOn)).toEqual([
      '2026-11-12',
      '2026-07-13',
      '2026-07-01',
      '2026-02-23',
      '2026-02-06',
      '2026-02-02',
      '2026-01-01',
      '2025-12-30',
      '2025-11-11',
      '2025-11-07',
    ])
  })

  it('AC-7406.1: 탭 09 견본은 10줄이고 종류 guide, 제목·관련근거 앞뒤 빈칸은 뗀다', () => {
    const items = parseHiraCrtrList(LIST_09, '09')
    expect(items).toHaveLength(10)
    expect(items.every((i) => i.kind === 'guide' && i.tab === '09')).toBe(true)
    expect(items[3].key).toBe('20251230-1-0001')
    expect(items[3].title).toBe('「사전심사의 절차 등에 관한 세부사항」개정·공고 안내(건강보험심사평가원 공고 제2025-270호, 2025.12.29.)')
    expect(items[3].ref).toBe('「사전심사의 절차 등에 관한 세부사항」 (건강보험심사평가원 공고 제2025-270호, 2025.12.29.)')
    expect(items[9].key).toBe('20250801-1-0002')
  })

  it('AC-7406.1: 탭 10 견본은 10줄이고 종류 case, 관련근거가 비면 ref는 빈 글자·numberText는 제목만이다', () => {
    const items = parseHiraCrtrList(LIST_10, '10')
    expect(items).toHaveLength(10)
    expect(items.every((i) => i.kind === 'case' && i.tab === '10' && i.ref === '' && i.numberText === i.title)).toBe(true)
    expect(items[0]).toMatchObject({
      key: '20261120-1-0005',
      title: 'Burosumab 주사제(품명: 크리스비타주) 요양급여 대상여부(6사례)',
      url: `${POPUP_URL}mtgHmeDd=20261120&sno=1&mtgMtrRegSno=0005`,
      postedOn: '2026-11-20',
    })
  })

  it('AC-7406.1: 쪽이 말하는 탭(decIteTpCd)이 부른 탭과 다르면(GET처럼 탭이 무시된 답) 빈 목록이다', () => {
    // GET은 tabGbn을 무시하고 고시 탭을 돌려준다(2026-11-21 실측) → 고시 줄을 행정해석으로 잘못 넣지 않는다
    expect(parseHiraCrtrList(LIST_01, '02')).toEqual([])
    expect(parseHiraCrtrList(LIST_02, '01')).toEqual([])
    const declared = (tab: string) => `<form name="listForm"><input type="hidden" name="decIteTpCd" value="${tab}" /></form>`
    expect(parseHiraCrtrList(table(row({})) + declared('09'), '09')).toHaveLength(1)
    expect(parseHiraCrtrList(table(row({})) + declared('10'), '09')).toEqual([])
  })

  it('AC-7406.1: 만든 팝업 주소와 목록 부르기는 fetchSite의 정해 둔 길을 그대로 지나간다', async () => {
    const seen: { url: string; method?: string; body?: unknown }[] = []
    const fetchImpl = async (url: string, init: RequestInit) => {
      seen.push({ url, method: init.method, body: init.body })
      return new Response('<html></html>', { status: 200 })
    }
    const items = [LIST_01, LIST_02, LIST_09, LIST_10].flatMap((html, i) => parseHiraCrtrList(html, CRTR_TABS[i]))
    expect(items).toHaveLength(40)
    const requests: SiteRequest[] = [
      ...CRTR_TABS.map((tab) => crtrListRequest(tab, 3)),
      ...items.map((i): SiteRequest => ({ url: i.url, kind: 'page' })),
    ]
    for (const req of requests) {
      // 부르기마다 새 fetchSite(host 간격 300ms를 기다리지 않게)
      const result = await createFetchSite({ fetchImpl })(req)
      expect(result).toEqual({ ok: true, text: '<html></html>' })
    }
    expect(seen).toHaveLength(44)
    expect(seen.slice(0, 4)).toEqual(
      CRTR_TABS.map((tab) => ({ url: CRTR_LIST_URL, method: 'POST', body: `tabGbn=${tab}&pageIndex=3` })),
    )
    expect(seen.slice(4).map((s) => s.url)).toEqual(items.map((i) => i.url))
    expect(seen.slice(4).every((s) => s.method === 'GET' && s.body === undefined)).toBe(true)
  })
})

describe('AC-7406.2 parseHiraCrtrPopup', () => {
  it("AC-7406.2: 팝업 견본 본문은 '고시 신설/개정 전체내용'부터 '변경 전 고시' 글까지 담고 붙임은 빈 목록이다", () => {
    const detail = parseHiraCrtrPopup(POPUP)
    expect(detail.attachments).toEqual([])
    expect(detail.body.startsWith('■ 고시 신설/개정 전체내용\n')).toBe(true)
    expect(detail.body).toContain('■ 고시 신설/개정 고시번호(시행일자)\n제2026-234호(2026.11.12.)')
    expect(detail.body).toContain('■ 고시 신설/개정 사유\n의학적 타당성에 따른 문구 명확화')
    expect(detail.body).toContain('☞ 변경 전 고시 (고시 제2024-297호, 2025.1.1.시행)')
    // ruleMatch(design 7절)가 본문에서 바뀌는 고시 번호를 찾는 식에 그대로 걸린다
    expect(detail.body).toMatch(/변경\s*전\s*고시\s*\(\s*고시\s*제\s*\d{4}\s*-\s*\d+\s*호/)
    expect(detail.body.endsWith('4) 위 가4)에 해당하는 질환 중 코로나 바이러스감염증-19, 가.7)에 해당하는 질환은 보건복지부장관 또는 질병관리청장이 정하는 기간 동안')).toBe(
      true,
    )
  })

  it('AC-7406.2: 본문에는 태그·제목 칸·관련근거 칸·붙임 칸·단추 글이 없고 빈 줄도 없다', () => {
    const { body } = parseHiraCrtrPopup(POPUP)
    expect(body).not.toMatch(/<[A-Za-z/]/)
    expect(body).not.toContain('&nbsp;')
    expect(body).not.toContain('관련근거')
    expect(body).not.toContain('첨부파일 다운로드')
    expect(body).not.toContain('goDown1')
    expect(body).not.toContain('인쇄')
    expect(body).not.toContain('닫기')
    expect(body).not.toContain('document.title')
    expect(body.split('\n').every((line) => line.trim() === line && line !== '')).toBe(true)
  })

  it('AC-7406.2: .viewCont 안 .view 칸만 본문이고, 칸이 없으면 빈 본문·빈 붙임이다', () => {
    const page = (inner: string) => `<div class="view">밖 글</div><div class="viewCont mt05"><div class="title">제목</div>${inner}</div>`
    expect(parseHiraCrtrPopup(page('<div class="view">첫 줄<br /><br /><div class="x">안 칸</div>끝 &middot; 글</div>'))).toEqual({
      body: '첫 줄\n안 칸\n끝 · 글',
      attachments: [],
    })
    expect(parseHiraCrtrPopup(page('<div class="viewer">아님</div>'))).toEqual({ body: '', attachments: [] })
    expect(parseHiraCrtrPopup('')).toEqual({ body: '', attachments: [] })
    expect(parseHiraCrtrPopup('<html><body>오류가 발생했습니다</body></html>')).toEqual({ body: '', attachments: [] })
  })
})

describe('AC-7406.3 crtrListBody · 표 없는 쪽', () => {
  it('AC-7406.3: 탭과 쪽 → tabGbn=<탭>&pageIndex=<쪽>', () => {
    expect(crtrListBody('01', 1)).toBe('tabGbn=01&pageIndex=1')
    expect(crtrListBody('02', 7)).toBe('tabGbn=02&pageIndex=7')
    expect(crtrListBody('09', 25)).toBe('tabGbn=09&pageIndex=25')
    expect(crtrListBody('10', 462)).toBe('tabGbn=10&pageIndex=462')
  })

  it('AC-7406.3: 쪽 번호는 1 이상 정수로 맞춘다(0·음수·소수·NaN)', () => {
    expect(crtrListBody('01', 0)).toBe('tabGbn=01&pageIndex=1')
    expect(crtrListBody('01', -3)).toBe('tabGbn=01&pageIndex=1')
    expect(crtrListBody('01', 2.7)).toBe('tabGbn=01&pageIndex=2')
    expect(crtrListBody('01', Number.NaN)).toBe('tabGbn=01&pageIndex=1')
    expect(crtrListBody('01', Number.POSITIVE_INFINITY)).toBe('tabGbn=01&pageIndex=1')
  })

  it('AC-7406.3: 목록 부르기는 정해 둔 목록 주소에 POST · 몸통 crtrListBody · 글 쪽이다', () => {
    expect(CRTR_TABS).toEqual(['01', '02', '09', '10'])
    expect(CRTR_LIST_URL).toBe('https://www.hira.or.kr/rc/insu/insuadtcrtr/InsuAdtCrtrList.do?pgmid=HIRAA030069000410')
    expect(crtrListRequest('09', 2)).toEqual({ url: CRTR_LIST_URL, method: 'POST', form: 'tabGbn=09&pageIndex=2', kind: 'page' })
  })

  it('AC-7406.3: 표가 없는 쪽(견본 사본)·빈 글·HTML이 아닌 글은 빈 목록이다', () => {
    expect(parseHiraCrtrList(NO_TABLE, '01')).toEqual([])
    expect(parseHiraCrtrList('', '01')).toEqual([])
    expect(parseHiraCrtrList('{"error":"x"}', '02')).toEqual([])
    expect(parseHiraCrtrList(table('<tr><td colspan="6" class="nodata">검색된 결과가 없습니다.</td></tr>'), '10')).toEqual([])
  })

  it('AC-7406.3: 팝업 부르기 값·제목·날짜가 빠지거나 틀린 줄은 버리고, 같은 key는 한 번만 둔다', () => {
    const good = row({ call: "viewInsuAdtCrtr(2, '20261112', '1', '0007', '2')", title: '남는 줄' })
    const items = parseHiraCrtrList(
      table(
        row({ call: "viewInsuAdtCrtr(1, '20261112', '1')" }), // 값 셋이 안 됨
        row({ call: "viewInsuAdtCrtr(1, '2026-11-12', '1', '0004', '1')" }), // 숫자가 아님(정해 둔 길에 안 맞음)
        row({ call: "openSomething(1, '20261112', '1', '0004', '1')" }), // 다른 함수
        row({ title: '' }), // 제목 없음
        row({ date: '' }), // 날짜 없음
        row({ date: '2026-02-30' }), // 없는 날짜
        good,
        good, // 같은 key
      ),
      '01',
    )
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ key: '20261112-1-0007', title: '남는 줄', postedOn: '2026-11-12' })
  })

  it('AC-7406.3: 따옴표 실체·주석·<script> 안 글은 줄로 읽지 않고, 제목은 300자·관련근거 칸이 없으면 빈 글자다', () => {
    const quoted = row({ call: 'viewInsuAdtCrtr(3, &#39;20261113&#39;, &#39;2&#39;, &#39;0009&#39;, &#39;3&#39;)', title: '실체 따옴표' })
    const noRef =
      `<tr><td class="col-gubun">고시</td><td class="col-tit"><a href="#none" onclick="viewInsuAdtCrtr(4, '20261114', '1', '0001', '4')">${'가'.repeat(400)}</a></td>` +
      '<td class="col-date">2026-11-14</td></tr>'
    const hidden =
      `<!-- ${table(row({ call: "viewInsuAdtCrtr(9, '20260101', '9', '0009', '9')" }))} -->` +
      `<script>var s = '${table(row({ call: "viewInsuAdtCrtr(8, '20260101', '8', '0008', '8')" }))}'</script>`
    const items = parseHiraCrtrList(hidden + table(quoted, noRef), '01')
    expect(items.map((i) => i.key)).toEqual(['20261113-2-0009', '20261114-1-0001'])
    expect(items[0].url).toBe(`${POPUP_URL}mtgHmeDd=20261113&sno=2&mtgMtrRegSno=0009`)
    expect(items[1].title).toBe('가'.repeat(300))
    expect(items[1].ref).toBe('')
    expect(items[1].numberText).toBe('가'.repeat(300))
  })
})
