# 설계: ERP 마감일지 입력 목록(복사·엑셀, 자동 입력 없음)

## 개요
- 새 크롬 확장 `extension-erp-list/`를 만든다. 화면은 확장 안 페이지 `list.html` 하나이고 설정 화면은 지금 확장의 것을 그대로 싣는다.
  - ERP 사이트에 들어갈 권한이 없다(내용 스크립트·사이트 권한·웹 접근 자원 없음). 그래서 ERP 화면을 건드릴 길 자체가 없다(manifest 시험으로 지킨다).
  - 숫자 셈은 새로 만들지 않는다. 지금 확장이 쓰는 부품을 **고치지 않고 그대로 불러** 쓴다: 도우미 통로(`background.ts`), 설정(`settings.ts`), 칸 계획(`cells.ts planCells`), 답 검사(`main.ts readDay`), 경고 줄(`panel.ts warningLines`), 기간 규칙(`rangeView.ts pickProblem`·`range.ts rangeDays`), 오류 글(`errors.ts`).
  - 새로 쓰는 것은 줄·열 모양 만들기(`rows.ts`), 화면 그리기(`view.ts`), 흐름(`list.ts`), 엑셀 파일 쓰기(`zip.ts`·`xlsx.ts`), 아이콘을 누르면 화면을 여는 서비스 워커(`background.ts`)뿐이다.
- ERP 도우미는 셈을 바꾸지 않는다. 받는 확장만 하나 늘린다: 등록 틀 `allowed_origins`에 새 확장을 더하고, 기존 `MessageLoop`(고치지 않음) 앞에 ERP 부품 `ErpCallers.ForMessageLoop`를 둔다.
- 지금 확장(`extension-erp/`)·청구 쪽(`extension/`·`helper/`)·웹앱(`src/`)은 한 글자도 바꾸지 않는다. 하나뿐인 예외는 vitest 시험 범위 목록을 글자 그대로 묶어 둔 시험 `src/b2b-merge.test.ts`의 기대 목록 한 줄이다(결정 15, AC-3901.6).

## 구성 요소 / 인터페이스

### 1. 폴더·빌드·manifest (TASK-1·5)
```
extension-erp-list/
  manifest.json            TASK-1
  tsconfig.json            TASK-1
  list.html                TASK-5 (시안 모양·글, 시안 띠 없음)
  README.md                TASK-6
  src/background.ts        TASK-1  서비스 워커
  src/listTypes.ts         TASK-1  목록 모양 타입·새 화면 글
  src/rows.ts              TASK-2  답 + 설정 → 목록 모양
  src/zip.ts, src/xlsx.ts  TASK-3  저장만 하는 zip · xlsx 쓰기
  src/view.ts, src/list.ts TASK-5  화면 그리기 · 흐름
scripts/build-erp-list.mjs TASK-5  빌드
```
- `extension-erp-list/tsconfig.json`
  ```json
  {
    "compilerOptions": {
      "target": "ES2022", "lib": ["ES2022", "DOM", "DOM.Iterable"], "module": "ES2022", "moduleResolution": "bundler",
      "isolatedModules": true, "strict": true, "skipLibCheck": true, "types": ["chrome"],
      "rootDir": "..", "outDir": "dist", "noEmitOnError": true
    },
    "include": ["src/*.ts", "../extension-erp/src/options.ts"],
    "exclude": ["src/*.test.ts"]
  }
  ```
  - `options.ts`는 새 코드가 부르지 않으므로 include에 따로 넣어야 dist에 나온다(설정 화면 `options.html`이 싣는다).
  - 새 코드는 지금 부품을 상대 경로 `../../extension-erp/src/<이름>.js`로 부른다. `rootDir`가 저장소 맨 위(`..`)라 tsc가 불려 온 지금 부품(고치지 않은 글 그대로)도 `dist/extension-erp/src/`에 함께 내고, 새 코드는 `dist/extension-erp-list/src/`에 낸다. 폴더 모양이 소스와 같아 import 글자를 고칠 일이 없다.
  - 컴파일 설정은 `extension-erp/tsconfig.json`과 같다(같은 소스를 같은 설정으로 바꾼다).
- 만든 dist 모양
  ```
  dist/manifest.json · dist/list.html · dist/options.html
  dist/extension-erp-list/src/{background,listTypes,rows,zip,xlsx,view,list}.js
  dist/extension-erp/src/{background,options,settings,cells,types,errors,josa,main,panel,fill,erpday,range,rangeTypes,rangeView}.js
  ```
  - `main.js`·`panel.js`를 부르므로 그 import(`fill`·`erpday`·`range`·`rangeView`·`rangeTypes`)도 실린다. 실리기만 하고 부르지 않는다(2절, 결정 2). `content.js`는 실리지 않는다.
- `extension-erp-list/manifest.json`
  ```json
  {
    "manifest_version": 3,
    "name": "ERP 마감일지 입력 목록",
    "version": "0.1.0",
    "description": "이 PC의 ERP 도우미가 비트에서 센 마감일지 숫자를 날짜별 목록으로 보여 줍니다. 숫자를 누르면 복사되고 엑셀로도 받을 수 있습니다. ERP 화면은 건드리지 않습니다.",
    "permissions": ["nativeMessaging", "storage"],
    "background": { "service_worker": "extension-erp-list/src/background.js", "type": "module" },
    "action": { "default_title": "ERP 마감일지 입력 목록" },
    "options_page": "options.html",
    "key": "<TASK-1이 만든 공개키>"
  }
  ```
  - 열쇠: TASK-1이 저장소 밖(scratchpad)에서 `node:crypto` `generateKeyPairSync('rsa', { modulusLength: 2048 })`로 만들고 공개키만 `publicKey.export({ type: 'spki', format: 'der' }).toString('base64')`로 `key`에 넣는다. 개인키는 파일로 쓰지 않고, 화면·로그·채팅에 찍지 않고(내보내지도 않음) 그 자리에서 버린다. 압축해제 설치는 공개키만으로 ID가 정해지고(지금 확장과 같음, spec erp-closing-fill design.md 1절), 이 확장은 .crx로 묶거나 웹스토어에 올리지 않으므로 개인키가 필요 없다.
  - 아이콘 그림은 두지 않는다(지금 확장도 없음, 크롬이 글자 아이콘을 보인다).
- `scripts/build-erp-list.mjs` (`package.json` `"ext-erp-list:build": "node scripts/build-erp-list.mjs"`)
  ```js
  export const OPTIONS_SCRIPT = '<script type="module" src="options.js"></script>'
  export const OPTIONS_SCRIPT_DIST = '<script type="module" src="extension-erp/src/options.js"></script>'
  /** extension-erp/options.html 글 → dist options.html 글. script 줄이 정확히 하나가 아니면 throw */
  export function rewriteOptions(html) {}
  /** dist 안에서 manifest background.service_worker · list.html·options.html의 <script src>가 가리키는 파일 중 없는 것(경로 목록) */
  export function missingRefs(distDir) {}
  // 직접 실행될 때만: rm dist → tsc(-p extension-erp-list/tsconfig.json, node_modules/typescript/bin/tsc) → manifest.json·list.html 복사 →
  // options.html 쓰기 → missingRefs가 비어 있지 않으면 그 목록으로 throw
  ```
  - `missingRefs`는 첫 파일(서비스 워커·두 화면 script)만 본다. 그 파일들이 부르는 모듈이 dist에 있는지는 import 규칙(AC-3901.4: `./*.js`와 표의 `../../extension-erp/src/*.js`만, 패키지 이름·동적 `import()` 없음)과 tsc가 그 모듈을 함께 내는 것으로 보장한다.
  - 스크립트를 파일로 둔 까닭: 지금 `ext-erp:build`처럼 `node -e` 한 줄에 넣기에는 바꾸기·검사가 길다. `scripts/`는 ESLint가 보지 않는 폴더이고(지금 설정), 두 함수는 시험이 바로 부른다.
- 루트 설정(TASK-1): `vitest.config.ts` include에 `'extension-erp-list/**/*.test.ts'`, `tsconfig.json` exclude에 `"extension-erp-list"`, `eslint.config.mjs` ignores에 `'extension-erp-list/dist/'`와 ERP 확장 규칙 묶음 `files`에 `'extension-erp-list/src/**'`(규칙·글은 그대로), `.gitignore`에 `extension-erp-list/dist/`. `vitest.config.ts` 맨 위 주석의 찾는 시험 목록에도 `extension-erp-list/**/*.test.ts(ERP 마감일지 입력 목록 확장)`를 더한다(지금 주석 글은 그대로 둔다, `src/b2b-merge.test.ts`가 그 글을 본다).

### 2. 다시 쓰는 지금 부품 (고치지 않음, AC-3901.4)
| 부품(`extension-erp/src/`) | 새 코드가 쓰는 이름 | 쓰는 곳 |
|---|---|---|
| `background.js` | (불러오기만: 맨 아래 스스로 켜기가 도우미 통로를 켠다) | `background.ts` |
| `settings.js` | `load`, `toGroups`, `overlapAsks` | `list.ts`, `rows.ts` |
| `cells.js` | `planCells`, `HELD_SALES`, 타입 `Planned`·`Where` | `rows.ts`, `listTypes.ts` |
| `main.js` | `readDay`, `READ_TIMEOUT_MS` | `list.ts` |
| `panel.js` | `TEXT`(reading·first·held·openSettings), `FLOW_TEXT`(zero), `SKIP_TEXT`(noName.help), `OVERLAP_TEXT`(into·done), `warningLines` | `listTypes.ts`, `rows.ts`, `view.ts` |
| `rangeView.js` | `RANGE_TEXT`(pick·scanning·confirm.overlapLast), `pickProblem`, `localToday`, `dayList` | `list.ts`, `rows.ts`, `xlsx.ts`, `view.ts` |
| `range.js` | `rangeDays` | `list.ts` |
| `errors.js` | `explain`, `E_BRIDGE_DISCONNECTED`, `E_BRIDGE_BAD_REPLY`, `E_HELPER_TIMEOUT` | `list.ts`, `view.ts` |
| `types.js` | `GROUP_NAMES`, 타입 `ClosingDay`·`Settings`·`OverlapChoice` | 여러 곳 |
| `options.js` | (설정 화면 `options.html`이 싣는다, 새 코드는 부르지 않음) | dist `options.html` |
- 시험(`manifest.test.ts`)이 `extension-erp-list/src/*.ts`(시험 빼고)의 `import … from '../../extension-erp/src/…'`를 모두 읽어 이 표 밖의 모듈·이름이 없는지 본다. 표를 넓히려면 이 명세를 고친다.
- 지금 `main.ts`의 `askDay`는 내보내지 않아 쓸 수 없다. `list.ts`가 같은 차례(보내기 → 120초 경주 → 오류·결과 나누기 → `readDay`)를 다시 쓴다(20줄쯤).

### 3. 서비스 워커 `extension-erp-list/src/background.ts` (TASK-1)
```ts
import '../../extension-erp/src/background.js' // 지금 도우미 통로(그대로). 크롬에서는 불러올 때 맨 위에서 onMessage를 건다
/** 아이콘을 누르면 여는 화면 */
export const LIST_PAGE = 'list.html'
export type ListBackgroundChrome = {
  runtime: { getURL(path: string): string }
  action: { onClicked: { addListener(callback: () => void): void } }
  tabs: { create(props: { url: string }): Promise<unknown> }
}
/** 아이콘 누름 → 새 탭으로 목록 화면 */
export function startListBackground(chrome: ListBackgroundChrome): void
// 서비스 워커로 돌 때만 스스로 켠다(시험은 가짜 chrome으로 부른다)
if (typeof chrome !== 'undefined' && chrome.action?.onClicked && typeof chrome.tabs?.create === 'function') startListBackground(chrome)
```
- 둘 다 모듈 맨 위에서 바로 듣는 함수를 건다(크롬이 서비스 워커를 다시 깨워도 받는다). `tabs.create`는 `tabs` 권한이 없어도 된다.
- 통로의 `sender.id === chrome.runtime.id` 검사는 그대로라 이 확장의 목록 화면·설정 화면만 받는다.

### 4. 목록 모양 (`listTypes.ts` TASK-1, `rows.ts` TASK-2)
```ts
// listTypes.ts
export type Why = NonNullable<Planned['why']> // 'unpicked' | 'unknown' | 'held' | 'noName'
export const WHY_ORDER: readonly Why[] = ['unpicked', 'unknown', 'held', 'noName']
export const WHY_TEXT: Readonly<Record<Why, { tag: string; cell: string; help: string }>> // 7절. held.help = TEXT.held(HELD_SALES.map((k) => GROUP_NAMES[k]))(지금 HELD_SALES는 비어 있어 실제로는 안 나온다)
export const LIST_TEXT // 7절. 함수 글의 모양:
//   period(from, to)                       → '{from} ~ {to}'
//   size(days, rows)                       → ' · {days}일 · 날마다 {rows}칸'
//   madeAt(when)                           → '목록을 만든 때 {when}'          (when = 'YYYY-MM-DD HH:MM')
//   failed(code)                           → '목록을 만들지 못했어요. (번호 {code})'
//   fileName(from, to)                     → 'ERP마감일지_입력목록_{from}_{to}.xlsx'
//   copyTail(day, section, name, col, v)   → '{day} · {section} {name}[ {col}] · {v}'   (col이 null이면 ' {col}' 없음)
//   warn(day, line)                        → '{day}: {line}'
export const TOAST_MS = 1800
/** 업무일지 1 상자의 ERP 화면 차례(notes/erp-closing-fields.md 2절) */
export const SCREEN_BOXES = ['진료 · 치료현황', '외래 수입', '입원수입', '환자현황'] as const
/** 상자·묶음 머리 → 쪽지에 쓰는 짧은 이름(없으면 머리 그대로). fill.ts 짧은 이름과 같다 */
export const SHORT_SECTION: Readonly<Record<string, string>> = {
  '진료 · 치료현황': '치료현황',
  '치료별 신환/90일초진/재진 건수': '치료별 건수',
  '연령별 신환/90일초진/재진': '연령별',
}
export type ListCell = { value: string } | { why: Why }
export type ListLine =
  | { kind: 'journal'; text: string }                     // '업무일지 1' · '업무일지 2'
  | { kind: 'section'; text: string; sub?: string }       // 상자·묶음 머리. 치료별 매출만 sub '금액(원)'
  | { kind: 'row'; key: string; section: string; name: string; col: string | null; cells: ListCell[]; rowWhy: Why | null }
export type ListModel = {
  from: string
  to: string
  days: { date: string; zero: boolean }[]
  lines: ListLine[]
  /** 숫자 줄 수('날마다 {R}칸') */
  rowCount: number
  /** 나온 까닭(WHY_ORDER 차례) */
  reasons: Why[]
  /** 표 위 경고 상자 줄(이미 '{M/D}: {경고 글}' 꼴) */
  warnings: string[]
  /** '빈 칸 까닭' 상자 끝 씨암·SONO 줄, 없으면 null */
  overlap: string | null
}
// 날짜 글(TASK-2·3·5가 같이 쓰므로 TASK-1에 둔다. 지금 rangeView의 shortDay는 내보내지 않아 쓸 수 없다)
/** 'YYYY-MM-DD' → 'M/D' */
export function shortDay(date: string): string
/** 'YYYY-MM-DD' → '{M/D} ({요일})' 머리 글(요일 = LIST_TEXT.weekdays, 달력 날짜로 셈, 이 PC 시간대와 상관없음) */
export function dayHead(date: string): string
/** 일요일인가(머리 요일 글 주황) */
export function isSunday(date: string): boolean

// rows.ts
/** 그날 칸 계획에 넘길 고른 것(AC-3904.6) */
export function dayChoice(day: ClosingDay, settings: Settings): OverlapChoice | undefined
/** 날짜 차례 답(빠진 날 없음) + 설정 → 목록 모양. answers가 비면 throw */
export function buildList(answers: readonly ClosingDay[], settings: Settings): ListModel
```
- `buildList` 차례
  1. 날마다 `plan = planCells(day, settings, dayChoice(day, settings))`. 칸 자리 key = `JSON.stringify(where)`. 같은 설정이면 날마다 같은 칸이 같은 차례로 나온다(칸 자리는 설정에만 달림). 어느 날 칸 key 목록이 첫날과 다르면 throw(뜻밖, 흐름이 E-BRIDGE-BAD-REPLY로 보인다).
  2. 줄 차례: 첫날 계획에서 업무일지 1 칸(`j: 1`)을 `SCREEN_BOXES` 차례로 상자마다 모으고(상자 안은 계획 차례), 이어서 업무일지 2 칸을 계획 차례 그대로 둔다.
  3. 머리 줄: `journal '업무일지 1'` → 상자마다 `section` → 줄들 · `journal '업무일지 2'` → 묶음이 처음 나올 때마다 `section`(`card` 글자, 낱칸 `field`는 '운영 지표', '치료별 매출'은 `sub: '금액(원)'`).
  4. 숫자 줄 이름: `j: 1` → name = row, col = null. `card` → name = row, col = col, 단 card '치료별 매출'이거나 row '실예약환자수'면 col = null. `field` → name = field, col = null. section = `SHORT_SECTION[머리] ?? 머리`(낱칸은 '운영 지표').
  5. 칸: `p.why`가 있으면 `{ why }`, 아니면 `{ value: p.value }`. rowWhy = 그 줄 칸이 모두 같은 why면 그것, 아니면 null.
  6. reasons = 어느 칸에든 나온 why를 `WHY_ORDER` 차례로. zero = `patients.total === 0`.
  7. warnings = 날짜 차례로 `warningLines(day)` 줄마다 `LIST_TEXT.warn(shortDay(date), line)`.
  8. overlap: 묻는 날(`overlapAsks(day.overlap, settings)`)이 없으면 null. 있으면 `settings.overlap`이 있을 때 `RANGE_TEXT.confirm.overlapLast(OVERLAP_TEXT.into[settings.overlap])`, 없으면 `OVERLAP_TEXT.done(K, 'both')`(K = 묻는 날 `overlap.visits` 합).
- `dayChoice` = `overlapAsks(day.overlap, settings) ? settings.overlap : undefined`. undefined면 `planCells`는 '둘 다 넣기'와 같은 값이다(`minus`가 0).

### 5. 엑셀 (`zip.ts`·`xlsx.ts`, TASK-3)
```ts
// zip.ts — 저장만 하는 zip(압축 없음)
export function crc32(bytes: Uint8Array): number
/** 이름은 ASCII만. when = 파일 시각(DOS 날짜·시각) */
export function zipStore(entries: readonly { name: string; data: Uint8Array }[], when: Date): Uint8Array

// xlsx.ts — SpreadsheetML 최소 파일
export const SHEET_NAME = LIST_TEXT.title // 'ERP 마감일지 입력 목록'(31자 안, 금지 글자 없음)
/** 시트 칸 값(행마다). null = 빈 칸, number = 숫자 칸, string = 글 칸 */
export function sheetRows(model: ListModel): (string | number | null)[][]
export function workbookBytes(model: ListModel, when: Date): Uint8Array
export function fileName(model: ListModel): string // LIST_TEXT.fileName(from, to)
export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
```
- 파일 안(이 차례, 모두 UTF-8 XML): `[Content_Types].xml` · `_rels/.rels` · `xl/workbook.xml` · `xl/_rels/workbook.xml.rels` · `xl/styles.xml`(엑셀이 까다롭게 보는 가장 작은 꼴: 글꼴 1 · 채움 2(`none`·`gray125`, 엑셀이 늘 기대하는 두 개) · 테두리 1 · `cellStyleXfs` 1 · `cellXfs` 1(`xfId="0"`) · `cellStyles` 1(`Normal`, `builtinId="0"`)) · `xl/worksheets/sheet1.xml`.
- `sheet1.xml`: `sheetViews`(틀 고정 `<pane xSplit="1" ySplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"/>`) → `sheetFormatPr` → `cols`(A 34 · 날짜 11 · 끝 열 44) → `sheetData`. 글 칸은 `t="inlineStr"`(공유 글 표 없음), 숫자 칸은 `<c r="B3"><v>350000</v></c>`(서식 0 = 일반, 쉼표 없음). 빈 칸은 쓰지 않는다. 글은 `& < > " '`를 바꾸고 XML에 못 쓰는 제어 글자는 뗀다.
- `sheetRows` 모양(AC-3906.2): 1행 `['항목', ...dayHead(+ LIST_TEXT.xlsxZero), '빈 칸 까닭']`. `journal` → `[text]`, `section` → `[text + (sub ? ' ' + sub : '')]`, `row` → `[name + (col ? ' ' + col : ''), ...칸(숫자면 Number(value), 까닭이면 null), 까닭 글]`. 까닭 글: 그 줄에 나온 why마다(`WHY_ORDER`) 모든 날이면 `WHY_TEXT[why].tag`, 어떤 날만이면 `` `${tag} (${dayList(그 날들)})` ``, 여럿이면 `', '`로 잇고 없으면 null.

### 6. 화면 (`list.html`·`view.ts`·`list.ts`, TASK-5)
- `list.html`: 시안 `index.html`의 `<style>`에서 시안 띠(`.mock-bar`) 모양만 빼고 그대로 + 경고 상자 `.warns`(지금 `panel.ts` CSS의 `.warns` 세 줄 그대로 + `max-height:200px;overflow:auto`) + 처음 한 번 안내는 시안 `.hint` 모양을 쓴다. 몸통은 시안과 같은 틀(`.top` 머리·`main`·`#stage`·`.foot`·`#toast`), id: `openSettings`·`from`·`to`·`make`·`xlsx`·`help`·`stage`·`toast`, `main`에 `id="listMain"`. script는 `<script type="module" src="extension-erp-list/src/list.js"></script>` 하나. 고정 글(탭 제목·머리·단추·날짜 이름·도움 줄·맨 아래 줄)은 7절 글을 HTML에 복사해 둔다(스크립트 전에도 보이고, 탭 제목이 즐겨찾기 이름이 됨). 복사본이 상수와 같은지는 `view.test.ts`가 본다(AC-3901.7 예외). `list.ts`는 시작할 때 이 글을 다시 쓰지 않는다(도움 줄만 막는 글 뒤 `RANGE_TEXT.pick.future`로 되돌림).
- `view.ts` (DOM만, 도우미·chrome 모름. 글은 모두 textContent·title 속성)
  ```ts
  export function renderHint(doc: Document): HTMLElement                      // 시안 ①
  export function renderFirst(doc: Document): HTMLElement                     // 처음 한 번(.hint 모양, 두 줄)
  export function renderLoading(doc: Document, total: number, done: number, onCancel: () => void): HTMLElement // 시안 ②
  export function renderError(doc: Document, code: string): HTMLElement      // 시안 ⑤, explain(code)
  /** 시안 ③: .sum · .warns(있을 때) · .slide · .tbox(table.tbl) · .legend(있을 때) */
  export function renderList(doc: Document, model: ListModel, madeAt: string): HTMLElement
  /** 표 상자가 넓을 때만 .slide를 보인다(scrollWidth > clientWidth + 1). 그린 뒤·창 크기 바뀔 때 부른다 */
  export function syncSlide(root: HTMLElement): void
  /** 쪽지 꼬리 '{M/D} · {묶음} {줄}[ {열}] · {값}' */
  export function copyTail(model: ListModel, row: ListLine & { kind: 'row' }, dayIndex: number, value: string): string
  /** 복사 표시: now 칸은 .now, 앞서 now였던 칸은 .done(✓) */
  export function markCopied(root: HTMLElement, key: string): void
  /** 쪽지(#toast) 하나: 머리 b + 꼬리 span, bad면 .bad, TOAST_MS 뒤 숨김 */
  export function showToast(toast: HTMLElement, head: string, tail?: string, bad?: boolean): void
  ```
  - 표 DOM은 시안 `tableHtml` 모양 그대로다: `thead`(첫 칸 `th.lab` '항목', 날짜마다 `th`(일요일 `.sun`, 요일 `span.wd`, 진료 0건이면 `span.zt` '진료 0건' + title `FLOW_TEXT.zero(date)`)), 업무일지 줄 `tr.s1`, 머리 줄 `tr.s2`(sub는 `span.sub`), 숫자 줄 `tr.r`(rowWhy면 `.off`, 열 여럿 표에서 줄 이름이 바뀌는 곳 `.g`), 줄 이름 `th.lab > div.lw > span.nm(+ span.cl 열 이름) + span.tag.{why}`(title = 긴 글), 숫자 칸 `td(.z) > button.v`(title '누르면 복사돼요', `data-k` = `{줄 순번}|{날짜}`), 빈 칸 `td.na(.z)`(rowWhy가 아니면 안에 `span.nt` 작은 글 + title 긴 글).
  - 단추에 값을 HTML로 넣지 않는다. 눌린 단추의 값은 `list.ts`가 모양(`ListModel`)에서 `data-k`로 찾는다.
- `list.ts` (흐름)
  ```ts
  /** 목록 화면 시작. stop()은 듣기·타이머를 멈춘다 */
  export function startList(doc?: Document): { stop(): void }
  /** closing.day 하나(AC-3903.4) */
  export async function askDay(date: string, settings: Settings): Promise<{ day: ClosingDay } | { code: string }>
  /** 클립보드: navigator.clipboard.writeText → 실패면 숨긴 textarea + execCommand('copy'), 둘 다 안 되면 false */
  export async function copyText(doc: Document, text: string): Promise<boolean>
  /** Blob → a[download] 누름 → setTimeout(0) 뒤 revokeObjectURL. 받은 파일 이름 */
  export function saveXlsx(doc: Document, model: ListModel, now: Date): string
  // 확장 화면으로 열렸을 때만 스스로 시작한다(시험은 startList를 부른다)
  if (typeof chrome !== 'undefined' && chrome.runtime?.id && document.getElementById('listMain')) startList()
  ```
  - 화면 기억(이 변수에만): `run`(번호, [그만두기]·다시 만들기 때 1씩 → 늦은 답 버림) · `model`(지금 표) · `copied`(복사한 칸 key) · `now`(방금 칸).
  - 단계와 막힘

    | 단계 | #stage | 날짜 칸·[목록 만들기] | [엑셀로 받기] |
    |---|---|---|---|
    | 처음 | `renderHint` | 열림 | 막힘 |
    | 처음 한 번 | `renderFirst` | 열림 | 막힘 |
    | 세는 중 | `renderLoading` | 막힘 | 막힘 |
    | 오류 | `renderError` | 열림 | 막힘 |
    | 목록 | `renderList` | 열림 | 열림 |
  - [목록 만들기]: 도움 줄을 처음 글·모양으로 되돌림 → `pickProblem(from, to, localToday())`이 있으면 도움 줄 `help why` + 그 글, 끝 → `load()`(던지면 오류 E-BRIDGE-DISCONNECTED, null이면 `chrome.runtime.openOptionsPage()` + `renderFirst`, 끝) → `run += 1`, model·복사 표시 지움 → `rangeDays` 날마다 `askDay`(앞 답 뒤 다음, 받을 때마다 `renderLoading(N, k)`) → 오류면 `renderError(code)` → 다 받으면 `buildList`(던지면 E-BRIDGE-BAD-REPLY) → `renderList(model, 'YYYY-MM-DD HH:MM')`.
  - 숫자 칸 누름(#stage에 듣는 함수 하나): `copyText` → 실패면 `showToast(LIST_TEXT.copyFailed, '', true)` → 성공이면 `markCopied` + `showToast(LIST_TEXT.copied, copyTail(…))`.
  - [엑셀로 받기]: model이 있을 때만 `saveXlsx` → `showToast(LIST_TEXT.saved, 파일 이름)`.
  - [설정 열기]: `chrome.runtime.openOptionsPage()`(실패해도 조용히) → `showToast(LIST_TEXT.settingsOpened)`.
  - `chrome.storage`에 쓰는 곳이 없다(`load`만). `saveOverlap`을 부르지 않는다.

### 7. 화면 글 (한 곳 = `listTypes.ts`, 지금 글은 그 상수를 가리킴)
| 자리 | 글 | 어디서 |
|---|---|---|
| 탭 제목·머리 h1·엑셀 시트 이름 | 'ERP 마감일지 입력 목록' | `LIST_TEXT.title`(시안) |
| 머리 단추 | '설정 열기' | `TEXT.openSettings`(panel) |
| 날짜 칸 이름 | '시작일' · '끝일' (가운데 '~') | `RANGE_TEXT.pick.from`·`.to` |
| 단추 | '목록 만들기' · '엑셀로 받기' | `LIST_TEXT.make`·`.xlsx`(시안) |
| 날짜 아래 줄 | '오늘 뒤 날짜는 고를 수 없어요.' | `RANGE_TEXT.pick.future` |
| 막는 글 | '시작일과 끝일을 골라 주세요.' · '시작일이 끝일보다 뒤예요.' · '오늘 뒤 날짜는 고를 수 없어요.' | `pickProblem`(rangeView) |
| 처음 안내 | '기간을 고르고 [목록 만들기]를 눌러 주세요.' · '날마다 비트 숫자를 세어, [비트 값 채우기]가 채우는 ERP 칸 차례대로 표를 만들어요. 줄은 ERP 칸, 열은 날짜예요.' · '숫자 칸을 누르면 복사돼요. ERP 칸에 붙여 넣어 주세요.' | `LIST_TEXT.hint`(시안) |
| 세는 중 | '비트에서 읽는 중…' · '{N}일 중 {k}일' · '그만두기' | `TEXT.reading` · `RANGE_TEXT.scanning.count`·`.cancel` |
| 처음 한 번 | '처음 한 번 설정 화면에서 코드를 확인하고 [저장]을 눌러 주세요.' · '설정 화면을 새 탭으로 열었어요.' | `TEXT.first` · `LIST_TEXT.settingsOpened`(시안 쪽지 글) |
| 오류 | 무엇이 · 어떻게 · '목록을 만들지 못했어요. (번호 {번호})' | `explain`(errors) · `LIST_TEXT.failed`(시안) |
| 목록 위 | '{시작일} ~ {끝일}'(굵게) + ' · {N}일 · 날마다 {R}칸' · '숫자 칸을 누르면 복사돼요. ERP 칸에 붙여 넣어 주세요. 빈 칸은 아래 까닭을 보고 직접 넣어 주세요.' · '목록을 만든 때 {YYYY-MM-DD HH:MM}' · '표를 옆으로 밀면 다른 날짜가 보여요. 항목 칸은 왼쪽에 그대로 있어요.' | `LIST_TEXT.period`·`.size`·`.sumHelp`·`.madeAt`·`.slide`(시안) |
| 표 | '항목' · '진료 0건' · 숫자 칸 title '누르면 복사돼요' · 진료 0건 머리 title '{YYYY-MM-DD}에는 비트 진료가 한 건도 없어요.' | `LIST_TEXT.head`·`.zero`·`.copyTitle`(시안) · `FLOW_TEXT.zero` |
| 머리 줄 | '업무일지 1' · '업무일지 2' · 상자·묶음 이름(cells.ts 글자) · '운영 지표' · '금액(원)' | `LIST_TEXT.journal1`·`.journal2`·`.ops`·`.salesSub`(시안) |
| 꼬리표 · 칸 작은 글 · 긴 글 | unpicked '코드를 고르지 않음' · '코드 안 고름' · '설정에서 코드를 고르지 않은 항목이라 비워 두었어요. 직접 넣거나 [설정 열기]에서 코드를 고른 뒤 목록을 다시 만들어 주세요.' / unknown '비트로 셀 수 없음' · '셀 수 없음' · '비트로 셀 수 없어 비워 두었어요. 직접 넣어 주세요.' / held '보류 중' · '보류' · `TEXT.held(보류 묶음 이름)` / noName 'ERP 줄 이름 없음' · '줄 이름 없음' · `SKIP_TEXT.noName.help` | `WHY_TEXT`(시안) |
| 빈 칸 까닭 제목·엑셀 끝 열 | '빈 칸 까닭' | `LIST_TEXT.legend`(시안) |
| 씨암·SONO 줄 | '씨암·SONO를 같이 받은 진료는 지난번 고른 대로 {…에} 넣어요.' / '함께 있는 진료 {K}건은 씨암·SONO 둘 다에 넣었어요.' | `RANGE_TEXT.confirm.overlapLast` / `OVERLAP_TEXT.done`(지금 하루 채우기 끝 안내 글) |
| 경고 상자 | '{M/D}: {경고 글}' | `LIST_TEXT.warn` + `warningLines`(꼴은 지금 기간 채우기 결과 줄 '{M/D}: {까닭 글}'을 따름) |
| 쪽지 | '복사했어요' + '{M/D} · {묶음} {줄}[ {열}] · {값}' · '복사하지 못했어요. 다시 눌러 주세요.' · '엑셀 파일을 받았어요' + 'ERP마감일지_입력목록_{시작일}_{끝일}.xlsx' · '설정 화면을 새 탭으로 열었어요.' | `LIST_TEXT.copied`·`.copyTail`·`.copyFailed`·`.saved`·`.fileName`·`.settingsOpened`(시안) |
| 맨 아래 | '환자 이름 · 차트번호는 이 PC의 도우미 밖으로 나가지 않아요. 이 화면은 ERP를 건드리지 않아요. 숫자는 직접 붙여 넣고, 저장은 ERP에서 직접 눌러요.' | `LIST_TEXT.foot`(시안) |
| 엑셀 1행 진료 0건 날 | 날짜 머리 뒤 ' 진료 0건' | `LIST_TEXT.xlsxZero`(화면 '진료 0건'과 같은 글) |
| 요일 | '일' '월' '화' '수' '목' '금' '토' | `LIST_TEXT.weekdays`(시안) |
- **시안 맞춤 시험**(`listTypes.test.ts`, AC-3901.7). `notes.md`는 `{…}` 꼴 글이라 견주지 않고, 시안 `index.html` 하나와만 견준다.
  - 고정 글(`LIST_TEXT`·`WHY_TEXT`의 글 값): 시안 `index.html` 원문(스크립트 포함, `&amp;` 같은 글자 참조는 풀어서)에 글자 그대로 있다. 시안은 이 글을 모두 글자 그대로 적어 두었다.
  - 함수 글: 시안 `index.html`을 jsdom(`new JSDOM(html, { runScripts: 'dangerously', url: 'http://mock.test/index.html?<상태>' })`)으로 그려 실제로 나온 글과 견준다. 글은 textContent의 빈칸을 한 칸으로 줄여 본다. 시안 스크립트는 기간을 2026-11-01~2026-11-03으로 고정해 그린다(만든 때 시각만 연 때를 따름).

    | 상태 주소 | 그려진 곳 | 견주는 글 |
    |---|---|---|
    | `?s=ready` | `.sum` 첫 `p`의 `b` / 그 `p` | `period('2026-11-01', '2026-11-03')` = '2026-11-01 ~ 2026-11-03' / `period(…) + size(3, 131)` = '2026-11-01 ~ 2026-11-03 · 3일 · 날마다 131칸' |
    | `?s=ready` | `.sum .made` | `madeAt(x)` = 그 글. x는 그 글에서 뽑은 'YYYY-MM-DD HH:MM'(시안 시각은 열 때마다 달라 값을 뽑아 견주고, 꼴은 정규식으로 봄) |
    | `?s=ready` 뒤 `#xlsx` 누름 | `#toast`의 `b` / `span` | `saved` = '엑셀 파일을 받았어요' / `fileName('2026-11-01', '2026-11-03')` = 'ERP마감일지_입력목록_2026-11-01_2026-11-03.xlsx' |
    | `?s=ready` 뒤 `#openSettings` 누름 | `#toast`의 `b` | `settingsOpened` |
    | `?s=copied` | `#toast`의 `b` / `span` | `copied` = '복사했어요' / `copyTail('11/2', '치료현황', '도수상담', null, '4')` = '11/2 · 치료현황 도수상담 · 4' |
    | `?s=ready` | `data-k`가 '57' + '&#124;' + '2026-11-02'인 단추의 `data-l` + ' · ' + `data-v`(시안이 쪽지 꼬리를 만드는 식 그대로) | `copyTail('11/2', '치료별 건수', '씨암(주사)', '신환', '4')` = '11/2 · 치료별 건수 씨암(주사) 신환 · 4' |
    | `?s=error` · `?s=error&e=unregistered` | `#stage .small` | `failed('E-HELPER-MISSING')` · `failed('E-BIT-NOT-REGISTERED')` |
    | `?s=ready` | 진료 0건 머리 `th` | textContent = `dayHead('2026-11-01')` + `zero` = '11/1 (일)진료 0건', title = `FLOW_TEXT.zero('2026-11-01')` |
  - 시안에 없는 꼴은 값으로만 본다: `warn('11/3', '환불 …')` = '11/3: 환불 …', `xlsxZero` = ' 진료 0건'.
  - `list.html` 고정 글 복사본은 `view.test.ts`(TASK-5)가 상수와 같은지 본다.

### 8. ERP 도우미 (TASK-4)
- `helper-erp/src/Erp.Core/ErpCallers.cs` (새 파일, `namespace Erp.Core;`, netstandard2.0)
  ```csharp
  /// 크롬이 ERP 도우미를 켤 수 있는 확장 둘(spec erp-copy-list REQ-3902): 명령 표 확장('ERP 마감일지 채우기', commands.json extensionId)과
  /// 'ERP 마감일지 입력 목록'(ListExtensionId). 기존 MessageLoop·OriginGuard(helper/, 고치지 않음)는 명령 표 확장 하나만 보므로
  /// 목록 확장이 켰을 때만 첫 인자를 명령 표 확장 origin으로 바꿔 넘긴다. 명령·검사·기록은 두 확장이 똑같다.
  public static class ErpCallers
  {
      /// extension-erp-list/manifest.json key로 계산한 ID(크롬 규칙, 32자 a~p). TASK-1이 만든 열쇠로 정해진다
      public const string ListExtensionId = "…";
      public static string Origin(string extensionId) => "chrome-extension://" + extensionId + "/";
      /// 첫 인자가 Origin(ListExtensionId)와 글자 그대로 같으면 첫 인자만 Origin(table.ExtensionId)로 바꾼 새 배열, 아니면 args 그대로.
      /// args·table이 null이면 ArgumentNullException
      public static string[] ForMessageLoop(string[] args, CommandTable table);
  }
  ```
- `Program.cs`: `return MessageLoop.Run(args, …)` 한 줄 → `return MessageLoop.Run(ErpCallers.ForMessageLoop(args, table), input, output, table, dispatcher, log.Write);`. 주석에 'spec erp-copy-list AC-3902.4'.
- `install/host-manifest.json`: `"allowed_origins": ["chrome-extension://lkancaiekmoieooheifdimahhkejfmjc/", "chrome-extension://<목록 확장 ID>/"]`. `install.ps1`은 이 틀을 복사해 `path`만 채우므로 바뀌지 않는다.
- 판 번호는 0.3.0 그대로다(결정 8).

## 데이터 흐름
```
확장 아이콘 → 서비스 워커(extension-erp-list background) → 새 탭 list.html
[목록 만들기]
  → pickProblem(시작일, 끝일, 오늘)                      막히면 도움 줄에 까닭, 끝
  → settings.load()                                       null → openOptionsPage + 처음 한 번 안내, 끝
  → rangeDays 날마다 차례로(앞 답 뒤 다음):
      chrome.runtime.sendMessage({ cmd: 'closing.day', args: { date, groups: toGroups(settings) } })
        → 지금 도우미 통로(extension-erp/src/background.js 그대로) → connectNative('com.seoseungkwan.erp_helper')
        → ERP 도우미: ErpCallers.ForMessageLoop → MessageLoop(OriginGuard) → Dispatcher → closing.day(비트 DB 읽기만, 날짜 집계)
      ← { type: 'result', data } → readDay(data, date)       오류·틀린 답 → 오류 안내, 멈춤
  → buildList(답들, 설정): 날마다 planCells(day, settings, dayChoice) → 줄(ERP 화면 차례)·열(날짜)
  → renderList(화면 기억에만)
숫자 칸 누름 → copyText → 클립보드 → 팀장이 ERP 칸에 붙여 넣기(이 확장은 ERP에 아무것도 보내지 않음)
[엑셀로 받기] → sheetRows → workbookBytes(zipStore) → Blob → a[download] → 크롬 다운로드 폴더
[설정 열기] → openOptionsPage → options.html(지금 설정 화면) → chrome.storage.local erpClosing(이 확장 것)
```
- 환자 이름·차트번호는 도우미 밖으로 나오지 않는다(지금 `closing.day` 답은 날짜 집계 숫자뿐). 화면·엑셀·쪽지에는 집계 숫자·날짜·칸 이름·까닭만 있다.

## 결정과 트레이드오프
1. **지금 부품을 고치지 않고 상대 경로로 불러 쓴다(tsconfig `rootDir: ".."`).** 다른 길: (가) 필요한 모듈을 새 폴더로 복사 — 두 벌이 되어 셈이 갈라질 수 있다. (나) 공용 폴더로 옮김 — 지금 확장 `manifest.json` `web_accessible_resources`·모듈 목록 시험을 바꿔야 해 '지금 시험 그대로 통과'로 같음을 보일 수 없다. 고르는 길은 지금 확장 파일을 하나도 바꾸지 않고, 같은 소스를 같은 컴파일 설정으로 dist에 싣는다. 값: dist 폴더가 `extension-erp-list/src/`·`extension-erp/src/` 두 층이고, manifest·`list.html`·`options.html`의 경로가 그 모양에 묶인다(빌드가 가리키는 파일이 다 있는지 검사한다).
2. **`readDay`(main.js)·`warningLines`(panel.js)를 그 모듈에서 바로 부른다.** 그래서 ERP 화면용 모듈(`fill.js`·`erpday.js`·`range.js`·`rangeView.js`)도 dist에 실린다. 실리기만 하고 새 코드는 부르지 않는다(import 표 시험). ERP 화면을 못 건드리는 것은 코드가 아니라 manifest가 보장한다: 내용 스크립트·사이트 권한·`scripting`·`tabs`·`activeTab`·웹 접근 자원이 없어 확장 페이지가 다른 사이트 DOM에 닿을 길이 없다. 둘을 공용 모듈로 옮기면 실리는 것은 줄지만 1의 (나)와 같은 값을 치른다.
3. **엑셀은 직접 쓴 저장만 하는 zip + 가장 작은 SpreadsheetML.** 다른 길: SheetJS(`xlsx` 0.20.3)를 빌드 때 dist로 복사 — 1MB 가까운(`xlsx.full.min.js` 950KB) 남의 코드를 `nativeMessaging` 권한 확장에 싣고, 그 안의 네트워크·파일 함수 때문에 ESLint 울타리를 풀거나 예외를 둬야 한다. tsc만 쓰는 빌드라 묶개(bundler)도 없다. 직접 쓰는 것은 zip 머리·CRC-32·XML 몇 개(200줄쯤)이고, 시험에서 저장소의 `xlsx` 0.20.3으로 다시 읽어 맞는지 본다(시험에서만 씀, dist에 안 실림). 값: 서식(색·굵게)이 없다. 숫자 칸·틀 고정·열 너비만 둔다.
4. **받기는 Blob + `<a download>`.** `downloads` 권한은 크롬 설치 때 권한 알림이 하나 늘고 쓸 곳이 이것뿐이다. `<a download>`는 확장 페이지에서 권한 없이 크롬 기본 다운로드 폴더에 저장한다(사용자가 '저장 위치 묻기'를 켰으면 크롬 창이 뜬다 — 안내서에 적음).
5. **복사는 `navigator.clipboard.writeText`, 안 되면 `execCommand('copy')`.** 누름(사용자 동작) 안에서 부르므로 `clipboardWrite` 권한을 더하지 않는다. 시안과 같은 두 단계다.
6. **고정 ID는 공개키 `key`만.** 개인키는 만들고 바로 버린다(저장소 밖에도 두지 않고, 찍거나 기록하지 않음). 압축해제 설치만 쓰므로 필요 없고, 지금 확장과 같은 방식이다. 다시 필요해지면(웹스토어 등) 새 열쇠 = 새 ID가 되고 도우미 `ListExtensionId`·등록 틀을 같이 바꾼다.
7. **도우미는 `ErpCallers.ForMessageLoop`로 첫 인자만 바꿔 기존 `MessageLoop`에 넘긴다.** 다른 길: (가) 기존 `OriginGuard`·`CommandTable`(helper/)에 ID 목록 — 청구 도우미 코드를 바꾸게 되어 안 됨. (나) commands.json에 칸 더함 — 기존 `Parse`가 맨 위 칸 여섯 개 밖은 거절. (다) 목록 확장용 명령 표를 JSON을 고쳐 한 번 더 읽음 — 표가 두 벌이 된다. 고른 길은 ERP 쪽 파일 하나·Program 한 줄이고, 받는 origin은 정확히 둘(글자 그대로 비교)이다. 크롬도 등록 틀 `allowed_origins`로 먼저 거른다(이중).
8. **ERP 도우미 판은 0.3.0 그대로.** 판을 올리면 지금 확장의 짝 문장 시험(`manifest.test.ts`·`readme.test.ts`)과 안내서를 고쳐야 해 '지금 확장 한 글자도 안 바뀜'(AC-3901.6)을 깬다. 도우미와 확장 사이에 판을 맞춰 보는 실행 검사는 없다(짝은 안내서 글과 시험뿐). spec erp-bit-anywhere도 도우미 코드를 바꾸며 0.3.0을 지켰다(설치 파일 이름 끝으로 구별). 옛 0.3.0 설치에서는 목록 확장이 E-HELPER-MISSING이고, 지금 확장은 옛·새 도우미 어느 쪽에서도 그대로 돈다.
9. **씨암·SONO는 지금 규칙(`overlapAsks`) + 이 확장의 저장 칸.** 크롬 저장소는 확장마다 따로라 지금 확장에 저장된 '지난번 고른 것'은 읽을 수 없다. 이 확장에서는 그 칸을 쓰는 곳(ERP 화면 묻기 `saveOverlap`)이 없으므로 실제로는 늘 비어 있어, 묻는 날은 '둘 다 넣기'와 같은 값(지금 `planCells` 기본값)이 된다. 그래서 그 줄을 꼭 보인다('…둘 다에 넣었어요.'). 화면에서 묻기는 시안에 없어 범위 밖이다.
10. **경고 줄은 날마다 '{M/D}: {글}' 한 줄씩.** 같은 글을 날짜끼리 묶는 길은 건수가 든 글(수납 안 끝난 진료 N건 등)이 날마다 달라 묶이지 않는다. 길면 상자 안에서 밀린다.
11. **오류가 나면 목록 전체를 멈추고 표를 그리지 않는다.** 일부 날만 보이는 표는 빈 날을 0으로 오해할 수 있다. 시안 ⑤도 표 없이 오류만 보인다.
12. **기간 길이 제한 없음**([기간 채우기]와 같음). 날마다 도우미를 한 번씩 켜므로 길면 오래 걸린다. [그만두기]가 있다.
13. **설정 화면은 글까지 그대로 싣는다.** 그 화면 제목·머리는 'ERP 마감일지 채우기 · 설정'이다(새 확장 이름과 다름). 바꾸려면 지금 확장 파일을 고치거나 빌드에서 글을 바꿔야 해 둘 다 하지 않는다.
14. **ERP 도우미 설치 안내(`helper-erp/install/README.md`)는 고치지 않는다.** 지금 시험(spec erp-bit-anywhere AC-3802.3)이 그 파일을 갈래 시작 글자 그대로로 묶어 둔다. 목록 확장에 필요한 도우미 안내는 새 확장 안내서에 둔다.
15. **`src/b2b-merge.test.ts` 기대 목록 한 줄만 고친다.** 그 시험(AC-034.5)이 vitest `include`를 글자 그대로(정렬해 같음) 묶어 두어, 새 폴더 시험을 `npm test`에 넣으면 이 줄을 더해야 한다. 다른 길: 새 확장 시험을 이미 잡히는 `scripts/` 같은 곳에 두기 — 시험이 코드와 떨어지고 `scripts/`는 ESLint가 보지 않아 울타리 규칙이 시험 파일에 안 걸린다. 앞선 예: spec erp-closing-fill TASK-1(cab85424)이 `extension-erp/**/*.test.ts`를 더할 때 같은 줄을 더했다. 웹앱 코드·화면·배포에는 닿지 않는다. 이 한 줄 때문에 `src`를 통째로 묶어 둔 지금 시험(spec erp-bit-anywhere AC-3801.4)도 그 파일 하나만 빼고 보게 고친다. 다른 길로 `vitest.config.ts`를 그대로 두고 따로 시험 명령을 두면 `npm test`·하네스 `npx vitest run <파일>`이 새 시험을 못 찾아 TDD 기록이 안 된다.

## 위험 / 미해결 질문
- 클립보드: 확장 페이지에서 권한 없이 `writeText`가 되는지는 크롬 판·정책에 따라 다를 수 있다. 실패하면 `execCommand` 길과 실패 쪽지가 있고, 실제 확인(AC-3908.2)에서 본다.
- 직접 쓴 xlsx: SheetJS로 다시 읽는 시험은 엑셀 프로그램이 여는 것을 다 보장하지 않는다(엑셀이 더 엄격할 수 있음). 그래서 SpreadsheetML 필수 부품을 모두 두고(styles 포함), 실제 확인에서 엑셀로 연다.
- 옛 도우미 설치: 같은 '0.3.0' 이름이라 사용자가 옛 설치 파일을 다시 깔 수 있다. 그때 목록 화면 글은 'ERP 도우미가 이 PC에 없어요.'라 헷갈릴 수 있다. 안내서 7절에 '깔았는데도 이 글이면 이번 설치 파일로 다시 설치'를 둔다.
- 씨암·SONO 돈이 두 번 세는 날은 늘 '둘 다' 값이다(결정 9). 팀장은 그 줄을 보고 씨암·SONO 매출 칸을 직접 확인해야 한다.
- 긴 기간: 1년이면 도우미를 365번 켜고 표 칸이 4만 개가 넘는다. 화면이 느려질 수 있으나 막지 않는다(사용자 결정).
- 미해결 질문: 없음.
