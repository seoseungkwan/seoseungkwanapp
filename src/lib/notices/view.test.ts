import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { GroupPost, NoticeSource, SourceRow } from '@/types/notices'
import {
  BOARD_URLS,
  CRTR_KIND_NAMES,
  SOURCES,
  SOURCE_NAMES,
  attachmentsOf,
  badgeLabel,
  badgeText,
  boardLinkText,
  bodyOnlyReason,
  checkedText,
  dateText,
  dateTimeText,
  dayText,
  dayWord,
  monthText,
  noFilesText,
  noticeNoText,
  numberSlot,
  readModeText,
  safeLink,
  sourceName,
  sourcesText,
  stoppedBody,
  stoppedTitle,
  timeText,
  weekPeriodText,
  whenText,
  ymdOf,
} from './view'

// 화면 글자 함수(specs/notices TASK-12). 글자는 시안 notes.md '화면 글자'와 requirements 기본값 그대로다.
// 시각은 DB가 주는 ISO 글자(UTC·+09:00 모두). 시험은 UTC로 줘서 한국 날짜·시각으로 바뀌는지 본다

const NOW = new Date('2026-11-21T00:20:00Z') // 한국 11월 21일 (토) 09:20 — 시안 위쪽 띠 시각

function post(source: NoticeSource, attachments: GroupPost['attachments'] = []): GroupPost {
  return { source, title: '제목', url: 'https://www.hira.or.kr/x', postedOn: '2026-11-20', attachments }
}

function row(source: NoticeSource, over: Partial<SourceRow> = {}): SourceRow {
  return {
    source,
    state: 'ok',
    errorCode: null,
    checkedAt: '2026-11-20T22:02:00Z',
    lastOkAt: '2026-11-20T22:02:00Z',
    stoppedSince: null,
    cursor: {},
    backfillDone: true,
    ...over,
  }
}

describe('출처 이름 · 글 번호 자리', () => {
  it('AC-7419.2: 출처 이름은 심평원 공지·심평원 심사기준·보건복지부이고 고르기 칩 차례도 그렇다', () => {
    expect(SOURCE_NAMES).toEqual({ hira_notice: '심평원 공지', hira_crtr: '심평원 심사기준', mohw_rss: '보건복지부' })
    expect(SOURCES).toEqual(['hira_notice', 'hira_crtr', 'mohw_rss'])
    expect(SOURCES.map(sourceName)).toEqual(['심평원 공지', '심평원 심사기준', '보건복지부'])
  })

  it('AC-7419.2: 줄의 출처는 제목 차례(보건복지부 → 심평원 공지 → 심평원 심사기준)로 겹침 없이 ` · `로 잇는다', () => {
    expect(sourcesText([post('mohw_rss'), post('hira_crtr')])).toBe('보건복지부 · 심평원 심사기준')
    expect(sourcesText([post('hira_crtr'), post('mohw_rss')])).toBe('보건복지부 · 심평원 심사기준')
    expect(sourcesText([post('hira_crtr'), post('hira_notice'), post('mohw_rss')])).toBe('보건복지부 · 심평원 공지 · 심평원 심사기준')
    expect(sourcesText([post('hira_crtr'), post('hira_crtr')])).toBe('심평원 심사기준')
    expect(sourcesText([post('hira_notice')])).toBe('심평원 공지')
    expect(sourcesText([])).toBe('')
  })

  it('AC-7419.2: 고시 번호가 있으면 `보건복지부 고시 제2026-218호`다(기본값 7)', () => {
    expect(noticeNoText('2026-218')).toBe('보건복지부 고시 제2026-218호')
    expect(numberSlot({ noticeNo: '2026-218', kind: 'gosi' })).toBe('보건복지부 고시 제2026-218호')
    expect(numberSlot({ noticeNo: '2026-5', kind: 'notice' })).toBe('보건복지부 고시 제2026-5호')
    // 번호가 종류보다 먼저다
    expect(numberSlot({ noticeNo: '2026-121', kind: 'case' })).toBe('보건복지부 고시 제2026-121호')
  })

  it('AC-7419.2: 번호가 없으면 심사기준 종류 `행정해석`·`심사지침`·`공개 심사사례`, 그 밖은 빈 글자다(기본값 7)', () => {
    expect(CRTR_KIND_NAMES).toEqual({ interp: '행정해석', guide: '심사지침', case: '공개 심사사례' })
    expect(numberSlot({ noticeNo: null, kind: 'interp' })).toBe('행정해석')
    expect(numberSlot({ noticeNo: null, kind: 'guide' })).toBe('심사지침')
    expect(numberSlot({ noticeNo: null, kind: 'case' })).toBe('공개 심사사례')
    expect(numberSlot({ noticeNo: null, kind: 'gosi' })).toBe('')
    expect(numberSlot({ noticeNo: null, kind: 'notice' })).toBe('')
  })
})

describe('날짜 · 달 글자', () => {
  it('AC-7419.2: 줄 날짜는 `11월 20일 (금)`, 달 머리 줄은 `11월`이다', () => {
    expect(dateText('2026-11-20')).toBe('11월 20일 (금)')
    expect(dateText('2026-06-30')).toBe('6월 30일 (화)')
    expect(dateText('2026-11-09')).toBe('11월 9일 (월)')
    expect(dayText('2026-11-13')).toBe('11월 13일')
    expect(monthText('2026-11-20')).toBe('11월')
    expect(monthText('2026-06-01')).toBe('6월')
  })

  it.each([
    ['2026-11-16', '11월 16일 (월)'],
    ['2026-11-17', '11월 17일 (화)'],
    ['2026-11-18', '11월 18일 (수)'],
    ['2026-11-19', '11월 19일 (목)'],
    ['2026-11-20', '11월 20일 (금)'],
    ['2026-11-21', '11월 21일 (토)'],
    ['2026-11-22', '11월 22일 (일)'],
  ])('AC-7419.2: 요일 일곱 개 %s → %s', (ymd, text) => {
    expect(dateText(ymd)).toBe(text)
  })

  it('AC-7419.2: 날짜 모양이 아니면 던진다(dates.ts와 같다)', () => {
    expect(() => dateText('2026-02-30')).toThrow(RangeError)
    expect(() => monthText('11월')).toThrow(RangeError)
    expect(() => dayText('')).toThrow(RangeError)
  })
})

describe('오늘 · 어제 · 시각', () => {
  it('AC-7419.6: 시각은 한국 시각 `07:02`(24시간, 자정은 00시)이고 PC 시간대·ISO 모양과 상관없다', () => {
    expect(timeText('2026-11-20T22:02:00Z')).toBe('07:02')
    expect(timeText('2026-11-21T07:02:00+09:00')).toBe('07:02')
    expect(timeText('2026-11-20T22:03:00.123456+00:00')).toBe('07:03')
    expect(timeText('2026-11-20T15:05:00Z')).toBe('00:05')
    expect(timeText('2026-11-21T05:40:00Z')).toBe('14:40')
    expect(timeText(new Date('2026-11-20T22:02:00Z'))).toBe('07:02')
  })

  it('AC-7419.6: 시각의 한국 날짜는 UTC 날짜와 다를 수 있다', () => {
    expect(ymdOf('2026-11-20T15:05:00Z')).toBe('2026-11-21')
    expect(ymdOf('2026-11-20T14:55:00Z')).toBe('2026-11-20')
    expect(ymdOf(NOW)).toBe('2026-11-21')
  })

  it('AC-7419.6: 시각 모양이 아니면 던진다', () => {
    expect(() => timeText('어제')).toThrow(RangeError)
    expect(() => ymdOf('')).toThrow(RangeError)
  })

  it('AC-7419.6: `{날짜 시각}`은 `11월 19일 (목) 07:03`이다(오늘이어도 날짜로)', () => {
    expect(dateTimeText('2026-11-18T22:03:00Z')).toBe('11월 19일 (목) 07:03')
    expect(dateTimeText('2026-11-21T00:20:00Z')).toBe('11월 21일 (토) 09:20')
    expect(dateTimeText('2026-11-20T15:05:00Z')).toBe('11월 21일 (토) 00:05')
  })

  it('AC-7419.6: 날짜는 오늘이면 `오늘`, 전날이면 `어제`, 그 밖은 `11월 18일 (수)`다(기본값 1)', () => {
    expect(dayWord('2026-11-21', '2026-11-21')).toBe('오늘')
    expect(dayWord('2026-11-20', '2026-11-21')).toBe('어제')
    expect(dayWord('2026-11-18', '2026-11-21')).toBe('11월 18일 (수)')
    expect(dayWord('2026-10-31', '2026-11-01')).toBe('어제')
    expect(dayWord('2025-12-31', '2026-01-01')).toBe('어제')
    // 오늘보다 뒤(시계 어긋남)는 날짜로
    expect(dayWord('2026-11-22', '2026-11-21')).toBe('11월 22일 (일)')
  })

  it('AC-7419.6: 시각 앞 날짜 말은 한국 날짜로 견준다', () => {
    expect(whenText('2026-11-20T22:02:00Z', NOW)).toBe('오늘 07:02')
    expect(whenText('2026-11-19T22:02:00Z', NOW)).toBe('어제 07:02')
    expect(whenText('2026-11-17T22:02:00Z', NOW)).toBe('11월 18일 (수) 07:02')
    // 한국 0시 30분: UTC로는 같은 20일이지만 23:50은 어제, 00:10은 오늘
    const justAfterMidnight = new Date('2026-11-20T15:30:00Z')
    expect(whenText('2026-11-20T14:50:00Z', justAfterMidnight)).toBe('어제 23:50')
    expect(whenText('2026-11-20T15:10:00Z', justAfterMidnight)).toBe('오늘 00:10')
  })
})

describe('확인 줄 · 못 가져옴 띠 · 게시판 주소', () => {
  it('AC-7419.6: 잘 가져온 출처는 `{출처} 오늘 {시각} 확인`이고 날짜 말은 확인한 날을 따른다', () => {
    expect(checkedText(row('hira_notice'), NOW)).toBe('심평원 공지 오늘 07:02 확인')
    expect(checkedText(row('hira_crtr', { checkedAt: '2026-11-19T22:02:00Z' }), NOW)).toBe('심평원 심사기준 어제 07:02 확인')
    expect(checkedText(row('mohw_rss', { checkedAt: '2026-11-17T22:03:00Z' }), NOW)).toBe('보건복지부 11월 18일 (수) 07:03 확인')
  })

  it('AC-7419.6: 아직 확인한 적이 없는 출처는 줄이 없다(null)', () => {
    expect(checkedText(row('hira_notice', { checkedAt: null, lastOkAt: null }), NOW)).toBeNull()
  })

  it('AC-7419.6: 멈춘 출처는 `{출처}: 어제부터 못 가져왔어요`이고 날짜 말은 처음 멈춘 날을 따른다(기본값 1)', () => {
    const since = (stoppedSince: string) => row('mohw_rss', { state: 'stopped', errorCode: 'shape', stoppedSince, checkedAt: '2026-11-20T22:03:00Z' })
    expect(checkedText(since('2026-11-19T22:03:00Z'), NOW)).toBe('보건복지부: 어제부터 못 가져왔어요')
    expect(checkedText(since('2026-11-20T22:03:00Z'), NOW)).toBe('보건복지부: 오늘부터 못 가져왔어요')
    expect(checkedText(since('2026-11-17T22:03:00Z'), NOW)).toBe('보건복지부: 11월 18일 (수)부터 못 가져왔어요')
    expect(stoppedTitle(since('2026-11-19T22:03:00Z'), NOW)).toBe('보건복지부: 어제부터 못 가져왔어요')
  })

  it('AC-7419.6: 멈춘 시각이 비어 있으면 마지막 확인 시각, 그것도 없으면 오늘로 본다', () => {
    expect(stoppedTitle(row('hira_crtr', { state: 'stopped', stoppedSince: null, checkedAt: '2026-11-19T22:02:00Z' }), NOW)).toBe('심평원 심사기준: 어제부터 못 가져왔어요')
    expect(stoppedTitle(row('hira_crtr', { state: 'stopped', stoppedSince: null, checkedAt: null }), NOW)).toBe('심평원 심사기준: 오늘부터 못 가져왔어요')
  })

  const stopped = row('mohw_rss', { state: 'stopped', errorCode: 'shape', lastOkAt: '2026-11-18T22:03:00Z', stoppedSince: '2026-11-19T22:03:00Z', checkedAt: '2026-11-20T22:03:00Z' })

  it('AC-7419.6: 띠 글은 시안 글 그대로다(마지막으로 가져온 때 · 다른 곳은 오늘 잘 가져옴)', () => {
    const rows = [row('hira_notice'), row('hira_crtr'), stopped]
    expect(stoppedBody(stopped, rows, NOW)).toBe(
      '보건복지부 게시판 모양이 바뀌었거나 잠시 막힌 것 같아요. 마지막으로 11월 19일 (목) 07:03에 가져왔어요. 다른 곳 글은 오늘 아침에도 잘 가져왔어요. 고쳐질 때까지 보건복지부 새 글은 직접 확인해 주세요.',
    )
  })

  it('AC-7419.6: 가져온 적이 없으면 `마지막으로 … 가져왔어요.` 문장을 뺀다(기본값 2)', () => {
    const never = { ...stopped, lastOkAt: null }
    expect(stoppedBody(never, [row('hira_notice'), row('hira_crtr'), never], NOW)).toBe(
      '보건복지부 게시판 모양이 바뀌었거나 잠시 막힌 것 같아요. 다른 곳 글은 오늘 아침에도 잘 가져왔어요. 고쳐질 때까지 보건복지부 새 글은 직접 확인해 주세요.',
    )
  })

  it('AC-7419.6: 다른 곳이 모두 오늘 성공하지 않았으면 `다른 곳 글은 …` 문장을 뺀다(기본값 2)', () => {
    const body = '보건복지부 게시판 모양이 바뀌었거나 잠시 막힌 것 같아요. 마지막으로 11월 19일 (목) 07:03에 가져왔어요. 고쳐질 때까지 보건복지부 새 글은 직접 확인해 주세요.'
    // 다른 곳 하나도 멈춤
    const otherStopped = row('hira_crtr', { state: 'stopped', errorCode: 'http', lastOkAt: '2026-11-19T22:02:00Z', stoppedSince: '2026-11-20T22:02:00Z' })
    expect(stoppedBody(stopped, [row('hira_notice'), otherStopped, stopped], NOW)).toBe(body)
    // 다른 곳 하나가 마지막으로 성공한 것이 어제
    expect(stoppedBody(stopped, [row('hira_notice'), row('hira_crtr', { lastOkAt: '2026-11-19T22:02:00Z' }), stopped], NOW)).toBe(body)
    // 다른 곳 하나가 가져온 적이 없음
    expect(stoppedBody(stopped, [row('hira_notice'), row('hira_crtr', { lastOkAt: null }), stopped], NOW)).toBe(body)
    // 다른 곳이 목록에 없음
    expect(stoppedBody(stopped, [stopped], NOW)).toBe(body)
  })

  it('AC-7419.6: 게시판 열기 링크는 `{출처} 게시판 열기`이고 주소는 사람이 여는 게시판 첫 쪽이다', () => {
    expect(BOARD_URLS).toEqual({
      hira_notice: 'https://www.hira.or.kr/bbsDummy.do?pgmid=HIRAA020002000100',
      hira_crtr: 'https://www.hira.or.kr/rc/insu/insuadtcrtr/InsuAdtCrtrList.do?pgmid=HIRAA030069000410',
      mohw_rss: 'https://www.mohw.go.kr/board.es?mid=a10409020000&bid=0026',
    })
    expect(boardLinkText('mohw_rss')).toBe('보건복지부 게시판 열기')
    expect(boardLinkText('hira_crtr')).toBe('심평원 심사기준 게시판 열기')
    for (const source of SOURCES) expect(safeLink(BOARD_URLS[source])).toBe(BOARD_URLS[source])
  })
})

describe('요약 칩 · 본문만 이유 · 붙임 없음 · 링크 거르기', () => {
  const files = [{ name: '붙임1. 고시 전문.hwp', url: 'https://www.hira.or.kr/bbs/bbsCDownLoad.do?apndNo=1&apndBrdBltNo=12353&apndBrdTyNo=2&apndBltNo=157' }]
  const MOHW_WHY = '보건복지부는 붙임 파일 가져가기를 막아 두어 본문만 보고 요약했어요. 붙임 파일은 원문에서 확인해 주세요.'
  const UNREAD_WHY = '붙임 파일을 읽지 못해 본문만 보고 요약했어요. 붙임 파일은 원문에서 확인해 주세요.'

  it('AC-7420.3: 칩은 full·text면 `붙임 파일까지 읽고 요약`, body면 `본문만 보고 요약`, 요약 전이면 없다', () => {
    expect(readModeText('full')).toBe('붙임 파일까지 읽고 요약')
    expect(readModeText('text')).toBe('붙임 파일까지 읽고 요약')
    expect(readModeText('body')).toBe('본문만 보고 요약')
    expect(readModeText(null)).toBeNull()
  })

  it('AC-7420.3: 붙임이 있는데 본문만 보고 요약했으면 읽지 못한 이유 줄이다(기본값 4)', () => {
    expect(bodyOnlyReason({ readMode: 'body', posts: [post('hira_notice', files)] })).toBe(UNREAD_WHY)
    // 보건복지부 글이 함께 있어도 붙임이 있으면 읽지 못한 이유
    expect(bodyOnlyReason({ readMode: 'body', posts: [post('mohw_rss'), post('hira_notice', files)] })).toBe(UNREAD_WHY)
  })

  it('AC-7420.3: 붙임이 없고 보건복지부 글이 든 묶음은 시안 이유 줄이다(기본값 4)', () => {
    expect(bodyOnlyReason({ readMode: 'body', posts: [post('mohw_rss')] })).toBe(MOHW_WHY)
    expect(bodyOnlyReason({ readMode: 'body', posts: [post('mohw_rss'), post('hira_crtr')] })).toBe(MOHW_WHY)
  })

  it('AC-7420.3: 붙임 없는 심평원 글만의 묶음과 본문만이 아닌 요약은 이유 줄이 없다(기본값 4)', () => {
    expect(bodyOnlyReason({ readMode: 'body', posts: [post('hira_crtr')] })).toBeNull()
    expect(bodyOnlyReason({ readMode: 'body', posts: [post('hira_notice'), post('hira_crtr')] })).toBeNull()
    expect(bodyOnlyReason({ readMode: 'full', posts: [post('mohw_rss')] })).toBeNull()
    expect(bodyOnlyReason({ readMode: 'text', posts: [post('hira_notice', files)] })).toBeNull()
    expect(bodyOnlyReason({ readMode: null, posts: [post('mohw_rss')] })).toBeNull()
  })

  it('AC-7420.3: `붙임 파일은 원문에서 받아 주세요.`는 붙임이 없고 보건복지부 글이 든 묶음에만 있다(기본값 5)', () => {
    expect(noFilesText([post('mohw_rss')])).toBe('붙임 파일은 원문에서 받아 주세요.')
    expect(noFilesText([post('mohw_rss'), post('hira_crtr')])).toBe('붙임 파일은 원문에서 받아 주세요.')
    expect(noFilesText([post('mohw_rss'), post('hira_notice', files)])).toBeNull()
    expect(noFilesText([post('hira_crtr')])).toBeNull()
    expect(noFilesText([post('hira_notice')])).toBeNull()
  })

  it('AC-7420.3: 붙임은 출처 글들의 붙임을 차례대로 모으고 같은 주소는 한 번만 둔다', () => {
    const a = { name: 'a.pdf', url: 'https://www.hira.or.kr/bbs/bbsCDownLoad.do?apndNo=1' }
    const b = { name: 'b.hwpx', url: 'https://www.hira.or.kr/bbs/bbsCDownLoad.do?apndNo=2' }
    expect(attachmentsOf([post('mohw_rss'), post('hira_notice', [a, b]), post('hira_notice', [{ ...a, name: 'a 사본.pdf' }])])).toEqual([a, b])
    expect(attachmentsOf([post('mohw_rss')])).toEqual([])
  })

  it.each([
    'https://www.hira.or.kr/bbsDummy.do?pgmid=HIRAA020002000100&brdScnBltNo=4&brdBltNo=12353',
    'https://www.hira.or.kr/bbs/bbsCDownLoad.do?apndNo=1&apndBrdBltNo=12353&apndBrdTyNo=2&apndBltNo=157',
    'https://www.hira.or.kr/rc/insu/insuadtcrtr/InsuAdtCrtrPopup.do?mtgHmeDd=20261120&sno=1&mtgMtrRegSno=2',
    'https://www.mohw.go.kr/board.es?mid=a10409020000&bid=0026&list_no=1488321&act=view',
  ])('AC-7420.3: 두 사이트 주소는 그대로 통과한다 %s', (url) => {
    expect(safeLink(url)).toBe(url)
  })

  it.each([
    'http://www.hira.or.kr/bbsDummy.do',
    'https://hira.or.kr/bbsDummy.do',
    'https://www.hira.or.kr',
    'https://www.hira.or.kr.evil.example/',
    'https://www.mohw.go.kr.evil.example/x',
    'https://evil.example/https://www.hira.or.kr/',
    'https://user@www.hira.or.kr/',
    'https://www.hira.or.kr:8443/',
    'HTTPS://WWW.HIRA.OR.KR/',
    ' https://www.hira.or.kr/',
    '//www.hira.or.kr/',
    '/notices?id=1',
    'javascript:alert(1)',
    'data:text/html,<b>x</b>',
    '',
  ])('AC-7420.3: 그 밖의 주소는 링크로 쓰지 않는다(null) %s', (url) => {
    expect(safeLink(url)).toBeNull()
  })
})

describe('주 기간 글', () => {
  it('AC-7421.1: 주 기간은 `11월 9일 (월) ~ 11월 15일 (일)`이다', () => {
    expect(weekPeriodText('2026-11-09')).toBe('11월 9일 (월) ~ 11월 15일 (일)')
    expect(weekPeriodText('2026-11-30')).toBe('11월 30일 (월) ~ 12월 6일 (일)')
    expect(weekPeriodText('2026-12-28')).toBe('12월 28일 (월) ~ 1월 3일 (일)')
  })

  it('AC-7421.1: 월요일이 아니면 던진다', () => {
    expect(() => weekPeriodText('2026-11-10')).toThrow(RangeError)
  })

  it('AC-7421.1: 정리한 날 `{날짜} 아침에 AI가 정리했어요`의 날짜는 만든 시각의 한국 날짜다', () => {
    expect(dateText(ymdOf('2026-11-15T22:10:00Z'))).toBe('11월 16일 (월)')
  })
})

describe('탭 숫자', () => {
  it.each([
    [1, '1'],
    [9, '9'],
    [99, '99'],
    [100, '99+'],
    [250, '99+'],
  ])('AC-7423.3: 안 읽은 관련 글 %d건 → 동그라미 %s(100 이상은 99+, 기본값 10)', (n, text) => {
    expect(badgeText(n)).toBe(text)
  })

  it('AC-7423.3: 0이면 숫자를 그리지 않는다(null)', () => {
    expect(badgeText(0)).toBeNull()
  })

  it('AC-7423.3: 화면 읽기 글은 실제 수다', () => {
    expect(badgeLabel(2)).toBe('안 읽은 관련 글 2건')
    expect(badgeLabel(250)).toBe('안 읽은 관련 글 250건')
  })
})

describe('순수 모듈', () => {
  // 화면(브라우저)이 부른다: 서버 전용 코드·네트워크·DB·저장소·console 없이 dates.ts와 타입만 쓴다
  const source = readFileSync(new URL('./view.ts', import.meta.url), 'utf8')

  it('AC-7419.2·AC-7419.6·AC-7420.3: view.ts는 dates.ts와 고시·공지 타입만 import한다', () => {
    const imports = [...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1] ?? m[2])
    expect(imports.length).toBeGreaterThan(0)
    for (const spec of imports) expect(['@/lib/analytics/dates', '@/types/notices']).toContain(spec)
  })

  it('AC-7419.2·AC-7419.6·AC-7420.3: view.ts는 네트워크·저장소·console을 쓰지 않는다', () => {
    expect(source).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|console)\b/)
  })
})
