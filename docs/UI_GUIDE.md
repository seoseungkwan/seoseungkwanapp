# UI 디자인 가이드

> **기준(2026-11-01 총괄 승인, ui-90)**: 목표는 **화면마다 90점**(10기준 × 10점, 평균이 아니라 화면 하나하나). 시안 `docs/mockups/ui-90/entry/`(들어오는 화면: 랜딩·로그인·가입·대기·거절·404)·`docs/mockups/ui-90/app/`(로그인 뒤 화면: 앱 틀·대시보드·준비 중·청구·설정·가입 승인·오류), 명세 `specs/ui-90/`. 문구는 시안 소스의 글자 그대로다(`specs/ui-90/design.md` '기준 시안과 문구 원천'). 이 줄이 아래 옛 기준보다 먼저이고, 시안과 명세가 다르면 명세가 이긴다(`specs/ui-90/design.md` '시안과 다른 점').
> **ui-90이 대체하는 옛 기준**(옛 명세 파일은 고치지 않는다, 목록은 `specs/ui-90/requirements.md` '배경 / 목표'): tab-frame AC-303.5(폰 메뉴 단추 없음) · AC-303.6·AC-306.6·AC-307.8(`data-page-surface`가 있을 때만 흰 바탕) · AC-305.1·305.2·305.5(준비 중 패널·꾸밈 선·420px·h1 = 기능 이름) · AC-306.2(h1 "…채워집니다") · AC-311.x 가운데 연결 전 빈 그래프 틀 · AC-313.4 가운데 랜딩 규칙 시험 "고치지 않음" · AC-316.1(연결 전 '지금 바로 쓸 수 있어요' 줄) · AC-316.3·316.4 가운데 청구 "사용 가능"과 "준비 중" `faint` / b2b-redesign AC-217.2(오류 화면 = 오류 카드 + 단추 둘) · AC-220.x 가운데 관리자 h1 · AC-216.x 가운데 승인 대기·거절 문구와 신청일 줄 · 랜딩 AC-207~212 가운데 문구·움직임 금지·급여 패널·채팅 칸 · 미리보기 탭 6개(`faint`) / precheck AC-006.5(밖에서 보는 건수 자리) · AC-006.x 가운데 설치·연결 확인의 첫 상태 빨강·[연결 다시 확인]·"앞 단계를 먼저" 되풀이·문구 / auth AC-010.x 자동 로그아웃에 1분 전 안내를 더함. 대시보드 시안 메모 `docs/mockups/dashboard-home/notes.md`는 ui-90이 바꾼 곳에서 ui-90 시안에 진다.
> **이전 기준(2026-10-30 사용자 승인)**: B2B 디자인 개편 시안 `docs/mockups/b2b-redesign/`(게시본 https://claude.ai/artifact/574fyw1mAQmqBw4jWjhr6f, 사용자가 "진행해"로 승인), 명세 `specs/b2b-redesign/`, 결정 ADR-019.
> 움직임 규칙은 2026-10-31 사용자 결정으로 '짧은 반응 허용'(tab-frame)
> 탭·대시보드·준비 중 화면은 tab-frame이 대체한다(`specs/tab-frame/`, 2026-10-31 사용자가 1안 오늘 브리핑을 고름). 기준 시안 `docs/mockups/dashboard-home/`(시안 `index.html` + 모양 값 메모 `notes.md`)
> 랜딩과 앱 화면(로그인·가입 신청·승인 대기·거절·오류·앱 틀·대시보드·관리자)은 이 문서 **한 벌**의 규칙을 같이 쓴다. 값은 `src/app/globals.css`의 `:root` 한 곳에 있다.
> **landing-v2·auth의 모양 값은 기록으로만 남는다**: `specs/landing-v2/`·`docs/mockups/landing-v2/`(ADR-018의 색·글꼴·랜딩 짜임·미리보기), `specs/auth/`·`docs/mockups/auth/`·`docs/mockups/app-redesign/`(높이·색·모서리·굵기), 첫 랜딩 `specs/landing/`·`docs/mockups/landing/`. 동작과 문구는 그대로 유효하다(바뀐 문구는 아래 '문구').
> 예외로 대체된 옛 기준이 있다: 히어로 숫자 순환(옛 landing AC-003.1~AC-004.2), 승인 대기·거절 본문의 [로그아웃](옛 auth AC-005.1·AC-005.3) 등. 전체 목록은 `specs/b2b-redesign/requirements.md` '배경 / 목표'의 "이 명세가 대체하는 옛 기준"이다.
> 시안과 명세가 다르면 명세가 이긴다(`specs/b2b-redesign/design.md` '시안과 다른 점'). 부딪히면 plan.md가 이긴다. 사용자가 따로 줄 UI/UX md 파일(plan.md §12)이 오면 보강한다.

## 원칙
1. 밝은 화면만 쓴다. 다크 모드는 만들지 않는다 **(사용자)**
2. 데이터가 주인공이다. 대시보드와 통계 차트가 중심 그림이고 장식은 없다(Linear의 절제, Stripe 대시보드의 데이터 중심, 토스의 정돈) **(사용자, 2026-10-30)**
3. 상자 대신 선으로 나눈다. 덩어리는 1px 선과 여백으로 나누고, 테두리 상자는 꼭 필요한 곳에 하나만 둔다
4. 색은 중립 회색 + 강조색 파랑 하나다. 상태 색(늘어남·줄어듦·주의)은 글자·기호와 함께만 쓴다. 로고만 예외다
5. 규칙은 한 벌이다. 글자 11단계, 간격 단계, 모서리 두 가지, 그림자 하나만 쓴다. 랜딩과 앱이 같은 토큰을 쓴다
6. 숫자는 고정폭 숫자(`tabular-nums`)라 표·차트에서 자릿수가 맞는다. 보이는 숫자는 반올림하지 않고 버린다(plan.md §5)
7. 숫자를 지어내지 않는다. 예시 숫자는 늘 "예시" 표시와 함께 쓰고, 실제 화면은 자료가 없으면 조용한 빈 상태다
8. 휴대폰과 PC를 모두 맞춘다. 휴대폰은 한 줄 배치와 44px 누름 영역, PC는 12칸이다

## 하지 마라
| 금지 | 이유 |
|------|------|
| 그라데이션(바탕·글자·선), 원형 빛, 격자 바탕, 유리 효과(blur·`backdrop-filter`), `filter` | 장식이다. "AI가 만든 템플릿" 느낌 **(사용자)** |
| 카드 그림자, 떠 있는 카드 | 그림자는 떠 있는 층(계정 메뉴·확인 창·툴팁·[전체 메뉴] 판·1분 전 안내·건너뛰기 링크)에만 쓴다 |
| 상자 안 상자(테두리 상자 안에 또 테두리 상자), 같은 카드 반복 | 같은 상자 반복이 템플릿 티의 첫째 원인이다. 안쪽은 선으로 나눈다 |
| 큰 둥글기(8px 넘는 모서리, 999px 둥근 단추) | 모서리는 4px(조작 요소·패널)와 8px(떠 있는 층)뿐이다 |
| 두 번째 글꼴(IBM Plex Sans KR·Space Grotesk 등) | Pretendard 하나만 쓴다 **(사용자, 2026-10-30)** (업무일지 양식 칸은 예외 — 아래 '업무일지 양식') |
| 700 굵기(`font-bold` 등)와 300 이하 굵기 | 글꼴 파일이 400·500·600뿐이라 다른 굵기는 가짜 굵게가 된다 (업무일지 양식 칸은 예외 — 아래 '업무일지 양식') |
| 지어낸 숫자(예시 표시 없는 숫자), 실제 화면의 예시 숫자 | 믿고 쓰는 데이터 서비스여야 한다. 예시는 랜딩·로그인 미리보기에서만 "예시" 표시와 함께 쓴다 |
| 일러스트·사진·영상, 이모지, 반짝이(✦) 아이콘, "Powered by AI" | 그림 대신 제품 화면을 보여 준다 |
| 장식 애니메이션, 숫자 순환, `animate-*`·`@keyframes`, '짧은 반응 허용' 밖의 전환 효과 | 움직이는 것은 앱·랜딩·인증 화면 조작 요소의 짧은 반응과 탭 줄의 불러오기 줄 하나뿐이다(아래 '움직임') |
| 토큰 밖의 색과 값: Tailwind 기본 색(`bg-blue-500`), 대괄호 임의 값(`bg-[#…]`·`p-[10px]`), 화면 소스의 16진수·`rgb(`·`hsl(`·`color-mix(` | 값은 `:root` 한 곳이다. 16진수 색은 `:root`·`LogoMark.tsx`·`GoogleMark.tsx`에만 있다 (업무일지 양식 칸은 예외 — 아래 '업무일지 양식') |
| 제목 반쪽만 색칠, 섹션마다 다른 포인트 색 | 강조색은 하나다 |
| 영문 소제목(SIGN IN·AI ANALYSIS·PRIVACY FIRST 등) | 한국어 페이지다. 대신 넣는 것은 없다 |
| 빨강·초록만으로 좋고 나쁨 가르기 | 화살표와 글자("늘어남"·"줄어듦")를 같이 쓴다 |
| `[서비스 이름]`·`[금액]` 같은 빈칸 글자 | 자연스러운 문구로 바꿨다(아래 '문구') |

## 토큰 (`src/app/globals.css` `:root`)
- 값은 layer 밖 `:root` 한 곳에 CSS 변수로 둔다(ADR-019). 16진수·`rgb(`·`color-mix(`는 이 블록 밖에 없다(로고·구글 마크 빼고)
- 앱(Tailwind v4)은 `@theme inline`이 이 변수를 `var()`로만 가리킨다. Tailwind 기본 색·모서리·그림자·글자 크기는 `initial`로 지워서 토큰 이름만 클래스가 된다(`text-ink`·`bg-canvas`·`rounded-control`·`shadow-float`·`text-small`). 흰 글자는 `text-surface`
- 랜딩(CSS Modules)은 같은 변수를 `var(--ink)`처럼 바로 쓴다

### 바탕·선·글자
| 토큰 | 값 | 쓰는 곳 |
|------|------|------|
| `canvas` | `#F7F8FA` | 랜딩 띠(`#ai`·`#privacy`), 로그인 오른쪽, 읽기 전용 칸, 올림(hover) 바탕, 앱 안 브라우저 안내 상자 |
| `surface` | `#FFFFFF` | 앱 본문(바탕 A, 모든 앱 화면), 랜딩 페이지, 위쪽 띠·탭 줄, 인증 화면, 패널, 입력, 떠 있는 층, 주 단추 글자 |
| `line` | `#E5E7EB` | 1px 나눔 선, 패널·층 테두리, 표 줄, 차트 눈금선 |
| `line-strong` | `#D1D5DB` | 보조 단추·입력·체크 상자 테두리, 차트 0 선, 순위 막대의 '그 밖', 단계 연결선 |
| `faint` | `#9CA3AF` | 지난 기간 눈금·범례 표시(`bg-faint`)만. **글자에는 쓰지 않는다**(아래 '대비') |
| `muted` | `#6B7280` | 보조 글, 단위, 표 머리, KPI 이름, 필수·선택 표시, 도움말, 차트 눈금 글자, 아이콘, 값 없음 "–", 미리보기의 지금 아닌 탭, 대시보드 기능 목차의 "준비 중" 상태 글자, 날짜 줄 덧말 앞 "·" |
| `ink-2` | `#374151` | 본문·안내 글, 탭 글자, 글자만 단추, 범례, 오류 번호 줄 |
| `ink` | `#111827` | 제목, 값, 표 값, 지금 탭 글자, 툴팁 바탕, 확인 창 뒤 가림막(36%) |

### 강조
| 토큰 | 값 | 쓰는 곳 |
|------|------|------|
| `accent` | `#2563EB` | 주 단추 바탕, 링크·글자 단추, 지금 탭 밑줄, 초점 고리, 입력 초점 테두리, 체크한 체크 상자, 강조 테두리 단추, 차트(신환 막대·Sparkline·빗금·집계 중 테두리), 가입 단계(지금 단계 바탕·끝난 단계 체크 12px), 랜딩 기능 번호·01 소개 줄("01 · 청구 · 삭감 예방 사전점검"), 준비 중 화면 만들 것 꾸밈 점, 랜딩 AI 약속 앞 점(휴대폰, 4×4) |
| `accent-strong` | `#1D4ED8` | 주 단추 올림, accent 칩 글자, 랜딩 시작 단계 번호 |
| `accent-soft` | `#EAF1FE` | accent 칩 바탕, Sparkline 면, 강조 테두리 단추 올림, 끝난 가입 단계 칸, 랜딩 시작 단계 번호 바탕 |

- 강조색은 위 자리에만 쓴다. 제목·장식 아이콘·섹션 바탕에는 쓰지 않는다
- 주 단추가 파랑이다(예전 ink에서 바뀜). 화면마다 주 단추는 하나만 둔다

### 상태
| 토큰 | 값 | 쓰는 곳 |
|------|------|------|
| `positive` / `positive-soft` | `#15803D` / `#ECF7EF` | 늘어남(화살표·글자), 완료 칩(승인됨·10월 확정됨·늘었어요) |
| `negative` / `negative-soft` | `#C2410C` / `#FDF0EA` | 줄어듦, 오류 카드, 입력 오류, 위험 단추 글자, 거절 칩(승인되지 않음), "여기서 멈춤" |
| `warning` / `warning-soft` | `#B45309` / `#FDF4E3` | 승인 대기 칩, "살펴볼 것" 칩 |

### 차트·항목
| 토큰 | 값 | 쓰는 곳 |
|------|------|------|
| `chart-1`~`chart-5` | `#DBE7FD` · `#B4CDFA` · `#8DB0F4` · `#2563EB` · `#1D4ED8` | 양을 나타내는 파랑 다섯 단계(옅음 → 짙음). 쌓은 막대의 재진은 `chart-3`, 신환은 `accent`(= `chart-4`) |
| `chart-prev` | `#9CA3AF` | 지난 기간(비교 대상) |
| `cat-1`~`cat-5` | `#2563EB` · `#0F766E` · `#B45309` · `#6D28D9` · `#6B7280` | 서로 다른 항목(선·계열)을 색으로 나눌 때 차례대로 쓴다. 이번 개편 부품에는 쓰는 곳이 없다(다음 대시보드 명세) |

### 대비 (흰 바탕)
- 글자 색 ink·ink-2·muted·accent·negative·warning은 4.5:1 이상이다. positive는 옅은 바탕 위에서 4.58:1로 겨우 넘는다 → 칩 글자는 500 이상
- `chart-3`(재진 막대)·`chart-prev`·`faint`는 3:1이 안 된다. 차트 값은 늘 글자와 화면 읽기 표로도 준다
- **글자는 `muted` 이상이다.** `faint`는 차트 표시(`bg-faint`)에만 쓰고 글자색으로 쓰지 않는다. 규칙 시험(`components/ui/classes.test.ts`)이 글자색 `text-faint`(변형 앞말 포함)를 잡는다. 값 없음 "–"·날짜 줄 "·"·기능 목차 "준비 중"·미리보기의 지금 아닌 탭은 `muted`다 (ui-90, 총괄 결정)
- 오류 번호 줄("오류 번호 E-…")은 `ink-2`다. `negative-soft` 위에서 `muted`는 4.5:1이 안 된다(4.33:1)

### 대시보드 빈 자리가 쓰는 옛 이름
- 옮기는 동안 둔 옛 이름은 정리 TASK(TASK-23)에서 지웠다. 새 코드는 새 토큰과 `ds`만 쓴다
- 예외는 옛 빈 자리 `src/components/dashboard/DashboardEmpty.tsx`(tab-frame부터 그리지 않지만 남겨 둠)가 아직 쓰는 것뿐이다. 그 파일을 지울 때 함께 지운다
  - `@theme` 별칭 넷: `rounded-card`(`--r-control`) · `text-table`(small) · `text-panel`(subtitle) · `text-title-sm`(title). 값은 새 토큰을 가리킨다
  - 옛 모양 묶음 `ui`(`classes.ts`)의 세 키 `card`·`panel`·`panelTitle`(값 그대로)
- 랜딩 옛 변수(`--ok`·`--danger`·`--accent-tint`·`--field`·`--content-max`)와 나머지 옛 Tailwind 이름(`text-tab`·`text-logo`·`text-kpi*`·`rounded-chip`·`*-ok`·`*-danger`·`*-warn`)은 없다
- 규칙 시험(클래스 규칙·상자 겹침·옛 이름 검사)은 `DashboardEmpty.tsx` 한 파일만 빼고 앱 화면 전체를 본다(대시보드 두 폴더의 새 파일은 저절로 든다, tab-frame AC-313.3). 16진수 색·굵기 검사는 그 파일도 본다

## 글자 (Pretendard 하나)
- 글꼴: Pretendard 1.3.9 정적 subset 세 굵기 400·500·600. `next/font/local`로 우리 쪽에서 낸다(`src/app/fonts/`, 사용 허락 파일 `OFL.txt` 함께) **(사용자, 2026-10-30)**
  - 변수 `--font-pretendard` → 토큰 `--font-ui`(뒤에 'Apple SD Gothic Neo'·'Malgun Gothic'·system-ui)
  - subset 밖의 드문 한글 음절은 시스템 글꼴로 보인다
- 굵기: 본문 400, 이름표·단추·칩 500, 제목·값·지금 탭 600. 이 셋뿐이다
- 숫자는 고정폭(`font-variant-numeric: tabular-nums`, `.app-ui`와 랜딩 `.root`에 둔다). 한글 줄바꿈은 `word-break: keep-all`
- 768px 미만은 `-m` 단계(heading-m·display-m), 이상은 PC 단계를 쓴다

| 단계(`text-*` · `--fs-*`/`--lh-*`) | 크기/줄 | 굵기·자간 | 쓰는 곳 |
|------|------|------|------|
| `caption` | 12/16 | 400~500 | 칩, 툴팁, 도움말·오류 문구, 차트 눈금·기간 글자, 오류 번호, 바닥글 |
| `small` | 13/20 | 400 | 표, 칸 이름(600), KPI 이름, 보조 글, 범례, 작은 단추, 한국 시각 |
| `body` | 14/22 | 400 | 기본 본문, 단추, 탭, 입력(PC), 랜딩 메뉴 링크 |
| `lead` | 16/24 | 400 | 히어로 안내 문장, 휴대폰 입력 글자 |
| `subtitle` | 16/24 | 600 | 패널 제목, h3, 앱 띠 의원 이름, 빈 상태 제목 |
| `title` | 20/28 | 600 | 앱 페이지 제목(대시보드·관리자·앱 안 없는 주소), 랜딩 기능 01 h3 |
| `heading-m` | 24/32 | 600, -0.01em | 휴대폰 섹션 제목·인증 화면 h1, 작은 KPI 값 |
| `heading` | 28/36 | 600, -0.01em | 랜딩 섹션 제목(h2), 인증 화면 h1 |
| `metric` | 28/36 | 600, -0.01em, 고정폭 | KPI 값 |
| `display-m` | 32/40 | 600, -0.02em | 휴대폰 히어로 제목, 개인정보 "0건" |
| `display` | 48/56 | 600, -0.02em | 히어로 제목, 개인정보 "0건" |

- 자간 토큰: `--ls-heading`(-0.01em, heading·heading-m·metric), `--ls-display`(-0.02em, display·display-m)
- 큰 제목은 `text-wrap: balance`이고 줄바꿈 태그를 넣지 않는다

## 간격
- 단계: 0 · 2 · 4 · 6 · 8 · 12 · 16 · 20 · 24 · 32 · 48 · 64 · 96px
  - Tailwind로는 `0`·`0.5`·`1`·`1.5`·`2`·`3`·`4`·`5`·`6`·`8`·`12`·`16`·`24`와 `px`(1px)다
  - 사용자 표 9단계(4·8·12·16·24·32·48·64·96)에 패널 안쪽 20, 칩·툴팁 안쪽 2·6을 더했다
  - 랜딩 CSS는 이 밖에 `scroll-margin-top`의 72·80과 `%`·`auto`·`var(--gutter*)`만 쓴다
- 대괄호 임의 값(`gap-[10px]`)과 단계 밖 값(`p-2.5`)은 쓰지 않는다. 시안의 9·10·11·14px은 가까운 단계나 고정 높이로 바꿨다
- 높이(단추 32·36·44px, 표 줄 44px 등)는 간격이 아니라 조작 요소 크기다
- 자주 쓰는 자리: 앱 본문 좌우 24(휴대폰 16), 대시보드 덩어리 사이 48(휴대폰 32, 선 하나로 나눔), 패널 안쪽 좌우 20, 폼 칸 사이 20, 랜딩 섹션 위아래 48 → 64 → 96

## 모서리·선·그림자
- 모서리는 두 가지다
  - `rounded-control`(`--r-control` 4px): 단추·입력·체크 상자·칩·패널·오류 카드·미리보기 상자
  - `rounded-float`(`--r-float` 8px): 떠 있는 층(계정 메뉴·확인 창·1분 전 안내)·툴팁·건너뛰기 링크
  - 그 밖은 `rounded-none`이다
  - 모서리 안 넘침 자르기는 `overflow-clip`으로 한다. `overflow-hidden` 클래스는 쓰지 않는다: 시험 파일이 '없어야 할 클래스'로 그 글자를 쓰고(Tailwind는 시험 파일을 읽지 않는다) `src/app/theme.test.ts`가 그 클래스가 CSS에 만들어지지 않는 것을 본다. 화면 소스에 쓰면 그 클래스가 만들어져 시험이 깨진다(`overflow-clip`은 같은 자르기이고 스크롤 상자를 만들지 않는다)
- 선: 1px `line`이 기본이고, 조작 요소 테두리는 1px `line-strong`이다
  - 굵은 선은 지금 탭 밑줄(2px `accent`) 하나다(앱 탭·관리자 화면 안 탭·미리보기 탭)
  - 진한 선은 랜딩 비교표 머리 아래와 휴대폰 표 첫 줄 위의 1px `ink`뿐이다
- 그림자: `shadow-float`(`--elev-float`: `0 1px 2px` ink 6% + `0 6px 16px` ink 10%) 하나. 떠 있는 층·툴팁·[전체 메뉴] 판·건너뛰기 링크에만 쓴다. 확인 창 뒤 가림막은 ink 36%

## 칸·폭
- 화면 폭 기준은 768px·1024px 두 개다. 휴대폰 값을 먼저 쓰고 넓어지면서 바꾼다
  - Tailwind: `md:`(768)·`lg:`(1024)·`max-md:`·`max-lg:`만 쓴다. `sm:`·`xl:`은 쓰지 않는다
  - 랜딩 CSS: `@media (min-width: 768px)`·`(min-width: 1024px)`, 숨김 도우미만 `(max-width: 767.98px)`
- 1024px 이상은 12칸이다(칸 사이 24px). 768px 미만은 한 줄이다
  - 랜딩 768~1023px: 두 칸 배치는 위아래로 쌓고, 목록 두 칸(개인정보 약속)은 두 칸 그대로 둔다
  - 앱 화면은 주로 768px에서 휴대폰/PC 모양이 바뀐다. 탭 줄 밀기·로그인 두 칸은 1024px 기준이다
- 랜딩 내용 폭: 1200px(`--w-landing`) + 좌우 24px(`--gutter`, 768px 미만 16px `--gutter-m`)
- 앱 내용 폭: 1280px(`--w-app`, `max-w-7xl`) + 좌우 24px(768px 미만 16px). 위쪽 띠·탭 줄·본문이 같은 감싸개 폭이라 왼쪽 끝이 맞는다
- 인증 화면: 480px 한 칸. 로그인은 1024px 이상에서 두 칸(왼쪽 400px 칸)이다
- 가로 스크롤은 없다(390·768·1440에서 확인). 넘치는 것은 제 감싸개 안에서만 옆으로 밀린다(1024px 미만의 앱 탭 줄)

## 공통 모양 (`components/ui/classes.ts`의 `ds`)
앱 화면은 반복 모양을 `ds` 묶음에서 가져다 쓴다. 랜딩은 `components/landing/base.module.css`에 같은 종류를 같은 토큰 값으로 둔다(`.btn*`·`.chip*`).

### 단추
| 크기 | 높이 | 좌우 | 글자 |
|------|------|------|------|
| 기본(`primary`·`secondary`·`danger`) | 36px | 16px | body 500 |
| 작은(`…Small`) | 32px | 12px | small 500 |
| 큰(`…Large`) | 44px | 20px | body 600 |

- 휴대폰(768px 미만)에서는 모든 단추가 44px다(`max-md:h-11`)

| 종류 | 모양 | 올림 |
|------|------|------|
| 주(`primary`·`primarySmall`·`primaryLarge`) | `accent` 바탕, `surface` 글자 | `accent-strong` 바탕 |
| 보조(`secondary`·`secondarySmall`) | `surface` 바탕, 1px `line-strong`, `ink` 글자 | `canvas` 바탕 |
| 강조 테두리(`accentOutlineSmall`) | `surface` 바탕, 1px `accent`, `accent` 글자 600 | `accent-soft` 바탕 |
| 글자만 기본(`ghost`) | 테두리 투명, `ink-2` 글자, 기본 크기(36px·좌우 16px·body 500, 휴대폰 44px) | `canvas` 바탕 |
| 글자만 작은(`ghostSmall`) | 테두리 투명, `ink-2` 글자, 좌우 8px | `canvas` 바탕 |
| 위험(`danger`) | 보조 모양 + `negative` 글자 | 보조와 같음 |
| 구글(`googleLarge`) | 보조 모양 + 44px, 가운데 정렬, 사이 8px, 600. 안에 `GoogleMark` 18 | 보조와 같음 |
| 글자 단추(`textButton`) | 바탕 없음, `accent` 글자, body 500, 휴대폰 44px 높이 | 밑줄 |

- 모두 `rounded-control`, 줄바꿈 없음, 그림자 없음
- 초점: 2px `accent` 고리, 2px 띄움. 모든 조작 요소가 같다
- 막힘: 40% 흐림 + `not-allowed` 커서. 대시보드에는 아직 없는 기능의 막힌 단추가 없다 — 기능 목차 칸과 탭은 모두 링크이고, 화면이 없는 기능은 그 주소의 준비 중 화면으로 간다. 대시보드에서 막히는 것은 연결 뒤 오늘 자료가 없을 때의 [복사] 하나다(`aria-disabled` + 툴팁 "문장이 생기면 복사할 수 있어요"). 탭 줄에는 막힌 탭·툴팁이 없다
- 기다림(누른 뒤 답을 기다리는 동안): `aria-busy="true"` → 60% 흐림 + `progress` 커서(`aria-busy:opacity-60 aria-busy:cursor-progress`). `disabled`를 쓰지 않아 막힘(40%)과 겹치지 않고, 누름 처리 함수가 기다리는 동안 다시 누름을 무시한다. 글자도 바꾼다("구글로 넘어가는 중…"·"보내는 중…"·"확인 중…")
- 쓰는 곳 예: 관리자 [승인] 강조 테두리 작은 · [거절]·[되돌리기] 보조 작은 / 승인 대기 위 줄 [로그아웃] 글자만 작은 / [가입 신청]·[상태 다시 확인] 주 큰 / 오류 화면 [다시 시도] 주 · [대시보드로] 보조 · [로그아웃] 글자만 기본 / 확인 창 [취소] 보조 · [거절] 위험
- 반응은 `ds` 안에 있다: `ds.button`의 모든 키와 `ds.textButton`이 `transition`(150ms)을 갖고, 단추 키는 막히지도 기다리지도 않을 때만 누름 아래 1px(`not-disabled:not-aria-disabled:not-aria-busy:active:translate-y-px`)이다. 화면 파일이 따로 붙이지 않는다(tab-frame 화면 파일이 붙여 둔 같은 클래스는 같은 값이라 그대로 둬도 된다). '움직임 › 짧은 반응 허용'을 따른다

### 칩
- 모두 20px(`h-5`), 좌우 6px, caption 500, `rounded-control`, 1px 테두리, 아이콘(12px)과 글자 사이 4px

| 종류 | 바탕 / 테두리 / 글자 | 쓰는 곳 |
|------|------|------|
| `neutral` | `canvas` / `line` / `ink-2` | 준비 중, 대기(비트 PC 연결 단계), 없는 주소, 비트 PC 연결 전(대시보드 오늘 하루 분석), 추정, 예시(랜딩 AI 리포트) |
| `accent` | `accent-soft` / 투명 / `accent-strong` | 예시 숫자(미리보기), 확인 중·할 차례(비트 PC 연결 단계) |
| `positive` | `positive-soft` / 투명 / `positive` | 완료(비트 PC 연결 단계, `Icon check`), 쓸 수 있어요(랜딩 기능 01, `Icon check`), 승인됨, 10월 확정됨, 늘었어요 |
| `negative` | `negative-soft` / 투명 / `negative` | 버전 안 맞음·의원 다름(비트 PC 연결 단계, `Icon x`), 승인되지 않음, 문제가 생겼어요(오류 화면, `Icon stop`) |
| `warning` | `warning-soft` / 투명 / `warning` | 승인 대기, 살펴볼 것 (그대로) |

- 빨강(`negative`)은 진짜 문제(버전 안 맞음·의원 다름·승인되지 않음·오류 화면)에만 쓴다. 비트 PC 연결의 첫 상태와 다시 확인으로 풀리는 실패는 `accent` "할 차례"다

- 관리자 표 줄에는 상태 칩을 두지 않는다(탭이 상태다). 승인 줄의 "승인됨" 완료 칩만 둔다
- 관리자 화면 안 탭의 개수는 칩이 아니라 글자(muted 500)다

### 입력
- `ds.input`: 44px(모든 폭), 좌우 12px, `surface`, 1px `line-strong`, body(휴대폰 16px `text-lead`, 아이폰 확대 방지), `rounded-control`
  - 올림: 테두리 `muted`. 초점: 테두리 `accent` + 1px `accent` 고리. 오류(`aria-invalid`): 테두리 `negative`
- `ds.readonly`(읽기 전용 칸): 44px 이상, `canvas`, 1px `line`, `ink-2`. 안쪽에 초점이 오면 `accent` 테두리 + 1px 고리
- `ds.label`: 칸 이름 small 600 ink. 옆 `ds.labelHint` "필수"·"선택" caption 400 muted
- `ds.help`: 도움말 caption muted. `ds.fieldError`: 칸 아래 오류 문구 caption 500 negative
- `ds.checkbox`: 16px, `rounded-control`, 1px `line-strong` → 체크하면 `accent` 바탕 + 흰 체크

### 표
- 머리 칸: 40px, small 500 muted, 아래 1px line
- 몸 칸: 44px, small ink, 아래 1px line. 마지막 줄 아래에는 선이 없다
- 칸 좌우 12px, 첫 칸 왼쪽·끝 칸 오른쪽 20px(패널 안쪽과 맞춤). 숫자 칸은 오른쪽 정렬·고정폭
- 줄무늬·모서리·바깥 테두리가 없다. 줄 올림은 `canvas`
- 빈 탭은 머리를 두고 칸 전체를 잇는 한 줄에 안내 문구를 둔다(지금 그대로)

### 패널·떠 있는 층
- `ds.panel`: `surface`, 1px line, `rounded-control`, 그림자 없음
  - `ds.panelHead`: 좌우 20px, 위 16px(휴대폰 16·12). 제목 `ds.panelTitle` subtitle 600 ink, 보조 글 small muted
  - `ds.panelBody`: 좌우 20px, 위 16px, 아래 20px(휴대폰 16·8·16)
- `ds.layer`(떠 있는 층: 계정 메뉴·확인 창·자동 로그아웃 1분 전 안내): `surface`, 1px line, `rounded-float`, `shadow-float`
- 대시보드(1안 오늘 브리핑)는 패널 상자 없이 흰 바탕 위에서 선으로 나눈다(아래 '대시보드'). 패널 묶음(`panel`·`panelHead`·`panelTitle`·`panelBody`·`count`)과 표의 `tdNum`·`check`, `button.primarySmall`은 대시보드에서 쓰지 않는다. 준비 중 화면도 바깥 상자가 없다(아래 '빈 상태'). `ds.panel` 틀은 앱 안 없는 주소 화면이 쓴다(아래 '오류 카드·확인 창')
  - 비트 PC 연결 화면(`/claim/setup`의 준비 순서·이 PC·이렇게 지켜요)이 패널 묶음과 `button.primarySmall`을 쓴다(`specs/precheck` REQ-034)
- 카드 모양은 없다. 인증 화면·랜딩 목록은 상자 없이 선과 여백으로 나눈다

### 상자 안 상자 금지
- 상자: `aria-hidden` 밖의 `div`·`section`·`article`·`ul`·`ol`·`li`·`dl`·`table`·`aside`·`form` 가운데 네 변 테두리(`border`)를 가진 것. 랜딩은 네 변 테두리를 주는 모듈 클래스도 상자다
- 상자 안에 상자를 두지 않는다. 랜딩은 섹션마다 맨 바깥 상자가 하나 이하다
- 입력란 그림처럼 `aria-hidden`인 조작 요소 그림은 상자가 아니다
- 예: 앱 안 브라우저 안내는 안의 주소 칸이 테두리를 가지므로 바깥 안내 상자에는 테두리를 두지 않는다(canvas 바탕만)
- 시험 도우미: `src/testing/boxes.ts`의 `nestedBoxes`
- 업무일지 종이(`.paper`) 안 엑셀 표의 칸 선은 상자가 아니다(엑셀 칸 선)

## 차트 (`components/charts`)
| 부품 | 그리는 것 |
|------|------|
| `format.ts` | 보이는 숫자 글자. `formatCount`(세 자리 쉼표), `formatRate`(0~1 → %, 소수 첫째 자리 버림), `formatDelta`(증감 글자·방향·화면 읽기 글자), `percentOf`(그리는 위치 %) |
| `scale.ts` | `niceScale`: 눈금 간격과 최대 |
| `KpiStat` | 이름 + Sparkline → 값 + 단위 → 증감 줄 |
| `Sparkline` | 작은 선 그래프(88×28, 작은 것 56×22) |
| `StackedBarChart` | 주별 쌓은 막대(신환·재진) + 화면 읽기 표 |
| `ChartLegend` | 범례(accent 면 · chart-3 면 · 빗금 · 지난 기간 막대) |
| `RankedBars` | 순위 막대(동네 등) |
| `InlineBar` | 표 줄 안 작은 막대(이번 값 + 지난 기간 눈금) |

- **서버에서 그대로 그린다.** `'use client'`·React 훅·타이머·`animate-*`·`transition*`이 없다. 움직이지 않는다
- **막대는 HTML이다.** `div`/`span`에 % 높이·폭(inline style)을 주고, 눈금 글자·값 글자는 HTML 글자로 쓴다. 그래서 칸 폭이 바뀌어도 글자는 늘 12px이다
  - inline style은 % 값(0~100, 소수 둘째 자리)뿐이다: 쌓은 막대 `height`·`bottom`, 순위 막대 `width`, 줄 안 막대 `width`·`left`
  - SVG는 Sparkline, 빗금(패턴·id 없이 `<path stroke="currentColor">` 하나, 4px 간격), 화살표, 범례 표시에만 쓴다
- **색은 토큰 클래스로만 준다**(`fill-accent`·`stroke-accent`·`bg-chart-3`·`bg-line-strong`·`bg-faint` …). svg의 `fill`·`stroke` 속성 값은 `currentColor`·`none`뿐이다
  - 신환 `accent`, 재진 `chart-3`, 지난 기간 `faint`(표시만, `bg-faint`), '그 밖'·'주소 없음' `line-strong`
  - Sparkline: 면 `accent-soft` → 선 `accent` 1.5 → 끝점(`accent`, 테두리 `surface`)
- **접근성.** 그림은 모두 `aria-hidden="true"`이고 `role="img"`를 쓰지 않는다
  - 쌓은 막대는 `sr-only` 표가 숫자를 준다(caption "<제목> (<단위>)", 기간 · 계열 · 합계 · 상태)
  - KpiStat·RankedBars는 보이는 글자가 곧 정보다
  - 증감 방향은 화면 읽기 글자("늘어남"·"줄어듦")로도 준다
- **숫자 글자는 버린다**(반올림 안 함, plan.md §5)
  - 비율은 소수 첫째 자리까지 버림(`0.18347` → `18.3`). 부동소수 오차를 막으려고 아주 작은 값을 더한 뒤 자른다
  - 빼기 기호는 U+2212(−), 비율 차이는 `%p`
  - 증감 글자: `17명 (+2.4%)` · `12명 (−2.1%)` · "변화 없음" · "새로 생김" · "집계 중" · "비교할 수 없음". 화살표는 늘어남(positive)·줄어듦(negative)에만, 나머지는 muted
  - 값이 없으면 "–"(`muted`) + "자료 없음"(small muted)이고 Sparkline·증감 줄이 없다
- **눈금.** 간격 = 최대 합계/4 이상인 가장 작은 {1, 2, 2.5, 5}×10ⁿ(1 이상), 최대 = 간격×4(714 → 0·200·400·600·800). 작은 차트(`compact`)는 0·400·800 세 줄만 그린다
  - 가로 눈금선만 있다(0 선 `line-strong`, 나머지 `line`). 세로 선·바깥 테두리가 없다
  - 단위 "(명)"은 위 왼쪽, 눈금·기간 글자는 caption muted 고정폭
- **쌓은 막대.** 첫 계열이 맨 위이고 범례 첫째다. 계열 사이는 2px 띄운다. 막대 폭은 칸의 반, 최대 40px(`compact` 20px)
  - 막대 위 합계는 caption ink-2이고, 마지막 완료 칸만 600 ink다
  - 집계 중·일부 기간 칸은 한 막대로 그리고 빗금(accent 1px 선, 4px 간격 45°) + 1px accent 테두리를 쓴다. 기본 크기에서는 위에 "집계 중"·"일부 기간"을 붙인다
- **순위 막대.** 값 큰 순(같으면 받은 순서), '그 밖' 항목은 맨 뒤. 막대 높이 10px, 폭은 '그 밖' 아닌 최대 값 대비 %. 값 "168명"(small 600), 몫 "23.5%"(small muted, 버림)
- **불러오기.** 폴더 밖에서는 `react` 타입과 `@/types/analysis`의 타입(`Delta`·`BucketState`)만 불러온다. 차트 라이브러리를 쓰지 않는다(새 npm 패키지 없음)
- 차트 툴팁(마우스 올림 상자)은 이번에 없다. 다음 대시보드 명세에서 정한다

## 미리보기 (`components/preview`, 예시)
- `DashboardPreview` 하나를 랜딩 히어로와 로그인 오른쪽이 같이 쓴다. 차트 부품으로 그린 대시보드 축소판이다
- 자료는 `sample.ts`의 예시뿐이다(시안 `parts.mjs`의 `WEEKS` 8주, 의원 이름 "예시정형외과의원"). 실제 자료를 읽지 않는다. 증감·비율은 이 예시 자료 파일 안에서만 계산한다
- 짜임: 상자 하나(`surface`·1px line·`rounded-control`·`overflow-clip`) 안에
  1. 위 줄: `LogoMark` 18 + 의원 이름 · 오른쪽 accent 칩 "예시 숫자"
  2. 탭 줄: `<span>` 13개 = 실제 탭 이름(`MENU` 순서, `sample.ts`의 `PREVIEW_TABS`. 미리보기 소스는 `components/shell`을 불러오지 않고 시험이 `MENU`와 견준다). 첫째만 지금 탭, 나머지 `muted`. 한 줄 높이에서 넘치는 탭은 통째로 숨는다(`flex flex-wrap h-9 overflow-clip`, 스크립트 없음)
  3. KPI 4개(작은 `KpiStat`). 768px 이상 4칸, 미만 2×2. 칸 사이 1px 선
  4. "주별 환자 수" + 범례(신환 · 재진 · 집계 중) → 작은 쌓은 막대. 768px 미만은 날짜 글자를 하나 걸러 보인다(`StackedBarChart`의 `thinLabels`, 주지 않으면 지금 그림 그대로)
- 받는 것·누르는 것·이정표가 없다. `a`·`button`·`input`·`select`·`textarea`·`label`·`form`·`header`·`nav`·`main`·`section`·`footer`·`tabindex`를 쓰지 않는다. `'use client'`·타이머도 없다
- 숫자는 늘 위 줄의 "예시 숫자" 칩과 함께 보인다
- 버림 규칙 때문에 시안과 조금 다른 값: 신환 증감 "+3.9%"(시안 +4.0%), 신환율 증감 "0.2%p"(시안 0.3%p)
- 랜딩 섹션 모듈은 미리보기 바깥 자리(`.shot`)만 정하고 안쪽 요소를 고르지 않는다. layer 밖 랜딩 CSS가 Tailwind 클래스를 이기기 때문이다

## 빈 상태
- 실제 화면은 자료가 없으면 조용한 빈 상태다. 예시 숫자·차트·"예시" 칩으로 빈칸을 채우지 않는다. 그림·큰 아이콘을 쓰지 않는다
- 꾸밈 예외가 없다. 빈 그래프 틀·글자 없는 꾸밈 선을 그리지 않는다 (ui-90)
- 대시보드(`/dashboard`): 자료가 없으면(지금은 늘 그렇다) '연결 전' 모양이다. 큰 문장 자리는 연결 안내, 숫자 칸은 "–"(`muted`) + "연결하면 보여요", 기간별 흐름 자리는 그래프 대신 **"연결하면 생기는 것 4가지"**(subtitle 600 + 순서 목록 4개 + 안내 한 줄)다. 빈 그래프 틀·차트 부품을 그리지 않는다. 문구는 시안 `docs/mockups/ui-90/app/gen.py` `dash_body`다(아래 '대시보드')
- 준비 중 화면(화면이 아직 없는 기능 주소, `components/common/NotReadyScreen.tsx`): 바깥 상자(`ds.panel`·네 변 테두리)·꾸밈 선·고정 높이가 없다. 기능별 문구(이름·`title`·소개·만들 것)는 `components/common/notReadyFeatures.ts` 한 곳이다
  - 왼쪽 칸: `neutral` 칩 "준비 중" → h1 = 그 항목의 `title`("통계는 준비 중이에요"처럼 조사까지 자료에 통째로, heading · 휴대폰 heading-m) → 소개(lead `ink-2`, 최대 폭 단계) → [대시보드로 돌아가기](보조 단추 + 왼쪽을 보는 화살표, 휴대폰 전체 폭)
  - 오른쪽 칸: h2 "만들 것"(small 600 muted) + 점 목록(`ul`, 받은 순서, 꾸밈 점 `accent`)
  - 그 아래 전체 폭(위 1px `line`): h2 **"그동안 쓸 수 있어요"** + [비트 PC 연결](`/claim/setup`) "청구 점검을 쓰려면 먼저 해요" · [청구](`/claim`) "삭감 예방 사전점검"(글자 단추 + 화살표)
  - 1024px 이상 12칸(왼쪽 1~6 · 오른쪽 8~12), 768px 미만은 쌓는다(만들 것 위 1px `line`)
  - 청구 연결됨 화면도 같은 모양을 쓴다(`action`에 [비트 PC 연결 다시 확인], `meanwhile={false}`라 "그동안 쓸 수 있어요" 없음)
- 관리자 빈 탭: 표 머리를 두고 한 줄 안내(시안 문구, "대기 중인 신청이 없어요" 등)

## 앱 틀 (붙는 띠 + 탭)
- **건너뛰기 링크**: 문서 순서로 첫 조작 요소가 `<a href="#main">본문으로 건너뛰기</a>`다. 평소에는 `sr-only`, 키보드 초점이면 왼쪽 위 띠 위에 보인다(높이 44px, `surface`, 1px `line`, `rounded-float`, `shadow-float`, body 600, 2px `accent` 초점 고리). 본문 `main`은 `id="main"`·`tabIndex={-1}`이다
- **탭 이름**(브라우저 탭): 앱 화면은 "화면 이름 · 의원 이름"(`(app)/layout.tsx`의 `generateMetadata`, 레이아웃과 같은 요청 안 캐시 읽기 `currentMe`). 화면 이름은 대시보드·통계·청구·매출·비트 PC 연결·가입 승인·업무일지와 준비 중 기능의 이름이고 모두 다르다. 앱 밖은 "화면 이름 · 병원 업무 도구"(뿌리 `title.template`): 처음 화면 "숫자로 보는 우리 의원" · 로그인 · 가입 신청 · 승인 대기 / 가입 승인 안 됨 · 없는 주소 "찾는 화면이 없어요" · 오류 화면 "오류 · 병원 업무 도구"
- 위쪽 띠와 탭 줄이 한 묶음으로 화면 위에 붙어 따라온다(`sticky top-0 z-10`). 위쪽 가로 탭을 그대로 쓴다 **(사용자, 2026-10-30)**
- **위쪽 띠**(`<header>`): `surface`, 아래 1px line, 56px(768px 미만 48px)
  - 왼쪽: `LogoMark` 24 + 의원 이름(subtitle 600, 넘치면 말줄임. 768px 미만 body 600)
  - 오른쪽: 한국 시각(`KstClock`, small muted, 768px 미만 숨김) · 계정 단추. 사이 16px
  - `[서비스 이름]`과 세로 구분선이 없다. 서비스 이름이 정해질 때까지 로고 옆에는 의원 이름만 둔다
- **계정 단추**: 작은 보조 단추(32px) 모양에 사람 아이콘 16 + 이메일 + 아래 화살표. 이메일 칸은 768px 이상에서 최대 240px(`md:max-w-60`)이고 그보다 길 때만 말줄임이다. 메뉴는 `ds.layer`, 폭 240px. 768px 미만은 44×44 아이콘 단추(테두리 없음, `aria-label`에 이메일)
  - 메뉴 항목: 관리자만 첫 항목 [가입 승인](`/admin`, 꾸밈 `userCheck` 16 `ink-2`, 숫자·칩 없음) → [로그아웃](꾸밈 `logout`). 관리자 화면은 탭이 아니라 이 항목으로 간다
  - 열면 첫 항목에 초점, ↓↑로 항목 사이를 돈다(끝에서 처음으로). Esc·Tab·바깥 누름은 닫는다. 메뉴 층은 나타날 때만 움직인다('움직임')
- **탭 줄**: 44px(모든 폭), `surface`, 아래 1px line. 1024px 이상에서 위쪽 띠와 같은 폭·여백이다. 첫 탭은 줄 한 곳의 `[&>:first-child]:-ml-3`으로 모든 폭에서 왼쪽으로 12px 당겨, 첫 탭 글자가 로고 왼쪽 끝과 맞는다
  - 순서와 주소(13개, `components/shell/menu.ts`의 `MENU`): 대시보드 `/dashboard` · 통계 `/stats` · 청구 `/claim` · 고시·공지 `/notices` · 환자 `/patients` · 매출 `/revenue` · AI 리포트 `/ai-report` · 서식 `/forms` · 직원 `/staff` · 업무일지 `/worklog` · 재고 `/inventory` · 주소록 `/contacts` · 설정 `/claim/setup`(비트 PC 연결 화면). 관리자 탭과 세로 구분선이 없다(관리자 화면은 계정 메뉴 [가입 승인])
  - 화면이 아직 없는 탭(고시·공지, 환자, AI 리포트, 서식, 직원, 재고, 주소록)은 그 주소의 준비 중 화면으로 간다(아래 '빈 상태'). `MENU` 항목마다 `ready`가 있고 대시보드·통계·청구·매출·업무일지·설정만 `true`다. 기능에 화면이 생기면 `menu.ts`·`components/dashboard/briefing/features.ts`·`components/common/notReadyFeatures.ts`와 그 주소의 페이지를 같이 바꾼다
  - 지금 탭은 `menu.ts`의 `currentMenuLabel`이 정한다: 탭 주소 가운데 가장 길게 맞는 것이 이긴다. `/claim`·`/claim/…`은 [청구], 비트 PC 연결 `/claim/setup`은 [설정](`/claim`보다 길게 맞는다). `/admin`에서는 지금 탭이 없다
  - 1024px 미만에서는 탭 띠가 옆으로 밀린다(얇은 스크롤바). 지금 탭과 키보드 초점이 간 탭이 보이게 띠만 민다
- **[전체 메뉴]**(1024px 미만, tab-frame AC-303.5 "메뉴 단추 없음"을 대체, 768px 폭도 같다): 탭 띠 오른쪽 끝, 띠 밖에 단추(44px, 왼쪽 1px `line`, `accent` 600, 꾸밈 `chev`, `aria-expanded`·`aria-controls`). 1024px 이상에서는 보이지 않는다(`lg:hidden`)
  - 누르면 탭 줄 바로 아래 판(`surface`, 아래 1px `line`, `shadow-float`): 머리 "모든 탭 13개" · "준비 중 n개"(small muted, 숫자는 `MENU`에서) → 2칸 목록(`ul`) 링크 13개(`MENU` 순서, 44px). 지금 탭은 `aria-current="page"`(`accent-strong` 600 + 왼쪽 2px `accent` 막대), 준비 중 탭은 `neutral` 칩 "준비 중"
  - 단추를 다시 누름·Esc(초점은 단추로)·판 안 링크 누름·판 밖 누름·경로 바뀜에 닫힌다. 판은 나타날 때만 150ms 흐림 → 보임이고 꺾쇠는 180° 돈다
- **누른 탭 먼저 + 불러오기 줄**: 지금 경로와 다른 탭(또는 [전체 메뉴] 판 링크)을 누르면 그 탭이 바로 지금 탭 모양(`data-pending="true"`)이 되고, 탭 줄 맨 아래에 `aria-hidden` 2px `accent` 불러오기 줄이 차오른다('움직임'). `aria-current`는 경로가 바뀔 때 옮겨지고 그때 `data-pending`과 줄이 사라진다. 지금 탭을 다시 누르면 아무것도 바뀌지 않는다. 불러오는 동안 본문은 `(app)/loading.tsx`(`role="status"` 안 화면 읽기 글자 "화면을 여는 중이에요"만)

| 탭 상태 | 모양 |
|------|------|
| 기본 | 좌우 12px, body 500, `ink-2` |
| 올림 | 글자 `ink`(색 150ms, '움직임') |
| 지금(`aria-current="page"`) · 누른 탭(`data-pending="true"`) | `ink` 600 + 아래 2px `accent` 밑줄(좌우 12px 안쪽) |

- 모든 탭은 링크(`next/link`)다. 준비 중 탭도 기본 모양이다(흐린 글자·누를 수 없는 단추·"준비 중" 툴팁이 없다). 준비 중인지는 [전체 메뉴] 판의 칩, 대시보드 기능 목차의 상태 글자와 준비 중 화면이 알린다

- **본문**(`<main id="main">`): **바탕 A** — 모든 앱 화면이 흰 바탕(`surface`) 한 장이다. 뿌리 `div.app-ui`와 `main`이 `bg-surface`이고 바깥 회색 판(`canvas`)이 없다. 페이지가 `data-page-surface`를 달지 않는다(tab-frame AC-303.6·AC-307.8 대체) (ui-90, 총괄 결정)
  - 1280 감싸개, 좌우 24·위 24·아래 48(768px 미만 16·16·32)은 그대로다

## 대시보드 (`/dashboard`, 1안 오늘 브리핑)
- 기준: ui-90 시안 `docs/mockups/ui-90/app/`(`gen.py` `dash_body`·`STEPS5`·`FEATS`). ui-90이 바꾸지 않은 모양 값(토큰·클래스·글자 단계·간격·칸)은 tab-frame 시안 `docs/mockups/dashboard-home/index.html`과 메모 `docs/mockups/dashboard-home/notes.md`가 기준이다. 짜임·동작은 `specs/tab-frame/design.md` '대시보드 짜임'·'오늘 하루 분석 · 기간별 흐름 · 보고 문장'과 `specs/ui-90/design.md` '대시보드'
- 본문 바탕은 흰색(`surface`) 한 장이다(위 '앱 틀' 바탕 A, 모든 앱 화면이 같다). 패널 상자 없이 덩어리 사이를 위 48px + 1px `line-strong` + 20px(휴대폰 32 + 선 + 16)로 나눈다. 섹션 머리는 h2 title 600 + 옆 보조 글(small muted)
- 보조 글(숫자 칸 아래 글·안내 줄·섹션 옆 글)은 small(13px)이고, 글 덩어리는 최대 폭이 있다(시안 40em에 가장 가까운 4px 단위 폭 단계, 대괄호 값 없음)
- 위에서부터:
  1. **브리핑**: 날짜 줄 → 연결 전이면 큰 문장(h1 "비트 PC를 연결하면 오늘 숫자가 여기에 채워져요") · 안내 · [비트 PC 연결 시작](주 큰 단추, 화면의 주 단추) · 안심 줄, 오른쪽 칸에 연결 순서 5단계(칩·지금 단계 강조 없음). 연결 뒤면 원장님 보고 문장(h1 = 첫 문장) + [복사], 오른쪽 칸에 '지금 바로 쓸 수 있어요'(사전점검 · [비트 PC 연결 다시 확인], 둘째 줄 "…크롬에서 열려요.")
  2. **연결하면 바로 쓸 수 있어요** 한 줄(연결 전만): h2 + 옆 글 "삭감 예방 사전점검은 비트 PC를 연결한 뒤 열려요." 아래 줄 하나에 청구 탭 · 삭감 예방 사전점검 · 설명 · "청구 점검은 비트 PC의 크롬에서 열려요." · [비트 PC 연결부터](`/claim/setup`, 보조 + 꾸밈 화살표)
  3. **오늘 하루 분석**: 숫자 4칸(오늘 환자 수 · 신환 · 재진 · 지난주 같은 요일보다). 연결 전이면 h2 옆 `neutral` 칩 "비트 PC 연결 전", 칸마다 "–"(`muted`) + "연결하면 보여요", 아래 안내 한 줄
  4. **기간별 흐름**: 기간 단추(최근 7·30·90일, 처음 30일, 어제까지. 휴대폰 44px). 연결 전이면 그래프 대신 "연결하면 생기는 것 4가지"(subtitle 600 + 순서 목록 4개, 1024px 이상 4칸·칸 사이 1px `line`, 768px 미만 쌓기 + 안내 한 줄). 연결 뒤면 그래프 넷(환자 수 추이 · 신환 재방문율 · 요일별 환자 수 · 처방 상위)
  5. **기능 목차**: 탭 12개(대시보드 뺌). 옆 글 "n개 가운데 n개는 지금, n개는 연결하면 쓸 수 있어요"(n은 목차 자료에서 센다). 칸 하나 = 링크 하나(테두리 상자 없이 위 1px `line`). 상태 글자(`features.ts`의 `status`):
     - 통계·청구·매출(`connect-first`): 연결 전 "연결 먼저"(`ink-2` 600 + 화살표) · 연결 뒤 "사용 가능"
     - 설정·업무일지(`ready`): "사용 가능"(`accent` + 화살표)
     - 나머지(`soon`): "준비 중"(`muted`)
  6. 휴대폰 아래 단추(연결 전, 768px 미만만): 위 주 단추가 화면 밖으로 나가면 아래에 붙는 [비트 PC 연결 시작]
- 연결 전·연결 뒤는 자료 읽는 자리(`components/dashboard/summary/source.ts`) 하나로 정하고 판정은 `report != null`이다(`undefined`도 연결 전). 지금은 늘 자료 없음이라 연결 전 모양이다. 대시보드는 확장·도우미 연결 상태를 판정하지 않는다
- 칸: 1024px 이상 12칸(브리핑 왼쪽 1~7 · 오른쪽 9~12), 768~1023px 왼쪽 전체 폭(글 최대 32em) 아래에 오른쪽 칸, 768px 미만 한 줄로 쌓는다. h1은 늘 하나다
- 숫자는 받은 자료에서만 나온다. 자료가 없는 칸은 '빈 상태'대로다(지어낸 숫자 없음)

## 인증 화면
- `AuthFrame` 하나가 틀이다. 어느 모양이든 `<main>`이 하나, `LogoMark`가 하나다. 로고는 처음 화면 링크다(`<a href="/" aria-label="처음 화면으로 가기">`, 누름 영역 44px 이상, 안쪽 초점 고리)
  - **한 칸**(가입 신청·승인 대기·거절·오류): `surface` 바탕, 가운데 480px(768px 미만 좌우 16px). 맨 위 줄 `<header>` 72px(768px 미만 56px)에 `LogoMark` 28 + 오른쪽 `headerEnd`. 로고 왼쪽 끝과 본문 왼쪽 끝이 같다. 띠 테두리가 없다
  - **두 칸**(로그인, 1024px 이상 반반): 왼쪽 `surface`에 가운데 400px 칸(위 로고 · 가운데 본문 · 아래 소개 줄 caption muted). 오른쪽 `<aside aria-label="미리보기">`(`canvas`, 왼쪽 1px line)에 `LoginAside`(소개 한 줄 + `DashboardPreview`). 1024px 미만은 한 칸이고 aside와 소개 줄을 숨기며 로고를 24px로 줄인다
- 카드 상자가 없다. h1은 heading-m → heading(768)
- 문구는 시안 `docs/mockups/ui-90/entry/screens.mjs`(`loginForm`·`loginPC`·`loginPhone`·`signupBody`·`pendingBody`·`rejectedBody`) 그대로다
- 기다리는 단추는 `aria-busy="true"` + 글자 바꿈이다(위 '단추' 기다림): [구글로 시작하기] → "구글로 넘어가는 중…", [가입 신청] → "보내는 중…", [상태 다시 확인] → "확인 중…". 기다리는 동안 다시 눌러도 다시 부르지 않는다
- **로그인**: h1 "로그인" → 안내 → (오류 카드) → [구글로 시작하기](구글 단추, 전체 폭) → 개인정보 안내 줄(위 1px line, 방패 16) → 승인 안내(small muted)
  - 구글 G를 흰 사각형 안에 넣지 않는다. 앱 안 브라우저 안내 상자는 `canvas` 바탕에 테두리가 없다
- **단계 표시**(`Stepper`, 가입 신청·승인 대기): `<ol aria-label="가입 단계">` 3단계, 사이 연결선(24px·1px `line-strong`, 768px 미만 10px)
  - 끝난 단계: `accent-soft` 칸 + accent 체크, 화면 읽기 "끝남"
  - 지금 단계: `accent` 바탕 흰 번호, 글자 ink 600, `aria-current="step"`
  - 다음 단계: 1px `line-strong` 테두리, muted 번호
- **가입 신청**: 단계 → h1 → 안내 → 폼(칸 사이 20px, 첫 칸 이름 "의원 이름", [가입 신청] 주 큰 단추 전체 폭) → [다른 계정으로 로그인](글자 단추, 폼 밖 아래). 칸 오류 글의 이름표도 "의원 이름"이다(`lib/auth/signup.ts`)
- **승인 대기·거절**: 상태 줄(warning 칩 "승인 대기" 또는 negative 칩 "승인되지 않음" + "<신청일> 신청") → h1 → 안내 → "보낸 신청 내용"(h2 small 600 muted + `<dl>`, 줄마다 96px 이름, 줄 아래 1px line, 신청일 줄 없음) → 주 큰 단추 하나
  - 승인 대기: h1 "신청을 확인하고 있어요", 보낸 신청 내용 4줄(의원 이름·신청자·구글 계정·연락처), [상태 다시 확인]. 누른 뒤 아직 대기면 결과 줄(`role="status"`, `Icon clock` + "아직 승인 전이에요 · <오전|오후 h:mm> 확인", 한국 시각)
  - 거절: h1 "가입이 승인되지 않았어요", 안내 → "관리자 메일: <관리자 메일>"(아래 '문구' 설정값) + [주소 복사](보조 작은, 결과 "복사했어요"/"복사하지 못했어요. …") → 보낸 신청 내용 2줄(의원 이름·구글 계정) → [다른 계정으로 로그인](주 큰)
  - [로그아웃]은 위 줄의 글자만 단추 하나뿐이다 **(사용자, 2026-10-30)**

## 관리자
- h1 위 작은 "관리자" 표시(`Icon userCheck` 14 + small muted) → h1 "가입 승인"(title) → 안내(ink-2, 시안 40em에 가장 가까운 최대 폭 단계) → 화면 안 탭(40px, 아래 1px line): 대기 · 승인 · 거절 + 개수(글자, muted 500). 지금 탭은 ink 600 + 2px accent 밑줄, `aria-selected="true"`
- 표는 패널 틀 없이 본문 위에 바로 둔다(`surface`, 위아래 1px line, 모서리 없음). 몸 줄 56px
  - 칸: 신청일(muted 고정폭) · 의원 이름(600) · 신청자 · 이메일(ink-2) · 연락처(ink-2 고정폭) · 동작(오른쪽). 표 머리도 "의원 이름"이다
  - 칸 폭은 정해 둔다(표 최소 폭 없음, 옆으로 밀지 않는다). 1024px 이상: 신청일·신청자 120 · 연락처·동작 150, 글 칸(의원 이름·신청자·이메일)은 넘치면 말줄임 + `title`
  - 768~1023px: 신청일 116 · 신청자 80 · 연락처 136 · 동작 140으로 줄이고, 글 칸은 말줄임 대신 줄바꿈한다(터치·키보드로도 전체 값을 보고 [승인]을 누른다)
  - 동작: 대기 [승인](강조 테두리 작은) · [거절](보조 작은) / 거절 [되돌리기](보조 작은) / 승인 "승인됨"(positive 칩)
- 768px 미만: 표 머리를 숨기고 줄마다 세로로 쌓는다(본문 좌우 끝까지 닿는 띠, 줄 사이 1px line, 안쪽 12px 16px)
  - 의원 이름 + 오른쪽 신청일 → "신청자 · 이메일" → 연락처(비면 "—") + 오른쪽 단추들(44px)
  - 화면 안 탭은 44px

## 오류 카드·확인 창
- **오류 카드**(`ErrorCard`): `negative-soft` 바탕, `rounded-control`, 테두리 없음, 안쪽 12px 16px
  - 아이콘 16px(negative) + 무엇이(small 600 negative) · 어떻게 고치나(small ink-2) · "오류 번호 E-…"(caption `ink-2`, 고정폭)
  - 문구는 `lib/errors.ts` 한 곳이다
- **오류 화면**(`app/error.tsx`, 탭 이름 "오류 · 병원 업무 도구"): 한 칸 `AuthFrame` 안에 위에서부터 `negative` 칩(`Icon stop` 12 + "문제가 생겼어요") → h1 "화면을 열지 못했어요"(`errorInfo('E-PAGE-FAILED').what`, heading-m → heading) → 안내(`.fix`) → "오류 번호 E-PAGE-FAILED"(`ink-2` 이상) · "관리자 메일: <관리자 메일>"(아래 '문구' 설정값) → 단추 줄 셋([다시 시도] 주, 새로 열기 · [대시보드로] 보조, `/dashboard` 링크 · [로그아웃] 글자만 기본 `ds.button.ghost`, 사이 8px, 단추마다 `flex-[1_1_160px]`)
  - 빨간 오류 카드를 쓰지 않는다. h1은 하나다. Next가 넘긴 오류 내용(message·digest·stack)을 그리지 않고 저절로 다른 주소로 보내지 않는다
- **없는 주소 화면**(404, `components/common/NotFoundScreen.tsx`, 탭 이름 "찾는 화면이 없어요"): 열려던 주소는 `RequestedPath`(`usePathname()`의 경로만, 쿼리·해시 없음, 고정폭, `break-all`)가 글자로만 보인다
  - 앱 안(`(app)/[...rest]` → `notFound()` → `(app)/not-found.tsx`, 앱 틀 안): 패널 하나(`ds.panel`) 안에 `neutral` 칩 "없는 주소" → h1 "찾는 화면이 없어요"(title) → "주소가 바뀌었거나 잘못 적힌 것 같아요. 위 탭에서 가려는 화면을 고르거나 대시보드로 가 주세요." → "열려던 주소" + 경로 → [대시보드로 가기](`/dashboard`, 주 큰, 휴대폰 전체 폭). 상자 안 상자가 없다
  - 밖(뿌리 `not-found.tsx`, 한 칸 `AuthFrame`): 칩 "없는 주소" → h1 "찾는 화면이 없어요"(heading-m → heading) → "주소가 바뀌었거나 잘못 적힌 것 같아요. 처음 화면에서 다시 시작해 주세요." → 열려던 주소 → [처음 화면으로](`/`, 주 큰) · [로그인](`/login`, 보조 큰). Supabase·문지기·`fetch`를 쓰지 않는다(로그인 안 한 사람의 없는 주소는 지금처럼 middleware가 `/login`으로 보내므로 안전망이다)
- **확인 창**: `ds.layer`, 폭 400px, 안쪽 24px, 뒤 가림막 ink 36%. [취소] 보조 · [거절] 위험(768px 미만 나란히 반씩 44px)

## 랜딩 짜임
- 스타일링은 CSS Modules다(ADR-014). 값은 `:root` 토큰을 `var()`로만 쓴다. 공통 모양은 `components/landing/base.module.css` 한 곳에 둔다
  - 요소 초기화(`h1`·`p`·`a` 등)는 `@layer base { }` 안에 둔다. 그래야 랜딩에 놓인 Tailwind 부품(미리보기·차트)의 클래스가 이긴다
  - `.root`(surface·ink·`var(--font-ui)`·body 14/22·고정폭 숫자·`keep-all`) · `.wrap`(최대 1200 + 좌우 gutter) · `.grid`(1024px 이상 12칸, 사이 24) · `.sec`(위아래 48 → 64 → 96) · `.secCanvas`(canvas 띠) · 글자 단계(`.tDisplay`·`.tHeading` …) · 단추(`.btn*`) · 칩(`.chip*`)
  - 숨김 도우미: `.pcOnly`(768px 미만 숨김) · `.phoneOnly`(768px 이상 숨김) · `.srOnly`. `display: none`이라 화면 읽기에서도 빠지므로 휴대폰·PC에 다른 문구를 두어도 두 번 읽히지 않는다. `!important`는 이 둘에만 쓴다
  - 쓸 수 있는 값(규칙 시험 `landing/rules.test.ts`): 색 `var(--토큰)`·`transparent`·`currentColor`·`inherit` / 글자 `var(--fs-*)`·`var(--lh-*)`, 굵기 400·500·600, 자간 `0`·`var(--ls-*)` / 모서리 `0`·`var(--r-*)` / 길이는 간격 단계·72·80px·`%`·`auto`·`var(--gutter*)`. `box-shadow`·`filter`·`@keyframes`·`animation`이 없다
  - 전환(`transition`)은 허용 목록(선택자 × 값)에만 있다: `.btn`의 `background-color 150ms, border-color 150ms, color 150ms, opacity 150ms, transform 150ms`(누름 `.btn:active:not(:disabled)`은 `transform: translateY(1px)`, 올림은 주 `accent-strong` · 보조 `canvas`), 메뉴 링크(`SiteHeader.module.css`)·로고 링크의 `color 150ms, opacity 150ms`. `transition: all`·150ms 밖 시간·`transition-delay`·그 밖 선택자의 `transition`은 규칙 시험이 잡는다(ui-90이 tab-frame AC-313.4 "랜딩 규칙 시험 고치지 않음"을 대체)
- 페이지: `.root` 하나 안에 건너뛰기 링크(`<a href="#main">본문으로 건너뛰기</a>`, 첫 조작 요소, 키보드 초점일 때만 보임) → header → `<main id="main">`(섹션 6개) → footer
- 섹션은 6개이고, canvas 띠는 `#ai`·`#privacy` 둘뿐이다. 나머지는 흰 바탕이다

| 섹션 | 바탕 | 칸(1024px 이상) | 내용 |
|------|------|------|------|
| `#top` 히어로 | 흰 | 글 1~5 · 미리보기 6~12 | 소개 줄 · h1 "숫자로 보는 우리 의원" · 안내 · [구글로 시작하기](주 44) [AI 분석 보기](보조 44) · 약속 3줄 → `DashboardPreview` |
| `#ai` | canvas | 글 1~4 · 리포트 5~12 | 머리 `neutral` 칩 "준비 중" + "AI 리포트 탭" · h2 · 안내 · 약속 4개(`dl`, 시안 `AI_POINTS`) → AI 리포트 패널("10월 AI 리포트" + `neutral` 칩 "예시" + 항목 3개 `AI_ITEMS`, 위 맞춤). 채팅 칸이 없다 |
| `#ortho` | 흰 | 제목 1~6 · 안내 7~11 | 비교표(PC 표 / 휴대폰 표, 같은 배열 하나에서 그림, 시안 `ORTHO`, "F/U" 대신 "재방문") |
| `#features` | 흰(위 1px line) | 01 1~6 · 목록 8~12 | h2 "매일 하던 일을 한곳에 모아요" · 안내 → 왼쪽 "01 · 청구 · 삭감 예방 사전점검"(small 600 `accent`) + `positive` 칩(`Icon check` + "쓸 수 있어요") · h3 · 설명 · 사전점검 예시 패널 하나("10월 28일 사전점검" "예시" · "환자 32명 점검" · 표 3줄) / 오른쪽 목록 `ol` 02 환자 통계 · 03 매출·재고 · 04 직원·업무일지(각 `neutral` 칩 "준비 중"). 휴대폰은 01~04 목록 하나(시안 `FEATURES`의 `phone` 글) |
| `#privacy` | canvas | 글 1~8 · 0건 10~12 | 0건 · 흐름 상자(병원 PC · 브라우저 → 서버 → AI 분석) · 약속 4개 |
| `#how` | 흰 | 글 1~5 · 단계 7~12 | h2 · 안내 · [구글로 시작하기] · 3단계 `ol` |

- 히어로 위아래 여백 32/48 → 48/64(768) → 64/96(1024). 장식(격자·원형 빛·반짝이)이 없다
- **위쪽 메뉴**: 위에 붙어 따라온다(`surface`, 아래 1px line, 56 → 64px). 로고 링크(`LogoMark` 24 + 화면 읽기 "맨 위로") · nav(AI 분석 · 기능 · 개인정보 보호 · 시작 방법, 768px 이상, body 500 ink-2, 사이 24) · [구글로 시작하기](주, 32 → 36px)
  - 로고 초점 고리는 안쪽(-2px)이다. 섹션 `scroll-margin-top`은 72 → 80px라 메뉴에 제목이 가리지 않는다
- **바닥글**: 위 1px line, 위아래 24px. `LogoMark` 18 + "통증 의원 관리자를 위한 AI 업무 도구"(caption muted) · 오른쪽 "© 2026". 링크가 없다
- [구글로 시작하기]는 메뉴·히어로·`#how`에 하나씩 3개이고 모두 `/login`으로 간다
- 약속 띠·시작하기 섹션·히어로 숫자 순환·작은 카드는 없다. 약속은 히어로 안 목록이 되었고, 시작하기는 `#how`에 합쳤다
- 랜딩은 아무것도 받지 않는다(입력·폼 없음). 로고 밖 svg는 꾸밈(`aria-hidden`, `currentColor`)이다

## 휴대폰 (768px 미만)
- 한 줄 배치다. 글자는 `-m` 단계(heading-m·display-m)를 쓴다
- 누름 영역은 44px 이상이다: 단추·입력·탭·계정 단추·글자 단추. 랜딩 메뉴 단추는 32px 모양에 44px 누름 영역(`::after`)을 준다
- 입력 글자는 16px다(아이폰 확대 방지)
- 랜딩 위쪽 메뉴는 한 줄(로고 · 단추)이고 nav를 숨긴다. 메뉴 서랍·햄버거 단추가 없다
- 앱 위쪽 띠는 48px(로고 + 의원 이름, 시각 숨김, 계정은 44×44 아이콘 단추)다. 탭 줄은 옆으로 밀리고 오른쪽 끝에 [전체 메뉴] 단추가 있다(1024px 미만, 위 '앱 틀'). 본문 좌우 16px·위 16px
- 랜딩 글자 단계: 히어로·섹션 안내는 lead(16), 기능 설명은 body(14), 소개 줄은 body 600(14)
- 휴대폰 전용 문구는 `.phoneOnly`, PC 전용은 `.pcOnly`로 둔다(랜딩 기능 목록 짧은 설명, 정형외과 휴대폰 표)
- 휴대폰에서 빠지는 것(예): 히어로 [AI 분석 보기]·약속 목록(한 줄 문구로 바뀜), AI 셋째 근거·약속 설명, 사전점검 예시 패널(01은 목록 첫 줄이 됨), 개인정보 흐름 설명·약속, 시작 단계 설명, 미리보기의 한 줄 밖 탭·Sparkline. 대시보드 휴대폰 모양(접는 연결 순서·아래 단추·숫자 칸 2×2)은 메모 `docs/mockups/dashboard-home/notes.md`를 따른다
- 확인 창 단추는 나란히 반씩 44px다
- 랜딩 390px 전체 높이는 5화면(4,220px) 이하다

## 아이콘·로고
- **아이콘**: `src/components/common/Icon.tsx` 한 곳, 19개(shield·lock·clock·cal·upload·user·chev·check·x·arrow·arrowDown·monitor·server·sigma·doc·stop·copy·userCheck·logout). `logout`은 계정 메뉴 [로그아웃]이 쓴다(ui-90 시안 그림)
  - viewBox `0 0 16 16`, `fill="none"`, `stroke="currentColor"`, 선 1.5, `aria-hidden="true"`. 크기는 `size`(12·14·16)
  - 꼭 필요한 곳에만 쓴다. 아이콘만 있는 단추에는 `aria-label`을 준다
- **구글 G**: `src/components/common/GoogleMark.tsx`(48×48 viewBox, 상표 네 색). 구글 상표 색은 이 파일에만 있다
- **로고**: `src/components/common/LogoMark.tsx` 하나를 랜딩·앱 틀·인증 틀·미리보기가 같이 쓴다. 병원 십자 C③(둥근 네모 테두리 안에 꽉 찬 둥근 십자) **(사용자, 2026-10-30)**
  - 색은 고정이다: 테두리 `#14C8BA`, 십자 `#6D5DF5`. 강조색 하나 규칙의 **유일한 예외**다
  - 크기: 랜딩 메뉴 24 · 바닥글 18 · 미리보기 18 · 앱 틀 24 · 인증 틀 28(로그인 좁은 화면은 클래스로 24)
  - 빨강은 쓰지 않는다. 적십자 표장은 「대한적십자사 조직법」으로 사용이 제한된다

## 문구
- 문구는 ui-90 시안 소스의 글자 그대로다(HTML 태그·`nw()` 감싸개 빼고, `specs/ui-90/design.md` '기준 시안과 문구 원천'). 시안에 없는 화면 글은 지금 컴포넌트 문구에서 말끝만 맞춘다
- 모든 문구의 말끝은 **"~요"**다. "니다."로 끝나는 문장을 쓰지 않는다 **(총괄, ui-90)**. 연결 뒤 원장님 보고 문장(`dashboard/summary/view.ts`)의 말투는 이번 범위 밖이다
- 우리 쪽은 "병원"이 아니라 **"의원"**("우리 의원", 칸 이름·표 머리 "의원 이름")으로, 전자차트는 **"EMR"**로 쓴다 **(사용자)**. "병원 PC"는 승인된 그대로 둔다
- 이름 하나: 설정 탭 화면·안쪽 메뉴·단추는 **"비트 PC 연결"**이다. "설치·연결 확인"·"[비트 연결]"을 쓰지 않는다. 청구는 연결 전까지 "연결 먼저", 빈 상태 문구는 '연결하면 바로 쓸 수 있어요'
- "F/U" 대신 "재방문"을 쓴다
- 관리자 메일(오류 화면·거절 화면)은 설정값이다: `adminContactEmail()`(`components/common/adminContact.ts`)이 환경 변수 `NEXT_PUBLIC_ADMIN_CONTACT_EMAIL`을 읽고, 앞뒤 빈칸을 뺀 값이 메일 모양(254자 이하)이 아니거나 비었으면 `admin@example.com`을 쓴다. 진짜 개인 메일을 코드·커밋에 적지 않는다(진짜 주소는 총괄이 정해 환경 변수로 넣는다)
- 빈칸은 자연스러운 문구로 바꾼다 **(사용자, 2026-10-30)**
  - `[금액]` → 예시 금액 + "예시" 표시
  - `[직원 A]` → "직원 1"
  - `[지난달]`·`[이번 달]` → "9월"·"10월"
  - `[서비스 이름]` → 숨김(이름이 정해질 때까지 로고 옆에는 의원 이름만)
  - `[이메일 주소]` → 뺌
- "예시" 표시 자리: 미리보기 "예시 숫자", AI 리포트 "예시" 칩, 비교표 "예시" 줄·"예시 값", 사전점검 예시 패널 "예시"
- 개인정보 문구는 사실만 쓴다(plan.md §4·§6): "환자 개인정보는 절대 병원 PC 밖으로 나가지 않아요", "0건"
- 제목과 랜딩 약속 문구에 줄바꿈 태그를 넣지 않는다

## 움직임
- 장식으로 움직이는 것이 없다. 히어로 숫자 순환·장식 애니메이션·`animate-*`·`@keyframes`가 없다
- 모션 줄이기 전역 규칙(`globals.css`)은 그대로 둔다. 아래 짧은 반응도 이 규칙이 모두 끈다

### 짧은 반응 허용 (대시보드 1안부터, 사용자 2026-10-31 · 랜딩·인증까지 넓힘, 총괄 ui-90)
- 조작 요소만 누름과 올림에 짧게 반응한다
  - 앱·인증 화면: 단추·글자 단추·탭·[전체 메뉴]·기간 단추·목차 칸·계정 단추·메뉴 항목. 단추 반응은 `ds` 안에 있다(위 '단추')
  - 랜딩: `.btn`(바탕·테두리·글자 색·투명도·누름 1px)과 메뉴 링크·로고 링크(글자 색·투명도)만, 모두 150ms(위 '랜딩 짜임'의 허용 목록)
- 바뀌어도 되는 것: 색(`color`·`background-color`·`border-color`·`text-decoration-color`), 투명도(`opacity`), 작은 옮김(`translate`·`rotate`)
  - 옮김 크기: 누름 아래로 1px(`active:translate-y-px`), 단추 안 화살표 오른쪽 2px(`group-hover:translate-x-0.5`), 접는 칸 꺾쇠 180°, 떠 있는 층이 나타날 때 위 4px(툴팁 아래 2px)에서 제자리
  - 바뀌면 안 되는 것: 크기·높이·폭·여백·글자 크기·그림자 크기. 내용이 펼쳐질 때 높이를 움직이지 않는다
- 시간: 150ms(Tailwind `transition` 기본값 `--default-transition-duration`, 곡선 기본값). 휴대폰 아래 단추가 올라올 때만 200ms(`duration-200`). 120~200ms 밖은 쓰지 않는다(아래 불러오기 줄 하나만 예외)
- 클래스: `transition`(기본 속성 목록)과 `duration-200`, 나타남은 `starting:` 변형. `transition-all`·`delay-*`·`ease-*` 임의 곡선·`animate-*`는 쓰지 않는다
- 떠 있는 층(계정 메뉴·툴팁·[전체 메뉴] 판)은 나타날 때만 움직이고 닫힐 때는 바로 사라진다
- 그래프(`components/charts`)와 미리보기(`components/preview`)는 움직이지 않는다

### 불러오기 줄 (예외 하나, ui-90)
- 탭을 누른 뒤 경로가 아직 그대로인 동안 탭 줄 맨 아래에 `aria-hidden` 2px `accent` 줄이 왼쪽에서 80%까지 700ms 동안 감속하며 차오른다(`scaleX`, `duration-700 ease-out`). 경로가 바뀌면 150ms에 사라진다(`delay-*` 없음)
- 이 700ms·감속 곡선은 `src/components/shell/LoadBar.tsx` 한 파일에서만 규칙 시험의 예외다. 다른 곳의 같은 클래스는 그대로 잡는다
- 모션 줄이기 기기에서는 전역 규칙으로 움직이지 않는다(그 자리에 서 있다가 사라진다)
- 모션 줄이기(`prefers-reduced-motion: reduce`)를 켠 기기에서는 모두 바로 바뀐다(전역 규칙)

## 업무일지 양식 (엑셀 예외)
사용자가 "엑셀이랑 완전 똑같이"를 골랐다 **(사용자, 2026-10-29)**. 결정 기록은 `docs/ADR.md`의 업무일지 ADR, 기준 시안은 `docs/mockups/worklog/`, 명세는 `specs/worklog/design.md` 2·7·11-1·12·13절이다.

- **예외 범위**: `WorklogSheet`의 표 칸 안만이다. 값은 CSS Module 한 파일(`components/worklog/sheet.module.css`)에 둔다. 날짜 줄·저장 상태·오류 카드는 이 문서의 일반 규칙(`ds`·토큰·Pretendard)을 따르고, 양식 안에는 `ds` 단추·칩·앱 글자 모양을 넣지 않는다
- **색 토큰 넷**: `:root`에 둔다. `@theme inline`에는 넣지 않아 Tailwind 색 이름이 생기지 않는다. 흰 종이는 `--surface`, 흐린 안내 글은 `--muted`, 막힌 칸·"합계에서 빠졌어요"는 앱 토큰 `--negative`·`--negative-soft`다

| 토큰 | 값 | 쓰는 곳 |
|------|------|------|
| `--xl-ink` | `#000000` | 칸 글자, 칸 선 |
| `--xl-lav` | `#CCCCFF` | 연보라 칸 |
| `--xl-gray` | `#D9D9D9` | 회색 칸 |
| `--xl-focus` | `#107C41` | 칸 초점 테두리 |

- **글꼴**: 칸은 굴림(`"Gulim", "굴림", "Apple SD Gothic Neo", sans-serif`), 제목은 맑은 고딕(`"Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", sans-serif`)이다. 시스템 글꼴 이름만 쓰고 글꼴 파일을 싣지 않는다. 시안의 구글 글꼴은 쓰지 않는다
- **굵기**: 칸 글자는 700(엑셀 굵게)이다. 굴림은 굵은 글꼴 파일이 없어 윈도우가 굵게 만든다. 엑셀과 같다
- **선**: 칸 선은 1px `--xl-ink`, 표 바깥 선은 2px이다
- **크기**: 엑셀 값(인쇄 pt)을 화면 px로 옮긴 시안 값이다. 표 폭은 PC 689px, 768px 미만과 인쇄는 100%다

| 자리 | PC(px) | 768px 미만(px) | 인쇄(pt) |
|------|------|------|------|
| 칸 글자 | 17 | 11 | 13 |
| 날짜 | 19 | 12 | 14 |
| 업무사항 | 15 | 10 | 11 |
| 지출 비고 | 13 | 9 | 10 |
| 제목 | 43 | 24 | 32 |
| 1행 높이 | 53 | 38 | 39.75 |
| 2행 높이 | 24 | 18 | 18 |
| 3행 높이 | 45 | 30 | 33.75 |
| 4~6행 높이 | 28 | 22 | 21 |
| 7~16행·19~23행 높이 | 40 | 30 | 30 |
| 17·18행 높이 | 20 | 15 | 15 |

- **인쇄**: A4 세로 한 장(`@page` 여백 12mm), 결재 칸 포함이다. 줄 높이 합 634.5pt가 인쇄 높이(273mm, 약 773.9pt) 안에 든다. 앱 틀·날짜 줄·저장 상태·오류 카드는 숨기고, 칸 색은 그대로 찍히게(`print-color-adjust: exact`) 하며, 흐린 안내 글은 투명하다. 업무사항·고친 항목 이름은 찍힌다
- **휴대폰**: 터치 기기는 같은 양식을 화면 폭에 맞춰 보기만 한다. 칸을 고칠 수 없고 업무사항도 보인다 **(사용자, 2026-11-01)**. 좁은 PC 창은 그대로 고칠 수 있다
- **숫자 칸**: 글자도 받는다. 치는 동안은 친 글자 그대로이고, 초점이 나가면 숫자만인 칸은 엑셀 모양으로 보인다. 글이 섞인 칸은 친 글자 그대로다
- **항목 이름**: 수입·지출 항목 이름은 입력 칸이고 그날만 고친다. 다음 날은 기본 이름이다. 고치지 않으면 엑셀과 같은 모양이다
- **"합계에서 빠졌어요"**: 합계에 들어가는 칸이 합계 제외로 읽히면 그 칸 안에 작은 글자(`--negative`)로 보인다. 인쇄에 없다
- **막힌 칸**: 개인정보 모양(전화·주민번호·메일)이 있는 입력 칸은 `--negative` 테두리·`--negative-soft` 바탕이다. 인쇄에 없다
- **규칙 시험**: 지우지 않고 이 예외만 연다(`specs/worklog/design.md` 12절). 다른 화면은 그대로 잡힌다
