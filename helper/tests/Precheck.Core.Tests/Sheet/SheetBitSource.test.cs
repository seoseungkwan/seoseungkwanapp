using System;
using System.Collections.Generic;
using System.Linq;
using Precheck.Core.Bit;
using Precheck.Core.Sheet;
using Precheck.Core.Tests.Bit;
using Xunit;

namespace Precheck.Core.Tests.Sheet;

/// <summary>
/// 비트시트 app/src/Bit/BitSource.cs·BitSql.cs를 도우미 IBitDb로 옮긴 것(spec google-link TASK-9, design.md 9-1).
/// 가짜 DB(FakeDb)는 SheetSql 문장마다 정해 둔 줄을 준다. 칸 차례는 SheetSql 문장의 SELECT 차례 그대로다.
/// 이름 '가짜…', 차트번호 5자리 숫자, 병원 코드 H1·H2, 처방 코드 LA221·MM001·AA154는 모두 지어낸 것이다.
/// </summary>
public class SheetBitSourceTests
{
    private static readonly DateTime Today = new DateTime(2026, 11, 24);
    private static readonly DateTime Day = new DateTime(2026, 11, 23);

    private static FakeDb OneHospital(string code = "H1 ", string name = "가짜정형외과의원")
    {
        var db = new FakeDb();
        db.Answer(SheetSql.HospitalsSql, _ => new[] { new object?[] { code, name } });
        foreach (var sql in new[] { SheetSql.VisitsSql, SheetSql.CodesSql, SheetSql.PaymentsSql, SheetSql.BillsSql, SheetSql.CancelledSql })
        {
            db.Answer(sql, _ => new object?[0][]);
        }
        return db;
    }

    [Fact(DisplayName = "AC-8510.1 비트 하루 읽기: 다섯 문장(내원·처방·수납·계산·취소 접수)을 그날 0시~다음 날 0시·그 병원 범위로, 칸 차례대로 DayData를 만든다")]
    public void ReadsOneDayIntoDayData()
    {
        var db = OneHospital();
        db.Answer(SheetSql.VisitsSql, _ => new[]
        {
            new object?[] { " 101 ", " 12345 ", "가짜하나 ", "202611230910", "OS", "1", "31" },
            new object?[] { "101", "12345", "가짜하나", "202611230911", "OS", "1", 31 },
            new object?[] { "102", "23456", "가짜둘", "202611231000", "OS2", "4", 21m },
            new object?[] { "", "34567", "가짜빈번호", "202611231100", "OS", "4", 31 },
        });
        db.Answer(SheetSql.CodesSql, _ => new[]
        {
            new object?[] { "101", "la221", "04", "3" },
            new object?[] { "101", "D1", "04", "8" },
            new object?[] { "102", "MM001", "06", "1" },
            new object?[] { "999", "AA154", "01", "1" },
        });
        db.Answer(SheetSql.PaymentsSql, _ => new[]
        {
            new object?[] { "101", "12345", "RCV", 5000m, 10000m, 0m, "202611230920", 1, "가짜하나" },
            new object?[] { "OLD", "23456", "COR", 3000m, null, null, "202611231010", 2, "가짜둘" },
            new object?[] { "102", "23456", "COO", 1500m, 0m, 0m, "202611231011", 3, "가짜둘" },
            new object?[] { "102", "23456", "QCV", 1000m, 0m, 0m, "202611231012", 4, "가짜둘" },
            new object?[] { "102", "23456", "TFC", 1m, 0m, 0m, "202611231013", 5, "가짜둘" },
        });
        db.Answer(SheetSql.BillsSql, _ => new[]
        {
            new object?[] { "101", 15000m, 50000m, 31, 1 },
            new object?[] { "102", null, null, null, 0 },
        });
        db.Answer(SheetSql.CancelledSql, _ => new[] { new object?[] { "45678", "가짜취소" }, new object?[] { "", "가짜빈" } });

        var source = new SheetBitSource(db, new Settings(), Today);
        var data = source.Read(Day);

        Assert.Equal("가짜정형외과의원", source.HospitalName);
        Assert.Equal("H1", source.HospitalCode);
        Assert.Equal(Day, data.Day);
        Assert.Equal(new[] { "101", "102" }, data.Visits.Select(v => v.VisitId)); // 내원 번호가 없거나 겹치면 뺀다(비트시트 그대로)
        var first = data.Visits[0];
        Assert.Equal("12345", first.Key);
        Assert.Equal("가짜하나", first.Name);
        Assert.Equal("202611230910", first.AcceptedAt);
        Assert.Equal("1", first.VisitKind);
        Assert.Equal(31, first.Insurance);
        Assert.Equal(new[] { "D1", "LA221" }, first.Codes.OrderBy(c => c, StringComparer.Ordinal));
        Assert.True(first.Injection);
        Assert.False(first.Therapy);
        Assert.Equal(21, data.Visits[1].Insurance);
        Assert.True(data.Visits[1].Therapy);

        Assert.Equal(
            new[] { PaymentType.Receipt, PaymentType.ReceivablePaid, PaymentType.ReceivableCreated, PaymentType.HealthFund, PaymentType.Other },
            data.Payments.Select(p => p.Type));
        Assert.Equal(10000m, data.Payments[0].Card);
        Assert.Equal(0m, data.Payments[1].Card);
        Assert.Equal("가짜둘", data.Payments[1].Name);
        Assert.Equal(2, data.Payments[1].Seq);

        Assert.Single(data.Bills);
        Assert.True(data.Bills["101"].DiscountFree);
        Assert.Equal(15000m, data.Bills["101"].Own);
        Assert.Equal("45678", data.Cancelled.Single().Key);

        // 다섯 문장 모두 그날 범위와 병원 범위로, 하루 읽기 시간 제한 20초(design.md 9-2)
        var range = db.Calls.Where(c => c.Sql != SheetSql.HospitalsSql && c.Sql != SheetSql.PaymentsSql).ToList();
        Assert.Equal(4, range.Count);
        Assert.All(range, c =>
        {
            Assert.Equal("202611230000", c.Args["@from"]);
            Assert.Equal("202611240000", c.Args["@to"]);
            Assert.Equal("H1", c.Args["@hospital"]);
            Assert.Equal(TimeSpan.FromSeconds(20), c.Timeout);
        });
        var pay = db.Calls.Single(c => c.Sql == SheetSql.PaymentsSql);
        Assert.Equal("20261123", pay.Args["@day"]);
        Assert.Equal("H1", pay.Args["@hospital"]);
        Assert.Equal("20261124", db.Calls.Single(c => c.Sql == SheetSql.HospitalsSql).Args["@today"]);
    }

    [Fact(DisplayName = "AC-8510.1 비트 하루 읽기 → 줄 만들기: 비트시트와 같은 환자 줄(나눠 낸 돈·미수입금·늦게 붙은 FREE·취소된 접수)")]
    public void ReadThenBuildGivesBitSheetRows()
    {
        var db = OneHospital();
        db.Answer(SheetSql.VisitsSql, _ => new[]
        {
            new object?[] { "201", "11111", "가짜가", "202611230900", "OS", "4", 31 },
            new object?[] { "202", "22222", "가짜나", "202611230930", "OS", "4", 31 },
        });
        db.Answer(SheetSql.PaymentsSql, _ => new[]
        {
            new object?[] { "201", "11111", "RCV", 5000m, 10000m, 0m, "202611230910", 1, "가짜가" },
            new object?[] { "OLD", "011111", "COR", 2000m, 0m, 0m, "202611230911", 2, "가짜가" },
            new object?[] { "202", "22222", "RCV", 8000m, 0m, 0m, "202611230940", 3, "가짜나" },
        });
        db.Answer(SheetSql.BillsSql, _ => new[] { new object?[] { "202", 8000m, 20000m, 31, 1 } });
        db.Answer(SheetSql.CancelledSql, _ => new[] { new object?[] { "33333", "가짜다" } });

        var settings = new Settings { TemplateUrl = "https://docs.google.com/spreadsheets/d/FAKEtemplate_0123456789/edit" };
        var rows = RowBuilder.Build(new SheetBitSource(db, settings, Today).Read(Day), settings);

        Assert.Equal(new[] { "11111", "22222" }, rows.Patients.Select(p => p.Key));
        Assert.Equal("1:5000,2:10000,3:2000", string.Join(",", rows.Patients[0].Money.Select(m => m.Sign + ":" + m.Amount)));
        Assert.Equal("6:0", string.Join(",", rows.Patients[1].Money.Select(m => m.Sign + ":" + m.Amount)));
        Assert.Equal("1:8000", string.Join(",", rows.Patients[1].FreeDropped.Select(m => m.Sign + ":" + m.Amount)));
        Assert.Equal("33333", rows.Cancelled.Single().Key);
    }

    [Fact(DisplayName = "AC-8510.1 설정의 병원 이름이 있으면 {병원} 자리에 그것, 고른 병원 코드는 그대로 쓴다")]
    public void SettingsHospitalNameAndCodeWin()
    {
        var db = OneHospital();
        db.Answer(SheetSql.HospitalsSql, _ => new[] { new object?[] { "H1", "가짜일" }, new object?[] { "H2", "가짜이" } });
        var source = new SheetBitSource(db, new Settings { HospitalCode = "h2", HospitalName = "가짜이름" }, Today);
        source.Read(Day);
        Assert.Equal("가짜이름", source.HospitalName);
        Assert.Equal("H2", source.HospitalCode);
        Assert.DoesNotContain(db.Sqls, sql => sql == SheetSql.HospitalVisitsSql);
        Assert.All(db.Calls.Where(c => c.Args.ContainsKey("@hospital")), c => Assert.Equal("H2", c.Args["@hospital"]));
    }

    [Fact(DisplayName = "AC-8510.1 병원 고르기: 여럿이면 최근 30일 내원이 있는 병원이 하나일 때 그것, 아니면 E-BIT-REG-MANY(고를 목록을 함께), 없으면 E-BIT-REG-NONE")]
    public void HospitalPickRules()
    {
        var two = OneHospital();
        two.Answer(SheetSql.HospitalsSql, _ => new[] { new object?[] { "H1", "가짜일" }, new object?[] { "H2", "가짜이" } });
        two.Answer(SheetSql.HospitalVisitsSql, _ => new[] { new object?[] { "H2", 812 } });
        Assert.Equal("H2", SheetBitSource.ResolveHospital(two, new Settings(), Today, out var name));
        Assert.Equal("가짜이", name);
        var visits = two.Calls.Single(c => c.Sql == SheetSql.HospitalVisitsSql);
        Assert.Equal("202610250000", visits.Args["@from"]);
        Assert.Equal("202611250000", visits.Args["@to"]);

        var busy = OneHospital();
        busy.Answer(SheetSql.HospitalsSql, _ => new[] { new object?[] { "H1", "가짜일" }, new object?[] { "H2", "가짜이" } });
        busy.Answer(SheetSql.HospitalVisitsSql, _ => new[] { new object?[] { "H1", 3 }, new object?[] { "H2", 812 } });
        var many = Assert.Throws<ManyHospitalsException>(() => SheetBitSource.ResolveHospital(busy, new Settings(), Today, out _));
        Assert.Equal("E-BIT-REG-MANY", many.Code);
        Assert.Equal(new[] { "H2", "H1" }, many.Options.Select(o => o.Code));

        var none = new FakeDb().Answer(SheetSql.HospitalsSql, _ => new object?[0][]);
        Assert.Equal("E-BIT-REG-NONE", Assert.Throws<BitException>(() => SheetBitSource.ResolveHospital(none, new Settings(), Today, out _)).Code);
        var missing = OneHospital();
        Assert.Equal("E-BIT-REG-NONE", Assert.Throws<BitException>(() => SheetBitSource.ResolveHospital(missing, new Settings { HospitalCode = "H9" }, Today, out _)).Code);
    }

    [Fact(DisplayName = "AC-8510.1 비트 읽기 관문: SheetSql 허용 목록의 문장과 정해 둔 매개변수만 DB에 닿는다(SELECT 하나·쓰기 낱말 없음), 아니면 E-BIT-READ-FAILED")]
    public void GuardStopsAnythingElse()
    {
        var db = OneHospital();
        var range = new Dictionary<string, object?> { ["@from"] = "202611230000", ["@to"] = "202611240000", ["@hospital"] = "H1" };
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => SheetSql.Query(db, SheetSql.VisitsSql + " ", range, TimeSpan.FromSeconds(1))).Code);
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => SheetSql.Query(db, "DELETE FROM dbo.OcmInf", range, TimeSpan.FromSeconds(1))).Code);
        var extra = new Dictionary<string, object?>(range) { ["@x"] = "1" };
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => SheetSql.Query(db, SheetSql.VisitsSql, extra, TimeSpan.FromSeconds(1))).Code);
        var tooLong = new Dictionary<string, object?>(range) { ["@hospital"] = new string('H', 33) };
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => SheetSql.Query(db, SheetSql.VisitsSql, tooLong, TimeSpan.FromSeconds(1))).Code);
        var notText = new Dictionary<string, object?>(range) { ["@from"] = 202611230000L };
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => SheetSql.Query(db, SheetSql.VisitsSql, notText, TimeSpan.FromSeconds(1))).Code);
        Assert.Empty(db.Calls);

        Assert.Equal(10, SheetSql.All.Count);
        foreach (var sql in SheetSql.All)
        {
            Assert.StartsWith(sql.StartsWith("WITH", StringComparison.Ordinal) ? "WITH" : "SELECT", sql, StringComparison.Ordinal);
            Assert.DoesNotContain(";", sql, StringComparison.Ordinal);
            Assert.DoesNotContain("\r", sql, StringComparison.Ordinal);
            Assert.True(SheetSql.IsAllowed(sql));
        }
        Assert.False(SheetSql.IsAllowed(null));
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => SheetSql.ParametersOf("SELECT 1")).Code);
    }

    [Fact(DisplayName = "AC-8510.1 설정 화면 목록: 병원(내원 많은 차례)·진료과(오늘 쓰는지·최근 90일 내원 수, 보일 차례)·최근 90일 처방(비트 분류로 종류) — 환자 값은 읽지 않는다")]
    public void CatalogLists()
    {
        var db = OneHospital("H1", "가짜일");
        db.Answer(SheetSql.HospitalVisitsSql, _ => new[] { new object?[] { "H1", 40 } });
        db.Answer(SheetSql.DepartmentsSql, _ => new[]
        {
            new object?[] { "OS2", "가짜과둘", "20200101", "20991231" },
            new object?[] { "OS", "가짜과하나", "20200101", "20991231" },
            new object?[] { "OS", "가짜과하나 옛", "20100101", "20191231" },
            new object?[] { "PT", "가짜과셋", "20100101", "20201231" },
        });
        db.Answer(SheetSql.DeptUsageSql, _ => new[] { new object?[] { "OS", 120 } });
        db.Answer(SheetSql.CodeUsageSql, _ => new[]
        {
            new object?[] { "LA221", 30, "가짜주사", "04", "3" },
            new object?[] { "MM001", 20, "가짜물리", "06", "1" },
            new object?[] { "", 5, "빈 코드", "01", "1" },
        });

        Assert.Equal("H1:가짜일:40", string.Join(",", BitCatalog.Hospitals(db, Today).Select(h => h.Code + ":" + h.Name + ":" + h.Visits)));
        var depts = BitCatalog.Departments(db, new Settings(), Today, out var hospital);
        Assert.Equal("H1", hospital);
        Assert.Equal("OS:120:True,OS2:0:True,PT:0:False", string.Join(",", depts.Select(d => d.Code + ":" + d.Visits90 + ":" + d.Current)));
        var usage = db.Calls.Single(c => c.Sql == SheetSql.DeptUsageSql);
        Assert.Equal("202608260000", usage.Args["@from"]);
        Assert.Equal("202611250000", usage.Args["@to"]);
        var codes = BitCatalog.RecentCodes(db, new Settings(), Today);
        Assert.Equal("LA221:주사,MM001:물리치료", string.Join(",", codes.Select(c => c.Code + ":" + c.Kind)));
        Assert.Equal("가짜일", BitCatalog.HospitalName(db, new Settings(), Today));
        Assert.Equal("H1", BitCatalog.HospitalCode(db, new Settings(), Today));
    }
}
