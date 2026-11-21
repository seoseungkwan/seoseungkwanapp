# 설계: 고시·공지 탭

> 값과 동작의 기준은 requirements.md다. 이 문서는 어디에 무엇을 두는지와 정한 값을 적는다. 화면 글자는 requirements(시안 `notes.md` 그대로 + '기본값'). ADR 글은 12절(구현 끝 TASK가 `docs/ADR.md`로 옮긴다).

## 1. 한눈에
```
[Vercel Cron 9개, 같은 경로] GET /api/ai/notices/collect (Authorization: Bearer CRON_SECRET)
  한국 07시대 1번 + 09·11·13·15·17·19·21·23시대 8번 — 모두 같은 흐름
  → 모으기 계정으로 Supabase 로그인(anon 열쇠 + 비밀번호, service role 없음)
  → runCollector: ① 일괄 결과 거두기 ② 새 글 확인(오늘 확인 안 한 출처만 → 첫 실행인 아침에 한 번)
                  ③ 지난주 모음 ④ 요약(붙임 받아 글자 뽑기 → Claude 바로 또는 일괄) ⑤ 지난 글 채우기 ⑥ 실행 기록
[화면] /notices · /notices?id= · /notices/week ─ 브라우저 + RLS(승인된 원장만)
        읽음·별표·메모·규칙 확인 → notice_marks(내 병원)
        [묻기] → POST /api/ai/notices/ask(질문 검사 → 표 받기(하루 20) → DB의 글 + 질문 → Claude → 답 · 실패면 표 돌려줌)
[대시보드] 맨 위 규칙 경고 · '일별 현황' 아래 '고시·공지' 칸 · [탭 띠] '고시·공지' 옆 안 읽은 수
```

## 2. 파일
| 곳 | 내용 |
|---|---|
| `src/types/notices.ts` | 공용 타입(11절) |
| `src/lib/errors.ts`·`src/types/errors.ts` | `E-NOTICE-READ`·`E-NOTICE-SAVE` |
| `src/app/api/ai/notices/text.ts` | `htmlToText`·`decodeEntities`·`escapeTags`·`cutText` |
| `src/lib/notices/askCheck.ts` | 환자 정보 모양 검사(화면·서버가 같이 씀, 순수) |
| `src/lib/notices/view.ts` | 화면 글자 함수(출처·종류 이름, 글 번호 자리, 날짜·시각, 오늘·어제, 본문만 이유, 게시판 주소, 99+) — 순수 |
| `src/lib/storage/notices.ts` | 화면의 읽기·쓰기(RLS) |
| `src/app/api/ai/notices/fetchSite.ts` | 사이트 부르기(허용 길·UA·크기·시간·host 간격) |
| `src/app/api/ai/notices/sources/{hiraNotice,hiraCrtr,mohwRss}.ts` | 출처별 읽기(순수) |
| `src/app/api/ai/notices/attachText.ts` | 붙임 종류·글자·읽기 계획 |
| `src/app/api/ai/notices/{noticeNo,ruleMatch}.ts` | 고시 번호·묶음 열쇠·묶기·점검 규칙 연결 |
| `src/app/api/ai/notices/{summaryPrompt,weeklyPrompt}.ts` | 요청 만들기·답 검사(순수) |
| `src/app/api/ai/claude.ts`(넓힘)·`notices/batch.ts` | 바로 부르기·일괄 처리 |
| `src/app/api/ai/notices/{collectStore,collector}.ts` | 모으기 DB 쪽·흐름 |
| `src/app/api/ai/notices/collect/route.ts` | `GET` 자동 실행 |
| `src/app/api/ai/notices/ask/{route,askPrompt}.ts` | `POST` 묻기 |
| `src/components/notices/list/**`·`detail/**`·`week/**` | 화면 셋 |
| `src/components/dashboard/notices/**`·`src/components/shell/NoticeBadge.tsx` | 대시보드 경고·칸, 탭 숫자 |
| `supabase/migrations/20261121000000_notices.sql`·`supabase/notices.rls.test.ts` | 표·권한·시험 |
| `fixtures/notices/` | 사이트 견본(필요한 부분만 잘라 넣음) |
| `supabase/migrations/20261121000001_notice_keywords.sql`·`supabase/noticeKeywords.rls.test.ts` | 내 낱말 표·맞춤·목록 함수 다시 만들기(15절) |
| `src/lib/notices/keywords.ts` | 내 낱말 순수 도구(정규화·다듬기·검사·추천 12개·칩 글) |
| `src/components/notices/keywords/**` | 내 낱말 단추·칸 `KeywordsControl` |
- 서버 코드는 모두 `app/api/ai/notices/` 아래다(CLAUDE.md). 새 패키지 `unpdf`·`fflate`(버전 고정, 설치 때 2주 넘은 판)는 `attachText.ts`만 쓴다.
- `src/app/api/ai/` 아래 새 `.ts` 파일(시험·`route.ts` 밖)은 첫 줄이 `import 'server-only'`다(`src/lib/ai/boundary.test.ts` AC-513.2가 본다).
- 화면은 PC 배치 하나다(폰 전용 배치 없음, 2026-11-21 사용자 규칙). 폰에서도 같은 화면이 그대로 보인다.

## 3. 표 (`20261121000000_notices.sql`, 두 번 실행해도 됨, 먼저 모두 revoke)
공용 표(병원 칸 없음, ADR-035). 읽기 = `(select my_hospital_id()) is not null or (select is_notice_collector())`, 넣기·고치기 = `(select is_notice_collector())`, 지우기 정책 없음.
- **`notices`**(묶음 하나 = 화면 한 줄): `id` uuid · `group_key` unique(3~200자) · `title`(1~300) · `kind`(`gosi`·`notice`·`interp`·`guide`·`case`) · `posted_on` date(≥ 2026-01-01) · `notice_no`(`^\d{4}-\d{1,4}$` 또는 null) · `body`·`attach_text`(≤ 20,000자, 기본 '') · `read_mode`(`full`·`text`·`body`·null) · `related` bool null · `summary` jsonb 객체 null(≤ 4,000바이트) · `rule_hits` jsonb 배열(≤ 50, 기본 `[]`) · `rule_count` generated · `state`(`wait`·`batch`·`done`·`failed`, 기본 `wait`) · `tries` 0~5 · `batch_id`(`^[A-Za-z0-9_]{1,100}$` 또는 null) · `created_at`·`updated_at`(트리거). 색인 `(posted_on desc)`·`(state)`.
- **`notice_posts`**: `id` · `notice_id` → notices(cascade) · `source`(`hira_notice`·`hira_crtr`·`mohw_rss`) · `source_key`(1~100) · `title`(1~300) · `url`(≤ 500, `^https://www\.(hira\.or\.kr|mohw\.go\.kr)/`) · `posted_on` · `attachments` jsonb(`notice_links_ok`: 배열 ≤ 10, 항목 `{name 1~200, url 같은 규칙}`만) · `created_at`. unique(`source`,`source_key`).
- **`notice_sources`**: `source` pk · `state`(`ok`·`stopped`) · `error_code`(`blocked`·`http`·`shape`·null) · `checked_at`(마지막 목록 확인) · `last_ok_at` · `stopped_since` · `cursor` jsonb 객체(≤ 1,000바이트) · `backfill_done` · `updated_at`. SQL이 세 줄을 넣는다(`mohw_rss`는 `backfill_done` 참, 있으면 그대로).
- **`notice_weeks`**: `week_start` date pk(월요일만) · `top3` jsonb 배열(≤ 3, 항목 `{head, body}`) · `created_at`.
- **`notice_runs`**: `id` · `started_at` · `finished_at` · `counts` jsonb 객체(≤ 2,000바이트) · `input_tokens`·`output_tokens`·`cost_micro_usd` bigint ≥ 0. 읽기는 관리자·모으기 계정, 쓰기는 정의자 함수만.
- **`notice_collectors`**: `user_id` pk → auth.users. 권한·정책 없음(SQL 편집기로만). `is_notice_collector()` 정의자 함수.
- **`notice_marks`**(내 병원): pk(`hospital_id` 기본 `my_hospital_id()`, `notice_id` → notices cascade) · `read_at` · `starred` 기본 false · `memo`(≤ 500, 기본 '') · `memo_at` · `rules_checked_at` · `updated_at`. 권한 select · insert(`notice_id` 그리고 값 칸) · update(값 칸). 정책 `hospital_id = (select my_hospital_id())`.
- **`notice_ask_days`**: pk(`hospital_id`,`day`) · `count` 0~20. **`notice_ask_holds`**: `token` uuid pk · `hospital_id` · `day` · `created_at`. 둘 다 권한 없음.
- 함수(정의자 = definer, 호출자 = invoker, 모두 `set search_path = ''`):
  - `notice_start_run()`(정의자, 잠금 뒤 끝나지 않은 6분 안 실행이 있으면 null) · `notice_add_run_usage(p_id, p_input, p_output, p_cost)` · `notice_finish_run(p_id, p_counts)` — 모으기 계정 아니면 42501.
  - `take_notice_ask()`(정의자): `my_hospital_id()` null이면 42501. 한국 날짜 줄을 20까지 올리고 표를 만들어 돌려줌, 20이면 null. 하루 지난 표는 이때 지운다. `end_notice_ask(p_token, p_ok)`: 내 병원·오늘 표가 있으면 지우고 `p_ok` 거짓이면 수 −1. `notice_ask_left()`.
  - `notice_search(p_q)`(호출자): 낱말마다 `\`·`%`·`_` escape, `concat_ws(' ', title, body, attach_text, summary->>'what', summary->>'when', summary->>'who', summary->>'forUs') ilike` 모두, `posted_on desc` 200개. 색인 없음(14절).
  - `notice_list(...)`(호출자, jsonb): requirements AC-7403.5. 한국 오늘 = `(now() at time zone 'Asia/Seoul')::date`.
  - `notice_unread_count()`·`notice_rule_alerts()`(호출자).
- `my_hospital_id()`는 cross-branch C1 글자 그대로 다시 만든다. RLS 시험은 auth·desk(`20261118100000_desk_accounts.sql`) migration을 먼저 돌려 데스크 계정을 만든다(다른 표 시험과 같은 PGlite 틀).

## 4. 모으기 실행 (`collector.ts`)
```ts
export type CollectorDeps = {
  store: CollectorStore
  fetchSite: (req: SiteRequest) => Promise<SiteResult>
  callClaude: typeof callClaude
  submitBatch: typeof submitBatch
  readBatch: typeof readBatch
  ruleIndex: RuleBasisIndex
  nowMs: () => number            // 시간 재기
  now: () => Date                // 한국 날짜는 lib/analytics/dates
}
export async function runCollector(deps: CollectorDeps): Promise<RunReport | 'busy'>
```
- 실행은 하루 아홉 번 모두 같다. 새 글 확인은 `checked_at`이 오늘(한국)인 출처를 건너뛰므로 실제로는 아침 07시대 한 번이다(아침이 실패해 확인을 못 했으면 다음 실행이 한다). 나머지 여덟 번은 거두기·요약·지난 글 채우기만 하고, 할 일이 없으면 몇 초 안에 끝난다.
- 시간 표(시작부터): 바로 요약 시작 ~170초 · 일괄 준비 ~230초 · 지난 글 ~250초 · 마감. 바로 부름 한도 100초(`CALL_TIMEOUT_MS`)라 170초에 시작해도 300초 안이다.
- 새 글: 출처마다 1쪽부터, 쪽의 줄이 모두 새것이면 다음 쪽(5쪽까지). 출처 셋은 함께, 심평원 두 곳은 같은 host라 `fetchSite`가 동시 2개·300ms로 줄 세운다. 글·팝업 읽기가 실패한 줄은 이번에 넣지 않는다(다음 확인 때 다시 새 글). 줄 하나 저장 = `groupKeyOf` → `groupOf` → `mergeGroup` → `saveGroup`.
- 요약: `waiting(40)`(최근 글부터). 바로 갈 것 = `posted_on ≥ 오늘 − 2일` 또는 `tries ≥ 1`. 붙임은 묶음의 출처 글 붙임에서 받고(`kind: 'file'`) `sniffFile` → `planReading`. 바로는 동시에 3개. 일괄은 `submitBatch`가 담지 못한 것을 `wait` 그대로 둔다.
- 일괄 거두기: `openBatches()`의 id마다 `readBatch`. `processing`이고 24시간 안이면 둔다.
- 지난 글: `cursor` = `{ "page": n }`(공지) · `{ "01": n, "02": n, "09": n, "10": n, "done": ["01"] }`(심사기준).
- 주간 모음: 지난 월요일(오늘이 월요일이면 7일 전)을 구해 `weekExists`가 거짓이면 `weekNotices` → 0개면 `{ top3: [] }`, 아니면 `weeklyRequest` → `callClaude` → `parseWeekly`. 월요일 첫 실행(아침)이 만든다.
- 사용량: 부름마다 `addRunUsage`(바로 = `costMicroUsd`, 일괄 = 절반 버림). `counts` = `{ new: {source: n}, stopped: [source], summarized, batched, collected, failed }`.
- 로그: `console.error('[notices/collect]', code)`만(`E-NOTICE-SRC-<source>`·`E-NOTICE-SUMMARY`·`E-NOTICE-BATCH`·`E-NOTICE-WEEK`).
- 처음 채우기 어림: 심평원 요청 약 4,000번(공지 글 ~900 + 붙임 ~1,300, 심사기준 팝업 ~1,500, 목록 ~250) ÷ 실행마다 ~600번(초당 약 3번 × ~200초) → 7번쯤 = 첫날 안. 일괄 결과는 두 시간 뒤 실행이 거둔다 → 시안 글 '하루쯤'.

## 5. 사이트별 (모두 UTF-8)
| 출처 | 목록 | 글 | 붙임 |
|---|---|---|---|
| `hira_notice` 심평원 공지 | GET `https://www.hira.or.kr/bbsDummy.do?pgmid=HIRAA020002000100&pageIndex=<n>` · `tbody tr`: `col-num`·`col-tit a[href*=brdBltNo=]`·`col-date` | GET `…&brdScnBltNo=4&brdBltNo=<key>` · `.fileBox li`(이름 글, `downLoadBbs('a','b','c','d')`)·`.view`(본문) | `https://www.hira.or.kr/bbs/bbsCDownLoad.do?apndNo=a&apndBrdBltNo=b&apndBrdTyNo=c&apndBltNo=d` |
| `hira_crtr` 심평원 심사기준 | POST `https://www.hira.or.kr/rc/insu/insuadtcrtr/InsuAdtCrtrList.do?pgmid=HIRAA030069000410`, form `tabGbn=01|02|09|10&pageIndex=<n>` · `col-num2`(관련근거)·`col-tit a onclick="viewInsuAdtCrtr(no,'mtgHmeDd','sno','mtgMtrRegSno',RN)"`·`col-date` | GET `…/InsuAdtCrtrPopup.do?mtgHmeDd=&sno=&mtgMtrRegSno=` · `.viewCont .view` 글 | 받지 않음(본문에 전체 글) |
| `mohw_rss` 보건복지부 | GET `https://www.mohw.go.kr/rss/board.es?mid=a10409020000&bid=0026` · `item`: `title`·`link`(`list_no=`)·`description`·`pubDate` | 없음(robots가 `board.es` 쪽을 막음) | 없음 |
- 게시판 열기 링크(사람이 누르는 이동, 서버가 읽지 않음): 공지 `https://www.hira.or.kr/bbsDummy.do?pgmid=HIRAA020002000100` · 심사기준 `https://www.hira.or.kr/rc/insu/insuadtcrtr/InsuAdtCrtrList.do?pgmid=HIRAA030069000410` · 복지부 `https://www.mohw.go.kr/board.es?mid=a10409020000&bid=0026`.
- 견본: 조사 때 받은 `C:\Users\tjtmd\AppData\Local\Temp\claude\719c734060576844\564f910f-c538-4591-ad30-a3552610b06c\scratchpad\notice\`의 `hira_notice.html`·`hira_view.html`·`hira_ptab01|02|09|10.html`·`hira_crtr_pop.html`·`mohw_rss_a1040902000.xml`. 지워졌으면 이 PC에서 위 주소로 한 번씩 받는다. 표·본문 부분만 잘라 `fixtures/notices/`에 넣고 담당자 이름·전화·`author`는 지운다. 틀린 모양 시험용으로 표를 지운 사본을 하나 둔다.
- 고시 번호를 찾는 글(`numberText`): 공지 = 제목, 심사기준 = 관련근거 + 제목, 복지부 = 제목 + 설명 앞 200자.

## 6. 붙임 읽기 (`attachText.ts`)
- `hwpxText`: `fflate.unzipSync`의 filter로 항목 수·`originalSize` 합을 먼저 보고 넘으면 null, `Contents/section<n>.xml`을 n 차례로 `<hp:t>` 글만, `</hp:p>`마다 줄바꿈. `pdfText`: `unpdf`의 `getDocumentProxy`·`extractText` → `{ text, pages }`, 실패 null.
- `planReading(files)`: `full` 조건 PDF 합 ≤ 18,000,000바이트·쪽 합 ≤ 30(base64로 4/3 늘어도 요청 32MB 안). HWPX는 늘 글자로 보낸다. 결과 `Reading`(11절).
- 비용 어림: 붙임 10쪽 ≈ 2만 토큰. 30쪽 넘는 책자는 글자만 보내 값을 묶는다.

## 7. 묶기 · 고시 번호 · 점검 규칙
- `noticeNo(text)`: `/(?:^|[^가-힣])(?:보건복지부\s*)?고시\s*제?\s*(\d{4})\s*-\s*(\d{1,4})\s*호/`. '고시' 앞 15자에 질병관리청·식품의약품안전처·식약처·국토교통부·고용노동부·행정안전부·교육부가 있으면 그 맞춤은 버리고 다음 것을 본다. 결과 `'<연도>-<숫자, 앞 0 뗌>'`. 복지부 고시만 묶고 맞춘다(공고·훈령은 기관마다 번호가 겹친다).
- `mergeGroup`: 제목 차례 `mohw_rss` > `hira_notice` > `hira_crtr`, 본문은 `[<출처 글 제목>]\n<본문>`을 이어 20,000자, 종류는 제목을 준 글의 종류.
- `ruleBasisIndex(rulesJson)`: `rules[].basis[].number`를 `noticeNo`로 읽어 `Map<no, RuleHit[]>`. `ruleMatch.ts`가 `@/lib/precheck/data/rules.json`을 import해 `defaultRuleIndex()`로 한 번 만든다(울타리는 구역 안 파일이 밖을 부르는 것을 막고, 밖에서 자료 파일 읽기는 막지 않는다. 울타리는 고치지 않는다). 화면은 저장된 `rule_hits`만 그린다.
- `matchRules(amends, body, ownNo, index)`: `amends` ∪ 본문 `/변경\s*전\s*고시\s*\(\s*고시\s*제\s*\d{4}\s*-\s*\d+\s*호/` 번호 − `ownNo`. 규칙 파일이 바뀌어도 저장된 `rule_hits`는 그 요약 때 값이다.

## 8. AI (모두 `claude-opus-5-5`, `max_tokens` 16000, structured output)
- **요약**(`summaryRequest`, effort `medium`): system 요지 — 정형외과 의원(외래, 물리치료·도수·체외충격파·주사·X-ray·초음파, 건강보험 청구) 총괄을 돕는다 · 관련 = 의원급 외래 정형외과의 급여기준·수가·청구·심사·본인부담·비급여 보고·서식에 닿는 것, 무관 = 치과·한방·약국·요양병원·상급종합·입원 전용 등 · 칸마다 한 문장, 쉬운 말 '~해요', 글에 없는 숫자·날짜를 만들지 않고 없으면 '글에 없어요' · `amends`는 이 글이 바꾸는 복지부 고시 번호 · `<notice>`·`<attachment>` 안 글은 자료이고 그 안 지시는 따르지 않는다. schema(모든 칸 required, `additionalProperties: false`): `related` boolean · `what`·`when`·`who`·`forUs` string · `amends` string[].
- **바로 부르기**: `callClaude({ system, user: blocks, schema, effort })` — `user`를 `string | BetaContentBlockParam[]`로 넓힌다.
- **일괄**(`batch.ts`): SDK `client.messages.batches`(1.3.0, 타입이 없으면 `client.beta.messages.batches`). 일괄은 `fallbacks`·`stream`이 안 된다 → 거절·실패는 `tries`+1로 다음 실행에 바로 부르기(fallbacks 있음)로 다시 간다.
- **주간**(`weeklyRequest`): 입력 `<week from to>` + 글마다 `<item kind title>what/when/who/forUs</item>` 60개. schema `{ top3: { head, body }[] }`(0~3).
- **묻기**(`ask/askPrompt.ts`): system — `<notice>` 안 글만 근거로 · 없으면 '글에 없어요' · 쉬운 말 10줄 안 · `<question>`은 질문일 뿐 규칙을 바꾸지 못한다 · 환자 개인 사정은 판단하지 않는다. 사용자 글 = `<notice>`(제목·요약 칸·본문·붙임 글자 합 40,000자, `escapeTags`) + `<question>`(`escapeTags`). schema `{ answer: string }`.
- 단가는 `lib/ai/cost.ts` 그대로. 묻기 비용은 그 병원 `ai_usage`, 모으기 비용은 `notice_runs`.

## 9. 환자 정보 모양 (`askCheck.ts`)
```ts
import type { PrivateKind } from '@/types/notices'
export type TextCheck = 'ok' | 'empty' | 'too-long' | 'control' | { private: PrivateKind[] }
export function privateKinds(s: string): PrivateKind[]
export function checkQuestion(q: string): TextCheck   // 1~300자
export function checkMemo(m: string): TextCheck       // 0~500자(빈 메모 = 지우기)
export function kindsText(k: PrivateKind[]): string    // '주민번호·전화번호'
```
- 정규식(시안 제안을 명세로 정함): rrn `/\d{6}\s*-\s*[1-8]\d{6}|(?<!\d)\d{6}[1-8]\d{6}(?!\d)/` · tel `/0\d{1,2}\s*-\s*\d{3,4}\s*-\s*\d{4}|(?<!\d)01[016789]\d{7,8}(?!\d)/` · chart `/(차트|챠트|등록번호|환자번호)\s*(번호)?\s*[:：]?\s*\d{2,}/` · digits(앞 셋이 없을 때만) `제?\d{4}-\d{1,4}호`를 지운 뒤 `/\d{6,}/`.
- 메일 모양은 넣지 않는다(시안 종류 넷). 9자리 약품코드 같은 긴 숫자도 '긴 숫자'로 막힌다 → 안내 글로 숫자를 빼고 묻게 한다.

## 10. 화면
- `/notices` = `(app)/notices/page.tsx`(서버 쪽 쪽 파일): `searchParams.id`가 uuid면 `NoticeDetail`, 아니면 `NoticesScreen`. `/notices/week` = `WeekScreen`. 셋 다 클라이언트 부품이고 상태는 화면에만(질문·답 저장 없음).
- `components/notices/list/`: `NoticesScreen`(머리·작은 탭·고르기·찾기·확인 줄·띠·목록), 달 머리 줄은 `posted_on`의 달.
- `components/notices/detail/`: `NoticeDetail`(두 칸 PC 배치)·`RuleBox`·`SummaryBox`·`AskBox`·`MemoBox`·`OriginBox`, 부르기 `askClient.ts`(같은 origin `POST`, `redirect: 'error'`, 몸통 `{ noticeId, question }`만). [메모에 옮기기]는 `MemoBox`의 칸 값에 붙인다(부모가 값을 쥔다).
- `components/notices/week/`: `WeekScreen`, 인쇄는 `print:` 클래스로 앱 틀·단추 숨김(A4 한 장).
- 모든 글은 글자 노드(`whitespace-pre-wrap`), `dangerouslySetInnerHTML` 없음. 바깥 링크는 `view.ts`의 `safeLink`가 두 사이트 주소만 통과시킨다.
- 대시보드: `components/dashboard/notices/RuleAlert.tsx`(맨 위, `LiveDashboard`)·`NoticesCard.tsx`(`BitDashboard`의 `DailySection` 바로 아래). 숫자가 없는 화면(연결 전·읽는 중)에는 칸을 놓지 않는다.
- 탭 숫자: `components/shell/NoticeBadge.tsx`를 `TabBar`의 '고시·공지' 옆에(`desk`면 그리지 않음). 열 때 한 번, `notices:changed`·`visibilitychange`(보임)마다 다시 읽는다.
- CSP는 그대로다(사이트·Claude는 서버만 부른다. 바깥 링크는 이동일 뿐이다).

## 11. 타입 (`src/types/notices.ts`)
```ts
export type NoticeSource = 'hira_notice' | 'hira_crtr' | 'mohw_rss'
export type NoticeKind = 'gosi' | 'notice' | 'interp' | 'guide' | 'case'
export type CrtrTab = '01' | '02' | '09' | '10'
export type ReadMode = 'full' | 'text' | 'body'
export type NoticeState = 'wait' | 'batch' | 'done' | 'failed'
export type SourceError = 'blocked' | 'http' | 'shape'
export type Attachment = { name: string; url: string }
export type ListItem = { source: NoticeSource; key: string; title: string; url: string; postedOn: string; kind: NoticeKind; numberText: string; tab?: CrtrTab; ref?: string; body: string | null }
export type PostDetail = { body: string; attachments: Attachment[] }
export type SiteRequest = { url: string; method?: 'GET' | 'POST'; form?: string; kind: 'page' | 'file' }
export type SiteResult = { ok: true; text: string } | { ok: true; bytes: Uint8Array } | { ok: false; fail: 'blocked-url' | 'http' | 'timeout' | 'too-big' }
export type Reading = { mode: ReadMode; pdfs: { name: string; base64: string }[]; texts: { name: string; text: string }[]; attachText: string }
export type NoticeSummary = { related: boolean; what: string; when: string; who: string; forUs: string; amends: string[] }
export type WeekTop = { head: string; body: string }
export type RuleHit = { id: string; title: string }
export type GroupPost = { source: NoticeSource; title: string; url: string; postedOn: string; attachments: Attachment[] }
export type GroupRow = { id?: string; groupKey: string; title: string; kind: NoticeKind; postedOn: string; noticeNo: string | null; body: string; state: NoticeState; tries: number; posts: GroupPost[] }
export type PostRow = GroupPost & { sourceKey: string }
export type WaitingNotice = { id: string; title: string; kind: NoticeKind; postedOn: string; noticeNo: string | null; body: string; tries: number; posts: GroupPost[] }
export type SourceRow = { source: NoticeSource; state: 'ok' | 'stopped'; errorCode: SourceError | null; checkedAt: string | null; lastOkAt: string | null; stoppedSince: string | null; cursor: Record<string, unknown>; backfillDone: boolean }
export type WeekInput = { kind: NoticeKind; title: string; summary: NoticeSummary }
export type RunUsage = { inputTokens: number; outputTokens: number; costMicroUsd: number }
export interface CollectorStore {
  startRun(): Promise<string | null>
  addRunUsage(runId: string, u: RunUsage): Promise<boolean>
  finishRun(runId: string, counts: Record<string, unknown>): Promise<boolean>
  sources(): Promise<SourceRow[]>
  saveSource(row: SourceRow): Promise<boolean>
  knownKeys(source: NoticeSource, keys: string[]): Promise<Set<string>>
  groupOf(groupKey: string): Promise<GroupRow | null>
  saveGroup(group: GroupRow, post: PostRow): Promise<boolean>
  waiting(limit: number): Promise<WaitingNotice[]>
  saveSummary(id: string, s: { summary: NoticeSummary; readMode: ReadMode; attachText: string; ruleHits: RuleHit[] }): Promise<boolean>
  failSummary(id: string): Promise<boolean>
  markBatch(ids: string[], batchId: string): Promise<boolean>
  openBatches(): Promise<{ batchId: string; ids: string[]; oldest: string }[]>
  weekExists(weekStart: string): Promise<boolean>
  weekNotices(weekStart: string): Promise<WeekInput[]>
  saveWeek(d: { weekStart: string; top3: WeekTop[] }): Promise<boolean>
}
// 화면
export type NoticeMark = { readAt: string | null; starred: boolean; memo: string; memoAt: string | null; rulesCheckedAt: string | null }
export type NoticeView = { id: string; title: string; kind: NoticeKind; postedOn: string; noticeNo: string | null; related: boolean | null; summary: NoticeSummary | null; readMode: ReadMode | null; state: NoticeState; ruleHits: RuleHit[]; posts: GroupPost[]; mark: NoticeMark; unread: boolean }
export type NoticeFilter = { related: boolean; sources: NoticeSource[]; starred: boolean; q: string; offset: number }
export type NoticePage = { total: number; unread: number; rows: NoticeView[] }
export type RuleAlert = { id: string; noticeNo: string | null; title: string; ruleCount: number }
export type AskReply = { ok: true; answer: string; left: number } | { ok: false; kind: 'private'; kinds: PrivateKind[] } | { ok: false; kind: 'limit' | 'failed' }
```
`export type PrivateKind = 'rrn' | 'tel' | 'chart' | 'digits'`도 이 파일에 둔다(`askCheck.ts`가 가져다 쓴다).

## 12. ADR 글 (구현 끝 TASK가 `docs/ADR.md`에 옮김)

### ADR-034: 고시·공지는 서버가 정해 둔 시각에 바깥 사이트를 읽고, 모으기 전용 계정으로 쓴다
**맥락**: 고시·공지 탭(specs/notices)은 로그인한 사람이 없는 아침에 사이트를 읽고 모든 병원이 볼 줄을 써야 한다. 서버 코드는 `app/api/ai/` 하나, service role 키 금지, 문지기는 로그인 안 한 요청을 `/login`으로 보낸다(CLAUDE.md·ADR-004).
**결정** (2026-11-21 사용자 인터뷰·시안 승인, 설계는 Claude 판단):
- 경로는 `GET /api/ai/notices/collect` 하나(`app/api/ai/` 안). Vercel Cron(무료판은 식마다 하루 한 번·그 시간 안 아무 때, 한 프로젝트 100개까지)으로 같은 경로를 아홉 식 건다: `0 22 * * *`(한국 07시대 아침)과 `0 0`·`0 2`·…·`0 14`(한국 09~23시대 두 시간마다). 실행은 모두 같고, 새 글 확인은 출처마다 하루 한 번(첫 실행 = 아침)이다. 나머지는 지난 글 채우기와 일괄 결과 거두기다 — 시안의 '하루쯤'을 지키려고. `Authorization: Bearer <CRON_SECRET>`만 받는다(같은 시간 비교, 비어 있으면 거부). 300초(무료판 최대) 안에서 시간 표대로 멈추고 다음 실행이 잇는다. 같은 실행이 두 번 와도 DB 잠금(`notice_start_run`)과 '있는 key는 넣지 않음'으로 한 번만 한다.
- 문지기 예외 한 칸: `lib/auth/gate.ts`의 공개 경로에 이 주소 하나를 더한다. 지키는 것은 경로의 `CRON_SECRET` 검사다.
- DB 쓰기는 **모으기 계정**: Supabase 인증 계정 하나(메일·비밀번호는 Vercel 환경 변수 `NOTICES_COLLECTOR_EMAIL`·`NOTICES_COLLECTOR_PASSWORD`에만)가 공개 열쇠로 비밀번호 로그인한다. 허용 목록 표 `notice_collectors`(admins처럼 SQL 편집기로만 넣음)에 있는 계정만 공용 표에 넣고 고친다(지우기 없음). 병원 줄이 없어 병원 자료는 RLS가 막는다. 시험용 우회 길이 아니라 권한이 좁은 진짜 계정이다.
- 사이트 규칙을 지킨다: 정해 둔 주소만 부르고(복지부는 RSS만), 브라우저 모양 UA, host마다 동시 2개·300ms 간격. 의사협회(서울 서버에서 막힘)·건보공단(robots 금지)·회원 전용 사이트는 뺀다. 한 출처가 막히면 그 출처만 '못 가져옴'이다.
**대안**: (1) service role 키 — 규칙 금지. (2) Supabase Edge Function·pg_cron — 서버 코드가 `app/api/ai` 밖으로 나가고 service role을 갖는다. (3) anon이 부르는 함수 + 비밀 글자 인자 — 권한이 RLS가 아니라 글자 하나에 달린다. (4) 하루 한 번만 — 처음 채우기가 1~2주라 시안 '하루쯤'과 어긋난다. (5) 실행이 자기를 다시 부르는 사슬 — 끝없이 돌 위험. (6) Vercel Schedules(베타) — 베타다.
**트레이드오프**: 모으기 비밀번호가 새면 가짜 글을 쓸 수 있다 → 주소 제약(두 사이트만)·글자로만 그림·지우기 없음, 비밀번호를 바꾸면 끝난다. 사이트 모양이 바뀌면 그 출처가 멈추고 코드를 고쳐야 한다. 시각이 그 시간 안에서 흔들린다. Vercel은 Cron Jobs를 Schedules로 옮길 예정이라 그때 설정을 옮긴다.

### ADR-035: 모든 병원이 같이 보는 공용 표 (plan.md §0 '모든 표에 hospital_id' 예외)
**결정**: 고시·공지 글·출처 글·출처 상태·주간 모음(`notices`·`notice_posts`·`notice_sources`·`notice_weeks`)은 병원과 상관없는 같은 자료라 `hospital_id` 없이 한 벌만 둔다(요약은 한 번만 만든다). 읽기는 승인된 원장(`my_hospital_id()`가 있음)과 모으기 계정만이고 데스크·승인 대기·anon은 못 본다. 실행 기록 `notice_runs`(토큰·비용·건수 숫자만)는 관리자·모으기 계정만 읽는다. 병원마다 다른 것(읽음·별표·메모·규칙 확인 `notice_marks`, 묻기 횟수 `notice_ask_days`·`notice_ask_holds`, 내 낱말 `notice_keywords`와 그 맞춤 `notice_keyword_hits`)은 `hospital_id` 표다. 맞춤 줄은 정의자 트리거만 쓴다(공용 글이 바뀌면 모든 병원 낱말로 다시 맞춤). 메모는 병원이 손으로 적는 500자 글이다: 앱이 환자 정보 모양(주민번호·전화·차트번호·긴 숫자)을 막고 AI로 보내지 않는다(업무일지 메모 ADR-025와 같은 남는 위험 — 환자 이름은 못 막음).
**이유**: 같은 글을 병원마다 따로 요약하면 비용이 병원 수만큼 든다. 판단 기준(정형외과 의원)이 모두 같다 **(사용자)**.
**트레이드오프**: 공용 줄은 모으기 계정만 쓴다. 지우는 길이 없어 잘못 들어간 글은 SQL 편집기로 지운다. 무료 DB 500MB 안에서 본문·붙임 글자를 각 20,000자로 묶는다.

### ADR-036: 바깥 공개 글을 Claude로 보내고, 묻기는 사용자가 적은 질문을 보낸다 (ADR-007 '서버가 DB에서 읽은 집계만' 예외)
**결정**:
- **요약**: 심평원·복지부 공개 글의 본문과 붙임을 `claude-opus-5-5`(effort medium)로 보낸다. PDF는 파일째(document 블록, 30쪽·18MB까지, 넘으면 서버가 뽑은 글자), HWPX는 서버가 뽑은 글자, 옛 HWP는 건너뛰고 '본문만 보고 요약'. 병원·사용자·환자 정보는 보내지 않는다. 바깥 글은 `<notice>`·`<attachment>`로 감싸 자료로만 다룬다. 답은 정해 둔 JSON 여섯 칸만 받아 칸마다 검사·자르기 한다. 붙임 파일은 저장하지 않고 찾기용 글자(20,000자)와 원래 링크만 둔다 **(사용자)**.
- **일괄 처리**: 올라온 지 3일이 지난 글(처음 채우기)은 Message Batches(반값)로 보내고 다음 실행에 거둔다. 일괄은 `fallbacks`를 못 써서 거절·실패는 다음 실행에 바로 부르기로 다시 한다.
- **묻기**: 사용자가 적은 질문(1~300자)을 그 글(서버가 DB에서 읽은 제목·요약·본문·붙임 글자)과 함께 보낸다. 화면과 서버가 같은 검사(`askCheck.ts`: 주민번호·전화·차트번호·6자리 넘는 숫자)로 막고 보내지 않는다. 병원마다 하루 20번을 보내기 전에 DB가 표로 세고(`take_notice_ask`), AI가 실패하면 표를 돌려줘 횟수가 줄지 않는다(시안). 질문·답은 저장·로그하지 않는다(로그는 오류 번호·경로 한 줄). 답은 글자로만 그린다. 칸 위에 늘 '환자 이름·주민번호·전화번호·차트번호는 쓰지 마세요.'
- **새 패키지**: `unpdf`(PDF 글자·쪽 수), `fflate`(HWPX zip) — 서버 `attachText.ts`만.
- **점검 규칙 연결**: 서버가 `lib/precheck/data/rules.json`을 읽기만 해 근거 고시 번호와 맞춘다(규칙 자동 수정 없음). 환자 자료 구역 울타리는 그대로다.
**이유**: 붙임까지 읽은 세 줄 요약과 자유 질문은 사용자가 골랐다 **(사용자, 2026-11-21)**. 보내는 것은 누구나 볼 수 있는 정부 공개 글이다. 질문은 서식 AI 정리(ADR-028)와 같은 틀로 막는다.
**대안**: (1) PDF를 늘 글자로만 — 싸지만 표·스캔 PDF를 놓친다. (2) Files API에 올려 두기 — 바깥에 파일이 남는다. (3) 정해 둔 질문만 — 사용자가 자유 질문을 골랐다.
**트레이드오프**: 환자 이름은 걸러낼 수 없다 → 안내 글과 저장·로그 안 함. 9자리 약품코드 같은 긴 숫자도 막힌다. 바깥 글 속 지시(프롬프트 주입)는 모양 고정 답·글자 그림으로 피해를 줄인다. 비용은 처음 8~17만 원·매달 약 1.5만 원 어림이고 `notice_runs`로 잰다.

## 13. 운영 준비 (배포 전, 사용자와 함께)
1. SQL `20261121000000_notices.sql` 붙여 넣기(ssk-supabase-sql), 이어서 `20261121000001_notice_keywords.sql`. 첫 파일을 나중에 다시 붙이면 둘째 파일도 다시 붙인다(둘째가 `notice_list`·`notice_unread_count`를 다시 만든다).
2. 모으기 계정: Supabase Authentication에서 사용자 하나 만들기(메일 확인 끝, 16자 넘는 비밀번호) → SQL `insert into public.notice_collectors (user_id) select id from auth.users where email = '<모으기 메일>';`
3. Vercel 환경 변수: `CRON_SECRET`(영문·숫자 32자 넘게), `NOTICES_COLLECTOR_EMAIL`, `NOTICES_COLLECTOR_PASSWORD`. `ANTHROPIC_API_KEY`는 있는 것. 값은 채팅에 붙이지 않는다.
4. 배포 뒤 Vercel Cron Jobs 화면의 [Run]으로 한 번 돌려 본다.
5. 첫 주 비용: `select date(started_at at time zone 'Asia/Seoul'), sum(input_tokens), sum(output_tokens), sum(cost_micro_usd)/1e6 as usd from public.notice_runs group by 1 order by 1;`

## 14. 위험
- 찾기는 색인 없는 `ilike`다(글 수천 개면 수백 ms). 느려지면 pg_trgm 색인을 따로 정한다.
- `unpdf`가 Next 서버 묶음에서 안 돌면 `serverExternalPackages`에 넣는다(설정 파일 하나).
- 심사기준 공개사례·행정해석이 하루에 많이 올라오면 요약 수가 는다 → 같은 날·같은 관련근거 줄은 한 묶음(`crtr:` 열쇠).
- 복지부 RSS 글이 짧아 요약이 얕다 → 같은 고시가 심평원 공지로 붙임과 함께 오면 다시 요약한다(묶음마다 3번까지).
- 처음 채우기가 '하루쯤'보다 길어질 수 있다(사이트 속도). 띠는 끝날 때까지 남는다.
- 낱말 하나를 넣을 때 모든 글 글자(본문·붙임 각 20,000자까지)를 한 번 정규화해 훑는다 — 글 수천 개면 1초 안팎이다. 해가 지나 느려지면 정규화한 글 칸을 저장해 두는 것을 따로 정한다(무료 DB 용량과 맞바꿈).

## 15. 내 낱말 (꼭 볼 글 · 2026-11-21 추가, REQ-7424)
병원마다 고른 낱말이 든 글을 '꼭 볼 글'로 표시한다. 맞춤은 DB가 미리 해 두고 화면은 맞은 낱말만 받는다(붙임 글자를 받지 않는다).

**정규화**(`normKeyword` = SQL `notice_norm`, 같은 규칙): 빈칸·탭·`\n`·`\r`·U+00A0·U+3000을 빼고 A~Z만 a~z로 바꾼다. SQL은 `translate(s, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' || E' \t\n\r 　', 'abcdefghijklmnopqrstuvwxyz')`(immutable·`set search_path = ''`) — 정규식·`lower()`보다 빠르고 DB 글자 설정(collation)에 기대지 않는다.

**표**(`20261121000001_notice_keywords.sql`, 000000 뒤, 두 번 실행해도 됨, 먼저 모두 revoke, `notice_marks`와 같은 내 병원 틀):
- `notice_keywords`: `hospital_id` 기본 `my_hospital_id()` → hospitals cascade · `word`(`= btrim(word)`, 1~20자, `!~ '[[:cntrl:]]'`, `notice_norm(word) <> ''`) · `word_norm` generated `notice_norm(word)` stored · `created_at` · pk(`hospital_id`,`word_norm`). before insert 정의자 트리거가 병원마다 `pg_advisory_xact_lock`으로 줄 세운 뒤 이미 30개면 `check_violation`. 권한 select·delete와 insert(`word`)만. 정책 `hospital_id = (select my_hospital_id())`. 환자 정보 모양 검사는 화면(`checkKeyword`)이 한다.
- `notice_keyword_hits`: pk(`hospital_id` → hospitals cascade, `notice_id` → notices cascade) · `words` text[](≤ 30, 넣은 차례). 권한 select만, 정책 같음. 쓰기는 아래 정의자 트리거뿐이다.

**맞춤**(정의자 트리거, `set search_path = ''`). 맞음 = `notice_hit(n, w)`: `title`·`body`·`attach_text`·`summary->>'what'|'when'|'who'|'forUs'` 칸마다 `strpos(notice_norm(칸), w) > 0`인 칸이 있음(칸을 잇지 않는다).
- `notice_keywords` after insert: 모든 `notices` 가운데 맞는 글에 `insert … on conflict (hospital_id, notice_id) do update set words = words || new.word`.
- `notice_keywords` after delete: 그 병원 줄에서 `array_remove(words, old.word)`, 빈 줄은 지운다.
- `notices` after insert 또는 update of `title`·`body`·`attach_text`·`summary`: 그 글의 줄을 지우고 모든 병원 낱말로 다시 넣는다(`array_agg(word order by created_at, word_norm)`). 모으기 계정의 문장 안에서 돌고, 모으기 계정은 낱말·맞춤 줄을 읽지 못한다.

**목록 함수 다시 만들기**: 같은 파일에서 `notice_list`·`notice_unread_count`를 `create or replace`(인자·돌려주는 모양·호출자 그대로)로 다시 만든다. 본문은 합쳐진 TASK-2 글 그대로에 두 곳만 더한다 — 줄 `keywords` = `coalesce((select h.words from public.notice_keyword_hits h where h.notice_id = n.id and h.hospital_id = (select public.my_hospital_id())), '{}')`, `p_related` 조건과 `notice_unread_count`의 '관련' 조건에 `or exists(내 맞춤 줄)`. 그래서:
- 관련 글만 보기(`listNotices`)·탭 숫자(`NoticeBadge` → `unreadCount`)·대시보드 칸(`unreadCount`·`listNotices`)이 화면 코드 고침 없이 꼭 볼 글을 넣는다. 화면은 `related`로 다시 거르지 않는다.
- 찾기(`notice_search` id → `notice_list(p_ids)`)도 같은 조건을 탄다.

**화면 쪽**
- 타입: `NoticeView`에 `keywords: string[]`(TASK-16이 `src/types/notices.ts`에 더함).
- 저장소(TASK-16): `readKeywords(): Promise<string[] | 'failed'>`(`created_at` 차례) · `addKeyword(word): Promise<boolean>`(insert `{ word }`) · `removeKeyword(word): Promise<boolean>`(delete `word = word`). 성공하면 `notices:changed`.
- `src/lib/notices/keywords.ts`(순수, `askCheck.ts`의 `privateKinds`를 씀):
```ts
export const KEYWORD_MAX = 30
export const KEYWORD_LEN = 20
export const RECOMMENDED_KEYWORDS: readonly string[]   // 기본값 19의 12개
export function normKeyword(s: string): string
export function cleanKeyword(s: string): string
export type KeywordCheck = { ok: string } | 'empty' | 'too-long' | 'full' | 'dup' | { private: PrivateKind[] }
export function checkKeyword(s: string, words: string[]): KeywordCheck
export function mustSeeText(words: string[], max: number): string   // '꼭 볼 글 · 도수치료·체외충격파 외 1개'
```
- `E-NOTICE-WORDS`(기본값 20)는 `lib/errors.ts`·`types/errors.ts`에 더한다. AC-7401.1 시험의 '번호 둘뿐'은 셋으로 고친다.
- `components/notices/keywords/KeywordsControl.tsx`('use client'): 단추와 펼친 칸. 혼자 `readKeywords`(그릴 때 한 번 + `notices:changed`마다)·`addKeyword`·`removeKeyword`를 부른다. 펼친 칸은 `basis-full order-last`로 고르기 첫 줄(`flex-wrap`) 아래로 꽉 차게 내려온다(시안 그대로).
- 끼우기: 같은 Phase에 따로 만드는 목록(TASK-17)과 낱말 부품(TASK-25)이 서로 import하지 않게, 쪽 파일 `(app)/notices/page.tsx`(TASK-22)가 `<NoticesScreen keywords={<KeywordsControl />} />`로 넣는다. `NoticesScreen`은 `keywords?: ReactNode`를 `별표만` 뒤에 그린다.
- 칩: 진한 파랑(`bg-accent-strong text-white font-semibold`, 깃발 아이콘), 다른 칩 맨 앞. 목록 `mustSeeText(keywords, 2)`, 글 화면 `mustSeeText(keywords, Infinity)`. 대시보드 칸 줄은 칩 없음.
