# 설계: 자료실 탭

> requirements.md(REQ-8101~8109)를 어떻게 만드는지. 화면 글자는 requirements.md '화면 글자'(= 승인 시안 `docs/mockups/library/`)가 이긴다.
> 서버 코드 없음(ADR-004): 브라우저 + Supabase RLS·Storage 규칙만. 환자 정보와 상관없다(설치 파일·설명서만) → 환자 자료 구역 밖이다.

## 흐름
- 목록: 화면 → `listLibraryFiles()` → 표 `library_files`(RLS: 승인된 의원의 원장·데스크·관리자) → `libraryRows`(순수)로 줄을 만들어 그린다
- 받기: [받기] → `downloadLibraryFile` → `storage.from('library').createSignedUrl(storagePath, 60)` → 주소에 `download=파일 이름` 한 번 붙임(TASK-6) → 숨은 `<a href>` 한 번 누름 → 브라우저가 Supabase 주소에서 바로 받는다(응답 머리 `Content-Disposition: attachment`라 화면은 그대로, 새 탭 없음). 50MB도 메모리에 다 담지 않는다
- 올리기(관리자): 파일 고르기 → `pickProblem`(크기·이름 길이·같은 이름, 네트워크 없음) → [올리기] → `uploadLibraryFile`: uuid 만들기 → `createSignedUploadUrl(uuid)`(바구니 넣기 규칙 = 관리자) → XMLHttpRequest PUT(진행률·멈춤) → `library_files` 줄 넣기(표 넣기 규칙 = 관리자) → 목록 다시 읽기
- 지우기(관리자): 확인 창 → `deleteLibraryFile`: 바구니 파일 지우기 → 표 줄 지우기 → 목록 다시 읽기
- 비트 PC 연결 화면 받기 단추: `useInstallFiles` → `latestInstallFiles()`(자료실 목록 한 번) → 종류마다 최신 판 → `downloadInstallFile` = 자료실 받기
- CSP 그대로: 올리기 XHR·서명 요청은 이미 `connect-src`에 있는 Supabase origin, 받기는 페이지 이동(링크)이라 `connect-src`와 상관없다
- 보는 중(admin-view): 브라우저 거르기 `readOnlyFetch`가 `/storage/v1/object/sign/`(받기 서명)·목록 읽기는 보내고, `/storage/v1/object/upload/sign/`·`/rest/v1/` 쓰기·바구니 지우기는 막는다(지금 규칙 그대로). 화면은 [파일 올리기]·[지우기]를 그리지 않는다

## SQL (`supabase/migrations/20261125000000_library.sql`, 사용자가 SQL Editor에 붙여 넣음)
머리 주석: 무엇·왜(spec library REQ-8101, ADR-051) · 실행(운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다) · 먼저 `20261028000000_auth.sql`·`20261118100000_desk_accounts.sql`(`my_clinic_hospital_id()`)이 들어가 있어야 함 · 두 번 붙여 넣어도 그대로 · 관문(이 파일을 먼저 붙여 넣고 그다음 사이트에 올린다 — 없으면 자료실은 읽기 실패 카드, 비트 PC 연결 받기 단추는 '설치 파일 목록을 읽지 못했어요') · 옛 바구니 `install-files`는 건드리지 않는다 · 환자 자료는 들어가지 않는다. 줄 끝 LF. 함수는 만들지 않는다(`my_hospital_id()`·`my_clinic_hospital_id()`를 다시 만들지 않음).

### 표 `public.library_files` (`create table if not exists`, hospital_id 없음 — 모든 의원이 같은 한 벌)
| 칸 | 모양 |
|---|---|
| `id` | uuid primary key default gen_random_uuid() |
| `file_name` | text not null unique, check char_length 1~200 — 올릴 때의 파일 이름(판 묶기·받을 때 저장 이름) |
| `name` | text not null, check `btrim(name) <> ''` and char_length ≤ 200 — 목록에 보이는 이름 |
| `category` | text not null, check in ('install', 'guide', 'other') |
| `description` | text not null default '', check char_length ≤ 60 |
| `storage_path` | text not null unique, check `~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'` — 바구니 안 이름(폴더 없음). Supabase Storage는 한글 이름을 받지 않아 uuid로 둔다 |
| `size` | bigint not null, check 0 ≤ size ≤ 52428800 |
| `uploaded_by` | uuid default auth.uid() references auth.users (id) on delete set null — 올린 관리자(화면에는 안 보임) |
| `created_at` | timestamptz not null default now() |

- `alter table … enable row level security` → `revoke all on table public.library_files from public, anon, authenticated` → `grant select, insert, delete on table public.library_files to authenticated`(update 없음)
- 정책(`drop policy if exists` 뒤 `create policy`, 모두 `to authenticated`, `(select …)`로 문장마다 한 번):
  - "자료실 목록 읽기(승인된 사용자·데스크·관리자)" for select using (`(select public.my_clinic_hospital_id()) is not null or exists (select 1 from public.admins a where a.user_id = (select auth.uid()))`) — 옛 `install-files` 읽기 규칙(`20261119200000_desk_install_files.sql`)과 같은 판정
  - "자료실 목록 넣기(관리자)" for insert with check (관리자 `exists` and `uploaded_by = (select auth.uid())`)
  - "자료실 목록 지우기(관리자)" for delete using (관리자 `exists`)

### 바구니 `library`
- `insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('library', 'library', false, 52428800, null) on conflict (id) do update set public = false, file_size_limit = 52428800, allowed_mime_types = null`
- `storage.objects` 정책(표 자체는 건드리지 않는다 — form_backgrounds·install_files와 같음):
  - "자료실 파일 읽기(승인된 사용자·데스크·관리자)" for select using (`bucket_id = 'library' and (위 읽기 판정)`) — 서명 받기·지우기(Storage remove는 읽기도 필요)에 쓰인다
  - "자료실 파일 올리기(관리자)" for insert with check (`bucket_id = 'library' and 관리자 and name ~ uuid 모양(폴더 없음)`)
  - "자료실 파일 지우기(관리자)" for delete using (`bucket_id = 'library' and 관리자`)
  - 고치기 규칙 없음(덮어쓰기 없음)
- 보는 중 쓰기를 DB가 따로 막지 않는다: 자료실은 보는 의원의 자료가 아니고(모두 같은 한 벌), Storage는 요청 머리를 정책에 넘기는지 확인하지 못했다(admin_view.sql 머리 주석). 막기는 브라우저 거르기 + 단추 숨김(ADR-046 트레이드오프와 같음)
- 무료 플랜: 프로젝트 전체 올리기 한도(Storage 설정 'Upload file size limit')도 50MB 이상이어야 한다 — 배포 순서 ②

### 시험 (`supabase/library.rls.test.ts`)
- `deskInstallFiles.rls.test.ts`와 같은 방법: PGlite에서 Supabase 흉내(역할·auth·기본 권한·storage 표) → `deskInstallFiles`의 사슬(auth … calendar) → `20261117000000_install_files.sql` → `20261118100000_desk_accounts.sql` → `20261119200000_desk_install_files.sql` → 이 파일(두 번)
- 사람: 관리자(승인된 의원 원장 + admins 줄) · 승인된 의원 원장 · 그 의원 데스크 · 대기 원장 · 대기 의원 데스크 · 거절 원장 · 병원 없는 사용자 · anon. 메일은 지어낸 것
- AC-8101.6은 이 파일 앞뒤의 `pg_policies`(install-files 두 규칙·tab_access·hospitals·admins)·`storage.buckets`의 install-files 줄·두 함수 `pg_get_functiondef`를 견주고, 주석을 뺀 SQL 글자에 `tab_access`·`install-files`·`create or replace function`이 없음을 본다

## 순수 함수 (`src/lib/library/files.ts` — React·supabase·네트워크·저장소 없음, 날짜는 `lib/analytics/dates.ts`의 `todayInKorea`)
```ts
export type LibraryCategory = 'install' | 'guide' | 'other'
export type VersionKind = 'helper' | 'extension'
export type LibraryFile = { id: string; fileName: string; name: string; category: LibraryCategory; description: string; storagePath: string; size: number; createdAt: string }
export const LIBRARY_MAX_BYTES = 52_428_800
export const DESCRIPTION_MAX = 60
export const NAME_MAX = 200
export const CATEGORY_LABEL: Record<LibraryCategory, string> // install '설치 파일' · guide '설명서' · other '그 밖'
export const KIND_LABEL: Record<VersionKind, string> // helper '도우미' · extension '확장' (받기 단추 이름 [{…} 내려받기])
export function versionOf(fileName: string): { kind: VersionKind; version: [number, number, number] } | null // /^precheck-(helper|extension)-([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.zip$/
export function compareVersions(a: readonly number[], b: readonly number[]): number
export function guessCategory(fileName: string): LibraryCategory // /\.(zip|exe|msi|crx)$/i → install, /\.(pdf|hwp|hwpx|docx?|pptx?)$/i → guide
export function sizeText(bytes: number): string // ≥ 921,600 → (bytes / 1048576).toFixed(1) + 'MB', 아래 → Math.max(1, Math.round(bytes / 1024)) + 'KB' (시안 sizeTxt)
export function mbText(bytes: number): string // (bytes / 1048576).toFixed(1) + 'MB' (시안 mbTxt)
export function dayText(iso: string): string // 한국 날짜 'M월 D일'
export type LibraryFilter = 'all' | LibraryCategory
export function categoryCounts(files: readonly LibraryFile[]): Record<LibraryFilter, number>
export type LibraryRow =
  | { type: 'file'; file: LibraryFile; latest: boolean; old: boolean; hasOld: boolean }
  | { type: 'toggle'; kind: VersionKind; count: number; open: boolean }
export function libraryRows(files: readonly LibraryFile[], filter: LibraryFilter, open: ReadonlySet<VersionKind>): LibraryRow[]
export function latestOfKind(files: readonly LibraryFile[], kind: VersionKind): LibraryFile | null
export function deleteNote(files: readonly LibraryFile[], file: LibraryFile): { kind: VersionKind; next: LibraryFile | null } | null
export function pickProblem(picked: { name: string; size: number }, files: readonly LibraryFile[]): 'E-LIBRARY-FILE-SIZE' | 'E-LIBRARY-FILE-NAME' | 'E-LIBRARY-FILE-EXISTS' | null // 이 차례로 먼저 걸린 하나. 이름 길이 = 파일 이름 200자(`file_name` 제약과 같음)
```
- `libraryRows`(시안 `tableBody` 그대로): 거른 줄을 `createdAt` 내림(같으면 `fileName` 올림)으로 → 판 번호 파일은 거른 줄 안에서 종류마다 판 내림으로 묶고, 묶음 맨 위(최신)가 처음 나오는 자리에 `latest: true, hasOld: 옛 판 있음` 줄 + 옛 판이 있으면 `toggle` 줄 + 펼침이면 옛 판 줄(`old: true`). 묶음의 나머지 파일은 제자리에 다시 그리지 않는다
- `latestOfKind`·`deleteNote`는 분류를 보지 않고 모든 파일에서 본다(받기 단추와 같은 판정)

## 저장 함수 (`src/lib/storage/library.ts`)
```ts
export type LibraryErrorCode = Extract<ErrorCode, `E-LIBRARY-${string}`>
export class LibraryError extends Error { readonly code: LibraryErrorCode }
export class LibraryStopped extends Error {} // 올리기를 멈춤(오류 아님)
export async function listLibraryFiles(): Promise<LibraryFile[]>
export async function downloadLibraryFile(file: Pick<LibraryFile, 'storagePath' | 'fileName'>): Promise<void>
export type LibraryUpload = { file: File; name: string; category: LibraryCategory; description: string }
export async function uploadLibraryFile(input: LibraryUpload, options?: { onProgress?: (sent: number, total: number) => void; signal?: AbortSignal }): Promise<LibraryFile>
export async function deleteLibraryFile(file: Pick<LibraryFile, 'id' | 'storagePath'>): Promise<void>
```
- 읽기: `from('library_files').select('id, file_name, name, category, description, storage_path, size, created_at').order('created_at', { ascending: false }).limit(1000)`. 칸 모양 검사(글자·분류 셋·크기 정수·시각)에 틀린 줄은 버린다
- 받기: `createSignedUrl(storagePath, 60)`(download 옵션을 넘기지 않는다) → 서명 주소가 http(s)가 아니면 DOWNLOAD-FAILED → `const u = new URL(signedUrl); u.searchParams.set('download', fileName)` → `document.createElement('a')`(href = `u.toString()`, `rel="noopener"`, 숨김) → `click()` → `remove()`. `target` 없음
  - 까닭(TASK-6, 독립 검토에서 찾음): 설치된 `@supabase/storage-js` 2.117.3은 `download` 값을 URLSearchParams로 바꿔 적은 뒤 주소 전체에 `encodeURI`를 한 번 더 걸어(`dist/index.mjs` 약 1048~1051줄) 두 번 바뀐다. Storage 서버는 받은 값을 `encodeURIComponent` 한 번만 하므로 `청구 도우미 설명서.pdf`가 `%EC%B2%AD….pdf`로 저장되고 `+ # & %`가 든 이름도 깨진다. `searchParams.set`은 한 번만 바꿔 적는다
  - 시험: 가짜 supabase client가 아니라 진짜 `StorageClient`(`@supabase/storage-js`)에 가짜 fetch를 넣어 서명 주소를 받고, `new URL(href).searchParams.get('download')`가 `청구 도우미 설명서.pdf`·`+ # & %`가 든 이름과 같음을 본다
- 올리기: `crypto.randomUUID()` → `createSignedUploadUrl(uuid)` → `new XMLHttpRequest()` `open('PUT', signedUrl)` · `setRequestHeader('content-type', file.type || 'application/octet-stream')` · `upload.onprogress` → `onProgress(loaded, total)` · `send(file)`. 2xx만 성공. 너무 큼 = HTTP 413, 또는 HTTP 400이고 답 몸통 JSON의 `statusCode`가 `'413'`(Storage는 둘 중 하나로 답한다 — 옛 `installFiles.ts`의 `isDuplicate`가 `'409'`를 보던 것과 같은 모양) → FILE-SIZE, 그 밖 실패 → UPLOAD-FAILED. 이름 200자 넘음·크기 넘음은 네트워크 전에 `pickProblem`과 같은 검사로 던진다. `signal`이 오면 `xhr.abort()` → `LibraryStopped`. PUT이 끝난 뒤 멈춤이 왔으면 바구니 파일을 지우고 `LibraryStopped`. 그다음 `from('library_files').insert({ file_name: file.name, name: name.trim(), category, description: description.trim(), storage_path: uuid, size: file.size }).select(<읽기 칸>).single()`. 넣기 실패면 `remove([uuid])`(그 실패는 삼킨다) 뒤 23505 → FILE-EXISTS, 그 밖 → UPLOAD-FAILED
- 지우기: `storage.from('library').remove([storagePath])` 오류 → DELETE-FAILED(표 그대로). 그다음 `from('library_files').delete().eq('id', id).select('id')` 오류·0줄 → DELETE-FAILED. 없는 바구니 파일 지우기는 Supabase가 오류 없이 답하므로, 표 지우기만 실패한 경우 [지우기]를 다시 누르면 끝까지 지워진다
- 본보기: `src/lib/storage/installFiles.ts`(Storage·오류 바꾸기)·`src/lib/storage/inventory.ts`(사진 올리기 + 표 줄). 시험은 가짜 supabase client와 `vi.stubGlobal('XMLHttpRequest', …)`

## 오류 (`src/lib/errors.ts`·`src/types/errors.ts`)
- 더함: requirements.md '시안에 없어 이 명세가 정한 글' 표의 E-LIBRARY- 일곱(끝 마침표 있음, 표 글자 그대로). E-LIBRARY-FILE-NAME은 시안 notes의 여섯에 더한 것(파일 이름 200자 넘음 — DB 제약에 걸리기 전에 고를 때 알린다)
- 지움(TASK-5): E-INSTALL-FILE-NAME · E-INSTALL-FILE-SIZE · E-INSTALL-FILE-EXISTS · E-INSTALL-UPLOAD-FAILED(관리자 옛 올리기 칸만 썼다). E-INSTALL-READ-FAILED · E-INSTALL-DOWNLOAD-FAILED는 비트 PC 연결 화면 받기 단추가 계속 쓴다(글 그대로)

## 화면 (`src/components/library/`, 시안 `index.html` 그대로 — 앱 토큰·`components/ui/classes.ts`만, 폰 전용 모양(`max-md:` 등) 없음)
- `src/app/(app)/library/page.tsx`: `dynamic = 'force-dynamic'`, `metadata = { title: '자료실' }`, `const me = await currentMe()`(레이아웃과 같은 요청 캐시 — 새 DB 읽기 없음) → `<LibraryScreen isAdmin={me.isAdmin && me.hospital?.status === 'approved'} />`(데스크는 거짓)
- `LibraryScreen({ isAdmin })`: `canEdit = isAdmin && !useReadOnly()`. 상태: 목록(`useLibrary`) · 칩 거르기 · 펼친 종류 · 받는 중 id · 받기 오류 · 올린 뒤 알림 `{ fileName, kind | null }` · 새 줄 id · 창(`upload` | `{ delete: file }` | null) · 짧은 알림. 자리 차례(시안 `libraryHtml`): 머리 줄(h1 + `파일 {n}개` · 오른쪽 [파일 올리기]) → 안내 글 → (받기 오류 카드) → (올린 뒤 초록 상자) → 칩 → 표 → 표 아래 줄. 본문 폭은 앱 틀 그대로(1280), 오류 카드 줄만 640px까지
- `useLibrary()`: `{ status: 'loading' } | { status: 'ready', files } | { status: 'failed', code }` + `reload(): Promise<boolean>`. 처음 한 번 읽고, `reload` 동안 지금 `ready` 표를 그대로 둔다(첫 읽기와 [다시 읽기]만 loading/failed를 보인다 — 올리기·지우기 뒤 다시 읽기가 실패하면 실패 카드)
- `LibraryTable`: props `{ files, rows, canEdit, freshId, busyId, onToggle, onDownload, onDelete, onUpload }` — 칸 폭 분류 112 · 크기 96(오른쪽 맞춤) · 올린 날 112 · 단추 칸 1%, 이름 칸만 줄바꿈. 표 감싸개 `overflow-x: auto`. 새 줄 `bg-accent-soft`, 옛 판 줄 `bg-canvas`, 줄 올림 `hover:bg-canvas`
- `UploadDialog`: props `{ files, onDone(file: LibraryFile), onClose, onStopped }` — 시안 `layerHtml` 올리기 창(폭 520, 24px 안쪽, 칸 사이 20). 숨은 `<input type="file">`(accept 없음). 칸 잠금 = 파일 없음 · `pickProblem` 있음 · 올리는 중. 분류 단추는 잠겨 있으면 하나도 눌린 모양이 아니다. 이름 칸 maxLength 200, 설명 칸 maxLength 60. 올리는 중 `AbortController`
- `DeleteDialog`: props `{ file, files, onDone, onClose }` — alertdialog(폭 400), 본문 둘째 문장은 `deleteNote`로
- 창 공통: 바탕 막은 `fixed inset-0 bg-ink/36`(지금 `AdminApplications.tsx`·`RedoDialog.tsx`와 같은 토큰 클래스 — 색 함수·16진수 색 글자를 쓰지 않는다, `src/app/theme.test.ts` AC-202.3), 누름·Esc = 닫기(올리는 중 빼고), 닫으면 초점은 연 단추로. 짧은 알림은 아래 가운데 2.6초, 모양은 `bg-ink text-surface rounded-float shadow-float`(시안 `.toast`, contacts `ShortNotice`와 같은 토큰), 앞 알림을 바꾼다. 화면 코드의 색은 모두 토큰 클래스(`bg-accent-soft`·`bg-canvas`·`bg-positive-soft`·`text-negative` 등)만 쓴다
- 그림: 공용 `Icon`의 `upload`·`chev`·`check`·`arrow`를 쓰고, 공용에 없는 받기·파일·꺾인 화살표는 `components/library/icons.tsx`에 시안 SVG 그대로
- 시안 표시용(회색 머리·노란 점선·'바뀜'·[받기] 시안 알림)은 만들지 않는다

## 메뉴 (`src/components/shell/menu.ts`·`MoreMenu.tsx`·`TabBar.tsx`)
- `MenuLabel`에 `'자료실'`, `MenuPath`·`MenuHref`에 `'/library'`. `export const LIBRARY_TAB: MenuItem = { label: '자료실', path: '/library', href: '/library', ready: true, primary: false }` — `LOCATION_TAB`처럼 MENU 밖(목차·준비 중·미리보기 탭·'관리자만 보는 탭' 목록 그대로)
- `currentMenuLabel`이 보는 탭에 `LIBRARY_TAB`을 더한다. `TAB_ACCESS_MENU` 밖이라 `adminOnlyTabs`·`isHiddenPath`·`TabGate`가 숨기지 않는다 → 늘 보이는 탭
- `MoreMenu`: 판 목록(원장 `MORE_MENU`, 관리자 `ADMIN_MORE`)에서 설정 바로 앞에 `LIBRARY_TAB`을 끼운다(숨김 거르기 뒤에도 남음). 칩 없음
- 데스크: `export const DESK_TABS = [...DESK_MENU, LIBRARY_TAB]`(탭 띠), `isDeskPath`가 `/library`와 그 아래를 연다. `DESK_MENU`(셋)·`deskHomeOf`·`DESK_HOME`·막힌 화면 글은 그대로. `TabBar`는 데스크면 `DESK_TABS`, 누른 탭 찾기 목록에 `LIBRARY_TAB`
- 문지기(`lib/auth/gate.ts`)는 고치지 않는다(`/library`는 관리자 경로가 아니라 승인된 원장·데스크 모두 연다). `ViewGate`도 그대로(보는 중 막는 주소는 청구·환자·예약뿐)

## 설정·관리자 칸과 받기 단추 (TASK-5)
- `src/components/settings/InstallFilesCard.tsx` → 작은 칸: `<section aria-label="설치 파일" className={`${ds.panel} flex items-center justify-between gap-4 p-5`}>` 안에 h2 `설치 파일`(subtitle 600) · 글(body ink-2, 위 2px) · `<Link href="/library" className={ds.button.secondary}>자료실 열기 <Icon name="arrow" /></Link>`(시안 `.mini-card`). 목록을 읽지 않는다. `SettingsPage`의 자리(ClinicProfileCard 다음)는 그대로
- `src/components/admin/InstallFilesAdmin.tsx` → 같은 모양 작은 칸(관리자 글). `admin/page.tsx`의 `top={<InstallFilesAdmin />}` 자리 그대로. 서버 그리기에서 h2 `설치 파일`이 보인다(지금 page.test 차례 시험 그대로)
- `src/lib/storage/installFiles.ts` → 자료실 위의 얇은 잇기: `InstallKind = VersionKind`, `InstallFile` 모양 그대로, `parseInstallName = versionOf`, `latestInstallFiles()`(`listLibraryFiles` 한 번 → `latestOfKind` 둘, 실패는 `InstallFilesError('E-INSTALL-READ-FAILED')`), `downloadInstallFile(file)`(`downloadLibraryFile({ storagePath: file.path, fileName: file.name })`, 실패는 `E-INSTALL-DOWNLOAD-FAILED`), `installMeta(file)`(크기는 `sizeText` — 자료실과 같은 크기 글자). `uploadInstallFile`·`install-files` 바구니 이름은 지운다
- `DownloadButton.tsx`·`useInstallFiles.ts`·`StepGuide.tsx`·`SetupScreen.tsx` 코드는 그대로(같은 함수 이름·모양을 부른다). 시험의 옆 글 기대값만 새 크기 글자로(예 889,612바이트 `889KB` → `869KB`)
- `supabase/deskInstallFiles.rls.test.ts` AC-7007.1 '머리 주석' 시험은 지우지 않고 기대 자리를 옮긴다(까닭: 이 명세): `installFiles.ts` 주석의 `데스크`·`20261119200000_desk_install_files.sql` → `src/lib/storage/library.ts` 머리 주석의 `데스크`·`20261125000000_library.sql`(TASK-2가 씀). `DownloadButton.tsx` 주석 `데스크` 기대는 그대로. 같은 파일의 ADR-031 시험은 그대로(TASK-1은 ADR을 끝에 더하기만)

## 결정과 트레이드오프
- **tab_access 줄을 넣지 않는다(맡긴 기술 선택에서 바꿈)**: `tab_access`는 `TAB_ACCESS_MENU`(MENU − 대시보드·설정)만 다룬다. 자료실을 MENU 밖 `LIBRARY_TAB`으로 두면 숨김 판정에 들지 않아 줄 없이도 늘 모두에게 보이고(시안 notes '대시보드·설정처럼 늘 보이는 탭'), 줄은 쓰이지 않는 값이 된다. MENU에 넣으면 대시보드 기능 목차와 주 관리자의 '관리자만 보는 탭' 칸에도 자료실이 생겨 시안에 없는 화면이 바뀐다. 그래서 SQL은 `tab_access`를 건드리지 않는다
- 바구니 이름은 uuid: Storage 이름에 한글을 못 쓴다. 원래 이름은 표에 두고 받을 때 서명 주소에 `download` 값으로 붙인다(storage-js의 `download` 옵션은 쓰지 않음 — '저장 함수' 받기 까닭)
- 바구니 먼저 → 표 나중(올리기·지우기 모두): 표가 목록의 기준이라, 남는 것이 생겨도 '목록에 없는 바구니 파일'(안 보임) 쪽이 되게 한다. 올리기 중 표 넣기 실패는 바로 바구니 파일을 지운다
- 받기는 서명 주소(1분): 50MB를 메모리에 담지 않고 브라우저 받기 막대가 보인다. 옛 설치 파일은 Blob으로 받았다
- 같은 파일 이름 막기: 판 묶기가 파일 이름으로 보므로 같은 이름 둘을 두지 않는다(DB unique + 고를 때 화면 검사)
- 보는 중 쓰기는 DB가 아니라 브라우저 거르기·단추 숨김이 막는다(위 SQL). 자료실은 보는 의원의 자료가 아니다
- 크기 글자 한 규칙: 시안 규칙(1KB = 1,024)으로 자료실과 비트 PC 연결 받기 단추 옆 글을 맞춘다

## ADR-051 (TASK-1이 `docs/ADR.md` 끝에 더함 — ADR-050은 erp-uisarang 갈래가 씀)
### ADR-051: 자료실 — 모든 의원이 같이 보는 공용 표 `library_files` + 공용 바구니 `library`, 관리자만 올리고 지운다 (install-files 보관함을 대신함 · ADR-037·042 같은 공용 표 예외)
- 맥락: 설치 파일 보관함(helper-download)은 도우미·확장 zip 둘·5MB·이름 모양만 받았다. 사용자가 다른 프로그램·설명서도 웹앱에서 받게 하자고 했다(2026-11-25)
- 결정: `hospital_id` 없는 표 한 벌과 비공개 바구니 하나. 읽기는 승인된 의원의 원장·데스크·관리자(옛 설치 파일 읽기와 같은 판정), 넣기·지우기는 관리자만, 고치기 없음. 어떤 형식이든 한 파일 50MB. 비트 PC 연결 받기 단추는 자료실의 판 번호 파일 중 최신을 준다. 옛 바구니 `install-files`는 지우지 않고 앱이 더는 읽지 않는다
- 트레이드오프: 무료 플랜 Storage 1GB를 다른 바구니와 나눠 쓴다(50MB 파일 20개면 찬다) — 관리자가 옛 판을 지운다. 보는 중 쓰기는 DB가 아니라 브라우저가 막는다(ADR-046과 같음)
- `docs/ARCHITECTURE.md`: DB 표에 `library_files` 한 줄, 공용 표 예외 줄에 자료실, Storage 줄에 `library`(그리고 `install-files`는 앱이 더 읽지 않음)

## 위험
- 한글 파일 이름 받기: 저장 이름은 Supabase가 `download` 값으로 붙이는 `Content-Disposition`에 달렸다 → 배포 뒤 한글 이름 파일 하나를 받아 이름을 본다(배포 순서 ⑤). 깨지면 Blob 받기(옛 방식)로 바꾸는 것을 명세 고침으로 한다. (독립 검토에서 storage-js `download` 옵션이 두 번 바꿔 적는 것을 찾아 TASK-6에서 주소에 직접 붙이도록 고침 — 배포 순서 ⑤ 확인은 그대로)
- 배포 뒤 관리자가 도우미·확장 zip을 자료실에 다시 올리기 전까지 비트 PC 연결 [도우미 내려받기]·[확장 내려받기]가 '아직 받을 파일이 없어요'다 → 배포 바로 뒤 올린다(배포 순서 ④)
- 프로젝트 전체 올리기 한도가 50MB보다 작으면 큰 파일이 E-LIBRARY-FILE-SIZE(413)로 막힌다 → 배포 순서 ②에서 본다
- 올리는 동안 다른 탭으로 가면 창이 닫혀 올리기가 멈춘다(XHR 끊김 → 아무것도 남지 않음). 창 안 글 `다 올라갈 때까지 이 창을 열어 두세요.`가 알린다

## 배포 순서 · 사용자 단계 (배포·합치기는 사용자가 말할 때만)
1. 사용자: `/sdd approve library`
2. 모두 합친 뒤 배포 전: 사용자가 `supabase/migrations/20261125000000_library.sql`을 Supabase SQL Editor에 붙여 넣고, Storage에 `library` 바구니가 Private인지 · Storage 설정의 'Upload file size limit'이 50MB 이상인지 본다
3. 사이트 배포(운영 갈래 규칙대로, ssk-deploy)
4. 배포 바로 뒤: 관리자가 자료실 [파일 올리기]로 `C:\Users\tjtmd\Desktop\서승관웹앱\설치파일\도우미-설치파일\`의 가장 높은 도우미 zip과 확장 zip을 올린다(분류 '설치 파일', 설명은 시안 예 글 — 도우미 `청구 도우미 · 비트 자료를 읽는 PC 프로그램`, 확장 `크롬 확장 · 크롬에 붙이는 작은 프로그램`). 2026-11-25 기준 그 둘은 `precheck-helper-0.13.3.zip`(feat-reg-many 0fddccfb로 만든 것, 아직 태그 없음)과 `precheck-extension-0.4.0.zip`이다. 올릴 때까지 0.13.3이 릴리스되지 않았으면 GitHub 릴리스 `helper-v0.13.2`의 `precheck-helper-0.13.2.zip`을 대신 올린다. **이 올리기가 곧 모든 의원의 [도우미 내려받기]·[새 도우미 내려받기]·[확장 내려받기]가 주는 판이 된다.** 올린 뒤 비트 PC 연결 화면 [도우미 내려받기] 옆 글이 그 판인지 본다
5. 한글 이름 파일 하나(예 설명서 pdf)를 올리고 받아 저장 이름을 본다
6. 옛 바구니 `install-files`는 그대로 둔다(지우지 않음). 앞으로 새 도우미·확장 판을 낼 때는 관리자 화면이 아니라 자료실에 올린다고 알린다
