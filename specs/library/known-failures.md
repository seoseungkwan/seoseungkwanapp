# library — 이 PC에서 원래 나는 실패

기준 a10eb867에서도 같은 6파일이 실패한다(이 PC 탓): e2e/lib/envFile.test.ts, e2e/lib/session.test.ts(권한 600), src/app/api/ai/notices/attachText·collector·collect/route(node_modules에 fflate·unpdf 없음), src/components/landing/rules.test.ts(경로). npm run build도 fflate·unpdf 없음으로 실패(운영 Vercel은 새로 설치하므로 해당 없음).
