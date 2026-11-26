using System;
using System.Collections.Generic;
using System.Linq;
using Precheck.Core.Sheet;
using Xunit;

namespace Precheck.Core.Tests.Sheet;

/// <summary>줄 지문(spec google-link TASK-9, AC-8510.4). 이름 '가짜…'·차트번호는 지어낸 것이다.</summary>
public class RowsPrintTests
{
    private static readonly Settings Plain = new Settings();

    private static Day OneDay(decimal card = 10000, string dept = "OS", string name = "")
    {
        var d = new Day();
        var a = d.Visit("12345", "0900", "1", dept);
        if (name.Length > 0) a.Name = name;
        d.Pay(a, PaymentType.Receipt, cash: 5000, card: card, time: "0910");
        var b = d.Visit("23456", "0930");
        d.Bill(b, 0, 20000, insurance: 21);
        var paid = d.Pay(null, PaymentType.ReceivablePaid, cash: 3000, card: 2000, time: "1010", key: "34567");
        paid.Name = "가짜옛";
        return d;
    }

    private static RowsPrint Print(Day d, Settings? s = null, string token = "tok", string mode = SheetPayload.FillEmpty)
    {
        var settings = s ?? Plain;
        var rows = RowBuilder.Build(d.Data, settings);
        return RowsPrint.Of(rows, SheetPayload.Write(rows, settings, token, mode, "가짜의원"));
    }

    [Fact(DisplayName = "AC-8510.4 같은 날 같은 비트 자료 → 지문 두 번 같음(비밀 글자·넣기 방법은 지문에 들지 않음)")]
    public void SameDataSamePrint()
    {
        var first = Print(OneDay());
        var second = Print(OneDay(), token: "other-token", mode: SheetPayload.Overwrite);
        Assert.Equal(first.Hash, second.Hash);
        Assert.True(first.Same(second));
        Assert.Equal("2026-11-23", first.Day);
        Assert.Equal(first.Rows, second.Rows);
    }

    [Fact(DisplayName = "AC-8510.4 한 칸이라도 다르면(금액·진료실·이름·칸 설정) 지문이 다르다, 날이 다르면 같은 지문으로 보지 않는다")]
    public void OneCellChangesThePrint()
    {
        var baseline = Print(OneDay());
        Assert.NotEqual(baseline.Hash, Print(OneDay(card: 10001)).Hash);
        var rooms = new Settings { DeptRooms = new Dictionary<string, int> { { "OS", 1 }, { "OS2", 2 } } };
        Assert.NotEqual(Print(OneDay(), rooms).Hash, Print(OneDay(dept: "OS2"), rooms).Hash);
        Assert.NotEqual(baseline.Hash, Print(OneDay(name: "가짜바뀜")).Hash);
        var other = new Settings();
        other.Columns.Amount = "E";
        Assert.NotEqual(baseline.Hash, Print(OneDay(), other).Hash);

        var nextDay = OneDay();
        nextDay.Data.Day = new DateTime(2026, 11, 24);
        var moved = Print(nextDay);
        Assert.Equal("2026-11-24", moved.Day);
        Assert.False(baseline.Same(moved));
        Assert.False(baseline.Same(null));
    }

    [Fact(DisplayName = "AC-8510.4 지문은 SHA-256 16진수 64자 — 이름·차트번호·금액이 들지 않는다, 줄 수 = 시트에 쓸 줄(돈 줄·돈 없는 환자 한 줄·미수만 낸 환자 돈 줄)")]
    public void PrintHasNoPatientValues()
    {
        var p = Print(OneDay());
        Assert.Matches("^[0-9a-f]{64}$", p.Hash);
        foreach (var value in new[] { "가짜", "12345", "23456", "34567", "5000", "10000" })
        {
            Assert.DoesNotContain(value, p.Hash + "|" + p.Day + "|" + p.Rows, StringComparison.Ordinal);
        }
        // 환자 12345: 현금·카드 두 줄, 23456: 돈 없음 한 줄, 미수만 낸 34567: 두 줄
        Assert.Equal(5, p.Rows);
        Assert.Equal(0, Print(new Day()).Rows);
    }
}
