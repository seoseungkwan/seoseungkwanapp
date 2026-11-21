# 설계: 주소록

> 화면 글자·자리·모양은 승인된 시안(`docs/mockups/contacts/`)과 requirements.md '화면 글자'가 기준이다. 이 문서는 자료·함수·나눔을 정한다.

## 흐름
```
[원장 PC] ContactsScreen ─ useContacts ─(lib/storage/contacts.ts, RLS 내 병원)→ Supabase contacts_companies · contacts_people · contacts_equipment · contacts_repairs
          화면을 열 때 loadContacts 한 번(네 표 다 읽음) → 고치면 그 줄 저장 함수 → 손에 든 주소록을 그 답으로 바꿈
          찾기·남은 날·글자 모양은 lib/contacts 순수 함수(searchCompanies · warrantyState · phoneText …)
[엑셀 올리기] 파일 고르기(.xlsx) → (브라우저) readContactsFile(바이트, xlsx 늦은 불러오기) → buildImportPlan(줄, 지금 주소록) → 미리 보기(주소록 자리)
          [넣기] → importContacts → rpc('contacts_import', {p}) 한 번(한 트랜잭션) → 되면 loadContacts 다시 → 목록 위 초록 줄
[양식 받기] <a href="/contacts/contacts-template.xlsx" download="주소록-양식.xlsx"> (public/ 정적 파일, 서버 코드 없음) → 알림
[대시보드] LiveDashboard ─ useWarrantySoon(today) ─ listWarrantySoon(오늘~오늘+30, 10초 한도, 한 번)
          → BitDashboard notice → DashboardHome의 '맨 위 줄 바로 아래' 자리에 WarrantyNotice(items, today)
[데스크]   탭 없음(DESK_MENU 그대로) · /contacts는 DeskGate 막힌 화면 · RLS는 my_hospital_id() null → 0줄
```
- 서버 코드(`app/api/ai/`)는 늘지 않는다. 브라우저 + RLS + 부른 사람 권한 DB 함수 하나(ADR-004). AI 경로는 이 표들을 읽지 않는다.
- CSP(`src/lib/csp.ts`)·`next.config.ts`·`middleware.ts`는 그대로다. 정적 양식 파일은 로그인한 사람만 받는다(middleware matcher가 `/contacts/…`를 거치게 하고 로그인 안 했으면 `/login`).
- 이름 주의: 저장소의 `contact`(단수)는 환자 문자 연락(`contact.targets`·`lib/storage/contactCounts.ts`·도우미 `Contact/`)이다. 주소록은 늘 복수 `contacts`(표 `contacts_*`, `lib/contacts`, `lib/storage/contacts.ts`, `components/contacts`)로 쓴다.

## 어디에 두나 — 환자 자료 구역 밖
- 주소록 엑셀·표에는 **환자 정보가 없다**(업체·담당자·장비·수리 기록). 환자 파일 규칙("환자 파일은 Web Worker 안에서만")의 대상이 아니라서 화면 쪽(메인 스레드)에서 읽는다. 파일이 작고(5MB·3,000줄까지) 한 번만 읽기 때문에 Worker도 쓰지 않는다.
- 순수 함수와 엑셀 읽기는 **새 폴더 `src/lib/contacts/`**에 둔다. eslint 환자 자료 구역 목록(`eslint.config.mjs`의 `src/lib/parsers/**` … `src/workers/**`)에 **넣지 않고**, `lib/parsers`(비트 파일 읽기)도 불러오지 않는다. 이유: (1) 그 구역은 "환자 자료가 있는 곳"이라는 표시라 환자 자료가 없는 코드를 넣으면 경계가 흐려진다. (2) `lib/parsers/common.ts`를 같이 쓰면 비트 파일 규칙을 바꿀 때 주소록이 딸려 바뀐다. (3) 구역 밖이어도 이 폴더는 순수 함수만 둔다 — supabase·`lib/storage`·React·Next·네트워크·브라우저 저장소를 쓰지 않는다(AC-6503.11을 시험이 소스 글자로 본다. 새 eslint 규칙은 만들지 않는다).
- 날짜는 `lib/analytics/dates.ts`(`parseDateCell`·`diffDays`·`addDays`·`todayInKorea`)만 불러온다. 구역 밖에서 그 파일을 부르는 것은 이미 하는 일이다(`lib/storage/calendar.ts`의 `isYmd`).
- `xlsx`는 `workbook.ts` 안에서 `await import('xlsx')`(고정 경로 늦은 불러오기)로만 불러 첫 화면 JS에 싣지 않는다.
- 받침 조사(`particle`)는 `lib/contacts/korean.ts`에 따로 둔다(`components/stats/periodPick.ts`의 `hasFinal`과 같은 셈이지만 lib가 components를 부르지 않게).
- 저장(`lib/storage/contacts.ts`)과 화면(`components/contacts/`)은 지금 다른 탭과 같은 자리다.

## 이 명세가 정한 것 (Claude 판단 — 시안이 정하지 않은 곳만)
- 글자 견주기: 앞뒤 빈칸을 빼고 유니코드 NFC로 맞춘다(맥·윈도우 한글 조합 차이). 업체·담당자·장비 이름 견주기는 가운데 빈칸·대소문자를 그대로 본다(찾기만 띄어쓰기·영문 대소문자 무시).
- 같은 업체 안 같은 담당자 이름은 DB가 막는다(이미 정한 것 4). 화면에서 겹치면 `같은 이름의 담당자가 이미 있어요.`(시안 업체 글 모양).
- **장비에는 겹침 제약이 없다**(같은 이름·같은 일련번호도 둘 수 있음 — 시안에 장비 겹침 글이 없다). 그 대신 엑셀이 고칠 장비를 하나로 못 고르면 '넣지 않는 줄'(`which-equipment`)이다.
- 넣기 함수는 장비를 이름으로 찾지 않고 **계획이 고른 장비 id**로 고친다(브라우저 계획과 DB가 다르게 맞출 일이 없다). 업체·담당자는 겹칠 수 없는 이름으로 찾는다.
- 무상 수리 끝나는 날이 들여온 날보다 앞서도 받는다(시안에 그 글이 없다. DB 검사도 없음).
- 글자 수 한도를 넘는 엑셀 칸은 '넣지 않는 줄'(`too-long`). 화면 칸은 한도를 넘게 칠 수 없다(`maxLength`).
- 미리 보기는 칸 값을 하나도 보이지 않는다(칸 이름만). 그래서 비밀번호·계좌도 보이지 않는다. 까닭 글의 `'{값}'`은 분류·날짜 칸 값뿐이다.
- 몸통이 비면(새로 0·바뀜 0) [넣기]는 꺼져 있다. 넣은 뒤 알림에서 넣지 않은 줄이 0이면 뒤 문장을 뺀다.
- 업체를 저장하면 판을 닫고 그 업체 자세히를 연다.
- 대시보드 알림은 읽기 실패를 조용히 넘긴다(오류 카드 없음) — 대시보드의 본 일(숫자)을 가리지 않게. 읽기는 LiveDashboard가 한 번 한다(비트 다시 읽기로 BitDashboard가 다시 놓여도 다시 읽지 않음).
- 폰 전용 배치 없음(사용자 규칙 2026-11-21): 목록·자세히 두 칸 틀에 최소 폭 720px(768px 화면에서 앱 틀 좌우 여백 24px씩을 뺀 폭)를 두고, 그보다 좁으면 그 틀을 감싼 칸 안에서만 옆으로 밀린다(`overflow-x: auto`. 앱 `body`의 `overflow-x: clip`은 그대로). 768px 이상에서는 시안과 같은 모양이다. `max-md:` 같은 폰 전용 모양 줄을 쓰지 않는다.

## ADR-034 (TASK-1이 `docs/ADR.md` 끝에 넣는 글. 다른 갈래가 먼저 034를 쓰면 다음 번호로 바꾸고 이 글의 번호만 고친다)
### ADR-034: 주소록 — 사이트 비밀번호·계좌를 잠그지 않고 다른 칸처럼 서버에 둔다
**맥락**: 주소록(`specs/contacts`)에는 업체 사이트 아이디·비밀번호와 계좌가 들어간다. 2026-11-21 인터뷰에서 사용자는 잠금 번호(따로 정한 번호로 브라우저에서 잠그고 볼 때 풀기)를 고르다가 "그냥 잠그지 마"로 정했다. 의원 계정은 접수·치료실·진료실 PC에 로그인돼 있어 그 PC 앞에 앉은 누구나 [보기]로 볼 수 있다는 점을 듣고 정했다. 이 값들은 우리 서비스의 비밀값(Supabase 키·API 열쇠, `CLAUDE.md` 보안 규칙)이 아니라 사용자가 적는 업체 자료다
**결정** (사용자, `specs/contacts`):
- 사이트 비밀번호(`site_pw`)·계좌(`account`)는 `contacts_companies`의 다른 칸과 똑같이 글자로 저장한다. 앱이 따로 암호화하지 않는다(Supabase 저장소 자체 암호화만)
- 읽기·쓰기는 RLS로 승인된 내 병원 **원장 계정만**(`my_hospital_id()`). 데스크 계정(ADR-031)·다른 병원·anon은 0줄. AI 경로로 보내지 않고, 로그·오류 글에 담지 않는다
- 화면은 평소 `●●●●●●`로 가리고 [보기]를 누른 칸만 보인다(다른 업체로 옮기거나 화면을 떠나면 다시 가림). 엑셀 미리 보기는 칸 값을 보이지 않는다. 엑셀 양식 `쓰는 법`에 "다 올린 뒤에는 지우거나 잘 보관하세요"가 있다
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
| | `category` | text not null(기본값 없음), in (`'supplier'`,`'repair'`,`'agency'`,`'other'`) = 거래처·수리·관리·기관·보험·기타 |
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
| | 제약 | unique (`hospital_id`, `id`) · 색인 (`company_id`) · 색인 (`hospital_id`, `warranty_until`). 이름·일련번호 겹침 제약 없음 |
| `contacts_repairs` | `id`, `hospital_id`, `created_at` | 위와 같음 |
| | `equipment_id` | uuid not null, (`hospital_id`, `equipment_id`) → `contacts_equipment(hospital_id, id)` on delete cascade |
| | `day` | date not null |
| | `content` | text not null, 1~200자, 빈칸 없음 |
| | `cost` | bigint null, 0 ~ 9,999,999,999(원 정수, 비움 = 모름. 화면은 숫자 10자리까지) |
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
  "equipment": [{ "id": "…(고칠 때만)", "company": "예시메디칼", "name": "충격파 기계", "serial": "0000-0001", "bought_on": "2026-01-05", "warranty_until": "2028-01-04" }] }
```
  - 꼭 있는 키: 업체 `name` · 담당자 `company`·`name` · 장비 `company`·`name`. 나머지는 선택(장비 `id`는 고칠 때만).
- 검사(틀리면 raise): `p`가 객체, 세 키가 배열(없으면 빈 배열로 봄), 업체 2,000 · 담당자 2,000 · 장비 1,000줄까지, 각 줄이 객체이고 꼭 있는 키가 글자, 장비 `id`가 있으면 uuid 글자.
- 차례: (1) 업체 — 내 병원에 그 `name`이 있으면 몸통에 있는 칸만 `update`(칸마다 `c ? 'phone'`이면 새 값 아니면 지금 값), 없으면 `insert`(`category`가 없으면 not null로 실패). `insert … on conflict`를 쓰지 않는다(이미 있는 업체를 분류 없이 고칠 때 not null 검사가 먼저 걸리므로). (2) 담당자 — `company` 이름으로 내 병원 업체 id를 찾고(없으면 raise) (업체, `name`)이 있으면 몸통 칸만 고치고 없으면 넣는다. (3) 장비 — `company`로 업체 id를 찾고, `id`가 있으면 `where id = … and company_id = 그 업체`로 몸통 칸만 고친다(`serial`·`bought_on`·`warranty_until`, 키가 있을 때만. 고친 줄이 없으면 raise). `id`가 없으면 넣는다(`serial` 없으면 `''`).

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
export type ContactBook = { companies: Company[]; people: Person[]; equipment: Equipment[]; repairs: Repair[] } // 줄마다 created_at, id 차례
// 넣기 함수 몸통(키 = DB 칸 이름, '넣기 함수')
export type ImportCompany = { name: string; category?: ContactCategory; phone?: string; work?: string; address?: string; homepage?: string
  biz_no?: string; account?: string; site_id?: string; site_pw?: string; memo?: string }
export type ImportPerson = { company: string; name: string; mobile?: string; role?: string }
export type ImportEquipment = { id?: string; company: string; name: string; serial?: string; bought_on?: string; warranty_until?: string }
export type ImportPayload = { companies: ImportCompany[]; people: ImportPerson[]; equipment: ImportEquipment[] }
export type WarrantyItem = { equipmentId: string; companyId: string; companyName: string; name: string; warrantyUntil: string }
```

## 순수 함수 (`src/lib/contacts/`, TASK-2 — 구역 밖, 순수)
- `categories.ts`: `CONTACT_CATEGORIES = [{ id: 'supplier', label: '거래처' }, { id: 'repair', label: '수리·관리' }, { id: 'agency', label: '기관·보험' }, { id: 'other', label: '기타' }] as const`(이 차례가 목록 묶음·칩 차례) · `categoryOf(label)` → id | null · `categoryLabel(id)`
- `fields.ts`: `CONTACT_LIMITS`(위 'DB' 표 글자 수 그대로, 화면 `maxLength`도 이것) · `FIELD_LABELS`(칸 이름 = requirements.md '화면 글자': 업체 칸은 양식 머리글과 같고, 담당자 `이름`·`휴대폰`·`맡은 일`, 장비 `장비 이름`·`일련번호`·`들여온 날`·`무상 수리 끝나는 날`, 수리 기록 `날짜`·`내용`·`비용`) · `cleanText(s)`(앞뒤 빈칸 빼고 NFC) · `textLength(s)`(코드포인트 수) · `companyProblems(fields)` · `personProblems` · `equipmentProblems`(날짜 모양 'date') · `repairProblems`(날짜 필수, 내용 1~200, 비용 'money') → `{ field, reason: 'empty'|'too-long'|'date'|'money' }[]` · `parseWon(text)` → number | null | 'bad'(쉼표·빈칸 허용, 0 이상 정수, 9,999,999,999 이하) · `wonText(n)`(천 단위 쉼표) · `phoneText(value)`(AC-6503.10) · `telHref(value)`(숫자와 맨 앞 `+`만, 숫자가 없으면 null) · `homepageHref(value)`(`http://`·`https://`(대소문자 무시)로 시작하면 그대로, 아니면 `https://` + 값, 빈 값은 null)
- `korean.ts`: `particle(word, '을/를' | '은/는' | '이/가')`(끝 글자가 한글 음절이고 받침이 없으면 뒤 글자, 그 밖은 앞 글자)
- `sheet.ts`: `GUIDE_SHEET = '쓰는 법'` · `CONTACT_SHEET = '연락처'` · `EQUIPMENT_SHEET = '장비'` · `CONTACT_HEADERS`(14개, requirements.md 이미 정한 것 10번 차례 그대로) · `EQUIPMENT_HEADERS`(5개) · `ContactKey = 'category'|'name'|'phone'|'work'|'address'|'homepage'|'bizNo'|'account'|'siteId'|'sitePw'|'memo'|'personName'|'personMobile'|'personRole'` · `EquipmentKey = 'company'|'name'|'serial'|'boughtOn'|'warrantyUntil'`(머리글과 같은 차례) · `type Cell = string | number | boolean | null` · `mapHeaders(cells: Cell[], headers: readonly string[])` → 머리글마다 칸 자리 `number[]` | null · `type SheetRows = { contacts: { row: number; cells: Record<ContactKey, Cell> }[]; equipment: { row: number; cells: Record<EquipmentKey, Cell> }[] }`(적힌 줄만, `row` = 엑셀 줄 번호, 머리글 = 1)
- `plan.ts`: `buildImportPlan(rows: SheetRows, book: ContactBook)` → `ImportPlan`
  ```ts
  type ProblemReason = 'category' | 'no-category' | 'no-company' | 'no-person-name' | 'same-person' // 연락처
    | 'unknown-company' | 'no-equipment-name' | 'date' | 'which-equipment'                       // 장비 (no-company도)
    | 'too-long'                                                                                 // 둘 다
  type RowProblem = { sheet: 'contacts' | 'equipment'; row: number; reason: ProblemReason
    company: string; item: string // 업체 이름 · 담당자/장비 이름(없으면 '')
    field: string | null; value: string; limit: number | null } // field = 머리글 글자, value = 분류·날짜 칸 값(그 밖 ''), limit = too-long 한도
  type ItemChange = { name: string; fields: string[] } // fields = 칸 이름(FIELD_LABELS)
  type CompanyChange = { name: string; status: 'new' | 'changed' | 'same'; category: ContactCategory; work: string
    fields: string[]; peopleAdded: number; equipmentAdded: number; peopleChanged: ItemChange[]; equipmentChanged: ItemChange[] }
  type ImportPlan = { counts: { contacts: number; equipment: number } // 적힌 줄 수
    changes: CompanyChange[]; untouched: string[] // 주소록에 있는데 엑셀에 없는 업체 이름(가나다)
    problems: RowProblem[]; payload: ImportPayload }
  ```
  - 칸 값 읽기: 글자 칸 = `typeof v === 'string'`이면 `cleanText(v)`, 숫자·참거짓이면 `cleanText(String(v))`(앞자리 0을 되살리지 않음), null → ''. 날짜 칸 = 비면 null, 아니면 `parseDateCell(v)`(엑셀 날짜 숫자 · `YYYY-MM-DD`·`YYYY.MM.DD`·`YYYY/MM/DD`), 못 읽으면 'date'. 분류 = 비면 없음, `categoryOf`가 null이면 'category'.
  - `연락처` 줄 검사 차례(첫 까닭 하나): `no-company` → `too-long`(업체 이름) → `category` → `too-long`(나머지 칸, 머리글 차례) → `no-person-name`(담당자 이름이 비었는데 휴대폰·맡은 일 가운데 하나가 있음). 틀린 줄은 묶기·업체 칸 고르기에 들지 않는다.
  - 묶기: 남은 줄을 업체 이름으로 묶는다(엑셀에 처음 나온 차례). 같은 업체에 같은 담당자 이름 줄이 또 나오면 그 뒤 줄은 `same-person`(첫 줄만 넣음, 뒤 줄의 업체 칸도 쓰지 않음). 업체 칸은 그 업체 남은 줄에서 처음 나온 빈칸 아닌 값. 새 업체인데 분류가 어느 남은 줄에도 없으면 그 업체 남은 줄 모두 `no-category`(업체를 넣지 않음).
  - `장비` 줄 검사 차례: `no-company` → `unknown-company`(업체가 '넣는 업체' ∪ 주소록 업체에 없음) → `no-equipment-name` → `too-long`(머리글 차례) → `date`(들여온 날 → 무상 수리 끝나는 날). 남은 줄은 (업체, 장비 이름, 일련번호)가 같으면 한 묶음(칸마다 처음 빈칸 아닌 값)이고 '장비 맞추기'로 고칠 장비를 고른다(`which-equipment`면 그 묶음의 줄 모두 넣지 않는 줄).
  - **장비 맞추기**(묶음마다 지금 주소록과만 견준다. 이름 = 같은 업체·같은 장비 이름 장비, 일련번호 S):
    - S가 있으면: ① 일련번호 S인 것 — 하나면 그것, 둘 이상이면 `which-equipment`. ② 없으면 일련번호 빈 것 — 하나면 그것(S를 채움), 둘 이상이면 `which-equipment`. ③ 없으면 새 장비.
    - S가 비면: ④ 일련번호 빈 것 — 하나면 그것, 둘 이상이면 `which-equipment`. ⑤ 없으면 같은 이름 장비 — 하나면 그것(일련번호는 그대로), 둘 이상이면 `which-equipment`. ⑥ 없으면 새 장비.
    - 두 묶음이 같은 주소록 장비를 고르면 엑셀에서 먼저 나온 묶음이 갖고, 뒤 묶음은 S가 있으면 새 장비, 비면 `which-equipment`.
  - 견주기: 업체 = 이름이 주소록에 없으면 `new`(몸통에 빈칸 아닌 칸 모두 + `category`), 있으면 빈칸 아닌 엑셀 값이 지금 값과 다른 칸만 `fields`·몸통. 담당자 = (업체, 이름)이 없으면 더함(`peopleAdded`, 몸통에 빈칸 아닌 칸), 있으면 빈칸 아닌 값이 다른 `휴대폰`·`맡은 일`만 `peopleChanged`·몸통. 장비 = 고른 장비가 없으면 더함(`equipmentAdded`), 있으면 빈칸 아닌 값이 다른 `일련번호`·`들여온 날`·`무상 수리 끝나는 날`만 `equipmentChanged`·몸통(`id` 포함). 셋 다 바뀐 것이 없으면 `same`. `장비` 시트에만 나온 주소록 업체도 장비가 바뀌면 `changed`(changes 끝에). 몸통의 업체 줄은 `new`이거나 업체 칸이 바뀐 것만, 담당자·장비 줄은 더하거나 바뀐 것만.
  - `isEmptyPayload(p)` → 세 배열이 모두 비었는지.
- `warranty.ts`: `WARRANTY_SOON_DAYS = 30` · `warrantyState(until: string | null, today: string)` → `{ kind: 'none' } | { kind: 'ended' } | { kind: 'soon'; days: number } | { kind: 'later'; days: number }`(days = `diffDays(today, until)`) · `soonestWarranty(equipment: Equipment[], today)` → `{ days: number } | null`
- `search.ts`: `normalizeQuery(s)`(NFC · 영문 소문자 · 띄어쓰기 모두 뺌) · `searchCompanies(book, query, category: ContactCategory | 'all')` → `{ company: Company; people: string[]; equipment: string[] }[]`(AC-6503.9, `people`·`equipment` = 찾은 담당자·장비 이름, 빈 찾는 말이면 빈 목록) · `highlightParts(text, query)` → `{ text: string; hit: boolean }[]` · `countByCategory(results)` → `{ all: number } & Record<ContactCategory, number>`
- 쓰는 날짜는 모두 한국 날짜 글자 `'YYYY-MM-DD'`. 오늘은 부르는 쪽이 `todayInKorea()`로 넘긴다(순수 함수는 시계를 읽지 않음).

## 엑셀 읽기 (`src/lib/contacts/workbook.ts`, TASK-5)
- `readContactsFile(bytes: Uint8Array)` → `SheetRows | 'big' | 'not-xlsx' | 'locked' | 'form' | 'empty'`
  - 5,000,000바이트 넘으면 'big'(읽기 전).
  - 앞 4바이트가 zip(`50 4B 03 04`)이 아니면: OLE 묶음(`D0 CF 11 E0`)이고 `XLSX.CFB.read`로 본 안에 `EncryptionInfo`·`EncryptedPackage`가 있으면 'locked'(비밀번호 걸린 xlsx는 이 모양이다), 그 밖은 'not-xlsx'(`.xls`·글 파일 포함).
  - `const XLSX = await import('xlsx')`, `XLSX.read(bytes, { type: 'array', cellDates: false, dense: false })`가 던지면 'not-xlsx'.
  - `wb.SheetNames`에서 **이름이 꼭 `연락처`·`장비`인 시트만** 고른다(머리글로 시트를 찾지 않는다 — `쓰는 법`에 같은 머리글 예시 표가 있다). 둘 가운데 하나라도 없으면 'form'.
  - 시트마다 `sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true })` → 첫 줄을 `mapHeaders`(null이면 'form'), 줄 번호 = 시트 범위 시작 줄 + 차례(엑셀 줄 번호). 칸 값은 `Cell`로만(날짜 칸은 숫자로 온다 — `cellDates: false`). 모든 칸이 null·빈 글자인 줄은 뺀다.
  - 적힌 줄이 연락처 2,000·장비 1,000을 넘으면 'big', 두 시트 모두 0이면 'empty'.
  - 파일 이름·내용은 어디에도 보내지 않고 저장하지 않는다(브라우저 메모리에서 미리 보기 동안만). 파일 이름 끝 `.xlsx` 검사는 부르는 화면(`readUpload`)이 한다.

## 양식 파일 (TASK-5)
- 바탕화면 `주소록-양식.xlsx`를 만든 것과 같은 스크립트로 **빈 양식을 새로 만들어** `public/contacts/contacts-template.xlsx`에 넣는다(시트·머리글·분류 목록·예시가 바탕화면 양식과 같음). 바탕화면 파일은 사용자가 실제 업체·비밀번호를 채우는 중일 수 있어 복사하지 않는다(2026-11-21). 앱은 브라우저에서 양식을 만들지 않는다.
- 저장소에 엑셀 파일은 `.gitignore`·`.vercelignore`가 막는다(실제 EMR 파일 울타리). 엑셀 줄 뒤에 `!public/contacts/contacts-template.xlsx` 한 줄씩만 더한다(글롭 없음). 되살리기를 고정한 시험 둘을 맞춘다: `src/vercel-config.test.ts`(`.vercelignore` 줄 목록에 그 한 줄, 되살리기 허용 자리에 그 **파일 하나**를 더함 — 폴더가 아니다), `fixtures/make-fake-fixtures.test.ts`(`.gitignore` 되살리기 목록에 그 한 줄). 가짜 견본 폴더 `public/fake-sample/`에 넣지 않는 까닭: 그 폴더는 가짜 비트 파일 생성기 몫이고 시험이 그 안 파일을 `bit-sample.csv` 하나로 고정한다.
- 시험 `src/lib/contacts/template.test.ts`(AC-6504.3): 파일을 `xlsx`로 읽어 시트 이름 차례 · 두 시트 첫 줄 = `CONTACT_HEADERS`·`EQUIPMENT_HEADERS` · 두 시트에 머리글 줄만 · `연락처` 시트 XML(`XLSX.CFB`로 `/xl/worksheets/…` 찾기)의 `<dataValidation … type="list"` 목록 글자가 `"거래처,수리·관리,기관·보험,기타"`(= `CONTACT_CATEGORIES` 글자를 쉼표로 이음)이고 범위가 A열 · `readContactsFile` → `'empty'`.
- 만든 스크립트(scratchpad `make_contacts_template.py`, openpyxl)는 **저장소에 넣지 않는다**: 이 저장소에 openpyxl이 없고 시험도 없다. 양식을 고칠 때는 엑셀 파일을 직접 고쳐 다시 복사하고, 위 시험이 머리글이 코드와 같은지 지킨다.

## 저장 함수 (`src/lib/storage/contacts.ts`, TASK-3)
- 본보기 `lib/storage/calendar.ts`: `type Client = Pick<SupabaseClient, 'from' | 'rpc'>`, `class ContactsStorageError(kind: 'offline' | 'failed')`(이름 `ContactsStorageError`, 글은 `contacts storage {kind}`만), `navigator.onLine === false` → offline, 응답 없음(status 0) → offline, 던짐·그 밖 오류 → failed. Supabase 문구·입력값은 오류에 담지 않는다.
- 읽기: `loadContacts(client)` → `ContactBook`. 표마다 정해 둔 칸만 select(`contacts_companies`: `id,category,name,phone,work,address,homepage,biz_no,account,site_id,site_pw,memo` / `contacts_people`: `id,company_id,name,mobile,role` / `contacts_equipment`: `id,company_id,name,serial,bought_on,warranty_until` / `contacts_repairs`: `id,equipment_id,day,content,cost`), `created_at, id` 차례로 1,000줄씩 `range`로 나눠 다 읽는다. 줄마다 칸 모양을 보고(글자·날짜·분류·비용 정수) 틀린 줄은 뺀다.
- 쓰기(보내는 몸통은 정해 둔 칸을 골라 새로 만든다, `{ ...값 }` 금지): `addCompany(client, fields)` · `updateCompany(client, id, fields)` → `Company | 'invalid' | 'duplicate'` · `deleteCompany(client, id)` · `addPerson(client, companyId, fields)` · `updatePerson(client, id, fields)` → `Person | 'invalid' | 'duplicate'` · `deletePerson` · `addEquipment(client, companyId, fields)` · `updateEquipment` → `Equipment | 'invalid'` · `deleteEquipment` · `addRepair(client, equipmentId, fields)` · `updateRepair` → `Repair | 'invalid'` · `deleteRepair`. 글자는 `cleanText`로 맞추고 `…Problems`가 비지 않으면 보내지 않고 `'invalid'`. 답 줄은 읽기와 같은 검사(틀리면 failed). 업체·담당자의 23505 → `'duplicate'`.
- `importContacts(client, payload: ImportPayload)` → void: `client.rpc('contacts_import', { p: payload })` 하나. 몸통은 그대로 넘긴다(계획이 만든 것).
- `listWarrantySoon(client, today)` → `WarrantyItem[]`: `contacts_equipment`에서 `id,company_id,name,warranty_until`을 `warranty_until`이 `today` 이상 `addDays(today, 30)` 이하인 줄만 `warranty_until`·`name` 차례로 읽고, 그 `company_id`들의 `contacts_companies`를 `id,name`만 읽어 업체 이름을 붙인다(업체가 안 보이는 줄은 뺀다). 사이트 비밀번호·계좌 칸을 읽지 않는다.

## 화면 (`src/components/contacts/`, 모양은 앱 토큰·`components/ui/classes.ts`, 글·자리·모양은 시안)
- 공통: 폰 전용 모양 없음('이 명세가 정한 것' 마지막). 번호 누르기만 기기로 가른다: `matchMedia('(hover: none) and (pointer: coarse)')`(업무일지 `TOUCH_QUERY`와 같은 글)가 참이면 `tel:` 링크, 아니면 복사 단추. 폭(`md:` 등)으로 가르지 않는다.
- `parts/`(TASK-4, props·콜백만, 저장·읽기·Supabase·`lib/storage` 없음). 파일 이름·나눔은 TASK-4가 시안을 보고 정한다. 들 것:
  - 머리 줄(h1 `주소록`·`업체 {n}곳`, 단추 자리 `actions`) · 찾기 칸([×]) · 분류 칩(`countByCategory`) · 목록(시안 기본값 2·3·4, `highlightParts`, 찾은 곳 줄, 결과 없음·고른 분류에 없음) · 오른쪽 빈 자리(`업체를 골라 주세요`) · 빈 주소록(단추 자리 `actions`).
  - 자세히(시안 기본값 5·6, 1200px 이상 두 칸) · 번호(`phoneText`·`telHref`, 위 공통, 1.6초 `복사했어요`) · 가린 값(`●●●●●●`·[보기]/[가리기]·[복사], 고른 업체가 바뀌면 다시 가림) · [복사] · 홈페이지 링크(`homepageHref`, `target="_blank" rel="noopener noreferrer"`) · 무상 수리 칩(`warrantyState`·`soonestWarranty`).
  - 그 자리에서 고치는 칸(담당자·장비·수리 기록, 날짜 칸 `type="date"`, 비용은 숫자만·쉼표, `maxLength` = `CONTACT_LIMITS`) · 업체 판(오른쪽 판, 분류 단추 넷, 가린 두 칸) · 지우기 확인 창(업체·장비, `particle`) · 짧은 알림(`저장했어요.` 등).
  - 콜백은 `Promise<SaveResult>`를 돌려받는다: `type SaveResult = { ok: true; id?: string } | { ok: false; reason: 'duplicate' | 'failed' }`. 칸은 `reason`에 따라 겹침 글(칸 아래) 또는 `E-CONTACTS-SAVE-FAILED` 오류 카드를 보이고 적은 값을 그대로 둔다. 빈 필수 칸·겹침(손에 든 주소록으로 먼저 봄)은 콜백을 부르지 않는다.
- `import/`(TASK-5): `readUpload.ts`(`File` → 이름 끝 `.xlsx`가 아니면 `'not-xlsx'`, 아니면 `readContactsFile(new Uint8Array(await file.arrayBuffer()))`) · `UploadButton.tsx`(숨은 `<input type="file" accept=".xlsx">` + [엑셀 올리기], 고른 파일을 `onRead({ fileName, result })`로) · `TemplateLink.tsx`([양식 받기] 링크, 누르면 `onDownloaded()`) · `FileProblemDialog.tsx`(오류 6~9·파일 큼 창: 글은 `lib/errors.ts`, 파일 이름, [닫기]·[양식 받기]·[다른 파일 고르기]) · `ImportPreview.tsx`(plan·fileName을 받아 '화면 글자' 엑셀 미리 보기, `saving`·`failed`, `onCancel`·`onImport`) · `problemText.ts`(RowProblem → 까닭 글, `particle`) · `changeLabels.ts`(CompanyChange → 이름표 글) · `ImportDoneNotice.tsx`(초록 줄, [닫기]).
- `ContactsScreen.tsx` + `useContacts.ts`(TASK-7): `loadContacts` 한 번(늦은 답 버림, [다시 읽기]), 저장 함수 결과를 `SaveResult`로 바꿔 부품에 돌려줌('invalid' → failed로 보지 않고 부품이 먼저 막으므로 생기지 않음, 생기면 failed), 손에 든 주소록을 답으로 바꿈(지우기는 딸린 줄도 뺌), 고른 업체·찾는 말·칩·판·미리 보기·알림 상태, [넣기] → `importContacts` → `loadContacts` → 초록 줄. 미리 보기 동안은 목록·자세히 대신 `ImportPreview`. `client = useMemo(() => supabaseBrowser(), [])`(calendar 본보기). 오늘은 `todayInKorea()`. 두 칸 틀은 최소 폭 720px + 감싼 칸 `overflow-x: auto`. props `initialCompanyId?: string`(없는 id면 무시).
- `src/app/(app)/contacts/page.tsx`: `metadata.title = '주소록'`, `searchParams`(Promise, 본보기 `patients/page.tsx`)의 `c`가 글자 하나면 `<ContactsScreen initialCompanyId={c} />`, 아니면 `<ContactsScreen />`(준비 중 화면 대신). 앱 틀·문지기는 (app)/layout 그대로.

## 대시보드 알림 (TASK-6)
- `src/components/dashboard/warranty/useWarrantySoon.ts`('use client'): `useWarrantySoon(today)` → `WarrantyItem[]`. 처음 한 번 `listWarrantySoon(supabaseBrowser(), today)`를 10초 한도로 읽는다. 한도·실패·`supabaseBrowser`가 던짐·client에 `from`이 없음·떠난 뒤 늦은 답 → 빈 목록(오류를 밖으로 던지지 않고 console도 쓰지 않음). 다른 대시보드 시험(`tabFrame.test.tsx`·`titles.test.tsx` 등, supabase를 다르게 흉내 냄)이 고치지 않고 지나야 한다.
- `src/components/dashboard/warranty/WarrantyNotice.tsx`: props `items`·`today`. 0줄이면 null. 끝나는 날 이른 차례(같으면 장비 이름) 셋까지 줄 `{장비 이름} 무상 수리 {n}일 남음 · {업체 이름}`(0일 `오늘 끝나요`, 남은 날 글자 주황) + `주소록에서 보기` 링크 `/contacts?c={companyId}`, 넷 이상이면 넷째 줄 `무상 수리가 곧 끝나는 장비가 {n}개 더 있어요` 링크 `/contacts`. 묶음 `role="status"`·`aria-label="무상 수리 알림"`, 모양은 `UnreadableNote`와 같은 옅은 회색 바탕·폭(시안). 남은 날은 `warrantyState(warrantyUntil, today)`의 `soon` days(아니면 그 줄을 뺀다).
- 잇기: `LiveDashboard`가 `const warranty = useWarrantySoon(today)`를 부르고 `BitDashboard`에 `notice={<WarrantyNotice items={warranty} today={today} />}`를 넘긴다(LiveDashboard가 읽으므로 `key`로 BitDashboard가 다시 놓여도 다시 읽지 않는다). `BitDashboard`는 새 prop `notice?: ReactNode`를 `DashboardHome`에 그대로 넘긴다. `DashboardHome`은 새 prop `notice?: ReactNode`를 — 연결 뒤(report 있음)는 브리핑 칸의 `{report}` 바로 다음(머리 줄·RereadAlert·SavedRefreshAlert·UnreadableNote 다음, 읽는 중·실패는 그 블록 다음), 연결 전(비트·비트 아닌 EMR)은 날짜 줄 바로 다음·`BigSentence`/`EmrWaitSentence` 앞에 — 둔다. `dashboard/page.tsx`는 그대로.
- 언제 읽나: 대시보드를 열 때 한 번. 날짜가 바뀌거나 주소록을 고쳐도 다시 읽지 않는다(다음에 대시보드를 열 때 새로 읽음). 읽는 자료 = 끝나는 날이 오늘~오늘+30인 장비 줄과 그 업체 이름뿐. 데스크는 `/dashboard`가 DeskGate에서 수납일지로 바뀌어 그려지지 않고, 그려져도 RLS 0줄이다.
- `components/dashboard/imports.test.ts` 울타리(통계 화면·AI 리포트 부품 안 불러옴)에 걸리지 않는다(`lib/storage/contacts`·`lib/contacts/warranty`·`lib/supabase/browser`만 더 부름).

## 메뉴·준비 중 (TASK-7)
- `menu.ts`: 주소록 줄 `href: '/contacts'`, `ready: true`(primary false 그대로), `MenuHref`에 `'/contacts'`. `DESK_MENU`·`isDeskPath`는 그대로(데스크 막힘).
- `notReadyFeatures.ts`: `/contacts` 항목과 `NotReadyPath`의 `'/contacts'`를 뺀다. `features.ts`: 주소록 `status: 'ready'`(설명 글 그대로).
- 수를 고정한 시험(`shell.test.tsx`·`tabFrame.test.tsx`·`notReadyPages.test.tsx`·`notReadyFeatures.test.ts`·`features.test.ts`·`titles.test.tsx`·`notFound.test.tsx`)은 수와 주소록 줄만 맞춘다. `DashboardHome.test.tsx`는 기능 수를 목록에서 세므로 TASK-7이 고치지 않는다. `docs/UI_GUIDE.md`의 '화면이 아직 없는 탭' 줄에서 주소록을 빼고, 화면 목록에 '주소록: 폰 전용 모양 없음(사용자 규칙 2026-11-21), 두 칸 틀 최소 720px은 제 감싸개 안에서 옆으로'를 한 줄 더한다.

## 오류 번호 (TASK-2가 `src/types/errors.ts`·`src/lib/errors.ts`에 넣음. 글은 requirements.md '화면 글자'의 오류 문구·명세가 정한 글 그대로)
| 번호 | what | fix | 언제 |
|---|---|---|---|
| E-CONTACTS-READ-FAILED | `주소록을 읽지 못했어요` | `인터넷 연결을 확인하고 [다시 읽기]를 눌러 주세요` | 읽기 실패 |
| E-CONTACTS-SAVE-FAILED | `주소록을 바꾸지 못했어요` | `적은 값은 그대로예요. 인터넷 연결을 확인하고 다시 눌러 주세요` | 저장·지우기 실패 |
| E-CONTACTS-IMPORT-FAILED | `엑셀에서 넣지 못했어요. 주소록은 그대로예요` | `인터넷 연결을 확인하고 [넣기]를 다시 눌러 주세요` | [넣기] 실패 |
| E-CONTACTS-FILE-FORM | `주소록 양식이 아니에요` | `이 엑셀에서 주소록 양식의 시트와 칸 이름을 찾지 못했어요. [양식 받기]로 받은 엑셀에 적어서 올려 주세요.` | 'form'(창에 `시트 이름(연락처·장비)과 첫 줄 칸 이름은 바꾸지 말아 주세요.` 한 줄 더) |
| E-CONTACTS-FILE-NOT-XLSX | `엑셀 파일만 올릴 수 있어요` | `.xlsx 파일을 골라 주세요. [양식 받기]로 받은 파일에 적으면 돼요.` | 'not-xlsx' |
| E-CONTACTS-FILE-LOCKED | `비밀번호가 걸린 엑셀이에요` | `엑셀에서 비밀번호를 푼 뒤 다시 올려 주세요.` | 'locked' |
| E-CONTACTS-FILE-EMPTY | `엑셀에 적힌 업체가 없어요` | `'연락처' 시트에 사람마다 한 줄씩 적은 뒤 올려 주세요.` | 'empty' |
| E-CONTACTS-FILE-BIG | `엑셀 파일이 너무 커요` | `5MB, 연락처 2,000줄, 장비 1,000줄까지 올릴 수 있어요. 나눠서 올려 주세요.` | 'big' |
- 확인 창(파일 다섯)은 시안대로 제목 = what, 파일 이름, 본문 = fix다(창에는 오류 번호 줄을 따로 그리지 않는다 — 시안 모양). 읽기·저장·넣기 실패 셋은 앱 오류 카드(`ErrorCard`, 번호 보임)다.
- 칸 아래 글(오류 문구 1~5, 담당자 겹침, 바닥 글)은 오류 번호가 아니라 부품의 글 상수다(본보기 `components/calendar/AddPanel.tsx`의 `START_ERROR`).

## 예 (시험 숫자)
- 묶기: 연락처 줄 2 `거래처|예시메디칼|02-000-0000|…|김예시|010-0000-0000|영업`, 줄 3 `|예시메디칼|||…|이예시|010-0000-0001|수리 기사`, 줄 4 `수리·관리|예시설비|031-000-0000|…|박예시|…` → 업체 2(예시메디칼 분류 거래처·전화 02-000-0000, 담당자 김예시·이예시 / 예시설비 담당자 박예시). 줄 5 `기타| 예시메디칼 |099-…` → 같은 업체(앞뒤 빈칸), 분류·전화는 처음 값 그대로.
- 다시 올리기(주소록: 예시메디칼 전화 02-000-0000·메모 '매달 말에 주문'·담당자 김예시(010-0000-0000, 영업)): 엑셀 `예시메디칼` 전화 02-111-1111·메모 빈칸·담당자 김예시(휴대폰 빈칸, 맡은 일 '부장')·이예시 → `changed`, `fields` [대표 전화], `peopleChanged` [김예시: 맡은 일], `peopleAdded` 1. 몸통 `{ name: '예시메디칼', phone: '02-111-1111' }`(memo 키 없음), 사람 `{ company, name: '김예시', role: '부장' }`(mobile 키 없음)·`{ company, name: '이예시', mobile: '…', role: '…' }`. 엑셀에 없는 업체 예시설비는 `untouched`.
- 넣지 않는 줄: 분류 '병원' → category(값 '병원') · 업체 이름 빈칸에 전화만 → no-company · 새 업체 '예시상사' 두 줄 모두 분류 빔 → 두 줄 no-category · 담당자 이름 빈칸에 휴대폰만 → no-person-name · 같은 업체 김예시 두 줄 → 뒤 줄 same-person · 업체 이름 41자 → too-long(업체 이름, 40) · 장비: 업체 빔 → no-company · 업체 '없는상사'(연락처·주소록 둘 다 없음) → unknown-company · 장비 이름 빔 → no-equipment-name · 들여온 날 '2026-13-01' → date(들여온 날, '2026-13-01') · 연락처 줄이 category로 빠지고 주소록에도 없는 업체의 장비 → unknown-company. 끝나는 날 2026-01-01 < 들여온 날 2026-02-01은 넣는다.
- 숫자 칸: 대표 전화 `212345678`(숫자) → '212345678', 일련번호 `1001`(숫자) → '1001', 사업자번호 `1234567890` → '1234567890'.
- 날짜 칸: `46027`(엑셀 날짜) → 2026-01-05, '2026-01-05'·'2026.1.5'·'2026/01/05' → 2026-01-05, '26-01-05'·'2026년 1월 5일' → date.
- 장비 맞추기(주소록 예시메디칼: A 치료기/SN1, B 치료기/'', C 온열기/'', D 온열기/'', E 초음파기/SN9): 엑셀 치료기/SN1 → A · 치료기/SN2 → B(일련번호 SN2를 채움) · 치료기/'' → B · 온열기/'' → which-equipment · 온열기/SN3 → which-equipment · 초음파기/'' → E(일련번호 그대로) · 초음파기/SN8 → 새로 · 엑스레이/'' → 새로. 엑셀에 치료기/SN2·치료기/SN3 두 줄 → SN2는 B, SN3는 새로. 엑셀에 치료기/SN2·치료기/'' → SN2는 B, ''는 which-equipment.
- `warrantyState`(오늘 2026-11-21): null → none · 2026-11-20 → ended · 2026-11-21 → soon 0 · 2026-12-21 → soon 30 · 2026-12-22 → later 31. `soonestWarranty`([12일, 0일, 끝남]) → 0.
- `searchCompanies`: '메디' → 예시메디칼(업체 이름) · '김예' → 예시메디칼(people ['김예시']) · '충격 파'·'충격파' → 하는 일·품목에 '충격파 헤드'가 있는 업체 · 'ECG' = 'ecg' · '02-000' → 없음(전화는 안 찾음) · 분류 repair + '' → 예시설비만 · '' + all → 거래처 업체들 다음 수리·관리 업체들(묶음 안 가나다).
- `highlightParts('물리치료 기계, 충격파 헤드', '충격파')` → [물리치료 기계, ][충격파*][ 헤드] · `highlightParts('예시 메디칼', '시메')` → [예][시 메*][디칼].
- `phoneText`: '0212345678' → '02-1234-5678' · '021234567' → '02-123-4567' · '0311234567' → '031-123-4567' · '01012345678' → '010-1234-5678' · '212345678' → 그대로 · '02-000-0000' → 그대로. `particle('예시메디칼', '을/를')` → 을 · `particle('예시설비', '을/를')` → 를 · `particle('ABC', '이/가')` → 이.

## 시험 계획 (시험 이름에 AC ID)
| 파일 | 보는 것 |
|---|---|
| `supabase/contacts.rls.test.ts` (TASK-1) | AC-6501.1~6: PGlite에서 진짜 migration 사슬을 돌린다(auth → precheck_settings → desk.rls.test.ts가 쓰는 사슬(worklog 넷·stats_rx_groups 둘·sunap·calendar → desk_accounts) → 이 파일, 흉내 `auth.users`·JWT `sub`·`email`). 원장 A·B, 승인 대기·거절, 병원 없는 사용자, A의 데스크, anon으로 표·칸 권한·정책·기본값·제약(23514·23502·23505)·cascade·composite 바깥 키·두 번 실행·`contacts_import`(고치기·더하기·빈 키 그대로·장비 id 고치기·남의/없는 장비 id·한 줄 틀리면 전부 그대로·데스크/대기 실패·security invoker·실행 권한) |
| `src/lib/contacts/categories.test.ts`·`fields.test.ts`·`korean.test.ts`·`sheet.test.ts`·`plan.test.ts`·`warranty.test.ts`·`search.test.ts` (TASK-2) | AC-6503.1~10 ('예' 숫자) |
| `src/lib/contacts/source.test.ts` (TASK-2) | AC-6503.11: `src/lib/contacts/**` 소스 글자에 supabase·`lib/storage`·react·next·fetch·localStorage·sessionStorage·indexedDB·`lib/parsers` 등 없음, eslint 구역 목록에 `src/lib/contacts` 없음 |
| `src/lib/errors.test.ts` (TASK-2) | 오류 번호 여덟이 있고 what·fix가 위 표 글과 같음 |
| `src/lib/storage/contacts.test.ts` (TASK-3) | AC-6502.1~4: 가짜 client로 보내는 표·칸·몸통이 정해 둔 것과 똑같은지(`id`·`hospital_id` 없음), 나눠 읽기, 틀린 줄 빼기, invalid·duplicate(업체·담당자만)·offline·failed, 오류에 입력값·Supabase 문구 없음, rpc 이름·인자, 알림 기간·차례 |
| `src/components/contacts/parts/*.test.tsx` (TASK-4) | AC-6505.1~8의 부품 몫(props로 그린 글자·차례·감춤·칩·찾은 글자·링크·복사(마우스)/tel(터치, matchMedia 흉내)·가림과 다시 가림·판·칸·겹침 글·실패 카드·지우기 확인·빈 주소록). 폭으로 바뀌는 모양이 없는지(`max-md:` 없음) |
| `src/lib/contacts/workbook.test.ts`·`template.test.ts` (TASK-5) | AC-6504.1~3: 시험이 `xlsx`로 만든 가짜 파일(쓰는 법에 같은 머리글 예시 · 다른 이름 시트 · 장비 시트 없음 · 장비 시트 빔 · 머리글 빠짐 · zip 아님 · 암호 묶음 흉내(CFB에 `EncryptionInfo`) · 큰 파일 · 줄 수 넘침 · 두 시트 빔)과 저장소 양식 파일 |
| `src/vercel-config.test.ts`·`fixtures/make-fake-fixtures.test.ts` (TASK-5) | AC-6504.4 |
| `src/components/contacts/import/*.test.tsx`·`problemText.test.ts`·`changeLabels.test.ts` (TASK-5) | AC-6506.1~3 (까닭 글 열하나·받침, 이름표, 창 다섯, fetch·Supabase를 흉내 내 미리 보기까지 부르지 않음, 칸 값이 안 보임) |
| `src/components/dashboard/warranty/*.test.ts(x)`·`DashboardHome.test.tsx`·`BitDashboard.test.tsx`·`LiveDashboard.test.tsx`·`src/app/(app)/dashboard/page.test.tsx` (TASK-6) | AC-6507.1~2 (가짜 시계·저장 함수, 자리 넷: 숫자 뒤·읽는 중/실패·연결 전 비트·비트 아닌 EMR, 한 번만 읽음) |
| `src/components/contacts/ContactsScreen.test.tsx`·`useContacts.test.ts`·`src/app/(app)/contacts/page.test.tsx`·메뉴 고정 시험들 (TASK-7) | AC-6505.1~9 잇기, AC-6506.4, AC-6508.1~3 |

## 위험
- 사용자가 SQL을 붙이기 전에 웹을 올리면 주소록 탭이 읽기 실패 카드, 대시보드 알림은 비어 있다(대시보드는 그대로) → SQL 먼저(tasks.md 사용자 단계).
- 엑셀 날짜를 글자 칸(`@`)에 `2026-1-5`처럼 적으면 글자로 오고 `parseDateCell`이 읽는다. `26/1/5`처럼 해 두 자리는 '날짜 모양 틀림'이다(달을 추측하지 않는다).
- 휴대폰·사업자번호를 숫자 칸에 적어 앞 0이 사라지면 그대로 들어간다(사용자 결정). 양식은 그 칸들을 글자 서식으로 두었다.
- 장비는 겹침 제약이 없어 화면에서 같은 장비를 두 번 더할 수 있다. 그런 장비를 엑셀로 고치려 하면 `which-equipment`로 빠진다(화면에서 고침).
- 두 PC가 같은 업체를 동시에 고치면 나중 저장이 이긴다(기록 없음). 미리 보기 뒤 [넣기] 전에 다른 PC가 장비를 지우면 넣기 함수가 raise → `E-CONTACTS-IMPORT-FAILED`(다시 올리면 됨).
- `.gitignore`에 엑셀 되살리기 줄이 하나 생긴다. 그 자리에 실제 업체 자료가 든 파일을 덮어쓰면 커밋될 수 있다 → AC-6504.3이 두 시트에 머리글 줄만 있는지 본다.

## 배포 순서
1. 모든 TASK를 합친 뒤 전체 검사(`npm test`·`npm run lint`·`npm run build`, ssk-finish-check)와 독립 검토 한 번.
2. 사용자: Supabase SQL Editor에 `supabase/migrations/20261121000000_contacts.sql` 전체를 붙여 넣고 Run(ssk-supabase-sql). Claude는 실제 Supabase에 붙지 않는다.
3. 웹 배포는 **사용자가 말할 때만**(ssk-deploy). 도우미·확장 새 판은 없다.
