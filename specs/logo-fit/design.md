# 설계: 서식 로고 흰 배경 지우기·여백 자르기·세로 로고 크게

> 기능 ID: `logo-fit` · 기준: 운영 `d12087b2`(clinic-profile 배포본). 서버·DB·도우미 변경 없음.

## 1. 흐름
```
병원 정보 로고(PNG data: 주소, useClinicProfile({ logo: true }))
  → readLogoBitmap(href)        // png.ts: 원래 크기(긴 변 1200 이하)로 canvas에서 RGBA 읽기
  → fitLogo(bitmap)             // logoFit.ts: 흰 배경 지우기(REQ-6701) → 여백 자르기(REQ-6702), 순수 함수
  → bitmapToPngUrl(fitted)      // png.ts: canvas putImageData → 'data:image/png;base64,…'
  → { kind: 'image', href, width, height }  (PosterLogo)
  → Poster / GuidePoster LogoSlot: logoRect(자리, 크기)로 그린 네모 계산(REQ-6703)
```
- 먼저 지금처럼 `readLogoPixels(원래 주소)`(64 점 표본): null이면 지금처럼 병원 이름 글자(clinic-profile AC-6604.2 그대로, 준비하지 않는다).
- 표본이 읽히면 준비: 실패(`readLogoBitmap` null·`fitLogo` null·`bitmapToPngUrl` null)면 `{ kind: 'image', href: 원래 주소 }`(크기 없음 → 원래 상자)를 넘긴다(AC-6702.2).
- 로고 색(환자 안내문 [자동])은 준비 성공이면 `readLogoPixels(준비 주소)`로 다시 뽑고(null이면 원래 표본), 실패면 원래 표본의 `logoPalette`.
- clinic-profile AC-6604.3(그림 파일 안에 로고 이미지가 들어 있음)은 이제 준비한 그림이 들어간다는 뜻이 되고, 부딪치지 않는다(AC-6701.4).
- 준비는 로고 주소가 바뀔 때 한 번만(지금 `useFormLogo`의 `read.href` 비교 그대로). 저장·서버 전송 없음(AC-6701.4).

## 2. `src/lib/forms/logoFit.ts` (새 파일, 순수 함수 · DOM 없음)
```ts
export type LogoBitmap = { data: Uint8ClampedArray; width: number; height: number }
export const WHITE_MIN = 230      // 거의 흰 점: min(R,G,B) ≥ 230
export const OPAQUE_MIN = 200     // 그리고 불투명도 ≥ 200
export const BORDER_SHARE = 0.9   // 둘레 점 중 거의 흰 점 비율 ≥ 0.9 일 때만 지운다
export const EDGE_MIN = 200       // 지운 자리와 맞닿은 밝은 점: min(R,G,B) ≥ 200 → 반투명
export const ALPHA_MIN = 16       // 자를 때 '보이는 점'
export function clearWhiteBackground(px: LogoBitmap): LogoBitmap   // 새 배열을 돌려준다(입력은 바꾸지 않는다)
export function trimLogo(px: LogoBitmap): LogoBitmap | null        // 보이는 점이 없으면 null
export const PEEL_MAX = 3         // 가장자리 얇은 선: 한 쪽에 3줄까지
export const PEEL_OUTER = 0.5     // 바깥 줄의 거의 흰 점 < 50% 이고 안쪽 줄 ≥ 90% 면 바깥 줄을 뗀다
export function peelEdgeLines(px: LogoBitmap): LogoBitmap         // 새 배열(안 바뀌면 복사본)
export function fitLogo(px: LogoBitmap): LogoBitmap | null         // trimLogo(clearWhiteBackground(peelEdgeLines(px)))
```
- 선 떼기(AC-6701.5): 위 → 아래 → 왼쪽 → 오른쪽 차례로 한 번씩. 한 쪽에서 k = 1..3을 차례로 보며, k번째 줄 비율 ≥ 0.5면 그 쪽은 멈춤(안 뗌), 아니고 k+1번째 줄 비율 ≥ 0.9면 k줄을 떼고 멈춤, 아니면 다음 k. 비율은 지금 남은 네모(앞 차례에서 뗀 줄 제외) 안에서 잰다. 떼고 남을 높이·폭 < 3이면 떼지 않는다. 2026-11-19 사용자 로고(1080×501, 오른쪽 끝 1점 검은 세로줄)에서 이 단계가 없으면 둘레 흰 비율이 약 84%라 배경이 남는 것을 시안에서 확인했다.
- 둘레 = 맨 위·맨 아래 줄과 맨 왼쪽·오른쪽 칸의 점(겹치는 모서리는 한 번). 1×1·한 줄 그림도 깨지지 않는다.
- 지우기: 둘레의 거의 흰 점을 씨앗으로 위·아래·왼쪽·오른쪽 4방향 채우기(Int32Array 스택, 되부름 없음). 채운 점의 불투명도 0. 그다음 채운 점과 4방향으로 맞닿은 남은 점 중 min(R,G,B) ≥ 200이면 불투명도 = clamp(round(a × (255 − min) ÷ 55), 0, 255)(AC-6701.3).
- 자르기: 불투명도 ≥ 16인 점의 최소 네모. 잘린 data는 그 네모의 줄을 복사한 새 배열.
- 1200×1200(144만 점)에서 한 번 도는 정도의 비용(채우기 O(점 수)). 이 파일은 환자 자료 구역이 아니지만 네트워크·저장소·console을 쓰지 않는다.

## 3. `src/lib/forms/png.ts` (더하기)
```ts
export const LOGO_READ_MAX = 1200  // types/clinicProfile LOGO_MAX_SIDE와 같은 값을 가져다 쓴다
export async function readLogoBitmap(href: string): Promise<LogoBitmap | null>   // PNG data: 주소만, 긴 변 1200 안으로(키우지 않음), 실패 null
export function bitmapToPngUrl(px: LogoBitmap): string | null                    // canvas putImageData → toDataURL('image/png'), 실패 null
```
- `readLogoPixels`(64 표본)는 그대로 둔다. 두 함수는 같은 `loadImage`를 쓴다. fetch·바깥 읽기 없음(data: 주소).

## 4. 배치 `src/lib/forms/layout.ts`·`guideLayout.ts`
```ts
export const LOGO_AREA = { x: 227, y: 990, width: 340, height: 100 } as const        // 휴진 안내, 가운데 397·1040
export const GUIDE_LOGO_AREA = { x: 197, y: 984, width: 400, height: 110 } as const   // 환자 안내문, 가운데 397·1039
export type PosterLogo = { kind: 'image'; href: string; width?: number; height?: number } | { kind: 'text'; text: string }
export function logoRect(area: Box, size: { width: number; height: number }): Box
// scale = min(area.w / w, area.h / h); 폭·높이 = 크기 × scale; x·y = 가운데 − 반; 네 값 모두 소수 첫째 자리 반올림
```
- `LOGO`(227,1011 · 340×58)·`GUIDE_LOGO`(197,1005 · 400×68)는 그대로: 크기 모르는 그림(AC-6703.3)·병원 이름 글자(AC-6703.5)·옛 `/poster/logo.png` 길이 쓴다.
- 새 자리 높이 근거: 휴진 안내 글자 자리 아래 끝 960 → 자리 위 990(30 띄움), 아래 1090(종이 끝 1123에서 33). 환자 안내문 흰 띠 시작 954 → 984(30), 아래 1094(29). 가로형 로고는 폭에 묶여 지금과 같은 자리.

## 5. 그리기 `src/components/forms/Poster.tsx`·`GuidePoster.tsx`
- `LogoSlot({ logo, area, box, fill })`: 그림 + 크기 있음 → `logoRect(area, 크기)`에 `preserveAspectRatio="xMidYMid meet"`; 그림 + 크기 없음 → `box` 전체(지금 그대로); 글자 → `box`(지금 그대로); `undefined` → 옛 `/poster/logo.png`를 `LOGO`에(지금 그대로).
- 크기 값 검사: 유한한 양수가 아니면 크기 없음으로 본다.
- 휴진 안내 AI 배경: 로고 뒤 흰 빛 `<ellipse>`와 그것만 쓰던 흐림은 그리지 않는다(AC-6703.4). 글자 뒤 반투명 흰 판 `<rect>`와 그 흐림 필터는 그대로(AC-4603.2의 판 부분). `PosterBackground.test.tsx`에서 흰 빛 타원을 단언하던 AC-4603.2 시험 세 곳(판·흰 빛 값 ~90줄, 필터 쓰는 자식 `['rect','ellipse']` ~117줄, 자식 차례 `…,'rect','ellipse'` ~154줄)은 타원 없는 형(`['rect']`, `…,'rect'`)으로 고치고 흰 빛이 없음을 본다. 테마 배경 AC-4603.4 시험은 그대로. `Poster.tsx`의 흰 빛 주석·`WHITE` 주석도 함께 고친다.
- `GuidePoster`는 `GUIDE_LOGO_AREA`·`GUIDE_LOGO`를 넘긴다. 흰 띠·글자 배치는 그대로.

## 6. 서식 화면 `src/components/forms/FormsScreen.tsx`
- `useFormLogo`: 1절 순서 그대로 — `readLogoPixels(href)` null → 이름 글자 / 아니면 `readLogoBitmap(href)` → `fitLogo` → `bitmapToPngUrl` → 성공이면 `{ kind: 'image', href: 준비 주소, width, height }`, 실패면 `{ kind: 'image', href }`. 로고 색은 1절대로.
- 읽는 동안은 지금처럼 `READING`(로고 자리 비움). 이름 글자 대체(로고 없음·못 읽음)는 지금 그대로.

## 7. 시안 (`docs/mockups/logo-fit/`)
- `index.html` 한 파일: 휴진 안내(AI 배경·테마)·환자 안내문의 로고 부분을 지금/바뀐 뒤로 나란히 그린다. 그림은 페이지 안 JS(canvas)로 2절 규칙을 그대로 돌린 것. 기본 그림은 페이지가 그린 가상 세로형 로고(흰 배경, '가상정형외과의원'), `?logo=<파일>`로 다른 그림을 넣어 볼 수 있다. 실제 병원 로고 파일은 저장소에 넣지 않는다.
- `notes.md`: 결정·승인 줄.

## 8. 위험
- 흰 글자가 둘레와 이어진 로고(흰 글자가 그림 가장자리에 닿음)는 그 글자도 지워진다 → 범위 밖, 그런 병원은 투명 로고를 올리면 된다(설정 화면 안내는 이번에 바꾸지 않는다).
- JPEG 로고의 배경 잡티(230 아래 점)는 남을 수 있다 → 둘레 90% 규칙과 반투명 테두리로 대부분 가려진다. 시안에서 실제 모양 확인.
- 선 떼기 오탐: 흰 바탕 로고 맨 아래를 폭 전체로 가로지르는 1~3점 밑줄, 1~3점 액자 테두리는 잘려 나간다 → 드문 경우로 보고 받아들인다(그런 병원은 투명 로고를 올리면 그대로 그려진다).
- 큰 로고에서 준비 시간: 144만 점 한 번 — 서식 화면을 열 때 한 번, 읽는 동안은 자리 비움(지금과 같음).
