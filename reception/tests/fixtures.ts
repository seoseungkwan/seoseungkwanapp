// 접수 현황 화면 시험의 가짜 자료(TASK-17, TASK-23이 이어 쓴다). 진짜 비트 자료는 없다:
// 이름 '가상환자NN', 차트번호 9로 시작하는 6자리, 처방 코드는 승인 시안(Main.dc.html)의 것(ESWT7 …).
// 모양은 도우미의 `GET /api/board` 답(design.md 4절, helper/src/Precheck.Core/Reception/BoardModel.cs Board.ToJson)과 같다.

/** 줄의 상태 칸(JSON lane) */
export type FakeLane = 'wait' | 'hold' | 'pay' | 'done'

/** 화면이 고르는 칸(진료 순서 + 칸 넷) */
export type FakeList = 'queue' | FakeLane

/** 줄 하나(JSON Row). 칸 이름과 차례는 BoardModel.cs WriteRow와 같다 */
export interface FakeRow {
  k: string
  lane: FakeLane
  pos: number | null
  laneLabel: string
  chart: string
  name: string
  info: string
  time: string
  waited: string
  long: boolean
  memo: string
  rxLabel: string
  rx: string
  xray: { at: string | null } | null
}

/** `GET /api/board` 200 답 */
export interface FakeBoard {
  state: 'ok'
  at: string
  counts: Record<FakeList, number>
  lists: Record<FakeList, FakeRow[]>
}

const LANE_LABEL: Record<FakeLane, string> = { wait: '진료대기', hold: '진료보류', pay: '수납대기', done: '수납완료' }

/** 화면용 열쇠 모양(16자리 소문자 16진수). n이 같으면 같은 열쇠 */
export function fakeKey(n: number): string {
  return `3f9a${String(n).padStart(12, '0')}`
}

/** 줄 하나. 주지 않은 칸은 진료대기 가상환자01 줄의 값이고, 진료보류 줄이면 엑스레이 칸이 { at: null }이다 */
export function fakeRow(over: Partial<FakeRow> = {}): FakeRow {
  const lane = over.lane ?? 'wait'
  return {
    k: fakeKey(1),
    lane,
    pos: null,
    laneLabel: LANE_LABEL[lane],
    chart: '910234',
    name: '가상환자01',
    info: '54세 · 여 · 재진',
    time: '10:42 접수',
    waited: '18분째 대기',
    long: false,
    memo: '',
    rxLabel: '지난번',
    rx: '체외충격파(ESWT7) · 도수치료 20분(DS20)',
    xray: lane === 'hold' ? { at: null } : null,
    ...over,
  }
}

/** 접수 시각 글("10:42 접수")의 시:분. 못 읽으면 맨 뒤로 */
function timeOf(row: FakeRow): string {
  return /^\d\d:\d\d/.exec(row.time)?.[0] ?? '99:99'
}

/**
 * 칸 넷의 줄로 한 판을 만든다(도우미 BoardBuilder와 같은 규칙): 진료 순서 = 진료대기 + 진료보류를 접수 빠른 순으로 잇고
 * 순서 번호(pos)를 1부터 붙인다. 칸 넷의 줄은 pos가 null이다. 건수는 각 목록의 길이다. 칸 넷의 줄 차례는 받은 그대로다
 */
export function boardOf(lanes: Partial<Record<FakeLane, FakeRow[]>> = {}, at = '13:42:10'): FakeBoard {
  const pick = (lane: FakeLane) => (lanes[lane] ?? []).map((row) => ({ ...row, lane, laneLabel: LANE_LABEL[lane], pos: null }))
  const wait = pick('wait')
  const hold = pick('hold')
  const pay = pick('pay')
  const done = pick('done')
  const queue = [...wait, ...hold]
    .map((row, i) => ({ row, i }))
    .sort((a, b) => timeOf(a.row).localeCompare(timeOf(b.row)) || a.i - b.i)
    .map(({ row }, i) => ({ ...row, pos: i + 1 }))
  return {
    state: 'ok',
    at,
    counts: { queue: queue.length, wait: wait.length, hold: hold.length, pay: pay.length, done: done.length },
    lists: { queue, wait, hold, pay, done },
  }
}

/** 승인 시안(Main.dc.html·Tablet.dc.html)과 같은 판: 진료대기 3 · 진료보류 2 · 수납대기 2 · 수납완료 2, 진료 순서 5명, 13:42:10 기준 */
export function mockupBoard(at = '13:42:10'): FakeBoard {
  return boardOf(
    {
      wait: [
        fakeRow({ k: fakeKey(1), chart: '910871', name: '가상환자01', info: '37세 · 남 · 신환', time: '09:38 접수', waited: '1시간 4분째 대기', long: true, memo: '', rxLabel: '처방', rx: '첫 방문이라 지난 처방이 없어요' }),
        fakeRow({ k: fakeKey(2), chart: '910234', name: '가상환자02', info: '54세 · 여 · 재진', time: '10:42 접수', waited: '18분째 대기', memo: '오른쪽 어깨 통증 심해짐', rxLabel: '지난번', rx: '체외충격파(ESWT7) · 도수치료 20분(DS20)' }),
        fakeRow({ k: fakeKey(3), chart: '909412', name: '가상환자03', info: '71세 · 여 · 재진', time: '10:51 접수', waited: '9분째 대기', memo: '보호자 동반', rxLabel: '지난번', rx: '표층열치료(PT01) · 간섭파치료(PT03)' }),
      ],
      hold: [
        fakeRow({ k: fakeKey(4), lane: 'hold', chart: '910502', name: '가상환자04', info: '45세 · 남 · 재진', time: '10:05 접수', waited: '보류 22분째', memo: '엑스레이 찍으러 감', rxLabel: '오늘', rx: '엑스레이 촬영(XR2)', xray: { at: null } }),
        fakeRow({ k: fakeKey(5), lane: 'hold', chart: '910733', name: '가상환자05', info: '58세 · 여 · 재진', time: '10:15 접수', waited: '보류 15분째', memo: '', rxLabel: '오늘', rx: '엑스레이 촬영(XR2)', xray: { at: '10:55' } }),
      ],
      pay: [
        fakeRow({ k: fakeKey(6), lane: 'pay', chart: '908833', name: '가상환자06', info: '62세 · 여 · 재진', time: '09:58 접수', waited: '수납 6분째', memo: '', rxLabel: '오늘', rx: '체외충격파(ESWT7) · 주사(INJ1)' }),
        fakeRow({ k: fakeKey(7), lane: 'pay', chart: '910920', name: '가상환자07', info: '29세 · 남 · 신환', time: '10:12 접수', waited: '수납 2분째', memo: '실손 서류 요청', rxLabel: '오늘', rx: '엑스레이 촬영(XR2) · 표층열치료(PT01)' }),
      ],
      done: [
        fakeRow({ k: fakeKey(8), lane: 'done', chart: '907761', name: '가상환자08', info: '48세 · 남 · 재진', time: '09:12 접수', waited: '09:40 수납', memo: '', rxLabel: '오늘', rx: '도수치료 20분(DS20) · 간섭파치료(PT03)' }),
        fakeRow({ k: fakeKey(9), lane: 'done', chart: '910655', name: '가상환자09', info: '33세 · 여 · 재진', time: '09:05 접수', waited: '09:31 수납', memo: '', rxLabel: '오늘', rx: '체외충격파(ESWT7)' }),
      ],
    },
    at,
  )
}

// ---- 상세 답과 가짜 도우미 (TASK-23) ------------------------------------------------------------------
// 화면 끝까지 시험(app.test.ts)과 Phase 끝 화면 캡처가 함께 쓴다. 도우미 없이 같은 모양의 답을 준다(design.md 4·5·6절)

/** 지난 진료 처방 하나 */
export interface FakeRx {
  name: string
  code: string
}

/** 지난 진료 하나(JSON Visit) */
export interface FakeVisit {
  date: string
  ago: string
  sym: string
  rx: FakeRx[]
}

/** `GET /api/visit/{k}/history?from=N` 200 답 */
export interface FakeHistory {
  visits: FakeVisit[]
  next: number | null
  more: number
  first: string
  total: number
  todaySym: string
}

/** 가짜 오늘: 2026년 11월 5일 (시험의 기기 날짜와 같게 둔다) */
export const FAKE_TODAY = { year: 2026, month: 11, day: 5 }

/** 상세 첫 쪽은 5번, [더 보기]마다 20번 (AC-1404.1) */
const FIRST_PAGE = 5
const MORE_PAGE = 20

/** 승인 시안(Detail.dc.html)의 지난 진료 증상·처방. 6번째부터는 차례대로 다시 쓴다 */
const VISIT_SYMS = [
  '오른쪽 어깨 통증 조금 줄었음, 밤에 아픔',
  '오른쪽 어깨 통증, 팔 올릴 때 아픔',
  '어깨·목 뻐근함',
  '오른쪽 어깨 통증 2주째, 1주 뒤 다시 봄',
  '오른쪽 어깨 통증 처음 옴',
]
const VISIT_RX: FakeRx[][] = [
  [{ name: '체외충격파', code: 'ESWT7' }, { name: '도수치료 20분', code: 'DS20' }],
  [{ name: '체외충격파', code: 'ESWT7' }, { name: '표층열치료', code: 'PT01' }],
  [{ name: '도수치료 20분', code: 'DS20' }, { name: '간섭파치료', code: 'PT03' }, { name: '표층열치료', code: 'PT01' }],
  [{ name: '엑스레이 촬영', code: 'XR2' }, { name: '주사', code: 'INJ1' }],
  [{ name: '엑스레이 촬영', code: 'XR2' }, { name: '표층열치료', code: 'PT01' }],
]

/** 오늘에서 days일 앞 날 */
function daysBefore(days: number): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(FAKE_TODAY.year, FAKE_TODAY.month - 1, FAKE_TODAY.day) - days * 86400000)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

/** 날짜 글: 올해면 "10월 29일", 다른 해면 "2025년 3월 12일" (AC-1404.2) */
function visitDate(d: { year: number; month: number; day: number }): string {
  return d.year === FAKE_TODAY.year ? `${d.month}월 ${d.day}일` : `${d.year}년 ${d.month}월 ${d.day}일`
}

function longDate(d: { year: number; month: number; day: number }): string {
  return `${d.year}년 ${d.month}월 ${d.day}일`
}

/** i번째 지난 진료(0이 가장 최근): 7일 간격으로 거슬러 간다. 처음 5번은 승인 시안과 같다 */
export function fakeVisit(i: number): FakeVisit {
  const days = 7 * (i + 1)
  return { date: visitDate(daysBefore(days)), ago: `${days}일 전`, sym: VISIT_SYMS[i % VISIT_SYMS.length]!, rx: VISIT_RX[i % VISIT_RX.length]! }
}

/**
 * 지난 진료가 past번인 환자의 상세 한 쪽. from이 0이면 처음 5번, 그 뒤는 20번씩이다(AC-1404.1·1404.3).
 * 지난 진료가 없으면 처음 온 날은 오늘이고 모두 1번이다
 */
export function fakeHistory(past: number, from = 0, todaySym = ''): FakeHistory {
  const end = Math.min(past, from + (from === 0 ? FIRST_PAGE : MORE_PAGE))
  const visits = Array.from({ length: Math.max(0, end - from) }, (_, j) => fakeVisit(from + j))
  return {
    visits,
    next: end < past ? end : null,
    more: Math.max(0, past - end),
    first: longDate(past > 0 ? daysBefore(7 * past) : daysBefore(0)),
    total: past + 1,
    todaySym,
  }
}

/** 가짜 도우미의 답: 상태 번호와 JSON 몸(없으면 몸 없음) */
export interface FakeReply {
  status: number
  body?: unknown
}

export interface FakeServer {
  /** 지금 비트 판. 시험이 바꿔 끼운다. 찍음 표시는 답할 때 엑스레이 칸이 있는 줄에 얹는다 */
  board: FakeBoard
  /** 찍음 표시: 열쇠 → 'HH:MM'. 판을 바꿔 끼워도 남는다(도우미의 표시 파일처럼) */
  marks: Map<string, string>
  /** [X-ray 완료]를 받은 PC 시각 'HH:MM' */
  now: string
  /** 요청 하나에 답한다. url은 같은 곳 길('/api/board?fresh=1' 모양) */
  answer: (method: string, url: string, body?: string | null) => FakeReply
}

/** 신환은 지난 진료가 없고, 재진은 36번(승인 시안: 모두 37번) */
function pastOf(row: FakeRow): number {
  return row.info.includes('신환') ? 0 : 36
}

/** 오늘 증상: 진료 전(진료대기)에는 아직 없다 */
function todaySymOf(row: FakeRow): string {
  return row.lane === 'wait' ? '' : '오른쪽 어깨 통증 계속됨'
}

function rowsOfBoard(board: FakeBoard): FakeRow[] {
  return Object.values(board.lists).flat()
}

/**
 * 가짜 도우미(design.md 7절의 길만): GET /api/board(?fresh=1) · GET /api/visit/{k}/history?from=N · POST /api/xray.
 * 다른 길·그날 판에 없는 열쇠·모양이 틀린 값은 404, 진료보류가 아닌 줄의 표시는 400이다
 */
export function fakeServer(board: FakeBoard = mockupBoard(), now = '13:43'): FakeServer {
  const marks = new Map<string, string>()
  for (const row of rowsOfBoard(board)) if (row.xray?.at) marks.set(row.k, row.xray.at)
  const server: FakeServer = {
    board,
    marks,
    now,
    answer(method, url, body) {
      const [path = '', query = ''] = url.split('?')
      const params = new URLSearchParams(query)
      if (method === 'GET' && path === '/api/board' && (query === '' || query === 'fresh=1')) {
        return { status: 200, body: withMarks(server.board, server.marks) }
      }
      const history = /^\/api\/visit\/([0-9a-f]{16})\/history$/.exec(path)
      if (method === 'GET' && history) {
        const row = rowsOfBoard(server.board).find((r) => r.k === history[1])
        const from = Number(params.get('from'))
        if (!row || !/^\d+$/.test(params.get('from') ?? '')) return { status: 404 }
        return { status: 200, body: fakeHistory(pastOf(row), from, todaySymOf(row)) }
      }
      if (method === 'POST' && path === '/api/xray') {
        let ask: { k?: unknown; on?: unknown }
        try {
          ask = JSON.parse(body ?? '') as { k?: unknown; on?: unknown }
        } catch {
          return { status: 400 }
        }
        const row = server.board.lists.hold.find((r) => r.k === ask.k)
        if (!row || typeof ask.on !== 'boolean') return { status: row ? 400 : 404 }
        if (ask.on) server.marks.set(row.k, server.now)
        else server.marks.delete(row.k)
        return { status: 204 }
      }
      return { status: 404 }
    },
  }
  return server
}

/** 판의 엑스레이 칸 줄(진료보류)에 찍음 표시를 얹은 사본 */
function withMarks(board: FakeBoard, marks: Map<string, string>): FakeBoard {
  const lists = {} as Record<FakeList, FakeRow[]>
  for (const [name, rows] of Object.entries(board.lists) as Array<[FakeList, FakeRow[]]>)
    lists[name] = rows.map((row) => (row.xray ? { ...row, xray: { at: marks.get(row.k) ?? null } } : { ...row }))
  return { ...board, counts: { ...board.counts }, lists }
}
