# 설계: 새 주소 n-medi.vercel.app (new-address)

## 바꾸는 곳
- `src/lib/bridge/commands.json`: `origin`을 `https://n-medi.vercel.app`으로. 열쇠 모양은 그대로(도우미 `CommandTable`이 모르는 열쇠를 거절하므로 새 열쇠를 만들지 않는다).
- `extension/src/relay.ts`: `OLD_ORIGIN = 'https://seoseungkwanapp.vercel.app'` 상수 하나(주석: 옛 주소 넘기기가 끝나면 지움). `isOurOrigin(o) = o === commands.origin || o === OLD_ORIGIN` — 글자 그대로 비교는 지금과 같다.
- `extension/manifest.json`: `externally_connectable.matches` = [`${commands.origin}/*`, `${OLD_ORIGIN}/*`], `version` 0.4.0.
- 시험: relay·manifest·background 시험의 주소 기대값, 도우미 `CommandTable.test.cs`의 `Table.Origin` 기대값.
- 웹앱 코드는 사이트 주소를 쓰지 않는다(2026-11-18 grep 확인) — 고치지 않는다.

## 순서
1. 이 명세 구현 → 확장 0.4.0 zip(ssk-clinic-pc-files) → 사용자가 크롬 웹스토어(비공개 등록)에 올림 → 심사 뒤 병원 PC 확장이 저절로 새 판이 됨.
2. 도우미는 이번 0.11.0에 새 `commands.json`이 같이 들어간다(주소는 모양 검사에만 쓰임).
3. 지금 사용자가 할 일: Supabase Redirect URLs에 `https://n-medi.vercel.app/**` 더하기. 안 더하면 새 주소에서 로그인한 뒤 옛 주소로 돌아간다.
4. 두 병원 확장이 0.4.0이 된 뒤: Site URL을 새 주소로, 옛 주소 → 새 주소 넘기기(다른 명세).

## 위험
- 확장이 아직 0.3.0인 PC에서 새 주소를 쓰면 비트 연결이 안 된다 → 그 PC는 넘기기 전까지 옛 주소를 쓴다.
- 웹스토어 심사가 며칠 걸릴 수 있다.
