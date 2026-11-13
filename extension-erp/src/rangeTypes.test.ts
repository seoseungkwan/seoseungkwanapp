// TASK-1 REQ-3703: 기간 채우기 공용 타입·시간 상수(design.md 5절)
import { describe, expect, it } from 'vitest'
import {
  FALLBACK_MS,
  LOAD_TIMEOUT_MS,
  SAVE_TIMEOUT_MS,
  STABLE_MS,
  type Block,
  type JournalState,
  type LoadResult,
  type RangeAction,
  type RangeView,
  type RunSummary,
  type SaveResult,
  type ScanSummary,
} from './rangeTypes'

describe('rangeTypes', () => {
  it('AC-3703.3 AC-3703.4 시간 상수: 불러오기 30초·저장 30초·이어짐 400ms·날짜 바꾸기 둘째 길 1초', () => {
    expect(LOAD_TIMEOUT_MS).toBe(30_000)
    expect(SAVE_TIMEOUT_MS).toBe(30_000)
    expect(STABLE_MS).toBe(400)
    expect(FALLBACK_MS).toBe(1_000)
  })

  it('AC-3703.3 Block 다섯 가지와 결과 모양', () => {
    const blocks: Block[] = [
      { kind: 'dialog' },
      { kind: 'todayOnly' },
      { kind: 'noSaveBar' },
      { kind: 'readOnly' },
      { kind: 'helper', code: 'E-X' },
    ]
    expect(blocks.map((b) => b.kind)).toEqual(['dialog', 'todayOnly', 'noSaveBar', 'readOnly', 'helper'])
    const loads: LoadResult[] = ['ok', 'error', 'timeout']
    const saves: SaveResult[] = ['ok', 'error', 'timeout', 'missing']
    const j: JournalState = { exists: true, status: 'confirmed' }
    expect([loads.length, saves.length, j.status]).toEqual([3, 4, 'confirmed'])
  })

  it('AC-3703.4 RangeView·RangeAction 모양(시안 예시 숫자)', () => {
    const scan: ScanSummary = {
      from: '2026-10-01',
      to: '2026-10-31',
      fill: ['2026-10-01'],
      fresh: ['2026-10-01'],
      written: [{ date: '2026-10-02', status: 'draft' }],
      zero: ['2026-10-05'],
      unloaded: [],
      overlapVisits: 0,
    }
    const run: RunSummary = {
      from: scan.from,
      to: scan.to,
      total: 26,
      saved: ['2026-10-01'],
      skipped: [{ date: '2026-10-05', why: 'zero' }],
      failed: [{ date: '2026-10-07', why: 'w2Timeout' }],
      remaining: [],
    }
    const views: RangeView[] = [
      { kind: 'pick', from: '', to: '', today: '2026-11-13' },
      { kind: 'todayOnly' },
      { kind: 'scanning', total: 31, done: 3 },
      { kind: 'confirm', scan, last: 'carm' },
      { kind: 'running', total: 26, saved: 11, current: '2026-10-14', stopping: true },
      { kind: 'stopped', run },
      { kind: 'blocked', block: { kind: 'dialog' }, run },
      { kind: 'end', run },
    ]
    const acts: RangeAction[] = [
      { kind: 'scan', from: scan.from, to: scan.to },
      { kind: 'cancelScan' },
      { kind: 'start', choice: 'both' },
      { kind: 'stop' },
      { kind: 'resume' },
      { kind: 'close' },
    ]
    expect(views).toHaveLength(8)
    expect(acts).toHaveLength(6)
  })
})
