# 설계: 주소록

## 흐름
```
[원장 PC·폰] ContactsScreen ─ useContacts ─(lib/storage/contacts.ts, RLS 내 병원)→ Supabase contacts_companies · contacts_people · contacts_equipment · contacts_repairs
             화면을 열 때 loadContacts 한 번(네 표 다 읽음) → 고치면 그 줄 저장 함수 → 손에 든 주소록을 그 답으로 바꿈
             찾기·거르기·남은 날은 lib/contacts 순수 함수(filterCompanies · warrantyState)
[엑셀 올리기] 파일 고르기 → (브라우저) readContactsFile(바이트, xlsx 늦은 불러오기) → buildImportPlan(줄, 지금 주소록) → 미리 보기
             [넣기] → importContacts → rpc('contacts_import', {p}) 한 번(한 트랜잭션) → 되면 loadContacts 다시
[양식 받기]  <a href="/contacts/contacts-template.xlsx" download="주소록-양식.xlsx"> (public/ 정적 파일, 서버 코드 없음)
[대시보드]   dashboard/page.tsx → WarrantyNotice(today) → listWarrantySoon(오늘~오늘+30, 10초 한도, 한 번) → 줄마다 warrantyState
[데스크]     탭 없음(DESK_MENU 그대로) · /contacts는 DeskGate 막힌 화면 · RLS는 my_hospital_id() null → 0줄
```
- 서버 코드(`app/api/ai/`)는 늘지 않는다. 브라우저 + RLS + 부른 사람 권한 DB 함수 하나(ADR-004). AI 경로는 이 표들을 읽지 않는다.
- CSP(`src/lib/csp.ts`)·`next.config.ts`·`middleware.ts`는 그대로다. 정적 양식 파일은 로그인한 사람만 받는다(middleware matcher가 `/contacts/…`를 거치게 하고 로그인 안 했으면 `/login`).
- 이름 주의: 저장소의 `contact`(단수)는 환자 문자 연락(`contact.targets`·`lib/storage/contactCounts.ts`·도우미 `Contact/`)이다. 주소록은 늘 복수 `contacts`(표 `contacts_*`, `lib/contacts`, `lib/storage/contacts.ts`, `components/contacts`)로 쓴다.

## 어디에 두나 — 환자 자료 구역 밖 (Claude 판단)
- 주소록 엑셀·표에는 **환자 정보가 없다**(업체·담당자·장비·수리 기록). 환자 파일 규칙("환자 파일은 Web Worker 안에서만")의 대상이 아니라서 화면 쪽(메인 스레드)에서 읽는다. 파일이 작고(5MB·3,000줄까지) 한 번만 읽기 때문에 Worker도 쓰지 않는다.
- 순수 함수와 엑셀 읽기는 **새 폴더 `src/lib/contacts/`**에 둔다. eslint 환자 자료 구역 목록(`eslint.config.mjs`의 `src/lib/parsers/**` … `src/workers/**`)에 **넣지 않고**, `lib/parsers`(비트 파일 읽기 — 읽는 칸 허용 목록·차트번호 메모리 번호 규칙이 붙은 곳)도 불러오지 않는다. 이유: (1) 그 구역은 "환자 자료가 있는 곳"이라는 표시라 환자 자료가 없는 코드를 넣으면 경계가 흐려진다. (2) `lib/parsers/common.ts`를 같이 쓰면 비트 파일 규칙을 바꿀 때 주소록이 딸려 바뀐다. (3) 구역 밖이어도 이 폴더는 순수 함수만 둔다 — supabase·`lib/storage`·React·Next·네트워크·브라우저 저장소를 쓰지 않는다(AC-6503.9를 시험이 소스 글자로 본다. 새 eslint 규칙은 만들지 않는다).
- 날짜는 `lib/analytics/dates.ts`(`parseDateCell`·`diffDays`·`addDays`·`todayInKorea`)만 불러온다. 구역 밖에서 그 파일을 부르는 것은 이미 하는 일이다(`lib/storage/calendar.ts`의 `isYmd`).
- `xlsx`는 `workbook.ts` 안에서 `await import('xlsx')`(고정 경로 늦은 불러오기)로만 불러 첫 화면 JS에 싣지 않는다. 지금 `xlsx`를 구역 밖에서 막는 규칙은 없다(`src/guardrails.test.ts`는 구역 안의 늦은 불러오기만 본다).
- 저장(`lib/storage/contacts.ts`)과 화면(`components/contacts/`)은 지금 다른 탭과 같은 자리다.

## 시안과 맞출 곳 · 이 명세가 정한 것 (Claude 판단, 사용자 확인 대상은 tasks.md 끝)
- 화면 글자는 requirements.md '정해 둔 글자'만 이 명세가 정하고, 나머지(목록·자세히 모양, 자리표시, 빈 목록·찾은 것 없음, 가린 글자 모양·다시 가리기, 복사 알림, 남은 날 글, 지우기 확인, 미리 보기 모양과 이유 글, 대시보드 알림 글·자리·누르면 갈 곳, 오류 문구 여덟, 폰 모양)는 **시안 승인 뒤 그 글자 그대로**다. 아래 '오류 번호'의 번호만 이 명세가 정한다.
- 하는 일·품목은 **한 칸**이다(양식 머리글이 `하는 일·품목` 한 칸).
- 글자 견주기: 앞뒤 빈칸을 빼고 유니코드 NFC로 맞춘다(맥·윈도우 한글 조합 차이). 가운데 빈칸·대소문자는 그대로 견준다(검색만 대소문자 무시).
- 새 업체인데 분류가 모든 줄에서 비면 `기타`로 넣는다(DB 기본값도 `other`).
- 같은 업체 안 같은 담당자 이름은 DB가 막는다(엑셀 다시 올리기가 이름으로 사람을 찾기 때문).
- 일련번호가 빈 장비는 같은 이름이어도 여러 대 둘 수 있다. 그런 장비가 둘 이상이면 엑셀로는 고를 수 없어 '넣지 않는 줄'이다(화면에서 고친다).
- 엑셀에 일련번호가 있고 주소록에 그 일련번호가 없는데, 같은 이름에 일련번호가 빈 장비가 하나 있으면 그 장비에 일련번호를 채운다(처음엔 일련번호 없이 올리고 나중에 채우는 경우).
- 담당자 이름 없이 휴대폰·맡은 일만 적힌 줄은 '넣지 않는 줄'이다.
- 장비 지우기도 한 번 더 묻는다(수리 기록이 함께 지워진다). 담당자·수리 기록 한 줄은 묻지 않고 지운다.
- 미리 보기에서도 사이트 비밀번호·계좌 값은 가린다(바뀐 칸 이름만 보인다).
- 업체 목록 차례는 업체 이름 가나다(`localeCompare(…, 'ko')`). 시안이 분류로 묶으면 묶음 안에서 같은 차례다.
- 홈페이지는 `http://`·`https://`로 시작할 때만 링크다(`javascript:` 같은 주소를 막는다).
- 파일 한도: 5,000,000바이트, `연락처` 2,000줄, `장비` 1,000줄(머리글·빈 줄 빼고).
- `장비` 시트가 없는 파일도 받는다(장비 없이 연락처만). `연락처` 시트는 꼭 있어야 한다.
- 대시보드 알림은 읽기 실패를 조용히 넘긴다(오류 카드 없음) — 대시보드의 본 일(숫자)을 가리지 않게.
- 대시보드 알림 자리는 대시보드 맨 위(`LiveDashboard` 앞)를 기본으로 하고, 시안이 다른 자리를 고르면 그 자리다(그 자리 부품 파일이 TASK-6 Files 밖이면 명세를 먼저 고친다).

## ADR-034 (TASK-1이 `docs/ADR.md` 끝에 넣는 글. 다른 갈래가 먼저 034를 쓰면 다음 번호로 바꾸고 이 글의 번호만 고친다)
### ADR-034: 주소록 — 사이트 비밀번호·계좌를 잠그지 않고 다른 칸처럼 서버에 둔다
**맥락**: 주소록(`specs/contacts`)에는 업체 사이트 아이디·비밀번호와 계좌가 들어간다. 2026-11-21 인터뷰에서 사용자는 잠금 번호(따로 정한 번호로 브라우저에서 잠그고 볼 때 풀기)를 고르다가 "그냥 잠그지 마"로 정했다. 의원 계정은 접수·치료실·진료실 PC에 로그인돼 있어 그 PC 앞에 앉은 누구나 [보기]로 볼 수 있다는 점을 듣고 정했다. 이 값들은 우리 서비스의 비밀값(Supabase 키·API 열쇠, `CLAUDE.md` 보안 규칙)이 아니라 사용자가 적는 업체 자료다
**결정** (사용자, `specs/contacts`):
- 사이트 비밀번호(`site_pw`)·계좌(`account`)는 `contacts_companies`의 다른 칸과 똑같이 글자로 저장한다. 앱이 따로 암호화하지 않는다(Supabase 저장소 자체 암호화만)
- 읽기·쓰기는 RLS로 승인된 내 병원 **원장 계정만**(`my_hospital_id()`). 데스크 계정(ADR-031)·다른 병원·anon은 0줄. AI 경로로 보내지 않고, 로그·오류 글에 담지 않는다
- 화면은 평소 가리고 [보기]를 누른 칸만 보인다(엑셀 미리 보기도 가림). 엑셀 양식 `쓰는 법`에 "다 올린 뒤에는 지우거나 잘 보관하세요"가 있다
**이유**: 사용자 결정(2026-11-21). 잠금 번호는 PC마다 다시 쳐야 하고 잊으면 되살릴 수 없다. 혼자 쓰는 MVP라 원장 계정 보호(구글 로그인·관리자 승인·30분 자동 로그아웃)로 충분하다고 봤다
**대안**: (1) 잠금 번호로 브라우저에서 암호화 — 번호를 잊으면 못 되살리고, PC마다 번호를 쳐야 한다. (2) 서버 암호화(pgcrypto·Vault) — 열쇠도 서버에 있어 RLS를 지나면 같이 풀리므로 막는 힘이 늘지 않는다. (3) 비밀번호 칸 없음 — 사용자가 따로 적어 둬야 한다
**트레이드오프**: 원장 계정이 털리거나 로그인된 PC 앞의 누구나 비밀번호·계좌를 볼 수 있다. 누가 봤는지 기록이 없다. 앞으로 설정 탭 [백업 내려받기]가 생기면 그 JSON 파일에도 그대로 들어간다(그 명세가 다룬다). 엑셀 파일에 비밀번호가 남는다(사용자가 지운다)
**바꾸는 것**: `plan.md` §4 '서버로 가는 것'에 "주소록(업체 연락처·담당자·장비·수리 기록, 사이트 비밀번호·계좌 포함 — ADR-034)", §5 DB 표에 `contacts_*` 한 줄, `docs/ARCHITECTURE.md` DB 표

## DB (`supabase/migrations/20261121000000_contacts.sql`, 사용자가 SQL Editor에 붙여 넣음)
본보기 `20261117010000_calendar.sql`(머리 주석 모양: 실행 방법·앞에 있어야 할 파일·두 번 실행·무엇을 왜·권한)과 `20261105000100_stats_rx_groups.sql`(`save_stats_rx_groups` — 부른 사람 권한 함수로 여러 줄을 한 트랜잭션에 저장). 앞에 `20261028000000_auth.sql`·`20261030000000_precheck_settings.sql`(my_hospital_id)이 있어야 한다. `my_hospital_id()`는 다시 만들지 않는다. 모두 `create table if not exists`·`create index if not exists`·`create or replace function`·`drop policy if exists` 뒤 `create policy`, 표마다 RLS 켬 → `revoke all … from anon, authenticated` → 아래 권한만. 정책은 표마다 하나 `for all to authenticated using (hospital_id = (select public.my_hospital_id())) with check (같음)`. **데스크 정책은 더하지 않는다**(ADR-031: 데스크는 `my_desk_hospital_id()` 정책이 연 표만 본다).

### 칸·제약 (글자 수는 `char_length`, '빈칸 없음' = `칸 = btrim(칸)`)
| 표 | 칸 | 모양 · 제약 |
|---|---|---|
| `contacts_companies` | `id` | uuid pk 기본 `gen_random_uuid()` |
| | `hospital_id` | uuid not null 기본 `my_hospital_id()` → `hospitals(id)` on delete cascade |
| | `category` | text not null 기본 `'other'`, in (`'supplier'`,`'repair'`,`'agency'`,`'other'`) = 거래처·수리·관리·기관·보험·기타 |
| | `name` | text not null, 1~40자, 빈칸 없음 |
| | `phone` · `work` · `address` · `homepage` · `biz_no` · `account` · `site_id` · `site_pw` · `memo` | text not null 기본 `''`, 각 0~30 · 0~100 · 0~200 · 0~200 · 0~20 · 0~100 · 0~100 · 0~100 · 0~1000자 |
| | `created_at` | timestamptz not null 기본 now() |
| | 제약 | unique (`hospital_id`, `name`) · unique (`hospital_id`, `id`)(아래 표들의 바깥 키 자리) |
| `contacts_people` | `id`, `hospital_id`, `created_at` | 위와 같음 |
| | `company_id` | uuid not null, (`hospital_id`, `company_id`) → `contacts_companies(hospital_id, id)` on delete cascade |
| | `name` | text not null, 1~20자, 빈칸 없음 |
| | `mobile` · `role` | text not null 기본 `''`, 0~30 · 0~40자 |
| | 제약 | unique (`company_id`, `name`) |
| `contacts_equipment` | `id`, `hospital_id`, `created_at` | 위와 같음 |
| | `company_id` | 담당자와 같은 바깥 키(on delete cascade) |
| | `name` | text not null, 1~60자, 빈칸 없음 |
| | `serial` | text not null 기본 `''`, 0~60자, 빈칸 없음 |
| | `bought_on` · `warranty_until` | date null |
| | 제약 | check (`bought_on` is null or `warranty_until` is null or `warranty_until >= bought_on`) · unique (`hospital_id`, `id`) · 부분 unique 색인 (`company_id`, `serial`) where `serial <> ''` · 색인 (`hospital_id`, `warranty_until`) |
| `contacts_repairs` | `id`, `hospital_id`, `created_at` | 위와 같음 |
| | `equipment_id` | uuid not null, (`hospital_id`, `equipment_id`) → `contacts_equipment(hospital_id, id)` on delete cascade |
| | `day` | date not null |
| | `content` | text not null, 1~200자, 빈칸 없음 |
| | `cost` | bigint null, 0 ~ 10,000,000,000(원 정수, 비움 = 모름) |
| | 제약 | 색인 (`equipment_id`) |
- 바깥 키를 (`hospital_id`, 부모 id) 둘로 거는 까닭: 바깥 키 검사는 RLS를 보지 않아서, id 하나로만 걸면 남의 병원 업체 id를 알면 그 밑에 줄을 달 수 있다. 둘로 걸면 내 `hospital_id`(기본값)와 다른 병원 부모는 거부된다(AC-6501.2).

### 권한 (`authenticated`. `anon`은 없음. `id`·`hospital_id`·`created_at`은 칸 권한 없음)
| 표 | select | insert 칸 | update 칸 | delete |
|---|---|---|---|---|
| `contacts_companies` | 예 | category, name, phone, work, address, homepage, biz_no, account, site_id, site_pw, memo | 같은 열한 칸 | 예 |
| `contacts_people` | 예 | company_id, name, mobile, role | name, mobile, role | 예 |
| `contacts_equipment` | 예 | company_id, name, serial, bought_on, warranty_until | name, serial, bought_on, warranty_until | 예 |
| `contacts_repairs` | 예 | equipment_id, day, content, cost | day, content, cost | 예 |
| 함수 `contacts_import(jsonb)` | — | — | — | 실행: `authenticated`만(public·anon에서 거둠) |

### 넣기 함수 `public.contacts_import(p jsonb) returns void` (plpgsql, `security invoker`, `set search_path = ''`, 이름은 모두 `public.`)
- 한 번 부르기가 한 트랜잭션이다. 어느 줄이든 실패(제약·RLS·아래 검사)하면 `raise`로 끝나 아무것도 바뀌지 않는다. 부른 사람 권한이라 RLS·칸 권한·기본값이 그대로 지켜진다(데스크·승인 대기는 `hospital_id`가 null이 되어 실패).
- 몸통 모양(키 이름 = DB 칸 이름). 선택 키가 **없으면 그 칸은 그대로**(빈 글자 `''`도 값이라 보내지 않는 것이 '그대로'다):
```json
{ "companies": [{ "name": "예시메디칼", "category": "supplier", "phone": "02-000-0000", "work": "…", "address": "…", "homepage": "…",
                  "biz_no": "…", "account": "…", "site_id": "…", "site_pw": "…", "memo": "…" }],
  "people":    [{ "company": "예시메디칼", "name": "김예시", "mobile": "010-0000-0000", "role": "영업" }],
  "equipment": [{ "company": "예시메디칼", "name": "예시 치료기", "serial": "0000-0001", "bought_on": "2026-01-05", "warranty_until": "2028-01-04" }] }
```
  - 꼭 있는 키: 업체 `name` · 담당자 `company`·`name` · 장비 `company`·`name`·`serial`(빈 글자 가능). 나머지는 선택.
- 검사(틀리면 raise): `p`가 객체, 세 키가 배열(없으면 빈 배열로 봄), 업체 2,000 · 담당자 2,000 · 장비 1,000줄까지, 각 줄이 객체이고 꼭 있는 키가 글자.
- 차례: (1) 업체 — (`my_hospital_id()`, `name`)이 있으면 몸통에 있는 칸만 고치고, 없으면 넣는다(`insert … on conflict (hospital_id, name) do update`, 칸마다 `p ? 'phone'`이면 새 값 아니면 지금 값). (2) 담당자 — `company` 이름으로 내 병원 업체 id를 찾고(없으면 raise) (업체, `name`)이 있으면 몸통 칸만 고치고 없으면 넣는다. (3) 장비 — `company`로 업체 id를 찾고 '장비 맞추기' 차례로 찾아 고치거나(`name`은 늘 새 값, `serial`은 빈 글자가 아니면 새 값, 날짜는 키가 있으면 새 값) 넣는다.
- **장비 맞추기**(브라우저 계획과 DB 함수가 같은 차례): ① 일련번호가 있으면 같은 업체·같은 일련번호 장비. ② ①이 없고 일련번호가 있으면 같은 업체·같은 이름·일련번호 빈 장비 — 하나면 그것(일련번호를 채움), 둘 이상이면 고를 수 없음. ③ 일련번호가 비면 같은 업체·같은 이름 장비(일련번호 상관없음) — 하나면 그것, 둘 이상이면 고를 수 없음. 못 찾으면 새 장비. '고를 수 없음'은 계획에서는 넣지 않는 줄, 함수에서는 raise.

## 모양 (`src/types/contacts.ts`, TASK-2)
```ts
export type ContactCategory = 'supplier' | 'repair' | 'agency' | 'other'
export type CompanyFields = { category: ContactCategory; name: string; phone: string; work: string; address: string; homepage: string
  bizNo: string; account: string; siteId: string; sitePw: string; memo: string }
export type Company = CompanyFields & { id: string }
export type PersonFields = { name: string; mobile: string; role: string }
export type Person = PersonFields & { id: string; companyId: string }
export type EquipmentFields = { name: string; serial: string; boughtOn: string | null; warrantyUntil: string | null } // 'YYYY-MM-DD'
export type Equipment = EquipmentFields & { id: string; companyId: string }
export type RepairFields = { day: string; content: string; cost: number | null }
export type Repair = RepairFields & { id: string; equipmentId: string }
export type ContactBook = { companies: Company[]; people: Person[]; equipment: Equipment[]; repairs: Repair[] }
// 넣기 함수 몸통(키 = DB 칸 이름, design.md '넣기 함수')
export type ImportCompany = { name: string; category?: ContactCategory; phone?: string; work?: string; address?: string; homepage?: string
  biz_no?: string; account?: string; site_id?: string; site_pw?: string; memo?: string }
export type ImportPerson = { company: string; name: string; mobile?: string; role?: string }
export type ImportEquipment = { company: string; name: string; serial: string; bought_on?: string; warranty_until?: string }
export type ImportPayload = { companies: ImportCompany[]; people: ImportPerson[]; equipment: ImportEquipment[] }
export type WarrantyItem = { equipmentId: string; companyId: string; companyName: string; name: string; serial: string; warrantyUntil: string }
```

## 순수 함수 (`src/lib/contacts/`, TASK-2 — 구역 밖, 순수)
- `categories.ts`: `CONTACT_CATEGORIES = [{ id: 'supplier', label: '거래처' }, { id: 'repair', label: '수리·관리' }, { id: 'agency', label: '기관·보험' }, { id: 'other', label: '기타' }] as const` · `categoryOf(label)` → id | null · `categoryLabel(id)`
- `fields.ts`: `CONTACT_LIMITS`(DB 'DB' 표 글자 수 그대로) · `FIELD_LABELS`(칸 이름 = requirements.md '정해 둔 글자') · `cleanText(s)`(앞뒤 빈칸 빼고 NFC) · `textLength(s)`(코드포인트 수) · `companyProblems(fields)` · `personProblems` · `equipmentProblems`(날짜 모양 'date', 끝나는 날 < 들여온 날 'order') · `repairProblems`(날짜 필수, 내용 1~200, 비용 'money') → `{ field, reason: 'empty'|'too-long'|'date'|'order'|'money' }[]` · `parseWon(text)` → number | null | 'bad'(쉼표·빈칸 허용, 0 이상 정수, 10,000,000,000 이하)
- `sheet.ts`: `GUIDE_SHEET = '쓰는 법'` · `CONTACT_SHEET = '연락처'` · `EQUIPMENT_SHEET = '장비'` · `CONTACT_HEADERS`(14개, requirements.md 10번 차례 그대로) · `EQUIPMENT_HEADERS`(5개) · 머리글 → 칸 열쇠 표 · `type Cell = string | number | boolean | null` · `type SheetRows = { contacts: { row: number; cells: Cell[] }[]; equipment: { row: number; cells: Cell[] }[] | null }`(첫 원소 = 머리글 줄, `row` = 엑셀 줄 번호)
- `plan.ts`: `buildImportPlan(rows: SheetRows, book: ContactBook)` → `ImportPlan | { error: 'form'; missing: string[] }`
  ```ts
  type ProblemReason = 'category' | 'no-company' | 'date' | 'too-long' | 'unknown-company' | 'no-person-name' | 'no-equipment-name' | 'many-equipment'
  type RowProblem = { sheet: '연락처' | '장비'; row: number; reason: ProblemReason; field: string | null } // field = 칸 이름(머리글 글자)
  type ItemChange = { name: string; fields: string[] } // 바뀐 칸 이름
  type CompanyChange = { name: string; status: 'new' | 'changed' | 'same'; fields: string[]
    people: { added: string[]; changed: ItemChange[] }; equipment: { added: string[]; changed: ItemChange[] } }
  type ImportPlan = { changes: CompanyChange[]; problems: RowProblem[]; payload: ImportPayload }
  ```
  - 칸 값 읽기: 글자 칸 = `typeof v === 'string'`이면 `cleanText(v)`, 숫자·참거짓이면 `cleanText(String(v))`(앞자리 0을 되살리지 않음), null → ''. 날짜 칸 = 비면 null, 아니면 `parseDateCell(v)`(엑셀 날짜 숫자 · `YYYY-MM-DD`·`YYYY.MM.DD`·`YYYY/MM/DD` · 그 밖 `parseDateCell`이 읽는 모양), 못 읽으면 'date'. 분류 = 비면 없음, `categoryOf`가 null이면 'category'.
  - 한 줄 검사 → 틀리면 그 줄 통째로 `problems`(같은 줄에 여럿이면 첫 이유 하나). 연락처를 먼저 다 묶은 뒤 장비를 본다(장비의 업체 = 넣는 연락처 줄의 업체 ∪ 주소록 업체).
  - 묶기·견주기·몸통은 requirements.md AC-6503.4·AC-6503.6과 '장비 맞추기'. 업체 차례 = 엑셀에 처음 나온 차례(장비 시트에서만 나온 업체는 그 뒤). `payload`는 `new`·`changed`의 바뀐 칸만.
  - `isEmptyPayload(p)` → 세 배열이 모두 비었는지.
- `warranty.ts`: `WARRANTY_SOON_DAYS = 30` · `warrantyState(until: string | null, today: string)` → `{ kind: 'none' } | { kind: 'ended' } | { kind: 'soon'; days: number } | { kind: 'later'; days: number }`(days = `diffDays(today, until)`)
- `search.ts`: `filterCompanies(book, query, category: ContactCategory | 'all')` → `Company[]`(AC-6503.8)
- 쓰는 날짜는 모두 한국 날짜 글자 `'YYYY-MM-DD'`. 오늘은 부르는 쪽이 `todayInKorea()`로 넘긴다(순수 함수는 시계를 읽지 않음).

## 엑셀 읽기 (`src/lib/contacts/workbook.ts`, TASK-5)
- `readContactsFile(bytes: Uint8Array)` → `SheetRows | 'bad' | 'form' | 'big'`
  - 5,000,000바이트 넘으면 'big'(읽기 전). `const XLSX = await import('xlsx')`, `XLSX.read(bytes, { type: 'array', cellDates: false, dense: false })`가 던지면 'bad'.
  - `wb.SheetNames`에서 **이름이 꼭 `연락처`·`장비`인 시트만** 고른다(머리글로 시트를 찾지 않는다 — `쓰는 법`에 같은 머리글 예시 표가 있다). `연락처`가 없으면 'form'.
  - 시트마다 `sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true })` → 줄 번호 = 시트 범위 시작 줄 + 차례(엑셀 줄 번호). 칸 값은 `Cell`로만(날짜 칸은 숫자로 온다 — `cellDates: false`).
  - 머리글 줄과 칸이 모두 빈 줄을 뺀 줄 수가 연락처 2,000·장비 1,000을 넘으면 'big'.
  - 파일 이름·내용은 어디에도 보내지 않고 저장하지 않는다(브라우저 메모리에서 미리 보기 동안만).

## 양식 파일 (TASK-5)
- 바탕화면 `C:\Users\tjtmd\Desktop\주소록-양식.xlsx`(사용자가 만든 것, 예시는 모두 가짜 업체)를 **바이트 그대로** `public/contacts/contacts-template.xlsx`로 복사한다. 앱은 새로 만들지 않는다(사용자 2026-11-21).
- 저장소에 엑셀 파일은 `.gitignore`·`.vercelignore`가 막는다(실제 EMR 파일 울타리). 엑셀 줄 뒤에 `!public/contacts/contacts-template.xlsx` 한 줄씩만 더한다(글롭 없음). 되살리기를 고정한 시험 둘을 맞춘다: `src/vercel-config.test.ts`(`.vercelignore` 줄 목록에 그 한 줄, 되살리기 허용 자리에 그 **파일 하나**를 더함 — 폴더가 아니다), `fixtures/make-fake-fixtures.test.ts`(`.gitignore` 되살리기 목록에 그 한 줄). 가짜 견본 폴더 `public/fake-sample/`에 넣지 않는 까닭: 그 폴더는 가짜 비트 파일 생성기 몫이고 시험이 그 안 파일을 `bit-sample.csv` 하나로 고정한다.
- 시험 `src/lib/contacts/template.test.ts`(AC-6504.3): 파일을 `xlsx`로 읽어 시트 이름 차례 · 두 시트 첫 줄 = `CONTACT_HEADERS`·`EQUIPMENT_HEADERS` · 두 시트에 머리글 줄만 · `연락처` 시트 XML(`XLSX.CFB`로 `xl/worksheets/…` 찾기)의 `<dataValidation … type="list"` 목록 글자가 `"거래처,수리·관리,기관·보험,기타"`(= `CONTACT_CATEGORIES` 글자를 쉼표로 이음)이고 범위가 A열 · `readContactsFile` → `buildImportPlan`(빈 주소록)이 줄 0·문제 0.
- 내려받기: `[양식 받기]` = `<a href="/contacts/contacts-template.xlsx" download="주소록-양식.xlsx">`(같은 사이트 주소라 `download` 이름이 먹는다. Blob·fetch 없음). 모양은 시안.
- 만든 스크립트(scratchpad `make_contacts_template.py`, openpyxl)는 **저장소에 넣지 않는다**(Claude 판단): 이 저장소에 openpyxl이 없고 시험도 없다. 양식을 고칠 때는 엑셀 파일을 직접 고쳐 다시 복사하고, 위 시험이 머리글이 코드와 같은지 지킨다.

## 저장 함수 (`src/lib/storage/contacts.ts`, TASK-3)
- 본보기 `lib/storage/calendar.ts`: `type Client = Pick<SupabaseClient, 'from' | 'rpc'>`, `class ContactsStorageError(kind: 'offline' | 'failed')`(이름 `ContactsStorageError`, 글은 `contacts storage {kind}`만), `navigator.onLine === false` → offline, 응답 없음(status 0) → offline, 던짐·그 밖 오류 → failed. Supabase 문구·입력값은 오류에 담지 않는다.
- 읽기: `loadContacts(client)` → `ContactBook`. 표마다 정해 둔 칸만 select(`contacts_companies`: `id,category,name,phone,work,address,homepage,biz_no,account,site_id,site_pw,memo` / `contacts_people`: `id,company_id,name,mobile,role` / `contacts_equipment`: `id,company_id,name,serial,bought_on,warranty_until` / `contacts_repairs`: `id,equipment_id,day,content,cost`), `created_at, id` 차례로 1,000줄씩 `range`로 나눠 다 읽는다. 줄마다 칸 모양을 보고(글자·날짜·분류·비용 정수) 틀린 줄은 뺀다.
- 쓰기(보내는 몸통은 정해 둔 칸을 골라 새로 만든다, `{ ...값 }` 금지): `addCompany(client, fields)` · `updateCompany(client, id, fields)` → `Company | 'invalid' | 'duplicate'` · `deleteCompany(client, id)` · `addPerson(client, companyId, fields)` · `updatePerson(client, id, fields)` → `Person | 'invalid' | 'duplicate'` · `deletePerson` · `addEquipment(client, companyId, fields)` · `updateEquipment` → `Equipment | 'invalid' | 'duplicate'` · `deleteEquipment` · `addRepair(client, equipmentId, fields)` · `updateRepair` → `Repair | 'invalid'` · `deleteRepair`. 글자는 `cleanText`로 맞추고 `…Problems`가 비지 않으면 보내지 않고 `'invalid'`. 답 줄은 읽기와 같은 검사(틀리면 failed). 23505 → `'duplicate'`.
- `importContacts(client, payload: ImportPayload)` → void: `client.rpc('contacts_import', { p: payload })` 하나. 몸통은 그대로 넘긴다(계획이 만든 것).
- `listWarrantySoon(client, today)` → `WarrantyItem[]`: `contacts_equipment`에서 `id,company_id,name,serial,warranty_until`을 `warranty_until`이 `today` 이상 `addDays(today, 30)` 이하인 줄만 `warranty_until`·`name` 차례로 읽고, 그 `company_id`들의 `contacts_companies`를 `id,name`만 읽어 업체 이름을 붙인다(업체가 안 보이는 줄은 뺀다). 사이트 비밀번호·계좌 칸을 읽지 않는다.

## 화면 (`src/components/contacts/`, 모양은 앱 토큰·`components/ui/classes.ts`, 글은 시안)
- `parts/`(TASK-4, props·콜백만, 저장·읽기 없음): 도구 줄(검색 칸·분류 거르기·단추 자리), 업체 목록, 업체 자세히(업체 칸·담당자·장비·수리 기록·남은 날), `PhoneText`(768px 미만 `tel:`(숫자와 맨 앞 `+`만) 링크 / 이상은 단추 → `navigator.clipboard.writeText` → 알림, 둘 다 그려 두고 `md:hidden`·`max-md:hidden`으로 고름), `SecretText`(가린 글자 + [보기]), 홈페이지 링크(`http(s)://`만), 업체·담당자·장비·수리 기록 판(`…Problems`로 저장 단추 끔), 지우기 확인. 파일 이름·나눔은 시안을 보고 TASK-4가 정한다.
- `import/`(TASK-5): `ImportPanel.tsx`(파일 고르기 → `readContactsFile` → `buildImportPlan` → 미리 보기 → [넣기] 콜백 `onImport(payload): Promise<void>`, 넣는 동안 꺼짐, 실패 때 미리 보기 그대로) · `ImportPreview.tsx`(업체별 `새로`·`바뀜`·`그대로`, 바뀐 칸·담당자·장비, `넣지 않는 줄` 목록, 비밀번호·계좌 값 가림) · `TemplateLink.tsx`([양식 받기] 링크). 지금 주소록(`book`)은 props로 받는다. 시험은 `ImportPanel.test.tsx`·`ImportPreview.test.tsx`(링크는 `ImportPanel` 시험 안에서).
- `ContactsScreen.tsx` + `useContacts.ts`(TASK-7): `loadContacts` 한 번(늦은 답 버림), 저장 함수 결과로 손에 든 주소록을 바꿈, 오류 번호 고르기('duplicate' → 칸에 맞는 TAKEN, 그 밖 실패 → SAVE-FAILED, 판 값은 그대로), [넣기] 뒤 다시 읽기. `client = useMemo(() => supabaseBrowser(), [])`(calendar 본보기). 오늘은 `todayInKorea()`.
- `src/app/(app)/contacts/page.tsx`: `metadata.title = '주소록'`, `<ContactsScreen />`(준비 중 화면 대신). 앱 틀·문지기는 (app)/layout 그대로.

## 대시보드 알림 (TASK-6)
- `src/components/dashboard/warranty/WarrantyNotice.tsx`('use client', props `today`): 처음 그릴 때 한 번 `listWarrantySoon(supabaseBrowser(), today)`를 10초 한도로 읽는다(한도·실패·떠난 뒤 늦은 답 → 아무것도 안 그림). 줄마다 `warrantyState(warrantyUntil, today)`의 `soon` days로 남은 날. 0줄이면 null. 글자·자리·링크(예: `/contacts`)는 시안.
- `src/app/(app)/dashboard/page.tsx`: `LiveDashboard` 앞에 `<WarrantyNotice today={todayInKorea()} />`(같은 `today` 값). 저장 숫자·묶음·비트 읽기는 이 읽기를 기다리지 않는다(따로 돈다). 데스크는 `/dashboard`가 DeskGate에서 수납일지로 바뀌어 그려지지 않고, 그려져도 RLS 0줄이다.
- 언제 읽나: 대시보드를 열 때 한 번. 날짜가 바뀌거나 주소록을 고쳐도 다시 읽지 않는다(다음에 대시보드를 열 때 새로 읽음). 읽는 자료 = 끝나는 날이 오늘~오늘+30인 장비 줄과 그 업체 이름뿐.
- `components/dashboard/imports.test.ts` 울타리(통계 화면·AI 리포트 부품 안 불러옴)에 걸리지 않는다(`lib/storage/contacts`·`lib/contacts/warranty`만 부름).

## 메뉴·준비 중 (TASK-7)
- `menu.ts`: 주소록 줄 `href: '/contacts'`, `ready: true`(primary false 그대로), `MenuHref`에 `'/contacts'`. `DESK_MENU`·`isDeskPath`는 그대로(데스크 막힘).
- `notReadyFeatures.ts`: `/contacts` 항목과 `NotReadyPath`의 `'/contacts'`를 뺀다. `features.ts`: 주소록 `status: 'ready'`(설명 글은 지금 그대로, 시안이 바꾸면 그 글자).
- 수를 고정한 시험(`shell.test.tsx`·`tabFrame.test.tsx`·`notReadyPages.test.tsx`·`notReadyFeatures.test.ts`·`features.test.ts`·`titles.test.tsx`·`notFound.test.tsx`·`DashboardHome.test.tsx`)은 수와 주소록 줄만 맞춘다. `docs/UI_GUIDE.md`의 '화면이 아직 없는 탭' 줄에서 주소록을 뺀다.

## 오류 번호 (TASK-2가 `src/types/errors.ts`·`src/lib/errors.ts`에 넣음. '무엇이·어떻게 고치나' 글은 시안 승인 뒤 그 글자)
| 번호 | 언제 |
|---|---|
| E-CONTACTS-READ-FAILED | 주소록 읽기 실패(다시 읽기 단추와 함께) |
| E-CONTACTS-SAVE-FAILED | 업체·담당자·장비·수리 기록 저장·지우기 실패(적은 값은 그대로) |
| E-CONTACTS-NAME-TAKEN | 같은 업체 이름이 이미 있음 |
| E-CONTACTS-PERSON-TAKEN | 그 업체에 같은 담당자 이름이 이미 있음 |
| E-CONTACTS-SERIAL-TAKEN | 그 업체에 같은 일련번호 장비가 이미 있음 |
| E-CONTACTS-FILE-BAD | 엑셀 파일이 아니거나 깨져 못 읽음 |
| E-CONTACTS-FILE-FORM | `연락처` 시트가 없거나 머리글이 양식과 다름(빠진 머리글 이름은 화면이 함께 보임) |
| E-CONTACTS-FILE-BIG | 파일이 크거나 줄이 많음 |
| E-CONTACTS-IMPORT-FAILED | [넣기] 실패 — 아무것도 바뀌지 않았음 |

## 예 (시험 숫자)
- 묶기: 연락처 줄 2 `거래처|예시메디칼|02-000-0000|…|김예시|010-0000-0000|영업`, 줄 3 `|예시메디칼|||…|이예시|010-0000-0001|수리 기사`, 줄 4 `수리·관리|예시설비|031-000-0000|…|박예시|…` → 업체 2(예시메디칼 분류 거래처·전화 02-000-0000, 담당자 김예시·이예시 / 예시설비 담당자 박예시). 줄 5 `기타| 예시메디칼 |099-…` → 같은 업체(앞뒤 빈칸), 전화는 처음 값 02-000-0000 그대로.
- 다시 올리기(주소록: 예시메디칼 전화 02-000-0000·메모 '매달 말에 주문'·담당자 김예시(010-0000-0000, 영업)): 엑셀 `예시메디칼` 전화 02-111-1111·메모 빈칸·담당자 김예시(휴대폰 빈칸, 맡은 일 '부장')·이예시 → `changed`, 바뀐 칸 [대표 전화], 담당자 고침 김예시[맡은 일]·더함 이예시. 몸통 `{ name: '예시메디칼', phone: '02-111-1111' }`(memo 키 없음), 사람 `{ company, name: '김예시', role: '부장' }`(mobile 키 없음)·`{ company, name: '이예시', mobile: '…', role: '…' }`. 엑셀에 없는 업체 예시설비는 changes에 없다.
- 넣지 않는 줄: 분류 '업체' → category · 업체 이름 빈칸에 전화만 → no-company · 들여온 날 '2026-13-01' → date(들여온 날) · 끝나는 날 2026-01-01 < 들여온 날 2026-02-01 → date(무상 수리 끝나는 날) · 업체 이름 41자 → too-long(업체 이름) · 장비 업체 '없는상사'(연락처·주소록 둘 다 없음) → unknown-company · 연락처 줄의 업체가 category로 빠지고 주소록에도 없으면 그 업체 장비 줄도 unknown-company.
- 숫자 칸: 대표 전화 `212345678`(숫자) → '212345678', 일련번호 `1001`(숫자) → '1001', 사업자번호 `1234567890` → '1234567890'.
- 날짜 칸: `46027`(엑셀 날짜) → 2026-01-05, '2026-01-05'·'2026.1.5'·'2026/01/05' → 2026-01-05, '26-01-05'·'2026년 1월 5일' → date.
- 장비 맞추기(주소록 예시메디칼: A 치료기/SN1, B 치료기/'', C 온열기/'', D 온열기/''): 엑셀 치료기/SN1 → A · 치료기/SN2 → B(일련번호 SN2를 채움) · 치료기/'' → 같은 이름 둘(A·B) → many-equipment · 온열기/'' → many-equipment · 초음파/'' → 새로.
- `warrantyState`(오늘 2026-11-21): null → none · 2026-11-20 → ended · 2026-11-21 → soon 0 · 2026-12-21 → soon 30 · 2026-12-22 → later 31.
- `filterCompanies`: '메디' → 예시메디칼(업체 이름) · '김예' → 예시메디칼(담당자) · '치료기' → 장비가 있는 업체 · '02-000' → 없음(전화는 안 찾음) · 분류 repair + '' → 예시설비만.

## 시험 계획 (시험 이름에 AC ID)
| 파일 | 보는 것 |
|---|---|
| `supabase/contacts.rls.test.ts` (TASK-1) | AC-6501.1~6: PGlite에서 진짜 migration 사슬을 돌린다(auth → precheck_settings → desk.rls.test.ts가 쓰는 사슬(worklog 넷·stats_rx_groups 둘·sunap·calendar → desk_accounts) → 이 파일, 흉내 `auth.users`·JWT `sub`·`email`). 원장 A·B, 승인 대기·거절, 병원 없는 사용자, A의 데스크, anon으로 표·칸 권한·정책·기본값·제약(23514·23505)·cascade·composite 바깥 키·두 번 실행·`contacts_import`(고치기·더하기·빈 키 그대로·장비 맞추기·한 줄 틀리면 전부 그대로·데스크/대기 실패·security invoker·실행 권한) |
| `src/lib/contacts/fields.test.ts`·`plan.test.ts`·`warranty.test.ts`·`search.test.ts`·`categories.test.ts` (TASK-2) | AC-6503.1~8 ('예' 숫자) |
| `src/lib/contacts/source.test.ts` (TASK-2) | AC-6503.9: `src/lib/contacts/**` 소스 글자에 supabase·`lib/storage`·react·next·fetch·localStorage·sessionStorage·indexedDB·`lib/parsers` 등 없음, eslint 구역 목록에 `src/lib/contacts` 없음 |
| `src/lib/errors.test.ts` (TASK-2) | 오류 번호 아홉이 있고 글이 비지 않음 |
| `src/lib/storage/contacts.test.ts` (TASK-3) | AC-6502.1~4: 가짜 client로 보내는 표·칸·몸통이 정해 둔 것과 똑같은지(`id`·`hospital_id` 없음), 나눠 읽기, 틀린 줄 빼기, invalid·duplicate·offline·failed, 오류에 입력값·Supabase 문구 없음, rpc 이름·인자, 알림 기간 |
| `src/components/contacts/parts/*.test.tsx` (TASK-4) | AC-6505.2~7 (props로 그린 글자·링크·복사·가림·확인) |
| `src/lib/contacts/workbook.test.ts`·`template.test.ts` (TASK-5) | AC-6504.1~3: 시험이 `xlsx`로 만든 가짜 파일(쓰는 법에 같은 머리글 예시 · 다른 이름 시트 · 장비 시트 없음 · 깨진 바이트 · 큰 파일 · 줄 수 넘침)과 저장소 양식 파일 |
| `src/vercel-config.test.ts`·`fixtures/make-fake-fixtures.test.ts` (TASK-5) | AC-6504.4 |
| `src/components/contacts/import/ImportPanel.test.tsx`·`ImportPreview.test.tsx` (TASK-5) | AC-6506.1~4 (fetch·Supabase를 흉내 내 미리 보기까지 부르지 않음을 본다) |
| `src/components/dashboard/warranty/WarrantyNotice.test.tsx`·`src/app/(app)/dashboard/page.test.tsx` (TASK-6) | AC-6507.1~2 (가짜 시계·저장 함수) |
| `src/components/contacts/ContactsScreen.test.tsx`·`useContacts.test.ts`·`src/app/(app)/contacts/page.test.tsx`·메뉴 고정 시험들 (TASK-7) | AC-6505.1·4·5, AC-6506.3, AC-6508.1~3 |

## 위험
- 사용자가 SQL을 붙이기 전에 웹을 올리면 주소록 탭이 읽기 실패 카드, 대시보드 알림은 비어 있다(대시보드는 그대로) → SQL 먼저(tasks.md 사용자 단계).
- 엑셀 날짜를 글자 칸(`@`)에 `2026-1-5`처럼 적으면 글자로 오고 `parseDateCell`이 읽는다. `26/1/5`처럼 해 두 자리는 '날짜 틀림'이다(달을 추측하지 않는다).
- 휴대폰·사업자번호를 숫자 칸에 적어 앞 0이 사라지면 그대로 들어간다(사용자 결정). 양식은 그 칸들을 글자 서식으로 두었다.
- 두 PC가 같은 업체를 동시에 고치면 나중 저장이 이긴다(기록 없음).
- `.gitignore`에 엑셀 되살리기 줄이 하나 생긴다. 그 자리에 실제 업체 자료가 든 파일을 덮어쓰면 커밋될 수 있다 → AC-6504.3이 두 시트에 머리글 줄만 있는지 본다.

## 배포 순서
1. 모든 TASK를 합친 뒤 전체 검사(`npm test`·`npm run lint`·`npm run build`, ssk-finish-check)와 독립 검토 한 번.
2. 사용자: Supabase SQL Editor에 `supabase/migrations/20261121000000_contacts.sql` 전체를 붙여 넣고 Run(ssk-supabase-sql). Claude는 실제 Supabase에 붙지 않는다.
3. 웹 배포는 **사용자가 말할 때만**(ssk-deploy). 도우미·확장 새 판은 없다.
