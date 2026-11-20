# 비트 접수 화면 칸 (2026-11-20 이 PC 확인)

조사 도구: scratchpad `injmemo-probe/probe.ps1`(AutomationId·클래스·자리만, 값은 글자 수만). 환자 값은 보지 않았다(그때 떠 있던 환자는 테스트 환자가 아님).

- 프로세스 `BITRegistrations`, 맨 위 창 Name `접수`, 클래스 `WindowsForms10.Window.8.app.0.378734a`, 1936×1048(최대화)
- **AutomationId는 창 핸들 숫자**(WinForms 컨트롤 이름이 UIA에 안 나옴) → 실행마다 바뀌어 쓸 수 없다. **라벨 글로 찾는다.**
- 한 줄 = 패널(`WindowsForms10.Window.8…`) 안에 STATIC 라벨 + EDIT 하나

| 칸 | 라벨 STATIC Name | EDIT 자리·크기(최대화 기준) | 비고 |
|---|---|---|---|
| 차트번호 | `차트번호(F1)(엔터)` | (152,145) 136×22 | 값 14자리 고정 길이 → Trim·앞 0 무시 |
| 접수메모(당일) | `접수메모(당일)` | (149,859) 445×22 | 한 줄 칸, **여기에 넣는다** |
| 접수메모(연속) | `접수메모(연속)` | (149,888) 448×90 | 여러 줄, 건드리지 않음 |

- 찾는 법: 접수 창 자손 중 Name이 라벨과 같은 STATIC → 부모 패널 → 그 패널의 `WindowsForms10.EDIT…` 자식. 대비: 라벨 오른쪽 같은 줄(y ±5)의 EDIT.
- 읽기: WM_GETTEXTLENGTH(0x0E)·WM_GETTEXT(0x0D) 됨. 넣기: EM_SETSEL(-1)·EM_REPLACESEL (청구 메모 도우미와 같은 길) — 실제 넣기 시험은 테스트 환자(차트 2번)로만, 저장하지 않고.
- 접수 PC들도 같은 비트 판인지 의원에서 확인할 것.
