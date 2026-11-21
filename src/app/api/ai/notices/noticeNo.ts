import 'server-only'

import type { Attachment, GroupPost, GroupRow, ListItem, NoticeSource, PostDetail, PostRow } from '@/types/notices'
import { cutText } from './text'

// 복지부 고시 번호 · 묶음 열쇠 · 묶기(specs/notices REQ-7409, design 7절). 순수 함수만 둔다.
// 복지부 고시만 묶고 맞춘다 — 공고·훈령과 다른 기관 고시는 기관마다 번호가 겹친다

// design 7절 식 그대로(sources/hiraNotice.ts의 hasGosiNo와 같은 식·같은 기관 목록·같은 15자 창)
const GOSI_NO = /(?:^|[^가-힣])(?:보건복지부\s*)?고시\s*제?\s*(\d{4})\s*-\s*(\d{1,4})\s*호/g
const OTHER_AGENCY = /질병관리청|식품의약품안전처|식약처|국토교통부|고용노동부|행정안전부|교육부/
// 고시 번호 바로 뒤에 이어 적은 번호: '·제2026-135호', '(현재 적용)·제2024-184호'. 괄호 안 '구 제…호'(옛 번호)는 잇지 않는다
const CHAIN = /^\s*(?:\([^()]*\)\s*)?(?:[·ㆍ・,]|및)\s*제\s*(\d{4})\s*-\s*(\d{1,4})\s*호/

const noOf = (year: string, num: string) => `${year}-${Number.parseInt(num, 10)}`

// 다른 기관 고시를 뺀 복지부 고시 번호 맞춤들(글 차례)
function* mohwMatches(text: string): Generator<RegExpExecArray> {
  for (const m of text.matchAll(GOSI_NO)) {
    const at = m.index + m[0].indexOf('고시')
    if (OTHER_AGENCY.test(text.slice(Math.max(0, at - 15), at))) continue
    yield m
  }
}

/**
 * 글 안 첫 복지부 고시 번호 '<연도>-<숫자, 앞 0 뗌>'. 없으면 null.
 * '고시' 앞 15자에 다른 기관 이름이 있는 맞춤은 버리고 다음 것을 본다
 */
export function noticeNo(text: string): string | null {
  for (const m of mohwMatches(text)) return noOf(m[1], m[2])
  return null
}

/** 글 안 복지부 고시 번호 모두(이어 적은 '·제…호'까지, 겹침 없이 글 차례). 규칙 근거 글을 읽을 때 쓴다 */
export function noticeNos(text: string): string[] {
  const out = new Set<string>()
  for (const m of mohwMatches(text)) {
    out.add(noOf(m[1], m[2]))
    let end = m.index + m[0].length
    for (let c = CHAIN.exec(text.slice(end)); c; c = CHAIN.exec(text.slice(end))) {
      out.add(noOf(c[1], c[2]))
      end += c[0].length
    }
  }
  return [...out]
}

// ── 묶음 열쇠 ────────────────────────────────────────────

const KEY_MAX = 200 // notices.group_key 3~200자

/** 묶음 열쇠: 복지부 고시 번호가 있으면 gosi:<번호>, 번호 없는 심사기준 줄은 crtr:<탭>:<날짜>:<관련근거 글>, 그 밖은 post:<출처>:<key> */
export function groupKeyOf(item: ListItem): string {
  const no = noticeNo(item.numberText)
  if (no) return `gosi:${no}`
  if (item.source === 'hira_crtr') {
    const head = `crtr:${item.tab ?? ''}:${item.postedOn}:`
    const ref = (item.ref ?? '').replace(/\s+/g, ' ').trim()
    return head + cutText(ref, KEY_MAX - head.length)
  }
  return cutText(`post:${item.source}:${item.key}`, KEY_MAX)
}

// ── 묶기 ────────────────────────────────────────────────

const TITLE_MAX = 300 // notices.title·notice_posts.title 1~300자
const BODY_MAX = 20_000 // notices.body
const ATTACH_MAX = 10 // notice_posts.attachments
const ATTACH_NAME_MAX = 200
// 제목을 주는 차례: 보건복지부 → 심평원 공지 → 심평원 심사기준
const RANK: Record<NoticeSource, number> = { mohw_rss: 0, hira_notice: 1, hira_crtr: 2 }

export type MergeResult = { group: GroupRow; post: PostRow }

const copyPost = (p: GroupPost): GroupPost => ({ ...p, attachments: p.attachments.map((a) => ({ ...a })) })

function section(title: string, body: string): string {
  const text = body.trim()
  return text ? `[${title}]\n${text}` : `[${title}]`
}

// 제목을 준 글(가장 앞선 출처의 첫 글)과 묶음 제목. 심사기준 글만 둘 이상이면 '<첫 줄 제목> 외 N건'
function leadOf(posts: GroupPost[]): { lead: GroupPost; title: string } {
  let lead = posts[0]
  for (const p of posts) if (RANK[p.source] < RANK[lead.source]) lead = p
  if (lead.source === 'hira_crtr' && posts.length > 1) {
    const tail = ` 외 ${posts.length - 1}건`
    return { lead, title: cutText(lead.title, TITLE_MAX - tail.length) + tail }
  }
  return { lead, title: cutText(lead.title, TITLE_MAX) }
}

/**
 * 있던 묶음(없으면 null)에 목록 줄 하나를 더한 새 묶음과 저장할 출처 글 줄. 받은 값은 고치지 않는다.
 * detail은 글·팝업을 읽은 본문과 붙임(복지부처럼 읽지 않는 출처는 null → 목록 줄 본문, 붙임 없음).
 * - 제목은 보건복지부 → 심평원 공지 → 심평원 심사기준 차례로 앞선 글의 것(심사기준만이면 '<첫 줄 제목> 외 N건'), 종류는 제목을 준 글의 것
 * - 날짜는 가장 이른 날, 본문은 글마다 '[제목]' 줄을 단 본문을 이어 20,000자까지(제목을 주는 출처가 새로 오면 그 글을 맨 앞에)
 * - 요약이 끝난(done) 묶음에 붙임 있는 글이 새로 붙고 tries < 3이면 wait로 돌린다
 * - 같은 글(출처·주소가 같은 글)이 이미 있으면 묶음은 그대로다
 */
export function mergeGroup(group: GroupRow | null, item: ListItem, detail: PostDetail | null): MergeResult {
  const attachments: Attachment[] = (detail?.attachments ?? [])
    .slice(0, ATTACH_MAX)
    .map((a) => ({ name: cutText(a.name, ATTACH_NAME_MAX), url: a.url }))
  const newPost: GroupPost = { source: item.source, title: cutText(item.title, TITLE_MAX), url: item.url, postedOn: item.postedOn, attachments }
  const post: PostRow = { ...copyPost(newPost), sourceKey: item.key }
  const sec = section(newPost.title, detail ? detail.body : (item.body ?? ''))

  if (!group) {
    return {
      group: {
        groupKey: groupKeyOf(item),
        title: newPost.title,
        kind: item.kind,
        postedOn: item.postedOn,
        noticeNo: noticeNo(item.numberText),
        body: cutText(sec, BODY_MAX),
        state: 'wait',
        tries: 0,
        posts: [newPost],
      },
      post,
    }
  }

  const oldPosts = group.posts.map(copyPost)
  if (oldPosts.some((p) => p.source === newPost.source && p.url === newPost.url)) {
    return { group: { ...group, posts: oldPosts }, post }
  }

  const posts = [...oldPosts, newPost]
  const { lead, title } = leadOf(posts)
  const leads = oldPosts.every((p) => RANK[newPost.source] < RANK[p.source])
  const body = !group.body ? sec : leads ? `${sec}\n\n${group.body}` : `${group.body}\n\n${sec}`
  const reopen = group.state === 'done' && attachments.length > 0 && group.tries < 3
  return {
    group: {
      ...group,
      title,
      kind: lead === newPost ? item.kind : group.kind,
      postedOn: item.postedOn < group.postedOn ? item.postedOn : group.postedOn,
      noticeNo: group.noticeNo ?? noticeNo(item.numberText),
      body: cutText(body, BODY_MAX),
      state: reopen ? 'wait' : group.state,
      posts,
    },
    post,
  }
}
