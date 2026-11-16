# 설계: 메모 확인 한눈에 보기

> 기능 ID: `claim-memo-fit` · 시안 `docs/mockups/claim-memo-fit/index.html`(?s=new) · 바꾸는 것은 class와 몇 개의 감싸개뿐이다. 자료·Worker·도우미·저장은 그대로

## 1. 앱 틀 넓히기 (REQ-4801)
- `AppShell` 뿌리 `div.app-ui`에 `group/app`(이름 붙은 묶음). 이름 없는 `group`은 쓰지 않는다: 안쪽 `group-hover:` 등이 가장 가까운 묶음이 아니라 아무 조상 `.group`에 걸리기 때문이다
- `max-w-7xl` 감싸개 넷(`AppShell` 띠 안쪽·본문 안쪽, `TabBar` 줄 감싸개 둘)에 `lg:group-has-[[data-wide-page]]/app:max-w-none`를 더한다. 뜻: 1024px 이상이고 앱 안 어딘가에 `[data-wide-page]`가 있으면 1280 폭 제한을 푼다. 좌우 24px·가운데 놓기는 그대로라 세 줄의 왼쪽 끝이 같이 움직인다(AC-218.1 '같은 폭' 그대로)
- `MemoPanel` 뿌리 `div`에 `data-wide-page=""`. 메모 칸이 그려지는 동안(3~5단계)만 넓다. 청구 1~2단계·다른 탭에는 표시가 없어 그대로다
- 브라우저: `:has()`는 크롬 105+ (의원 PC 크롬). 안 되는 브라우저는 예전 1280 폭으로 보일 뿐 깨지지 않는다

## 2. 두 칸·목록 (REQ-4802)
- `MemoPanel` `SPLIT`: `lg:grid-cols-[360px_minmax(0,1fr)]` → `lg:grid-cols-[272px_minmax(0,1fr)]`
- `MemoList` 줄 단추 안: 이름 묶음 `flex-1` → `flex-1 lg:flex-none`, 표시 묶음 `justify-end` → `justify-end lg:justify-start`
- 목록 위 보기 단추: `ds.segment.button`은 그대로 두고 `MemoList`에서만 `lg:px-2`를 더한다(공용 class를 바꾸면 통계·대시보드도 바뀐다)

## 3. 오른쪽 상세 (REQ-4803·4804·4805)
DOM 차례는 지금과 같게 두고 class로 두 모양을 만든다(lg 미만은 지금 그대로).

```
MemoDetail 뿌리: flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:gap-2.5
├ 머리: flex items-start justify-between gap-3 lg:flex-wrap lg:items-center lg:justify-start lg:gap-x-2.5 lg:gap-y-1
│ ├ 왼쪽: flex flex-col gap-0.5 lg:contents
│ │ ├ 위치 글 '{묶음} n / N'           lg:order-2 lg:ml-auto
│ │ ├ 이름 + 표시
│ │ ├ 진료일 | 차트
│ │ └ 안내(까닭·PC가 찾음·점검 경고)   lg:flex-row lg:flex-wrap lg:gap-x-2  ← 머리 밖에서 왼쪽 묶음 안으로 옮김
│ └ 오른쪽: [↑ 앞 사람][↓ 다음 사람] · 키보드   lg:order-3 lg:flex-row lg:items-center
└ 아래: flex flex-col gap-3 lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[clamp(13.75rem,30%,18.75rem)_minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]
  ├ ① 왼쪽: flex flex-col gap-3 lg:min-h-0 lg:overflow-y-auto lg:gap-2.5
  │ ├ 단추 상자: 지금 class + lg:gap-1.5. 복사 단추 lg:basis-full · 빈 칸(flex-1) lg:hidden · 다른 단추 lg:flex-1 · 상태 줄(ready면 없음)
  │ └ 메모: grid grid-cols-2 … lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:gap-2.5
  │   ├ 우리 메모 칸   lg:-order-2 lg:min-h-24 lg:flex-1 lg:overflow-y-auto
  │   ├ 비트 메모 카드 (BitMemoCard 뿌리에 lg:min-h-24 lg:flex-1 lg:overflow-y-auto)
  │   └ 알림 글        lg:-order-1   → 차례: 우리 메모 · 알림 글 · 비트 메모
  └ 표 묶음: grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 lg:contents → ② ③이 바깥 격자 칸이 된다
    ├ ② 증상: section lg:min-h-0 → 표 감싸개 lg:min-h-0 lg:overflow-y-auto lg:border lg:border-line, 표 lg:border-0. 글은 줄바꿈(자르지 않음)
    └ ③ 처방: 같은 감싸개. th lg:sticky lg:top-0 lg:z-1. 처방명 칸 = <span lg:flex lg:min-w-0 lg:items-baseline lg:gap-1><span title=처방명 lg:min-w-0 lg:truncate>처방명</span> 짧은 이름(lg:shrink-0 lg:whitespace-nowrap)</span>
```
- 세 칸 폭: 왼쪽은 상세 폭의 30%를 220~300px로 묶고(1440 창에서 300px), 증상·처방이 나머지를 반씩. 1024~1279px 창은 증상·처방이 약 200px씩으로 좁지만 칸마다 스크롤된다
- `MemoPanel` 상세 칸 section: 지금 class + `lg:flex lg:flex-col lg:py-3`. `overflow-y-auto`는 그대로 둔다(아주 낮은 창에서 칸들의 가장 작은 높이 합이 넘치면 예전처럼 상세가 스크롤)
- 상태 줄: `StatusLine`이 `status === 'ready'`면 아무것도 그리지 않는다. `STATUS.ready` 글은 지운다. `copyStatus`(memoSplit)는 그대로 'ready'를 돌려준다
- 짧은 이름: `const short = row.short.trim() !== '' && row.short.trim() !== row.name.trim() ? row.short : ''` — `MemoDetail` 안에서만 견준다(Worker 자료는 그대로)

## 결정과 트레이드오프
- 넓히기를 `:has()` + 이름 붙은 묶음으로 한 까닭: `AppShell`은 서버 부품이라 지금 경로를 모르고, 경로를 넘기는 길을 새로 내는 것보다 class 하나가 작다. 표시가 화면에 있는 동안만 넓어서 3~5단계와 1~2단계 사이에 본문 폭이 바뀐다(사용자 시안 '청구 화면만')
- 처방명은 lg 이상에서만 자른다. lg 미만 표는 지금처럼 줄바꿈
- 머리 안내 글을 왼쪽 묶음 안으로 옮기면 lg 미만에서 안내 글이 머리 오른쪽 단추 묶음 옆(진료일 줄 아래)에 놓인다. 글·차례는 같다

## 위험
- 시험이 class 이름을 견주는 곳이 많다: `MemoPanel.test`(AC-3101.1 360px·ready 글 셋), `MemoDetail.test`(AC-3103.7 ready·AC-3105 표 묶음 `grid-cols-[minmax(0,2fr)_minmax(0,3fr)]`), `shell.test`(감싸개 class). 기대값은 이 명세 AC로 바꾸고 이름에 새 AC를 넣는다
- jsdom은 배치를 재지 않는다. 실제 모양은 확인용 하네스로 1440·1280·1024·390 폭 사진을 찍어 본다(저장소 밖, 합성 자료)
