// 구글 Apps Script 서비스의 아주 작은 메모리 가짜. 수납 구글 코드(google-code/sheet/Code.gs)를 node:vm 안에서 돌린다.
// 비트시트 apps-script/test/fake-google.js를 TS로 옮기고 8판이 쓰는 것(Utilities HMAC·base64, getOwner, Session)을 더했다.
// 진짜와 같게 흉내 내는 것: getValues/getFormulas/setValues, 시트 크기 밖 범위는 오류,
// setValues에 숫자처럼 생긴 글을 넣으면 숫자로(앞의 0은 사라짐), 날짜처럼 생긴 글은 날짜로, TRUE/FALSE는 참거짓으로,
// '='로 시작하면 식으로, "'"로 시작하면 (' 를 뺀) 글로 바뀜.
// insertCells(ROWS): 그 범위의 칸들(열)만 아래로 민다(값·식 그대로, 식 글자는 고치지 않음). 시트 끝 밖으로 밀리는 내용이 있으면 오류.
// copyTo(PASTE_FORMULA): 식 칸만 베끼고 $ 없는 줄 번호를 옮긴 만큼 고친다. 값 칸은 베끼지 않는다.
// deleteCells(ROWS): 그 범위의 칸들(열)만 지우고 아래 칸을 위로 올린다(insertCells를 되돌림).
// getDisplayValues: 보이는 글(값을 글로). getRangeList([...]).clearContent(): 값·식만 지우고 서식·확인 규칙(format)은 남긴다.
// getOwner(): 파일·폴더 주인(없으면 null = 공유 드라이브). 기본 주인은 OWNER, Session의 사용자도 기본 OWNER.
// Utilities.computeHmacSha256Signature(value, key): 진짜처럼 -128~127 바이트 목록. base64EncodeWebSafe: 진짜처럼 '=' 채움이 붙는다.
// ScriptApp은 일부러 두지 않는다(8판은 배포 주소에 기대지 않는다). console·Logger는 부르면 env.logs에 남는다.
// 시험 손잡이: 없는 시트·파일은 진짜처럼 null·undefined를 돌려주지만 타입은 있는 쪽으로 둔다(옮긴 시험 글을 그대로 두려고).
// 비밀 글자·메일·환자 값은 모두 지어낸 시험 값이다.

import { createHmac } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

export const SHEETS_MIME = 'application/vnd.google-apps.spreadsheet'
export const CODE_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'sheet', 'Code.gs')
/** 가짜 병원 구글 계정(파일·폴더 기본 주인이자 Session 사용자). */
export const OWNER = 'clinic@fake.test'
/** 지어낸 시험 비밀 글자(진짜 값 아님). */
export const TEST_TOKEN = 'TestToken0123456789abcdefABCDEF42'

export type CellValue = string | number | boolean | Date

export interface Cell {
  v: CellValue
  f: string
  format?: string
}

export function colNum(s: string): number {
  let n = 0
  for (const ch of s.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n
}

export function parseA1(ref: string): { row: number; col: number } {
  const m = /^([A-Z]+)(\d+)$/i.exec(ref)
  if (!m) throw new Error('bad A1 ref ' + ref)
  return { row: Number(m[2]), col: colNum(m[1]) }
}

interface Iter<T> {
  hasNext(): boolean
  next(): T
}

function iterator<T>(list: T[]): Iter<T> {
  let i = 0
  return { hasNext: () => i < list.length, next: () => list[i++] }
}

function parseLikeSheets(raw: unknown): Cell {
  if (typeof raw === 'string') {
    if (raw.startsWith("'")) return { v: raw.slice(1), f: '' }
    if (raw.startsWith('=')) return { v: '', f: raw }
    const t = raw.trim()
    if (/^[+-]?\d+(\.\d+)?$/.test(t)) return { v: Number(t), f: '' }
    if (/^(true|false)$/i.test(t)) return { v: t.toLowerCase() === 'true', f: '' }
    // 날짜처럼 생긴 글은 날짜가 된다(2026-11-24, 11/24, 11-24)
    let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(t)
    if (m) return { v: new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])), f: '' }
    m = /^(\d{1,2})[-/](\d{1,2})$/.exec(t)
    if (m) return { v: new Date(2026, Number(m[1]) - 1, Number(m[2])), f: '' }
    return { v: raw, f: '' }
  }
  return { v: raw as CellValue, f: '' }
}

export interface Write {
  row: number
  col: number
  value: unknown
  hadFormula: boolean
}

interface Block {
  row: number
  col: number
  nc: number
  nr: number
}

function isTable(vals: unknown, nr: number, nc: number): vals is unknown[][] {
  return Array.isArray(vals) && vals.length === nr && vals.every((l) => Array.isArray(l) && l.length === nc)
}

export class FakeRange {
  constructor(
    public sheet: FakeSheet,
    public row: number,
    public col: number,
    public nr: number,
    public nc: number,
  ) {}
  getValues(): CellValue[][] {
    const out: CellValue[][] = []
    for (let r = 0; r < this.nr; r++) {
      const line: CellValue[] = []
      for (let c = 0; c < this.nc; c++) line.push(this.sheet.cell(this.row + r, this.col + c).v)
      out.push(line)
    }
    this.sheet.reads++
    return out
  }
  getDisplayValues(): string[][] {
    return this.getValues().map((line) => line.map((v) => (v === '' || v === null || v === undefined ? '' : String(v))))
  }
  getFormulas(): string[][] {
    this.sheet.formulaReads++
    const out: string[][] = []
    for (let r = 0; r < this.nr; r++) {
      const line: string[] = []
      for (let c = 0; c < this.nc; c++) line.push(this.sheet.cell(this.row + r, this.col + c).f)
      out.push(line)
    }
    return out
  }
  setValues(vals: unknown): this {
    const sh = this.sheet
    sh.setValuesCalls++
    if (sh.failSetValues) throw new Error(sh.failSetValues)
    if (!isTable(vals, this.nr, this.nc)) {
      throw new Error('The number of rows or columns in the data does not match the range.')
    }
    for (let r = 0; r < this.nr; r++) {
      for (let c = 0; c < this.nc; c++) {
        const row = this.row + r
        const col = this.col + c
        const old = sh.cell(row, col)
        sh.writes.push({ row, col, value: vals[r][c], hadFormula: old.f !== '' })
        sh.cells.set(row + ',' + col, parseLikeSheets(vals[r][c]))
      }
    }
    return this
  }
  /** 식 쓰기(비율 식 고치기). 시험이 보도록 formulaWrites에 남긴다(값 쓰기 writes와 따로). */
  setFormulas(list: unknown): this {
    const sh = this.sheet
    if (sh.failSetFormulas) throw new Error(sh.failSetFormulas)
    if (!isTable(list, this.nr, this.nc)) {
      throw new Error('The number of rows or columns in the data does not match the range.')
    }
    for (let r = 0; r < this.nr; r++) {
      for (let c = 0; c < this.nc; c++) {
        const row = this.row + r
        const col = this.col + c
        const old = sh.cell(row, col)
        sh.formulaWrites.push({ row, col, formula: String(list[r][c]), old: old.f })
        sh.cells.set(row + ',' + col, { v: old.v, f: String(list[r][c]) })
      }
    }
    return this
  }
  insertCells(dim: string): this {
    const sh = this.sheet
    if (dim !== 'ROWS') throw new Error('only ROWS is faked')
    if (sh.failInsert) throw new Error(sh.failInsert)
    const n = this.nr
    for (let c = this.col; c < this.col + this.nc; c++) {
      for (let r = sh.maxRows - n + 1; r <= sh.maxRows; r++) {
        const x = sh.cell(r, c)
        if (r >= this.row && (x.v !== '' || x.f !== '')) throw new Error('insertCells would push content off the sheet')
      }
      for (let r = sh.maxRows; r >= this.row + n; r--) {
        const from = sh.cells.get(r - n + ',' + c)
        if (from) sh.cells.set(r + ',' + c, from)
        else sh.cells.delete(r + ',' + c)
      }
      for (let r = this.row; r < this.row + n; r++) sh.cells.delete(r + ',' + c)
    }
    sh.inserts.push({ row: this.row, col: this.col, nc: this.nc, nr: n })
    return this
  }
  deleteCells(dim: string): this {
    const sh = this.sheet
    if (dim !== 'ROWS') throw new Error('only ROWS is faked')
    const n = this.nr
    for (let c = this.col; c < this.col + this.nc; c++) {
      for (let r = this.row; r <= sh.maxRows; r++) {
        const from = r + n <= sh.maxRows ? sh.cells.get(r + n + ',' + c) : undefined
        if (from) sh.cells.set(r + ',' + c, from)
        else sh.cells.delete(r + ',' + c)
      }
    }
    sh.deletes.push({ row: this.row, col: this.col, nc: this.nc, nr: n })
    return this
  }
  copyTo(dest: FakeRange, type: string, transposed: boolean): FakeRange {
    if (type !== 'PASTE_FORMULA' || transposed) throw new Error('only PASTE_FORMULA is faked')
    const sh = this.sheet
    if (sh.failCopy) throw new Error(sh.failCopy)
    const dr = dest.row - this.row
    const dc = dest.col - this.col
    for (let r = 0; r < this.nr; r++) {
      for (let c = 0; c < this.nc; c++) {
        const x = sh.cell(this.row + r, this.col + c)
        if (x.f === '') continue
        const f = x.f.replace(
          /(\$?)([A-Z]{1,3})(\$?)(\d+)/g,
          (all: string, a: string, col: string, b: string, row: string) => a + col + b + (b ? row : String(Number(row) + dr)),
        )
        dest.sheet.cells.set(this.row + r + dr + ',' + (this.col + c + dc), { v: '', f })
        sh.copies.push({ row: this.row + r + dr, col: this.col + c + dc, f })
      }
    }
    return dest
  }
}

export class FakeSheet {
  cells = new Map<string, Cell>()
  writes: Write[] = []
  inserts: Block[] = []
  deletes: Block[] = []
  clears: { row: number; col: number; hadFormula: boolean }[] = []
  rangeLists = 0
  copies: { row: number; col: number; f: string }[] = []
  setValuesCalls = 0
  formulaWrites: { row: number; col: number; formula: string; old: string }[] = []
  formulaReads = 0
  reads = 0
  failSetValues: string | null = null
  failInsert: string | null = null
  failCopy: string | null = null
  failClear?: string | null
  failSetFormulas?: string | null
  rowsAdded?: number

  constructor(
    public name: string,
    public id: number,
    public maxRows: number,
    public maxCols: number,
  ) {}
  resetCounters(): void {
    this.writes = []
    this.inserts = []
    this.deletes = []
    this.clears = []
    this.rangeLists = 0
    this.copies = []
    this.setValuesCalls = 0
    this.formulaWrites = []
    this.formulaReads = 0
    this.reads = 0
    this.failSetValues = null
    this.failInsert = null
    this.failCopy = null
  }
  getName(): string {
    return this.name
  }
  getSheetId(): number {
    return this.id
  }
  getMaxRows(): number {
    return this.maxRows
  }
  getLastRow(): number {
    let last = 0
    for (const [k, x] of this.cells) if (x.v !== '' || x.f !== '') last = Math.max(last, Number(k.split(',')[0]))
    return last
  }
  insertRowsAfter(after: number, n: number): void {
    const moved = new Map<string, Cell>()
    for (const [k, x] of this.cells) {
      const [r, c] = k.split(',').map(Number)
      moved.set((r > after ? r + n : r) + ',' + c, x)
    }
    this.cells = moved
    this.maxRows += n
    this.rowsAdded = (this.rowsAdded || 0) + n
  }
  getMaxColumns(): number {
    return this.maxCols
  }
  /** A1 목록("B17", "D17:D20")의 칸 묶음. clearContent()는 값·식만 지운다(format은 남김). */
  getRangeList(list: string[]): { clearContent(): unknown } {
    const cells: [number, number][] = []
    for (const a1 of list) {
      const [from, to] = a1.split(':')
      const a = parseA1(from)
      const b = to ? parseA1(to) : a
      for (let r = a.row; r <= b.row; r++) for (let c = a.col; c <= b.col; c++) cells.push([r, c])
    }
    const rangeList: { clearContent(): unknown } = {
      clearContent: () => {
        if (this.failClear) throw new Error(this.failClear)
        for (const [r, c] of cells) {
          const old = this.cells.get(r + ',' + c)
          if (!old) continue
          if (old.format) this.cells.set(r + ',' + c, { v: '', f: '', format: old.format })
          else this.cells.delete(r + ',' + c)
          this.clears.push({ row: r, col: c, hadFormula: old.f !== '' })
        }
        this.rangeLists++
        return rangeList
      },
    }
    return rangeList
  }
  getRange(row: number, col: number, nr = 1, nc = 1): FakeRange {
    if (row < 1 || col < 1 || nr < 1 || nc < 1 || row + nr - 1 > this.maxRows || col + nc - 1 > this.maxCols) {
      throw new Error('The coordinates of the range are outside the dimensions of the sheet.')
    }
    return new FakeRange(this, row, col, nr, nc)
  }
  cell(row: number, col: number): Cell {
    return this.cells.get(row + ',' + col) || { v: '', f: '' }
  }
  // ---- 시험용 손잡이
  val(ref: string): CellValue {
    const { row, col } = parseA1(ref)
    return this.cell(row, col).v
  }
  formula(ref: string): string {
    const { row, col } = parseA1(ref)
    return this.cell(row, col).f
  }
  put(ref: string, v: CellValue): void {
    const { row, col } = parseA1(ref)
    this.cells.set(row + ',' + col, { v, f: '' })
  }
  putFormula(ref: string, f: string, shown: CellValue = ''): void {
    const { row, col } = parseA1(ref)
    this.cells.set(row + ',' + col, { v: shown, f })
  }
  /** 한 줄의 칸들 값 { B: .., C: .. } */
  rowValues(row: number, letters: string[]): Record<string, CellValue> {
    const o: Record<string, CellValue> = {}
    for (const L of letters) o[L] = this.cell(row, colNum(L)).v
    return o
  }
  snapshot(): string {
    return JSON.stringify([...this.cells.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)))
  }
  clone(): FakeSheet {
    const s = new FakeSheet(this.name, this.id, this.maxRows, this.maxCols)
    for (const [k, v] of this.cells) s.cells.set(k, { ...v })
    if (this.failClear) s.failClear = this.failClear
    return s
  }
}

export class FakeSpreadsheet {
  constructor(
    public id: string,
    public name: string,
    public sheets: FakeSheet[],
  ) {}
  getId(): string {
    return this.id
  }
  getName(): string {
    return this.name
  }
  getUrl(): string {
    return 'https://docs.google.com/spreadsheets/d/' + this.id + '/edit'
  }
  /** 없으면 진짜처럼 null(타입은 시험 손잡이라 FakeSheet). */
  getSheetByName(n: string): FakeSheet {
    return (this.sheets.find((s) => s.name === n) || null) as FakeSheet
  }
  getSheets(): FakeSheet[] {
    return this.sheets.slice()
  }
  clone(id: string, name: string): FakeSpreadsheet {
    return new FakeSpreadsheet(
      id,
      name,
      this.sheets.map((s) => s.clone()),
    )
  }
}

interface FakeUser {
  getEmail(): string
}

/** 주인 메일 → 진짜 User처럼 getEmail()이 있는 것. 없으면 null(공유 드라이브). */
function ownerOf(email: string | null): FakeUser | null {
  return email === null ? null : { getEmail: () => email }
}

export class FakeFolder {
  files: FakeFile[] = []
  /** 주인 메일(null = 주인 없음, 공유 드라이브). */
  owner: string | null = OWNER
  constructor(
    public id: string,
    public name: string,
  ) {}
  getId(): string {
    return this.id
  }
  getName(): string {
    return this.name
  }
  getOwner(): FakeUser | null {
    return ownerOf(this.owner)
  }
  getFilesByName(n: string): Iter<FakeFile> {
    return iterator(this.files.filter((f) => f.name === n))
  }
}

export class FakeFile {
  parents: FakeFolder[]
  trashed = false
  editors: string[] = []
  /** 주인 메일(null = 주인 없음, 공유 드라이브). */
  owner: string | null = OWNER
  /** 구글 시트가 아니면 진짜처럼 null(타입은 시험 손잡이라 FakeSpreadsheet). */
  spreadsheet: FakeSpreadsheet
  constructor(
    public drive: FakeDrive,
    public id: string,
    public name: string,
    public mime: string,
    parent: FakeFolder | null,
    spreadsheet: FakeSpreadsheet | null,
  ) {
    this.parents = parent ? [parent] : []
    this.spreadsheet = spreadsheet as FakeSpreadsheet
  }
  getId(): string {
    return this.id
  }
  getName(): string {
    return this.name
  }
  getMimeType(): string {
    return this.mime
  }
  getOwner(): FakeUser | null {
    return ownerOf(this.owner)
  }
  isTrashed(): boolean {
    return this.trashed
  }
  setTrashed(t: boolean): this {
    this.trashed = !!t
    return this
  }
  getParents(): Iter<FakeFolder> {
    return iterator(this.parents.slice())
  }
  getUrl(): string {
    return 'https://drive.google.com/file/d/' + this.id + '/view'
  }
  makeCopy(name: string, folder: FakeFolder): FakeFile {
    this.drive.copies++
    const id = this.drive.newId('copy')
    const ss = this.spreadsheet ? this.spreadsheet.clone(id, name) : null
    return this.drive.addFile(new FakeFile(this.drive, id, name, this.mime, folder, ss))
  }
  addEditor(email: string): this {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Invalid email: ' + email)
    this.editors.push(email)
    return this
  }
}

/** 파일 표. 없는 id면 진짜 Map처럼 undefined(타입은 시험 손잡이라 FakeFile). */
class FileMap extends Map<string, FakeFile> {
  get(id: string): FakeFile {
    return super.get(id) as FakeFile
  }
}

export class FakeDrive {
  files = new FileMap()
  folders = new Map<string, FakeFolder>()
  copies = 0
  seq = 0
  root: FakeFolder
  constructor() {
    this.root = this.addFolder(new FakeFolder('root', '내 드라이브'))
  }
  newId(prefix: string): string {
    this.seq++
    return prefix + '-' + this.seq
  }
  addFolder(f: FakeFolder): FakeFolder {
    this.folders.set(f.id, f)
    return f
  }
  addFile(f: FakeFile): FakeFile {
    this.files.set(f.id, f)
    for (const p of f.parents) p.files.push(f)
    return f
  }
  api() {
    return {
      getFileById: (id: string): FakeFile => {
        const f = this.files.get(id)
        if (!f) throw new Error('No item with the given ID could be found, or you do not have permission to access it.')
        return f
      },
      getFolderById: (id: string): FakeFolder => {
        const f = this.folders.get(id)
        if (!f) throw new Error('No item with the given ID could be found, or you do not have permission to access it.')
        return f
      },
      getRootFolder: (): FakeFolder => this.root,
    }
  }
}

/** 원본처럼 생긴 날짜 시트: 16줄 머리, 17~302 환자 칸, A=NO 번호, E·P·S = 식. */
export function makeDateSheet(name: string, id: number): FakeSheet {
  const s = new FakeSheet(name, id, 303, 30) // A..AD
  const heads: Record<string, string> = {
    A: 'NO',
    B: '차트번호',
    C: '이름',
    D: '기호',
    E: '구분',
    F: '금액',
    G: '비고',
    I: '진료실',
    J: '초진',
    K: '90일초진',
    L: 'Block',
    M: '물리치료',
    O: '예약',
    P: '예약식',
    R: '지출',
    S: '지출식',
    T: '지출비고',
  }
  for (const [L, h] of Object.entries(heads)) s.put(L + '16', h)
  s.putFormula('J5', '=COUNTIF(J17:J303,0)', 0)
  for (let r = 17; r <= 302; r++) {
    s.put('A' + r, r - 16)
    s.putFormula('E' + r, '=IF(D' + r + '="","-",CHOOSE(D' + r + ',"현금","카드","미수현금","미수카드","계좌","FREE"))', '-')
    s.putFormula('P' + r, '=IF(O' + r + '="",0,1)', 0)
    s.putFormula('S' + r, '=IF(R' + r + '="",0,R' + r + ')', 0)
  }
  return s
}

class TextOutput {
  mime: string | null = null
  constructor(public content: string) {}
  setMimeType(m: string): this {
    this.mime = m
    return this
  }
  getContent(): string {
    return this.content
  }
  getMimeType(): string | null {
    return this.mime
  }
}

export interface Env {
  drive: FakeDrive
  folder: FakeFolder
  template: FakeFile
  props: Map<string, string>
  lockFree: boolean
  lockTries: number
  releases: number
  flushes: number
  /** Session.getEffectiveUser().getEmail()이 돌려줄 메일. */
  userEmail: string
  /** 코드가 console·Logger로 남긴 기록(8판은 하나도 남기지 않아야 한다). */
  logs: string[]
  globals: Record<string, unknown>
}

function makeEnv(): Env {
  const drive = new FakeDrive()
  const folder = drive.addFolder(new FakeFolder('fld-clinic', '병원 폴더'))
  const tplSheets = [new FakeSheet('관리자', 0, 50, 10)]
  ;['22', '23', '24'].forEach((n, i) => tplSheets.push(makeDateSheet(n, 100 + i)))
  const tplSs = new FakeSpreadsheet('tpl-1', '일일 수납일지(원본)', tplSheets)
  const template = drive.addFile(new FakeFile(drive, 'tpl-1', '일일 수납일지(원본)', SHEETS_MIME, folder, tplSs))

  const env: Env = {
    drive,
    folder,
    template,
    props: new Map(),
    lockFree: true,
    lockTries: 0,
    releases: 0,
    flushes: 0,
    userEmail: OWNER,
    logs: [],
    globals: {},
  }
  const record = (...args: unknown[]) => {
    env.logs.push(args.map(String).join(' '))
  }

  env.globals = {
    DriveApp: drive.api(),
    SpreadsheetApp: {
      openById: (id: string) => {
        const f = drive.files.get(id)
        if (!f || !f.spreadsheet) throw new Error('Unable to open the spreadsheet.')
        return f.spreadsheet
      },
      flush: () => {
        env.flushes++
      },
      Dimension: { ROWS: 'ROWS', COLUMNS: 'COLUMNS' },
      CopyPasteType: { PASTE_FORMULA: 'PASTE_FORMULA', PASTE_NORMAL: 'PASTE_NORMAL', PASTE_VALUES: 'PASTE_VALUES' },
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k: string) => (env.props.has(k) ? env.props.get(k) : null),
        setProperty(k: string, v: unknown) {
          env.props.set(k, String(v))
          return this
        },
        deleteProperty(k: string) {
          env.props.delete(k)
          return this
        },
      }),
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => {
          env.lockTries++
          return env.lockFree
        },
        waitLock: () => {
          if (!env.lockFree) throw new Error('Lock timeout')
        },
        releaseLock: () => {
          env.releases++
        },
        hasLock: () => env.lockFree,
      }),
    },
    ContentService: {
      MimeType: { JSON: 'JSON', TEXT: 'TEXT' },
      createTextOutput: (s: string) => new TextOutput(s),
    },
    Session: {
      getEffectiveUser: () => ({ getEmail: () => env.userEmail }),
    },
    Utilities: {
      Charset: { UTF_8: 'UTF_8' },
      // 진짜: computeHmacSha256Signature(value, key) → Byte[](자바 바이트라 -128~127)
      computeHmacSha256Signature: (value: string, key: string) =>
        Array.from(createHmac('sha256', String(key)).update(String(value), 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
      // 진짜: base64EncodeWebSafe(Byte[] | string) → '-'·'_' 글자, '=' 채움은 그대로 붙는다
      base64EncodeWebSafe: (data: number[] | string) => {
        const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data.map((b) => b & 255))
        return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_')
      },
    },
    Logger: { log: record },
    console: { log: record, info: record, warn: record, error: record },
  }
  return env
}

/** 구글 코드 답(JSON). 시험이 읽는 칸을 모두 적는다 — 답 종류마다 없는 칸은 undefined다. */
export interface Reply {
  ok: boolean
  code: string
  error: string
  version: string
  templateTitle: string
  fileId: string
  fileUrl: string
  sheetGid: number
  created: boolean
  added: number
  filled: number
  overwritten: number
  skipped: number
  full: boolean
  cancelCleared: number
  cancelKept: number
  freeFixed: number
  inserted: number
  cleaned: number
  shareFailed: number
  ratioFormulas: { fixed: number; skipped: string[]; skippedCount: number; failed: boolean }
  mac: string
  months: { ym: string; fileId: string | null; gids: Record<string, number> }[]
}

export interface App {
  ctx: vm.Context
  env: Env
  token: string
  post(body: unknown): Reply
  postRaw(contents: string): Reply
}

/** Code.gs를 불러온다. replaceToken이면 도우미처럼 비밀 글자 자리를 바꿔 끼운다. */
export function load({ token = TEST_TOKEN, replaceToken = true }: { token?: string; replaceToken?: boolean } = {}): App {
  let src = fs.readFileSync(CODE_PATH, 'utf8')
  if (replaceToken) src = src.replace('__TOKEN__', token)
  const env = makeEnv()
  const ctx = vm.createContext({ ...env.globals })
  vm.runInContext(src, ctx, { filename: 'Code.gs' })
  function postRaw(contents: string): Reply {
    const out = ctx.doPost({ postData: { contents, type: 'application/json' } })
    if (out.getMimeType() !== 'JSON') throw new Error('doPost did not answer JSON')
    return JSON.parse(out.getContent())
  }
  return { ctx, env, token, post: (body: unknown) => postRaw(JSON.stringify(body)), postRaw }
}
