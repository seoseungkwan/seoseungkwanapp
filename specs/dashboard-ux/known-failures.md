# 이 PC(윈도우)에서 실패하는 시험 기록 — dashboard-ux 변경과 상관없음 (2026-11-08)

기준 커밋 fc81495(운영 = origin/feat-dashboard-saved)와 이 갈래 끝을 같은 PC에서 견줘 확인했다. `package.json`·`package-lock.json`과 아래 시험이 보는 폴더(`src/lib/analytics`·`src/components/landing`·`src/lib/parsers`·`fixtures`·`vitest.config.ts`)는 두 커밋 사이에 바뀌지 않았다.

## 1. `src/lib/analytics/aggregate.test.ts` — 전체 실행 때만 실패 (원인: 계산 시간 재기 + CPU 나눠 쓰기)
- 실패 시험: `그룹 셋을 넣어도 10만 줄을 1초 안에 센다`(:763, 검사 :774 `expect(performance.now() - start).toBeLessThan(1000)`). 형제 `10만 줄을 1초 안에 센다`(:753)도 같은 위험이 있다.
- 앞 인수인계의 "시간 초과"는 틀린 말이었다. 시험 제한 시간(이 파일의 무거운 시험은 `SLOW` 30초)에 걸린 것이 아니라, 시험 안의 **1초 스톱워치 검사**가 실패한다. 전체 실행 한 번(`npx vitest run src`, 159초)에 "Test timed out"은 0개, 이 시험은 `expected 1324.2395 to be less than 1000`.
- 걸린 시간: 이 시험 혼자 1245~1283ms(파일 전체 3.7~3.9초, 3회) / 전체 실행 안 3966ms(파일 10.4초). `aggregate()` 한 번은 혼자 227~319ms, 다른 시험과 함께면 780~1241ms(CPU Ryzen 5 7430U 6코어 12스레드, vitest 작업자 11개가 모든 코어를 쓰면 클럭이 내려가고 코어를 나눠 쓴다).
- 아닌 것: 타이머(파일에 `vi.*`·가짜 타이머·setTimeout·async·beforeEach 없음, setupFiles 없음) · 비동기 정리 누락(`aggregate`·dates·파서·가짜 파일 만들기에 Worker·타이머·열린 손잡이 없음) · 시험 간 간섭(vitest 4 기본 `isolate: true`·pool `forks`, 모듈에 바뀌는 상태 없음).
- 기준 커밋에서도 같은 일: 다른 창의 전체 시험이 CPU를 100% 쓰는 동안 fc81495에서 이 파일만 돌려도 `expected 1077.53 to be less than 1000`.
- 고치지 않았다(1초 한도도 늘리지 않음). 고치려면 시험 설정에서 이 파일을 다른 시험이 다 끝난 뒤 혼자(작업자 1개) 돌리는 방법이 있다(`vitest.config.ts` projects, 저장소 전체 시험 설정이라 이 기능 범위 밖). `src/workers/analyzeFiles.test.ts`(10만 줄 3초 한도)도 같은 약점이 있다.

## 2. `src/components/landing/rules.test.ts` — 2개, 윈도우에서 늘 실패 (원인: 경로 구분자)
- `AC-212.4: base.module.css를 부르는 랜딩 TSX는 모두 base라는 이름으로 부른다…`(:787)
- `AC-420.3: 랜딩 TSX(랜딩 폴더 *.tsx·src/app/page.tsx)에 'use client'…가 없다`(:1829)
- 근거: 이 갈래와 fc81495 임시 작업 폴더에서 `npx vitest run src/components/landing/rules.test.ts`가 둘 다 `Tests 2 failed | 199 passed (201)`, 실패 글이 시간 말고 같다. 기대 `"src/app/page.tsx"`, 받은 값 `"src\\app\\page.tsx"`·`"src\\components\\landing\\Hero.tsx"` …
- 이유: :769가 `node:path`의 `relative(ROOT, path)`로 이름을 만들어 윈도우에서는 `\`가 되고, 기대 목록은 `/`다. 랜딩은 이 기능 범위 밖이라 고치지 않았다.

## 3. 덧붙임
- `npx vitest run src`는 이름에 `src`가 든 `extension/src/manifest.test.ts`도 잡는데, 윈도우에서 `npm`이 `npm.cmd`라 beforeAll의 `spawnSync npm`이 ENOENT로 실패한다(이 기능과 상관없음).
- 부하가 아주 클 때 `PatientsEntry.test.tsx` AC-610.6이 한 번 실패했고 보통 전체 실행에서는 통과했다.
