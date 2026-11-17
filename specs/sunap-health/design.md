# 설계: 수납일지 건강생활유지비는 미수 아님(0원)

## 도우미 `helper/src/Precheck.Core/Sunap/SunapSql.cs`
```sql
SELECT o.OrcOcmNum,o.OrcChtNum,SUM(o.OrcNewAmt)
FROM dbo.OrcInf o
WHERE o.OrcCod='QCV' AND o.OrcAccDte>=@day AND o.OrcAccDte<@nextDay
GROUP BY o.OrcOcmNum,o.OrcChtNum
```
- `HealthSql`, 매개변수는 `DayParameters`(@day·@nextDay·@hospital, @hospital은 쓰지 않아도 같은 묶음). `Allowed`에 더한다.

## `SunapTargets.cs`
- `MoneySql` 줄을 돌 때 차트마다 그날 내원 번호(줄 칸 0 `OrpOcmNum`)를 모은다.
- `HealthSql` 줄은 그 내원 번호가 모은 것 안에 있을 때만 그 차트 줄의 `Health`에 더한다(원 미만 버림).
- 미수 = `max(Won(Own − (Cash + Card + Check + Health)), 0)`. 다른 칸·답 모양은 그대로.
- 판: `helper/Directory.Build.props` `<Version>0.9.1</Version>`, `src/lib/bridge/versions.ts` `LATEST_HELPER = '0.9.1'`. 판 번호를 박은 시험들(handshake·client·input-wiring·RevenueCommands·SunapTargets·sunap-read 감싸개)을 0.9.1로 고친다.

## 위험
- QCV가 취소될 때 비트가 어떻게 적는지(음수 줄인지 줄 지움인지) 모른다 → 합이 음수면 0으로 보고 빼지 않는다(미수가 늘지는 않게).
- 0.9.1을 깔기 전에는 지금처럼 미수로 보인다(웹 배포 순서와 상관없음).
