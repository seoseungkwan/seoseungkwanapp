// 수납 구글 코드 8판에서 새로 생긴 것 시험(design.md 8-1): hello(비밀 글자 아는지만) · months(달 파일 찾기만) ·
// 원본·폴더 소유 확인 · write 답의 sheetGid · 답·오류 글·기록에 이름·차트번호 없음.
// 진짜 구글에 붙지 않는다(가짜 구글 fakeGoogle.ts를 vm으로). 비밀 글자·메일·환자 값은 모두 지어낸 시험 값이다.

import { createHmac } from 'node:crypto'
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { type App, CODE_PATH, FakeFile, FakeFolder, FakeSheet, load, makeDateSheet, TEST_TOKEN } from './fakeGoogle'

const OWNED = ['B', 'C', 'D', 'F', 'I', 'J', 'K', 'L', 'M']
const NOV = '시험의원 일일수납일지 2026년 11월'
const OCT = '시험의원 일일수납일지 2026년 10월'
const OTHER = 'other@fake.test'

const layout = () => ({ firstRow: 17, lastRow: 302, keyCol: 'B', nameCol: 'C', ownedCols: OWNED.slice(), moneyCols: ['D', 'F'] })

function writeReq(app: App, over: Record<string, unknown> = {}) {
  return {
    token: app.token,
    action: 'write',
    month: { templateId: 'tpl-1', fileName: NOV, folderId: '', shareWith: ['desk@fake.test'] },
    sheetName: '23',
    layout: layout(),
    mode: 'fillEmpty',
    patients: [],
    ...over,
  }
}

function pt(key: number, name: string, extra: Record<string, unknown> = {}) {
  return { key: String(key), cells: { B: key, C: name, D: '', F: '', I: '', J: '', K: '', L: '', M: '', ...extra } }
}

function monthsReq(app: App, names: unknown, month: Record<string, unknown> = { templateId: 'tpl-1', folderId: '' }) {
  return { token: app.token, action: 'months', month, names }
}

const macOf = (token: string, nonce: string) => createHmac('sha256', token).update(nonce).digest('base64url')
const NONCE = 'Nonce_0123456789-abcdefXYZ'

describe('AC-8506.3: hello — 비밀 글자를 아는지만 HMAC으로 답한다', () => {
  it('AC-8506.3: token 없이 nonce만 보내면 HMAC-SHA256(TOKEN, nonce)를 base64url(= 없음)로 돌려준다', () => {
    const app = load()
    const res = app.post({ action: 'hello', nonce: NONCE })
    expect(res).toEqual({ ok: true, version: '8', mac: macOf(TEST_TOKEN, NONCE) })
    expect(res.mac).toMatch(/^[A-Za-z0-9_-]{43}$/)
    // 다른 비밀 글자를 넣은 코드는 다른 mac — 이 PC의 비밀 글자를 아는 코드만 맞는다
    const other = load({ token: 'OtherFakeToken-0123456789abcdefXYZ' })
    expect(other.post({ action: 'hello', nonce: NONCE }).mac).toBe(macOf('OtherFakeToken-0123456789abcdefXYZ', NONCE))
    expect(other.post({ action: 'hello', nonce: NONCE }).mac).not.toBe(res.mac)
    // nonce 16자·64자 끝까지 된다
    for (const n of ['a'.repeat(16), 'Z_-9'.repeat(16)]) expect(app.post({ action: 'hello', nonce: n }).mac).toBe(macOf(TEST_TOKEN, n))
    expect(app.env.drive.copies).toBe(0)
    expect(app.env.props.size).toBe(0)
  })

  it('AC-8506.3: nonce 꼴이 틀리면(16~64자 [A-Za-z0-9_-]가 아님) bad_request', () => {
    const app = load()
    for (const nonce of ['a'.repeat(15), 'a'.repeat(65), 'has space here 0123', 'nonce+slash/0123456', 'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎㄱㄴ', 1234567890123456, null, undefined, ['x']]) {
      const res = app.post({ action: 'hello', nonce })
      expect(res.ok, String(nonce)).toBe(false)
      expect(res.code, String(nonce)).toBe('bad_request')
      expect(res.mac).toBeUndefined()
    }
  })

  it('AC-8506.3: 비밀 글자 자리가 그대로거나 너무 짧으면 token_not_set(7판과 같은 이름)', () => {
    for (const app of [load({ replaceToken: false }), load({ token: 'short' })]) {
      const res = app.post({ action: 'hello', nonce: NONCE })
      expect(res.ok).toBe(false)
      expect(res.code).toBe('token_not_set')
      expect(res.mac).toBeUndefined()
    }
  })

  it('AC-8506.3: 코드는 ScriptApp(배포 주소)을 부르지 않는다 — 가짜 구글에 ScriptApp이 없어도 돈다', () => {
    const src = fs.readFileSync(CODE_PATH, 'utf8')
    expect(src).not.toMatch(/ScriptApp/)
    expect(src).not.toMatch(/getService\s*\(/)
    const app = load()
    expect('ScriptApp' in app.ctx).toBe(false)
    expect(app.post({ action: 'hello', nonce: NONCE }).ok).toBe(true)
    expect(app.post({ token: app.token, action: 'ping', month: { templateId: 'tpl-1' } }).ok).toBe(true)
    expect(app.post(writeReq(app, { patients: [pt(1001, '가짜환자', { D: 1, F: 100 })] })).ok).toBe(true)
  })
})

describe('AC-8506.2: months — 달마다 파일 id와 날짜 시트 gid, 만들지 않는다', () => {
  it('AC-8506.2: 스크립트 속성에 적힌 달 파일은 id와 날짜 시트(1~31)의 gid만, 없는 달은 null이고 새 파일을 만들지 않는다', () => {
    const app = load()
    const tpl = app.env.template.spreadsheet
    tpl.sheets.push(makeDateSheet('1', 200), new FakeSheet('32', 300, 20, 10), new FakeSheet('01', 301, 20, 10), new FakeSheet('메모', 302, 20, 10))
    const w = app.post(writeReq(app))
    expect(w.ok, w.error).toBe(true)
    const copies = app.env.drive.copies
    const files = app.env.drive.files.size
    const res = app.post(monthsReq(app, [{ ym: '2026-10', fileName: OCT }, { ym: '2026-11', fileName: NOV }]))
    expect(res).toEqual({
      ok: true,
      version: '8',
      months: [
        { ym: '2026-10', fileId: null, gids: {} },
        { ym: '2026-11', fileId: w.fileId, gids: { '1': 200, '22': 100, '23': 101, '24': 102 } },
      ],
    })
    expect(app.env.drive.copies).toBe(copies)
    expect(app.env.drive.files.size).toBe(files)
    expect(app.env.props.has('file:' + OCT)).toBe(false)
  })

  it('AC-8506.2: 속성이 없어도 폴더 안 같은 이름 구글 시트를 찾고(속성에 적음), 휴지통·시트 아닌 파일·원본은 없는 것으로 본다', () => {
    const app = load()
    const trashed = app.env.template.makeCopy(OCT, app.env.folder)
    trashed.trashed = true
    app.env.drive.addFile(new FakeFile(app.env.drive, 'xlsx-1', OCT, 'application/vnd.ms-excel', app.env.folder, null))
    const nov = app.env.template.makeCopy(NOV, app.env.folder)
    // 이름이 원본과 같은 달: 원본은 달 파일이 아니다
    const asTemplate = '일일 수납일지(원본)'
    // 속성이 휴지통 파일을 가리키는 달
    const dec = app.env.template.makeCopy('12월', app.env.folder)
    dec.trashed = true
    app.env.props.set('file:12월', dec.id)
    app.env.drive.copies = 0
    const files = app.env.drive.files.size
    const res = app.post(
      monthsReq(app, [
        { ym: '2026-10', fileName: OCT },
        { ym: '2026-11', fileName: NOV },
        { ym: '2026-09', fileName: asTemplate },
        { ym: '2026-12', fileName: '12월' },
      ]),
    )
    expect(res.ok, res.error).toBe(true)
    expect(res.months).toEqual([
      { ym: '2026-10', fileId: null, gids: {} },
      { ym: '2026-11', fileId: nov.id, gids: { '22': 100, '23': 101, '24': 102 } },
      { ym: '2026-09', fileId: null, gids: {} },
      { ym: '2026-12', fileId: null, gids: {} },
    ])
    expect(app.env.drive.copies).toBe(0)
    expect(app.env.drive.files.size).toBe(files)
    expect(app.env.props.get('file:' + NOV)).toBe(nov.id)
  })

  it('AC-8506.2: folderId(주소도 됨)가 있으면 그 폴더에서 찾는다', () => {
    const app = load()
    const other = app.env.drive.addFolder(new FakeFolder('fld-2026', '2026 수납일지'))
    const inOther = app.env.template.makeCopy(NOV, other)
    app.env.template.makeCopy(OCT, app.env.folder) // 다른 폴더의 파일은 보지 않는다
    const res = app.post(
      monthsReq(app, [{ ym: '2026-11', fileName: NOV }, { ym: '2026-10', fileName: OCT }], {
        templateId: 'https://docs.google.com/spreadsheets/d/tpl-1/edit#gid=0',
        folderId: 'https://drive.google.com/drive/folders/fld-2026?usp=sharing',
      }),
    )
    expect(res.ok, res.error).toBe(true)
    expect(res.months.map((m) => m.fileId)).toEqual([inOther.id, null])
  })

  it('AC-8506.2: 모양이 틀리면 bad_request, 비밀 글자가 틀리면 bad_token — 아무것도 만들지 않는다', () => {
    const app = load()
    const ok = { ym: '2026-11', fileName: NOV }
    const bad: unknown[] = [
      undefined,
      'x',
      [],
      Array.from({ length: 14 }, () => ok),
      [{ ym: '2026-13', fileName: NOV }],
      [{ ym: '2026-1', fileName: NOV }],
      [{ ym: 202611, fileName: NOV }],
      [{ ym: '2026-11', fileName: '' }],
      [{ ym: '2026-11', fileName: '   ' }],
      [{ ym: '2026-11' }],
      ['2026-11'],
    ]
    for (const names of bad) {
      const res = app.post(monthsReq(app, names))
      expect(res.ok, JSON.stringify(names)).toBe(false)
      expect(res.code, JSON.stringify(names)).toBe('bad_request')
    }
    expect(app.post(monthsReq(app, [ok], { folderId: '' })).code).toBe('bad_request')
    expect(app.post(monthsReq(app, Array.from({ length: 13 }, () => ok))).ok).toBe(true)
    for (const token of ['wrong-token-wrong-token-wrong-tok', undefined]) {
      expect(app.post({ ...monthsReq(app, [ok]), token }).code).toBe('bad_token')
    }
    expect(app.env.drive.copies).toBe(0)
  })
})

describe('AC-8506.4: 원본·폴더가 그 구글 계정 소유가 아니면 template·folder 오류', () => {
  const patients = [pt(1001, '가짜환자', { D: 1, F: 100 })]

  it('AC-8506.4: 원본 주인이 다르거나 없으면(공유 드라이브) write·months·ping 모두 template, 아무것도 쓰지 않는다', () => {
    for (const owner of [OTHER, null]) {
      const app = load()
      app.env.template.owner = owner
      const answers = [
        app.post(writeReq(app, { patients })),
        app.post(monthsReq(app, [{ ym: '2026-11', fileName: NOV }])),
        app.post({ token: app.token, action: 'ping', month: { templateId: 'tpl-1' } }),
      ]
      for (const res of answers) {
        expect(res.ok).toBe(false)
        expect(res.code).toBe('template')
        expect(res.error).toBe('원본 시트를 열 수 없습니다. 원본 주소와, 원본이 이 구글 계정에 있는지 확인하세요.')
      }
      expect(app.env.drive.copies).toBe(0)
      expect(app.env.props.size).toBe(0)
      expect(app.env.template.spreadsheet.getSheetByName('23').writes).toEqual([])
    }
  })

  it('AC-8506.4: 이 계정 메일을 모르면(빈 글) 주인을 확인할 수 없으니 template', () => {
    const app = load()
    app.env.userEmail = ''
    expect(app.post(writeReq(app, { patients })).code).toBe('template')
    expect(app.env.drive.copies).toBe(0)
  })

  it('AC-8506.4: 달 파일이 이미 있어도(속성) 원본이 남의 것이 되면 write는 template이고 달 파일에 쓰지 않는다', () => {
    const app = load()
    const first = app.post(writeReq(app))
    expect(first.ok, first.error).toBe(true)
    const sheet = app.env.drive.files.get(first.fileId).spreadsheet.getSheetByName('23')
    sheet.resetCounters()
    const props = new Map(app.env.props)
    app.env.template.owner = OTHER
    const res = app.post(writeReq(app, { patients }))
    expect(res.code).toBe('template')
    expect(sheet.writes).toEqual([])
    expect(app.env.props).toEqual(props)
    expect(app.post(monthsReq(app, [{ ym: '2026-11', fileName: NOV }])).code).toBe('template')
  })

  it('AC-8506.4: 넣을 폴더 주인이 다르거나 없으면 write·months·ping 모두 folder, 아무것도 만들지 않는다', () => {
    for (const owner of [OTHER, null]) {
      const app = load()
      const shared = app.env.drive.addFolder(new FakeFolder('fld-shared', '남의 폴더'))
      shared.owner = owner
      app.env.template.makeCopy(NOV, shared)
      app.env.drive.copies = 0
      const month = { templateId: 'tpl-1', fileName: NOV, folderId: 'fld-shared', shareWith: [] }
      const answers = [
        app.post(writeReq(app, { month, patients })),
        app.post(monthsReq(app, [{ ym: '2026-11', fileName: NOV }], { templateId: 'tpl-1', folderId: 'fld-shared' })),
        app.post({ token: app.token, action: 'ping', month: { templateId: 'tpl-1', folderId: 'fld-shared' } }),
      ]
      for (const res of answers) {
        expect(res.ok).toBe(false)
        expect(res.code).toBe('folder')
        expect(res.error).toBe('넣을 폴더를 열 수 없습니다. 폴더 주소를 확인하세요.')
      }
      expect(app.env.drive.copies).toBe(0)
      expect(app.env.props.size).toBe(0)
      expect(shared.files.every((f) => f.spreadsheet.getSheetByName('23').writes.length === 0)).toBe(true)
    }
  })

  it('AC-8506.4: 이 계정 것이면(메일 대소문자 무관) 그대로 된다', () => {
    const app = load()
    app.env.userEmail = 'Clinic@Fake.Test'
    const own = app.env.drive.addFolder(new FakeFolder('fld-own', '내 폴더'))
    const res = app.post(writeReq(app, { month: { templateId: 'tpl-1', fileName: NOV, folderId: 'fld-own', shareWith: [] }, patients }))
    expect(res.ok, res.error).toBe(true)
    expect(app.env.drive.files.get(res.fileId).parents[0]).toBe(own)
    expect(app.post({ token: app.token, action: 'ping', month: { templateId: 'tpl-1', folderId: 'fld-own' } }).ok).toBe(true)
  })
})

describe('AC-8506.5: write 답의 sheetGid · 이름·차트번호 없음 · 비밀 글자 자리 한 번', () => {
  it('AC-8506.5: write 답에 7판 칸과 sheetGid(넣은 날짜 시트 gid)가 있고 판은 8', () => {
    const app = load()
    const res = app.post(writeReq(app, { sheetName: '24', patients: [pt(1001, '가짜환자', { D: 1, F: 100 })] }))
    expect(res.ok, res.error).toBe(true)
    expect(res.sheetGid).toBe(102)
    expect(res.fileUrl).toBe('https://docs.google.com/spreadsheets/d/' + res.fileId + '/edit#gid=102')
    for (const k of ['ok', 'fileId', 'fileUrl', 'created', 'added', 'filled', 'overwritten', 'skipped', 'full', 'cancelCleared', 'cancelKept', 'freeFixed', 'inserted', 'cleaned', 'shareFailed', 'ratioFormulas', 'version', 'error']) {
      expect(k in res, k).toBe(true)
    }
    expect(res.version).toBe('8')
    expect(app.post({ token: app.token, action: 'ping', month: { templateId: 'tpl-1' } }).version).toBe('8')
  })

  it('AC-8506.5: 어떤 답·오류 글·기록에도 이름·차트번호가 없다', () => {
    const app = load()
    const names = ['가짜환자갑', '가짜환자을', '가짜미수병']
    const charts = ['90901', '90902', '77003']
    const patients = [pt(90901, names[0], { D: 1, F: 12000 }), pt(90902, names[1], { D: 2, F: 3400 })]
    const paidOnly = [{ cells: { C: names[2], D: 5, F: 5000 } }]
    const cancelled = [{ key: charts[2], cells: { B: charts[2], C: names[2] } }]
    const answers = [app.post(writeReq(app, { patients, paidOnly, cancelled }))]
    expect(answers[0].ok, answers[0].error).toBe(true)
    // 구글이 낸 오류 글에 (그 요청의) 환자 값이 섞여도 가린다
    const sheet = app.env.drive.files.get(answers[0].fileId).spreadsheet.getSheetByName('23')
    sheet.failSetValues = 'Service error near ' + names.join(',') + ' ' + charts.join(',')
    const changed = [pt(90901, names[0], { D: 2, F: 9 }), pt(90902, names[1], { D: 1, F: 8 })]
    answers.push(app.post(writeReq(app, { mode: 'overwrite', patients: changed, paidOnly, cancelled })))
    expect(answers[1].code).toBe('google')
    // 모양이 틀린 요청의 오류 글
    answers.push(app.post(writeReq(app, { patients: [{ key: charts[0], cells: { B: charts[1], C: names[0] } }] })))
    expect(answers[2].code).toBe('bad_request')
    answers.push(app.post(monthsReq(app, [{ ym: '2026-11', fileName: NOV }])))
    answers.push(app.post({ action: 'hello', nonce: NONCE }))
    const text = JSON.stringify(answers)
    for (const v of [...names, ...charts, TEST_TOKEN]) expect(text).not.toContain(v)
    expect(app.env.logs).toEqual([])
    const src = fs.readFileSync(CODE_PATH, 'utf8')
    expect(src).not.toMatch(/\b(console|Logger)\s*\./)
  })

  it('AC-8506.5: 비밀 글자 자리 __TOKEN__은 Code.gs에 한 번만, 첫 줄 근처 const TOKEN 자리에 나온다', () => {
    const src = fs.readFileSync(CODE_PATH, 'utf8')
    expect(src.split('__TOKEN__').length - 1).toBe(1)
    expect(src).toMatch(/^const TOKEN = '__TOKEN__';$/m)
    expect(src.split('\n').findIndex((l) => l.includes('__TOKEN__'))).toBeLessThan(30)
  })
})
