# 설계: 도우미·확장 웹앱에서 받기

## 흐름
- 새 판: GitHub Actions가 지금처럼 zip을 만든다 → Claude가 `gh release download`로 바탕화면 `도우미-설치파일`에 놓음 → 관리자가 /admin '설치 파일'에서 [새 파일 올리기] → Storage `install-files/<kind>/<이름>`
- 받기: 화면이 `latestInstallFiles()`로 종류마다 가장 높은 판을 보여 줌 → 단추 → `downloadInstallFile` → 브라우저가 zip 저장
- 서버 코드 없음(ADR-004). 브라우저 + Supabase RLS만. CSP는 그대로(`connect-src`에 Supabase가 이미 있음, 받기는 `storage.download`의 Blob → `URL.createObjectURL` → `<a download>`)
- 환자 정보와 무관(설치 파일만)

## SQL (`supabase/migrations/20261117000000_install_files.sql`, 사용자가 SQL Editor에 붙여 넣음)
- `insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('install-files','install-files',false,5000000,array['application/zip']) on conflict (id) do update set public=false, file_size_limit=5000000, allowed_mime_types=array['application/zip']`
- 읽기 정책(select, authenticated): `bucket_id='install-files' and ((select public.my_hospital_id()) is not null or exists (select 1 from public.admins a where a.user_id=(select auth.uid())))`
- 올리기 정책(insert, authenticated): `bucket_id='install-files' and exists(관리자) and name ~ '^(helper/precheck-helper|extension/precheck-extension)-[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.zip$'`
- 고치기·지우기 정책 없음. `drop policy if exists` 뒤 `create policy`(두 번 돌려도 됨). storage.objects 표 자체는 건드리지 않는다(form_backgrounds와 같음)
- 시험: `supabase/installFiles.rls.test.ts` — `formBackgrounds.rls.test.ts`와 같은 PGlite 방식(Supabase storage 흉내)

## 함수 (`src/lib/storage/installFiles.ts`)
```ts
export type InstallKind = 'helper' | 'extension'
export type InstallFile = { kind: InstallKind; version: [number, number, number]; name: string; path: string; size: number; uploadedAt: string }
export function parseInstallName(name: string): { kind: InstallKind; version: [number, number, number] } | null
export async function latestInstallFiles(): Promise<Record<InstallKind, InstallFile | null>>
export async function downloadInstallFile(file: InstallFile): Promise<void>
export async function uploadInstallFile(file: File): Promise<InstallFile>
export function installMeta(file: InstallFile): string // '0.9.0 · 0.9MB · 11월 17일 올림'
export class InstallFilesError extends Error { code: ErrorCode }
```
- 목록: `storage.from('install-files').list(kind, { limit: 100 })`, size = `metadata.size`, uploadedAt = `created_at`
- 본보기: `src/lib/storage/formBackgrounds.ts`(Storage 올리기·받기·오류 바꾸기)

## 오류 (`src/lib/errors.ts`·`src/types/errors.ts`)
| 번호 | 무엇이 | 어떻게 |
|---|---|---|
| E-INSTALL-READ-FAILED | 설치 파일 목록을 읽지 못했어요. | 인터넷 연결을 확인하고 새로 고침 하세요. |
| E-INSTALL-DOWNLOAD-FAILED | 파일을 받지 못했어요. | 인터넷 연결을 확인하고 다시 눌러 보세요. |
| E-INSTALL-FILE-NAME | 파일 이름이 맞지 않아요. | precheck-helper-0.9.0.zip처럼 '종류-판 번호.zip' 모양이어야 해요. 바탕화면 도우미-설치파일 폴더의 이름 그대로 올리세요. |
| E-INSTALL-FILE-SIZE | 파일이 너무 커요. | 5MB까지 올릴 수 있어요. 맞는 파일인지 확인하세요. |
| E-INSTALL-FILE-EXISTS | 같은 판이 이미 올라가 있어요. | 판 번호가 더 높은 새 파일을 올리세요. |
| E-INSTALL-UPLOAD-FAILED | 파일을 올리지 못했어요. | 관리자로 로그인했는지 확인하고 다시 해 보세요. |

## 화면 (시안 글자 그대로)
- 공용 단추 `src/components/install/DownloadButton.tsx`: props `{ kind, label, variant: 'primary' | 'secondary' }`. 목록은 `src/components/install/useInstallFiles.ts`(한 화면 한 번 읽기). 옆 글 = `installMeta(file)` '0.9.0 · 0.9MB · 11월 17일 올림'(크기: 1MB 이상은 소수 한 자리 MB, 아래는 KB 올림 없이 버림, 날짜는 `lib/analytics/dates.ts` 한국 날짜). 없음 → disabled + '아직 받을 파일이 없어요. 관리자에게 알려 주세요.'
- `src/components/claim/setup/StepGuide.tsx`: `OutLink href={HELPER_RELEASES_URL}` 세 곳을 `DownloadButton`으로(설치 단계는 primary, 옛 판 경고 [새 도우미 내려받기]·[확장 내려받기]도 primary). 순서 글은 그대로. `SetupScreen.tsx`의 '새 도우미가 있어요' 줄 링크도 `DownloadButton`(보조)으로 바꾸고(TASK-4, 구현 중 찾은 빠진 곳) `links.ts`의 `HELPER_RELEASES_URL` 지움
- 설정 탭 `src/components/settings/SettingsPage.tsx` 맨 위에 `src/components/settings/InstallFilesCard.tsx`: 제목 '비트 PC 연결 · 설치 파일', 설명 '비트를 쓰는 PC(접수·진료실)에 확장과 도우미를 깔아야 청구·통계·환자·수납일지가 비트 자료를 읽어요. 새 판이 나오면 여기서 다시 받아 덮어 설치하세요.', 줄 '크롬 확장'(설명 '크롬에 붙이는 작은 프로그램')·'도우미'(설명 '비트 자료를 읽는 PC 프로그램'), 머리 '종류·지금 판·크기', 보조 단추, 아래 링크 '비트 PC 연결 확인하러 가기 →'와 '설치 순서와 연결 확인은 이 화면에서 해요(청구 탭 아래)'
- 관리자 `src/components/admin/InstallFilesAdmin.tsx`를 `AdminApplications`의 제목 묶음 바로 아래·신청 탭 위에(`AdminApplications`에 선택 props `top?: ReactNode` 자리를 두고 `src/app/(app)/admin/page.tsx`가 넘김, TASK-5 — 검토에서 제목이 칸 아래로 내려간 것을 바로잡음): 제목 '설치 파일', 설명 '비트 PC 연결 화면의 [내려받기] 단추가 여기 올린 파일을 줘요. 로그인하고 승인된 사람만 받을 수 있어요.', 머리 '종류·지금 판·크기·올린 날', 줄 '도우미'·'크롬 확장', 단추 '새 파일 올리기'(올리는 중 '올리는 중…'), 안내 글 '새 판이 나오면 Claude가 바탕화면 도우미-설치파일 폴더에 zip을 놓아 둬요. 그 파일을 [새 파일 올리기]로 고르세요. 이름은 precheck-helper-0.9.0.zip·precheck-extension-0.3.0.zip 모양만 받아요(5MB까지). 예전 판은 지우지 않고 남겨 두고, 받기 단추는 가장 높은 판을 줘요.', 성공 상자 '{종류} {판}을 올렸어요' + '이제 모든 병원의 비트 PC 연결 화면에서 이 판을 받아요.'
- 768px 미만: 단추 44px 전체 폭, 표의 크기·올린 날 칸 숨김(시안 `hide-sm`)
- 시안의 '바뀜'·'새 칸' 표시와 페이지 머리 설명 글은 시안 표시용이라 만들지 않는다

## 위험
- 관리자가 올리기를 잊으면 받기 단추가 옛 판을 준다 → 판 낼 때마다 Claude가 사용자에게 올리기를 알린다
- Windows 크롬이 zip 형식을 `application/x-zip-compressed`로 줄 수 있다 → 올릴 때 `contentType`을 `application/zip`으로 정해 보낸다
- 무료 플랜 Storage 1GB 안(판마다 약 1MB)
