using System;
using System.Linq;
using Erp.Core.Uisarang;
using Xunit;
using static Erp.Core.Tests.Uisarang.Day.DayKit;

namespace Erp.Core.Tests.Uisarang.Day;

/// <summary>
/// spec erp-uisarang TASK-13 AC-4206.5: closing.uisCodes 코드 목록 UisCodes(design.md 3-3). 기간은 보지 않고 처방통계 하나를 머리글로 찾는다.
/// 처방통계는 읽은 뒤 지우고(ok·notAll), 둘이면 남긴다. 환자별·종류 모름은 5-5대로 지우고 다른 합계 엑셀은 지우지 않는다.
/// </summary>
public class UisCodesReadTests
{
    [Fact(DisplayName = "AC-4206.5 처방통계 하나(기간 상관없이) → ok·조회일 from·to·코드마다 한 줄 총액 큰 차례, 처방통계는 지우고 다른 합계 엑셀은 그대로")]
    public void CodesFromRx()
    {
        using var rig = new DayRig();
        rig.Folder
            .Fixture(DayRig.Rx, "rx-3months.xls")
            .Fixture(DayRig.Income, "income.xls")
            .Fixture(DayRig.Rsv, "rsv.xls")
            .Fixture(DayRig.VisitPatients, "visit-patients.xls")
            .Fixture("모르는 표.xls", "other-report.xls");
        var result = rig.Codes();
        var data = Data(result);

        Assert.Equal(new[] { "state", "from", "to", "value", "codes" }, Keys(data));
        Assert.Equal("ok", data.GetProperty("state").GetString());
        Assert.Equal("2026-08-24", data.GetProperty("from").GetString());
        Assert.Equal("2026-11-23", data.GetProperty("to").GetString());
        Assert.Equal(System.Text.Json.JsonValueKind.Null, data.GetProperty("value").ValueKind);
        var codes = result.Codes;
        Assert.Equal(12, codes.Count);
        Assert.Equal(new[] { "MM300", "ES100", "SO100", "CA100", "PROLO C", "ES200", "PT100", "AA222", "KK090", "LA357", "ZZ001", "MC100" },
            codes.Select(code => code.Code));
        Assert.Equal(30_000_000, codes[0].Amount);
        Assert.Equal(500, codes[0].Qty);
        Assert.Equal(30.5, codes.Single(code => code.Code == "LA357").Qty);
        Assert.Null(codes.Single(code => code.Code == "ZZ001").Name);
        Assert.Equal("도수치료 (가짜)", codes[0].Name);

        Assert.Equal(new[] { DayRig.Rsv, DayRig.Income }.OrderBy(name => name, StringComparer.Ordinal), rig.Folder.Names);
        Assert.DoesNotContain("Delete:" + DayRig.Income, rig.Folder.Calls);
        Assert.DoesNotContain("Delete:" + DayRig.Rsv, rig.Folder.Calls);
        var read = rig.Folder.Calls.IndexOf("Read:" + DayRig.VisitPatients);
        Assert.Equal("Delete:" + DayRig.VisitPatients, rig.Folder.Calls[read + 1]);
        Assert.Contains("Delete:모르는 표.xls", rig.Folder.Calls);
    }

    [Fact(DisplayName = "AC-4206.5 처방통계가 없으면 missing(코드 없음), 다른 합계 엑셀은 지우지 않음")]
    public void CodesMissing()
    {
        using var rig = new DayRig();
        rig.Folder.Fixture(DayRig.Income, "income.xls").Fixture(DayRig.RsvPatients, "rsv-patients.xls");
        var result = rig.Codes();

        Assert.Equal(UisCodesState.Missing, result.State);
        Assert.Empty(result.Codes);
        Assert.Null(result.From);
        Assert.Equal(new[] { DayRig.Income }, rig.Folder.Names);
    }

    [Fact(DisplayName = "AC-4206.5 조건이 '전체'가 아닌 처방통계는 notAll(value)·지움, 둘이면 twice·둘 다 남김")]
    public void CodesNotAllAndTwice()
    {
        using (var rig = new DayRig())
        {
            rig.Made(DayRig.Rx, Sheet(
                Row("기간별처방통계"),
                Row("[조 회 일] 2026-10-01 ~ 2026-11-23", null, "[구 분] 외래"),
                Row("코드", "처방명칭", "총투여량", "총액"),
                Row("CA100", "씨암 유도 (가짜)", 4, 220_000)));
            var result = rig.Codes();
            Assert.Equal(UisCodesState.NotAll, result.State);
            Assert.Equal("외래", result.Value);
            Assert.Empty(result.Codes);
            Assert.Empty(rig.Folder.Names);
        }

        using (var rig = new DayRig())
        {
            rig.Folder.Fixture(DayRig.Rx, "rx.xls").Fixture("통계-기간별처방통계 (1).xls", "rx-3months.xls");
            var result = rig.Codes();
            Assert.Equal(UisCodesState.Twice, result.State);
            Assert.Empty(result.Codes);
            Assert.Equal(2, rig.Folder.Names.Count);
            Assert.DoesNotContain(rig.Folder.Calls, call => call.StartsWith("Delete:", StringComparison.Ordinal));
        }
    }

    [Fact(DisplayName = "AC-4206.5 열린 엑셀이 있으면 state open이고 아무것도 읽거나 지우지 않음")]
    public void CodesOpen()
    {
        using var rig = new DayRig();
        rig.Folder.Fixture(DayRig.Rx, "rx-3months.xls").Fixture(DayRig.VisitPatients, "visit-patients.xls");
        rig.Folder.Open.Add(DayRig.VisitPatients);
        var result = rig.Codes();

        Assert.Equal(UisCodesState.Open, result.State);
        Assert.Empty(result.Codes);
        Assert.Empty(rig.Folder.Touches);
        Assert.Equal(2, rig.Folder.Names.Count);
    }

    [Fact(DisplayName = "AC-4206.5 코드 목록은 2,000개까지, 21자 넘는 코드도 넣음")]
    public void CodesLimit()
    {
        using var rig = new DayRig();
        var rows = new System.Collections.Generic.List<System.Collections.Generic.IReadOnlyList<XlsCell>>
        {
            Row("[조 회 일] 2026-11-01 ~ 2026-11-23", null, "[구 분] 전체"),
            Row("코드", "처방명칭", "총투여량", "총액"),
            Row("ABCDEFGHIJKLMNOPQRSTUVWXYZ", "긴 코드 (가짜)", 1, 9_999_999),
        };
        for (var i = 0; i < 2_100; i++) rows.Add(Row("C" + i.ToString("D5", System.Globalization.CultureInfo.InvariantCulture), null, 1, i));
        rig.Made(DayRig.Rx, rows);
        var result = rig.Codes();

        Assert.Equal(UisCodesState.Ok, result.State);
        Assert.Equal(2_000, result.Codes.Count);
        Assert.Equal("ABCDEFGHIJKLMNOPQRSTUVWXYZ", result.Codes[0].Code);
    }
}
