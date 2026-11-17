# 설계: 수납일지 '초진' 글을 '신환'으로

- 글자만 바꾼다: `labels.ts` `VISIT_LABEL.new`, `LedgerRows.tsx` 거르기 칩, `SunapCards.tsx` 네 곳, `SunapSettings.tsx` 설명, `DoctorTable.tsx` 칸 제목·아래 글, `stats/sections/SunapSection.tsx` 네 곳.
- 시험은 바뀐 글로 고치고, 수납일지 화면·통계 수납일지 칸 글에 `(?<!90일)초진`이 없음을 본다.
- 위험: 없음(숫자·저장 모양 그대로).
