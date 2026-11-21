import { describe, expect, it } from 'vitest'
import type { GroupRow, ListItem, PostDetail } from '@/types/notices'
import { groupKeyOf, mergeGroup, noticeNo, noticeNos } from './noticeNo'

// 고시 번호 · 묶음 열쇠 · 묶기(specs/notices requirements REQ-7409, design 7절)

const item = (o: Partial<ListItem> & Pick<ListItem, 'source' | 'key'>): ListItem => ({
  title: '제목',
  url: `https://www.hira.or.kr/x?k=${o.key}`,
  postedOn: '2026-11-20',
  kind: 'notice',
  numberText: o.title ?? '제목',
  body: null,
  ...o,
})

// 같은 고시(제2026-234호)가 세 출처에 온 모양(조사 때 받은 쪽의 글 그대로)
const MOHW = item({
  source: 'mohw_rss',
  key: '1491900',
  title: '「요양급여의 적용기준 및 방법에 관한 세부사항」 일부개정고시',
  url: 'https://www.mohw.go.kr/board.es?mid=a10409020000&bid=0026&act=view&list_no=1491900',
  postedOn: '2026-11-12',
  kind: 'gosi',
  numberText: '「요양급여의 적용기준 및 방법에 관한 세부사항」 일부개정고시 보건복지부 고시 제2026-234호 「국민건강보험법」제41조제3항',
  body: '보건복지부 고시 제2026-234호 「국민건강보험법」제41조제3항 및 제4항에 의한 세부사항을 다음과 같이 개정·발령합니다.',
})
const NOTICE = item({
  source: 'hira_notice',
  key: '12345',
  title: '[행위] 고시 제2026-234호 「요양급여의 적용기준 및 방법에 관한 세부사항」 일부개정',
  url: 'https://www.hira.or.kr/bbsDummy.do?pgmid=HIRAA020002000100&brdScnBltNo=4&brdBltNo=12345',
  postedOn: '2026-11-11',
  kind: 'gosi',
  numberText: '[행위] 고시 제2026-234호 「요양급여의 적용기준 및 방법에 관한 세부사항」 일부개정',
})
const crtr = (n: number, o: Partial<ListItem> = {}): ListItem =>
  item({
    source: 'hira_crtr',
    key: `20261111-${n}-1`,
    title: `기준 항목 ${n}`,
    url: `https://www.hira.or.kr/rc/insu/insuadtcrtr/InsuAdtCrtrPopup.do?mtgHmeDd=20261111&sno=${n}&mtgMtrRegSno=1`,
    postedOn: '2026-11-13',
    kind: 'gosi',
    tab: '01',
    ref: '고시 제2026-234호(행위)',
    numberText: `고시 제2026-234호(행위) 기준 항목 ${n}`,
    ...o,
  })
const NOTICE_DETAIL: PostDetail = {
  body: '고시 개정 안내 본문',
  attachments: [{ name: '고시 전문.pdf', url: 'https://www.hira.or.kr/bbs/bbsCDownLoad.do?apndNo=1&apndBrdBltNo=12345&apndBrdTyNo=2&apndBltNo=157' }],
}
const crtrDetail = (n: number): PostDetail => ({ body: `팝업 본문 ${n}`, attachments: [] })

const deepFreeze = <T>(v: T): T => {
  if (v && typeof v === 'object') {
    for (const x of Object.values(v)) deepFreeze(x)
    Object.freeze(v)
  }
  return v
}

describe('AC-7409.1 noticeNo', () => {
  it('AC-7409.1: 복지부 고시 번호 꼴 넷은 연도-숫자(앞 0 뗌)다', () => {
    expect(noticeNo('[행위] 고시 제2026-234호 「요양급여의 적용기준 및 방법에 관한 세부사항」 일부개정')).toBe('2026-234')
    expect(noticeNo('고시 제2026-234호(행위)')).toBe('2026-234')
    expect(noticeNo('보건복지부고시 제2026-237호 「국민건강보험법」제49조')).toBe('2026-237')
    expect(noticeNo('보건복지부 고시 제 2026 - 0236 호 「국민건강보험법 시행령」')).toBe('2026-236')
  })

  it('AC-7409.1: 공고·다른 기관 고시·훈령은 null이다', () => {
    expect(noticeNo('공고 제2026-866호')).toBeNull()
    expect(noticeNo('[보건복지부 공고 제2026 - 866호]「복막투석 환자 재택관리 시범사업」 참여기관 제5차 공모')).toBeNull()
    expect(noticeNo('질병관리청 고시 제2025-5호')).toBeNull()
    expect(noticeNo('훈령 제309호')).toBeNull()
    expect(noticeNo('보건복지부 훈령 제309호 국민연금 기금운용관련 직원의 유가증권 보유 및 거래 제한에 관한 규정 일부개정')).toBeNull()
    expect(noticeNo('')).toBeNull()
  })

  it('AC-7409.1: 다른 기관 고시는 버리고 그다음 복지부 고시 번호를 본다', () => {
    expect(noticeNo('식품의약품안전처 고시 제2026-10호 및 보건복지부 고시 제2026-218호')).toBe('2026-218')
    expect(noticeNo('식약처 고시 제2026-10호 참고')).toBeNull()
  })

  it('AC-7409.1: 고시 앞이 한글이면(…개정고시·…관한 고시) 번호로 읽지 않는다', () => {
    expect(noticeNo('「약제 급여 목록 및 급여 상한금액표」일부개정고시(제2026-219호) 안내')).toBeNull()
    expect(noticeNo('「한약제제 급여목록 및 상한금액표」 일부개정(고시 제2026-229호) 안내')).toBe('2026-229')
  })

  it('AC-7409.1: 글 안 첫 복지부 고시 번호만 돌려준다(설명 뒤쪽의 옛 고시 번호가 아니다)', () => {
    expect(noticeNo('보건복지부 고시 제2026-223호 「청구방법」(보건복지부 고시 제2026-183호, 2026.8.31.)을 개정')).toBe('2026-223')
  })

  it('AC-7409.4 noticeNos: 이어 적은 번호(·제…호, 괄호 뒤 ·제…호)까지 모두 읽고, 공고·구 번호는 빼며 겹침은 하나다', () => {
    expect(noticeNos('보건복지부 고시 제2026-134호·제2026-135호·제2026-136호·제2026-137호')).toEqual([
      '2026-134',
      '2026-135',
      '2026-136',
      '2026-137',
    ])
    expect(noticeNos('보건복지부 고시 제2021-141호(현재 적용)·제2024-184호(집행정지)')).toEqual(['2021-141', '2024-184'])
    expect(noticeNos('보건복지부 고시 제2024-136호 + 심평원 공고 제2024-40호')).toEqual(['2024-136'])
    expect(noticeNos('보건복지부 고시 제2024-159호(구 제2015-99호)')).toEqual(['2024-159'])
    expect(noticeNos('보건복지부 보도자료 2024-04-29(고시 제2024-72호, 번호 확인 필요)')).toEqual(['2024-72'])
    expect(noticeNos('고시 제2026-1호, 고시 제2026-1호')).toEqual(['2026-1'])
    expect(noticeNos('질병관리청 고시 제2025-5호·제2025-6호')).toEqual([])
    expect(noticeNos('심평원 공고 제2025-210호')).toEqual([])
  })
})

describe('AC-7409.2 groupKeyOf', () => {
  it('AC-7409.2: 같은 고시가 세 출처에 오면 같은 열쇠 gosi:<번호>다', () => {
    expect(groupKeyOf(MOHW)).toBe('gosi:2026-234')
    expect(groupKeyOf(NOTICE)).toBe('gosi:2026-234')
    expect(groupKeyOf(crtr(1))).toBe('gosi:2026-234')
  })

  it('AC-7409.2: 번호 없는 심사기준 줄은 crtr:<탭>:<날짜>:<관련근거 글>이다', () => {
    const row = crtr(1, { tab: '09', postedOn: '2026-10-30', ref: '공고 제2026-120호(행위)', numberText: '공고 제2026-120호(행위) 기준 항목 1' })
    expect(groupKeyOf(row)).toBe('crtr:09:2026-10-30:공고 제2026-120호(행위)')
    // 공개사례 탭은 관련근거 칸이 비어 있다 → 같은 날 사례끼리 묶인다
    const empty = crtr(2, { tab: '10', postedOn: '2026-10-30', ref: '', numberText: ' 사례 2' })
    expect(groupKeyOf(empty)).toBe('crtr:10:2026-10-30:')
  })

  it('AC-7409.2: 관련근거 글의 빈칸은 하나로 줄이고 열쇠는 200자를 넘지 않는다', () => {
    const spaced = crtr(1, { tab: '02', ref: '  보험급여과-666호,\n  668호  ', numberText: '보험급여과-666호' })
    expect(groupKeyOf(spaced)).toBe('crtr:02:2026-11-13:보험급여과-666호, 668호')
    const long = crtr(1, { tab: '09', ref: '가'.repeat(400), numberText: '가' })
    const key = groupKeyOf(long)
    expect(key.length).toBe(200)
    expect(key.startsWith('crtr:09:2026-11-13:가')).toBe(true)
  })

  it('AC-7409.2: 그 밖은 post:<출처>:<key>다', () => {
    expect(groupKeyOf(item({ source: 'hira_notice', key: '12353', title: '「검체검사 위·수탁기관 계약 현황 신고」 안내 자료 게시' }))).toBe(
      'post:hira_notice:12353',
    )
    expect(groupKeyOf(item({ source: 'mohw_rss', key: '1491753', title: '보건복지부 인사관리규정 일부개정' }))).toBe('post:mohw_rss:1491753')
    // 다른 기관 고시 번호는 묶지 않는다
    expect(groupKeyOf(item({ source: 'hira_notice', key: '9', title: '질병관리청 고시 제2025-5호 안내' }))).toBe('post:hira_notice:9')
  })
})

describe('AC-7409.3 mergeGroup', () => {
  it('AC-7409.3: 없던 묶음은 새 글 하나로 만든다(wait·tries 0, 본문은 [제목] 줄 + 본문, 출처 글 줄도 함께)', () => {
    const { group, post } = mergeGroup(null, NOTICE, NOTICE_DETAIL)
    expect(group).toEqual({
      groupKey: 'gosi:2026-234',
      title: NOTICE.title,
      kind: 'gosi',
      postedOn: '2026-11-11',
      noticeNo: '2026-234',
      body: `[${NOTICE.title}]\n고시 개정 안내 본문`,
      state: 'wait',
      tries: 0,
      posts: [{ source: 'hira_notice', title: NOTICE.title, url: NOTICE.url, postedOn: '2026-11-11', attachments: NOTICE_DETAIL.attachments }],
    })
    expect(post).toEqual({ ...group.posts[0], sourceKey: '12345' })
  })

  it('AC-7409.3: 글 읽기가 없는 출처(detail null)는 목록 줄 본문을 쓰고 붙임은 없다', () => {
    const { group } = mergeGroup(null, MOHW, null)
    expect(group.body).toBe(`[${MOHW.title}]\n${MOHW.body}`)
    expect(group.posts[0].attachments).toEqual([])
    const bare = mergeGroup(null, item({ source: 'mohw_rss', key: '1', title: '훈령 개정' }), null).group
    expect(bare.body).toBe('[훈령 개정]')
  })

  it('AC-7409.3: 제목은 보건복지부 → 심평원 공지 → 심평원 심사기준 차례로 앞선 글의 것이고, 종류도 그 글의 것이다', () => {
    let g = mergeGroup(null, crtr(1), crtrDetail(1)).group
    expect(g.title).toBe('기준 항목 1')
    g = mergeGroup(g, NOTICE, NOTICE_DETAIL).group
    expect(g.title).toBe(NOTICE.title)
    g = mergeGroup(g, crtr(2), crtrDetail(2)).group
    expect(g.title).toBe(NOTICE.title)
    g = mergeGroup(g, MOHW, null).group
    expect(g.title).toBe(MOHW.title)
    expect(g.posts.map((p) => p.source)).toEqual(['hira_crtr', 'hira_notice', 'hira_crtr', 'mohw_rss'])

    // 종류: 제목을 준 글의 종류(공지가 notice로 왔으면 notice)
    const plainNotice = { ...NOTICE, key: '777', url: `${NOTICE.url}7`, kind: 'notice' as const }
    const k = mergeGroup(mergeGroup(null, crtr(1, { kind: 'interp' }), crtrDetail(1)).group, plainNotice, NOTICE_DETAIL).group
    expect(k.kind).toBe('notice')
    const kept = mergeGroup(mergeGroup(null, plainNotice, NOTICE_DETAIL).group, crtr(1, { kind: 'interp' }), crtrDetail(1)).group
    expect(kept.kind).toBe('notice')
  })

  it("AC-7409.3: 심사기준 글만이면 '<첫 줄 제목> 외 N건'이고 제목은 300자를 넘지 않는다", () => {
    let g = mergeGroup(null, crtr(1), crtrDetail(1)).group
    g = mergeGroup(g, crtr(2), crtrDetail(2)).group
    expect(g.title).toBe('기준 항목 1 외 1건')
    g = mergeGroup(g, crtr(3), crtrDetail(3)).group
    expect(g.title).toBe('기준 항목 1 외 2건')
    expect(g.kind).toBe('gosi')

    const longTitle = '나'.repeat(300)
    const a = mergeGroup(null, crtr(1, { title: longTitle }), crtrDetail(1)).group
    expect(a.title).toBe(longTitle)
    const b = mergeGroup(a, crtr(2), crtrDetail(2)).group
    expect(b.title.length).toBe(300)
    expect(b.title.endsWith(' 외 1건')).toBe(true)
  })

  it('AC-7409.3: 날짜는 가장 이른 날, 고시 번호·열쇠·id는 있던 묶음 것을 둔다', () => {
    const first = { ...mergeGroup(null, MOHW, null).group, id: '0b7f6f40-3b0a-4c4e-9d55-5a4f0f6f2b11' }
    const g = mergeGroup(first, NOTICE, NOTICE_DETAIL).group
    expect(g.postedOn).toBe('2026-11-11')
    expect(g.id).toBe(first.id)
    expect(g.groupKey).toBe('gosi:2026-234')
    expect(g.noticeNo).toBe('2026-234')
    expect(mergeGroup(g, crtr(1), crtrDetail(1)).group.postedOn).toBe('2026-11-11')
  })

  it('AC-7409.3: 본문은 글마다 [제목]을 단 본문을 이은 것이고 합은 20,000자에서 자른다', () => {
    let g = mergeGroup(null, crtr(1), crtrDetail(1)).group
    g = mergeGroup(g, crtr(2), crtrDetail(2)).group
    expect(g.body).toBe('[기준 항목 1]\n팝업 본문 1\n\n[기준 항목 2]\n팝업 본문 2')
    // 제목 차례가 가장 앞선 출처의 글이 새로 오면 그 본문을 맨 앞에 둔다(잘려도 대표 글 본문이 남게)
    g = mergeGroup(g, MOHW, null).group
    expect(g.body.startsWith(`[${MOHW.title}]\n${MOHW.body}\n\n[기준 항목 1]`)).toBe(true)

    const big = mergeGroup(null, crtr(1), { body: '다'.repeat(19_990), attachments: [] }).group
    const cut = mergeGroup(big, crtr(2), { body: '라'.repeat(100), attachments: [] }).group
    expect(cut.body.length).toBe(20_000)
    expect(cut.body.startsWith('[기준 항목 1]\n다')).toBe(true)
    expect(cut.posts).toHaveLength(2)
  })

  it('AC-7409.3: 요약이 끝난 묶음에 붙임 있는 글이 새로 붙고 tries < 3이면 wait로 돌린다', () => {
    const done: GroupRow = { ...mergeGroup(null, MOHW, null).group, state: 'done', tries: 2 }
    const back = mergeGroup(done, NOTICE, NOTICE_DETAIL).group
    expect(back.state).toBe('wait')
    expect(back.tries).toBe(2)
    // 붙임 없는 글이 붙으면 그대로 done
    expect(mergeGroup(done, crtr(1), crtrDetail(1)).group.state).toBe('done')
    // tries가 3이면 그대로
    expect(mergeGroup({ ...done, tries: 3 }, NOTICE, NOTICE_DETAIL).group.state).toBe('done')
    // 요약 전·일괄 중·실패 묶음은 상태를 바꾸지 않는다
    for (const state of ['wait', 'batch', 'failed'] as const) {
      expect(mergeGroup({ ...done, state }, NOTICE, NOTICE_DETAIL).group.state).toBe(state)
    }
  })

  it('AC-7409.3: 같은 글을 두 번 넣어도 결과가 같고, 있던 묶음은 바꾸지 않는다', () => {
    const once = mergeGroup(null, NOTICE, NOTICE_DETAIL)
    const frozen = deepFreeze(structuredClone(once.group))
    const twice = mergeGroup(frozen, NOTICE, NOTICE_DETAIL)
    expect(twice.group).toEqual(once.group)
    expect(twice.post).toEqual(once.post)

    const two = mergeGroup(deepFreeze(mergeGroup(null, crtr(1), crtrDetail(1)).group), crtr(2), crtrDetail(2)).group
    const again = mergeGroup(deepFreeze(structuredClone(two)), crtr(2), crtrDetail(2)).group
    expect(again).toEqual(two)
    const done = deepFreeze({ ...two, state: 'done' as const })
    expect(mergeGroup(done, crtr(1), { body: '다른 본문', attachments: NOTICE_DETAIL.attachments }).group).toEqual(done)
  })

  it('AC-7409.3: 출처 글 줄은 제목 300자·붙임 10개까지만 담는다', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ name: `붙임${i}.pdf`, url: `https://www.hira.or.kr/bbs/bbsCDownLoad.do?apndNo=${i}` }))
    const { group, post } = mergeGroup(null, { ...NOTICE, title: '마'.repeat(320) }, { body: '본문', attachments: many })
    expect(post.title.length).toBe(300)
    expect(post.attachments).toHaveLength(10)
    expect(group.title.length).toBe(300)
  })
})
