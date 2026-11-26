import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as screenReplies from '@/components/gsheet/settings/replies'
import { readCatalog, readCode, readImport, readPing } from './settingsReply'

// 설정 화면 명령 넷(sheet.code·import·ping·catalog)의 답 읽기(spec google-link design.md 9-2, TASK-23 (라)).
// 통로(lib/bridge checkResult, AC-004.6)도 같은 함수로 답 모양을 보므로 화면 폴더(components/gsheet/settings/replies.ts)에서 lib/gsheet로 옮겼다 —
// replies.ts는 옮긴 것을 다시 내보낸다(revenue.days가 revenueResult.ts를 부르는 것과 같은 꼴). 값은 모두 지어낸 것
const TAG = '0123456789abcdef'
const URL = 'https://script.google.com/macros/s/AKfycbFAKE0123456789/exec'

describe('AC-004.6 설정 명령 답 읽기(lib/gsheet/settingsReply)', () => {
  it('AC-004.6: 화면 폴더 replies.ts는 옮긴 읽기 함수를 그대로 다시 내보낸다(같은 함수)', () => {
    expect(screenReplies.readCode).toBe(readCode)
    expect(screenReplies.readImport).toBe(readImport)
    expect(screenReplies.readPing).toBe(readPing)
    expect(screenReplies.readCatalog).toBe(readCatalog)
    const source = readFileSync(join(process.cwd(), 'src/components/gsheet/settings/replies.ts'), 'utf8')
    expect(source).toContain("from '@/lib/gsheet/settingsReply'")
    expect(source).not.toMatch(/function read/)
  })

  it('AC-004.6: lib/gsheet/settingsReply.ts는 화면·React·저장소·통로를 부르지 않는 순수 코드다', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/gsheet/settingsReply.ts'), 'utf8')
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1])
    expect(imports).toEqual(['@/types/gsheet'])
  })

  it('AC-8516.2·AC-004.6: sheet.code 답은 표시(secretTag 16자)·판 글자만 — 다른 열쇠(비밀 글자 등)·틀린 꼴은 null', () => {
    expect(readCode({ v: 1, secretTag: TAG, codeVersion: '8' })).toEqual({ secretTag: TAG, codeVersion: '8' })
    for (const bad of [
      { v: 1, secretTag: TAG, codeVersion: '8', secret: 'fake-secret' },
      { v: 1, secretTag: 'ABCDEF0123456789', codeVersion: '8' },
      { v: 1, secretTag: TAG, codeVersion: 'v8' },
      { v: 2, secretTag: TAG, codeVersion: '8' },
      { secretTag: TAG, codeVersion: '8' },
      null,
      [],
    ]) {
      expect(readCode(bad), JSON.stringify(bad)).toBeNull()
    }
  })

  it('AC-8516.5·AC-004.6: sheet.import 답은 표시와 설정(안쪽 어디에도 코드 주소·함께 쓸 메일 열쇠 없음)만 — 받은 설정은 새로 만든 값이다', () => {
    const settings = { firstRow: 5, cols: { name: 'C' } }
    const read = readImport({ v: 1, secretTag: TAG, settings })
    expect(read).toEqual({ secretTag: TAG, settings })
    expect(read!.settings).not.toBe(settings)
    for (const bad of [
      { v: 1, secretTag: TAG, settings: { scriptUrl: URL } },
      { v: 1, secretTag: TAG, settings: { deep: { list: [{ shareWith: [] }] } } },
      { v: 1, secretTag: TAG, settings: [] },
      { v: 1, secretTag: TAG, settings: {}, extra: 1 },
      { v: 1, settings: {} },
    ]) {
      expect(readImport(bad), JSON.stringify(bad)).toBeNull()
    }
  })

  it('AC-004.6: sheet.ping 답은 ok와 선택 칸 셋(원본 제목·판·오류 번호)만 — 없는 칸은 null로 채운다', () => {
    expect(readPing({ v: 1, ok: true, templateTitle: '가짜 원본', version: '8' })).toEqual({ ok: true, templateTitle: '가짜 원본', version: '8', code: null })
    expect(readPing({ v: 1, ok: false, code: 'E-GSHEET-KEY' })).toEqual({ ok: false, templateTitle: null, version: null, code: 'E-GSHEET-KEY' })
    for (const bad of [
      { v: 1, templateTitle: '가짜 원본' },
      { v: 1, ok: 'yes' },
      { v: 1, ok: true, message: '구글이 준 글' },
      { v: 1, ok: false, code: 'bad_token' },
      { v: 1, ok: true, templateTitle: '줄\n바꿈' },
    ]) {
      expect(readPing(bad), JSON.stringify(bad)).toBeNull()
    }
  })

  it('AC-004.6: sheet.catalog 답은 병원·진료과·처방 목록(줄마다 정해 둔 열쇠)과 병원 이름만', () => {
    const catalog = {
      v: 1,
      hospitals: [{ code: 'H01', name: '가짜정형외과의원', recent: 12 }],
      depts: [{ code: 'D1', name: '정형외과', n90: 30, today: true }],
      rx: [{ code: 'MM001', name: '가짜 처방', cls: 'block', n90: 4 }],
      hospitalName: '가짜정형외과의원',
    }
    const { v: _, ...expected } = catalog
    expect(readCatalog(catalog)).toEqual(expected)
    for (const bad of [
      { ...catalog, hospitalName: undefined },
      { ...catalog, extra: [] },
      { ...catalog, hospitals: [{ code: 'H01', name: '가짜', recent: -1 }] },
      { ...catalog, depts: [{ code: 'D1', name: '정형외과', n90: 30 }] },
      { ...catalog, rx: [{ code: 'MM001', name: '가짜 처방', cls: 'block', n90: 4, patient: '가상환자01' }] },
      { ...catalog, rx: {} },
    ]) {
      expect(readCatalog(bad), JSON.stringify(bad)).toBeNull()
    }
  })
})
