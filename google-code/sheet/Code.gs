/**
 * 수납일지 구글 코드(판 8) - 병원 구글 계정에 붙이는 웹 앱
 *
 * 넣는 PC의 청구 도우미가 보낸 비트 수납 환자 줄을 그 달 '일일 수납일지' 파일의
 * 날짜 시트('1'~'31')에 넣는다. 넣기 규칙은 비트시트 7판 그대로다(비트시트 DESIGN.md 4장).
 * 8판에서 더한 것(웹앱 specs/google-link design.md 8-1):
 *  - hello: 비밀 글자 없이 nonce만 받아 HMAC-SHA256(비밀 글자, nonce)를 돌려준다(이 코드가 그 비밀 글자를 아는지만 본다).
 *  - months: 달마다 파일 이름으로 이미 있는 달 파일 id와 날짜 시트 gid를 찾는다(만들지 않는다).
 *  - 원본 시트·넣을 폴더가 이 구글 계정 것이 아니면 거절한다. write 답에 sheetGid(넣은 날짜 시트 gid).
 *  - 배포 주소는 묻지 않는다(편집기마다 다른 주소를 줄 수 있다). 주소가 맞는지는 넣는 PC의 확인 창에서 사람이 본다.
 *
 * 이 코드는 웹앱 설정의 [구글에 붙일 코드 복사] 단추로 복사해서 붙인다(도우미가 비밀 글자를 넣어 복사한다).
 * 손으로 고치지 않는다. 이름·차트번호는 기록(로그)이나 오류 글에 내지 않는다.
 */

// 아래 줄의 비밀 글자 자리는 도우미가 복사할 때 바꿔 넣는다.
// 그 자리 글자는 이 파일 안에서 아래 한 번만 나와야 한다(도우미가 그대로 바꿔 끼우므로).
const TOKEN = '__TOKEN__';

const BITSHEET_VERSION = '8';
const TOKEN_PLACEHOLDER_ = '__' + 'TOKEN' + '__';
const TOKEN_MIN_LENGTH_ = 16;
const SHEETS_MIME_ = 'application/vnd.google-apps.spreadsheet';
const LOCK_WAIT_MS_ = 30000;
const MAX_REGION_ROWS_ = 5000;
const DEFAULT_STAFF_COLS_ = ['G', 'O']; // 비고 · 예약관리(직원이 적는 칸)
const DEFAULT_SHIFT_COLS_ = 'A:P'; // 줄을 끼울 때 아래로 미는 환자 칸(지출 R:T·옆 표 V:AB는 그대로)
const HEADER_WIDTH_ = 16; // 새 달 파일 정리: 머리 줄을 견줄 칸 A~P
const RATIO_MARK_ = 'ratio:'; // 비율 식 고치기: 그 달 파일 전부를 한 번 본 표시(스크립트 속성 ratio:<파일 ID>)
const RATIO_RULE_ = 'r1'; // 비율 식 고치기 규칙 판(바꾸면 모든 달 파일을 한 번 다시 본다)
const RATIO_LIST_MAX_ = 20; // 답에 담을 '모양이 달라 그대로 둔 칸' 이름 수
const NONCE_RE_ = /^[A-Za-z0-9_-]{16,64}$/; // hello의 nonce 꼴
const MONTHS_MAX_ = 13; // months 한 번에 볼 달 수
const DAY_SHEET_RE_ = /^(?:[1-9]|[12]\d|3[01])$/; // 날짜 시트 이름 '1'~'31'

/** 주소를 브라우저로 열면 짧은 글만 보여 준다. 자료는 내지 않는다. */
function doGet() {
  return ContentService.createTextOutput('Seoseungkwan sheet ok').setMimeType(ContentService.MimeType.TEXT);
}

/** 프로그램이 JSON을 보낸다. 답도 JSON이다. */
function doPost(e) {
  let req = null;
  let result;
  try {
    const body = e && e.postData && typeof e.postData.contents === 'string' ? e.postData.contents : '';
    try {
      req = JSON.parse(body);
    } catch (ignored) {
      req = null;
    }
    if (!isObj_(req)) {
      result = fail_('bad_request', '요청 모양이 잘못되었습니다(JSON이 아님).');
    } else {
      result = route_(req);
    }
  } catch (err) {
    result = errorResult_(err, req);
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function route_(req) {
  // hello는 비밀 글자 없이 받는다(이 코드가 그 비밀 글자를 아는지 HMAC으로만 답한다).
  if (req.action === 'hello') return hello_(req);
  const tokenProblem = checkToken_(req.token);
  if (tokenProblem) return tokenProblem;
  if (req.action === 'ping') return ping_(req);
  if (req.action === 'write') return write_(req);
  if (req.action === 'months') return months_(req);
  return fail_('bad_request', "action은 'hello'·'ping'·'months'·'write' 가운데 하나여야 합니다.");
}

/** 비밀 글자 자리를 아직 안 바꿨거나 너무 짧으면 token_not_set. */
function tokenNotSet_() {
  if (typeof TOKEN !== 'string' || TOKEN === TOKEN_PLACEHOLDER_ || TOKEN.length < TOKEN_MIN_LENGTH_) {
    return fail_('token_not_set',
      '구글 코드에 비밀 글자가 아직 들어가지 않았습니다. 프로그램의 [구글에 붙일 코드 복사]로 다시 붙이고 새 버전으로 배포하세요.');
  }
  return null;
}

function checkToken_(given) {
  const notSet = tokenNotSet_();
  if (notSet) return notSet;
  if (typeof given !== 'string' || !sameText_(given, TOKEN)) {
    return fail_('bad_token',
      '비밀 글자가 맞지 않습니다. 프로그램의 [구글에 붙일 코드 복사]로 다시 붙이고 새 버전으로 배포하세요.');
  }
  return null;
}

/** 길이가 같으면 끝까지 다 비교한다(맞는 앞부분 길이를 시간으로 알아채지 못하게). */
function sameText_(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------- hello

/**
 * hello {action, nonce}(판 8): 비밀 글자 없이 받는다. 답 mac = base64url(HMAC-SHA256(비밀 글자, nonce)), '=' 채움 없이 43자.
 * 도우미는 같은 값을 스스로 셈해 맞을 때만 이 주소에 비밀 글자·환자 줄을 보낸다. 비밀 글자 자체는 답에 내지 않는다.
 */
function hello_(req) {
  const notSet = tokenNotSet_();
  if (notSet) return notSet;
  const nonce = req.nonce;
  if (typeof nonce !== 'string' || !NONCE_RE_.test(nonce)) {
    return fail_('bad_request', 'nonce는 16~64자 영문·숫자·_·- 글이어야 합니다.');
  }
  const mac = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(nonce, TOKEN)).replace(/=+$/, '');
  return { ok: true, version: BITSHEET_VERSION, mac: mac };
}

// ---------------------------------------------------------------- ping

function ping_(req) {
  const month = isObj_(req.month) ? req.month : {};
  const templateId = idFrom_(month.templateId);
  if (!templateId) return fail_('bad_request', 'month.templateId(원본 시트 주소)가 비었습니다.');
  const template = openTemplate_(templateId);
  const folderId = idFrom_(month.folderId);
  if (folderId) openFolder_(folderId);
  return { ok: true, templateTitle: template.getName(), version: BITSHEET_VERSION };
}

// ---------------------------------------------------------------- months

/**
 * months {token, action, month:{templateId, folderId}, names:[{ym, fileName}] (13개까지)}(판 8):
 * 달마다 이미 있는 달 파일만 찾는다(findMonthFile_ = 7판 달 파일 찾기 1·2단계). 만들지 않고, 휴지통 파일·원본은 없는 것으로 본다.
 * 답 months:[{ym, fileId|null, gids:{'1': gid, …}}] — gids는 이름이 '1'~'31'인 날짜 시트만.
 */
function months_(req) {
  const m = isObj_(req.month) ? req.month : {};
  const templateId = idFrom_(m.templateId);
  if (!templateId) return fail_('bad_request', 'month.templateId(원본 시트 주소)가 비었습니다.');
  const names = req.names;
  if (!Array.isArray(names) || names.length < 1 || names.length > MONTHS_MAX_) {
    return fail_('bad_request', 'names(달 목록)는 1~' + MONTHS_MAX_ + '개 목록이어야 합니다.');
  }
  const wanted = [];
  for (let i = 0; i < names.length; i++) {
    const x = names[i];
    const ym = isObj_(x) ? x.ym : null;
    const fileName = isObj_(x) && typeof x.fileName === 'string' ? x.fileName.trim() : '';
    if (typeof ym !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) {
      return fail_('bad_request', 'names[' + i + '].ym(달)은 2026-11 모양이어야 합니다.');
    }
    if (!fileName) return fail_('bad_request', 'names[' + i + '].fileName(달 파일 이름)이 비었습니다.');
    wanted.push({ ym: ym, fileName: fileName });
  }
  const sources = openSources_(templateId, idFrom_(m.folderId));
  const months = wanted.map(function (w) {
    const file = findMonthFile_({ fileName: w.fileName, templateId: templateId }, sources.folder);
    return { ym: w.ym, fileId: file ? file.getId() : null, gids: file ? dayGids_(file) : {} };
  });
  return { ok: true, version: BITSHEET_VERSION, months: months };
}

/** 달 파일의 날짜 시트('1'~'31') 이름 → gid. 열 수 없으면 빈 것. */
function dayGids_(file) {
  const gids = {};
  let ss = null;
  try {
    ss = SpreadsheetApp.openById(file.getId());
  } catch (ignored) {
    return gids;
  }
  ss.getSheets().forEach(function (sh) {
    const name = String(sh.getName());
    if (DAY_SHEET_RE_.test(name)) gids[name] = sh.getSheetId();
  });
  return gids;
}

// ---------------------------------------------------------------- write

function write_(req) {
  const job = readJob_(req);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS_)) {
    return fail_('busy', '다른 넣기가 아직 진행 중입니다. 잠시 뒤 다시 하세요.');
  }
  try {
    // 판 8: 원본·폴더가 이 구글 계정 것인지 먼저 본다(달 파일이 이미 있어도, 아무것도 쓰기 전에).
    const sources = openSources_(job.month.templateId, job.month.folderId);
    const month = findOrCreateMonthFile_(job.month, job.layout, sources);
    const ss = SpreadsheetApp.openById(month.file.getId());
    const sheet = ss.getSheetByName(job.sheetName);
    if (!sheet) {
      throw bitsheetError_('no_sheet', "그 달 파일에 '" + job.sheetName + "' 시트가 없습니다.");
    }
    let counts;
    try {
      counts = fillSheet_(sheet, job, true);
    } catch (e) {
      // 줄 끼우기를 시트가 받아 주지 않음(합친 칸 등): 아직 값은 안 썼으니 끼우지 않고 처음부터 다시.
      // 그 앞에 끝난 끼우기(식까지 베낀 빈 줄)는 시트에 남으므로 다시 할 때 그 빈 줄을 쓰고, 그 수를 inserted로 알린다.
      if (!(e && e.insertFailed)) throw e;
      counts = fillSheet_(sheet, job, false);
      counts.inserted += e.insertsDone || 0;
    }
    const ratio = fixRatioFormulas_(ss, sheet, job.layout);
    SpreadsheetApp.flush();
    return {
      ok: true,
      fileId: ss.getId(),
      fileUrl: ss.getUrl() + '#gid=' + sheet.getSheetId(),
      sheetGid: sheet.getSheetId(),
      created: month.created,
      added: counts.added,
      filled: counts.filled,
      overwritten: counts.overwritten,
      skipped: counts.skipped,
      full: counts.full,
      cancelCleared: counts.cancelCleared,
      cancelKept: counts.cancelKept,
      freeFixed: counts.freeFixed,
      inserted: counts.inserted,
      cleaned: month.cleaned,
      shareFailed: month.shareFailed,
      ratioFormulas: ratio,
      version: BITSHEET_VERSION,
      error: ''
    };
  } finally {
    lock.releaseLock();
  }
}

/** 요청을 읽어 검사한다. 아무것도 쓰기 전에 다 검사한다. */
function readJob_(req) {
  const m = isObj_(req.month) ? req.month : {};
  const fileName = typeof m.fileName === 'string' ? m.fileName.trim() : '';
  if (!fileName) throw badRequest_('month.fileName(달 파일 이름)이 비었습니다.');
  const templateId = idFrom_(m.templateId);
  if (!templateId) throw badRequest_('month.templateId(원본 시트 주소)가 비었습니다.');
  const folderId = idFrom_(m.folderId);
  const shareWith = [];
  if (m.shareWith !== undefined && m.shareWith !== null) {
    if (!Array.isArray(m.shareWith)) throw badRequest_('month.shareWith(공유할 메일)는 목록이어야 합니다.');
    m.shareWith.forEach(function (x) {
      const s = typeof x === 'string' ? x.trim() : '';
      if (s && shareWith.indexOf(s) < 0) shareWith.push(s);
    });
  }

  const sheetName = (typeof req.sheetName === 'string' || typeof req.sheetName === 'number')
    ? String(req.sheetName).trim() : '';
  if (!sheetName) throw badRequest_('sheetName(날짜 시트 이름)이 비었습니다.');

  const layout = readLayout_(req.layout);

  const mode = req.mode;
  if (mode !== 'fillEmpty' && mode !== 'overwrite') {
    throw badRequest_("mode는 'fillEmpty' 또는 'overwrite'여야 합니다.");
  }

  if (!Array.isArray(req.patients)) throw badRequest_('patients(환자 목록)는 목록이어야 합니다.');
  let dropped = 0;
  const patients = req.patients.map(function (p, i) {
    const where = 'patients[' + i + ']';
    if (!isObj_(p)) throw badRequest_(where + ' 모양이 잘못되었습니다.');
    if (typeof p.key !== 'string' && !(typeof p.key === 'number' && isFinite(p.key))) {
      throw badRequest_(where + '.key(차트번호)가 비었습니다.');
    }
    const key = canon_(p.key);
    if (!key) throw badRequest_(where + '.key(차트번호)가 비었습니다.');

    const main = readCells_(p.cells, where + '.cells', layout);
    if (isBlank_(main[layout.keyCol])) {
      main[layout.keyCol] = p.key;
    } else if (canon_(main[layout.keyCol]) !== key) {
      throw badRequest_(where + ': key와 cells의 차트번호 칸 값이 다릅니다.');
    }

    const more = [];
    if (p.more !== undefined && p.more !== null) {
      if (!Array.isArray(p.more)) throw badRequest_(where + '.more는 목록이어야 합니다.');
      p.more.forEach(function (x, j) {
        const cells = readCells_(x, where + '.more[' + j + ']', layout);
        // 이어지는 줄은 차트번호 칸이 비어야 다음에도 이어지는 줄로 알아본다.
        // 이름은 nameOnMore일 때만 본 줄 이름을 싣는다(판 7, 둘째 돈 줄에도 이름). 아니면 예전처럼 비운다.
        delete cells[layout.keyCol];
        if (layout.nameCol) {
          const mainName = main[layout.nameCol];
          if (layout.nameOnMore && !isBlank_(mainName)) cells[layout.nameCol] = mainName;
          else delete cells[layout.nameCol];
        }
        const hasMoney = layout.money.some(function (n) { return !isBlank_(cells[n]); });
        if (hasMoney) more.push(cells); else dropped++;
      });
    }
    let note = '';
    if (p.note !== undefined && p.note !== null) {
      if (typeof p.note !== 'string') throw badRequest_(where + '.note(비고)는 글이어야 합니다.');
      note = p.note.trim();
    }
    return { key: key, main: main, more: more, free: readFree_(p.free, where + '.free', layout), note: note };
  });

  // 미수만 낸 환자(판 7): 그날 내원 없이 예전 미수만 낸 사람. 차트번호는 시트에 쓰지 않고 이름·돈 칸만.
  // 이름 칸이 없는 모양이면 통째로 무시한다(이름 없이는 다음 번에 알아볼 수 없다).
  const paidOnly = [];
  if (req.paidOnly !== undefined && req.paidOnly !== null && layout.nameCol && layout.owned.indexOf(layout.nameCol) >= 0) {
    if (!Array.isArray(req.paidOnly)) throw badRequest_('paidOnly(미수만 낸 환자)는 목록이어야 합니다.');
    req.paidOnly.forEach(function (x, i) {
      const where = 'paidOnly[' + i + ']';
      if (!isObj_(x)) throw badRequest_(where + ' 모양이 잘못되었습니다.');
      const cells = readCells_(x.cells, where + '.cells', layout);
      const name = cells[layout.nameCol];
      if (isBlank_(name)) throw badRequest_(where + '.cells의 이름 칸이 비었습니다.');
      // 한 줄: 차트번호 칸은 빼고, 이름 칸은 모든 줄에 같은 이름. 돈이 없는 줄은 버린다.
      function line(obj) {
        const out = {};
        Object.keys(obj).forEach(function (k) { out[k] = obj[k]; });
        delete out[layout.keyCol];
        out[layout.nameCol] = name;
        const any = layout.money.some(function (n) { return !isBlank_(out[n]); });
        return any ? out : null;
      }
      const lines = [];
      const first = line(cells);
      if (first) lines.push(first);
      if (x.more !== undefined && x.more !== null) {
        if (!Array.isArray(x.more)) throw badRequest_(where + '.more는 목록이어야 합니다.');
        x.more.forEach(function (m, j) {
          const l = line(readCells_(m, where + '.more[' + j + ']', layout));
          if (l) lines.push(l);
        });
      }
      if (!lines.length) return; // 돈이 하나도 없으면 넣을 것이 없다
      let before = patients.length;
      if (typeof x.before === 'number' && Number.isInteger(x.before)) before = Math.max(0, Math.min(patients.length, x.before));
      paidOnly.push({ name: name, lines: lines, before: before });
    });
  }

  // 취소된 접수: 그날 비트에서 접수를 취소했고 같은 날 살아 있는 내원이 없는 환자(DESIGN 4장).
  const cancelled = [];
  if (req.cancelled !== undefined && req.cancelled !== null) {
    if (!Array.isArray(req.cancelled)) throw badRequest_('cancelled(취소된 접수)는 목록이어야 합니다.');
    req.cancelled.forEach(function (c, i) {
      const where = 'cancelled[' + i + ']';
      if (!isObj_(c)) throw badRequest_(where + ' 모양이 잘못되었습니다.');
      if (typeof c.key !== 'string' && !(typeof c.key === 'number' && isFinite(c.key))) {
        throw badRequest_(where + '.key(차트번호)가 비었습니다.');
      }
      const key = canon_(c.key);
      if (!key) throw badRequest_(where + '.key(차트번호)가 비었습니다.');
      const cells = readCells_(c.cells, where + '.cells', layout);
      const name = layout.nameCol ? cells[layout.nameCol] : undefined;
      cancelled.push({ key: key, name: isBlank_(name) ? '' : String(name).trim() });
    });
  }

  return {
    month: { fileName: fileName, templateId: templateId, folderId: folderId, shareWith: shareWith },
    sheetName: sheetName,
    layout: layout,
    mode: mode,
    patients: patients,
    paidOnly: paidOnly,
    cancelled: cancelled,
    dropped: dropped
  };
}

function readLayout_(l) {
  if (!isObj_(l)) throw badRequest_('layout(시트 모양)이 없습니다.');
  const firstRow = Number(l.firstRow);
  const lastRow = Number(l.lastRow);
  if (!Number.isInteger(firstRow) || !Number.isInteger(lastRow) || firstRow < 1 || lastRow < firstRow) {
    throw badRequest_('layout.firstRow·lastRow(첫 줄·끝 줄)가 잘못되었습니다.');
  }
  if (lastRow - firstRow + 1 > MAX_REGION_ROWS_) {
    throw badRequest_('layout.firstRow~lastRow가 너무 깁니다(' + MAX_REGION_ROWS_ + '줄까지).');
  }
  if (!Array.isArray(l.ownedCols) || l.ownedCols.length === 0) {
    throw badRequest_('layout.ownedCols(프로그램이 쓰는 칸)가 비었습니다.');
  }
  const owned = uniqueSorted_(l.ownedCols.map(function (x) { return colNum_(x, 'layout.ownedCols'); }));
  const keyCol = colNum_(l.keyCol, 'layout.keyCol');
  if (owned.indexOf(keyCol) < 0) throw badRequest_('layout.keyCol(차트번호 칸)은 ownedCols 안에 있어야 합니다.');
  if (l.moneyCols !== undefined && l.moneyCols !== null && !Array.isArray(l.moneyCols)) {
    throw badRequest_('layout.moneyCols(돈 칸)는 목록이어야 합니다.');
  }
  const money = uniqueSorted_((l.moneyCols || []).map(function (x) { return colNum_(x, 'layout.moneyCols'); }));
  money.forEach(function (n) {
    if (owned.indexOf(n) < 0) throw badRequest_('layout.moneyCols(돈 칸)는 ownedCols 안에 있어야 합니다.');
  });
  let nameCol = 0;
  if (l.nameCol !== undefined && l.nameCol !== null && l.nameCol !== '') nameCol = colNum_(l.nameCol, 'layout.nameCol');
  if (nameCol === keyCol) throw badRequest_('layout.nameCol(이름 칸)은 차트번호 칸과 달라야 합니다.');
  if (l.staffCols !== undefined && l.staffCols !== null && !Array.isArray(l.staffCols)) {
    throw badRequest_('layout.staffCols(직원 칸)는 목록이어야 합니다.');
  }
  const staff = uniqueSorted_((l.staffCols || DEFAULT_STAFF_COLS_).map(function (x) { return colNum_(x, 'layout.staffCols'); }));
  staff.forEach(function (n) {
    if (owned.indexOf(n) >= 0) throw badRequest_('layout.staffCols(직원 칸)는 ownedCols와 겹치면 안 됩니다.');
  });
  // 비고 칸(판 7): 프로그램은 본 줄의 이 칸이 비었거나 프로그램이 쓴 글(noteTexts)일 때만 쓴다. ""·없으면 끔.
  let noteCol = 0;
  if (l.noteCol !== undefined && l.noteCol !== null && l.noteCol !== '') noteCol = colNum_(l.noteCol, 'layout.noteCol');
  if (noteCol && (owned.indexOf(noteCol) >= 0 || noteCol === keyCol || noteCol === nameCol)) {
    throw badRequest_('layout.noteCol(비고 칸)은 프로그램이 채우는 칸·차트번호 칸·이름 칸과 달라야 합니다.');
  }
  if (l.noteTexts !== undefined && l.noteTexts !== null && !Array.isArray(l.noteTexts)) {
    throw badRequest_('layout.noteTexts(프로그램이 쓰는 비고 글)는 목록이어야 합니다.');
  }
  const noteTexts = (l.noteTexts || []).filter(function (t) { return typeof t === 'string' && t.trim() !== ''; })
    .map(function (t) { return t.trim(); });
  const nameOnMore = l.nameOnMore === true;
  // 줄 끼우기 때 아래로 밀 칸(예: "A:P"). 없으면 기본, ""이면 끼우지 않는다.
  // 프로그램 칸·직원 칸·이름 칸을 모두 품어야 한다(안 그러면 한 환자 줄이 어긋난다).
  let shift = null;
  const given = l.shiftCols !== undefined && l.shiftCols !== null;
  const raw = given ? l.shiftCols : DEFAULT_SHIFT_COLS_;
  if (typeof raw !== 'string') throw badRequest_('layout.shiftCols(밀어 내릴 칸)는 "A:P" 모양 글이어야 합니다.');
  if (raw.trim() !== '') {
    const m = /^\s*([A-Za-z]{1,3})\s*:\s*([A-Za-z]{1,3})\s*$/.exec(raw);
    if (!m) throw badRequest_('layout.shiftCols(밀어 내릴 칸)는 "A:P" 모양이어야 합니다.');
    const first = colNum_(m[1], 'layout.shiftCols');
    const last = colNum_(m[2], 'layout.shiftCols');
    if (first > last) throw badRequest_('layout.shiftCols(밀어 내릴 칸)의 앞 칸이 뒤 칸보다 뒤에 있습니다.');
    const need = owned.concat(staff, nameCol ? [nameCol] : [], noteCol ? [noteCol] : []);
    const covers = need.every(function (n) { return n >= first && n <= last; });
    if (covers) shift = { first: first, last: last };
    else if (given) throw badRequest_('layout.shiftCols(밀어 내릴 칸)는 프로그램이 쓰는 칸·이름 칸·직원 칸·비고 칸을 모두 품어야 합니다.');
  }
  return {
    firstRow: firstRow, lastRow: lastRow, owned: owned, keyCol: keyCol, money: money, nameCol: nameCol, staff: staff, shift: shift,
    noteCol: noteCol, noteTexts: noteTexts, nameOnMore: nameOnMore
  };
}

/**
 * 늦게 붙은 FREE 고치기 재료(DESIGN 4장): {cells: FREE 짝, dropped: [비트가 FREE 때문에 뺀 진료수납 짝, …]}.
 * 돈 칸만 남긴다. 없거나 뺀 짝이 없으면 null.
 */
function readFree_(f, where, layout) {
  if (f === undefined || f === null) return null;
  if (!isObj_(f)) throw badRequest_(where + ' 모양이 잘못되었습니다.');
  function moneyOnly(obj, w) {
    const all = readCells_(obj, w, layout);
    const out = {};
    let any = false;
    layout.money.forEach(function (n) {
      if (all[n] !== undefined) out[n] = all[n];
      if (!isBlank_(out[n])) any = true;
    });
    return any ? out : null;
  }
  const cells = moneyOnly(f.cells, where + '.cells');
  if (!cells) throw badRequest_(where + '.cells(FREE 짝)가 비었습니다.');
  if (f.dropped !== undefined && f.dropped !== null && !Array.isArray(f.dropped)) {
    throw badRequest_(where + '.dropped는 목록이어야 합니다.');
  }
  const dropped = [];
  (f.dropped || []).forEach(function (x, j) {
    const d = moneyOnly(x, where + '.dropped[' + j + ']');
    if (d) dropped.push(d);
  });
  return dropped.length ? { cells: cells, dropped: dropped } : null;
}

/** 칸 이름 → 값. ownedCols 밖의 칸은 버린다(절대 쓰지 않으므로). 열쇠는 칸 번호. */
function readCells_(obj, where, layout) {
  const out = {};
  if (obj === undefined || obj === null) return out;
  if (!isObj_(obj)) throw badRequest_(where + ' 모양이 잘못되었습니다.');
  Object.keys(obj).forEach(function (letter) {
    const n = colNum_(letter, where);
    let v = obj[letter];
    if (v === undefined || v === null) v = '';
    const t = typeof v;
    if (!(t === 'string' || t === 'boolean' || (t === 'number' && isFinite(v)))) {
      throw badRequest_(where + '.' + letter + ' 값 모양이 잘못되었습니다.');
    }
    if (layout.owned.indexOf(n) >= 0) out[n] = v;
  });
  return out;
}

// ---------------------------------------------------------------- month file

/**
 * 그 달 파일 찾기/만들기 (DESIGN.md 4장):
 * 1) 스크립트 속성 file:<이름>의 ID (휴지통 아님)
 * 2) 폴더(비면 원본이 든 폴더) 안의 같은 이름 구글 시트
 * 3) 원본을 그 폴더로 복사 → 새 달 파일 정리(cleanNewMonth_) → 속성에 적기 + shareWith 편집자 추가
 * 원본 파일 자체는 어떤 경우에도 달 파일로 쓰지 않고, 정리도 막 만든 복사본에만 한다(있던 달 파일은 안 건드림).
 * 정리하다 오류가 나면 그 복사본을 휴지통에 넣고 오류를 낸다(다음 번에 새로 만들어 다시 정리).
 * 판 8: 원본·폴더는 부르는 쪽이 openSources_로 미리 연다(이 구글 계정 것인지 확인). 1·2단계는 findMonthFile_(months도 씀).
 */
function findOrCreateMonthFile_(m, layout, sources) {
  const found = findMonthFile_(m, sources.folder);
  if (found) return { file: found, created: false, shareFailed: 0, cleaned: 0 };

  const props = PropertiesService.getScriptProperties();
  const propKey = 'file:' + m.fileName;
  const template = sources.template;
  const folder = sources.folder;
  const copy = template.makeCopy(m.fileName, folder);
  let cleaned = 0;
  try {
    if (copy.getId() === m.templateId) throw new Error('copy is the template');
    cleaned = cleanNewMonth_(SpreadsheetApp.openById(copy.getId()), layout);
  } catch (e) {
    try {
      copy.setTrashed(true);
    } catch (ignored) {
      // 휴지통에 못 넣어도 속성에 안 적었으니 다음 번에는 이름으로 찾지 않게 아래 오류만 낸다
    }
    throw bitsheetError_('clean', '새 달 파일을 정리하지 못했습니다. 잠시 뒤 다시 하세요.');
  }
  props.setProperty(propKey, copy.getId());
  let shareFailed = 0;
  m.shareWith.forEach(function (email) {
    try {
      copy.addEditor(email);
    } catch (ignored) {
      shareFailed++;
    }
  });
  return { file: copy, created: true, shareFailed: shareFailed, cleaned: cleaned };
}

/**
 * 이미 있는 달 파일 찾기(7판 1·2단계 그대로): 1) 스크립트 속성 file:<이름>의 ID(휴지통 아님, 원본 아님)
 * 2) folder 안의 같은 이름 구글 시트(휴지통·원본·시트 아닌 파일은 건너뜀, 찾으면 속성에 적음). 없으면 null. 만들지 않는다.
 */
function findMonthFile_(m, folder) {
  const props = PropertiesService.getScriptProperties();
  const propKey = 'file:' + m.fileName;

  const savedId = props.getProperty(propKey);
  if (savedId && savedId !== m.templateId) {
    const saved = tryFile_(savedId);
    if (saved && !safeTrashed_(saved)) return saved;
  }

  const same = folder.getFilesByName(m.fileName);
  while (same.hasNext()) {
    const f = same.next();
    if (f.getId() === m.templateId) continue;
    if (safeTrashed_(f) || f.getMimeType() !== SHEETS_MIME_) continue;
    props.setProperty(propKey, f.getId());
    return f;
  }
  return null;
}

/** 원본과 넣을 폴더(folderId가 비면 원본이 든 폴더)를 연다. 원본·지정한 폴더가 이 구글 계정 것이 아니면 오류(판 8). */
function openSources_(templateId, folderId) {
  const template = openTemplate_(templateId);
  const folder = folderId ? openFolder_(folderId) : parentFolder_(template);
  return { template: template, folder: folder };
}

/**
 * 새 달 파일 정리(DESIGN 4장): 원본에 남아 있던 옛 환자 줄 글자를 막 만든 달 파일에서 지운다.
 * 시트: 이름이 '1'~'31'인 날짜 시트, 그리고 머리 줄(firstRow-1, A~P 보이는 값)이 '1' 시트와 똑같은 시트
 * (원본 이름을 몰라도 '일일 수납일지(원본)' 같은 시트를 잡는다. '1' 머리 줄이 비었으면 이름으로만).
 * 칸: firstRow~lastRow의 ownedCols ∪ staffCols 가운데 식이 아니고 값이 있는 칸만(체크 안 된 체크박스 FALSE는 빈 칸으로 봄).
 * RangeList.clearContent()로 지우므로 서식·체크박스·확인 규칙은 남는다. 돌려주는 값: 지운 칸 수.
 */
function cleanNewMonth_(ss, L) {
  const cols = uniqueSorted_(L.owned.concat(L.staff, L.noteCol ? [L.noteCol] : []));
  let cleaned = 0;
  patientSheets_(ss, L).forEach(function (sh) {
    cleaned += cleanRows_(sh, L, cols);
  });
  return cleaned;
}

/** 환자 줄이 있는 시트: 이름이 '1'~'31'인 날짜 시트 + 머리 줄이 '1' 시트와 똑같은 시트('일일 수납일지(원본)' 같은 것). */
function patientSheets_(ss, L) {
  const one = ss.getSheetByName('1');
  const head = one ? headerKey_(one, L.firstRow) : null;
  return ss.getSheets().filter(function (sh) {
    const dayName = /^(?:[1-9]|[12]\d|3[01])$/.test(String(sh.getName()));
    return dayName || (head !== null && headerKey_(sh, L.firstRow) === head);
  });
}

/**
 * 비율 식 고치기(판 7, 사용자 2026-11-25 "비율 식을 차트번호로 세게 고침", DESIGN 4장).
 * 날짜 시트 머리(1~firstRow-1줄)의 비율 식 J9:M9는 분모가 이름 칸을 센다(COUNTA(C17:C303)). 판 7부터 이어지는 돈 줄·
 * 미수만 낸 줄에도 이름이 들어가므로, 분모를 총내원처럼 차트번호 칸을 세게(COUNT(B17:B303)) 바꾼다.
 * - 알려진 원래 모양과 (빈칸·대소문자를 빼고) 똑같은 식만 바꾼다. 이름 칸을 세지만 모양이 다른 식은 그대로 두고 skipped에 적는다.
 *   이미 고친 식(분모가 차트번호 칸)은 건드리지 않는다. 다른 식은 보지도 않는다.
 * - 어느 시트: 그 달 파일을 처음 볼 때(새로 만든 파일 포함) 환자 시트 전부(patientSheets_), 그 뒤로는 이번에 넣는 시트만(값싼 확인).
 *   원본 파일은 건드리지 않는다(달 파일 안의 '일일 수납일지(원본)' 시트는 고친다).
 * - 고치다 오류가 나도 넣기는 그대로 끝낸다(failed, 표시를 안 남기므로 다음 번에 다시).
 */
function fixRatioFormulas_(ss, sheet, L) {
  const out = { fixed: 0, skipped: [], skippedCount: 0, failed: false };
  if (!L.nameCol) return out;
  try {
    const props = PropertiesService.getScriptProperties();
    const key = RATIO_MARK_ + ss.getId();
    const mark = [RATIO_RULE_, colLetter_(L.keyCol), colLetter_(L.nameCol), L.firstRow, L.lastRow].join('|');
    const whole = props.getProperty(key) !== mark;
    const sheets = whole ? patientSheets_(ss, L) : [sheet];
    if (sheets.indexOf(sheet) < 0) sheets.push(sheet);
    sheets.forEach(function (sh) { fixRatioSheet_(sh, L, out); });
    if (whole) props.setProperty(key, mark);
  } catch (e) {
    out.failed = true;
  }
  return out;
}

/** 한 시트의 머리 줄에서 비율 식을 고친다(가로로 붙은 칸은 한 번에 씀). */
function fixRatioSheet_(sh, L, out) {
  const rows = Math.min(L.firstRow - 1, sh.getMaxRows());
  const width = sh.getMaxColumns();
  if (rows < 1 || width < 1) return;
  const formulas = sh.getRange(1, 1, rows, width).getFormulas();
  for (let r = 0; r < rows; r++) {
    let run = null;
    const flush = function () {
      if (!run) return;
      sh.getRange(r + 1, run.col + 1, 1, run.list.length).setFormulas([run.list]);
      out.fixed += run.list.length;
      run = null;
    };
    for (let c = 0; c <= width; c++) {
      const f = c < width ? formulas[r][c] : '';
      const res = f ? ratioFix_(String(f), L) : null;
      if (res && res.state === 'fix') {
        if (run && run.col + run.list.length === c) run.list.push(res.formula);
        else {
          flush();
          run = { col: c, list: [res.formula] };
        }
        continue;
      }
      flush();
      if (res && res.state === 'skip') {
        out.skippedCount++;
        if (out.skipped.length < RATIO_LIST_MAX_) out.skipped.push(String(sh.getName()) + '!' + colLetter_(c + 1) + (r + 1));
      }
    }
  }
}

/**
 * 식 하나 보기. 알려진 원래 모양(빈칸·대소문자 무시):
 *   =ROUND(COUNTIF(X<first>:X<end>, 0) / COUNTA(<이름><first>:<이름><end>) * 100, 1) & "%"
 * X는 프로그램 칸(J~M), <first> = firstRow, <end>는 두 범위가 같고 lastRow 이상.
 * 돌려줌: {state:'fix', formula}(분모만 COUNT(<차트번호><first>:<차트번호><end>)로, 나머지 글자는 그대로) ·
 * {state:'done'}(이미 고침) · {state:'skip'}(이름 칸을 환자 줄부터 세지만 모양이 다름) · null(상관없는 식).
 */
function ratioFix_(f, L) {
  const name = colLetter_(L.nameCol);
  const key = colLetter_(L.keyCol);
  const n = f.replace(/\s+/g, '').toUpperCase();
  const countsName = new RegExp('COUNTA\\(\\$?' + name + '\\$?' + L.firstRow + ':\\$?' + name + '\\$?\\d+\\)').test(n);
  const m = /^=ROUND\(COUNTIF\(([A-Z]{1,3})(\d+):([A-Z]{1,3})(\d+),0\)\/(COUNTA?)\(([A-Z]{1,3})(\d+):([A-Z]{1,3})(\d+)\)\*100,1\)&"%"$/.exec(n);
  const shape = m && m[1] === m[3] && Number(m[2]) === L.firstRow && Number(m[7]) === L.firstRow &&
    m[4] === m[9] && Number(m[4]) >= L.lastRow && m[6] === m[8] && L.owned.indexOf(colNum_(m[1], 'formula')) >= 0;
  if (shape && m[5] === 'COUNT' && m[6] === key) return { state: 'done' };
  if (shape && m[5] === 'COUNTA' && m[6] === name) {
    const re = new RegExp('COUNTA(\\s*\\(\\s*)' + name + '(\\s*)' + L.firstRow + '(\\s*:\\s*)' + name + '(\\s*)' + m[9] + '(\\s*\\))', 'i');
    const fixed = f.replace(re, 'COUNT$1' + key + '$2' + L.firstRow + '$3' + key + '$4' + m[9] + '$5');
    if (fixed !== f) return { state: 'fix', formula: fixed };
  }
  return countsName ? { state: 'skip' } : null;
}

/** 머리 줄(firstRow-1)의 A~P 보이는 값을 한 글로. 머리 줄이 없거나 모두 비었으면 null. */
function headerKey_(sh, firstRow) {
  const row = firstRow - 1;
  const width = Math.min(HEADER_WIDTH_, sh.getMaxColumns());
  if (row < 1 || row > sh.getMaxRows() || width < 1) return null;
  const shown = sh.getRange(row, 1, 1, width).getDisplayValues()[0].map(function (v) { return String(v); });
  while (shown.length < HEADER_WIDTH_) shown.push('');
  if (shown.every(function (v) { return v.trim() === ''; })) return null;
  return JSON.stringify(shown);
}

/** 한 시트의 환자 칸에서 식 아닌 값 칸을 지운다(세로로 붙은 칸은 한 범위로 묶음). 지운 칸 수. */
function cleanRows_(sh, L, cols) {
  const last = Math.min(L.lastRow, sh.getMaxRows());
  const maxCols = sh.getMaxColumns();
  const use = cols.filter(function (c) { return c <= maxCols; });
  if (last < L.firstRow || use.length === 0) return 0;
  const minCol = use[0];
  const range = sh.getRange(L.firstRow, minCol, last - L.firstRow + 1, use[use.length - 1] - minCol + 1);
  const values = range.getValues();
  const formulas = range.getFormulas();
  const a1 = [];
  let n = 0;
  use.forEach(function (c) {
    const k = c - minCol;
    const letter = colLetter_(c);
    let start = -1;
    for (let r = 0; r <= values.length; r++) {
      const f = r < values.length ? formulas[r][k] : '';
      const hit = r < values.length && (f === '' || f === null || f === undefined) && !isBlank_(values[r][k]) && values[r][k] !== false;
      if (hit) {
        n++;
        if (start < 0) start = r;
      } else if (start >= 0) {
        const top = L.firstRow + start;
        const bottom = L.firstRow + r - 1;
        a1.push(letter + top + (bottom > top ? ':' + letter + bottom : ''));
        start = -1;
      }
    }
  });
  if (a1.length) sh.getRangeList(a1).clearContent();
  return n;
}

/** 원본 시트를 연다. 없거나 이 구글 계정 것이 아니면(판 8, 공유받은 파일·공유 드라이브) 같은 template 오류. */
function openTemplate_(id) {
  const f = tryFile_(id);
  if (!f || !ownedHere_(f)) {
    throw bitsheetError_('template', '원본 시트를 열 수 없습니다. 원본 주소와, 원본이 이 구글 계정에 있는지 확인하세요.');
  }
  if (safeTrashed_(f)) throw bitsheetError_('template', '원본 시트가 휴지통에 있습니다.');
  if (f.getMimeType() !== SHEETS_MIME_) throw bitsheetError_('template', '원본 주소가 구글 시트가 아닙니다.');
  return f;
}

/** 넣을 폴더를 연다. 없거나 이 구글 계정 것이 아니면(판 8) folder 오류. */
function openFolder_(id) {
  let folder = null;
  try {
    folder = DriveApp.getFolderById(id);
  } catch (ignored) {
    folder = null;
  }
  if (!folder || !ownedHere_(folder)) throw bitsheetError_('folder', '넣을 폴더를 열 수 없습니다. 폴더 주소를 확인하세요.');
  return folder;
}

/**
 * 파일·폴더의 주인이 이 코드를 돌리는 구글 계정인가(판 8, design.md 8-1). 주인이 없으면(공유 드라이브) 아니다.
 * 메일을 읽지 못하면 아닌 것으로 본다(앞뒤 빈칸·대소문자는 무시).
 */
function ownedHere_(item) {
  let owner = '';
  let me = '';
  try {
    const o = item.getOwner();
    owner = o ? String(o.getEmail() || '') : '';
  } catch (ignored) {
    owner = '';
  }
  try {
    me = String(Session.getEffectiveUser().getEmail() || '');
  } catch (ignored) {
    me = '';
  }
  owner = owner.trim().toLowerCase();
  me = me.trim().toLowerCase();
  return owner !== '' && owner === me;
}

function parentFolder_(file) {
  const parents = file.getParents();
  return parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
}

function tryFile_(id) {
  try {
    return DriveApp.getFileById(id);
  } catch (ignored) {
    return null;
  }
}

function safeTrashed_(file) {
  try {
    return file.isTrashed();
  } catch (ignored) {
    return true;
  }
}

/** 시트·폴더 주소를 붙여도 ID만 뽑는다. */
function idFrom_(v) {
  if (typeof v !== 'string') return '';
  const s = v.trim();
  if (!s) return '';
  const m = s.match(/\/d\/([A-Za-z0-9_-]+)/) || s.match(/\/folders\/([A-Za-z0-9_-]+)/) || s.match(/[?&]id=([A-Za-z0-9_-]+)/);
  return m ? m[1] : s;
}

// ---------------------------------------------------------------- filling one date sheet

/**
 * 날짜 시트에 넣는다. ownedCols(와 직원 칸·이름 칸)가 든 사각형을 한 번만 읽고(getValues + getFormulas),
 * 메모리에서 계획을 세운 뒤 쓸 값이 있는 칸만 묶어 setValues로 쓴다(빈 칸에 ''를 쓰지 않음:
 * 같은 때 직원이 적은 값을 지우지 않게, 검토 8). 덮어쓰기·취소 지우기가 비우는 칸만 ''를 쓴다.
 */
function fillSheet_(sheet, job, allowInsert) {
  const L = job.layout;
  const counts = { added: 0, filled: 0, overwritten: 0, skipped: job.dropped, full: false, cancelCleared: 0, cancelKept: 0, freeFixed: 0, inserted: 0 };
  const maxCols = sheet.getMaxColumns();
  const maxOwned = L.owned[L.owned.length - 1];
  if (maxOwned > maxCols) {
    throw bitsheetError_('layout', "날짜 시트에 '" + colLetter_(maxOwned) + "' 칸이 없습니다.");
  }
  // 읽기만 하는 칸(직원 칸·owned 밖 이름 칸)은 시트에 있을 때만 본다. 없으면 빈 칸으로 본다.
  const seen = L.owned.concat(L.staff, L.nameCol ? [L.nameCol] : [], L.noteCol ? [L.noteCol] : []).filter(function (n) { return n <= maxCols; });
  // 줄 끼우기: 밀어 내릴 칸 전체를 읽어 둔다(식 칸을 위 줄에서 베끼려고). 그 칸들이 읽는 사각형이 된다.
  const shiftOn = !!(allowInsert && L.shift);
  const shiftLastCol = shiftOn ? Math.min(L.shift.last, maxCols) : 0;
  if (shiftOn) seen.push(L.shift.first, shiftLastCol);
  const minCol = Math.min.apply(null, seen);
  const maxCol = Math.max.apply(null, seen);
  const lastRow = Math.min(L.lastRow, sheet.getMaxRows());
  const nRows = Math.max(0, lastRow - L.firstRow + 1);
  const width = maxCol - minCol + 1;

  let values = [];
  let formulas = [];
  if (nRows > 0) {
    const range = sheet.getRange(L.firstRow, minCol, nRows, width);
    values = range.getValues();
    formulas = range.getFormulas();
  }

  // 아래부터 칸 번호는 읽은 사각형 안의 위치(0부터).
  const own = L.owned.map(function (n) { return n - minCol; });
  const keyC = L.keyCol - minCol;
  const nameC = L.nameCol && L.nameCol <= maxCols ? L.nameCol - minCol : -1;
  const money = L.money.map(function (n) { return n - minCol; });
  const nonMoney = own.filter(function (c) { return money.indexOf(c) < 0; });
  const staff = L.staff.filter(function (n) { return n <= maxCols; }).map(function (n) { return n - minCol; });
  const noteC = L.noteCol && L.noteCol <= maxCols ? L.noteCol - minCol : -1;
  // 이름 칸을 프로그램이 쓸 수 있는가(owned 안). 밖이면 이름은 읽기만 한다.
  const nameOwned = nameC >= 0 && own.indexOf(nameC) >= 0;
  const nameOnMore = !!L.nameOnMore && nameOwned;
  const overwrite = job.mode === 'overwrite';
  const plan = new Map(); // 줄 → (칸 → 쓸 값)
  const inserts = []; // 끼운 줄 [{row: 그때의 줄 자리, copy: [[칸, 개수], …]}] — 쓰기 전에 차례대로 시트에 한다

  function isFormula(r, c) {
    const f = formulas[r][c];
    return f !== '' && f !== null && f !== undefined;
  }
  function want(t, c) {
    const v = t[c + minCol];
    return v === undefined ? '' : v;
  }
  function put(r, c, v) {
    let row = plan.get(r);
    if (!row) {
      row = new Map();
      plan.set(r, row);
    }
    row.set(c, v);
    values[r][c] = v;
  }
  /** 식 칸은 직원·비트 값이 아니라서 빈 칸으로 본다. */
  function blankAt(r, c) {
    return isFormula(r, c) || isBlank_(values[r][c]);
  }
  /** 빈 줄: owned 칸이 모두 빔(식 칸은 보지 않음). */
  function rowEmpty(r) {
    for (const c of own) if (!blankAt(r, c)) return false;
    return true;
  }
  function moneyBlank(r) {
    for (const c of money) if (!blankAt(r, c)) return false;
    return true;
  }
  /**
   * 주인 없는 돈 줄 모양: 차트번호 칸과 이름 칸이 둘 다 비고 돈 칸 하나라도 참(DESIGN 4장, 검토 6).
   * 새 줄 자리 고르기(canTake·findBlock)에만 쓴다. 있는 환자의 이어지는 줄은 contOf(이름 같음도 됨, 판 7).
   */
  function looksLikeMore(r) {
    if (!isBlank_(values[r][keyC])) return false;
    if (nameC >= 0 && !isBlank_(values[r][nameC])) return false;
    return !moneyBlank(r);
  }
  /**
   * 새로 쓸 수 있는 줄: 빈 줄이고, 바로 아래가 주인 없는 돈 줄이 아님
   * (그 아래 줄을 다음 번에 이 환자의 이어지는 줄로 잘못 알지 않게).
   */
  function canTake(r) {
    return r < nRows && rowEmpty(r) && !(r + 1 < nRows && looksLikeMore(r + 1));
  }
  function canTakeMain(r) {
    return canTake(r) && !isFormula(r, keyC);
  }
  /** 빈 줄을 차지해 쓴다. 비트 값이 있는 칸만 쓴다. */
  function take(r, t) {
    for (const c of own) {
      const v = want(t, c);
      if (!isFormula(r, c) && !isBlank_(v)) put(r, c, v);
    }
    counts.added++;
  }
  /** cols 가운데 빈 칸만 비트 값으로 채운다. 바꾼 게 있으면 true. */
  function fillBlank(r, t, cols) {
    let changed = false;
    for (const c of cols) {
      if (isFormula(r, c)) continue;
      const v = want(t, c);
      if (isBlank_(values[r][c]) && !isBlank_(v)) {
        put(r, c, v);
        changed = true;
      }
    }
    return changed;
  }
  /** overwrite: owned 칸을 비트 값으로 바꾼다(값이 ""이면 비움). skip 칸은 건드리지 않는다. 바꿨으면 true. */
  function rewrite(r, t, skip) {
    let changed = false;
    for (const c of own) {
      if (isFormula(r, c) || c === skip) continue;
      const v = want(t, c);
      if (!sameValue_(values[r][c], v)) {
        put(r, c, v);
        changed = true;
      }
    }
    if (changed) counts.overwritten++;
    return changed;
  }
  /**
   * 이어지는 줄의 이름 칸이 본 줄 이름과 같으면 비운다(돈을 비운 이어지는 줄이 이름만 남은 줄로 막히지 않게, 판 7).
   * 바꿨으면 true.
   */
  function clearContName(r, name) {
    if (!nameOwned || isFormula(r, nameC) || isBlank_(name) || isBlank_(values[r][nameC])) return false;
    if (!sameValue_(values[r][nameC], name)) return false;
    put(r, nameC, '');
    return true;
  }
  /** 이어지는 줄의 돈 칸을 비운다(이름이 본 줄 이름과 같으면 이름도). */
  function clearMoney(r, name) {
    let changed = false;
    for (const c of money) {
      if (!isFormula(r, c) && !isBlank_(values[r][c])) {
        put(r, c, '');
        changed = true;
      }
    }
    if (clearContName(r, name)) changed = true;
    if (changed) counts.overwritten++;
  }
  /** 프로그램이 쓴 비고 글(noteTexts)인가. */
  function isProgNote(v) {
    if (isBlank_(v)) return false;
    for (const t of L.noteTexts) if (sameValue_(v, t)) return true;
    return false;
  }
  /**
   * 비고 칸(본 줄만, 판 7): 비었거나 프로그램이 쓴 다른 글이면 note를 쓴다. 직원 글·식은 절대 건드리지 않는다.
   * note가 ""이면 덮어쓰기에서만 프로그램이 쓴 글을 비운다. 바꿨으면 true.
   */
  function applyNote(r, note) {
    if (noteC < 0 || isFormula(r, noteC)) return false;
    const cur = values[r][noteC];
    if (!isBlank_(note)) {
      if (isBlank_(cur) || (isProgNote(cur) && !sameValue_(cur, note))) {
        put(r, noteC, note);
        return true;
      }
      return false;
    }
    if (overwrite && isProgNote(cur)) {
      put(r, noteC, '');
      return true;
    }
    return false;
  }
  /**
   * 이어지는 줄을 last 바로 아래부터 붙인다. 아래 줄이 차 있으면 빈 줄을 끼우고(DESIGN 4장; noInsert면 끼우지 않음 —
   * 새 환자 자리는 끼우지 않는다), 그것도 안 되면 나머지는 건너뜀.
   */
  function appendMore(last, list, from, noInsert) {
    for (let i = from; i < list.length; i++) {
      if (canTake(last + 1) || (!noInsert && insertAt(last + 1) && canTake(last + 1))) {
        last++;
        take(last, list[i]);
      } else {
        counts.skipped += list.length - i;
        return;
      }
    }
  }
  /**
   * 맨 아래 줄을 밀어 내도 되는가: 범위 맨 아래 줄이 비었고(owned·직원 칸) 이번에 쓸 값도 없다.
   * 끼울 때마다 이 빈 줄 하나가 범위 밖(lastRow 아래)으로 밀려나므로 다음 번에도 범위 안 환자 줄은 그대로다.
   */
  function bottomFree() {
    const b = nRows - 1;
    if (b < 0 || plan.has(b) || !rowEmpty(b)) return false;
    for (const c of staff) if (!blankAt(b, c)) return false;
    return true;
  }
  /**
   * r 자리에 빈 줄 하나를 끼운다(DESIGN 4장 '줄 끼우기'): 시트에서는 shiftCols 칸만 아래로 민다(insertCells).
   * 새 줄에는 위 줄의 식 칸(owned 아닌 칸)만 베끼고(PASTE_FORMULA), A(NO) 같은 값 칸은 비워 둔다.
   * 메모리에서는 r에 빈 줄을 넣고 맨 아래 빈 줄을 버려 범위 줄 수를 그대로 둔다(이번 번에는 lastRow가 끼운 만큼 늘어난 셈).
   * 계획(plan)·환자 줄 자리(keyRow)는 r부터 한 줄씩 내린다. 끼운 것은 쓰기 전에 차례대로 시트에 한다.
   */
  function insertAt(r) {
    if (!shiftOn || r <= 0 || r >= nRows - 1 || !bottomFree()) return false;
    const width = values[0].length;
    const newValues = [];
    const newFormulas = [];
    const copy = [];
    for (let c = 0; c < width; c++) {
      newValues.push('');
      const f = formulas[r - 1][c];
      const isF = f !== '' && f !== null && f !== undefined;
      if (isF && own.indexOf(c) < 0) {
        newFormulas.push(f);
        copy.push(c);
      } else {
        newFormulas.push('');
      }
    }
    values.splice(r, 0, newValues);
    formulas.splice(r, 0, newFormulas);
    values.pop();
    formulas.pop();
    const moved = [];
    plan.forEach(function (row, k) { moved.push([k >= r ? k + 1 : k, row]); });
    plan.clear();
    moved.forEach(function (x) { plan.set(x[0], x[1]); });
    keyRow.forEach(function (v, k) { if (v >= r) keyRow.set(k, v + 1); });
    inserts.push({ row: r, copy: runs_(copy) });
    counts.inserted++;
    return true;
  }
  /** 본 줄 + 이어지는 줄 n개가 붙어 들어갈 맨 처음 자리. */
  function findBlock(n) {
    outer:
    for (let i = 0; i + n <= nRows; i++) {
      if (isFormula(i, keyC)) continue;
      for (let j = i; j < i + n; j++) {
        if (!rowEmpty(j)) {
          i = j;
          continue outer;
        }
      }
      if (i + n < nRows && looksLikeMore(i + n)) continue;
      return i;
    }
    return -1;
  }
  function hasMoney(t) {
    for (const c of money) if (!isBlank_(want(t, c))) return true;
    return false;
  }
  /** 그 줄의 돈 칸이 비트 짝과 똑같다. */
  function sameMoney(r, t) {
    for (const c of money) {
      if (isFormula(r, c)) continue;
      if (!sameValue_(values[r][c], want(t, c))) return false;
    }
    return true;
  }
  /** 찬 돈 칸은 모두 비트 짝과 같고, 비트 값이 있는데 빈 돈 칸이 있다(직원이 지운 칸 등). */
  function partMoney(r, t) {
    let same = 0;
    let gap = 0;
    for (const c of money) {
      if (isFormula(r, c)) continue;
      const v = want(t, c);
      if (isBlank_(values[r][c])) {
        if (!isBlank_(v)) gap++;
      } else if (sameValue_(values[r][c], v)) {
        same++;
      } else {
        return false;
      }
    }
    return same > 0 && gap > 0;
  }
  /**
   * fillEmpty, 있는 환자(DESIGN 4장 '돈 줄 맞추기', 검토 1): 본 줄의 돈 아닌 빈 칸을 채우고,
   * 본 줄 + 이어지는 줄의 (D,F) 짝을 모음(같은 짝 개수까지)으로 맞춘다. 위치로 맞추지 않는다.
   *  1) 똑같은 짝 → 그대로.  2) 찬 돈 칸이 같고 빈 칸만 있는 짝 → 빈 칸만 채움.
   *  3) 남은 비트 짝은 차례로 남은 시트 돈 줄(본 줄 돈 칸이 비었으면 본 줄부터)의 빈 칸에만 넣는다
   *     (직원이 고친 금액은 그대로 두고, 같은 돈을 한 번 더 붙이지 않게).
   *  4) 그래도 남은 짝(새로 들어온 돈)만 마지막 이어지는 줄 바로 아래 빈 줄에 붙인다. 못 붙이면 skipped.
   */
  function fillExisting(at, cont, p) {
    const rows = [at].concat(cont);
    // 같은 차트번호가 적힌 다른 줄(직원이 따로 적은 줄 등)과 그 이어지는 줄: 이미 있는 돈으로만 센다(쓰지 않음, 판 7).
    const pool = poolOf(at, p.key, rows);
    const all = rows.concat(pool);
    const used = all.map(function () { return false; });
    const changed = new Set();
    if (fillBlank(at, p.main, nonMoney)) changed.add(at);
    if (applyNote(at, p.note)) changed.add(at);

    function pick(test, list, ownOnly) {
      const left = [];
      const end = ownOnly ? rows.length : all.length;
      for (const t of list) {
        let hit = -1;
        for (let i = 0; i < end && hit < 0; i++) if (!used[i] && test(all[i], t)) hit = i;
        if (hit < 0) {
          left.push(t);
          continue;
        }
        used[hit] = true;
        if (hit < rows.length && fillBlank(all[hit], t, money)) changed.add(all[hit]);
      }
      return left;
    }
    const left = pick(partMoney, pick(sameMoney, wantedOf(p), false), true);
    const spare = rows.filter(function (r, i) { return !used[i]; });
    const n = Math.min(left.length, spare.length);
    for (let i = 0; i < n; i++) if (fillBlank(spare[i], left[i], money)) changed.add(spare[i]);
    // 둘째 돈 줄에도 이름(판 7): 이 환자의 이어지는 줄 가운데 이름 칸이 빈 줄을 채운다.
    if (nameOnMore) fillContNames(cont, nameOf(p), changed);
    if (left.length > n) appendMore(rows[rows.length - 1], left, n);
    counts.filled += changed.size;
  }
  /** 이어지는 줄 가운데 이름 칸이 빈 줄에 name을 쓴다(바꾼 줄은 changed에). */
  function fillContNames(cont, name, changed) {
    if (!nameOwned || isBlank_(name)) return;
    for (const r of cont) {
      if (!isFormula(r, nameC) && isBlank_(values[r][nameC])) {
        put(r, nameC, name);
        changed.add(r);
      }
    }
  }
  /** 요청 쪽 본 줄 이름(이름 칸이 없으면 ""). */
  function nameOf(p) {
    return nameC >= 0 ? want(p.main, nameC) : '';
  }
  /** 이 환자 이름: 요청 쪽 이름, 비었으면 시트 본 줄 이름. */
  function patName(at, p) {
    const n = nameOf(p);
    if (!isBlank_(n) || nameC < 0) return n;
    return values[at][nameC];
  }
  /**
   * 비트 쪽 돈 짝 목록: 본 줄 짝(돈 칸만 떼어 냄 — 다른 줄에 붙을 때 차트번호가 따라가지 않게) + more.
   * nameOnMore면 본 줄 짝에도 이름을 실어, 이어지는 줄로 붙을 때 이름이 들어가게 한다.
   */
  function wantedOf(p) {
    const mainPair = {};
    for (const c of money) mainPair[c + minCol] = want(p.main, c);
    const name = nameOf(p);
    if (nameOnMore && !isBlank_(name)) mainPair[nameC + minCol] = name;
    return (hasMoney(p.main) ? [mainPair] : []).concat(p.more);
  }
  /** 본 줄(at)·그 이어지는 줄 말고, 같은 차트번호가 적힌 줄과 그 이어지는 줄(직원이 따로 적은 줄, 판 7). */
  function poolOf(at, key, mine) {
    const out = [];
    const taken = new Set(mine);
    for (let r = 0; r < nRows; r++) {
      if (r === at || taken.has(r) || canon_(values[r][keyC]) !== key) continue;
      for (const q of [r].concat(contOf(r))) {
        if (!taken.has(q)) {
          taken.add(q);
          out.push(q);
        }
      }
    }
    return out;
  }
  /** 돈 칸에 식이 없다(값을 견주고 바꿀 수 있는 줄). */
  function moneyPlain(r) {
    for (const c of money) if (isFormula(r, c)) return false;
    return true;
  }
  /**
   * 본 줄 바로 아래 이어지는 줄들(DESIGN 4장): 차트번호 칸이 비고 돈 칸 하나라도 차 있고,
   * 이름 칸이 비었거나 본 줄 이름과 같은 줄(판 7 — 직원이 이름을 적은 둘째 돈 줄·nameOnMore로 이름이 실린 줄).
   */
  function contOf(at) {
    const cont = [];
    const main = nameC >= 0 ? values[at][nameC] : '';
    for (let r = at + 1; r < nRows && contLike(r, main); r++) cont.push(r);
    return cont;
  }
  function contLike(r, mainName) {
    if (!isBlank_(values[r][keyC]) || moneyBlank(r)) return false;
    if (nameC < 0 || isBlank_(values[r][nameC])) return true;
    return !isBlank_(mainName) && sameValue_(values[r][nameC], mainName);
  }
  /** 요청 쪽 두 돈 짝이 같다. */
  function samePair(a, b) {
    for (const c of money) if (!sameValue_(want(a, c), want(b, c))) return false;
    return true;
  }
  /**
   * 늦게 붙은 FREE 고치기(DESIGN 4장, 두 모드 모두): 할인 기록 FREE가 현금 줄을 넣은 뒤에 붙었으면,
   * 시트에 남은 그 내원의 돈 짝을 FREE 한 줄로 바꾼다. 위치로 맞추지 않고 돈 칸이 똑같은 줄만 본다.
   *  1) 비트 쪽 FREE 아닌 줄(본 줄 짝 + more)과 똑같은 시트 줄을 먼저 모음으로 잡아 둔다(다른 내원의 같은 금액·
   *     같은 기호의 미수입금은 안 건드림). FREE 짝과 똑같은 시트 줄도 비트 FREE 줄 수만큼 잡아 'FREE 줄'로 둔다.
   *  2) 남은 시트 줄 가운데 비트가 뺀 짝(p.free.dropped)과 똑같은 줄을 모두 고른다(직원이 고친 금액은 안 맞으니 그대로).
   *     뺀 짝 수만큼만 고르면 FREE를 쓴 다음 번에 남은 같은 짝을 또 고르게 되어 두 번 돌릴 때 달라진다.
   *     잡아 둘 줄은 본 줄이 아닌 위쪽 줄부터 정한다(본 줄·아래쪽 줄이 고를 줄로 남아 비울 수 있게).
   *  3) 고른 줄과 FREE 줄 가운데 하나에 FREE 짝을 두고 나머지는 돈 칸을 비운다. 비운 이어지는 줄 아래에 남길 줄이 있으면
   *     빈 줄이 끼어 다음에 못 알아보므로 그런 줄('막힌 줄')은 그냥 비우지 않는다.
   *  4) 막힌 줄이 있으면 먼저 이 환자 블록 안에서 정리한다: FREE는 맨 위 고른 줄에, 남길 줄(비트 줄과 똑같은 줄)은
   *     차례대로 위로 올리고 맨 아래 줄을 비운다. 돈이 바뀌는 이어지는 줄은 돈 칸에 식이 없고 직원 칸이 비어야 하고,
   *     옮기는 줄은 비트와 똑같은 줄이어야 한다(직원이 고친 금액·메모가 붙은 줄은 안 옮김).
   *  5) 정리할 수 없으면 예전처럼: FREE 자리는 막힌 FREE 줄 → 막힌 줄 맨 위 → (막힌 줄이 없으면) 맨 위 줄.
   *     FREE가 되지 못한 막힌 줄은 빈 칸만 채우기에서만 skipped에 센다(덮어쓰기는 뒤에서 비트 값으로 다시 쓴다).
   * 두 번 돌려도 같다(고친 뒤에는 고를 줄이 없거나, 같은 막힌 줄만 남는다). 돌려주는 값: 고친 뒤의 이어지는 줄 목록.
   */
  function fixFree(at, cont, p) {
    if (!p.free) return cont;
    const rows = [at].concat(cont);
    const n = rows.length;
    const name = patName(at, p);
    const holdOrder = [];
    for (let i = 1; i < n; i++) holdOrder.push(i);
    holdOrder.push(0);
    const held = rows.map(function () { return false; });
    const hit = rows.map(function () { return false; });
    const isFree = rows.map(function () { return false; });
    function grab(t, order, mark) {
      for (const i of order) {
        if (!held[i] && !hit[i] && moneyPlain(rows[i]) && sameMoney(rows[i], t)) {
          mark[i] = true;
          return i;
        }
      }
      return -1;
    }

    const mainPair = {};
    for (const c of money) mainPair[c + minCol] = want(p.main, c);
    const lines = (hasMoney(p.main) ? [mainPair] : []).concat(p.more);
    let freeLines = 0;
    for (const t of lines) {
      if (samePair(t, p.free.cells)) freeLines++;
      else grab(t, holdOrder, held);
    }
    if (freeLines === 0) return cont; // FREE 줄 없이 free만 온 요청: 건드리지 않는다
    for (let k = 0; k < freeLines; k++) {
      const i = grab(p.free.cells, holdOrder, held);
      if (i >= 0) isFree[i] = true;
    }
    for (let i = 0; i < n; i++) {
      if (held[i] || !moneyPlain(rows[i])) continue;
      for (const d of p.free.dropped) {
        if (sameMoney(rows[i], d)) {
          hit[i] = true;
          break;
        }
      }
    }
    if (!hit.some(function (h) { return h; })) return cont;

    const cand = rows.map(function (r, i) { return hit[i] || isFree[i]; });
    const idx = [];
    cand.forEach(function (x, i) { if (x) idx.push(i); });
    function keptBelow(i) {
      for (let j = i + 1; j < n; j++) if (!cand[j]) return true;
      return false;
    }
    const blocked = idx.filter(function (i) { return i > 0 && keptBelow(i); });
    let target = idx[0];
    if (blocked.length) {
      const freeBlocked = blocked.filter(function (i) { return isFree[i]; });
      target = freeBlocked.length ? freeBlocked[0] : blocked[0];
    }
    const stuck = blocked.filter(function (i) { return i !== target; }).length;
    if (stuck > 0) {
      const moves = tidyMoves();
      if (moves) {
        if (!moves.length) return cont;
        moves.forEach(function (m) {
          for (const c of money) if (!sameValue_(values[rows[m.j]][c], m.pair[c])) put(rows[m.j], c, m.pair[c]);
          // 돈이 다 빈 이어지는 줄은 이름도 비운다(이름만 남아 다음 줄을 막지 않게, 판 7).
          if (m.j > 0 && m.empty) clearContName(rows[m.j], name);
        });
        counts.freeFixed++;
        return contOf(at);
      }
      if (!overwrite) counts.skipped += stuck;
    }

    /**
     * 4)의 정리 계획: 줄 j마다 받을 돈 짝(맨 위 고른 줄 = FREE, 남길 줄은 차례대로, 나머지 = 빈 칸)을 세우고
     * 돈이 바뀌는 줄만 돌려준다. 못 하는 모양이면 null. 값은 모두 미리 읽어 둔다(쓰기 전에).
     */
    function tidyMoves() {
      const seq = [];
      for (let i = 0; i < n; i++) {
        if (i === idx[0]) seq.push(-1);
        else if (!cand[i]) seq.push(i);
      }
      const out = [];
      for (let j = 0; j < n; j++) {
        const from = j < seq.length ? seq[j] : null;
        if (from !== null && from >= 0 && from !== j && !held[from]) return null; // 비트와 똑같은 줄만 옮긴다
        const pair = {};
        let diff = false;
        for (const c of money) {
          if (from === null) pair[c] = '';
          else if (from < 0) pair[c] = want(p.free.cells, c);
          else pair[c] = values[rows[from]][c];
          if (!sameValue_(values[rows[j]][c], pair[c])) diff = true;
        }
        if (!diff) continue;
        if (j > 0) {
          if (!moneyPlain(rows[j])) return null;
          for (const st of staff) if (!blankAt(rows[j], st)) return null;
        }
        out.push({ j: j, pair: pair, empty: from === null });
      }
      return out;
    }

    let changed = false;
    for (const c of money) {
      const v = want(p.free.cells, c);
      if (!sameValue_(values[rows[target]][c], v)) {
        put(rows[target], c, v);
        changed = true;
      }
    }
    for (const i of idx) {
      if (i === target || blocked.indexOf(i) >= 0) continue;
      for (const c of money) {
        if (!isBlank_(values[rows[i]][c])) {
          put(rows[i], c, '');
          changed = true;
        }
      }
      if (i > 0 && clearContName(rows[i], name)) changed = true;
    }
    if (!changed) return cont;
    counts.freeFixed++;
    return contOf(at);
  }
  /**
   * 취소된 접수의 본 줄을 지워도 되는가(DESIGN 4장): 이름 같음 · 돈 칸 빔 · 직원 칸 빔 · 이어지는 줄 없음.
   * 비고 칸에 프로그램이 쓴 글(noteTexts)만 있으면 빈 칸으로 보고 같이 지운다(판 7). 다른 글이 있으면 남긴다.
   */
  function canClearCancelled(r, c) {
    if (nameC < 0 || c.name === '' || !sameValue_(values[r][nameC], c.name)) return false;
    if (!moneyBlank(r)) return false;
    for (const s of staff) {
      if (blankAt(r, s) || (s === noteC && isProgNote(values[r][s]))) continue;
      return false;
    }
    if (noteC >= 0 && staff.indexOf(noteC) < 0 && !blankAt(r, noteC) && !isProgNote(values[r][noteC])) return false;
    return contOf(r).length === 0;
  }
  /**
   * 이름만 보고 붙일 수 있는 줄(판 7, 미수만 낸 환자로 먼저 들어간 줄): 차트번호 칸 빔 · 이름 같음 · 돈 있음 ·
   * 바로 위 줄 이름이 다름(다른 줄의 이어지는 줄이 아님) · 그 줄 돈 짝이 이 환자의 비트 짝 하나와 똑같음. 없으면 -1.
   */
  function adoptRow(p) {
    if (nameC < 0) return -1;
    const name = nameOf(p);
    if (isBlank_(name)) return -1;
    const pairs = wantedOf(p);
    if (!pairs.length) return -1;
    for (let r = 0; r < nRows; r++) {
      if (!isBlank_(values[r][keyC]) || isFormula(r, keyC)) continue;
      if (!sameValue_(values[r][nameC], name) || moneyBlank(r)) continue;
      if (r > 0 && sameValue_(values[r - 1][nameC], name)) continue;
      for (const t of pairs) if (sameMoney(r, t)) return r;
    }
    return -1;
  }
  /**
   * 미수만 낸 환자(판 7, 두 모드 모두 더하기만): 차트번호 없이 이름·돈만 쓴다.
   *  1) 후보 줄: 이름이 같고 돈이 있는 줄 + 그 바로 아래 차트번호·이름이 빈 돈 줄. 비트 짝을 모음으로 똑같은 줄과 맞춘다
   *     (차트번호가 적힌 같은 이름 줄에 이미 있는 짝도 '있음'으로 센다).
   *  2) 제 블록(차트번호 빔 · 이름 같음 · 돈 있음 · 위 줄 이름 다름 + 그 이어지는 줄): 찬 돈 칸이 같은 짝은 빈 칸만 채우고,
   *     빈 칸만 채우기에서는 이어지는 줄의 빈 이름 칸도 채운다.
   *  3) 남은 짝: 제 블록이 있으면 그 끝 바로 아래에 붙이고(필요하면 줄 끼우기), 없으면 새 블록(모든 줄에 이름·돈).
   *     붙은 자리가 없으면 본 줄만이라도 넣고 full.
   */
  function handlePaid(po) {
    if (!nameOwned) return;
    const name = po.name;
    const cand = [];
    const inCand = new Set();
    let ownStart = -1;
    for (let r = 0; r < nRows; r++) {
      if (!sameValue_(values[r][nameC], name)) continue;
      if (!inCand.has(r) && !moneyBlank(r)) {
        inCand.add(r);
        cand.push(r);
      }
      if (ownStart < 0 && isBlank_(values[r][keyC]) && !moneyBlank(r) && !(r > 0 && sameValue_(values[r - 1][nameC], name))) {
        ownStart = r;
      }
      for (let q = r + 1; q < nRows && isBlank_(values[q][keyC]) && isBlank_(values[q][nameC]) && !moneyBlank(q); q++) {
        if (!inCand.has(q)) {
          inCand.add(q);
          cand.push(q);
        }
      }
    }
    const ownRows = ownStart >= 0 ? [ownStart].concat(contOf(ownStart)) : [];
    const used = new Set();
    const changed = new Set();
    const left = [];
    for (const t of po.lines) {
      let hit = -1;
      for (const r of cand) {
        if (!used.has(r) && sameMoney(r, t)) {
          hit = r;
          break;
        }
      }
      if (hit < 0) left.push(t);
      else used.add(hit);
    }
    const rest = [];
    for (const t of left) {
      let hit = -1;
      for (const r of ownRows) {
        if (!used.has(r) && partMoney(r, t)) {
          hit = r;
          break;
        }
      }
      if (hit < 0) {
        rest.push(t);
        continue;
      }
      used.add(hit);
      if (fillBlank(hit, t, money)) changed.add(hit);
    }
    if (!overwrite) fillContNames(ownRows.slice(1), name, changed);
    counts.filled += changed.size;
    if (!rest.length) return;
    if (ownRows.length) {
      appendMore(ownRows[ownRows.length - 1], rest, 0);
      return;
    }
    const block = findBlock(rest.length);
    if (block >= 0) {
      rest.forEach(function (t, i) { take(block + i, t); });
      return;
    }
    counts.full = true;
    let start = -1;
    for (let r = 0; r < nRows && start < 0; r++) if (canTake(r)) start = r;
    if (start < 0) return;
    take(start, rest[0]);
    appendMore(start, rest, 1, true);
  }

  const keyRow = new Map();
  for (let r = 0; r < nRows; r++) {
    const k = canon_(values[r][keyC]);
    if (k && !keyRow.has(k)) keyRow.set(k, r);
  }

  // 취소된 접수를 먼저: 조건이 맞으면 본 줄의 owned 칸을 비우고(그 줄은 같은 번에 다른 환자가 쓸 수 있다),
  // 아니면 남겨 두고 센다.
  const live = new Set(job.patients.map(function (p) { return p.key; }));
  const doneCancel = new Set();
  for (const c of job.cancelled) {
    if (live.has(c.key) || doneCancel.has(c.key)) continue;
    doneCancel.add(c.key);
    const at = keyRow.get(c.key);
    if (at === undefined) continue;
    if (!canClearCancelled(at, c)) {
      counts.cancelKept++;
      continue;
    }
    for (const col of own) if (!isFormula(at, col) && !isBlank_(values[at][col])) put(at, col, '');
    if (noteC >= 0 && !isFormula(at, noteC) && isProgNote(values[at][noteC])) put(at, noteC, '');
    keyRow.delete(c.key);
    counts.cancelCleared++;
  }

  function handlePatient(p) {
    let at = keyRow.get(p.key);
    if (at === undefined) {
      // 미수만 낸 환자로 먼저 들어간 줄이 있으면 그 줄을 본 줄로 삼는다(판 7).
      const adopted = adoptRow(p);
      if (adopted >= 0) {
        at = adopted;
        keyRow.set(p.key, at);
      }
    }
    if (at !== undefined) {
      const cont = fixFree(at, contOf(at), p);
      if (!overwrite) {
        fillExisting(at, cont, p);
        return;
      }
      const name = patName(at, p);
      const mainChanged = rewrite(at, p.main);
      if (applyNote(at, p.note) && !mainChanged) counts.overwritten++;
      const both = Math.min(cont.length, p.more.length);
      for (let i = 0; i < both; i++) {
        // 비트 쪽 이름이 없으면(nameOnMore 아님) 시트 이어지는 줄의 이름 칸은 그대로 둔다.
        const keepName = nameC >= 0 && isBlank_(want(p.more[i], nameC)) ? nameC : -1;
        rewrite(cont[i], p.more[i], keepName);
      }
      if (p.more.length > cont.length) {
        appendMore(cont.length ? cont[cont.length - 1] : at, p.more, cont.length);
      }
      for (let i = p.more.length; i < cont.length; i++) clearMoney(cont[i], name);
      return;
    }

    const block = findBlock(1 + p.more.length);
    if (block >= 0) {
      take(block, p.main);
      applyNote(block, p.note);
      p.more.forEach(function (t, i) { take(block + 1 + i, t); });
      keyRow.set(p.key, block);
      return;
    }

    // 붙은 자리가 모자람: 본 줄만이라도 넣고, 못 넣은 것은 full로 알린다.
    counts.full = true;
    let start = -1;
    for (let r = 0; r < nRows; r++) {
      if (canTakeMain(r)) {
        start = r;
        break;
      }
    }
    if (start < 0) return;
    take(start, p.main);
    applyNote(start, p.note);
    keyRow.set(p.key, start);
    appendMore(start, p.more, 0, true);
  }

  // 미수만 낸 환자는 받은 차례(before: 그 앞에 올 환자 번호)대로 환자 사이에 넣는다.
  const paidBefore = new Map();
  (job.paidOnly || []).forEach(function (po) {
    if (!paidBefore.has(po.before)) paidBefore.set(po.before, []);
    paidBefore.get(po.before).push(po);
  });
  job.patients.forEach(function (p, i) {
    (paidBefore.get(i) || []).forEach(handlePaid);
    handlePatient(p);
  });
  (paidBefore.get(job.patients.length) || []).forEach(handlePaid);

  if (inserts.length) applyInserts_(sheet, inserts, L.firstRow, minCol, L.shift.first, shiftLastCol);
  writePlan_(sheet, plan, L.firstRow, minCol);
  return counts;
}

/** 칸 번호 목록 → 붙은 칸끼리 [첫 칸, 개수] 묶음. */
function runs_(cols) {
  const out = [];
  cols.forEach(function (c) {
    const last = out[out.length - 1];
    if (last && last[0] + last[1] === c) last[1]++;
    else out.push([c, 1]);
  });
  return out;
}

/**
 * 끼운 줄을 시트에 차례대로 한다: 시트 끝이 모자라면 맨 끝에 줄을 늘리고, shiftCols 칸만 아래로 밀고(insertCells),
 * 위 줄의 식 칸을 새 줄로 베낀다(PASTE_FORMULA). 시트가 받아 주지 않으면 insertFailed 오류(값은 아직 안 씀).
 * 식 베끼기가 안 되면 그 줄은 같은 범위를 deleteCells로 되돌려(식 없는 빈 줄을 남기지 않게) 오류에
 * 끝난 끼우기 수(insertsDone)를 싣는다.
 */
function applyInserts_(sheet, inserts, firstRow, minCol, shiftFirst, shiftLast) {
  let done = 0;
  try {
    const need = sheet.getLastRow() + inserts.length;
    const have = sheet.getMaxRows();
    if (need > have) sheet.insertRowsAfter(have, need - have);
    const width = shiftLast - shiftFirst + 1;
    inserts.forEach(function (op) {
      const row = firstRow + op.row;
      sheet.getRange(row, shiftFirst, 1, width).insertCells(SpreadsheetApp.Dimension.ROWS);
      try {
        op.copy.forEach(function (g) {
          sheet.getRange(row - 1, minCol + g[0], 1, g[1])
            .copyTo(sheet.getRange(row, minCol + g[0], 1, g[1]), SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
        });
      } catch (e) {
        try {
          sheet.getRange(row, shiftFirst, 1, width).deleteCells(SpreadsheetApp.Dimension.ROWS);
        } catch (ignored) {
          // 되돌리지 못해도 값은 아직 안 썼다. 다시 할 때 그 빈 줄은 빈 줄로 본다.
        }
        throw e;
      }
      done++;
    });
  } catch (e) {
    const err = new Error('줄을 끼우지 못했습니다.');
    err.insertFailed = true;
    err.insertsDone = done;
    throw err;
  }
}

/**
 * 계획을 setValues 묶음으로 쓴다. 한 줄 안에서 붙은 칸끼리 묶고,
 * 위아래로 붙은 줄의 묶음 칸 범위가 같으면 한 사각형으로 합친다.
 * 계획에는 owned 칸·식 아닌 칸만 들어 있으므로 사각형도 그 칸만 덮는다.
 */
function writePlan_(sheet, plan, firstRow, minCol) {
  const rows = Array.from(plan.keys()).sort(function (a, b) { return a - b; });
  const open = new Map(); // "시작칸:끝칸" → 사각형
  const rects = [];
  rows.forEach(function (r) {
    const row = plan.get(r);
    const cols = Array.from(row.keys()).sort(function (a, b) { return a - b; });
    let s = 0;
    while (s < cols.length) {
      let e = s;
      while (e + 1 < cols.length && cols[e + 1] === cols[e] + 1) e++;
      const a = cols[s];
      const b = cols[e];
      const line = [];
      for (let c = a; c <= b; c++) line.push(writeValue_(row.get(c)));
      const spanKey = a + ':' + b;
      const rect = open.get(spanKey);
      if (rect && rect.r1 === r - 1) {
        rect.r1 = r;
        rect.vals.push(line);
      } else {
        const fresh = { r0: r, r1: r, a: a, b: b, vals: [line] };
        open.set(spanKey, fresh);
        rects.push(fresh);
      }
      s = e + 1;
    }
  });
  rects.forEach(function (x) {
    sheet.getRange(firstRow + x.r0, minCol + x.a, x.r1 - x.r0 + 1, x.b - x.a + 1).setValues(x.vals);
  });
  return rects.length;
}

/**
 * 시트가 글을 숫자·날짜·식 등으로 바꿔 넣지 않게, 그런 모양의 글은 앞에 ' 를 붙여 글로 넣는다(검토 7).
 * 예: '=…', "'…", 앞이 0인 숫자 "01234", 16자리 넘는 숫자, 날짜·시각 "2026-11-24" "11/24" "9:30",
 * "1e5" "50%" "1,234" "TRUE". 0으로 시작하지 않는 숫자뿐인 글은 숫자가 되어도 같은 값이라 그대로 둔다.
 */
const SHEETS_WOULD_CONVERT_ = [
  /^[=']/,
  /^[+-]?0\d+(\.\d+)?$/,
  /^[+-]?\d{16,}$/,
  /^\d{1,4}\s*[-/.]\s*\d{1,2}(\s*[-/.]\s*\d{1,4})?\.?$/,
  /^\d{1,2}:\d{2}(:\d{2})?(\s*[aApP][mM])?$/,
  /^[+-]?(\d+\.?\d*|\.\d+)[eE][+-]?\d+$/,
  /^[+-]?(\d+\.?\d*|\.\d+)\s*%$/,
  /^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/,
  /^(true|false)$/i
];

function writeValue_(v) {
  if (typeof v !== 'string' || v === '') return v;
  const t = v.trim();
  for (const rx of SHEETS_WOULD_CONVERT_) if (rx.test(v) || rx.test(t)) return "'" + v;
  return v;
}

// ---------------------------------------------------------------- small helpers

function isObj_(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isBlank_(v) {
  return v === '' || v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

/**
 * 비교용 모양. 앞뒤 빈칸을 빼고, 숫자처럼 생긴 글은 숫자로 본다
 * (12345 = "12345" = " 12345 ", 시트가 "0123"을 123으로 바꿔 넣어도 같다고 본다).
 */
function canon_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return isFinite(v) ? 'n:' + String(v) : 's:' + String(v);
  if (typeof v === 'boolean') return 'b:' + String(v);
  if (Object.prototype.toString.call(v) === '[object Date]') return 'd:' + v.getTime();
  const s = String(v).trim();
  if (s === '') return '';
  if (/^[+-]?\d{1,15}(\.\d+)?$/.test(s)) return 'n:' + String(Number(s));
  return 's:' + s;
}

function sameValue_(a, b) {
  return canon_(a) === canon_(b);
}

function colNum_(x, where) {
  if (typeof x !== 'string' || !/^[A-Za-z]{1,3}$/.test(x.trim())) {
    throw badRequest_(where + '의 칸 글자가 잘못되었습니다.');
  }
  const s = x.trim().toUpperCase();
  let n = 0;
  for (let i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
  return n;
}

function colLetter_(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function uniqueSorted_(nums) {
  const out = [];
  nums.forEach(function (n) { if (out.indexOf(n) < 0) out.push(n); });
  return out.sort(function (a, b) { return a - b; });
}

function fail_(code, message) {
  return { ok: false, error: message, code: code };
}

function bitsheetError_(code, message) {
  const e = new Error(message);
  e.bitsheetCode = code;
  return e;
}

function badRequest_(message) {
  return bitsheetError_('bad_request', message);
}

/** 우리 오류 글은 그대로, 구글이 낸 오류 글은 요청의 환자 값을 가린 뒤 짧게. */
function errorResult_(err, req) {
  if (err && err.bitsheetCode) return fail_(err.bitsheetCode, String(err.message));
  const raw = err && err.message ? String(err.message) : String(err);
  return fail_('google', scrub_('구글 쪽 오류: ' + raw, req).slice(0, 300));
}

/** 오류 글에 요청의 차트번호·이름·값(2글자 이상)이 섞여 있으면 *** 로 가린다. */
function scrub_(text, req) {
  const found = [];
  function add(v) {
    if (v === null || v === undefined || typeof v === 'object') return;
    const s = String(v).trim();
    if (s.length >= 2 && found.indexOf(s) < 0) found.push(s);
  }
  function addAll(obj) {
    if (isObj_(obj)) Object.keys(obj).forEach(function (k) { add(obj[k]); });
  }
  if (isObj_(req) && Array.isArray(req.patients)) {
    req.patients.forEach(function (p) {
      if (!isObj_(p)) return;
      add(p.key);
      addAll(p.cells);
      if (Array.isArray(p.more)) p.more.forEach(addAll);
      if (isObj_(p.free) && Array.isArray(p.free.dropped)) p.free.dropped.forEach(addAll);
    });
  }
  if (isObj_(req) && Array.isArray(req.paidOnly)) {
    req.paidOnly.forEach(function (x) {
      if (!isObj_(x)) return;
      addAll(x.cells);
      if (Array.isArray(x.more)) x.more.forEach(addAll);
    });
  }
  if (isObj_(req) && Array.isArray(req.cancelled)) {
    req.cancelled.forEach(function (c) {
      if (!isObj_(c)) return;
      add(c.key);
      addAll(c.cells);
    });
  }
  if (isObj_(req) && typeof req.token === 'string') add(req.token);
  found.sort(function (a, b) { return b.length - a.length; });
  let out = text;
  found.forEach(function (s) { out = out.split(s).join('***'); });
  return out;
}
