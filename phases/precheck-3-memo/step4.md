# Step 4: memo-screen

> **TASK-18** 메모 화면 · 입력 결과 · 병원 문구 칸 · **REQ-018** · AC-018.1 ~ AC-018.27
> Phase 3 `precheck-3-memo` · Step 4 — `docs/precheck/plan.md` §6
> 명세 `specs/precheck/`는 사용자가 승인했다. 이 step은 TASK-18 하나만 한다. 다른 TASK의 일은 하지 않는다.
> **목업 승인 범위(2026-11-01)**: '병원 문구'·'시술별 약' 칸과 입력 쪽이 승인됐다. 쓰다 멈춘 사람·기관기호 안내·처음 질문·설정 변경 띠는 어느 승인 목업에도 없어 사용자가 그 목업을 승인하기 전에는 만들지 않는다(아래 '승인된 목업', tasks.md TASK-18). TASK-13·14·16·35·36·37이 끝난 뒤에 한다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/precheck/requirements.md`의 REQ-018에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-018.1**: 입력 방식 칸과 목록(AC-018.26) 아래에 메모 표(Phase 0 화면 4): 진료마다 메모 초안(`fullText`, 고친 것은 고친 것), 비교(같음·다름·비트에 없음·조회 못함), 입력 상태, 아직 입력 안 된 것만 거르기. 사람마다 넣고 빼는 체크는 없다. 두 메모는 사람 줄을 누르면 열린다(AC-018.25·AC-018.27)
- **AC-018.2**: 메모를 고친 뒤 1초 동안 더 고치지 않으면 `store.save`로 PC에 저장. 저장 실패면 값을 그대로 두고 `E-STORE-FAILED`와 [다시 저장]. 브라우저 저장소는 쓰지 않는다
- **AC-018.3**: [비트에 입력 (N명)] → 목록의 입력할 사람으로 묶음을 만들어 `bit.input`, 진행 숫자(`done/total`). 단추 옆 글은 묻지 않기가 꺼져 있으면 "누르면 PC 화면에 확인 창이 떠요. 거기서 [확인]을 눌러야 들어가요.", 켜져 있으면 "누르면 PC 확인 창 없이 바로 시작해요."(바뀌는 사람 수를 잇는다). 누른 뒤 꺼져 있거나 `checkedByHand`가 있으면 '확인 기다리는 중' "PC 화면의 확인 창에서 [확인]을 눌러 주세요", 그 밖에는 바로 '입력 중' 숫자. 기다리는 중의 수는 보낸 묶음의 수, 시작하면 도우미의 `total`. PC 창의 수는 화면보다 적을 수 있다. 목업의 '지금: 날짜 이름' 줄은 넣지 않는다(`progress`는 숫자만). 크롬 창은 내려가므로(AC-038.1) 입력 중 직원이 보는 것은 도우미의 PC 진행 창(AC-036.7). 빼는 것: 완료·메모가 없는 진료·이미 있음(승인 전이고 묻지 않기가 꺼져 있거나 직접 확인 기록이 남았을 때)·비교가 `조회 못함`인 진료·확인 표시·같은 사람 같은 날·지난번 건너뛴 사람. 사전점검 규칙 경고는 막지 않는다. 설정이 바뀐 띠가 있으면 [다시 점검] 전까지 막는다
- **AC-018.4**: 입력 결과는 완료·확인 필요·건너뜀(이유)으로 나눠 보이고, [다시 하기]는 건너뜀 가운데 '이미 있음'·'직접 입력'이 아니고 확인 표시가 남지 않았고 비교가 `조회 못함`이 아닌 것만 다시 묶어 입력. 바꾼 사람은 이전 메모도 함께. 건너뜀에는 화면에서 미리 뺀 사람도 이유와 함께 들고, 결과가 보이는 동안 입력 방식 칸은 접히며 [입력 방식으로 돌아가기]가 있다. 취소였으면 입력 방식 칸으로 돌아가 위 띠에 "입력하지 않았어요"
- **AC-018.5**: 다시 연 청구 화면에서 같은 기간을 불러오면 저장해 둔 고친 메모·결과가 이어서 보인다(도우미 저장 + 비트 비교)
- **AC-018.6**: 다른 창에서 이미 청구 화면이 연결됨(`E-BRIDGE-BUSY`)이면 "다른 창에서 작업 중" 안내만, 불러오기·입력 단추 없음
- **AC-018.7**: 설정 화면의 병원 문구는 설정 쪽 승인 목업의 세 묶음 메모 모양·시술별 문구와 약·사유 문장으로 고칠 수 있고(원본 설정 엔진의 묶음으로 나누지 않는다. 저장 값 모양은 그대로), '상병 연결표' 칸도 고칠 수 있으며, [저장] 전에 `validatePhrases`로 검사해 틀린 칸을 보인다. [메모 시험해 보기]는 가짜 진료 한 건으로 문장을 보여 준다. 병원 설정 줄이 없으면 AC-018.18
- **AC-018.8**: 입력 방식은 처방코드별(왼쪽)·날짜별 둘이고 처방코드별이 먼저 골라져 있다(원본 `nmAutoMode`의 `checked`가 기간별). 처방코드별 기간은 불러온 기간 전체, 날짜별은 '하루'(첫날)로 시작하고 칸 아래에 내원내역 준비 글. 확인 기다리는 중·입력 중에는 방식·날짜·코드를 바꿀 수 없다. 고른 방식은 저장하지 않는다
- **AC-018.9**: 날짜별: 하루 또는 시작~끝 안의 아직 안 된 진료 모두를 날짜 순서로, `code` 없이. `inputTargets`는 고른 기간(`visible`) 안만 본다. 날짜가 비었거나("날짜를 골라 주세요") 그 기간 밖이거나 시작이 끝보다 늦으면 고르는 즉시 안내하고 `bit.input`을 부르지 않는다. 보낼 진료가 없으면 AC-018.23
- **AC-018.10**: 처방코드별: 기간 + 코드(칸에 적은 코드가 먼저, 비었으면 코드 단추). `Visit.rx`에 코드가 글자까지 같은 아직 안 된 진료만 날짜 순서로 묶어 `code`와 함께. 코드 단추는 고른 기간(`visible`)의 아직 안 된 진료에 있는 시술 코드를 많은 차례로, 다시 누르면 풀리고 칸과 둘 다 있으면 안내. 기간 안내 셋은 AC-018.9와 같고 코드 검사보다 먼저. '아직 안 된'은 고른 범위에서 완료와 메모 없음만 뺀 진료
- **AC-018.11**: 코드가 없음·둘 이상으로 보이거나 AC-036.1 모양이 아님·맞는 아직 안 된 진료가 없음이면 `bit.input`을 부르지 않고 정해 둔 안내 문구를 고르는 즉시
- **AC-018.12**: 확인 표시가 남은 메모는 넣지 않고, 목록에 이미 보여도 누르면 몇 명·누구인지 알리며 [빼고 N명 입력]·[먼저 고치기](첫 환자의 메모 고치기 칸을 연다)·[닫기](원본 `nmAutoPrecheck`)
- **AC-018.13**: 같은 차트번호·같은 날 진료가 둘 이상이면 보내지 않고 '직접 입력'으로. 도우미가 같은 날 내원이 여러 건이라 돌려준 진료도 같은 묶음으로 옮기고 Worker 메모리에 적어 다음 묶음·[다시 하기]에 넣지 않는다
- **AC-018.14**: '다른 메모 있음' 줄에 두 메모가 누르지 않아도 나란히, 사람마다 [이 메모로 바꾸기]. 입력할 사람의 '메모 바꿈 · 승인함'·'메모 바꿈 · 묻지 않기' 줄에도 두 메모가 누르지 않아도 나란히 보인다. 메모 없음·완료·확인 표시·직접 입력 줄에는 `다름`이어도 없다. 누르면 보인 비트 메모를 `replaces`로, 입력할 사람으로 옮겨 [바꾸지 않기]. 묻지 않기가 꺼져 있으면 누르지 않은 진료는 묶음에 없고, 켜져 있으면 단추가 숨는다(직접 확인 기록이 남은 사람은 예외). 읽는 동안 못 누른다. 승인은 Worker 메모리에만, 메모를 고치거나 자료가 실제로 바뀔 때만 풀린다: 새 [자료 불러오기]는 모두, 성공한 다시 불러오기는 글이 달라진 사람만, 실패·옛 번호는 풀지 않는다
- **AC-018.15**: [엑셀로 저장]을 눌렀을 때만 Worker가 원본 `nmBatchWorkbook`과 같은 칸의 xlsx를 만든다. 파일 이름에 환자 값이 없고 서버로 보내지 않는다
- **AC-018.16**: 쓰다 멈춘 진료·`unconfirmed`가 있으면 [비트에 입력]을 막고 안내와 [이어서 입력]·[직접 확인했어요](`checkedByHand`. 칸이 다르면 건너뜀으로 끝나고 묻지 않기가 켜져 있어도 바꾸지 않으며 그 기록이 남는다, AC-037.6)
- **AC-018.17**: `E-BIT-HOSPITAL-MISMATCH`면 안내와 번호, 저장은 막힌 채. 지우거나 처음부터 다시 하는 단추가 없다. 고친 메모는 화면 메모리에 그대로
- **AC-018.18**: `memoBlocked`면 메모 칸과 설정의 '병원 문구'·'시술별 약' 칸에 "처음 질문을 먼저 해 주세요", 메모·[비트에 입력]·설정 저장 단추 없음('상병 연결표' 저장 단추 포함: 저장이 NOT NULL `phrases`를 함께 쓴다). 점검 결과는 그대로
- **AC-018.19**: 설정의 '시술별 약' 칸('시술별 문구와 약' 묶음 안): 시술마다 약 이름으로(국소마취제·연골주사약 포함) 넣기·빼기와 약마다 자리. [저장] 전에 `validatePhrases`. 안내 문구 둘
- **AC-018.20**: 앞선 입력에서 건너뛴 진료(이미 있음·직접 입력·입력 직전 변경됨 제외)의 메모가 그대로면 뺀다(원본 `nmAutoHeld`). 고치면 다시 들어가고 [다시 하기]는 넣는다. '지난번 건너뜀' 묶음에 [메모 고치기]·[다시 하기 (N명)]. 모두 빠지면 안내. 직접 입력으로 끝난 사람(도우미가 옮긴 사람 포함)은 AC-018.13
- **AC-018.21**: `bit.input` 끝 JSON(`status`·`code`·`reason`·`fields`·`results`·`unconfirmed`·`noAsk`)을 읽어 멈춤은 문구·이유·수·칸 ID와 [이어서 하기]로. 조각이 깨졌으면 결과를 지어내지 않고 `E-CLAIM-PARTIAL`
- **AC-018.22**: 끝 JSON의 `noAsk`를 Worker 메모리에 둔다(처음·답 없음은 거짓, 새 `bridge-port`를 받으면 거짓). 참이면 다음 묶음부터 비교 `다름`인 진료도 `replaces` 없이 넣고 화면 위 띠를 보인다(끄는 단추 없음). 첫 묶음은 다시 만들지 않고, 끝난 뒤 아직 바꾸지 않은 수 N('다른 메모 있음'으로 빠졌던 사람, 직접 확인 기록 제외)을 알려 [비트에 입력]을 다시 누르게 한다. 입력 기록이 `skippedByHand`인 진료는 켜져 있어도 승인 없이 넣지 않는다(AC-016.3). 사이트는 이 값을 도우미에 보내지 않는다
- **AC-018.23**: 어느 방식이든 입력할 사람이 0명이면 단추가 흐리고 `bit.input`을 부르지 않는다. 안내는 고르는 즉시: 아직 안 된 진료 없음, 모두 지난번 건너뜀, 확인 표시가 있으면 안내 없이 누를 때 알림, 그 밖에는 "지금 입력할 수 있는 사람이 없어요. 아래 빠지는 이유를 확인해 주세요."
- **AC-018.24**: 입력 방식 칸의 '불러온 기간' 글 아래 [비트 메모 전체 불러오기](이 단추나 줄 열기로 받은 뒤 [비트 메모 전체 다시 불러오기], 읽는 동안 "비트 메모 불러오는 중…")와 상태 줄. [자료 불러오기]의 `claim.memos`는 이 '받음'에 들지 않는다. 고른 기간(`visible`)만 `claim.memos`로 읽기만 하고 `claim.month`·점검 결과·고친 메모는 그대로, 비교와 입력 대상만 새로(AC-016.7). 읽는 동안·달을 불러오기 전·[자료 불러오기] 중·확인 기다리는 중·입력 중에는 누를 수 없다(읽는 동안은 승인 목업). 번호 검사는 그대로다: 화면을 다시 그려 막음이 풀린 뒤 또 읽어 겹치면 마지막 번호의 답만 친다. 읽는 동안 [이 메모로 바꾸기](승인 목업)와 `bit.input`을 시작하는 단추 모두(Claude 판단, 안전 규칙이 아니라 입력 중 목록과 카드 안내가 틀리지 않게 하는 작은 더함)를 막는다. 실패면 전 결과를 둔다(AC-016.8). 실패 상태 줄은 "불러오지 못했어요. {오류 문구} 지금 보이는 비트 메모는 HH:MM에 불러온 내용이에요."이고 읽은 적이 아예 없으면 "불러오지 못했어요. {오류 문구}"까지만이다
- **AC-018.25**: 사람 줄을 연 진료의 우리 메모 옆에 '비트에 저장된 청구메모' 카드: 배지(지금 메모와 같음·지금 메모와 다름·비트에 없음·불러오지 못함·불러오는 중, 아직 안 받았으면 없음), 비트 메모 글, 기간·건수·불러온 시각 안내. `조회 못함`은 "이 사람 메모는 읽지 못했어요. 비어 있다는 뜻이 아니에요." 실패면 '불러오지 못함' 옆에 지난번 비교 배지와 "아래는 HH:MM에 불러온 내용"(읽은 적이 없으면 오류 문구만). 입력을 마친 사람은 카드가 그대로이고 안내를 덧붙인다. [이 메모로 바꾸기]는 카드 밖 줄에
- **AC-018.26**: [비트에 입력]을 누르기 전에 고를 때마다 목록이 바뀐다: "{N}명 입력해요 · 빠지는 사람 {M}명", 입력할 사람(칩), 빠지는 사람(묶음마다 이름·수·까닭, 한 사람은 앞선 하나에만). 사람마다 넣고 빼는 체크는 없다. 확인 필요·지난번 건너뜀 줄에 [메모 고치기]
- **AC-018.27**: 사람 줄을 누르면 두 메모가 열리고 다시 누르면 접힌다. 여럿 함께 열 수 있다. 아직 안 받았고 읽으려 한 적이 없으며 입력 중이 아니면 처음 열 때 저절로 한 번 읽는다. 새 [자료 불러오기]는 '읽으려 한 적'도 지운다

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·020·021·022
- `/docs/precheck/plan.md` §6 (Phase·Step 순서)
- `/specs/precheck/requirements.md` — REQ-018
- `/specs/precheck/design.md` — 6-5절(설정 바뀜 → 입력 막기), 7절 표 '청구'·'설정', 9-4절(결과 세 가지·이어서 하기·웹 창이 닫혀도), 15절(창 하나·승인 없이 덮어쓰지 않음), 19-1·19-3·19-4·19-5·19-6절
- `/specs/precheck/tasks.md` — TASK-18 (수정 범위·메모)
- `/docs/UI_GUIDE.md` '앱 화면'(표·입력·오류 카드·확인 창)
- `/eslint.config.mjs`·`/src/guardrails.test.ts` (Phase 2가 친 `components/claim/rows` 울타리)
- 이전 step에서 만든 파일:
  - `src/components/claim/*`(청구 화면·`useBridge`·`SettingsChangedBanner`), `src/components/claim/rows/*`, `src/workers/precheck.worker.ts`·`jobs.ts` (Phase 2 Step 6)
  - `src/lib/precheck/memo/*`(`buildMemo`·`validatePhrases`·`defaultPhrases`) (Step 0)
  - `src/lib/precheck/memoCompare.ts`(`inputPlan`) (Step 2)
  - `helper/src/Precheck.Core/Input/*` (Step 3, TASK-35·36·37: `bit.input` 진행·결과 모양, 이유 문구, `code`·`replaces`·`checkedByHand`·`unconfirmed`·`previousMemo`)
  - `src/lib/storage/claimSettings.ts`(`readHospitalSettings`·`writeHospitalSettings`), `src/components/settings/SettingsPage.tsx` (Phase 2 Step 5)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 원본 (양지바른, 읽기만)

- GitHub: 저장소 `seoseungkwan/shared`, 브랜치 `main`, 폴더 `YangjiBareun_사전점검/`, 커밋 `2a1069b` (README 1.24.5)
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/4601ab55-16fe-474f-813a-c7a0d544b749/scratchpad/yangji/repo/YangjiBareun_사전점검/`
  - 이 사본은 얕은 clone(HEAD `c66488e`)이다. `2a1069b`와 `c66488e` 사이에 이 폴더 안 파일은 바뀌지 않았다(GitHub 비교로 확인). 그대로 써도 된다
- 사본이 없으면 저장소 밖 임시 폴더에 받는다: `git clone https://github.com/seoseungkwan/shared.git <임시폴더>/shared && git -C <임시폴더>/shared checkout 2a1069b` → `export YANGJI_SRC=<임시폴더>/shared/YangjiBareun_사전점검`. 받을 수 없으면 `blocked`(사유: 원본 저장소 접근 필요)로 멈춘다
- 원본 시험(`tests/*.py`·`*Tests.cs`)은 모두 가짜 자료다. 사례를 시험 씨앗으로 옮겨도 된다

- 이 step에서 볼 원본(폴더 `YangjiBareun_사전점검/` 기준):
  - `assets/mx999_v22.html`의 메모 화면·결과 분류 문구, `tools/claim_batch_result.py`
  - 같은 파일의 입력 방식 고르기 `<script id="new-medicore-range-input">`(13108~13222줄: `nmAutoMode`·`hasCode`·`runAutoRange`, 안내 문구), `nmAutoHeld`·`nmAutoPrecheck`·`nmBatchWorkbook`, 다른 메모 승인(`autoOne` 4276~4300줄 근처)
  - `tools/claim_hospital_settings.js`·`claim_hospital_ui.js`·`claim_hospital_ui.css` (값 모양과 검사만 본다. 화면 묶음은 원본을 따르지 않고 설정 쪽 승인 목업을 따른다)
  - `assets/mx999_v22.html`의 상병 연결표(`snapshot.rules`) 편집

## 승인된 목업 (화면 step)

- 화면 4 '청구 · 메모 확인·수정'(`id="v-memo"` 부분). 사람마다 넣고 빼는 체크는 따르지 않는다(AC-018.26)
- 화면 5 '도우미 PC 확인 창'(`id="v-confirm"` 부분)
- 화면 6 '청구 · 입력 결과'(`id="v-result"` 부분)
- 화면 10 '설정'(`id="v-config"` 부분)
- **승인된 새 목업(입력 쪽)**: 입력 방식 두 가지·코드 단추·안내 문구·입력할 사람과 빠지는 사람 목록·다른 메모 나란히 보기·비트 메모 카드와 [비트 메모 전체 불러오기]·확인 표시 알림·'직접 입력'·입력 결과·[엑셀로 저장]·묻지 않기 안내·PC 확인 창 글은 https://claude.ai/artifact/P7NFu7j9NRNmKHskgY4UYU (판 `1793539759-946b`)를 따른다. 위 화면 4·5·6보다 이것이 앞선다. 그 안의 [청구 창 닫았다 다시 열어 보기]·장면 단추·예시 자료는 시안용이라 만들지 않는다
- **승인된 새 목업(설정의 두 칸)**: '병원 문구'·'시술별 약' 칸은 https://claude.ai/artifact/QnXpDwjWGCDLjNuPBRDNxE (판 `1793534640-5640`)를 따른다. 위 화면 10보다 이것이 앞선다. 그 목업의 '변경 기록'·'가입 보기 글'은 만들지 않는다(범위 밖)
- **아직 승인 안 됨**: 쓰다 멈춘 사람(AC-018.16)·기관기호 안내(AC-018.17)·'처음 질문을 먼저 해 주세요'(AC-018.18)·설정 변경 띠(AC-018.3)는 어느 승인 목업에도 없다. 사용자가 이 부분의 목업을 승인하기 전에는 이 부분을 만들지 않는다. 승인본 링크는 tasks.md TASK-18에 적힌 것을 쓰고, 없으면 그 부분만 `blocked`(사유: 그 부분의 목업 승인 필요)로 남긴다. 그 밖에 새 목업에 없는 부분은 위 화면을 따른다. 이 칸들은 기능만 맞추고 모양은 다듬지 않는다

- 화면은 승인된 목업 https://claude.ai/artifact/499cp2Sodph7jYJ4gX4exj (위 화면 번호)과 같게 만든다(배치·문구·상태). 명세의 화면 AC는 내용만 정하고 배치·문구는 목업이 정한다
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/48cae04e-0cd2-4603-a1ad-b361628f7242/scratchpad/mockup/index.html` — 화면마다 `<section class="screen" id="v-…">` 한 덩어리다. 사본이 없으면 artifact 읽기 도구(`read_artifact`, slug `499cp2Sodph7jYJ4gX4exj`)로 읽는다. 둘 다 안 되면 `blocked`(사유: 승인 목업을 읽을 수 없음)
- 목업 안의 환자 이름·차트번호·숫자·고시 번호·오류 번호(`E-PC-101` 같은 것)는 지어낸 예시다. 오류 번호는 design.md 4-5의 것을 쓴다
- 모양 규칙은 `docs/UI_GUIDE.md` '앱 화면'(Tailwind 토큰은 `src/app/globals.css` `@theme`, 반복 모양은 `src/components/ui/classes.ts`). 목업의 inline 값을 새 색·새 크기로 만들지 않는다
- 화면 확인은 jsdom 시험으로 한다. 실제 화면 캡처는 Phase 끝에 메인 세션이 한다

## 수정 범위 (tasks.md TASK-18)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/components/claim/*`
  - `src/components/claim/memo/*`
  - `src/components/claim/rows/*`
  - `src/components/settings/HospitalPhrases.tsx`
  - `src/components/settings/HospitalPhrases.test.tsx`
  - `src/components/settings/ProcedureDrugs.tsx`
  - `src/components/settings/ProcedureDrugs.test.tsx`
  - `src/components/settings/DxLinks.tsx`
  - `src/components/settings/DxLinks.test.tsx`
  - `src/components/settings/SettingsPage.tsx`
  - `src/app/(app)/claim/page.tsx`
  - `src/app/(app)/claim/page.test.tsx`
  - `src/lib/precheck/inputTargets.ts`
  - `src/lib/precheck/inputTargets.test.ts`
  - `src/lib/precheck/excel.ts`
  - `src/lib/precheck/excel.test.ts`
  - `src/workers/precheck/jobs.ts`
  - `src/workers/precheck/jobs.test.ts`
  - `src/workers/precheck.worker.ts`
  - `src/types/precheck.ts`
  - `src/lib/errors.ts`
  - `src/types/errors.ts`
  - `src/lib/errors.test.ts`
- Tests:
  - `src/components/claim/memo/MemoPanel.test.tsx`
  - `src/components/claim/memo/InputMode.test.tsx`
  - `src/components/claim/memo/InputResults.test.tsx`
  - `src/components/claim/memo/useMemoDrafts.test.ts`
  - `src/components/claim/memo/BitMemoButton.test.tsx`
  - `src/components/claim/claimLoad.test.ts`
  - `src/components/claim/rows/BitMemoCard.test.tsx`
  - `src/components/claim/rows/MemoRows.test.tsx`
  - `src/components/settings/HospitalPhrases.test.tsx`
  - `src/components/settings/ProcedureDrugs.test.tsx`
  - `src/components/settings/DxLinks.test.tsx`
  - `src/lib/precheck/inputTargets.test.ts`
  - `src/lib/precheck/excel.test.ts`
  - `src/workers/precheck/jobs.test.ts`
  - `src/lib/errors.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **환자 줄 화면 울타리**: `src/components/claim/rows/**`·`src/components/contact/rows/**`는 JSX는 되지만 네트워크·console·브라우저 저장소·supabase·`lib/storage`·`lib/auth` import를 못 쓴다. 줄은 props로만 받는다. `components/claim/**`·`components/contact/**`·`app/(app)/claim/**`·`app/(app)/contact/**`는 오류 수집 패키지(`@sentry/*`·`@vercel/analytics`·`@vercel/speed-insights`)를 import하지 않는다 (ADR-020)
- **브라우저 저장소 안 씀**: 고친 메모·완료 표시·입력 기록·연락 표시·설정 사본은 도우미 작업 저장(`store.save`)에만 둔다. `localStorage`·`sessionStorage`·`indexedDB`에 두지 않는다 (ADR-020)
- **PC 확인 창**: 비트에 쓰는 일(`bit.input`)과 처음 등록(`bit.register`)은 도우미가 띄우는 윈도우 창에서 사람이 [확인]을 눌러야만 시작한다. 창의 글은 도우미가 묶음·비트에서 직접 만든다(웹이 보낸 글을 보이지 않는다). [취소]·창 닫기·5분 지남이면 아무것도 하지 않는다 (ADR-016, design.md 9-1·9-4)
- **새 서버 경로 없음**: `app/api/*`·Route Handler·Server Action을 새로 만들지 않는다. 서버 코드는 `app/api/ai/` 하나다. 설정·건수는 브라우저가 Supabase(RLS)에 바로 읽고 쓴다 (ADR-004·021)
- **주소에 환자 값 없음**: 차트번호·이름·메모·전화를 주소(URL)·쿼리·화면 제목·`history.state` 밖 어디에도 넣지 않는다. 주소는 서버 로그와 브라우저 기록에 남는다. 화면 사이에는 날짜와 메모리 안 key만 넘긴다
- **오류 문구 한 곳**: 오류 안내는 `src/lib/errors.ts`('무엇이 · 어떻게 고치나 · 번호'), 번호 타입은 `src/types/errors.ts`. 새 번호는 design.md 4-5 목록에서 고른다. 화면에 원래 오류 내용(예외 메시지·스택·도우미가 준 글)을 보이지 않는다 (CLAUDE.md)
- **환자 자료 구역 울타리**: `src/lib/bridge`·`src/lib/precheck`·`src/workers`(그리고 기존 `lib/parsers`·`lib/analytics`·`lib/payload`)에서는 네트워크(`fetch`·`XMLHttpRequest`·`WebSocket`·`EventSource`·`sendBeacon`), `console`, 브라우저 저장소(`localStorage`·`sessionStorage`·`indexedDB`), React·Next·supabase·`lib/auth`·`lib/storage` import, JSX를 쓰지 않는다. 동적 `import()`는 글자로 고정한 경로만 쓴다. `eslint.config.mjs`가 막고 `src/guardrails.test.ts`가 증명한다. 이 울타리를 풀거나 `eslint-disable`로 피하지 않는다 (CLAUDE.md, ADR-020)

## 작업

### 1. 메모 칸 (목업 화면 4)
- 단계 줄 `1 날짜 고르기 · 2 점검 결과 · 3 메모 확인 · 4 비트에 입력 · 5 입력 결과`와 안쪽 탭 `메모 점검 | 월말 마감`(월말 마감 화면은 TASK-22)
- `src/components/claim/memo/MemoPanel.tsx`: 진료마다 초안(고친 것 표시)·비교 상태 칩(같음·다름·비트에 없음·조회 못함, 글자로)·입력 상태. '아직 입력 안 된 것만' 거르기. 사람마다 넣고 빼는 체크는 없다. 환자 줄은 `components/claim/rows/MemoRows.tsx`가 props로만 그린다
- 입력할 사람·빠지는 사람 목록(AC-018.26): 고를 때마다 Worker `inputTargets`의 결과를 그린다. 사람 줄을 누르면 두 메모가 열리고 처음 열 때 저절로 한 번 읽는다(AC-018.27)
- `useMemoDrafts.ts`: 고친 메모를 Worker에 `editMemo`로 알리고, 1초 동안 더 고치지 않으면 Worker에 `saveDrafts`를 시킨다. Worker가 `store.save` 글자를 만들어 통로 포트로 바로 보내고(화면은 글자를 쥐지 않는다, `send` 없음, AC-004.11) 됨·오류 번호만 화면에 알린다. 실패면 값을 그대로 두고 `E-STORE-FAILED` + [다시 저장]

### 2. 비트에 입력 (목업 화면 5의 웹 쪽 상태, 새 목업)
- 입력 방식(`InputMode.tsx`, AC-018.8~018.11): 처방코드별이 왼쪽에 있고 먼저 골라져 있다. 잘못 고른 안내는 고르는 즉시 나온다. 대상 고르기는 Worker에서 부르는 순수 함수 `lib/precheck/inputTargets.ts`다(design.md 19-1). 화면은 방식·기간·코드만 넘긴다
- 쓰다 멈춘 사람이 있으면 [비트에 입력] 대신 AC-018.16의 안내와 단추, 확인 표시가 남은 사람은 AC-018.12의 고르기
- [비트에 입력]: 설정을 다시 읽어(design.md 6-5) 바뀌었으면 띠를 띄우고 막는다. 아니면 Worker `buildInputBatch`(AC-018.3의 빼는 것을 뺀다. Worker가 `bit.input` 글자를 만들어 통로 포트로 바로 보낸다) → '확인 기다리는 중'("PC 화면의 확인 창에서 [확인]을 눌러 주세요", 창이 안 보이면 작업 표시줄 '청구메모 도우미') → `useBridge`의 `onProgress` 숫자(`done/total`)로 '입력 중 N / M명'(숫자만. 목업의 '지금: 날짜 이름' 줄은 넣지 않는다, AC-018.3)
- 웹은 확인 창을 흉내 내지 않는다. 확인은 도우미 창에서만

### 3. 입력 결과 (목업 화면 6)
- `InputResults.tsx`: 확인 필요·건너뜀·완료 차례의 묶음(이유 원본 문구, 미리 뺀 사람도 건너뜀에 이유와 함께)과 수, [입력 방식으로 돌아가기]. [다시 하기]는 건너뜀 중 '이미 있음'·'직접 입력'이 아니고 확인 표시가 남지 않았고 비교가 `조회 못함`이 아닌 것만 다시 묶는다. 바꾼 사람은 이전 메모(결과 줄의 `previousMemo`. 칸이 없는 줄도 맞는 모양이다, AC-037.1)도 함께 보인다. 도우미 파일의 `originals`를 보여 주는 화면은 만들지 않는다('범위 밖', 2026-11-01 사용자 결정). [엑셀로 저장]은 누를 때만 Worker가 만든다(AC-018.15). 취소면 "입력하지 않았어요". 멈춤(`E-BIT-UI-CHANGED` 등)은 목업 '비트 화면이 바뀌어 멈춤' 상태처럼 넣은 수·남은 수와 [이어서 하기]
- 결과 조각은 Worker `applyInputResults`로 들어가 보기 모양이 된다. 끝 JSON을 읽는 법은 AC-018.21이다
- `applyInputResults`는 Worker의 `journal` 사본도 적는다(AC-016.3): `buildInputBatch`가 `checkedByHand`를 붙여 보낸 사람의 결과가 건너뜀이거나 확인 필요이고 이유가 '미처리'로 시작하면 `skippedByHand`를 적는다(도우미 기록과 같다, AC-035.5). 완료나 쓰다 멈춘 결과는 `skippedByHand`로 적지 않는다. 그래야 다시 불러오기 전에도 그 사람이 '다른 메모 있음'에 [이 메모로 바꾸기]와 함께 남고, '메모 바꿈 · 묻지 않기' 칩과 '다른 메모 N명', AC-018.22의 N에 들지 않는다. '메모 칸이 입력을 받지 않아…'(AC-036.5)는 이유가 '미처리'로 시작하지 않아 적지 않는다: 그 칸은 비어 있어 `다름`이 아니다
- 사본에서 쓰다 멈춤이 풀리는 때 **(Claude 판단, design.md 19-6)**: 결과가 완료인 사람은 사본을 `done`으로 적는다. 도우미가 저장을 확인해 `done`을 남긴 사람이라(AC-017.7) 안 적으면 다 끝난 사람이 다시 불러오기 전까지 AC-018.16에 막힌다. 쓰다 멈춘 결과는 도우미 기록도 풀리지 않았으므로 사본을 그대로 둔다. `unconfirmed`는 마지막 답의 값만 본다
- `E-STORE-FAILED`이거나 `unconfirmed`가 있는 답은 사본에 적지 않는다 **(Claude 판단)**: 도우미 기록이 그대로일 수 있어, `skippedByHand`도 `done`도 적지 않는다. 다시 불러오면 맞춰진다
- 비트 메모 카드(AC-018.25): `rows/BitMemoCard.tsx`를 사람 줄을 연 진료의 우리 메모 옆에 그린다. 단추(AC-018.24)는 `memo/BitMemoButton.tsx`이고 `run`은 `claimLoad.ts`에서 받는다(design.md 19-12)
- 다른 메모(AC-018.14): `다름`인 줄('다른 메모 있음'과 메모 바꿈 칩 줄)은 두 메모가 누르지 않아도 늘 나란히, '다른 메모 있음' 줄에만 [이 메모로 바꾸기](카드 밖). 메모 없음·완료 줄에는 `다름`이어도 없다. 승인은 Worker 메모리에만 두고 다음 묶음의 `replaces`로 간다. [바꾸지 않기]로 되돌린다. 묻지 않기가 켜지면 숨는다(직접 확인 기록이 남은 사람은 예외)
- 기관기호가 바뀜(AC-018.17): 안내와 번호만. 지우는 단추를 만들지 않는다
- `E-BRIDGE-BUSY`(AC-018.6): 목업 '다른 창에서 열려 있음' — 안내와 [다시 확인]·[건수만 보기]만, 불러오기·입력 단추 없음

### 4. 이어서 (AC-018.5)
- 같은 기간을 불러오면 `store.load`의 고친 메모·입력 기록과 `claim.memos` 비교로 이어서 보인다(Phase 2 Step 6의 'Phase 2 시점 순서 문제' 처리는 이제 도우미가 명령을 알므로 실제로는 타지 않는다)

### 5. 설정: 병원 문구·상병 연결표 (병원 문구는 승인 새 목업, 상병 연결표는 목업 화면 10)
- `HospitalPhrases.tsx`: 설정 쪽 승인 목업의 세 묶음(메모 모양·시술별 문구와 약·사유 문장)으로 고치기. 원본 설정 엔진의 묶음으로 나누지 않고, 저장하는 값의 모양은 그대로다. [저장] 전에 `validatePhrases` → 틀린 칸 표시. 저장은 `writeHospitalSettings`. [메모 시험해 보기]: 가짜 진료 한 건(코드에 넣은 고정 가짜 값)으로 `fullText` 결과를 보인다(AC-014.5)(표가 필요하면 Worker로)
- `ProcedureDrugs.tsx`: '시술별 약' 칸(AC-018.19). 시술마다 약 이름으로 넣기·빼기와 약마다 자리, [저장] 전 `validatePhrases`, 안내 문구 둘
- 병원 설정 줄이 없으면(AC-018.18) '병원 문구'·'시술별 약' 칸에 "처음 질문을 먼저 해 주세요", 저장 단추 없음
- `DxLinks.tsx`: 상병 연결표 `[rx, dx, nm, ex, src]` 줄 더하기·고치기·지우기
- `SettingsPage.tsx`의 '청구·연락' 안에 '점검 규칙' 다음 자리로 끼운다. 저장 실패면 값 유지 + [다시 저장]
- 목업의 `{부위}` 같은 자리 표시는 예시다. 실제 말은 원본 `fill`의 말(`부위`·`시술` 등)이다

### 6. 오류 번호
- `E-STORE-FAILED`·`E-STORE-BROKEN`·`E-BIT-UI-CHANGED`·`E-BIT-UNSAVED-RX`·`E-INPUT-STOPPED`·`E-BIT-HOSPITAL-MISMATCH` 화면 문구. `E-MEMO-NO-SETTINGS`는 TASK-14가 더했다

### 7. 시험 (jsdom, 가짜 통로·가짜 Worker)
- `MemoPanel.test.tsx`(AC-018.1·018.3·018.4 취소 띠·018.6·018.12·018.16·018.17·018.18·018.23·018.24 읽는 동안 막음·018.26·018.27), `InputMode.test.tsx`(AC-018.8~018.11), `BitMemoButton.test.tsx`(AC-018.24), `claimLoad.test.ts`(`run`), `rows/BitMemoCard.test.tsx`(AC-018.25, 메모 없음·`조회 못함`·실패·입력을 마친 사람), `inputTargets.test.ts`(AC-018.9~018.11·018.13·018.20·018.22·018.23·018.26, 앞자리만 같은 코드는 들지 않음, 규칙 경고가 있어도 듦, `visible` 밖·`조회 못함`은 빠짐, 입력 직전 변경됨은 기억하지 않음, `skippedByHand`는 켜져 있어도 빠짐), `useMemoDrafts.test.ts`(1초, 실패 → 다시 저장, 브라우저 저장소 안 씀: AC-018.2), `InputResults.test.tsx`(AC-018.4·018.5·018.21), `excel.test.ts`(AC-018.15, 누르기 전에는 안 만듦), `rows/MemoRows.test.tsx`(AC-018.14 메모 없음·완료 줄에 단추 없음과 [바꾸지 않기], 메모 바꿈 칩 줄에 누르지 않아도 두 메모가 보임, AC-018.26·018.27), `HospitalPhrases.test.tsx`·`DxLinks.test.tsx`(AC-018.7), `ProcedureDrugs.test.tsx`(AC-018.18·018.19), `jobs.test.ts`(`editMemo`·`buildInputBatch`·`applyInputResults`, AC-018.21·018.22, AC-018.14 실패·옛 번호 뒤 승인 그대로, `checkedByHand`로 보낸 사람의 건너뜀·'미처리' 결과 뒤 `journal` 사본이 `skippedByHand`이고 다시 불러오기 전에도 '다른 메모 있음'에 남으며 N에 들지 않음, `E-STORE-FAILED`이거나 `unconfirmed`가 있는 답이면 사본을 적지 않음, 쓰다 멈춘 사람이 완료로 끝나면 사본이 `done`이라 AC-018.16에 막히지 않음)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-004.3 chrome.runtime이 없으면 no-extension', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-18 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-18 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/components/claim/memo/MemoPanel.test.tsx src/components/claim/memo/InputMode.test.tsx src/components/claim/memo/InputResults.test.tsx src/components/claim/memo/useMemoDrafts.test.ts src/components/claim/memo/BitMemoButton.test.tsx src/components/claim/claimLoad.test.ts src/components/claim/rows/BitMemoCard.test.tsx src/components/claim/rows/MemoRows.test.tsx
npx vitest run src/components/settings/HospitalPhrases.test.tsx src/components/settings/ProcedureDrugs.test.tsx src/components/settings/DxLinks.test.tsx src/lib/precheck/inputTargets.test.ts src/lib/precheck/excel.test.ts src/workers/precheck/jobs.test.ts src/lib/errors.test.ts src/guardrails.test.ts
python3 ~/.claude/harness/bin/tdd-run TASK-18 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status precheck`에서 AC-018.1 ~ AC-018.27이 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/precheck-3-memo/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 고친 메모를 `localStorage`·`sessionStorage`·`indexedDB`에 두지 마라(잠깐이라도). 이유: 청구 쪽은 브라우저 저장소를 쓰지 않는다. 도우미 저장만(AC-018.2, ADR-020)
- 웹 화면에 '확인' 단추를 두어 도우미 확인 창을 대신하게 하지 마라. 이유: 입력은 PC 확인 창에서만 시작한다(ADR-016)
- 설정이 바뀐 띠가 있는데 입력을 보내지 마라. 이유: 다른 설정으로 만든 메모가 비트에 들어간다(AC-018.3)
- [다시 하기]에 '이미 있음' 건너뜀을 넣지 마라. 이유: 비트에 있는 다른 메모를 덮어쓰려는 것이 된다(AC-018.4). 바꾸기는 묻지 않기가 꺼져 있으면 사람마다 [이 메모로 바꾸기]로만(AC-018.14, 켜져 있으면 AC-018.22·AC-037.6)
- 묻지 않기를 사이트에서 켜는 칸·단추를 만들지 마라. 이유: 사이트 문제만으로 비트에 쓰이면 안 된다. 체크는 PC 확인 창에만 있다(AC-037.5, 사용자 결정)
- 결과 엑셀을 자동으로 만들지 마라. 이유: 환자 이름이 들어가고 암호가 없다(AC-018.15, 사용자 결정)
- 설정 쪽 승인 목업에 그려져 있어도 '변경 기록'·'가입 보기 글'과 가입 질문을 만들지 마라. 이유: 자동 입력을 의원 PC에서 확인한 뒤 따로 명세한다(requirements '범위 밖')
- 기관기호가 바뀌었을 때 지우기·처음부터 다시 단추를 만들지 마라. 이유: 사용자 결정(AC-018.17)
- 메모·이름·차트번호를 주소·쿼리·`console`에 남기지 마라. 이유: 주소와 로그는 PC 밖으로 나갈 수 있다
- 화면을 목업과 다른 배치·문구로 새로 짓지 마라. 이유: 화면은 승인된 목업대로(CLAUDE.md CRITICAL)
- 기존 테스트를 깨뜨리지 마라. 이유: Phase 2 청구 화면·설정 화면 시험이 계속 통과해야 한다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
