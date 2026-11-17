# 설계: 설정 안쪽 메뉴 이름 '청구'로

- 글자만 바꾼다: `src/components/settings/SettingsPage.tsx`(지금 칸)와 `src/components/claim/setup/SetupScreen.tsx`의 `SettingsSubnav`(링크 칸)에서 '청구·연락' → '청구'.
- 시험: `src/app/(app)/settings/page.test.tsx`·`src/components/claim/setup/SetupScreen.test.tsx`의 링크 이름·글자 기대를 '청구'로 바꾸고 AC-5201.x 시험을 더한다.
- 새 화면·데이터·서버·SQL·도우미 판 없음. 위험: 없음(링크 이름만 바뀜).
