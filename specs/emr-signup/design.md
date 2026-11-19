# 설계: 가입 신청 때 쓰는 EMR 고르기 (emr-signup)

## 1. SQL `supabase/migrations/20261119400000_hospital_emr.sql`
```sql
alter table public.hospitals
  add column if not exists emr text not null default 'bit'
  check (emr in ('bit', 'uisarang', 'egis', 'other'));
grant insert (name, applicant_name, phone, emr) on table public.hospitals to authenticated;

create or replace function public.my_signup_emr() returns text language sql stable security definer set search_path = ''
as $$ select h.emr from public.hospitals h where h.id = public.my_clinic_hospital_id() $$;
revoke all on function public.my_signup_emr() from public, anon, authenticated;
grant execute on function public.my_signup_emr() to authenticated;
```
- 표 select는 이미 table 단위(`grant select on table public.hospitals to authenticated`)라 emr도 지금 RLS(내 줄·관리자)로 읽힌다. update 권한은 주지 않는다.
- 머리 주석: 실행 차례(desk_accounts 뒤, 사이트 올리기 전), 두 번 붙여도 그대로.
- 시험 `supabase/hospitalEmr.rls.test.ts`: `clinicEmr.rls.test.ts`와 같은 PGlite 틀(앞 migration CHAIN → 이 파일). 확인: 칸·기본값·옛 줄 'bit'·넷 밖 거절·가입 insert에 emr·update 거절·두 번 붙임·authenticated insert 칸이 정확히 {name, applicant_name, phone, emr}(`information_schema.column_privileges`)·emr 말고 hospitals 모양 그대로(clinicEmr의 `withoutEmr`처럼 앞뒤 견줌)·`my_signup_emr` 원장(승인)/데스크/대기 원장/거절 원장/남/anon.

## 2. 자료 (브라우저)
- `src/types/db.ts` `HospitalRow`에 `emr: EmrKind`.
- `src/lib/storage/clinicProfile.ts`: `export async function loadSignupEmr(client: Pick<SupabaseClient, 'rpc'>): Promise<EmrKind | null>` — `client.rpc('my_signup_emr')`, 오류 없고 `isEmrKind(data)`면 data, 아니면 null, 던지면 null(같은 파일의 `Pick<SupabaseClient, …>` 방식).
- `src/components/clinic/useClinicProfile.ts`: `read`가 `[loadClinicProfile, loadSignup, loadSignupEmr]`를 함께 부른다(`loadSignupEmr(...).catch(() => null)`, 줄이 있어도 부른다 — 차례로 부르면 화면이 늦어진다). `Read`에 `signupEmr: EmrKind | null`, `FAILED`에 `signupEmr: null`. 결과는 줄 없음일 때만 가입 EMR을 쓴다:
  `profile = shown !== null && shown.profile === null ? { ...defaultProfile(), emr: shown.signupEmr ?? DEFAULT_EMR } : (stored ?? defaultProfile())` — 줄이 있으면 줄 값, 읽는 중·failed면 defaultProfile()(bit).
- `src/lib/auth/admin.ts`: `COLUMNS`에 `emr`, `Application = Hospital & { emr: EmrKind }`, `toApplication`에서 `isEmrKind(row.emr) ? row.emr : 'bit'`.

## 3. 가입 신청 (TASK-4)
- `src/lib/auth/signup.ts`: `SignupInput.emr: EmrKind | null`, `SignupValue.emr: EmrKind`, `SignupErrors`에 emr. null이면 '쓰는 EMR을 골라 주세요.'.
- `src/lib/auth/hospital.ts` `submitSignup`: insert `{ name, applicant_name, phone, emr }`(주석의 '세 칸'도 네 칸으로).
- `src/components/auth/SignupForm.tsx`: `ORDER = ['name', 'emr', 'applicantName', 'phone', 'agreed']`, `EMPTY.emr = null`. id는 이렇게 못 박는다:
  - `su-emr` = **첫 단추('비트')에만**(`IDS.emr`, 틀렸을 때 초점 자리). 묶음 div에는 id를 두지 않는다.
  - 칸 이름은 `<label>`이 아니라 `<span id="su-emr-label">`(단추 넷을 묶는 이름이라 label 대상이 없다).
  - 오류 `su-emr-error`, 도움말 `su-emr-help`. 묶음 `<div role="group" aria-labelledby="su-emr-label" aria-describedby="…">`은 오류가 있으면 '오류 도움말' 차례, 없으면 도움말만(연락처 칸과 같은 차례).
  - 단추 넷: `EMR_KINDS` 차례, 글 `EMR_LABEL`, `type="button"`, `aria-pressed`.
  - 모양: `ds.segment` 묶음·단추를 쓰고, 큰 칸은 접두사로만 덮는다(같은 속성 클래스를 접두사 없이 겹치지 않는다) — 묶음 `md:grid md:w-full md:grid-cols-4 max-md:grid-cols-2`, 단추 `md:h-11`(폰은 이미 `max-md:grid`·`max-md:w-full`·`max-md:h-11`). 폰 2×2의 칸 사이 선은 지금 `ds.segment`(통계 기간 고르기)와 같은 모양을 받아들인다(시안의 가로 줄 선은 없음).
  - 오류면 묶음 테두리를 오류 색으로(다른 칸 입력란 오류 테두리와 같은 토큰). 고르면 `errors.emr`만 지운다.
- `src/components/ui/classes.test.ts` AC-204.7 REQ-215 가입 신청 시험: EMR이 필수가 되어 [가입 신청] 전에 단추 하나('비트')를 누르는 한 줄만 더한다(저장 실패 오류 카드를 보려면 검사를 지나야 한다).

## 4. 관리자 목록 (TASK-5)
- `src/components/admin/AdminApplications.tsx`: `COLUMNS`에 `{ label: 'EMR', width: 'w-28 max-lg:w-24' }`를 '의원 이름' 다음에('그 밖의 EMR'이 칸 여백 빼고도 들어가는 폭), 줄에 `<td className={cell.emr}>{EMR_LABEL[row.emr]}</td>` — `cell.emr`은 `ds.table.tdSub` 바탕(시안 sub2 색). 폰 그리드는 의원 이름 아래 줄(지금 cell 클래스의 col/row 자리 규칙을 따라 한 줄 더 두고, 아래 칸들의 row를 하나씩 내린다). 768~1023px 칸 폭 주석도 고친다. 빈 목록 칸 `colSpan`은 `COLUMNS.length`라 저절로 맞는다.

## 5. 결정
- 승인 때 `clinic_profiles` 줄을 만드는 트리거는 쓰지 않는다: `hours`가 not null이라 기본 진료시간을 SQL에 똑같이 적어야 하고, 줄이 생기면 '저장 안 함' 상태(saved)가 바뀐다. 대신 줄이 없을 때만 가입 EMR을 기본값으로 읽는다.
- 데스크는 `hospitals`를 못 읽어서 원장·데스크 둘 다 되는 함수 하나(`my_signup_emr`)로 읽는다. `my_desk()` 모양은 바꾸지 않는다(돌려주는 칸을 바꾸면 함수를 지우고 다시 만들어야 한다).
- 가입 화면은 처음에 아무것도 고르지 않는다: 비트로 미리 골라 두면 다른 병원이 그냥 넘어가 '비트'로 남기 쉽다.

## 6. 위험
- SQL을 넣기 전에 웹을 올리면 가입 insert의 emr 칸이 없어 가입 신청이 실패한다 → 배포 전에 SQL 먼저(ssk-supabase-sql). `my_signup_emr`가 없으면 `loadSignupEmr`는 null → 'bit'(지금 그대로)라 병원 정보 읽기는 깨지지 않는다. 관리자 목록 읽기는 emr 칸이 없으면 실패하므로 역시 SQL 먼저.
