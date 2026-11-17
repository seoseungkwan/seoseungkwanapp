# 설계: 업무일지 탭을 주요 탭 줄 수납일지 왼쪽으로

## 바꾸는 곳
- `src/components/shell/menu.ts`의 `MENU` 배열에서 업무일지 줄을 수납일지 줄 바로 앞으로 옮기고 `primary: true`로 바꾼다.
  `PRIMARY_MENU`·`MORE_MENU`는 `MENU.filter`라 차례가 저절로 따라온다. 탭 줄(TabBar)·[더보기](MoreMenu)·지금 탭 찾기(currentMenuLabel)는 고치지 않는다.
- 주석의 '주요 메뉴 다섯'을 '여섯'으로 고친다(menu.ts·TabBar.tsx·MoreMenu.tsx 주석만).

## 화면
- 1024px 이상: 탭 여섯이 한 줄에 다 들어간다(시안 1280 사진).
- 1024px 미만: 지금처럼 탭 띠만 옆으로 밀린다(줄바꿈 없음, 지금 탭이 띠 밖이면 띠를 민다 — 기존 revealInStrip). 새 코드 없음.

## 시험
- `src/components/shell/shell.test.tsx`의 PATHS·PRIMARY 차례와 13개 차례 시험을 새 차례로 고치고, 여섯·일곱 개수와 /worklog 지금 탭 모양 시험을 AC-5801.x로 단다.

## 위험
- 다른 창이 MENU를 고치고 있으면(예약 탭 clinic-calendar) 합칠 때 같은 줄이 부딪힌다 → 이 기능을 먼저 내보내고 clinic-calendar가 이 위에서 시작한다.
