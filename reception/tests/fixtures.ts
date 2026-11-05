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

const LANE_LABEL: Record<FakeLane, string> = { wait: '진료대기', hold: '진료보류', pay: '수납대기', done: '끝남' }

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

/** 승인 시안(Main.dc.html·Tablet.dc.html)과 같은 판: 진료대기 3 · 진료보류 2 · 수납대기 2 · 오늘 끝남 2, 진료 순서 5명, 13:42:10 기준 */
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
