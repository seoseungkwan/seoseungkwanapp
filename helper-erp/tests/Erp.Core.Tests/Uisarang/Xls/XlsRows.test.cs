using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Text.Json;
using Erp.Core.Closing;
using Erp.Core.Uisarang;
using Xunit;

namespace Erp.Core.Tests.Uisarang.Xls;

/// <summary>
/// spec erp-uisarang TASK-1 REQ-4203: .xls(BIFF8) 읽기 부품 XlsRows(design.md 5-6)를 가짜 의사랑 엑셀(fixtures/fake-uisarang, 12-1)로 시험한다.
/// 숫자는 시안 예시 관계(지은 값)이고 환자별 엑셀의 글자 칸은 표시 글자(12-2)뿐이다.
/// </summary>
public class XlsRowsTests
{
    private static IReadOnlyList<IReadOnlyList<XlsCell>> Rows(string name) => FakeUisFiles.Rows(name);

    private static string?[] Texts(IReadOnlyList<XlsCell> row) => row.Select(cell => cell.Text).ToArray();

    private static void Empty(XlsCell cell)
    {
        Assert.Null(cell.Text);
        Assert.Null(cell.Number);
        Assert.True(cell.IsEmpty);
    }

    private static void Number(double expected, XlsCell cell)
    {
        Assert.Null(cell.Text);
        Assert.Equal(expected, cell.Number);
        Assert.False(cell.IsEmpty);
    }

    private static void Text(string expected, XlsCell cell)
    {
        Assert.Equal(expected, cell.Text);
        Assert.Null(cell.Number);
        Assert.False(cell.IsEmpty);
    }

    [Fact(DisplayName = "AC-4203.1 일일수입통계 가짜 엑셀: 첫 시트 줄을 시트 차례대로(제목·라벨·빈 줄·머리글·보험구분 넷·합계·병합 칸 아래 줄), 한글 글자 칸·숫자 칸·빈 칸")]
    public void IncomeRowsInOrder()
    {
        var rows = Rows("income.xls");
        Assert.Equal(10, rows.Count);
        Text("일일수입통계", rows[0][0]);
        Text("[조 회 일]", rows[1][0]);
        Text("2026-11-23 ~ 2026-11-23", rows[1][1]);
        Empty(rows[1][2]);
        Text("[외/입 구분]", rows[1][3]);
        Text("전체", rows[1][4]);
        Assert.All(rows[2], Empty);
        Assert.Equal(
            new[] { "보험구분", "총진료비", "급여총액", "청구액", "본인부담금", "진료수납액", "비급여", "초진수", "재진수", "인원계", "현금수납액", "카드수납액" },
            Texts(rows[3]));
        Assert.Equal(new[] { "건강보험", "의료급여", "자동차보험", "일반", "합계" }, rows.Skip(4).Take(5).Select(row => row[0].Text).ToArray());
        Number(4250000, rows[4][1]);
        Number(3200000, rows[4][2]);
        Number(1291600, rows[4][11]);
        Number(0, rows[5][11]);
        Number(97, rows[8][9]);
        Number(352500, rows[8][10]);
    }

    [Fact(DisplayName = "AC-4203.1 쉼표가 든 숫자 글자('1,741,100')는 숫자로 바꾸지 않고 글자 칸, 병합 칸(합계 줄 총진료비)은 빈 칸이고 바로 아래 줄이 숫자 칸")]
    public void CommaTextAndMergedCell()
    {
        var rows = Rows("income.xls");
        Text("1,741,100", rows[8][5]);
        Empty(rows[8][1]);
        Empty(rows[9][0]);
        Number(5182300, rows[9][1]);
        Assert.All(rows[9].Skip(2), Empty);
    }

    [Fact(DisplayName = "AC-4203.1 기간별처방통계: 소수 숫자 칸(총투여량 0.5·총액 99,999.9·12,345.6)은 그대로, 코드 글자의 앞뒤·가운데 빈칸·소문자도 고치지 않는다(정리는 보고서 셈이 한다)")]
    public void RxDecimalsAndRawCodes()
    {
        var rows = Rows("rx.xls");
        var codes = rows.Select(row => row[0].Text).ToList();
        var lowerRow = rows[codes.IndexOf(" mm300 ")];
        Number(2, lowerRow[3]);
        Number(120000, lowerRow[5]);
        var prolo = rows[codes.IndexOf("PROLO  C")];
        Number(99999.9, prolo[5]);
        var la = rows[codes.IndexOf("LA357")];
        Number(0.5, la[3]);
        Number(12345.6, rows[codes.IndexOf("KK090")][5]);
        // 쪽마다 되풀이되는 머리글 줄도 읽은 그대로 낸다(건너뛰기는 UisReport가 한다)
        Assert.Equal(2, codes.Count(code => code == "코드"));
    }

    [Fact(DisplayName = "AC-4203.1 날짜 서식 숫자 칸은 글자 'yyyy-MM-dd'(내원일별환자현황 위쪽 표 내원일 2026-11-23)")]
    public void DateCellIsText()
    {
        var rows = Rows("visits.xls");
        var day = rows.Single(row => row[0].Text == "2026-11-23");
        Text("2026-11-23", day[0]);
        Number(97, day[1]);
        Number(7, day[2]);
    }

    [Fact(DisplayName = "AC-4203.1 줄마다 칸 수가 같다(시트의 칸 수), 둘째 시트는 읽지 않는다(첫 시트만)")]
    public void SameWidthFirstSheetOnly()
    {
        var income = Rows("income.xls");
        Assert.All(income, row => Assert.Equal(12, row.Count));
        var other = Rows("other-report.xls");
        var texts = other.SelectMany(row => row).Select(cell => cell.Text).Where(text => text != null).ToList();
        Assert.Contains("월별매출", texts);
        Assert.DoesNotContain("둘째 시트", texts);
        Assert.All(other, row => Assert.Equal(other[0].Count, row.Count));
    }

    [Fact(DisplayName = "AC-4203.1 환자별 가짜 엑셀(내원·예약 아래쪽 표)도 같은 꼴로 읽고 차트번호·주민번호는 글자 칸 그대로다")]
    public void PatientFilesRead()
    {
        var visits = Rows("visit-patients.xls");
        var header = visits.First(row => row[0].Text == "차트번호");
        Assert.Contains("주민등록번호", Texts(header));
        var first = visits.First(row => row[0].Text == "9000001");
        Text("가짜환자01", first[1]);
        Text("800101-1******", first[2]);

        var rsv = Rows("rsv-patients.xls");
        Assert.Contains(rsv, row => row.Any(cell => cell.Text == "방문여부"));
        Assert.Contains(rsv, row => row.Any(cell => cell.Text == "9000001"));
    }

    [Fact(DisplayName = "AC-4203.1 가짜 엑셀 16개(design.md 12-1)가 시험 출력 uisarang/에 복사되어 있다")]
    public void FixturesCopied()
    {
        Assert.Equal(16, FakeUisFiles.Names.Count);
        foreach (var name in FakeUisFiles.Names) Assert.True(FakeUisFiles.Bytes(name).Length > 0, name);
    }

    public static TheoryData<string> NotBiff8 => new TheoryData<string> { "broken.xls", "real-xlsx.xls", "html.xls" };

    [Theory(DisplayName = "AC-4203.2 깨진 바이트(자른 .xls)·xlsx(zip)를 .xls 이름으로·HTML을 .xls 이름으로는 UisFileException 하나")]
    [MemberData(nameof(NotBiff8))]
    public void NotBiff8Refused(string name)
    {
        var bytes = FakeUisFiles.Bytes(name);
        Assert.Throws<UisFileException>(() => XlsRows.Read(bytes));
    }

    [Fact(DisplayName = "AC-4203.2 빈 파일·OLE 머리 8바이트만·글자 바이트·환자별 엑셀을 반으로 자른 것도 UisFileException")]
    public void OtherBrokenBytes()
    {
        var patients = FakeUisFiles.Bytes("visit-patients.xls");
        var cases = new[]
        {
            new byte[0],
            new byte[] { 0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1 },
            Encoding.UTF8.GetBytes("보험구분,진료수납액\n합계,1741100\n"),
            patients.Take(patients.Length / 2).ToArray(),
        };
        foreach (var bytes in cases) Assert.Throws<UisFileException>(() => XlsRows.Read(bytes));
    }

    [Fact(DisplayName = "AC-4203.2 UisFileException 글에는 파일의 칸 글자가 없고(환자 표시 글자·머리글·숫자) 안쪽 예외도 싣지 않는다")]
    public void ExceptionHasNoCellText()
    {
        var patients = FakeUisFiles.Bytes("visit-patients.xls");
        var broken = new[]
        {
            FakeUisFiles.Bytes("broken.xls"),
            FakeUisFiles.Bytes("real-xlsx.xls"),
            FakeUisFiles.Bytes("html.xls"),
            patients.Take(patients.Length / 2).ToArray(),
        };
        foreach (var bytes in broken)
        {
            var error = Assert.Throws<UisFileException>(() => XlsRows.Read(bytes));
            Assert.Null(error.InnerException);
            var text = error.ToString();
            foreach (var cell in new[] { "가짜환자", "800101", "010-0000", "가짜시", "9000001", "보험구분", "진료수납액", "합계", "1741100", "일일수입" })
            {
                Assert.DoesNotContain(cell, text);
            }
        }
    }

    [Fact(DisplayName = "AC-4203.2 시트 한도는 20,000줄·64칸이고, 한도를 넘는 시트는 UisFileException(한도와 같으면 읽음)")]
    public void SheetLimits()
    {
        Assert.Equal(20000, XlsRows.MaxRows);
        Assert.Equal(64, XlsRows.MaxColumns);
        var bytes = FakeUisFiles.Bytes("income.xls");   // 10줄 · 12칸
        Assert.Equal(10, XlsRows.Read(bytes, maxRows: 10, maxColumns: 12).Count);
        Assert.Throws<UisFileException>(() => XlsRows.Read(bytes, maxRows: 9, maxColumns: 64));
        Assert.Throws<UisFileException>(() => XlsRows.Read(bytes, maxRows: 20000, maxColumns: 11));

        var limited = XlsRows.Read(bytes, XlsRows.MaxRows, XlsRows.MaxColumns);
        var plain = XlsRows.Read(bytes);
        Assert.Equal(limited.Count, plain.Count);
        for (var r = 0; r < plain.Count; r++) Assert.Equal(limited[r], plain[r]);
    }
}

/// <summary>
/// spec erp-uisarang TASK-1: 다른 TASK가 같이 쓰는 공용 모양 UisTypes.cs(design.md 4-1)와 답 모델(3-2·3-3)의 JSON 이름·차례.
/// 답은 기존 Envelope와 같은 기본 직렬화(JsonPropertyName·이름 붙은 enum)로 본다.
/// </summary>
public class UisTypesTests
{
    private static List<string> Keys(JsonElement element) => element.EnumerateObject().Select(p => p.Name).ToList();

    private static JsonElement Json(object value) => JsonDocument.Parse(JsonSerializer.Serialize(value, value.GetType())).RootElement;

    [Fact(DisplayName = "UisTypes(design.md 4-1·5-1) 보고서 종류 여섯은 UIS_KINDS 차례·JSON 이름(income·rx·visits·visitPatients·rsv·rsvPatients), 환자별 둘·꼭 있어야 할 넷")]
    public void Kinds()
    {
        Assert.Equal(new[] { UisKind.Income, UisKind.Rx, UisKind.Visits, UisKind.VisitPatients, UisKind.Rsv, UisKind.RsvPatients }, UisKinds.All);
        Assert.Equal(new[] { "income", "rx", "visits", "visitPatients", "rsv", "rsvPatients" }, UisKinds.All.Select(UisNames.Of).ToArray());
        Assert.Equal(new[] { "\"income\"", "\"rx\"", "\"visits\"", "\"visitPatients\"", "\"rsv\"", "\"rsvPatients\"" },
            UisKinds.All.Select(kind => JsonSerializer.Serialize(kind)).ToArray());
        Assert.Equal(new[] { UisKind.VisitPatients, UisKind.RsvPatients }, UisKinds.All.Where(UisKinds.IsPatient).ToArray());
        Assert.Equal(new[] { UisKind.Income, UisKind.Rx, UisKind.VisitPatients, UisKind.RsvPatients }, UisKinds.All.Where(UisKinds.IsRequired).ToArray());
        Assert.Equal("unknown", UisNames.Unknown);
    }

    [Fact(DisplayName = "UisTypes(design.md 3-2·3-3) 보고서 state·closing.uisCodes state·폴더 종류의 JSON 이름")]
    public void StateNames()
    {
        var states = new[] { UisState.Ok, UisState.Missing, UisState.OtherDate, UisState.NotAll, UisState.Twice };
        Assert.Equal(new[] { "ok", "missing", "otherDate", "notAll", "twice" }, states.Select(UisNames.Of).ToArray());
        Assert.Equal(states.Select(s => "\"" + UisNames.Of(s) + "\"").ToArray(), states.Select(s => JsonSerializer.Serialize(s)).ToArray());

        var codeStates = new[] { UisCodesState.Ok, UisCodesState.Missing, UisCodesState.NotAll, UisCodesState.Twice, UisCodesState.Open };
        Assert.Equal(new[] { "ok", "missing", "notAll", "twice", "open" }, codeStates.Select(UisNames.Of).ToArray());
        Assert.Equal(codeStates.Select(s => "\"" + UisNames.Of(s) + "\"").ToArray(), codeStates.Select(s => JsonSerializer.Serialize(s)).ToArray());

        Assert.Equal("desktop", UisNames.Of(UisFolderKind.Desktop));
        Assert.Equal("profile", UisNames.Of(UisFolderKind.Profile));
        Assert.Equal("\"profile\"", JsonSerializer.Serialize(UisFolderKind.Profile));
    }

    /// <summary>비트 답(값이 든 것)의 JSON.</summary>
    private static JsonElement BitDay() => Json(new ClosingDayResult
    {
        Date = "2026-11-23",
        Groups = new[] { new ClosingGroupCount { Key = "carm" } },
        Ages = new[] { new ClosingAgeBand { Band = "0" } },
        Reservations = new ClosingReservations { Kinds = new[] { new ClosingReservationKind { Kind = "1" } } },
    });

    private static JsonElement UisDay() => Json(new UisDayResult
    {
        Date = "2026-11-23",
        Groups = new[] { new UisDayGroup { Key = "carm" } },
        Ages = new[] { new UisDayAge { Band = "0" } },
        Uis = new UisDayInfo { Reports = new[] { new UisDayReport() } },
    });

    [Fact(DisplayName = "UisTypes(design.md 3-2) 의사랑 closing.day 답은 비트 답(ClosingDayResult)과 칸 이름·차례가 같고 끝에 source·uis를 더한다")]
    public void DayAnswerMatchesBit()
    {
        var bit = BitDay();
        var uis = UisDay();
        Assert.Equal(Keys(bit).Concat(new[] { "source", "uis" }).ToList(), Keys(uis));
        foreach (var name in new[] { "patients", "money", "reservations", "warnings" })
        {
            Assert.Equal(Keys(bit.GetProperty(name)), Keys(uis.GetProperty(name)));
        }
        Assert.Equal(Keys(bit.GetProperty("groups")[0]), Keys(uis.GetProperty("groups")[0]));
        Assert.Equal(Keys(bit.GetProperty("ages")[0]), Keys(uis.GetProperty("ages")[0]));
        Assert.Equal("uisarang", uis.GetProperty("source").GetString());
    }

    [Fact(DisplayName = "UisTypes(design.md 3-2) 의사랑이 모르는 칸은 늘 null(90일초진·입원·주사·겹침·미수·감액 등), 예약 kinds는 빈 배열, 경고 세 칸은 그대로")]
    public void UnknownFieldsAreNull()
    {
        var uis = UisDay();
        Assert.Equal(JsonValueKind.Null, uis.GetProperty("patients").GetProperty("first90").ValueKind);
        foreach (var name in new[] { "inpatientVisits", "injection", "overlap" }) Assert.Equal(JsonValueKind.Null, uis.GetProperty(name).ValueKind);
        var group = uis.GetProperty("groups")[0];
        foreach (var name in new[] { "unpaidVisits", "new", "first90", "return" }) Assert.Equal(JsonValueKind.Null, group.GetProperty(name).ValueKind);
        Assert.Equal(JsonValueKind.Null, uis.GetProperty("ages")[0].GetProperty("first90").ValueKind);
        var money = uis.GetProperty("money");
        foreach (var name in new[] { "receivableIn", "unpaidNew", "discount", "disabledFund", "transfer", "refund" })
        {
            Assert.Equal(JsonValueKind.Null, money.GetProperty(name).ValueKind);
        }
        Assert.Equal(0, uis.GetProperty("reservations").GetProperty("kinds").GetArrayLength());
        var warnings = uis.GetProperty("warnings");
        Assert.False(warnings.GetProperty("moneyUnconfirmed").GetBoolean());
        Assert.False(warnings.GetProperty("splitUnconfirmed").GetBoolean());
        Assert.Equal(0, warnings.GetProperty("unpaidVisits").GetInt64());
        Assert.False(warnings.GetProperty("noHistory").GetBoolean());

        // 값을 넣은 칸은 숫자로 나간다
        var filled = Json(new UisDayResult
        {
            Patients = new UisDayPatients { New = 7, Return = 57, PtVisit = 31, NoExamFee = 0, Total = 97 },
            Money = new UisDayMoney { Total = 5182300, Received = 1741100 },
            Reservations = new UisDayReservations { Patients = 31 },
            Warnings = new UisDayWarnings { UnknownAge = 3 },
        });
        Assert.Equal(97, filled.GetProperty("patients").GetProperty("total").GetInt64());
        Assert.Equal(5182300, filled.GetProperty("money").GetProperty("total").GetInt64());
        Assert.Equal(31, filled.GetProperty("reservations").GetProperty("patients").GetInt64());
        Assert.Equal(3, filled.GetProperty("warnings").GetProperty("unknownAge").GetInt64());
    }

    [Fact(DisplayName = "UisTypes(design.md 3-2) uis 칸 차례(folder·reports·open·deleted·kept·deleteFailed·unknownFiles·checks·fractional·negative·reservations)와 reports 항목·checks 칸")]
    public void UisBlockShape()
    {
        var info = Json(new UisDayInfo
        {
            Folder = UisFolderKind.Profile,
            Reports = new[] { new UisDayReport { Kind = UisKind.RsvPatients, State = UisState.OtherDate, Cached = true, From = "2026-11-24", To = "2026-11-24", Columns = new[] { "방문여부" } } },
            Open = new[] { "income", UisNames.Unknown },
            Checks = new UisDayChecks { TotalFee = new long[] { 5182300, 5182301 } },
            Reservations = new UisDayRsv { Total = 32, Visited = 25 },
        });
        Assert.Equal(new[] { "folder", "reports", "open", "deleted", "kept", "deleteFailed", "unknownFiles", "checks", "fractional", "negative", "reservations" }, Keys(info));
        Assert.Equal("profile", info.GetProperty("folder").GetString());
        var report = info.GetProperty("reports")[0];
        Assert.Equal(new[] { "kind", "state", "cached", "from", "to", "value", "columns" }, Keys(report));
        Assert.Equal("rsvPatients", report.GetProperty("kind").GetString());
        Assert.Equal("otherDate", report.GetProperty("state").GetString());
        Assert.Equal(JsonValueKind.Null, report.GetProperty("value").ValueKind);
        var checks = info.GetProperty("checks");
        Assert.Equal(new[] { "totalFee", "received", "headcount", "rxTotal", "visitRows", "visitNew", "rsvRows", "rsvVisited", "noDate" }, Keys(checks));
        Assert.Equal(2, checks.GetProperty("totalFee").GetArrayLength());
        Assert.Equal(JsonValueKind.Null, checks.GetProperty("received").ValueKind);
        Assert.False(checks.GetProperty("noDate").GetBoolean());
        Assert.Equal(new[] { "total", "visited" }, Keys(info.GetProperty("reservations")));

        var empty = Json(new UisDayInfo());
        Assert.Equal(JsonValueKind.Null, empty.GetProperty("reservations").ValueKind);
        Assert.Equal("desktop", empty.GetProperty("folder").GetString());
        foreach (var name in new[] { "reports", "open", "fractional", "negative" }) Assert.Equal(0, empty.GetProperty(name).GetArrayLength());
    }

    [Fact(DisplayName = "UisTypes(design.md 3-3) closing.uisCodes 답 칸: state·from·to·value·codes { code, name, qty, amount }")]
    public void CodesAnswerShape()
    {
        var answer = Json(new UisCodesResult
        {
            State = UisCodesState.Ok,
            From = "2026-08-24",
            To = "2026-11-23",
            Codes = new[] { new UisCodeRow { Code = "LA357", Name = null, Qty = 30.5, Amount = 298900 } },
        });
        Assert.Equal(new[] { "state", "from", "to", "value", "codes" }, Keys(answer));
        Assert.Equal("ok", answer.GetProperty("state").GetString());
        var row = answer.GetProperty("codes")[0];
        Assert.Equal(new[] { "code", "name", "qty", "amount" }, Keys(row));
        Assert.Equal(30.5, row.GetProperty("qty").GetDouble());
        Assert.Equal(JsonValueKind.Null, row.GetProperty("name").ValueKind);
        Assert.Equal(0, Json(new UisCodesResult()).GetProperty("codes").GetArrayLength());
    }

    [Fact(DisplayName = "UisTypes(design.md 4-1) 보고서 숫자(*Facts)에는 글자 칸이 없다: 숫자·참거짓·못 찾은 칸 이름(Columns)·처방 코드 열쇠뿐")]
    public void FactsHaveNoText()
    {
        var allowed = new[] { typeof(long?), typeof(int), typeof(int[]), typeof(bool), typeof(string[]), typeof(IReadOnlyDictionary<string, RxCode>) };
        foreach (var type in new[] { typeof(IncomeFacts), typeof(RxFacts), typeof(VisitsFacts), typeof(VisitPatientFacts), typeof(RsvFacts), typeof(RsvPatientFacts) })
        {
            foreach (var property in type.GetProperties(BindingFlags.Public | BindingFlags.Instance))
            {
                Assert.Contains(property.PropertyType, allowed);
                if (property.PropertyType == typeof(string[])) Assert.Equal("Columns", property.Name);
            }
            Assert.NotNull(type.GetProperty("Columns"));
        }
        Assert.Equal(new[] { typeof(double), typeof(long) }, typeof(RxCode).GetProperties().Select(p => p.PropertyType).ToArray());

        var patients = new VisitPatientFacts();
        Assert.Equal(10, patients.AgeNew.Length);
        Assert.Equal(10, patients.AgeReturn.Length);
        Assert.Empty(patients.Columns);
        Assert.Empty(new RxFacts().Codes);
        var set = new UisFactsSet { Income = new IncomeFacts { Received = 1741100 } };
        Assert.Equal(1741100, set.Income!.Received);
        Assert.Null(set.Rx);
    }

    [Fact(DisplayName = "UisTypes(design.md 4-1) XlsCell은 글자·숫자·빈 칸 가운데 하나이고 UisSheet·UisFile·UisArgs·UisSourceFile은 받은 값을 그대로 든다")]
    public void Shapes()
    {
        var text = new XlsCell("합계");
        Assert.Equal("합계", text.Text);
        Assert.Null(text.Number);
        var number = new XlsCell(0.5);
        Assert.Null(number.Text);
        Assert.Equal(0.5, number.Number);
        Assert.True(default(XlsCell).IsEmpty);
        Assert.True(XlsCell.Empty.IsEmpty);
        Assert.Throws<ArgumentNullException>(() => new XlsCell(null!));

        IReadOnlyList<IReadOnlyList<XlsCell>> rows = new[] { new[] { new XlsCell("합계"), new XlsCell(97) } };
        var sheet = new UisSheet(UisKind.Visits, new Dictionary<string, string> { ["조회일"] = "2026-11-23" }, 2,
            new Dictionary<string, int> { ["인원수"] = 1 }, new[] { "신규환자" }, rows);
        Assert.Equal(UisKind.Visits, sheet.Kind);
        Assert.Equal("2026-11-23", sheet.Labels["조회일"]);
        Assert.Equal(2, sheet.HeaderRow);
        Assert.Equal(1, sheet.Columns["인원수"]);
        Assert.Equal(new[] { "신규환자" }, sheet.MissingColumns);
        Assert.Same(rows, sheet.Rows);
        Assert.Null(new UisSheet(null, new Dictionary<string, string>(), -1, new Dictionary<string, int>(), new string[0], new IReadOnlyList<XlsCell>[0]).Kind);

        var file = new UisFile("통계-일일수입통계.xls", 4096);
        Assert.Equal("통계-일일수입통계.xls", file.Name);
        Assert.Equal(4096, file.Length);

        var args = new UisArgs(new[] { new UisCodeGroup("ptVisit", new[] { "AA222" }) }, new[] { new UisCodeGroup("manual", new[] { "MM300" }) });
        Assert.Equal("ptVisit", Assert.Single(args.Groups).Key);
        Assert.Equal(new[] { "MM300" }, Assert.Single(args.Sales).Codes);
        Assert.Equal(UisFolderKind.Profile, new UisSourceFile(UisFolderKind.Profile).Folder);
    }
}
