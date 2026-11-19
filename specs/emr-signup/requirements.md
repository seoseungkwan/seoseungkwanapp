# 요구사항: 가입 신청 때 쓰는 EMR 고르기 (emr-signup)

## 배경
- 2026-11-19 사용자: 다른 병원(의사랑·이지스)이 쓰는 EMR을 "가입할 때부터" 고르게 → "가입 신청 화면에서 (추천)". 시안 `docs/mockups/emr-signup/index.html` 승인(notes.md "좋아").
- 지금 '쓰는 EMR'은 승인 뒤 설정 → 병원 정보(`clinic_profiles.emr`, emr-choice)에서만 고른다. 가입 신청 줄(`hospitals`)에는 EMR이 없다.
- 바꾸는 것: 가입 신청 때 고른 EMR을 `hospitals.emr`에 두고, 관리자 승인 목록에 보이고, 승인 뒤 병원 정보 줄이 아직 없으면 그 EMR을 기본값으로 쓴다(원장·데스크 모두). 병원 정보에서 저장하면 그 값이 이긴다(지금 그대로).

## 범위 밖
- 이미 승인된 병원 줄의 EMR을 관리자가 고치는 기능(병원이 설정에서 바꾼다).
- 가입 신청 뒤 신청자가 EMR을 고치는 기능(신청 줄 update 권한은 지금처럼 아무에게도 없다).
- 의사랑·이지스 자료 읽기(emr-choice 이후 따로).

### REQ-7301: 가입 신청 줄의 쓰는 EMR (SQL)
- AC-7301.1: Given 운영자가 `supabase/migrations/20261119400000_hospital_emr.sql`을 SQL Editor에 붙여 실행, When 끝나면, Then `public.hospitals`에 `emr text not null default 'bit' check (emr in ('bit','uisarang','egis','other'))` 칸이 있고 이미 있던 줄은 'bit'다. authenticated는 가입 신청 insert에서 `emr`을 넣을 수 있다(`name`·`applicant_name`·`phone`과 함께, 지금 정책 '내 병원 가입 신청(pending만)' 그대로). 넷 밖 값은 거절된다. `emr` update 권한은 아무에게도 없다. 두 번 붙여도 깨지지 않는다(`add column if not exists`, grant 다시 주기). authenticated가 hospitals에 넣을 수 있는 칸은 정확히 `name`·`applicant_name`·`phone`·`emr` 넷이다(`owner_id`·`status`·`email`·`agreed_at`·`reviewed_at`은 지금처럼 못 넣는다). hospitals의 다른 칸·정책·트리거 모양은 emr 칸 말고는 그대로다. 시험은 PGlite로 앞 migration → 이 파일 → 다시 이 파일 차례로 돌려 확인한다.
- AC-7301.2: Given 같은 SQL, When 끝나면, Then `public.my_signup_emr()`(인자 없음, `returns text`, `language sql stable security definer set search_path = ''`)이 있다: `select h.emr from public.hospitals h where h.id = public.my_clinic_hospital_id()` — 승인된 원장은 내 병원 emr, 데스크는 그 병원 emr, 둘 다 아니면(대기·거절 원장·남) null. anon·public은 실행할 수 없고 authenticated만 실행한다. 남의 병원 emr은 이 함수로도 표 읽기로도 볼 수 없다(표 읽기는 지금 정책: 내 줄 또는 관리자).

### REQ-7302: 가입 값·병원 정보 기본값·관리자 목록 자료
- AC-7302.1: Given `validateSignup`에 `emr: EmrKind | null`이 든 입력, When 검사하면, Then emr이 null이면 `errors.emr = '쓰는 EMR을 골라 주세요.'`이고 ok가 아니다. 넷 중 하나면 통과한 값에 `emr`이 실린다. 다른 칸 검사·문구는 지금 그대로다. `submitSignup`은 `{ name, applicant_name, phone, emr }` 네 칸만 `hospitals`에 넣는다(받은 값에 다른 칸이 섞여도).
- AC-7302.2: Given 병원 정보 읽기, When `loadSignupEmr(client)`를 부르면, Then `rpc('my_signup_emr')` 답이 넷 중 하나면 그 값, 오류·null·넷 밖·던짐이면 null이다.
- AC-7302.3: Given `useClinicProfile`, When 병원 정보 줄이 없고(state ready, saved 거짓) `loadSignupEmr`가 EMR을 주면, Then `profile.emr`이 그 EMR이다(병원 정보 칸의 처음 고른 값·대시보드·연결 화면이 따른다). 줄이 있으면 줄의 emr, 읽기 실패(failed)이거나 가입 EMR이 null이면 'bit'다(지금 그대로). 다른 칸(이름·진료시간 등) 기본값은 지금 그대로다.
- AC-7302.4: Given 관리자 목록 읽기, When `listApplications()`, Then 줄마다 `emr`(넷 중 하나, 넷 밖·없으면 'bit')이 실린다(읽는 칸에 emr 더함).

### REQ-7303: 가입 신청 화면의 '쓰는 EMR' 칸
- AC-7303.1: Given 가입 신청 화면, When 그리면, Then '의원 이름' 칸 다음·'신청자 이름' 칸 앞에 칸 이름 '쓰는 EMR'과 '필수' 표시, 단추 넷 '비트'·'의사랑'·'이지스'·'그 밖의 EMR'(`aria-pressed`, 처음엔 모두 false, 묶음은 칸 이름으로 이름 붙은 group), 도움말 '진료 자료를 읽어 오는 연결은 지금 비트만 돼요. 승인 뒤 설정 → 병원 정보에서 바꿀 수 있어요.'가 보인다. 넓은 화면은 한 줄 넷, 폰(md 미만)은 두 줄 둘씩이다. 단추를 누르면 그 단추만 pressed다.
- AC-7303.2: Given EMR을 고르지 않음, When [가입 신청]을 누르면, Then 보내지 않고 칸 아래 '쓰는 EMR을 골라 주세요.'(다른 칸 오류와 같은 모양, 묶음이 `aria-describedby`로 가리킴)가 보이고 묶음 테두리가 오류 색이다. 틀린 칸이 여럿이면 화면 차례(의원 이름 → 쓰는 EMR → 신청자 이름 → 연락처 → 동의)로 첫 칸에 초점을 둔다(쓰는 EMR이면 첫 단추). 단추를 고르면 그 칸 오류 글은 사라진다.
- AC-7303.3: Given 넷 중 하나를 고르고 다른 칸이 맞음, When [가입 신청], Then `submitSignup`에 고른 emr이 실려 간다.

### REQ-7304: 관리자 가입 승인 목록의 'EMR' 칸
- AC-7304.1: Given 관리자 가입 승인 목록(대기·승인·거절 탭 모두), When 그리면, Then 머리 줄 '의원 이름' 다음에 'EMR' 칸이 있고 줄마다 그 신청의 EMR 글('비트'·'의사랑'·'이지스'·'그 밖의 EMR', `EMR_LABEL`)이 보인다. 폰(md 미만)은 의원 이름 아래 줄에 보인다. 다른 칸·단추·동작은 지금 그대로다.
