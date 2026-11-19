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
- 머리 주석: 실행 차례(auth → desk_accounts 뒤, 사이트 올리기 전), 두 번 붙여도 그대로, auth.sql을 다시 붙이면 이 파일도 다시.
- 시험 `supabase/hospitalEmr.rls.test.ts`: `clinicEmr.rls.test.ts`와 같은 PGlite 틀(앞 migration CHAIN → 이 파일). 확인: 칸·기본값·옛 줄 'bit'·넷 밖 거절·가입 insert에 emr·update 거절·두 번 붙임·`my_signup_emr` 원장(승인)/데스크/대기 원장/남/anon.

## 2. 자료 (브라우저)
- `src/types/db.ts` `HospitalRow`에 `emr: EmrKind`.
- `src/lib/storage/clinicProfile.ts`: `export async function loadSignupEmr(client: SignupEmrClient): Promise<EmrKind | null>` — `client.rpc('my_signup_emr')`, `isEmrKind(data)`면 data, 아니면 null, 던지면 null. `SignupEmrClient = { rpc(name: 'my_signup_emr'): PromiseLike<{ data: unknown; error: unknown }> }` 꼴(시험에서 가짜 주입).
- `src/components/clinic/useClinicProfile.ts`: `read`가 `[loadClinicProfile, loadSignup, loadSignupEmr]`를 함께 부른다(`loadSignupEmr(...).catch(() => null)`). `Read`에 `signupEmr: EmrKind | null`. 결과 `profile = stored ?? { ...defaultProfile(), emr: shown?.signupEmr ?? DEFAULT_EMR }`. 줄이 있으면 줄 값 그대로, failed면 defaultProfile()(bit).
- `src/lib/auth/admin.ts`: `COLUMNS`에 `emr`, `Application = Hospital & { emr: EmrKind }`, `toApplication`에서 `isEmrKind(row.emr) ? row.emr : 'bit'`.

## 3. 가입 신청 (TASK-4)
- `src/lib/auth/signup.ts`: `SignupInput.emr: EmrKind | null`, `SignupValue.emr: EmrKind`, `SignupErrors`에 emr. null이면 '쓰는 EMR을 골라 주세요.'.
- `src/lib/auth/hospital.ts` `submitSignup`: insert `{ name, applicant_name, phone, emr }`.
- `src/components/auth/SignupForm.tsx`: `IDS.emr = 'su-emr'`(묶음 id, 오류 `su-emr-error`), `ORDER = ['name', 'emr', 'applicantName', 'phone', 'agreed']`, `EMPTY.emr = null`. 칸: `<div role="group" aria-labelledby="su-emr-label" aria-describedby=…>` 안 단추 넷(`EMR_KINDS` 차례, 글 `EMR_LABEL`, `type="button"`, `aria-pressed`). 첫 단추 id가 `su-emr`(초점 자리). 모양은 병원 정보 칸의 EMR 단추(ClinicProfileCard)와 같은 묶음 클래스를 쓰되 폭 가득 `grid grid-cols-4 max-md:grid-cols-2`, 높이는 입력란과 같은 큰 칸. 오류면 묶음 테두리 오류 색(ds 오류 칸 색과 같은 토큰). 고르면 `errors.emr`만 지운다.

## 4. 관리자 목록 (TASK-5)
- `src/components/admin/AdminApplications.tsx`: `COLUMNS`에 `{ label: 'EMR', width: 'w-24 max-lg:w-20' }`를 '의원 이름' 다음에, 줄에 `<td className={cell.emr}>{EMR_LABEL[row.emr]}</td>`. 폰 그리드는 의원 이름 아래 줄(지금 cell 클래스의 col/row 자리 규칙을 따라 한 줄 더 둔다). 빈 목록 칸 `colSpan`은 `COLUMNS.length`라 저절로 맞는다.

## 5. 결정
- 승인 때 `clinic_profiles` 줄을 만드는 트리거는 쓰지 않는다: `hours`가 not null이라 기본 진료시간을 SQL에 똑같이 적어야 하고, 줄이 생기면 '저장 안 함' 상태(saved)가 바뀐다. 대신 줄이 없을 때만 가입 EMR을 기본값으로 읽는다.
- 데스크는 `hospitals`를 못 읽어서 원장·데스크 둘 다 되는 함수 하나(`my_signup_emr`)로 읽는다. `my_desk()` 모양은 바꾸지 않는다(돌려주는 칸을 바꾸면 함수를 지우고 다시 만들어야 한다).
- 가입 화면은 처음에 아무것도 고르지 않는다: 비트로 미리 골라 두면 다른 병원이 그냥 넘어가 '비트'로 남기 쉽다.

## 6. 위험
- SQL을 넣기 전에 웹을 올리면 가입 insert의 emr 칸이 없어 가입 신청이 실패한다 → 배포 전에 SQL 먼저(ssk-supabase-sql). `my_signup_emr`가 없으면 `loadSignupEmr`는 null → 'bit'(지금 그대로)라 병원 정보 읽기는 깨지지 않는다. 관리자 목록 읽기는 emr 칸이 없으면 실패하므로 역시 SQL 먼저.
