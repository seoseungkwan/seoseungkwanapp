# 요구사항: 새 주소 n-medi.vercel.app (new-address)

## 배경
- 2026-11-18 사용자가 웹앱 주소 이름을 바꾸기로 했다("seoseungkwanapp" → "NMedi"). `nmedi.vercel.app`은 남이 써서 `n-medi.vercel.app`으로 정했고, 같은 날 Vercel 프로젝트에 이 주소를 더했다(옛 주소도 그대로 열림).
- 크롬 확장은 웹 페이지 주소를 글자 그대로 검사한다(manifest `externally_connectable` + `relay.isOurOrigin`). 그래서 확장 새 판이 없으면 새 주소에서는 비트 연결(청구·통계·수납일지 등)이 안 된다.
- 도우미는 사이트 주소가 아니라 확장 ID만 본다(`OriginGuard`). 도우미 코드는 고치지 않는다.

### REQ-6401: 확장이 새 주소와 옛 주소를 모두 받는다
- AC-6401.1: Given 확장 0.4.0, When 페이지 origin이 `https://n-medi.vercel.app` 이거나 `https://seoseungkwanapp.vercel.app` 이면, Then `isOurOrigin`이 true다. 그 밖(http, 끝 `/`, `:443`, 대문자, 하위 도메인, 뒤에 다른 꼬리, 다른 vercel.app, 없음)은 false다.
- AC-6401.2: Given 확장 manifest, When 읽으면, Then `externally_connectable.matches`는 정확히 `https://n-medi.vercel.app/*`, `https://seoseungkwanapp.vercel.app/*` 두 줄이고(와일드카드 도메인·다른 키 없음) `version`은 `0.4.0`이다.

### REQ-6402: 명령 표의 주 주소를 새 주소로 바꾼다
- AC-6402.1: Given `src/lib/bridge/commands.json`, When 도우미 명령 표가 읽으면, Then `origin`은 `https://n-medi.vercel.app`이고 도우미 `CommandTable`은 지금 규칙(https·소문자·와일드카드 금지) 그대로 받아들인다.

## 범위 밖
- 옛 주소로 들어오면 새 주소로 넘기기 — 확장 0.4.0이 두 병원 PC에 깔린 뒤 따로 한다(먼저 넘기면 옛 확장 PC가 끊김).
- Supabase 로그인 주소(Redirect URLs에 새 주소 더하기, 나중에 Site URL 바꾸기) — 사용자가 대시보드에서 한다.
- 설명서 PDF·영상·다른 병원 안내 속 주소, 저장소·Vercel 프로젝트 이름, 도메인 구입.
- 옛 주소 받기를 없애기 — 넘기기가 끝난 뒤 따로.
