// 수납 구글 코드(google-code/sheet/Code.gs) 시험 — 비트시트 apps-script/test/code.test.js(7판 시험)를 vitest로 옮긴 것.
// 넣기 규칙 기대값은 하나도 바꾸지 않았다(AC-8506.1). 바꾼 것은 판 글자 '8'과 doGet 글(design.md 8-1)뿐이고,
// 프로그램 판 견주기는 도우미·웹이 아는 판(codeVersion)과 견주기로 바꿨다. 실행: npx vitest run google-code/test/sheet.test.ts
// 환자 값은 모두 지어낸 시험 값이다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'vitest';
import { load, colNum, FakeFile, FakeFolder, FakeSheet, makeDateSheet, CODE_PATH, type App, type Reply } from './fakeGoogle';

/** 시험 요청의 칸 묶음({ B: 차트번호, C: 이름, D: 기호, … })과 환자 하나. */
type Cells = Record<string, unknown>;
interface Pt { key: string; cells: Cells; more?: Cells[]; free?: unknown; note?: string }

const OWNED = ['B', 'C', 'D', 'F', 'I', 'J', 'K', 'L', 'M'];
const OWNED_NUMS = new Set(OWNED.map(colNum));
const FILE_NAME = '시험의원 일일수납일지 2026년 11월';

function layout(over: Record<string, unknown> = {}) {
  return { firstRow: 17, lastRow: 302, keyCol: 'B', nameCol: 'C', ownedCols: OWNED.slice(), moneyCols: ['D', 'F'], ...over };
}

/** 줄 끼우기를 끈 모양(옛 뜻 그대로 보는 시험). */
const NO_SHIFT = () => layout({ shiftCols: '' });

function writeReq(app: App, over: Record<string, unknown> = {}) {
  return {
    token: app.token,
    action: 'write',
    month: { templateId: 'tpl-1', fileName: FILE_NAME, folderId: '', shareWith: ['staff@example.com'] },
    sheetName: '23',
    layout: layout(),
    mode: 'fillEmpty',
    patients: [],
    ...over
  };
}

/** 시험 환자 하나. extra로 D·F·I·J·K·L·M 값을 준다. */
function pt(key: string | number, name: string, extra: Cells = {}, more?: Cells[]): Pt {
  const cells = { B: key, C: name, D: '', F: '', I: '', J: '', K: '', L: '', M: '', ...extra };
  const p: Pt = { key: String(key), cells };
  if (more) p.more = more;
  return p;
}

/** 그 달 파일을 먼저 만들고 날짜 시트를 돌려준다(직원 줄을 미리 적어 두기 위해). */
function prepareMonth(app: App, sheetName = '23') {
  const res = app.post(writeReq(app, { sheetName }));
  assert.equal(res.ok, true, res.error);
  const sheet = monthSheet(app, res, sheetName);
  sheet.resetCounters();
  return sheet;
}

function monthSheet(app: App, res: Reply, sheetName = '23') {
  return app.env.drive.files.get(res.fileId).spreadsheet.getSheetByName(sheetName);
}

/** 쓴 칸이 모두 owned 칸이고 식 칸이 아니었는지. */
function assertSafeWrites(sheet: FakeSheet, owned = OWNED_NUMS) {
  for (const w of sheet.writes) {
    assert.ok(owned.has(w.col), 'wrote outside ownedCols at column ' + w.col + ' row ' + w.row);
    assert.equal(w.hadFormula, false, 'wrote over a formula at column ' + w.col + ' row ' + w.row);
    assert.ok(w.row >= 17 && w.row <= 302, 'wrote outside rows at ' + w.row);
  }
}

// ---------------------------------------------------------------- token, ping, basics

test('AC-8506.1: 비밀 글자 자리는 Code.gs 안에 꼭 한 번만 나온다', () => {
  const src = fs.readFileSync(CODE_PATH, 'utf8');
  assert.equal(src.split('__TOKEN__').length - 1, 1);
  assert.match(src, /const TOKEN = '__TOKEN__';/);
});

test('AC-8506.1: 비밀 글자를 아직 안 바꾼 코드는 어떤 요청도 거절한다', () => {
  const app = load({ replaceToken: false });
  for (const token of ['__TOKEN__', 'anything', undefined]) {
    const res = app.post({ token, action: 'ping', month: { templateId: 'tpl-1' } });
    assert.equal(res.ok, false);
    assert.equal(res.code, 'token_not_set');
  }
  const w = app.post({ ...writeReq(app), token: '__TOKEN__' });
  assert.equal(w.ok, false);
  assert.equal(app.env.drive.copies, 0);
});

test('AC-8506.1: 너무 짧은 비밀 글자로 바꾼 코드도 거절한다', () => {
  const app = load({ token: 'short' });
  const res = app.post({ token: 'short', action: 'ping', month: { templateId: 'tpl-1' } });
  assert.equal(res.code, 'token_not_set');
});

test('AC-8506.1: 틀린 비밀 글자·없는 비밀 글자는 거절하고 아무것도 만들지 않는다', () => {
  const app = load();
  for (const token of ['wrong-token-wrong-token-wrong-tok', '', undefined, 12345, app.token + 'x']) {
    const res = app.post({ ...writeReq(app, { patients: [pt(1001, '시험A', { D: 1, F: 100 })] }), token });
    assert.equal(res.ok, false);
    assert.equal(res.code, 'bad_token');
  }
  assert.equal(app.env.drive.copies, 0);
  assert.equal(app.env.props.size, 0);
});

test('AC-8506.1: ping: 비밀 글자와 원본 접근만 확인하고 원본 이름을 돌려준다', () => {
  const app = load();
  const res = app.post({ token: app.token, action: 'ping', month: { templateId: 'tpl-1' } });
  assert.deepEqual({ ok: res.ok, templateTitle: res.templateTitle }, { ok: true, templateTitle: '일일 수납일지(원본)' });
  const byUrl = app.post({ token: app.token, action: 'ping', month: { templateId: 'https://docs.google.com/spreadsheets/d/tpl-1/edit#gid=0' } });
  assert.equal(byUrl.ok, true);
  const missing = app.post({ token: app.token, action: 'ping', month: { templateId: 'nope' } });
  assert.equal(missing.ok, false);
  assert.equal(missing.code, 'template');
  const empty = app.post({ token: app.token, action: 'ping', month: {} });
  assert.equal(empty.ok, false);
  assert.equal(app.env.drive.copies, 0);
});

test('AC-8506.1: ping: 원본이 구글 시트가 아니면 알려 준다', () => {
  const app = load();
  app.env.drive.addFile(new FakeFile(app.env.drive, 'pdf-1', 'x.pdf', 'application/pdf', app.env.folder, null));
  const res = app.post({ token: app.token, action: 'ping', month: { templateId: 'pdf-1' } });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'template');
});

test('AC-8506.1: doGet은 짧은 글만 돌려준다', () => {
  const app = load();
  const out = app.ctx.doGet({});
  assert.equal(out.getContent(), 'Seoseungkwan sheet ok'); // 8판 글(design.md 8-1, 비트시트는 'BitSheet ok')
  assert.equal(out.getMimeType(), 'TEXT');
});

test('AC-8506.1: JSON이 아니거나 action이 이상하면 ok:false', () => {
  const app = load();
  assert.equal(app.postRaw('not json').ok, false);
  assert.equal(app.postRaw('[1,2]').ok, false);
  assert.equal(app.ctx.doPost(undefined).getMimeType(), 'JSON');
  assert.equal(JSON.parse(app.ctx.doPost({}).getContent()).ok, false);
  const res = app.post({ token: app.token, action: 'delete' });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'bad_request');
});

test('AC-8506.1: 잘못된 요청은 아무것도 쓰기 전에 거절한다', () => {
  const app = load();
  const bad = [
    { layout: layout({ ownedCols: ['B', 'C', 'D'], moneyCols: ['F'] }) },
    { layout: layout({ keyCol: 'A' }) },
    { layout: layout({ ownedCols: ['B', '1C'] }) },
    { layout: layout({ firstRow: 20, lastRow: 10 }) },
    { mode: 'replace' },
    { sheetName: '' },
    { patients: 'x' },
    { patients: [{ key: '', cells: {} }] },
    { patients: [{ key: '1001', cells: { B: '1002' } }] },
    { patients: [{ key: '1001', cells: { D: { x: 1 } } }] },
    { patients: [{ key: '1001', cells: { F: [1] } }] },
    { patients: [{ key: '1001', cells: {}, more: 'x' }] },
    { month: { templateId: 'tpl-1', fileName: '' } },
    { month: { templateId: '', fileName: FILE_NAME } }
  ];
  for (const over of bad) {
    const res = app.post(writeReq(app, over));
    assert.equal(res.ok, false, JSON.stringify(over));
    assert.equal(res.code, 'bad_request', JSON.stringify(over));
  }
  assert.equal(app.env.drive.copies, 0);
});

test('AC-8506.1: 답의 모양: 약속한 칸이 다 있고 이름·차트번호는 없다', () => {
  const app = load();
  const res = app.post(writeReq(app, { patients: [pt(55501, '시험이름', { D: 1, F: 15000 })] }));
  for (const k of ['ok', 'fileId', 'fileUrl', 'created', 'added', 'filled', 'overwritten', 'skipped', 'full', 'error']) {
    assert.ok(k in res, 'missing ' + k);
  }
  const text = JSON.stringify(res);
  assert.ok(!text.includes('시험이름'));
  assert.ok(!text.includes('55501'));
  assert.match(res.fileUrl, /^https:\/\/docs\.google\.com\/spreadsheets\/d\/.+\/edit#gid=101$/);
});

// ---------------------------------------------------------------- writing rules

test('AC-8506.1: 새 환자는 맨 처음 빈 줄부터 순서대로 들어간다(직원만 쓰는 칸만 찬 줄도 빈 줄)', () => {
  const app = load();
  const sheet = prepareMonth(app);
  sheet.put('B17', 9001); sheet.put('C17', '직원적음'); // 직원이 적은 환자 줄
  sheet.put('B18', 9002); sheet.put('C18', '직원적음2');
  sheet.put('O19', '예약 메모'); sheet.put('R19', 3000); sheet.put('T19', '지출'); // owned 밖만 참 → 빈 줄
  const res = app.post(writeReq(app, {
    patients: [pt(1001, '시험A', { D: 1, F: 15000, I: 1, J: 0 }), pt(1002, '시험B', { D: 2, F: 8000 }), pt(1003, '시험C', { M: 0 })]
  }));
  assert.equal(res.ok, true, res.error);
  assert.equal(res.added, 3);
  assert.equal(res.created, false);
  assert.deepEqual([sheet.val('B19'), sheet.val('B20'), sheet.val('B21')], [1001, 1002, 1003]);
  assert.deepEqual(sheet.rowValues(19, ['C', 'D', 'F', 'I', 'J', 'K']), { C: '시험A', D: 1, F: 15000, I: 1, J: 0, K: '' });
  assert.equal(sheet.val('O19'), '예약 메모');
  assert.equal(sheet.val('B22'), '');
  assertSafeWrites(sheet);
});

test('AC-8506.1: A칸 번호와 E·P·S 식은 줄을 차 보이게 하지 않고, 절대 쓰이지 않는다', () => {
  const app = load();
  const sheet = prepareMonth(app);
  const before: Record<string, unknown[]> = { A: [], E: [], P: [], S: [] };
  for (let r = 17; r <= 22; r++) for (const L of Object.keys(before)) before[L].push([sheet.val(L + r), sheet.formula(L + r)]);
  const res = app.post(writeReq(app, { patients: [pt(1001, '시험A', { D: 1, F: 100 }), pt(1002, '시험B', { D: 6, F: 0 })] }));
  assert.equal(res.ok, true, res.error);
  assert.equal(sheet.val('B17'), 1001); // 17줄은 A·E·P·S가 차 있어도 빈 줄
  assert.equal(sheet.val('B18'), 1002);
  for (let r = 17; r <= 22; r++) {
    for (const L of Object.keys(before)) assert.deepEqual([sheet.val(L + r), sheet.formula(L + r)], before[L][r - 17]);
  }
  assertSafeWrites(sheet);
  assert.ok(sheet.writes.every((w) => ![1, 5, 7, 8, 16, 19].includes(w.col)));
});

test('AC-8506.1: owned 칸 안의 식 칸도 쓰지 않는다(빈 줄 판단에서도 빼고 본다)', () => {
  const app = load();
  const sheet = prepareMonth(app);
  sheet.putFormula('J17', '=0', 0);
  sheet.putFormula('M17', '=1', 1);
  const res = app.post(writeReq(app, { patients: [pt(1001, '시험A', { D: 1, F: 100, J: 0, M: 0 })] }));
  assert.equal(res.ok, true, res.error);
  assert.equal(sheet.val('B17'), 1001);
  assert.equal(sheet.formula('J17'), '=0');
  assert.equal(sheet.formula('M17'), '=1');
  assertSafeWrites(sheet);
  const again = app.post(writeReq(app, { mode: 'overwrite', patients: [pt(1001, '시험A', { D: 1, F: 100, J: '', M: '' })] }));
  assert.equal(again.ok, true);
  assert.equal(sheet.formula('J17'), '=0');
  assertSafeWrites(sheet);
});

test('AC-8506.1: fillEmpty: 있는 환자 줄의 빈 owned 칸만 채운다', () => {
  const app = load();
  const sheet = prepareMonth(app);
  sheet.put('B17', 1001); sheet.put('C17', '직원이고친이름'); sheet.put('F17', 9999); sheet.put('G17', '비고');
  sheet.put('K17', '  '); // 빈칸만 든 칸은 빈 칸
  const res = app.post(writeReq(app, { patients: [pt(1001, '시험A', { D: 1, F: 15000, I: 2, J: 0, K: 0 })] }));
  assert.equal(res.ok, true, res.error);
  assert.deepEqual([res.added, res.filled, res.overwritten], [0, 1, 0]);
  assert.deepEqual(sheet.rowValues(17, ['B', 'C', 'D', 'F', 'G', 'I', 'J', 'K']),
    { B: 1001, C: '직원이고친이름', D: 1, F: 9999, G: '비고', I: 2, J: 0, K: 0 });
  assert.equal(sheet.val('B18'), '');
  assertSafeWrites(sheet);
});

test('AC-8506.1: overwrite: 있는 환자 줄의 owned 칸을 비트 값으로 바꾸고 ""는 비운다', () => {
  const app = load();
  const sheet = prepareMonth(app);
  sheet.put('B17', 1001); sheet.put('C17', '옛이름'); sheet.put('D17', 2); sheet.put('F17', 9999);
  sheet.put('G17', '비고'); sheet.put('L17', 0); sheet.put('O17', '예약');
  const res = app.post(writeReq(app, { mode: 'overwrite', patients: [pt(1001, '시험A', { D: 1, F: 15000, J: 0, L: '' })] }));
  assert.equal(res.ok, true, res.error);
  assert.deepEqual([res.added, res.filled, res.overwritten], [0, 0, 1]);
  assert.deepEqual(sheet.rowValues(17, ['B', 'C', 'D', 'F', 'G', 'J', 'L', 'O']),
    { B: 1001, C: '시험A', D: 1, F: 15000, G: '비고', J: 0, L: '', O: '예약' });
  assertSafeWrites(sheet);
});

test('AC-8506.1: 요청에 없는 환자(직원만 적은 줄)는 두 모드 모두 건드리지 않는다', () => {
  const app = load();
  const sheet = prepareMonth(app);
  sheet.put('B17', 9001); sheet.put('C17', '직원적음'); sheet.put('D17', 1); sheet.put('F17', 3000); sheet.put('G17', '비고');
  sheet.put('D18', 2); sheet.put('F18', 1000); // 직원 환자의 이어지는 줄
  sheet.put('C25', '이름만 적은 줄');
  const keep = () => [17, 18, 25].map((r) => JSON.stringify(sheet.rowValues(r, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'I', 'J', 'K', 'L', 'M'])));
  const before = keep();
  for (const mode of ['fillEmpty', 'overwrite']) {
    const res = app.post(writeReq(app, { mode, patients: [pt(1001, '시험A', { D: 1, F: 100 }), pt(1002, '시험B', { D: 2, F: 200 })] }));
    assert.equal(res.ok, true, res.error);
    assert.deepEqual(keep(), before);
  }
  assert.equal(sheet.val('B19'), 1001);
  assert.equal(sheet.val('B20'), 1002);
  assert.ok(sheet.writes.every((w) => ![17, 18, 25].includes(w.row)));
  assertSafeWrites(sheet);
});

test('AC-8506.1: 나눠 낸 돈: more 줄은 본 줄 바로 아래, 두 번째에는 이어지는 줄로 알아봐 겹치지 않는다', () => {
  const app = load();
  const req = writeReq(app, {
    patients: [
      pt(1001, '시험A', { D: 1, F: 10000, I: 1 }, [{ D: 2, F: 5000 }, { D: 5, F: 700 }]),
      pt(1002, '시험B', { D: 2, F: 8000 })
    ]
  });
  const first = app.post(req);
  assert.equal(first.ok, true, first.error);
  assert.equal(first.added, 4);
  const sheet = monthSheet(app, first);
  assert.deepEqual(sheet.rowValues(17, ['B', 'C', 'D', 'F', 'I']), { B: 1001, C: '시험A', D: 1, F: 10000, I: 1 });
  assert.deepEqual(sheet.rowValues(18, ['B', 'C', 'D', 'F', 'I']), { B: '', C: '', D: 2, F: 5000, I: '' });
  assert.deepEqual(sheet.rowValues(19, ['B', 'C', 'D', 'F', 'I']), { B: '', C: '', D: 5, F: 700, I: '' });
  assert.equal(sheet.val('B20'), 1002);
  const snap = sheet.snapshot();

  sheet.put('D18', ''); // 직원이 지운 돈 칸은 fillEmpty가 다시 채움
  const second = app.post(req);
  assert.equal(second.ok, true);
  assert.deepEqual([second.added, second.filled, second.skipped], [0, 1, 0]);
  assert.equal(sheet.snapshot(), snap);
  assert.equal(sheet.val('B21'), '');
  assertSafeWrites(sheet);
});

test('AC-8506.1: fillEmpty: 줄 끼우기를 끄면(shiftCols "") 있는 환자에 more가 늘었는데 바로 아래가 빈 줄이 아닐 때 건너뛰고 셈한다', () => {
  const app = load();
  const first = app.post(writeReq(app, { patients: [pt(1001, '시험A', { D: 1, F: 100 }), pt(1002, '시험B', { D: 1, F: 200 })] }));
  const sheet = monthSheet(app, first);
  const snap = sheet.snapshot();
  const res = app.post(writeReq(app, {
    layout: NO_SHIFT(),
    patients: [pt(1001, '시험A', { D: 1, F: 100 }, [{ D: 2, F: 50 }, { D: 2, F: 60 }]), pt(1002, '시험B', { D: 1, F: 200 })]
  }));
  assert.equal(res.ok, true);
  assert.deepEqual([res.added, res.filled, res.skipped, res.full], [0, 0, 2, false]);
  assert.equal(sheet.snapshot(), snap);
});

test('AC-8506.1: 있는 환자에 more가 늘었고 바로 아래가 빈 줄이면 거기에 붙인다', () => {
  const app = load();
  const sheet = prepareMonth(app);
  sheet.put('B17', 1001); sheet.put('C17', '시험A'); sheet.put('D17', 1); sheet.put('F17', 100);
  sheet.put('B19', 9001); sheet.put('C19', '직원적음');
  const res = app.post(writeReq(app, { layout: NO_SHIFT(), patients: [pt(1001, '시험A', { D: 1, F: 100 }, [{ D: 2, F: 50 }, { D: 2, F: 60 }])] }));
  assert.deepEqual([res.added, res.skipped], [1, 1]);
  assert.deepEqual(sheet.rowValues(18, ['B', 'D', 'F']), { B: '', D: 2, F: 50 });
  assert.equal(sheet.val('B19'), 9001);
  assertSafeWrites(sheet);
});

test('AC-8506.1: overwrite: 비트에 더 없는 옛 이어지는 줄은 돈 칸만 비운다', () => {
  const app = load();
  const first = app.post(writeReq(app, {
    patients: [pt(1001, '시험A', { D: 1, F: 100 }, [{ D: 2, F: 50 }, { D: 5, F: 30 }]), pt(1002, '시험B', { D: 1, F: 200 })]
  }));
  const sheet = monthSheet(app, first);
  sheet.put('G19', '직원비고');
  sheet.put('K19', 0); // owned지만 돈 칸이 아님 → 남는다
  const res = app.post(writeReq(app, {
    mode: 'overwrite',
    patients: [pt(1001, '시험A', { D: 1, F: 100 }, [{ D: 2, F: 70 }]), pt(1002, '시험B', { D: 1, F: 200 })]
  }));
  assert.equal(res.ok, true, res.error);
  assert.deepEqual([res.added, res.overwritten, res.skipped], [0, 2, 0]);
  assert.deepEqual(sheet.rowValues(18, ['B', 'D', 'F']), { B: '', D: 2, F: 70 });
  assert.deepEqual(sheet.rowValues(19, ['B', 'D', 'F', 'G', 'K']), { B: '', D: '', F: '', G: '직원비고', K: 0 });
  assert.equal(sheet.val('B20'), 1002);
  assertSafeWrites(sheet);
});

test('AC-8506.1: 주인 없는 돈 줄 바로 위 빈 줄에는 새 환자를 넣지 않는다', () => {
  const app = load();
  const sheet = prepareMonth(app);
  sheet.put('B17', 9001); sheet.put('C17', '직원적음');
  sheet.put('D19', 1); sheet.put('F19', 500); // 18이 비고 19는 차트번호 없는 돈 줄
  const res = app.post(writeReq(app, { patients: [pt(1001, '시험A', { D: 1, F: 100 })] }));
  assert.equal(res.added, 1);
  assert.equal(sheet.val('B18'), '');
  assert.equal(sheet.val('B20'), 1001);
  assertSafeWrites(sheet);
});

test('AC-8506.1: full: 빈 줄이 모자라면 쓸 수 있는 만큼만 쓰고 full:true', () => {
  const app = load();
  const sheet = prepareMonth(app);
  sheet.put('B17', 9001);
  const res = app.post(writeReq(app, {
    layout: layout({ lastRow: 21 }),
    patients: [1, 2, 3, 4, 5].map((i) => pt(2000 + i, '시험' + i, { D: 1, F: i * 100 }))
  }));
  assert.equal(res.ok, true, res.error);
  assert.deepEqual([res.added, res.full], [4, true]);
  assert.deepEqual([18, 19, 20, 21].map((r) => sheet.val('B' + r)), [2001, 2002, 2003, 2004]);
  assert.equal(sheet.val('B22'), '');
  assertSafeWrites(sheet);
});

test('AC-8506.1: full: 붙은 자리가 없으면 본 줄과 붙는 만큼만 넣고 나머지는 skipped', () => {
  const app = load();
  const sheet = prepareMonth(app);
  sheet.put('B17', 9001);
  const res = app.post(writeReq(app, {
    layout: layout({ lastRow: 19 }),
    patients: [pt(1001, '시험A', { D: 1, F: 100 }, [{ D: 2, F: 50 }, { D: 2, F: 60 }])]
  }));
  assert.deepEqual([res.added, res.skipped, res.full], [2, 1, true]);
  assert.equal(sheet.val('B18'), 1001);
  assert.deepEqual(sheet.rowValues(19, ['B', 'F']), { B: '', F: 50 });
});

test('AC-8506.1: 끝 줄이 시트보다 길어도 시트 끝까지만 본다', () => {
  const app = load();
  const res = app.post(writeReq(app, { layout: layout({ lastRow: 1000 }), patients: [pt(1001, '시험A', { D: 1, F: 1 })] }));
  assert.equal(res.ok, true, res.error);
  assert.equal(res.added, 1);
});

test('AC-8506.1: 같은 요청을 두 번 보내도 결과가 같다(두 번째는 쓰지 않음)', () => {
  for (const mode of ['fillEmpty', 'overwrite']) {
    const app = load();
    const req = writeReq(app, {
      mode,
      patients: [
        pt(1001, '시험A', { D: 1, F: 10000, I: 1, J: 0 }, [{ D: 2, F: 5000 }]),
        pt('00123', '시험B', { B: '00123', D: 6, F: 0, K: 0 }),
        pt(1003, '=SUM(1,2)', { L: 0, M: 0 }),
        pt('A-77', '시험D', { B: 'A-77', D: 3, F: 1200 }, [{ D: 4, F: 300 }, { D: 5, F: 1 }])
      ]
    });
    const first = app.post(req);
    assert.equal(first.ok, true, first.error);
    assert.equal(first.added, 7);
    const sheet = monthSheet(app, first);
    const snap = sheet.snapshot();
    sheet.resetCounters();
    const second = app.post(req);
    assert.equal(second.ok, true);
    assert.deepEqual([second.added, second.filled, second.overwritten, second.skipped, second.full], [0, 0, 0, 0, false], mode);
    assert.equal(sheet.snapshot(), snap);
    assert.equal(sheet.setValuesCalls, 0);
    // '='로 시작하는 이름은 식이 아니라 글로 들어간다
    assert.equal(sheet.val('C20'), '=SUM(1,2)');
    assert.equal(sheet.formula('C20'), '');
  }
});

test('AC-8506.1: 차트번호 맞추기: 숫자 12345 = 글 "12345" = 앞뒤 빈칸 있는 글', () => {
  const app = load();
  const sheet = prepareMonth(app);
  sheet.put('B17', ' 12345 ');
  sheet.put('B18', 777);
  sheet.put('B19', 123); // 시트가 "00123"을 숫자로 바꿔 둔 모양
  const res = app.post(writeReq(app, {
    patients: [
      { key: 12345, cells: { B: 12345, C: '시험A', D: 1, F: 1 } },
      { key: '777', cells: { B: '777', C: '시험B', D: 2, F: 2 } },
      { key: '00123', cells: { C: '시험C', D: 1, F: 3 } }
    ]
  }));
  assert.equal(res.ok, true, res.error);
  assert.deepEqual([res.added, res.filled], [0, 3]);
  assert.deepEqual([sheet.val('C17'), sheet.val('C18'), sheet.val('C19')], ['시험A', '시험B', '시험C']);
});

test('AC-8506.1: 칸 글자는 여러 글자(AA)도 된다', () => {
  const app = load();
  const lay = layout({ ownedCols: ['B', 'C', 'Z', 'AA'], moneyCols: ['AA'] });
  const res = app.post(writeReq(app, { layout: lay, patients: [{ key: '1001', cells: { C: '시험A', AA: 500 }, more: [{ AA: 70 }] }] }));
  assert.equal(res.ok, true, res.error);
  const sheet = monthSheet(app, res);
  assert.deepEqual(sheet.rowValues(17, ['B', 'C', 'Z', 'AA']), { B: 1001, C: '시험A', Z: '', AA: 500 });
  assert.equal(sheet.val('AA18'), 70);
  assertSafeWrites(sheet, new Set(['B', 'C', 'Z', 'AA'].map(colNum)));
  assert.equal(app.ctx.colNum_('AA', 'x'), 27);
  assert.equal(app.ctx.colNum_('zz', 'x'), 702);
  assert.equal(app.ctx.colLetter_(703), 'AAA');
  const tooWide = app.post(writeReq(app, { layout: layout({ ownedCols: ['B', 'AZ'], moneyCols: [] }) }));
  assert.equal(tooWide.ok, false);
  assert.equal(tooWide.code, 'layout');
});

test('AC-8506.1: 묶어 쓰기: 같은 모양의 새 환자 여러 명은 칸 묶음(B:D, F, I:J)마다 한 번씩만 쓴다', () => {
  const app = load();
  const sheet = prepareMonth(app);
  const res = app.post(writeReq(app, {
    patients: [1001, 1002, 1003].map((k) => pt(k, '시험' + k, { D: 1, F: 100, I: 1, J: 0 }))
  }));
  assert.equal(res.added, 3);
  assert.equal(sheet.setValuesCalls, 3);
  assert.equal(sheet.reads, 1);
  assertSafeWrites(sheet);
});

test('AC-8506.1: 새 줄에는 값이 있는 칸만 쓴다(빈 칸에 ""를 쓰지 않음, 검토 8)', () => {
  const app = load();
  const sheet = prepareMonth(app);
  const res = app.post(writeReq(app, {
    patients: [
      pt(1001, '시험A', { D: 1, F: 100, J: 0 }),
      pt(1002, '시험B', { D: 1, F: 100 }, [{ D: 2, F: 30 }]),
      pt(1003, '시험C', { M: 0 })
    ]
  }));
  assert.equal(res.added, 4);
  assert.ok(sheet.writes.length > 0);
  assert.ok(sheet.writes.every((w) => w.value !== ''), 'wrote a blank');
  // 18줄 이어지는 줄은 D·F만, 20줄은 B·C·M만
  assert.deepEqual(sheet.writes.filter((w) => w.row === 19).map((w) => w.col).sort((a, b) => a - b), [colNum('D'), colNum('F')]);
  assert.deepEqual(sheet.writes.filter((w) => w.row === 20).map((w) => w.col).sort((a, b) => a - b), [colNum('B'), colNum('C'), colNum('M')]);
  assertSafeWrites(sheet);
});

// ---------------------------------------------------------------- month file

test('AC-8506.1: 달 파일: 없으면 원본을 같은 폴더로 복사하고 shareWith를 편집자로, 속성에 적는다', () => {
  const app = load();
  const res = app.post(writeReq(app, {
    month: { templateId: 'tpl-1', fileName: FILE_NAME, folderId: '', shareWith: ['staff@example.com', ' nurse@example.com ', 'not-an-email'] },
    patients: [pt(1001, '시험A', { D: 1, F: 100 })]
  }));
  assert.equal(res.ok, true, res.error);
  assert.equal(res.created, true);
  assert.equal(res.shareFailed, 1);
  const file = app.env.drive.files.get(res.fileId);
  assert.equal(file.getName(), FILE_NAME);
  assert.equal(file.parents[0], app.env.folder);
  assert.deepEqual(file.editors, ['staff@example.com', 'nurse@example.com']);
  assert.equal(app.env.props.get('file:' + FILE_NAME), res.fileId);
  assert.notEqual(res.fileId, 'tpl-1');
  // 원본은 그대로
  assert.equal(app.env.template.spreadsheet.getSheetByName('23').writes.length, 0);
  assert.equal(app.env.template.spreadsheet.getSheetByName('23').val('B17'), '');
  assert.ok(app.env.releases >= 1);
  assert.ok(app.env.flushes >= 1);
});

test('AC-8506.1: 달 파일: 두 번째부터는 속성에 적힌 파일을 다시 쓴다', () => {
  const app = load();
  const a = app.post(writeReq(app));
  const b = app.post(writeReq(app, { sheetName: '24' }));
  assert.equal(b.ok, true);
  assert.equal(b.created, false);
  assert.equal(b.fileId, a.fileId);
  assert.equal(app.env.drive.copies, 1);
});

test('AC-8506.1: 달 파일: 속성이 없어도 폴더에 같은 이름 시트가 있으면 그것을 쓰고 속성에 적는다', () => {
  const app = load();
  // 같은 이름이지만 휴지통에 있거나 구글 시트가 아닌 파일은 건너뛴다(폴더 안 순서상 먼저 나옴)
  const trashed = app.env.template.makeCopy(FILE_NAME, app.env.folder);
  trashed.trashed = true;
  app.env.drive.addFile(new FakeFile(app.env.drive, 'xlsx-1', FILE_NAME, 'application/vnd.ms-excel', app.env.folder, null));
  const existing = app.env.template.makeCopy(FILE_NAME, app.env.folder);
  app.env.drive.copies = 0;
  const res = app.post(writeReq(app, { patients: [pt(1001, '시험A', { D: 1, F: 1 })] }));
  assert.equal(res.ok, true, res.error);
  assert.equal(res.created, false);
  assert.equal(res.fileId, existing.id);
  assert.equal(app.env.drive.copies, 0);
  assert.equal(app.env.props.get('file:' + FILE_NAME), existing.id);
});

test('AC-8506.1: 달 파일: 속성의 파일이 휴지통이면 새로 만든다', () => {
  const app = load();
  const a = app.post(writeReq(app));
  app.env.drive.files.get(a.fileId).trashed = true;
  const b = app.post(writeReq(app));
  assert.equal(b.ok, true);
  assert.equal(b.created, true);
  assert.notEqual(b.fileId, a.fileId);
  assert.equal(app.env.props.get('file:' + FILE_NAME), b.fileId);
});

test('AC-8506.1: 달 파일: folderId(주소도 됨)가 있으면 그 폴더에서 찾고 만든다', () => {
  const app = load();
  const other = app.env.drive.addFolder(new FakeFolder('fld-2026', '2026 수납일지'));
  const res = app.post(writeReq(app, {
    month: { templateId: 'tpl-1', fileName: FILE_NAME, folderId: 'https://drive.google.com/drive/folders/fld-2026?usp=sharing', shareWith: [] }
  }));
  assert.equal(res.ok, true, res.error);
  assert.equal(res.created, true);
  assert.equal(app.env.drive.files.get(res.fileId).parents[0], other);
  const bad = app.post(writeReq(app, { month: { templateId: 'tpl-1', fileName: FILE_NAME + 'x', folderId: 'nope' } }));
  assert.equal(bad.ok, false);
  assert.equal(bad.code, 'folder');
});

test('AC-8506.1: 달 파일: 이름이 원본과 같아도 원본에는 절대 쓰지 않는다', () => {
  const app = load();
  const res = app.post(writeReq(app, {
    month: { templateId: 'tpl-1', fileName: '일일 수납일지(원본)', folderId: '', shareWith: [] },
    patients: [pt(1001, '시험A', { D: 1, F: 1 })]
  }));
  assert.equal(res.ok, true, res.error);
  assert.notEqual(res.fileId, 'tpl-1');
  assert.equal(res.created, true);
  assert.equal(app.env.template.spreadsheet.getSheetByName('23').writes.length, 0);
});

test('AC-8506.1: 날짜 시트가 없으면 알려 준다', () => {
  const app = load();
  const res = app.post(writeReq(app, { sheetName: '31' }));
  assert.equal(res.ok, false);
  assert.equal(res.code, 'no_sheet');
  assert.ok(app.env.releases >= 1);
});

// ---------------------------------------------------------------- lock, errors

test('AC-8506.1: 다른 넣기가 진행 중이면 busy로 거절하고 아무것도 쓰지 않는다', () => {
  const app = load();
  app.env.lockFree = false;
  const res = app.post(writeReq(app, { patients: [pt(1001, '시험A', { D: 1, F: 1 })] }));
  assert.equal(res.ok, false);
  assert.equal(res.code, 'busy');
  assert.equal(app.env.drive.copies, 0);
});

test('AC-8506.1: 구글 오류 글에 섞인 이름·차트번호는 가린다', () => {
  const app = load();
  const sheet = prepareMonth(app);
  sheet.failSetValues = 'Cell value 시험환자 at chart 98765 rejected';
  const res = app.post(writeReq(app, { patients: [pt(98765, '시험환자', { D: 1, F: 15000 })] }));
  assert.equal(res.ok, false);
  assert.equal(res.code, 'google');
  assert.ok(!res.error.includes('시험환자'));
  assert.ok(!res.error.includes('98765'));
  assert.match(res.error, /\*\*\*/);
  assert.ok(app.env.releases >= 2);
});

test('AC-8506.1: 있는 환자에 more를 붙일 때도 주인 없는 돈 줄 바로 위에는 붙이지 않는다', () => {
  const app = load();
  const sheet = prepareMonth(app);
  sheet.put('B17', 1001); sheet.put('C17', '시험A'); sheet.put('D17', 1); sheet.put('F17', 100);
  sheet.put('D19', 1); sheet.put('F19', 500); // 18 빈 줄, 19 차트번호 없는 돈 줄
  const res = app.post(writeReq(app, { layout: NO_SHIFT(), patients: [pt(1001, '시험A', { D: 1, F: 100 }, [{ D: 2, F: 50 }])] }));
  assert.deepEqual([res.added, res.skipped], [0, 1]);
  assert.equal(sheet.val('F18'), '');
  assert.equal(sheet.writes.length, 0);
  // 줄 끼우기를 켜면: 18에 빈 줄을 끼워 붙이고, 주인 없는 돈 줄은 빈 줄 하나 아래(20)로 밀려 떨어져 있다
  const on = app.post(writeReq(app, { patients: [pt(1001, '시험A', { D: 1, F: 100 }, [{ D: 2, F: 50 }])] }));
  assert.deepEqual([on.added, on.skipped, on.inserted], [1, 0, 1]);
  assert.deepEqual(money(sheet, 18), { B: '', D: 2, F: 50 });
  assert.deepEqual(money(sheet, 19), { B: '', D: '', F: '' });
  assert.deepEqual(money(sheet, 20), { B: '', D: 1, F: 500 });
});

test('AC-8506.1: more 줄에 차트번호·이름이 실려 와도 이어지는 줄의 차트번호·이름 칸은 비워 둔다', () => {
  const app = load();
  const req = writeReq(app, { patients: [pt(1001, '시험A', { D: 1, F: 100 }, [{ B: 1001, C: '시험A', D: 2, F: 50 }])] });
  const first = app.post(req);
  const sheet = monthSheet(app, first);
  assert.deepEqual(sheet.rowValues(18, ['B', 'C', 'D', 'F']), { B: '', C: '', D: 2, F: 50 });
  const second = app.post(req);
  assert.deepEqual([second.added, second.filled, second.skipped], [0, 0, 0]);
});

test('AC-8506.1: 있는 환자 줄은 채울 칸만 쓴다(원래 빈 칸에 ""를 함께 쓰지 않음)', () => {
  const app = load();
  const sheet = prepareMonth(app);
  [17, 18, 19].forEach((r, i) => {
    sheet.put('B' + r, 1001 + i); sheet.put('C' + r, '시험'); sheet.put('D' + r, 1); sheet.put('F' + r, 100); sheet.put('I' + r, 1);
  });
  const res = app.post(writeReq(app, {
    patients: [pt(1001, '시험', { D: 1, F: 100, I: 1, J: 0 }), pt(1002, '시험', { D: 1, F: 100, I: 1, M: 0 }), pt(1003, '시험', { D: 1, F: 100, I: 1, L: 0 })]
  }));
  assert.equal(res.filled, 3);
  assert.deepEqual(sheet.rowValues(17, ['J', 'K', 'L', 'M']), { J: 0, K: '', L: '', M: '' });
  assert.deepEqual(sheet.rowValues(18, ['J', 'K', 'L', 'M']), { J: '', K: '', L: '', M: 0 });
  assert.deepEqual(sheet.rowValues(19, ['J', 'K', 'L', 'M']), { J: '', K: '', L: 0, M: '' });
  assertSafeWrites(sheet);
  assert.deepEqual(sheet.writes.map((w) => w.row + ':' + w.col), ['17:' + colNum('J'), '18:' + colNum('M'), '19:' + colNum('L')]);
});

// ---------------------------------------------------------------- 돈 줄 맞추기 (검토 1)

/** 차트번호와 돈 칸만 본 한 줄 */
const money = (sheet: FakeSheet, r: number) => sheet.rowValues(r, ['B', 'D', 'F']);

test('AC-8506.1: 늦게 낸 돈이 앞 차례로 와도(옛 종류 차례) 빠지거나 두 번 들어가지 않는다: 아래 빈 줄', () => {
  const app = load();
  // 첫 번: 예전 미수를 냄(기호 3)
  let r = app.post(writeReq(app, { patients: [pt(1001, '시험A', { D: 3, F: 30000 })] }));
  assert.equal(r.ok, true, r.error);
  // 다음 번: 오늘 진료비 현금이 들어옴. 옛 프로그램은 종류 차례(현금 → 미수현금)로 보냈다.
  r = app.post(writeReq(app, { patients: [pt(1001, '시험A', { D: 1, F: 15000 }, [{ D: 3, F: 30000 }])] }));
  const sheet = monthSheet(app, r);
  assert.deepEqual([r.added, r.filled, r.skipped], [1, 0, 0]);
  assert.deepEqual(money(sheet, 17), { B: 1001, D: 3, F: 30000 });
  assert.deepEqual(money(sheet, 18), { B: '', D: 1, F: 15000 });
  assert.equal(sheet.val('D19'), '');
  // 시각 차례로 보내도 같은 결과이고, 다시 보내면 아무것도 쓰지 않는다
  sheet.resetCounters();
  r = app.post(writeReq(app, { patients: [pt(1001, '시험A', { D: 3, F: 30000 }, [{ D: 1, F: 15000 }])] }));
  assert.deepEqual([r.added, r.filled, r.skipped], [0, 0, 0]);
  assert.equal(sheet.setValuesCalls, 0);
  assertSafeWrites(sheet);
});

test('AC-8506.1: 늦게 낸 돈: 바로 아래가 다음 환자면 덮지 않고 건너뜀으로 센다(있는 돈을 두 번 넣지도 않음)', () => {
  const app = load();
  let r = app.post(writeReq(app, { patients: [pt(1001, '시험A', { D: 2, F: 10000 }), pt(1002, '시험B')] }));
  const sheet = monthSheet(app, r);
  const before18 = JSON.stringify(sheet.rowValues(18, ['B', 'C', 'D', 'F']));
  for (const order of [
    [pt(1001, '시험A', { D: 1, F: 5000 }, [{ D: 2, F: 10000 }]), pt(1002, '시험B')], // 옛 종류 차례
    [pt(1001, '시험A', { D: 2, F: 10000 }, [{ D: 1, F: 5000 }]), pt(1002, '시험B')] // 시각 차례
  ]) {
    sheet.resetCounters();
    r = app.post(writeReq(app, { layout: NO_SHIFT(), patients: order }));
    assert.equal(r.ok, true, r.error);
    assert.deepEqual([r.added, r.filled, r.skipped], [0, 0, 1]);
    assert.deepEqual(money(sheet, 17), { B: 1001, D: 2, F: 10000 });
    assert.equal(JSON.stringify(sheet.rowValues(18, ['B', 'C', 'D', 'F'])), before18);
    assert.equal(sheet.writes.length, 0);
  }
});

test('AC-8506.1: 돈 줄 맞추기: 차례가 바뀌어도 같은 짝이면 쓰지 않고, 같은 짝 두 개는 개수대로 맞춘다', () => {
  const app = load();
  const sheet = prepareMonth(app);
  sheet.put('B17', 1001); sheet.put('C17', '시험A'); sheet.put('D17', 1); sheet.put('F17', 5000);
  sheet.put('D18', 2); sheet.put('F18', 10000);
  sheet.put('B19', 1002); sheet.put('C19', '시험B'); sheet.put('D19', 2); sheet.put('F19', 5000);
  const res = app.post(writeReq(app, {
    patients: [
      pt(1001, '시험A', { D: 2, F: 10000 }, [{ D: 1, F: 5000 }]),
      pt(1002, '시험B', { D: 2, F: 5000 }, [{ D: 2, F: 5000 }]) // 카드 두 번, 같은 금액
    ]
  }));
  assert.equal(res.ok, true, res.error);
  assert.deepEqual([res.added, res.filled, res.skipped], [1, 0, 0]);
  assert.deepEqual(money(sheet, 20), { B: '', D: 2, F: 5000 });
  assert.ok(sheet.writes.every((w) => w.row === 20));
});

test('AC-8506.1: 돈 줄 맞추기: 직원이 고친 금액은 그대로 두고 같은 돈을 한 번 더 붙이지 않는다', () => {
  const app = load();
  const sheet = prepareMonth(app);
  sheet.put('B17', 1001); sheet.put('C17', '시험A'); sheet.put('D17', 1); sheet.put('F17', 14000);
  const res = app.post(writeReq(app, { patients: [pt(1001, '시험A', { D: 1, F: 15000 })] }));
  assert.deepEqual([res.added, res.filled, res.skipped], [0, 0, 0]);
  assert.equal(sheet.val('F17'), 14000);
  assert.equal(sheet.val('D18'), '');
  // 새 돈이 하나 더 들어오면 그것만 붙인다
  const more = app.post(writeReq(app, { patients: [pt(1001, '시험A', { D: 1, F: 15000 }, [{ D: 2, F: 3000 }])] }));
  assert.deepEqual([more.added, more.skipped], [1, 0]);
  assert.deepEqual(money(sheet, 18), { B: '', D: 2, F: 3000 });
});

test('AC-8506.1: 돈 줄 맞추기: 나중에 FREE가 되어도 이미 들어간 돈 줄 옆에 FREE 줄을 덧붙이지 않는다', () => {
  const app = load();
  const sheet = prepareMonth(app);
  sheet.put('B17', 1001); sheet.put('C17', '시험A'); sheet.put('D17', 1); sheet.put('F17', 15000);
  const res = app.post(writeReq(app, { patients: [pt(1001, '시험A', { D: 6, F: 0 })] }));
  assert.deepEqual([res.added, res.filled, res.skipped], [0, 0, 0]);
  assert.deepEqual(money(sheet, 17), { B: 1001, D: 1, F: 15000 });
  assert.equal(sheet.val('D18'), '');
  // 돈 칸이 빈 본 줄에는 FREE를 채운다
  sheet.put('D17', ''); sheet.put('F17', '');
  const again = app.post(writeReq(app, { patients: [pt(1001, '시험A', { D: 6, F: 0 })] }));
  assert.equal(again.filled, 1);
  assert.deepEqual(money(sheet, 17), { B: 1001, D: 6, F: 0 });
});

// ---------------------------------------------------------------- 이어지는 줄 알아보기 (검토 6)

test('AC-8506.1: 차트번호는 비었지만 이름이 있는 직원 줄은 위 환자의 이어지는 줄로 보지 않는다', () => {
  const app = load();
  const sheet = prepareMonth(app);
  sheet.put('B17', 1001); sheet.put('C17', '시험A'); sheet.put('D17', 1); sheet.put('F17', 100);
  sheet.put('C18', '직원이적은환자'); sheet.put('D18', 2); sheet.put('F18', 7000); // 차트번호 없이 이름·돈
  const keep18 = JSON.stringify(sheet.rowValues(18, ['B', 'C', 'D', 'F']));
  for (const mode of ['overwrite', 'fillEmpty']) {
    const res = app.post(writeReq(app, { mode, patients: [pt(1001, '시험A', { D: 1, F: 100 })] }));
    assert.equal(res.ok, true, res.error);
    assert.equal(JSON.stringify(sheet.rowValues(18, ['B', 'C', 'D', 'F'])), keep18, mode);
  }
  // 새 환자도 그런 직원 줄 바로 위 빈 줄을 쓸 수 있다(주인 없는 돈 줄이 아님)
  sheet.put('B19', 9001); sheet.put('C19', '직원적음');
  sheet.put('C21', '직원이적은환자2'); sheet.put('D21', 1); sheet.put('F21', 500);
  const res = app.post(writeReq(app, { patients: [pt(1001, '시험A', { D: 1, F: 100 }), pt(1002, '시험B', { D: 1, F: 1 })] }));
  assert.equal(res.added, 1);
  assert.equal(sheet.val('B20'), 1002);
  assertSafeWrites(sheet);
});

// ---------------------------------------------------------------- 글로 넣기 (검토 7)

test('AC-8506.1: 시트가 숫자·날짜로 바꿀 글(앞이 0인 번호·날짜 모양·TRUE)은 작은따옴표를 붙여 글 그대로 넣는다', () => {
  const app = load();
  const res = app.post(writeReq(app, {
    patients: [
      pt('01234', '시험A', { B: '01234', D: 1, F: 1 }),
      pt('11-24', '시험B', { B: '11-24', D: 1, F: 2 }),
      pt('2026-001', 'TRUE', { B: '2026-001', D: 1, F: 3 }),
      pt('A-77', '시험D', { B: 'A-77', D: 1, F: 4 })
    ]
  }));
  assert.equal(res.ok, true, res.error);
  const sheet = monthSheet(app, res);
  assert.deepEqual([sheet.val('B17'), sheet.val('B18'), sheet.val('B19'), sheet.val('C19'), sheet.val('B20')], ['01234', '11-24', '2026-001', 'TRUE', 'A-77']);
  const written = Object.fromEntries(sheet.writes.filter((w) => w.col === colNum('B')).map((w) => [w.row, w.value]));
  assert.equal(written[17], "'01234");
  assert.equal(written[18], "'11-24");
  assert.equal(written[20], 'A-77'); // 바뀌지 않는 글은 그대로
  // 다음 번에도 같은 줄로 알아본다
  const again = app.post(writeReq(app, { patients: [pt('01234', '시험A', { B: '01234', D: 1, F: 1 }), pt('11-24', '시험B', { B: '11-24', D: 1, F: 2 })] }));
  assert.deepEqual([again.added, again.filled], [0, 0]);
  const w = app.ctx.writeValue_;
  assert.equal(w('0'), '0');
  assert.equal(w('12345'), '12345');
  assert.equal(w('홍길동'), '홍길동');
  assert.equal(w(''), '');
  assert.equal(w(15000), 15000);
  for (const s of ['007', '2026.11.24', '11/24', '9:30', '1e5', '50%', '1,234', 'false', '12345678901234567', '=A1', "'x"]) {
    assert.equal(w(s), "'" + s, s);
  }
});

// ---------------------------------------------------------------- 취소된 접수 (DESIGN 4장)

function cancelReq(app: App, cancelled: [string | number, string][], over: Record<string, unknown> = {}) {
  return writeReq(app, { cancelled: cancelled.map(([key, name]) => ({ key: String(key), cells: { B: key, C: name } })), ...over });
}

test('AC-8506.1: 취소된 접수: 돈·직원 칸이 비고 이어지는 줄이 없으면 본 줄의 비트 칸을 비운다', () => {
  const app = load();
  const first = app.post(writeReq(app, { patients: [pt(1001, '시험A', { I: 1, J: 0 }), pt(1002, '시험B', { D: 1, F: 100 })] }));
  const sheet = monthSheet(app, first);
  sheet.put('R17', 3000); // 지출 칸은 줄 주인과 상관없음
  sheet.resetCounters();
  const res = app.post(cancelReq(app, [[1001, '시험A']], { patients: [pt(1002, '시험B', { D: 1, F: 100 })] }));
  assert.equal(res.ok, true, res.error);
  assert.deepEqual([res.cancelCleared, res.cancelKept], [1, 0]);
  assert.deepEqual(sheet.rowValues(17, OWNED), Object.fromEntries(OWNED.map((L) => [L, ''])));
  assert.equal(sheet.val('A17'), 1);
  assert.ok(sheet.formula('E17').startsWith('='));
  assert.equal(sheet.val('R17'), 3000);
  assert.equal(sheet.val('B18'), 1002);
  assertSafeWrites(sheet);
  // 다시 보내도 할 일 없음(이미 지움)
  const again = app.post(cancelReq(app, [[1001, '시험A']], { patients: [pt(1002, '시험B', { D: 1, F: 100 })] }));
  assert.deepEqual([again.cancelCleared, again.cancelKept], [0, 0]);
});

test('AC-8506.1: 취소된 접수: 돈·비고·예약관리·이어지는 줄이 있거나 이름이 다르면 지우지 않고 cancelKept로 센다', () => {
  const app = load();
  const sheet = prepareMonth(app);
  const row = (r: number, key: string | number, name: string) => { sheet.put('B' + r, key); sheet.put('C' + r, name); sheet.put('I' + r, 1); };
  row(17, 2001, '시험A'); sheet.put('F17', 100); // 돈 칸
  row(18, 2002, '시험B'); sheet.put('G18', '비고'); // 비고
  row(19, 2003, '시험C'); sheet.put('O19', 3); // 예약관리
  row(20, 2004, '시험D'); sheet.put('D21', 2); sheet.put('F21', 50); // 이어지는 줄
  row(22, 2005, '다른이름'); // 이름이 다름
  const before = sheet.snapshot();
  const res = app.post(cancelReq(app, [[2001, '시험A'], [2002, '시험B'], [2003, '시험C'], [2004, '시험D'], [2005, '시험E'], [2999, '시트에없음']]));
  assert.equal(res.ok, true, res.error);
  assert.deepEqual([res.cancelCleared, res.cancelKept], [0, 5]);
  assert.equal(sheet.snapshot(), before);
  assert.equal(sheet.writes.length, 0);
});

test('AC-8506.1: 취소된 접수: 같은 요청의 살아 있는 환자이면 건드리지 않는다, staffCols를 바꿀 수 있다', () => {
  const app = load();
  const sheet = prepareMonth(app);
  sheet.put('B17', 3001); sheet.put('C17', '시험A');
  sheet.put('B18', 3002); sheet.put('C18', '시험B'); sheet.put('G18', '비고');
  const res = app.post(cancelReq(app, [[3001, '시험A'], [3002, '시험B']], {
    patients: [pt(3001, '시험A', { M: 0 })],
    layout: layout({ staffCols: ['O'] })
  }));
  assert.deepEqual([res.cancelCleared, res.cancelKept], [1, 0]);
  assert.equal(sheet.val('B17'), 3001);
  assert.equal(sheet.val('M17'), 0);
  assert.equal(sheet.val('B18'), '');
  assert.equal(sheet.val('G18'), '비고');
});

test('AC-8506.1: 취소된 접수: 모양이 틀리면 bad_request, 오류 글에서는 그 이름·차트번호도 가린다', () => {
  const app = load();
  for (const over of [
    { cancelled: 'x' },
    { cancelled: [1] },
    { cancelled: [{ key: '', cells: {} }] },
    { cancelled: [{ key: '1', cells: { C: { x: 1 } } }] },
    { layout: layout({ staffCols: ['C'] }) },
    { layout: layout({ staffCols: 'G' }) }
  ]) {
    const res = app.post(writeReq(app, over));
    assert.equal(res.code, 'bad_request', JSON.stringify(over));
  }
  const sheet = prepareMonth(app);
  sheet.failSetValues = 'bad value 취소환자 at 77001';
  sheet.put('B17', 77001); sheet.put('C17', '취소환자');
  const res = app.post(cancelReq(app, [[77001, '취소환자']]));
  assert.equal(res.code, 'google');
  assert.ok(!res.error.includes('취소환자') && !res.error.includes('77001'));
});

test('AC-8506.1: 답에 cancelCleared·cancelKept·freeFixed·inserted·cleaned·version이 있다', () => {
  const app = load();
  const res = app.post(writeReq(app));
  assert.deepEqual([res.cancelCleared, res.cancelKept, res.freeFixed, res.inserted, res.cleaned, res.version], [0, 0, 0, 0, 0, '8']);
});

// 비트시트에서는 프로그램(WebAppClient.CodeVersion)과 견줬다. 여기서는 도우미·웹이 아는 판(design.md 9-2 codeVersion)과 견준다
// (도우미 쪽 판 글자는 같은 Phase의 TASK-9가 만들어 이 시험이 그 파일을 읽지 않는다).
const CODE_VERSION = '8';

test('AC-8506.1: Code.gs 판과 도우미·웹이 아는 판(codeVersion)이 같다', () => {
  const gs = fs.readFileSync(CODE_PATH, 'utf8');
  const a = /const BITSHEET_VERSION = '([^']+)';/.exec(gs);
  assert.ok(a, 'version found');
  assert.equal(a[1], CODE_VERSION);
});

// ---------------------------------------------------------------- 늦게 붙은 FREE 고치기

/** FREE 환자: main·more는 비트 돈 줄, dropped는 비트가 FREE 때문에 뺀 진료수납 짝. */
function freePt(key: string | number, name: string, main: Cells, more?: Cells[], dropped?: Cells[]) {
  const p = pt(key, name, main, more);
  p.free = { cells: { D: 6, F: 0 }, dropped };
  return p;
}

test('AC-8506.1: 늦게 붙은 FREE: 현금 줄이 먼저 들어간 뒤 FREE가 되면 FREE 한 줄만 남고 현금은 없다(두 모드)', () => {
  for (const mode of ['fillEmpty', 'overwrite']) {
    const app = load();
    // 5분마다 넣기: 할인 기록이 붙기 전이라 현금으로 들어감
    let r = app.post(writeReq(app, { patients: [pt(1001, '시험A', { D: 1, F: 15000 })] }));
    assert.equal(r.ok, true, r.error);
    const sheet = monthSheet(app, r);
    assert.deepEqual(money(sheet, 17), { B: 1001, D: 1, F: 15000 });
    // 몇 시간 뒤 할인 기록 FREE가 붙음
    r = app.post(writeReq(app, { mode, patients: [freePt(1001, '시험A', { D: 6, F: 0 }, undefined, [{ D: 1, F: 15000 }])] }));
    assert.equal(r.ok, true, r.error);
    assert.equal(r.freeFixed, 1, mode);
    assert.equal(r.added, 0, mode);
    assert.deepEqual(money(sheet, 17), { B: 1001, D: 6, F: 0 }, mode);
    assert.deepEqual(money(sheet, 18), { B: '', D: '', F: '' }, mode);
    assertSafeWrites(sheet);
    // 두 번 돌려도 같다
    const before = sheet.snapshot();
    const n = sheet.writes.length;
    r = app.post(writeReq(app, { mode, patients: [freePt(1001, '시험A', { D: 6, F: 0 }, undefined, [{ D: 1, F: 15000 }])] }));
    assert.deepEqual([r.freeFixed, r.added, r.filled, r.overwritten, r.skipped], [0, 0, 0, 0, 0], mode);
    assert.equal(sheet.snapshot(), before, mode);
    assert.equal(sheet.writes.length, n, mode);
  }
});

test('AC-8506.1: 늦게 붙은 FREE: 현금+카드 두 줄이면 위 줄이 FREE, 아래 줄은 비운다', () => {
  const app = load();
  let r = app.post(writeReq(app, { patients: [pt(1001, '시험A', { D: 1, F: 8000 }, [{ D: 2, F: 2000 }]), pt(1002, '시험B', { D: 1, F: 1 })] }));
  const sheet = monthSheet(app, r);
  assert.equal(sheet.val('B19'), 1002);
  // 아래 환자가 먼저 들어와 있어 이어지는 줄을 비우면 빈 줄이 하나 생긴다(그 자리는 다음 새 환자가 쓸 수 있다)
  r = app.post(writeReq(app, { patients: [freePt(1001, '시험A', { D: 6, F: 0 }, undefined, [{ D: 2, F: 2000 }, { D: 1, F: 8000 }]), pt(1002, '시험B', { D: 1, F: 1 })] }));
  assert.equal(r.freeFixed, 1);
  assert.deepEqual(money(sheet, 17), { B: 1001, D: 6, F: 0 });
  assert.deepEqual(sheet.rowValues(18, ['B', 'C', 'D', 'F', 'I']), { B: '', C: '', D: '', F: '', I: '' });
  assert.deepEqual(money(sheet, 19), { B: 1002, D: 1, F: 1 });
  assertSafeWrites(sheet);
});

test('AC-8506.1: 늦게 붙은 FREE: 같은 날 미수입금 줄은 그대로 두고, 빈 줄이 끼지 않게 FREE 자리를 고른다', () => {
  // 미수입금이 나중: 본 줄 현금, 둘째 카드, 셋째 미수현금 → 둘째에 FREE, 본 줄 돈 칸은 비움, 셋째 그대로
  {
    const app = load();
    const sheet = prepareMonth(app);
    sheet.put('B17', 1001); sheet.put('C17', '시험A'); sheet.put('D17', 1); sheet.put('F17', 8000);
    sheet.put('D18', 2); sheet.put('F18', 2000);
    sheet.put('D19', 3); sheet.put('F19', 3000);
    const req = () => writeReq(app, { patients: [freePt(1001, '시험A', { D: 6, F: 0 }, [{ D: 3, F: 3000 }], [{ D: 1, F: 8000 }, { D: 2, F: 2000 }])] });
    const r = app.post(req());
    assert.deepEqual([r.freeFixed, r.added, r.skipped], [1, 0, 0]);
    assert.deepEqual(money(sheet, 17), { B: 1001, D: '', F: '' });
    assert.deepEqual(money(sheet, 18), { B: '', D: 6, F: 0 });
    assert.deepEqual(money(sheet, 19), { B: '', D: 3, F: 3000 });
    const before = sheet.snapshot();
    const again = app.post(req());
    assert.deepEqual([again.freeFixed, again.added, again.filled, again.skipped], [0, 0, 0, 0]);
    assert.equal(sheet.snapshot(), before);
  }
  // 미수입금이 먼저: 본 줄 미수현금, 둘째 현금 → 둘째에 FREE
  {
    const app = load();
    const sheet = prepareMonth(app);
    sheet.put('B17', 1001); sheet.put('C17', '시험A'); sheet.put('D17', 3); sheet.put('F17', 3000);
    sheet.put('D18', 1); sheet.put('F18', 8000);
    const r = app.post(writeReq(app, { patients: [freePt(1001, '시험A', { D: 3, F: 3000 }, [{ D: 6, F: 0 }], [{ D: 1, F: 8000 }])] }));
    assert.deepEqual([r.freeFixed, r.added, r.skipped], [1, 0, 0]);
    assert.deepEqual(money(sheet, 17), { B: 1001, D: 3, F: 3000 });
    assert.deepEqual(money(sheet, 18), { B: '', D: 6, F: 0 });
  }
  // 비울 줄 아래에 남길 줄(비트와 똑같은 미수입금)이 있으면 블록 안에서 정리: 맨 위 고른 줄 = FREE,
  // 남길 줄은 위로 올리고 맨 아래 줄을 비운다(두 모드, 건너뜀 없음).
  for (const mode of ['fillEmpty', 'overwrite']) {
    const app = load();
    const sheet = prepareMonth(app);
    sheet.put('B17', 1001); sheet.put('C17', '시험A'); sheet.put('D17', 3); sheet.put('F17', 3000);
    sheet.put('D18', 1); sheet.put('F18', 8000);
    sheet.put('D19', 2); sheet.put('F19', 2000);
    sheet.put('D20', 3); sheet.put('F20', 5000);
    const req = () => writeReq(app, { mode, patients: [freePt(1001, '시험A', { D: 3, F: 3000 }, [{ D: 6, F: 0 }, { D: 3, F: 5000 }], [{ D: 1, F: 8000 }, { D: 2, F: 2000 }])] });
    const r = app.post(req());
    assert.deepEqual([r.freeFixed, r.added, r.skipped], [1, 0, 0], mode);
    assert.deepEqual(money(sheet, 17), { B: 1001, D: 3, F: 3000 }, mode);
    assert.deepEqual(money(sheet, 18), { B: '', D: 6, F: 0 }, mode);
    assert.deepEqual(money(sheet, 19), { B: '', D: 3, F: 5000 }, mode);
    assert.deepEqual(money(sheet, 20), { B: '', D: '', F: '' }, mode);
    assertSafeWrites(sheet);
    const before = sheet.snapshot();
    const again = app.post(req());
    assert.deepEqual([again.freeFixed, again.skipped, again.added, again.filled], [0, 0, 0, 0], mode);
    assert.equal(sheet.snapshot(), before, mode);
  }
  // 옮길 줄에 직원 메모(G)가 있거나, 옮길 줄이 직원이 고친 금액이면 정리하지 않고 예전처럼:
  // 맨 위 고른 줄만 FREE, 막힌 줄은 남기고 건너뜀으로 알린다(빈 칸만 채우기).
  for (const variant of ['memo', 'edited']) {
    const app = load();
    const sheet = prepareMonth(app);
    sheet.put('B17', 1001); sheet.put('C17', '시험A'); sheet.put('D17', 3); sheet.put('F17', 3000);
    sheet.put('D18', 1); sheet.put('F18', 8000);
    sheet.put('D19', 2); sheet.put('F19', 2000);
    sheet.put('D20', 3); sheet.put('F20', variant === 'edited' ? 5500 : 5000);
    if (variant === 'memo') sheet.put('G20', '직원메모');
    const req = () => writeReq(app, { patients: [freePt(1001, '시험A', { D: 3, F: 3000 }, [{ D: 6, F: 0 }, { D: 3, F: 5000 }], [{ D: 1, F: 8000 }, { D: 2, F: 2000 }])] });
    const r = app.post(req());
    assert.deepEqual([r.freeFixed, r.added, r.skipped], [1, 0, 1], variant);
    assert.deepEqual(money(sheet, 18), { B: '', D: 6, F: 0 }, variant);
    assert.deepEqual(money(sheet, 19), { B: '', D: 2, F: 2000 }, variant);
    assert.deepEqual(money(sheet, 20), { B: '', D: 3, F: variant === 'edited' ? 5500 : 5000 }, variant);
    if (variant === 'memo') assert.equal(sheet.val('G20'), '직원메모');
    const before = sheet.snapshot();
    const again = app.post(req());
    assert.deepEqual([again.freeFixed, again.skipped], [0, 1], variant);
    assert.equal(sheet.snapshot(), before, variant);
  }
});

test('AC-8506.1: 늦게 붙은 FREE: 앞 내원이 FREE가 되고 아래에 뒤 내원 돈 줄이 있으면, 그 줄을 올리고 아래를 비운다(다음 환자는 그대로)', () => {
  for (const mode of ['fillEmpty', 'overwrite']) {
    const app = load();
    const sheet = prepareMonth(app);
    // 앞 내원: 현금 2000 + 카드 5000 + 현금 1000, 뒤 내원: 현금 5000. 바로 아래는 다음 환자
    sheet.put('B17', 1001); sheet.put('C17', '시험A'); sheet.put('D17', 1); sheet.put('F17', 2000); sheet.put('G17', '본줄메모');
    sheet.put('D18', 2); sheet.put('F18', 5000);
    sheet.put('D19', 1); sheet.put('F19', 1000);
    sheet.put('D20', 1); sheet.put('F20', 5000);
    sheet.put('B21', 1002); sheet.put('C21', '시험B'); sheet.put('D21', 1); sheet.put('F21', 3000);
    const req = () => writeReq(app, { mode, patients: [
      freePt(1001, '시험A', { D: 6, F: 0 }, [{ D: 1, F: 5000 }], [{ D: 1, F: 2000 }, { D: 2, F: 5000 }, { D: 1, F: 1000 }]),
      pt(1002, '시험B', { D: 1, F: 3000 })
    ] });
    const r = app.post(req());
    assert.deepEqual([r.freeFixed, r.skipped, r.added, r.inserted], [1, 0, 0, 0], mode);
    assert.deepEqual(money(sheet, 17), { B: 1001, D: 6, F: 0 }, mode);
    assert.equal(sheet.val('G17'), '본줄메모', mode);
    assert.deepEqual(money(sheet, 18), { B: '', D: 1, F: 5000 }, mode);
    assert.deepEqual(money(sheet, 19), { B: '', D: '', F: '' }, mode);
    assert.deepEqual(money(sheet, 20), { B: '', D: '', F: '' }, mode);
    assert.deepEqual(money(sheet, 21), { B: 1002, D: 1, F: 3000 }, mode);
    assertSafeWrites(sheet);
    const before = sheet.snapshot();
    sheet.resetCounters();
    const again = app.post(req());
    assert.deepEqual([again.freeFixed, again.skipped, again.added, again.filled, again.inserted], [0, 0, 0, 0, 0], mode);
    assert.equal(sheet.snapshot(), before, mode);
    assert.equal(sheet.writes.length + sheet.inserts.length, 0, mode);
  }
  // 옮길 돈 칸이 식이면 정리하지 않는다(막힌 줄은 남기고 건너뜀)
  {
    const app = load();
    const sheet = prepareMonth(app);
    sheet.put('B17', 1001); sheet.put('C17', '시험A'); sheet.put('D17', 1); sheet.put('F17', 2000);
    sheet.put('D18', 2); sheet.put('F18', 5000);
    sheet.put('D19', 1); sheet.put('F19', 1000);
    sheet.put('D20', 1); sheet.putFormula('F20', '=2500*2', 5000);
    const r = app.post(writeReq(app, { patients: [freePt(1001, '시험A', { D: 6, F: 0 }, [{ D: 1, F: 5000 }], [{ D: 1, F: 2000 }, { D: 2, F: 5000 }, { D: 1, F: 1000 }])] }));
    assert.deepEqual([r.freeFixed, r.skipped], [1, 1]);
    assert.deepEqual(money(sheet, 18), { B: '', D: 6, F: 0 });
    assert.deepEqual(money(sheet, 19), { B: '', D: 1, F: 1000 });
    assert.equal(sheet.formula('F20'), '=2500*2');
    assertSafeWrites(sheet);
  }
});

test('AC-8506.1: 늦게 붙은 FREE: 직원이 고친 금액은 건드리지 않는다', () => {
  const app = load();
  const sheet = prepareMonth(app);
  sheet.put('B17', 1001); sheet.put('C17', '시험A'); sheet.put('D17', 1); sheet.put('F17', 14000);
  const before = sheet.snapshot();
  // 저절로 넣기는 늘 빈 칸만 채우기(덮어쓰기는 원래 비트 값으로 다 바꾸는 모드)
  const r = app.post(writeReq(app, { patients: [freePt(1001, '시험A', { D: 6, F: 0 }, undefined, [{ D: 1, F: 15000 }])] }));
  assert.deepEqual([r.freeFixed, r.added, r.filled, r.skipped], [0, 0, 0, 0]);
  assert.equal(sheet.snapshot(), before);
});

test('AC-8506.1: 늦게 붙은 FREE: 이미 FREE 줄이 있어도(같은 날 다른 내원) 나중에 FREE가 된 내원의 현금 줄은 비운다', () => {
  // 내원 가는 수납 때 FREE(6/0), 내원 나는 1/9000으로 먼저 들어간 뒤 FREE가 됨 → 프로그램은 FREE 한 줄, dropped에 두 내원의 돈
  for (const mode of ['fillEmpty', 'overwrite']) {
    const app = load();
    let r = app.post(writeReq(app, { patients: [pt(1002, '시험B', { D: 6, F: 0 }, [{ D: 1, F: 9000 }])] }));
    const sheet = monthSheet(app, r);
    const req = () => writeReq(app, { mode, patients: [freePt(1002, '시험B', { D: 6, F: 0 }, [], [{ D: 1, F: 7000 }, { D: 1, F: 9000 }])] });
    r = app.post(req());
    assert.deepEqual([r.freeFixed, r.skipped, r.added], [1, 0, 0], mode);
    assert.deepEqual(money(sheet, 17), { B: 1002, D: 6, F: 0 }, mode);
    assert.deepEqual(sheet.rowValues(18, ['B', 'C', 'D', 'F']), { B: '', C: '', D: '', F: '' }, mode);
    const before = sheet.snapshot();
    r = app.post(req());
    assert.deepEqual([r.freeFixed, r.skipped, r.added, r.filled, r.overwritten], [0, 0, 0, 0, 0], mode);
    assert.equal(sheet.snapshot(), before, mode);
  }
  // FREE가 아래 줄에 있고 현금이 위에 있으면: FREE를 위로 올리고 아래를 비운다(빈 줄이 끼지 않게)
  {
    const app = load();
    const sheet = prepareMonth(app);
    sheet.put('B17', 1003); sheet.put('C17', '시험C'); sheet.put('D17', 1); sheet.put('F17', 2000);
    sheet.put('D18', 2); sheet.put('F18', 15000);
    sheet.put('D19', 6); sheet.put('F19', 0);
    const r = app.post(writeReq(app, { patients: [freePt(1003, '시험C', { D: 6, F: 0 }, [], [{ D: 1, F: 2000 }, { D: 2, F: 15000 }])] }));
    assert.deepEqual([r.freeFixed, r.skipped, r.added], [1, 0, 0]);
    assert.deepEqual(money(sheet, 17), { B: 1003, D: 6, F: 0 });
    assert.deepEqual(money(sheet, 18), { B: '', D: '', F: '' });
    assert.deepEqual(money(sheet, 19), { B: '', D: '', F: '' });
  }
});

test('AC-8506.1: 늦게 붙은 FREE: 다른 내원에 정말 같은 돈 줄이 있으면 그 줄은 그대로 둔다', () => {
  // 내원 가(FREE, 현금 9000은 뺌)는 처음부터 FREE, 내원 나는 FREE 아닌 현금 9000 → 비트 줄 [FREE, 1/9000]
  const app = load();
  const sheet = prepareMonth(app);
  sheet.put('B17', 1004); sheet.put('C17', '시험D'); sheet.put('D17', 6); sheet.put('F17', 0);
  sheet.put('D18', 1); sheet.put('F18', 9000);
  const before = sheet.snapshot();
  const r = app.post(writeReq(app, { patients: [freePt(1004, '시험D', { D: 6, F: 0 }, [{ D: 1, F: 9000 }], [{ D: 1, F: 9000 }])] }));
  assert.deepEqual([r.freeFixed, r.skipped, r.added, r.filled], [0, 0, 0, 0]);
  assert.equal(sheet.snapshot(), before);
  // FREE 전에 두 내원 현금이 다 들어가 있었으면 하나만 FREE로 바꾼다
  const app2 = load();
  const sheet2 = prepareMonth(app2);
  sheet2.put('B17', 1004); sheet2.put('C17', '시험D'); sheet2.put('D17', 1); sheet2.put('F17', 9000);
  sheet2.put('D18', 1); sheet2.put('F18', 9000);
  const r2 = app2.post(writeReq(app2, { patients: [freePt(1004, '시험D', { D: 6, F: 0 }, [{ D: 1, F: 9000 }], [{ D: 1, F: 9000 }])] }));
  assert.deepEqual([r2.freeFixed, r2.skipped, r2.added], [1, 0, 0]);
  assert.deepEqual([sheet2.val('D17'), sheet2.val('F17'), sheet2.val('D18'), sheet2.val('F18')].sort(), [0, 1, 6, 9000].sort());
});

test('AC-8506.1: 늦게 붙은 FREE: 같은 기호의 미수입금 줄(계좌 5)과 뺀 진료수납 짝이 같아도 미수입금 줄은 남긴다', () => {
  // 시트에 미수입금 계좌 5/3000만 있음(뺀 진료수납 계좌 5/3000은 시트에 없음) → 그대로 두고 FREE만 덧붙임
  const app = load();
  const sheet = prepareMonth(app);
  sheet.put('B17', 1005); sheet.put('C17', '시험E'); sheet.put('D17', 5); sheet.put('F17', 3000);
  const req = () => writeReq(app, { patients: [freePt(1005, '시험E', { D: 5, F: 3000 }, [{ D: 6, F: 0 }], [{ D: 5, F: 3000 }])] });
  let r = app.post(req());
  assert.deepEqual([r.freeFixed, r.added, r.skipped], [0, 1, 0]);
  assert.deepEqual(money(sheet, 17), { B: 1005, D: 5, F: 3000 });
  assert.deepEqual(money(sheet, 18), { B: '', D: 6, F: 0 });
  const before = sheet.snapshot();
  r = app.post(req());
  assert.deepEqual([r.freeFixed, r.added, r.skipped], [0, 0, 0]);
  assert.equal(sheet.snapshot(), before);
  // 둘 다 들어가 있었으면 하나만 FREE로
  const app2 = load();
  const sheet2 = prepareMonth(app2);
  sheet2.put('B17', 1005); sheet2.put('C17', '시험E'); sheet2.put('D17', 5); sheet2.put('F17', 3000);
  sheet2.put('D18', 5); sheet2.put('F18', 3000);
  const r2 = app2.post(writeReq(app2, { patients: [freePt(1005, '시험E', { D: 5, F: 3000 }, [{ D: 6, F: 0 }], [{ D: 5, F: 3000 }])] }));
  assert.deepEqual([r2.freeFixed, r2.added, r2.skipped], [1, 0, 0]);
  // 같은 짝 두 줄 가운데 어느 줄이 FREE가 되어도 된다(모음으로 5/3000 하나 + 6/0 하나)
  const pairs = [17, 18].map((row) => sheet2.val('D' + row) + '/' + sheet2.val('F' + row)).sort();
  assert.deepEqual(pairs, ['5/3000', '6/0']);
  assert.equal(sheet2.val('D19'), '');
});

test('AC-8506.1: 취소된 접수는 환자 넣기보다 먼저 지워서 그 줄을 같은 번에 쓸 수 있다', () => {
  const app = load();
  const sheet = prepareMonth(app);
  sheet.put('B17', 1001); sheet.put('C17', '시험A'); sheet.put('D17', 1); sheet.put('F17', 8000);
  sheet.put('B18', 1004); sheet.put('C18', '취소환자');
  sheet.put('B19', 1005); sheet.put('C19', '시험E');
  const req = () => writeReq(app, {
    patients: [pt(1001, '시험A', { D: 1, F: 8000 }, [{ D: 2, F: 2000 }]), pt(1005, '시험E')],
    cancelled: [{ key: '1004', cells: { B: 1004, C: '취소환자' } }]
  });
  const r = app.post(req());
  assert.deepEqual([r.cancelCleared, r.added, r.skipped], [1, 1, 0]);
  assert.deepEqual(sheet.rowValues(18, ['B', 'C', 'D', 'F']), { B: '', C: '', D: 2, F: 2000 });
  const before = sheet.snapshot();
  const again = app.post(req());
  assert.deepEqual([again.cancelCleared, again.added, again.skipped], [0, 0, 0]);
  assert.equal(sheet.snapshot(), before);
});

test('AC-8506.1: free 모양 검사: FREE 짝이 비면 거절, 뺀 짝이 없으면 없는 것으로 본다', () => {
  const app = load();
  const bad = pt(1001, '시험A', { D: 6, F: 0 });
  bad.free = { cells: {}, dropped: [{ D: 1, F: 100 }] };
  assert.equal(app.post(writeReq(app, { patients: [bad] })).ok, false);
  const none = pt(1001, '시험A', { D: 6, F: 0 });
  none.free = { cells: { D: 6, F: 0 }, dropped: [] };
  const r = app.post(writeReq(app, { patients: [none] }));
  assert.equal(r.ok, true, r.error);
  assert.equal(r.freeFixed, 0);
});

// ---------------------------------------------------------------- 줄 끼우기 (늦게 낸 돈, 조정 2026-11-24)

/** 날짜 시트 23에 지출(R:T)과 옆 표(V)를 적어 둔다. */
function putSide(sheet: FakeSheet) {
  for (let r = 17; r <= 24; r++) {
    sheet.put('R' + r, r - 16);
    sheet.put('T' + r, '지출' + r);
    sheet.put('V' + r, '옆표' + r);
  }
}

test('AC-8506.1: 줄 끼우기: 늦게 낸 현금이 다음 환자 바로 위에 끼워지고 식은 위 줄에서 베끼며, 다음 환자는 그대로 내려간다', () => {
  for (const mode of ['fillEmpty', 'overwrite']) {
    const app = load();
    let r = app.post(writeReq(app, { patients: [pt(1001, '시험A', { D: 2, F: 10000, I: 1 }), pt(1002, '시험B', { D: 1, F: 3000, I: 2, J: 0 })] }));
    const sheet = monthSheet(app, r);
    sheet.put('G18', '직원메모'); sheet.put('O18', 3);
    putSide(sheet);
    const b18 = sheet.rowValues(18, ['A', 'B', 'C', 'D', 'F', 'G', 'I', 'J', 'O']);
    const e18 = sheet.formula('E18');
    sheet.resetCounters();
    r = app.post(writeReq(app, { mode, patients: [pt(1001, '시험A', { D: 2, F: 10000, I: 1 }, [{ D: 1, F: 5000 }]), pt(1002, '시험B', { D: 1, F: 3000, I: 2, J: 0 })] }));
    assert.equal(r.ok, true, r.error);
    assert.deepEqual([r.added, r.skipped, r.inserted, r.full], [1, 0, 1, false], mode);
    // 끼운 줄: A(NO) 비움, D/F만, 식(E·P)은 위 줄에서 베껴 줄 번호가 맞음
    assert.deepEqual(sheet.rowValues(18, ['A', 'B', 'C', 'D', 'F', 'G', 'I', 'O']), { A: '', B: '', C: '', D: 1, F: 5000, G: '', I: '', O: '' }, mode);
    assert.equal(sheet.formula('E18'), e18, mode); // 위 줄(17) 식을 베껴 18을 가리킴
    assert.equal(sheet.formula('P18'), '=IF(O18="",0,1)', mode);
    // 다음 환자는 19로 통째로 내려감(값·직원 칸·식 그대로, 식 글자는 시트가 알아서 고침 = 가짜는 그대로 둠)
    assert.deepEqual(sheet.rowValues(19, ['A', 'B', 'C', 'D', 'F', 'G', 'I', 'J', 'O']), b18, mode);
    assert.equal(sheet.formula('E19'), e18, mode);
    // 밀어 내린 칸은 A:P만
    assert.deepEqual(sheet.inserts.map((x) => [x.row, x.col, x.nc]), [[18, 1, 16]], mode);
    assertSafeWrites(sheet);
  }
});

test('AC-8506.1: 줄 끼우기: 바뀐 것이 없으면 다시 돌려도 아무것도 끼우거나 쓰지 않는다', () => {
  const app = load();
  const req = () => writeReq(app, { patients: [pt(1001, '시험A', { D: 2, F: 10000 }, [{ D: 1, F: 5000 }, { D: 2, F: 700 }]), pt(1002, '시험B', { D: 1, F: 3000 })] });
  let r = app.post(writeReq(app, { patients: [pt(1001, '시험A', { D: 2, F: 10000 }), pt(1002, '시험B', { D: 1, F: 3000 })] }));
  const sheet = monthSheet(app, r);
  r = app.post(req());
  assert.deepEqual([r.added, r.inserted, r.skipped], [2, 2, 0]);
  assert.deepEqual([17, 18, 19, 20].map((row) => sheet.val('B' + row) + '/' + sheet.val('D' + row) + '/' + sheet.val('F' + row)),
    ['1001/2/10000', '/1/5000', '/2/700', '1002/1/3000']);
  const before = sheet.snapshot();
  sheet.resetCounters();
  r = app.post(req());
  assert.deepEqual([r.added, r.filled, r.inserted, r.skipped, r.overwritten], [0, 0, 0, 0, 0]);
  assert.equal(sheet.snapshot(), before);
  assert.equal(sheet.inserts.length + sheet.writes.length + sheet.copies.length, 0);
});

test('AC-8506.1: 줄 끼우기: 지출(R:T)과 옆 표(V)는 움직이지 않는다', () => {
  const app = load();
  let r = app.post(writeReq(app, { patients: [pt(1001, '시험A', { D: 2, F: 10000 }), pt(1002, '시험B', { D: 1, F: 3000 })] }));
  const sheet = monthSheet(app, r);
  putSide(sheet);
  sheet.putFormula('S20', '=IF(R20="",0,R20)', 4);
  const side = () => [17, 18, 19, 20, 21, 22].map((row) => JSON.stringify(sheet.rowValues(row, ['R', 'S', 'T', 'V'])) + sheet.formula('S' + row)).join('|');
  const before = side();
  r = app.post(writeReq(app, { patients: [pt(1001, '시험A', { D: 2, F: 10000 }, [{ D: 1, F: 5000 }]), pt(1002, '시험B', { D: 1, F: 3000 })] }));
  assert.equal(r.inserted, 1);
  assert.equal(side(), before);
  assert.equal(sheet.val('B19'), 1002);
});

test('AC-8506.1: 줄 끼우기: 범위 맨 아래 줄이 차 있거나, shiftCols가 환자 칸을 다 품지 못하거나, 시트가 끼우기를 거절하면 옛날처럼 건너뜀', () => {
  // 맨 아래 줄(302)이 차 있으면 밀어 낼 빈 줄이 없다
  {
    const app = load();
    let r = app.post(writeReq(app, { patients: [pt(1001, '시험A', { D: 2, F: 10000 }), pt(1002, '시험B')] }));
    const sheet = monthSheet(app, r);
    sheet.put('B302', 7777); sheet.put('C302', '맨아래');
    r = app.post(writeReq(app, { patients: [pt(1001, '시험A', { D: 2, F: 10000 }, [{ D: 1, F: 5000 }]), pt(1002, '시험B')] }));
    assert.deepEqual([r.ok, r.inserted, r.skipped], [true, 0, 1]);
    assert.equal(sheet.val('B18'), 1002);
  }
  // 프로그램 칸을 다 품지 않는 shiftCols는 거절, 기본값이 못 품는 시트 모양이면 끼우지 않음
  {
    const app = load();
    const bad = app.post(writeReq(app, { layout: layout({ shiftCols: 'A:F' }) }));
    assert.equal(bad.code, 'bad_request');
    const odd = app.post(writeReq(app, { layout: layout({ shiftCols: 'P:A' }) }));
    assert.equal(odd.code, 'bad_request');
  }
  // 시트가 끼우기를 거절(합친 칸 등) → 값은 쓰지 않은 채 끼우지 않고 다시
  {
    const app = load();
    let r = app.post(writeReq(app, { patients: [pt(1001, '시험A', { D: 2, F: 10000 }), pt(1002, '시험B')] }));
    const sheet = monthSheet(app, r);
    sheet.failInsert = 'You must select all cells in a merged range to merge or unmerge them.';
    r = app.post(writeReq(app, { patients: [pt(1001, '시험A', { D: 2, F: 10000 }, [{ D: 1, F: 5000 }]), pt(1002, '시험B', { D: 1, F: 3000 })] }));
    assert.equal(r.ok, true, r.error);
    assert.deepEqual([r.inserted, r.skipped, r.filled], [0, 1, 1]);
    assert.equal(sheet.val('B18'), 1002);
    assert.equal(sheet.val('F18'), 3000);
  }
});

test('AC-8506.1: 줄 끼우기: 끼운 만큼 아래 빈 줄이 범위 밖으로 밀려나도 다음 번에 범위 안 환자 줄은 그대로 보인다', () => {
  const app = load();
  // 17~300을 다른 환자로 채우고 301·302만 비움 → 끼우기 두 번은 되고 세 번째는 맨 아래가 차서 안 됨
  let r = app.post(writeReq(app, { patients: [pt(1001, '시험A', { D: 2, F: 10000 })] }));
  const sheet = monthSheet(app, r);
  for (let row = 18; row <= 300; row++) { sheet.put('B' + row, 5000 + row); sheet.put('C' + row, '환자' + row); }
  const late = (n: number) => pt(1001, '시험A', { D: 2, F: 10000 }, Array.from({ length: n }, (_, i) => ({ D: 1, F: 100 + i })));
  r = app.post(writeReq(app, { patients: [late(1)] }));
  assert.deepEqual([r.inserted, r.skipped], [1, 0]);
  r = app.post(writeReq(app, { patients: [late(3)] }));
  assert.deepEqual([r.inserted, r.added, r.skipped], [1, 1, 1]);
  assert.equal(sheet.val('B302'), 5300); // 마지막 환자가 범위 끝으로
  assert.equal(sheet.val('B303'), '');
  r = app.post(writeReq(app, { patients: [late(3)] }));
  assert.deepEqual([r.inserted, r.added, r.skipped], [0, 0, 1]);
});

test('AC-8506.1: 줄 끼우기: 식 베끼기가 안 되면 그 끼운 줄은 되돌리고(deleteCells), 끝난 끼우기 수만 inserted로 알린다', () => {
  // 하나뿐인 끼우기의 식 베끼기가 안 됨 → 되돌려 시트가 그대로, inserted 0, 늦게 낸 돈은 건너뜀
  {
    const app = load();
    let r = app.post(writeReq(app, { patients: [pt(1001, '시험A', { D: 1, F: 8000 }), pt(1002, '시험B', { D: 1, F: 3000 })] }));
    const sheet = monthSheet(app, r);
    putSide(sheet);
    const before = sheet.snapshot();
    sheet.resetCounters();
    sheet.failCopy = 'copy failed';
    r = app.post(writeReq(app, { patients: [pt(1001, '시험A', { D: 1, F: 8000 }, [{ D: 2, F: 2000 }]), pt(1002, '시험B', { D: 1, F: 3000 })] }));
    assert.equal(r.ok, true, r.error);
    assert.deepEqual([r.inserted, r.skipped, r.added], [0, 1, 0]);
    assert.deepEqual([sheet.inserts.length, sheet.deletes.length], [1, 1]);
    assert.deepEqual(sheet.deletes.map((x) => [x.row, x.col, x.nc]), [[18, 1, 16]]);
    assert.equal(sheet.snapshot(), before);
    assert.notEqual(sheet.formula('E18'), '');
  }
  // 두 번째 끼우기의 식 베끼기가 안 됨 → 첫 끼우기(식까지 베낀 줄)는 남아 다시 할 때 쓰이고 inserted 1
  {
    const app = load();
    let r = app.post(writeReq(app, { patients: [pt(1001, '시험A', { D: 1, F: 8000 }), pt(1002, '시험B', { D: 1, F: 5000 }), pt(1003, '시험C')] }));
    const sheet = monthSheet(app, r);
    sheet.resetCounters();
    let n = 0; // 끼우기 하나에 식 베끼기 두 번(E, P) → 세 번째부터 실패
    Object.defineProperty(sheet, 'failCopy', { get() { n++; return n >= 3 ? 'copy failed' : null; }, set() {}, configurable: true });
    const req = () => writeReq(app, { patients: [pt(1001, '시험A', { D: 1, F: 8000 }, [{ D: 2, F: 2000 }]), pt(1002, '시험B', { D: 1, F: 5000 }, [{ D: 2, F: 3000 }]), pt(1003, '시험C')] });
    r = app.post(req());
    assert.equal(r.ok, true, r.error);
    assert.deepEqual([r.inserted, r.added, r.skipped], [1, 1, 1]);
    assert.deepEqual([sheet.inserts.length, sheet.deletes.length], [2, 1]);
    assert.deepEqual([17, 18, 19, 20].map((row) => sheet.val('B' + row) + '/' + sheet.val('D' + row) + '/' + sheet.val('F' + row)),
      ['1001/1/8000', '/2/2000', '1002/1/5000', '1003//']);
    assert.ok(sheet.formula('E18') !== '' && sheet.formula('P18') !== '');
    assert.equal(sheet.val('A18'), '');
    // 시트가 다시 받아 주면 남은 줄을 끼운다
    Object.defineProperty(sheet, 'failCopy', { value: null, writable: true, configurable: true });
    r = app.post(req());
    assert.deepEqual([r.inserted, r.added, r.skipped], [1, 1, 0]);
    assert.deepEqual([19, 20, 21].map((row) => sheet.val('B' + row) + '/' + sheet.val('D' + row) + '/' + sheet.val('F' + row)),
      ['1002/1/5000', '/2/3000', '1003//']);
  }
});

test('AC-8506.1: 줄 끼우기: 새 환자는 붙은 자리가 없어 본 줄만 넣을 때(full)도 줄을 끼우지 않는다', () => {
  const app = load();
  let r = app.post(writeReq(app, {}));
  const sheet = monthSheet(app, r);
  // 빈 줄이 한 줄씩만 있다(18, 20, …, 302) → 두 줄짜리 새 환자는 붙은 자리가 없다
  for (let row = 17; row <= 301; row += 2) { sheet.put('B' + row, 5000 + row); sheet.put('C' + row, '환자' + row); }
  sheet.resetCounters();
  r = app.post(writeReq(app, { patients: [pt(7001, '새환자', { D: 1, F: 1000 }, [{ D: 2, F: 2000 }])] }));
  assert.equal(r.ok, true, r.error);
  assert.deepEqual([r.full, r.added, r.skipped, r.inserted], [true, 1, 1, 0]);
  assert.equal(sheet.inserts.length, 0);
  assert.deepEqual(money(sheet, 18), { B: 7001, D: 1, F: 1000 });
  assert.equal(sheet.val('B19'), 5019);
});

// ---------------------------------------------------------------- 새 달 파일 정리

const CLEAN_COLS = ['B', 'C', 'D', 'F', 'G', 'I', 'J', 'K', 'L', 'M', 'O']; // ownedCols ∪ staffCols(기본)

/**
 * 원본에 실제와 같은 남은 줄을 만든다: 날짜 시트 '1'(17~25에 D·I·J·L·O), 머리 줄이 같은 '일일 수납일지(원본)'
 * (17~27에 B·C·F·I·J·L·O), 머리 줄이 다른 '관리자'(17~20 값). 지울 칸 수를 돌려준다.
 */
function dirtyTemplate(app: App) {
  const tpl = app.env.template.spreadsheet;
  const one = makeDateSheet('1', 200);
  const orig = makeDateSheet('일일 수납일지(원본)', 201);
  tpl.sheets.push(one, orig);
  let n = 0;
  for (let r = 17; r <= 25; r++) for (const L of ['D', 'I', 'J', 'L', 'O']) { one.put(L + r, L === 'O' ? 1 : r); n++; }
  for (let r = 17; r <= 27; r++) for (const L of ['B', 'C', 'F', 'I', 'J', 'L', 'O']) { orig.put(L + r, L === 'C' ? '옛환자' + r : r); n++; }
  // 지우면 안 되는 것: owned 칸 안의 식, H·N·Q·R 값(프로그램 칸 밖), 체크 안 된 체크박스(FALSE)
  one.putFormula('D26', '=1+1', 2);
  one.put('H17', '중간칸'); one.put('N17', 7); one.put('Q17', '오른쪽'); one.put('R17', 5000);
  one.put('O30', false);
  // 서식(체크박스 등)이 있는 칸: 값만 지워지고 서식은 남아야 한다
  one.cells.set('18,15', { v: 1, f: '', format: 'checkbox' });
  const admin = tpl.getSheetByName('관리자');
  admin.put('A16', '관리'); admin.put('B16', '항목');
  for (let r = 17; r <= 20; r++) { admin.put('B' + r, '설정' + r); admin.put('D' + r, r); }
  return n;
}

test('AC-8506.1: 새 달 파일 정리: 날짜 시트와 머리 줄이 같은 원본 시트의 남은 글자만 지우고, 식·다른 칸·원본은 그대로', () => {
  const app = load();
  const expected = dirtyTemplate(app);
  const tpl = app.env.template.spreadsheet;
  const tplBefore = tpl.sheets.map((x) => x.snapshot());
  const res = app.post(writeReq(app, { patients: [pt(1001, '시험A', { D: 1, F: 100 })] }));
  assert.equal(res.ok, true, res.error);
  assert.deepEqual([res.created, res.cleaned, res.added], [true, expected, 1]);
  // 원본은 그대로
  assert.deepEqual(tpl.sheets.map((x) => x.snapshot()), tplBefore);
  const ss = app.env.drive.files.get(res.fileId).spreadsheet;
  for (const name of ['1', '일일 수납일지(원본)']) {
    const sh = ss.getSheetByName(name);
    for (let r = 17; r <= 302; r++) {
      for (const L of CLEAN_COLS) {
        if (sh.formula(L + r)) continue;
        assert.equal(sh.val(L + r), name === '1' && L === 'O' && r === 30 ? false : '', name + ' ' + L + r);
      }
      // 식(E·P·S)과 A(NO)는 그대로
      assert.ok(sh.formula('E' + r) && sh.formula('P' + r) && sh.formula('S' + r), name + ' formulas ' + r);
      assert.equal(sh.val('A' + r), r - 16);
    }
    for (const c of sh.clears) {
      assert.equal(c.hadFormula, false);
      assert.ok(CLEAN_COLS.map(colNum).includes(c.col) && c.row >= 17 && c.row <= 302, 'cleared outside ' + c.col + ',' + c.row);
    }
    assert.equal(sh.rangeLists, 1, name);
  }
  const one = ss.getSheetByName('1');
  assert.equal(one.formula('D26'), '=1+1');
  assert.deepEqual(one.rowValues(17, ['H', 'N', 'Q', 'R']), { H: '중간칸', N: 7, Q: '오른쪽', R: 5000 });
  assert.deepEqual(one.cells.get('18,15'), { v: '', f: '', format: 'checkbox' });
  // 머리 줄이 다른 '관리자'와 깨끗한 날짜 시트는 건드리지 않음
  assert.equal(ss.getSheetByName('관리자').snapshot(), tpl.getSheetByName('관리자').snapshot());
  assert.equal(ss.getSheetByName('관리자').clears.length, 0);
  assert.equal(ss.getSheetByName('22').clears.length, 0);
  // 환자 넣기는 정리한 뒤에 했다
  assert.equal(ss.getSheetByName('23').val('B17'), 1001);
});

test('AC-8506.1: 새 달 파일 정리: 있던 달 파일(속성·이름으로 찾은 것)은 지우지 않고, 두 번째부터는 0', () => {
  // 속성에 적힌 달 파일: 두 번째 요청은 cleaned 0, 그 사이 직원이 적은 글자도 그대로
  {
    const app = load();
    const expected = dirtyTemplate(app);
    let res = app.post(writeReq(app));
    assert.deepEqual([res.created, res.cleaned], [true, expected]);
    const one = monthSheet(app, res, '1');
    one.put('B40', 777); one.put('G40', '직원메모');
    res = app.post(writeReq(app, { patients: [pt(1001, '시험A', { D: 1, F: 100 })] }));
    assert.deepEqual([res.ok, res.created, res.cleaned], [true, false, 0]);
    assert.deepEqual(one.rowValues(40, ['B', 'G']), { B: 777, G: '직원메모' });
  }
  // 속성은 없지만 폴더에 같은 이름의 달 파일이 이미 있음(손으로 복사한 것) → 지우지 않음
  {
    const app = load();
    dirtyTemplate(app);
    const old = app.env.template.makeCopy(FILE_NAME, app.env.folder);
    const before = old.spreadsheet.getSheetByName('1').snapshot();
    const res = app.post(writeReq(app));
    assert.deepEqual([res.ok, res.created, res.cleaned, res.fileId], [true, false, 0, old.getId()]);
    assert.equal(old.spreadsheet.getSheetByName('1').snapshot(), before);
  }
});

test('AC-8506.1: 새 달 파일 정리: 지우다 오류가 나면 그 새 파일은 휴지통에 넣고 오류, 다음 번에 새로 만들어 정리', () => {
  const app = load();
  const expected = dirtyTemplate(app);
  const one = app.env.template.spreadsheet.getSheetByName('1');
  one.failClear = 'Service error';
  let res = app.post(writeReq(app));
  assert.deepEqual([res.ok, res.code], [false, 'clean']);
  assert.equal(app.env.props.get('file:' + FILE_NAME), undefined);
  const first = [...app.env.drive.files.values()].filter((f) => f.getName() === FILE_NAME);
  assert.deepEqual(first.map((f) => f.isTrashed()), [true]);
  assert.equal(one.clears.length, 0); // 원본은 안 건드림
  delete one.failClear;
  res = app.post(writeReq(app));
  assert.deepEqual([res.ok, res.created, res.cleaned], [true, true, expected]);
  assert.notEqual(res.fileId, first[0].getId());
});

// ---------------------------------------------------------------- 판 7 (다른 의원 알림 고치기, 2026-11-25)

const NOTE_TEXTS = ['자동차보험', '건강생활잔액'];
const noteLayout = (over = {}) => layout({ noteCol: 'G', noteTexts: NOTE_TEXTS.slice(), ...over });
const OWNED_AND_G = new Set([...OWNED_NUMS, colNum('G')]);
const cell4 = (sheet: FakeSheet, r: number) => sheet.rowValues(r, ['B', 'C', 'D', 'F']);

test('AC-8506.1: 판 7 두 번 들어감 원인 1: 이어지는 줄에 직원이 이름을 적어도 그 환자의 돈 줄로 알아봐 같은 돈을 다시 넣지 않는다', () => {
  for (const mode of ['fillEmpty', 'overwrite']) {
    const app = load();
    const req = () => writeReq(app, { mode, patients: [pt(1001, '시험A', { D: 1, F: 10000 }, [{ D: 2, F: 5000 }]), pt(1002, '시험B', { D: 1, F: 3000 })] });
    let r = app.post(req());
    const sheet = monthSheet(app, r);
    sheet.put('C18', '시험A'); // 직원이 누가 냈는지 이름을 적음
    const before = sheet.snapshot();
    sheet.resetCounters();
    r = app.post(req());
    assert.equal(r.ok, true, r.error);
    assert.deepEqual([r.added, r.inserted, r.skipped], [0, 0, 0], mode);
    assert.equal(sheet.snapshot(), before, mode);
    assert.equal(sheet.writes.length, 0, mode);
  }
});

test('AC-8506.1: 판 7 두 번 들어감 원인 2: 같은 차트번호로 직원이 따로 적은 줄(과 그 이어지는 줄)의 돈은 이미 있는 것으로 센다', () => {
  const app = load();
  const sheet = prepareMonth(app);
  sheet.put('B17', 1001); sheet.put('C17', '시험A'); sheet.put('D17', 1); sheet.put('F17', 10000);
  sheet.put('B18', 9001); sheet.put('C18', '시험X'); sheet.put('D18', 1); sheet.put('F18', 1);
  sheet.put('B20', 1001); sheet.put('C20', '시험A'); sheet.put('D20', 2); sheet.put('F20', 5000); // 직원이 따로 적은 줄
  sheet.put('D21', 5); sheet.put('F21', 700); // 그 줄의 이어지는 줄
  const before = sheet.snapshot();
  const want = [{ D: 2, F: 5000 }, { D: 5, F: 700 }];
  let r = app.post(writeReq(app, { patients: [pt(1001, '시험A', { D: 1, F: 10000 }, want)] }));
  assert.equal(r.ok, true, r.error);
  assert.deepEqual([r.added, r.inserted, r.filled, r.skipped], [0, 0, 0, 0]);
  assert.equal(sheet.snapshot(), before);
  assert.equal(sheet.writes.length, 0);
  // 정말 새로 낸 돈만 본 줄 아래에 붙는다(직원 줄은 그대로)
  r = app.post(writeReq(app, { patients: [pt(1001, '시험A', { D: 1, F: 10000 }, want.concat([{ D: 3, F: 900 }]))] }));
  assert.deepEqual([r.added, r.inserted], [1, 1]);
  assert.deepEqual(cell4(sheet, 18), { B: '', C: '', D: 3, F: 900 });
  assert.deepEqual(cell4(sheet, 21), { B: 1001, C: '시험A', D: 2, F: 5000 });
  assertSafeWrites(sheet);
});

test('AC-8506.1: 판 7 nameOnMore: 새 환자의 둘째·셋째 돈 줄에도 이름, 다시 돌려도 그대로(두 모드)', () => {
  for (const mode of ['fillEmpty', 'overwrite']) {
    const app = load();
    const req = () => writeReq(app, {
      mode,
      layout: layout({ nameOnMore: true }),
      patients: [pt(1001, '시험A', { D: 1, F: 10000, I: 1 }, [{ D: 2, F: 5000 }, { D: 5, F: 700 }]), pt(1002, '시험B', { D: 1, F: 3000 })]
    });
    let r = app.post(req());
    assert.equal(r.ok, true, r.error);
    const sheet = monthSheet(app, r);
    assert.deepEqual(sheet.rowValues(18, ['B', 'C', 'D', 'F', 'I']), { B: '', C: '시험A', D: 2, F: 5000, I: '' }, mode);
    assert.deepEqual(cell4(sheet, 19), { B: '', C: '시험A', D: 5, F: 700 }, mode);
    assert.equal(sheet.val('B20'), 1002, mode);
    const before = sheet.snapshot();
    sheet.resetCounters();
    r = app.post(req());
    assert.deepEqual([r.added, r.filled, r.overwritten, r.inserted], [0, 0, 0, 0], mode);
    assert.equal(sheet.snapshot(), before, mode);
    assert.equal(sheet.writes.length, 0, mode);
  }
});

test('AC-8506.1: 판 7 nameOnMore: 있던 이어지는 줄의 빈 이름 칸을 채운다(줄마다 한 번 셈), 덮어쓰기도 이름을 쓴다', () => {
  for (const mode of ['fillEmpty', 'overwrite']) {
    const app = load();
    const patients = [pt(1001, '시험A', { D: 1, F: 10000 }, [{ D: 2, F: 5000 }, { D: 5, F: 700 }])];
    let r = app.post(writeReq(app, { patients })); // 판 6처럼 이름 없이
    const sheet = monthSheet(app, r);
    assert.equal(sheet.val('C18'), '');
    sheet.put('D18', ''); // 직원이 지운 돈 칸도 같은 줄
    r = app.post(writeReq(app, { mode, layout: layout({ nameOnMore: true }), patients }));
    assert.equal(r.ok, true, r.error);
    assert.deepEqual(cell4(sheet, 18), { B: '', C: '시험A', D: 2, F: 5000 }, mode);
    assert.deepEqual(cell4(sheet, 19), { B: '', C: '시험A', D: 5, F: 700 }, mode);
    if (mode === 'fillEmpty') assert.deepEqual([r.filled, r.overwritten, r.added], [2, 0, 0]);
    else assert.deepEqual([r.filled, r.overwritten, r.added], [0, 2, 0]);
  }
});

test('AC-8506.1: 판 7 이어지는 줄의 돈을 비우면 본 줄 이름과 같은 이름도 비운다(덮어쓰기·늦게 붙은 FREE, 표시 없이도)', () => {
  // 덮어쓰기: 비트에 더 없는 이어지는 줄
  for (const flag of [true, false]) {
    const app = load();
    let r = app.post(writeReq(app, { layout: layout({ nameOnMore: flag }), patients: [pt(1001, '시험A', { D: 1, F: 100 }, [{ D: 2, F: 50 }, { D: 5, F: 7 }])] }));
    const sheet = monthSheet(app, r);
    if (!flag) { sheet.put('C18', '시험A'); sheet.put('C19', '시험A'); } // 직원이 적은 이름
    r = app.post(writeReq(app, { mode: 'overwrite', layout: layout({ nameOnMore: flag }), patients: [pt(1001, '시험A', { D: 1, F: 100 }, [{ D: 2, F: 50 }])] }));
    assert.equal(r.ok, true, r.error);
    assert.deepEqual(cell4(sheet, 18), { B: '', C: '시험A', D: 2, F: 50 }, String(flag));
    assert.deepEqual(cell4(sheet, 19), { B: '', C: '', D: '', F: '' }, String(flag));
  }
  // 늦게 붙은 FREE: 비운 둘째 줄의 이름도 비운다
  const app = load();
  const L = layout({ nameOnMore: true });
  let r = app.post(writeReq(app, { layout: L, patients: [pt(1001, '시험A', { D: 1, F: 8000 }, [{ D: 2, F: 2000 }]), pt(1002, '시험B', { D: 1, F: 1 })] }));
  const sheet = monthSheet(app, r);
  assert.equal(sheet.val('C18'), '시험A');
  r = app.post(writeReq(app, { layout: L, patients: [freePt(1001, '시험A', { D: 6, F: 0 }, undefined, [{ D: 2, F: 2000 }, { D: 1, F: 8000 }]), pt(1002, '시험B', { D: 1, F: 1 })] }));
  assert.equal(r.freeFixed, 1);
  assert.deepEqual(cell4(sheet, 17), { B: 1001, C: '시험A', D: 6, F: 0 });
  assert.deepEqual(cell4(sheet, 18), { B: '', C: '', D: '', F: '' });
  assertSafeWrites(sheet);
});

test('AC-8506.1: 판 7 nameOnMore 없이 보내면 이어지는 줄의 이름 칸은 예전처럼 비워 두고, 덮어쓰기도 직원이 적은 이름은 남긴다', () => {
  const app = load();
  const patients = [pt(1001, '시험A', { D: 1, F: 100 }, [{ D: 2, F: 50, C: '시험A' }])];
  let r = app.post(writeReq(app, { patients }));
  const sheet = monthSheet(app, r);
  assert.equal(sheet.val('C18'), '');
  sheet.put('C18', '시험A');
  r = app.post(writeReq(app, { mode: 'overwrite', patients }));
  assert.deepEqual([r.overwritten, r.added], [0, 0]);
  assert.equal(sheet.val('C18'), '시험A');
});

// 미수만 낸 환자(그날 내원 없이 예전 미수만 낸 사람)
const paid = (name: string, D: unknown, F: unknown, more?: Cells[], before?: unknown) => {
  const x: { cells: Cells; more?: Cells[]; before?: unknown } = { cells: { B: 7777, C: name, D, F } };
  if (more) x.more = more;
  if (before !== undefined) x.before = before;
  return x;
};

test('AC-8506.1: 판 7 미수만 낸 환자: 받은 차례대로 환자 사이에, 차트번호 없이 모든 줄에 이름·돈, 다시 돌려도 그대로(두 모드)', () => {
  for (const mode of ['fillEmpty', 'overwrite']) {
    const app = load();
    const req = () => writeReq(app, {
      mode,
      patients: [pt(1001, '시험A', { D: 1, F: 100 }), pt(1002, '시험B', { D: 1, F: 200 })],
      paidOnly: [paid('미수환자', 5, 3000, [{ B: 7777, D: 2, F: 1000 }, { D: '', F: '' }], 1), paid('미수끝', 4, 500)]
    });
    let r = app.post(req());
    assert.equal(r.ok, true, r.error);
    assert.equal(r.added, 5, mode);
    const sheet = monthSheet(app, r);
    assert.equal(sheet.val('B17'), 1001, mode);
    assert.deepEqual(cell4(sheet, 18), { B: '', C: '미수환자', D: 5, F: 3000 }, mode);
    assert.deepEqual(cell4(sheet, 19), { B: '', C: '미수환자', D: 2, F: 1000 }, mode);
    assert.equal(sheet.val('B20'), 1002, mode);
    assert.deepEqual(cell4(sheet, 21), { B: '', C: '미수끝', D: 4, F: 500 }, mode);
    assertSafeWrites(sheet);
    const before = sheet.snapshot();
    sheet.resetCounters();
    r = app.post(req());
    assert.deepEqual([r.added, r.filled, r.overwritten, r.inserted, r.skipped], [0, 0, 0, 0, 0], mode);
    assert.equal(sheet.snapshot(), before, mode);
    assert.equal(sheet.writes.length, 0, mode);
  }
});

test('AC-8506.1: 판 7 미수만 낸 환자: 둘째 미수를 내면 제 블록 끝 바로 아래에 줄을 끼워 붙인다', () => {
  const app = load();
  const patients = [pt(1001, '시험A', { D: 1, F: 100 }), pt(1002, '시험B', { D: 1, F: 200 })];
  let r = app.post(writeReq(app, { patients, paidOnly: [paid('미수환자', 5, 3000, undefined, 1)] }));
  const sheet = monthSheet(app, r);
  assert.equal(sheet.val('B19'), 1002);
  const req = () => writeReq(app, { patients, paidOnly: [paid('미수환자', 5, 3000, [{ D: 5, F: 2000 }], 1)] });
  r = app.post(req());
  assert.equal(r.ok, true, r.error);
  assert.deepEqual([r.added, r.inserted], [1, 1]);
  assert.deepEqual(cell4(sheet, 19), { B: '', C: '미수환자', D: 5, F: 2000 });
  assert.equal(sheet.val('B20'), 1002);
  const before = sheet.snapshot();
  r = app.post(req());
  assert.deepEqual([r.added, r.inserted, r.filled], [0, 0, 0]);
  assert.equal(sheet.snapshot(), before);
  assertSafeWrites(sheet);
});

test('AC-8506.1: 판 7 미수만 낸 환자: 차트번호가 적힌 같은 이름 줄(과 그 아래 이름 빈 돈 줄)에 이미 있는 짝은 더하지 않는다', () => {
  const app = load();
  const sheet = prepareMonth(app);
  sheet.put('B17', 1003); sheet.put('C17', '시험P'); sheet.put('D17', 5); sheet.put('F17', 3000);
  sheet.put('D18', 2); sheet.put('F18', 1000);
  const before = sheet.snapshot();
  for (const mode of ['fillEmpty', 'overwrite']) {
    const r = app.post(writeReq(app, { mode, paidOnly: [paid('시험P', 5, 3000, [{ D: 2, F: 1000 }])] }));
    assert.equal(r.ok, true, r.error);
    assert.deepEqual([r.added, r.filled], [0, 0], mode);
    assert.equal(sheet.snapshot(), before, mode);
  }
  assert.equal(sheet.writes.length, 0);
});

test('AC-8506.1: 판 7 미수만 낸 환자: 빈 칸만 채우기에서는 제 블록 이어지는 줄의 빈 이름 칸을 채운다', () => {
  const app = load();
  const sheet = prepareMonth(app);
  sheet.put('C17', '시험P'); sheet.put('D17', 5); sheet.put('F17', 3000);
  sheet.put('D18', 2); sheet.put('F18', 1000);
  const r = app.post(writeReq(app, { paidOnly: [paid('시험P', 5, 3000, [{ D: 2, F: 1000 }])] }));
  assert.deepEqual([r.added, r.filled], [0, 1]);
  assert.deepEqual(cell4(sheet, 18), { B: '', C: '시험P', D: 2, F: 1000 });
  assertSafeWrites(sheet);
});

test('AC-8506.1: 판 7 미수만 낸 줄이 있던 사람이 나중에 내원하면 그 줄을 본 줄로 삼아 차트번호를 채운다(새 줄을 따로 만들지 않음)', () => {
  const app = load();
  let r = app.post(writeReq(app, { paidOnly: [paid('시험P', 5, 3000)] }));
  const sheet = monthSheet(app, r);
  assert.deepEqual(cell4(sheet, 17), { B: '', C: '시험P', D: 5, F: 3000 });
  sheet.put('B19', 1009); sheet.put('C19', '다음환자');
  const req = () => writeReq(app, { patients: [pt(1003, '시험P', { D: 1, F: 5000, I: 1 }, [{ D: 5, F: 3000 }])] });
  r = app.post(req());
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(sheet.rowValues(17, ['B', 'C', 'D', 'F', 'I']), { B: 1003, C: '시험P', D: 5, F: 3000, I: 1 });
  assert.deepEqual(cell4(sheet, 18), { B: '', C: '', D: 1, F: 5000 });
  assert.deepEqual([r.added, r.filled], [1, 1]);
  const before = sheet.snapshot();
  r = app.post(req());
  assert.deepEqual([r.added, r.filled, r.inserted], [0, 0, 0]);
  assert.equal(sheet.snapshot(), before);
  // 같은 이름이라도 위 줄의 이어지는 줄(위 줄 이름이 같음)이나 짝이 다른 줄은 붙이지 않는다
  const app2 = load();
  const s2 = prepareMonth(app2);
  s2.put('B17', 2001); s2.put('C17', '시험Q'); s2.put('D17', 1); s2.put('F17', 1);
  s2.put('C18', '시험Q'); s2.put('D18', 5); s2.put('F18', 3000);
  s2.put('C20', '시험Q'); s2.put('D20', 5); s2.put('F20', 9999);
  r = app2.post(writeReq(app2, { patients: [pt(2002, '시험Q', { D: 5, F: 3000 })] }));
  assert.equal(r.added, 1);
  assert.equal(s2.val('B18'), '');
  assert.equal(s2.val('B20'), '');
  assert.equal(s2.val('B19'), 2002);
});

test('AC-8506.1: 판 7 미수만 낸 환자: 이름 칸이 없는 모양이면 무시하고, 모양이 틀리면 bad_request(값은 글에 안 나옴)', () => {
  const app = load();
  let r = app.post(writeReq(app, { layout: layout({ nameCol: '' }), paidOnly: [paid('시험P', 5, 3000)] }));
  assert.equal(r.ok, true, r.error);
  assert.equal(r.added, 0);
  for (const over of [
    { paidOnly: 'x' },
    { paidOnly: [1] },
    { paidOnly: [{ cells: { C: '', D: 5, F: 10 } }] },
    { paidOnly: [{ cells: { D: 5, F: 10 } }] },
    { paidOnly: [{ cells: { C: '비밀이름', D: { x: 1 } } }] },
    { paidOnly: [{ cells: { C: '비밀이름', D: 5, F: 10 }, more: 'x' }] },
    { paidOnly: [{ cells: 'x' }] }
  ]) {
    r = app.post(writeReq(app, over));
    assert.equal(r.code, 'bad_request', JSON.stringify(over));
    assert.ok(!r.error.includes('비밀이름'));
  }
  // 돈이 하나도 없으면 넣을 것이 없다
  r = app.post(writeReq(app, { paidOnly: [paid('시험P', '', '')] }));
  assert.deepEqual([r.ok, r.added], [true, 0]);
});

test('AC-8506.1: 판 7 미수만 낸 환자: before는 0~환자 수로 자르고, 정수가 아니면 맨 끝', () => {
  const app = load();
  const r = app.post(writeReq(app, {
    patients: [pt(1001, '시험A', { D: 1, F: 100 })],
    paidOnly: [paid('끝1', 5, 1, undefined, 1.5), paid('앞', 5, 2, undefined, -3), paid('끝2', 5, 3, undefined, 99)]
  }));
  const sheet = monthSheet(app, r);
  assert.deepEqual([17, 18, 19, 20].map((n) => sheet.val('C' + n)), ['앞', '시험A', '끝1', '끝2']);
});

test('AC-8506.1: 판 7 구글 오류 글에 섞인 미수만 낸 환자 이름도 가린다', () => {
  const app = load();
  const sheet = prepareMonth(app);
  sheet.failSetValues = 'bad value 미수비밀 rejected';
  const r = app.post(writeReq(app, { paidOnly: [paid('미수비밀', 5, 3000)] }));
  assert.equal(r.code, 'google');
  assert.ok(!r.error.includes('미수비밀'));
});

// 비고(자동차보험·건강생활잔액)
const notePt = (key: string | number, name: string, note: unknown, extra: Cells = { D: 1, F: 100 }, more?: Cells[]) => ({ ...pt(key, name, extra, more), note });

test('AC-8506.1: 판 7 비고: 새 환자 본 줄에만 쓰고(이어지는 줄은 비움), 다시 돌려도 그대로', () => {
  for (const mode of ['fillEmpty', 'overwrite']) {
    const app = load();
    const req = () => writeReq(app, { mode, layout: noteLayout(), patients: [notePt(1001, '시험A', '자동차보험', { D: 1, F: 100 }, [{ D: 2, F: 50 }]), notePt(1002, '시험B', '')] });
    let r = app.post(req());
    assert.equal(r.ok, true, r.error);
    const sheet = monthSheet(app, r);
    assert.deepEqual([17, 18, 19].map((n) => sheet.val('G' + n)), ['자동차보험', '', ''], mode);
    assertSafeWrites(sheet, OWNED_AND_G);
    const before = sheet.snapshot();
    sheet.resetCounters();
    r = app.post(req());
    assert.deepEqual([r.added, r.filled, r.overwritten], [0, 0, 0], mode);
    assert.equal(sheet.snapshot(), before, mode);
  }
});

test('AC-8506.1: 판 7 비고: 빈 칸·프로그램이 쓴 다른 글이면 바꾸고, 직원 글·식은 그대로', () => {
  for (const mode of ['fillEmpty', 'overwrite']) {
    const app = load();
    const sheet = prepareMonth(app);
    const row = (r: number, key: string | number, name: string) => { sheet.put('B' + r, key); sheet.put('C' + r, name); sheet.put('D' + r, 1); sheet.put('F' + r, 100); };
    row(17, 1001, '시험A');
    row(18, 1002, '시험B'); sheet.put('G18', '건강생활잔액');
    row(19, 1003, '시험C'); sheet.put('G19', '직원메모');
    row(20, 1004, '시험D'); sheet.putFormula('G20', '=1', 1);
    const r = app.post(writeReq(app, {
      mode,
      layout: noteLayout(),
      patients: ['시험A', '시험B', '시험C', '시험D'].map((n, i) => notePt(1001 + i, n, '자동차보험'))
    }));
    assert.equal(r.ok, true, r.error);
    assert.deepEqual(['G17', 'G18', 'G19'].map((a) => sheet.val(a)), ['자동차보험', '자동차보험', '직원메모'], mode);
    assert.equal(sheet.formula('G20'), '=1', mode);
    if (mode === 'fillEmpty') assert.deepEqual([r.filled, r.overwritten], [2, 0]);
    else assert.deepEqual([r.filled, r.overwritten], [0, 2]);
    assertSafeWrites(sheet, OWNED_AND_G);
  }
});

test('AC-8506.1: 판 7 비고: 비트에서 비고가 없어지면 덮어쓰기만 프로그램이 쓴 글을 비운다(빈 칸만 채우기는 그대로)', () => {
  const app = load();
  const sheet = prepareMonth(app);
  sheet.put('B17', 1001); sheet.put('C17', '시험A'); sheet.put('G17', '자동차보험');
  sheet.put('B18', 1002); sheet.put('C18', '시험B'); sheet.put('G18', '직원메모');
  const patients = [notePt(1001, '시험A', '', {}), notePt(1002, '시험B', '', {})];
  let r = app.post(writeReq(app, { layout: noteLayout(), patients }));
  assert.deepEqual([r.filled, r.overwritten], [0, 0]);
  assert.equal(sheet.val('G17'), '자동차보험');
  r = app.post(writeReq(app, { mode: 'overwrite', layout: noteLayout(), patients }));
  assert.deepEqual([r.filled, r.overwritten], [0, 1]);
  assert.deepEqual([sheet.val('G17'), sheet.val('G18')], ['', '직원메모']);
});

test('AC-8506.1: 판 7 비고: 취소된 접수 줄의 비고 칸에 프로그램이 쓴 글만 있으면 빈 칸으로 보고 같이 지운다', () => {
  const app = load();
  const sheet = prepareMonth(app);
  sheet.put('B17', 1001); sheet.put('C17', '취소A'); sheet.put('G17', '자동차보험');
  sheet.put('B18', 1002); sheet.put('C18', '취소B'); sheet.put('G18', '직원메모');
  sheet.put('B19', 1003); sheet.put('C19', '취소C'); sheet.put('D20', 1); sheet.put('F20', 5); sheet.put('C20', '취소C'); // 이름이 적힌 이어지는 줄
  const r = app.post(cancelReq(app, [[1001, '취소A'], [1002, '취소B'], [1003, '취소C']], { layout: noteLayout() }));
  assert.equal(r.ok, true, r.error);
  assert.deepEqual([r.cancelCleared, r.cancelKept], [1, 2]);
  assert.deepEqual(sheet.rowValues(17, ['B', 'C', 'G']), { B: '', C: '', G: '' });
  assert.deepEqual(sheet.rowValues(18, ['B', 'C', 'G']), { B: 1002, C: '취소B', G: '직원메모' });
  assert.equal(sheet.val('B19'), 1003);
  assertSafeWrites(sheet, OWNED_AND_G);
  // 비고 칸을 모르는 요청(옛 판)은 프로그램 글도 직원 글로 본다
  const app2 = load();
  const s2 = prepareMonth(app2);
  s2.put('B17', 1001); s2.put('C17', '취소A'); s2.put('G17', '자동차보험');
  const r2 = app2.post(cancelReq(app2, [[1001, '취소A']]));
  assert.deepEqual([r2.cancelCleared, r2.cancelKept], [0, 1]);
});

test('AC-8506.1: 판 7 비고: 모양 검사(owned·차트번호·이름 칸과 겹침, 목록 아님, 밀어 내릴 칸 밖, 글 아님)', () => {
  const app = load();
  for (const over of [
    { layout: layout({ noteCol: 'D' }) },
    { layout: layout({ noteCol: 'C' }) },
    { layout: layout({ noteCol: 'B' }) },
    { layout: layout({ ownedCols: ['B', 'D', 'F'], nameCol: 'C', noteCol: 'C' }) },
    { layout: layout({ noteCol: '1' }) },
    { layout: layout({ noteCol: 'G', noteTexts: '자동차보험' }) },
    { layout: layout({ staffCols: ['G'], shiftCols: 'A:M', noteCol: 'Q' }) },
    { layout: noteLayout(), patients: [{ ...pt(1001, '시험A'), note: 3 }] }
  ]) {
    const res = app.post(writeReq(app, over));
    assert.equal(res.code, 'bad_request', JSON.stringify(over));
  }
  // 밀어 내릴 칸을 주지 않으면 비고 칸이 밖이어도 받는다(줄 끼우기만 꺼짐)
  const ok = app.post(writeReq(app, { layout: layout({ staffCols: ['G'], noteCol: 'Q', noteTexts: NOTE_TEXTS }), patients: [notePt(1001, '시험A', '자동차보험')] }));
  assert.equal(ok.ok, true, ok.error);
  assert.equal(monthSheet(app, ok).val('Q17'), '자동차보험');
});

test('AC-8506.1: 판 7 새 달 파일 정리는 비고 칸도 지운다', () => {
  const app = load();
  const expected = dirtyTemplate(app);
  const res = app.post(writeReq(app, { layout: layout({ noteCol: 'H', noteTexts: NOTE_TEXTS }) }));
  assert.equal(res.ok, true, res.error);
  assert.equal(res.cleaned, expected + 1);
  const one = app.env.drive.files.get(res.fileId).spreadsheet.getSheetByName('1');
  assert.deepEqual(one.rowValues(17, ['H', 'N', 'Q', 'R']), { H: '', N: 7, Q: '오른쪽', R: 5000 });
});

test('AC-8506.1: 판 7 줄 끼우기는 비고 칸이 있어도 그대로 된다(비고는 본 줄과 함께 내려감)', () => {
  const app = load();
  const L = noteLayout();
  let r = app.post(writeReq(app, { layout: L, patients: [notePt(1001, '시험A', '자동차보험'), notePt(1002, '시험B', '건강생활잔액')] }));
  const sheet = monthSheet(app, r);
  r = app.post(writeReq(app, { layout: L, patients: [notePt(1001, '시험A', '자동차보험', { D: 1, F: 100 }, [{ D: 2, F: 50 }]), notePt(1002, '시험B', '건강생활잔액')] }));
  assert.equal(r.ok, true, r.error);
  assert.deepEqual([r.added, r.inserted], [1, 1]);
  assert.deepEqual(sheet.rowValues(18, ['B', 'D', 'F', 'G']), { B: '', D: 2, F: 50, G: '' });
  assert.deepEqual(sheet.rowValues(19, ['B', 'G']), { B: 1002, G: '건강생활잔액' });
  assertSafeWrites(sheet, OWNED_AND_G);
});

// ---------------------------------------------------------------- 판 7 비율 식(사용자 2026-11-25 "비율 식을 차트번호로 세게 고침")

const RATIO_COLS = ['J', 'K', 'L', 'M'];
const ratioOld = (X: string) => '=ROUND(COUNTIF(' + X + '17:' + X + '303, 0) / COUNTA(C17:C303) * 100, 1) & "%"';
const ratioNew = (X: string) => '=ROUND(COUNTIF(' + X + '17:' + X + '303, 0) / COUNT(B17:B303) * 100, 1) & "%"';

/** 원본에 실제와 같은 비율 식(J9:M9)을 넣는다: 날짜 시트 22~24·'1', 머리 줄이 같은 '일일 수납일지(원본)', 머리 줄이 다른 '관리자'(같은 식이 있어도 안 봄). */
function ratioTemplate(app: App) {
  const tpl = app.env.template.spreadsheet;
  tpl.sheets.push(makeDateSheet('1', 300), makeDateSheet('일일 수납일지(원본)', 301));
  const sheets = tpl.sheets.filter((s) => s.name !== '관리자');
  for (const s of sheets) for (const X of RATIO_COLS) s.putFormula(X + '9', ratioOld(X), '0%');
  tpl.getSheetByName('관리자').putFormula('C9', '=COUNTA(C17:C303)', 0);
  return sheets.map((s) => s.name);
}

const monthBook = (app: App, res: Reply) => app.env.drive.files.get(res.fileId).spreadsheet;

test('AC-8506.1: 판 7 비율 식: 새 달 파일의 날짜 시트·원본 시트 J9:M9 분모를 차트번호로 바꾸고, 다른 식·원본 파일은 그대로', () => {
  const app = load();
  const names = ratioTemplate(app);
  const res = app.post(writeReq(app));
  assert.equal(res.ok, true, res.error);
  assert.deepEqual(res.ratioFormulas, { fixed: names.length * 4, skipped: [], skippedCount: 0, failed: false });
  const book = monthBook(app, res);
  for (const n of names) {
    const sh = book.getSheetByName(n);
    for (const X of RATIO_COLS) assert.equal(sh.formula(X + '9'), ratioNew(X), n + '!' + X + '9');
    assert.equal(sh.formula('J5'), '=COUNTIF(J17:J303,0)', '다른 식은 그대로');
    assert.equal(sh.formula('E17').startsWith('=IF('), true);
    assert.equal(sh.writes.length, 0, '값 칸은 안 씀');
  }
  assert.equal(book.getSheetByName('관리자').formula('C9'), '=COUNTA(C17:C303)', '환자 시트가 아니면 안 봄');
  const tpl = app.env.template.spreadsheet;
  for (const s of tpl.sheets.filter((x) => x.name !== '관리자')) assert.equal(s.formula('J9'), ratioOld('J'), '원본 파일은 그대로');
  // 시트마다 가로로 붙은 J9:M9는 한 번에 쓴다
  assert.equal(book.getSheetByName('23').formulaWrites.length, 4);
});

test('AC-8506.1: 판 7 비율 식: 모양이 다른 식은 그대로 두고 skipped에 시트!칸으로 알린다(이름·값 없음)', () => {
  const app = load();
  ratioTemplate(app);
  const tpl = app.env.template.spreadsheet.getSheetByName('23');
  const odd = '=ROUND(COUNTIF(J17:J303, 0) / COUNTA($C$17:$C$303) * 100, 1) & "%"';
  const odd2 = '=COUNTIF(K17:K303, 0) / COUNTA(C17:C303)';
  const odd3 = '=ROUND(COUNTIF(L17:L250, 0) / COUNTA(C17:C250) * 100, 1) & "%"'; // lastRow 302보다 짧음
  tpl.putFormula('J9', odd); tpl.putFormula('K9', odd2); tpl.putFormula('L9', odd3);
  const res = app.post(writeReq(app));
  assert.equal(res.ok, true, res.error);
  assert.deepEqual(res.ratioFormulas.skipped, ['23!J9', '23!K9', '23!L9']);
  assert.equal(res.ratioFormulas.skippedCount, 3);
  const sh = monthBook(app, res).getSheetByName('23');
  assert.deepEqual(['J9', 'K9', 'L9', 'M9'].map((a) => sh.formula(a)), [odd, odd2, odd3, ratioNew('M')]);
  // 다시 돌려도 그 시트를 볼 때마다 같은 칸을 알린다(바꾸지는 않음)
  const again = app.post(writeReq(app));
  assert.deepEqual(again.ratioFormulas, { fixed: 0, skipped: ['23!J9', '23!K9', '23!L9'], skippedCount: 3, failed: false });
});

test('AC-8506.1: 판 7 비율 식: 이미 고친 식은 건드리지 않고, 두 번째부터는 넣는 시트만 보며 아무것도 안 바꾼다', () => {
  const app = load();
  ratioTemplate(app);
  app.env.template.spreadsheet.getSheetByName('24').putFormula('J9', ratioNew('J'));
  const first = app.post(writeReq(app));
  assert.equal(first.ok, true, first.error);
  const book = monthBook(app, first);
  assert.equal(book.getSheetByName('24').formulaWrites.length, 3, '이미 고친 J9는 안 씀');
  assert.equal(first.ratioFormulas.fixed, 5 * 4 - 1);
  book.getSheets().forEach((s) => s.resetCounters());
  const second = app.post(writeReq(app));
  assert.deepEqual(second.ratioFormulas, { fixed: 0, skipped: [], skippedCount: 0, failed: false });
  for (const s of book.getSheets()) {
    assert.equal(s.formulaWrites.length, 0, s.name + ' 다시 안 씀');
    assert.equal(s.formulaReads, s.name === '23' ? 2 : 0, s.name + ' 식 읽기(넣는 시트만)'); // 23 = 넣기 1번 + 비율 1번
  }
  // 넣는 시트의 식이 원래대로 돌아가 있으면(직원이 되돌림) 그 시트는 다시 고친다
  book.getSheetByName('23').putFormula('K9', ratioOld('K'));
  const third = app.post(writeReq(app));
  assert.equal(third.ratioFormulas.fixed, 1);
  assert.equal(book.getSheetByName('23').formula('K9'), ratioNew('K'));
});

test('AC-8506.1: 판 7 비율 식: 예전 판이 만든 달 파일도 처음 한 번은 전부 보고, 고치다 오류가 나도 넣기는 끝낸다', () => {
  const app = load();
  ratioTemplate(app);
  const made = app.post(writeReq(app));
  const book = monthBook(app, made);
  // 예전 판이 만든 파일처럼: 표시를 지우고 식을 원래대로
  app.env.props.delete('ratio:' + made.fileId);
  for (const s of book.getSheets()) if (s.name !== '관리자') for (const X of RATIO_COLS) s.putFormula(X + '9', ratioOld(X));
  book.getSheetByName('24').failSetFormulas = 'protected range';
  const failed = app.post(writeReq(app, { patients: [pt(1001, '시험A', { D: 1, F: 100 })] }));
  assert.equal(failed.ok, true, failed.error);
  assert.equal(failed.added, 1, '넣기는 됨');
  assert.equal(failed.ratioFormulas.failed, true);
  assert.equal(app.env.props.has('ratio:' + made.fileId), false, '표시를 안 남김(다음에 다시)');
  book.getSheetByName('24').failSetFormulas = null;
  const ok = app.post(writeReq(app, { patients: [pt(1001, '시험A', { D: 1, F: 100 })] }));
  assert.equal(ok.ratioFormulas.failed, false);
  for (const s of book.getSheets()) if (s.name !== '관리자') assert.equal(s.formula('M9'), ratioNew('M'), s.name);
  assert.equal(app.env.props.has('ratio:' + made.fileId), true);
});

test('AC-8506.1: 판 7 비율 식: 칸 설정을 따른다(차트번호·이름 칸, 첫 줄), 이름 칸이 없으면 보지 않는다', () => {
  const app = load();
  const tpl = app.env.template.spreadsheet.getSheetByName('23');
  tpl.putFormula('J9', '=ROUND(COUNTIF(J17:J303, 0) / COUNTA(D17:D303) * 100, 1) & "%"');
  const L = layout({ keyCol: 'C', nameCol: 'D', ownedCols: ['C', 'D', 'E', 'F', 'I', 'J', 'K', 'L', 'M'], moneyCols: ['E', 'F'], shiftCols: '' });
  const res = app.post(writeReq(app, { layout: L }));
  assert.equal(res.ok, true, res.error);
  assert.equal(monthBook(app, res).getSheetByName('23').formula('J9'), '=ROUND(COUNTIF(J17:J303, 0) / COUNT(C17:C303) * 100, 1) & "%"');
  const app2 = load();
  app2.env.template.spreadsheet.getSheetByName('23').putFormula('J9', ratioOld('J'));
  const noName = layout({ nameCol: '' });
  const r2 = app2.post(writeReq(app2, { layout: noName }));
  assert.equal(r2.ok, true, r2.error);
  assert.deepEqual(r2.ratioFormulas, { fixed: 0, skipped: [], skippedCount: 0, failed: false });
  assert.equal(monthBook(app2, r2).getSheetByName('23').formula('J9'), ratioOld('J'));
});
