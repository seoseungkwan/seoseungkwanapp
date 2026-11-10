# 설계: 휴진 안내문 아래 병원 로고 (forms-logo)

## 1. 바뀌는 곳 한눈에
| 파일 | 바뀌는 것 |
|---|---|
| `public/poster/logo.png` (새) | 투명 바탕 가로형 로고 1033×175, 시안 `docs/mockups/forms/logo.png`와 같은 바이트 |
| `src/lib/forms/layout.ts` | `LOGO` 상수(주소·자리·크기) |
| `src/components/forms/Poster.tsx` | 카드 다음, 맨 마지막에 로고 `<image>` 하나. 맨 위 주석의 "병원 정보는 넣지 않는다"에 로고 예외를 적는다 |
| `src/lib/forms/png.ts` | 그림 파일(PNG)용 SVG에서 로고 주소를 data: 주소로 바꾸고, 내려받을 때 로고 파일도 읽는다 |

서버·DB·저장 몸통·AI 경로·CSP는 바뀌지 않는다. 로고는 `'self'` 그림 주소이고(`img-src 'self' data: blob:` 그대로), middleware matcher는 `.png`를 이미 거치지 않는다. 새 색(16진수)은 없다.

## 2. 로고 파일 만들기 (시안 단계에서 끝냄)
- 원본: 사용자가 보낸 세로형 로고 JPG(1080×501, 연회색 바탕 241).
- 바탕 지우기(color-to-alpha): 바탕보다 밝은 점은 투명(로고에 흰색이 없다 — JPG 얼룩을 지운다), 어두운 쪽은 `min(1, (241 − 값) / (241 − 60))`으로 알파를 매겨 글자 회색(약 60)보다 어두우면 완전히 불투명. 알파 0.15 밑은 0, 캡처 가장자리 12px의 선 자국은 지운다.
- 가로형으로 다시 짜기: 사용자 로고 모음 왼쪽 아래 비율 — B 마크 높이 = 한글 이름 높이 ÷ 0.675, B와 이름 사이 = 이름 높이 × 0.25, B 위끝 = 이름 위끝 − 이름 높이 × 0.04, 영문은 이름 아래 원래 거리·가로 위치 그대로. 결과 1033×175, 144,948바이트, sha256 `d4a83c51a9bd9e41637ab3462577d693668cbccae2b36c1f47f8acd117e5f67c`.
- TASK-1은 이 파일을 `public/poster/logo.png`로 그대로 옮긴다(다시 만들지 않는다).
- 해상도: 안내문 위 너비 340에 원본 1033px(약 3배) → A4 인쇄 약 9cm 폭에 약 290dpi, PNG 내려받기(2배, 680px)에도 충분하다.

## 3. 자리 (`layout.ts`)
```ts
export const LOGO = { href: '/poster/logo.png', x: 227, y: 1011, width: 340, height: 58 } as const
```
- 높이 58 = round(340 × 175 / 1033). 가운데: 227 + 170 = 397 = `POSTER.cx`. 아래 끝 1069 = 1123 − 54.
- 카드 아래 끝(1·2장 837, 3장 800, 4장 934)보다 아래에서 시작한다. 카드 수와 상관없이 같은 자리.

## 4. 안내문 SVG (`Poster.tsx`)
- 카드들 다음(자식 맨 끝)에 `<image href={LOGO.href} x y width height />` 하나. filter·opacity·받침 rect는 두지 않는다(사용자 ①).
- 그리는 차례: style → defs → 테마 image → 글자·카드 → 로고. 자식 맨 앞 셋(style·defs·image) 차례 시험은 그대로 통과한다.
- 읽는 이름(aria-label)은 그대로다(병원 이름을 더하지 않는다 — AC-3505.1).
- 인쇄 사본은 같은 `Poster`를 쓰므로 따로 고치지 않는다(AC-3603.3은 화면 시험으로 확인).

## 5. 그림 파일 (`png.ts`)
- `svgForImage(svg, assets)`의 assets에 `logo: Uint8Array`를 더한다. `href="/poster/logo.png"`(따옴표 둘 다, `xlink:href`도)를 `data:image/png;base64,<로고 바이트>`로 바꾼다.
- `downloadPosterPng`: 테마 그림·Bold·Black과 함께 `LOGO.href`를 `readBytes`로 읽는다. 하나라도 못 읽으면 false. 바꾼 글에 `/poster/`가 남으면 false(지금 검사 그대로).
- 테마 그림 찾기(`svg.querySelector('image')` = 첫 image)는 그대로다 — 로고는 마지막 image라 첫 image는 여전히 테마 그림이다.

## 6. 바뀌는 기존 기대(승인된 forms 시험)
- `src/components/forms/Poster.test.tsx`: "image는 테마 그림 하나"(AC-3505.1) → "테마 그림(첫 image)과 로고(마지막 자식) 둘". 그 밖의 기대는 그대로.
- `src/lib/forms/png.test.ts`: "/poster/ 주소 셋(테마·Bold·Black)" → 넷(+로고), svgForImage에 넘기는 assets에 logo를 더한다, downloadPosterPng가 읽는 자산 셋 → 넷과 "로고를 못 읽으면 false" 더하기.
- `src/lib/forms/assets.test.ts`: 로고 파일 시험 묶음을 더한다(기존 묶음은 그대로).
- `src/components/forms/FormsScreen.test.tsx`: 인쇄 사본에도 로고가 있다는 시험을 더한다(기존 기대는 그대로 — `querySelector('image')`는 첫 image = 테마 그림).

## 7. 위험
- 장식이 많은 테마(11월 낙엽 등)에서 작은 영문이 덜 보인다 — 사용자가 알고 ①을 골랐다. 나중에 바꾸려면 시안의 `?logo=halo|glow|plate` 비교를 다시 본다.
- 다른 병원을 받으면 그 병원 안내문에도 이 로고가 나온다 — 그 전에 병원별 로고로 바꾼다(범위 밖, plan.md §1).
