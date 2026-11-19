# 설계: 데스크 계정 비트 PC 연결 (desk-setup)

기준 갈래 `feat-desk-setup`(운영 `dd367e1c`에서). 시안 `docs/mockups/desk-setup/` 승인(2026-11-19 "이대로 만들기").
지키는 것: ADR-031(데스크는 세 탭, 자료는 RLS가 막음), ADR-004(서버 코드 없음 — 브라우저 + Supabase 규칙), helper-download(설치 파일은 보관함 `install-files`, 관리자만 올림).

## 1. 문지기 — `src/components/shell/menu.ts`
- `DESK_PATHS`(탭 셋)는 그대로 두고, 탭이 아닌데 데스크가 열 수 있는 주소 목록을 따로 둔다: `const DESK_EXTRA: readonly string[] = ['/claim/setup']`.
- `isDeskPath(pathname) = DESK_PATHS 중 하나 아래 || DESK_EXTRA 중 하나 아래`(`isUnder` 그대로). `DESK_MENU`·`DESK_HOME`은 그대로.
- `DeskGate`는 이미 `isDeskPath`로 거른다 → 코드 바뀜 없음. `/dashboard`를 수납일지로 바꾸는 일도 그대로. 시험만 더한다(`DeskGate.test.tsx`).
- `gate.ts`(middleware·페이지 guard)는 데스크에게 앱 경로를 이미 연다 → 바뀜 없음.

## 2. 페이지 — `src/app/(app)/claim/setup/page.tsx`
- 지금 `if (me.hospital === null && me.desk) return null`을 바꾼다: 데스크면 `<SetupScreen clinicName={me.desk.hospitalName} />`(returnTo 없음 — `?next=dashboard`여도 넘기지 않는다. 데스크의 /dashboard는 DeskGate가 수납일지로 바꾸므로 '대시보드로 돌아가요'가 틀린 글이 된다).
- 원장 길(승인 확인·던지기)은 그대로. 페이지는 여전히 세션과 내 병원·데스크 줄만 읽는다(`guardPage`), 서버 경로·Server Action 없음(AC-006.6 그대로).

## 3. 연결 화면 머리 — `src/components/claim/setup/SetupScreen.tsx`
- 데스크인지는 앱 틀이 주는 `useDesk()`(RoleProvider, desk-feedback — `SunapSettings`가 이미 씀)로 안다. props는 늘리지 않는다.
- `Head`: 데스크면 `<h1>비트 PC 연결</h1>` 하나(안쪽 메뉴 `SettingsSubnav` 없음, `/settings` 링크 없음). 아니면 지금 그대로('설정' + 안쪽 메뉴).
- 단계·안내·[확장 내려받기]·[도우미 내려받기](`DownloadButton` → `lib/storage/installFiles`)·연결 확인은 그대로 — 데스크도 같은 부품을 쓴다. 받기가 되는지는 6절 규칙이 정한다.
- 데스크가 열 수 없는 청구(`/claim`)로 가는 두 곳만 데스크일 때 바꾼다(사용자 "네, 둘 다"): '준비됨' 줄 글 '이 PC에서 수납일지 장부를 볼 수 있어요.' + [수납일지로 가기](`/sunap`, 같은 `primarySmall`), busy 카드의 `outside`([건수만 보기]) 없음. 원장은 그대로.

## 4. 계정 메뉴 — `src/components/shell/AccountMenu.tsx`
- `desk`가 참이면 메뉴 항목에 `<Link href="/claim/setup" role="menuitem">비트 PC 연결</Link>`를 [로그아웃] 위에 둔다(관리자 [가입 승인] 링크와 같은 모양 `itemClass`, 누르면 `setOpen(false)`). 꾸밈 아이콘은 `monitor`(연결 화면 안내와 같은 것)를 쓴다.
- 원장·관리자 메뉴는 그대로.

## 5. 수납일지 안내 칸 — `src/components/sunap/RemoteView.tsx`
- `AWAY`에 까닭별 선택 칸을 더한다: `device` → `{ more: '이 PC에 비트가 깔려 있으면 확장·도우미를 깔고 연결해서 장부를 볼 수 있어요.', link: '이 PC 연결하기' }`, `old-helper` → `{ link: '도우미 새 판 받기' }`, `old-day` → 없음.
- 안내 상자(자물쇠 아이콘·제목·글) 아래에 `more`가 있으면 `<p>`(같은 작은 글 모양), `link`가 있으면 `<Link href="/claim/setup" className={ds.button.secondary …}>`(휴대폰 전체 폭은 하지 않음 — 시안처럼 가운데 단추).
- 화면 글은 requirements 글자 그대로. 데스크·원장 같다(useDesk를 보지 않는다).

## 5-2. 업무일지 비트 안내 — `src/components/worklog/BitNotice.tsx`
- `const setup = status === 'setup-needed' && !desk` → `status === 'setup-needed'`(데스크도 [연결하러 가기]). `useDesk` 쓰임이 없어지면 import도 지운다. 머리 주석의 'desk-feedback AC-6306.4' 줄을 desk-setup AC-7006.1로 바꾼다.
- `BitNotice.test.tsx`의 옛 AC-6306.4 '데스크면 링크가 없다' 시험을 AC-7006.1 '데스크도 링크가 있다'로 바꾼다.

## 6. 설치 파일 읽기 규칙 — `supabase/migrations/20261119200000_desk_install_files.sql`
```sql
drop policy if exists "설치 파일 읽기(승인된 사용자·관리자)" on storage.objects;
drop policy if exists "설치 파일 읽기(승인된 사용자·데스크·관리자)" on storage.objects;
create policy "설치 파일 읽기(승인된 사용자·데스크·관리자)" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'install-files'
    and (
      (select public.my_clinic_hospital_id()) is not null
      or exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
    )
  );
```
- `my_clinic_hospital_id()` = `coalesce(my_hospital_id(), my_desk_hospital_id())`(desk_accounts.sql, 정의자 함수·authenticated 실행 권한 이미 있음): 승인된 원장 또는 승인된 병원의 데스크(자기 병원 줄 없음). 대기·거절 병원의 데스크는 `my_desk_hospital_id()`가 null이라 막힌다.
- 표·함수·버킷은 만들지도 고치지도 않는다. 올리기 정책은 그대로.
- 머리 주석: 무엇을 왜, SQL Editor에 통째로 붙여 한 번 실행, 먼저 `20261117000000_install_files.sql`·`20261118100000_desk_accounts.sql`, 두 번 붙여도 그대로, 그리고 "나중에 20261117000000_install_files.sql을 다시 붙이면 옛 정책이 다시 생기지만 데스크 읽기는 새 정책이 그대로 연다(정책은 '또는'으로 합쳐짐)".
- 운영 반영: 사용자가 SQL Editor에서 실행(ssk-supabase-sql) → 웹 배포는 그 뒤. 웹만 먼저 나가면 데스크의 [내려받기]가 '받지 못했어요'를 보일 뿐 다른 곳은 깨지지 않는다.

## 6-2. 결정 기록 — `docs/ADR.md` ADR-031
- '화면' 줄: 다른 주소는 막힌 화면이되 비트 PC 연결 화면(`/claim/setup`)은 연다(탭에는 없음, 계정 메뉴·수납일지 안내 칸·업무일지 안내에서 감).
- '트레이드오프' 줄의 '데스크 PC의 확장·도우미 설치와 비트 PC 연결은 원장 계정으로 한다'를 '데스크도 비트 PC 연결 화면에서 설치 파일(읽기 규칙 "설치 파일 읽기(승인된 사용자·데스크·관리자)", `20261119200000_desk_install_files.sql`)을 받아 깔고 연결한다(desk-setup, 2026-11-19)'로 바꾼다.
- 설명 글만 고치는 곳: `src/lib/storage/installFiles.ts`·`src/components/install/DownloadButton.tsx` 머리 주석의 '승인된 사용자·관리자만' → '승인된 사용자·데스크·관리자'(코드 바뀜 없음).

## 7. 시험
- `DeskGate.test.tsx`: AC-7001.1·7001.2(`isDeskPath`·`DESK_MENU`·DeskGate가 `/claim/setup`에서 본문을 그림, 다른 주소는 그대로 막힘). 옛 막힌 주소 목록(`:44`)에서 `/claim/setup`을 빼고, `shell.test.tsx`의 데스크 주소 목록(`:246`, 거짓 목록)에서도 `/claim/setup`을 참 쪽으로 옮긴다(TASK-3).
- `page.test.tsx`: AC-7001.3 — 옛 AC-6305.4 '데스크면 아무것도 그리지 않는다' 시험을 데스크 화면을 그리는 시험으로 바꾼다(원장 시험 그대로).
- `SetupScreen.test.tsx`: AC-7002.1·7002.2 — RoleProvider desk로 감싸 그린다.
- `shell.test.tsx`: AC-7003.1·7003.2(AccountMenu) — 옛 데스크 메뉴 시험(`:1306-1308`, 항목 [로그아웃] 하나·링크 없음)을 [비트 PC 연결]·[로그아웃]으로 바꾼다(TASK-4, TASK-3 다음).
- `BitNotice.test.tsx`: AC-7006.1.
- `RemoteView.test.tsx`: AC-7004.1~.3.
- `supabase/deskInstallFiles.rls.test.ts`(새): AC-7005.1~.4 — PGlite에 auth·desk_accounts가 기대는 migration들·install_files·desk_accounts·이 파일을 차례로 돌린다(`installFiles.rls.test.ts`의 storage 흉내와 `desk.rls.test.ts`의 앞 migration 목록을 따라 쓴다). 두 번 돌려도 같은지, 정책 이름·버킷 한정·옛 정책 없음, 데스크(승인·대기·거절)·원장·관리자·아무 줄 없음·anon.

## 8. 위험
- 데스크가 연결 화면에서 [처음 등록]·[다시 등록](도우미에 기관기호 등록)을 할 수 있다 — 도우미와 브라우저 안의 일이고 서버 자료는 바뀌지 않는다. 같은 의원 PC를 데스크·원장이 함께 쓰는 지금 방식과 같다.
- 운영 SQL을 붙이기 전에 웹이 나가면 데스크 [내려받기]만 실패(6절).
