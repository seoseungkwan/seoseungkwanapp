using System;
using System.Collections.Generic;
using System.Linq;
using Precheck.Core.Bit;
using Precheck.Core.Contact;
using Xunit;

namespace Precheck.Core.Tests.Contact.Read;

/// <summary>
/// REQ-605 칸 고르기(원본 revisit_schedule.html의 phoneColumn·headerFor·prepareRx를 옮긴 것). 표는 비트 화면 표시 글자 그대로의 가짜다.
/// </summary>
public class ContactColumnsTests
{
    private static List<string[]> Sheet(params string[][] rows) => rows.ToList();

    [Fact(DisplayName = "AC-605.1 전화 칸 판정은 원본 phoneColumn 결과(fixtures/patients/golden/phone-columns.json)와 모두 같다")]
    public void PhoneColumnMatchesGolden()
    {
        var golden = RepoFiles.Json("fixtures", "patients", "golden", "phone-columns.json");
        Assert.Contains("phoneColumn", golden.GetProperty("entry").EnumerateArray().Select(e => e.GetString()));
        var cases = golden.GetProperty("cases").EnumerateArray().ToList();
        Assert.True(cases.Count >= 30, "골든 사례가 너무 적다");
        foreach (var item in cases)
        {
            var header = item.GetProperty("header").GetString()!;
            Assert.True(item.GetProperty("result").GetBoolean() == ContactColumns.IsPhoneColumn(header), "칸 이름 '" + header + "'의 판정이 원본과 다르다");
        }
        Assert.False(ContactColumns.IsPhoneColumn(null));
    }

    [Fact(DisplayName = "AC-605.1 47 전화 칸: 골든에서 전화 칸인 이름만 표 차례대로 남고(머리 글자는 앞뒤 공백만 지움), 팩스·확인일·자택전화 등은 버린다")]
    public void RxKeepsGoldenPhoneColumnsOnly()
    {
        var golden = RepoFiles.Json("fixtures", "patients", "golden", "phone-columns.json").GetProperty("cases").EnumerateArray()
            .Select(item => (Header: item.GetProperty("header").GetString()!, Phone: item.GetProperty("result").GetBoolean()))
            // 처방 칸 이름을 품은 사례(차트번호)는 같은 이름 칸 둘이 되므로 뺀다
            .Where(item => !item.Header.Replace(" ", "").Contains("차트번호"))
            .ToList();
        var header = new[] { "차트번호" }.Concat(golden.Select(item => " " + item.Header + " ")).ToArray();
        var row = new[] { "900001" }.Concat(golden.Select((_, i) => "010-0000-" + (1000 + i).ToString(System.Globalization.CultureInfo.InvariantCulture))).ToArray();

        var rx = ContactColumns.Rx("followup", Sheet(header, row));

        var expected = new[] { "차트번호" }.Concat(golden.Where(item => item.Phone).Select(item => item.Header.Trim())).ToArray();
        Assert.Equal(expected, rx[0]);
        var kept = new[] { 0 }.Concat(golden.Select((item, i) => (item, i)).Where(p => p.item.Phone).Select(p => p.i + 1)).ToArray();
        Assert.Equal(kept.Select(i => row[i]).ToArray(), rx[1]);
        Assert.True(golden.Count(item => item.Phone) >= 10);
    }

    [Fact(DisplayName = "AC-605.1 칸 찾기는 원본 headerFor: 공백을 지우고 이름을 품은 칸, 머리 줄은 앞 17줄 안(위 제목 줄은 건너뜀)")]
    public void RxFindsHeaderLikeOriginal()
    {
        var sheet = Sheet(
            new[] { "처방별 환자 목록", "", "" , "", "", "" },
            new[] { "조회 기간 2026-10-01 ~ 2026-10-30", "", "", "", "", "" },
            new[] { "", "", "", "", "", "" },
            new[] { "  처방 코드(EDI) ", "환자명", "차트 번호", "처방일자(진료)", "휴대 폰", "급여구분" },
            new[] { "A49", "가상환자01", "900001", "2026-10-01", "010-0000-0001", "급여" });

        var rx = ContactColumns.Rx("injection", sheet);
        Assert.Equal(new[] { new[] { "처방 코드(EDI)", "차트 번호", "처방일자(진료)", "휴대 폰" }, new[] { "A49", "900001", "2026-10-01", "010-0000-0001" } }, rx);

        // 17줄째(0부터 16)까지는 찾고, 그 뒤면 칸이 없는 것이다
        var deep = Enumerable.Repeat(new[] { "제목" }, 16).Concat(new[] { new[] { "차트번호", "휴대폰" }, new[] { "900001", "010-0000-0001" } }).ToList();
        Assert.Equal(new[] { "차트번호", "휴대폰" }, ContactColumns.Rx("followup", deep)[0]);
        var tooDeep = new[] { new[] { "제목" } }.Concat(deep).ToList();
        Assert.Equal("E-BIT-EXPORT-FAILED", Assert.Throws<BitException>(() => ContactColumns.Rx("followup", tooDeep)).Code);
    }

    [Fact(DisplayName = "AC-605.1 남긴 칸이 같은 줄은 한 번만, 처음 나온 차례 그대로(버린 칸만 다른 줄도 하나)")]
    public void RxKeepsEachRowOnce()
    {
        var sheet = Sheet(
            new[] { "차트번호", "처방코드", "처방일자", "금액", "휴대폰" },
            new[] { "900002", "A49", "2026-10-02", "1,000", "010-0000-0002" },
            new[] { "900001", "A49", "2026-10-01", "1,000", "010-0000-0001" },
            new[] { "900002", "B12", "2026-10-02", "2,000", "010-0000-0002" },
            new[] { "900001", "A49", "2026-10-01", "3,000", "010-0000-0001" },
            new[] { "900003", "A49", "2026-10-03", "1,000", "" },
            new[] { "900002", "A49", "2026-10-09", "1,000", "010-0000-0002" });

        Assert.Equal(new[]
        {
            new[] { "차트번호", "휴대폰" },
            new[] { "900002", "010-0000-0002" },
            new[] { "900001", "010-0000-0001" },
            new[] { "900003", "" },
        }, ContactColumns.Rx("followup", sheet));

        Assert.Equal(new[]
        {
            new[] { "처방코드", "차트번호", "처방일자", "휴대폰" },
            new[] { "A49", "900002", "2026-10-02", "010-0000-0002" },
            new[] { "A49", "900001", "2026-10-01", "010-0000-0001" },
            new[] { "B12", "900002", "2026-10-02", "010-0000-0002" },
            new[] { "A49", "900003", "2026-10-03", "" },
            new[] { "A49", "900002", "2026-10-09", "010-0000-0002" },
        }, ContactColumns.Rx("injection", sheet));
    }

    [Fact(DisplayName = "AC-605.1 짧은 줄의 빈 칸은 빈 글자, 전화 칸이 없으면 처방 칸만")]
    public void RxShortRowsAndNoPhone()
    {
        var sheet = Sheet(new[] { "처방코드", "차트번호", "처방일자" }, new[] { "A49", "900001" });
        Assert.Equal(new[] { new[] { "처방코드", "차트번호", "처방일자" }, new[] { "A49", "900001", "" } }, ContactColumns.Rx("injection", sheet));
    }

    [Fact(DisplayName = "AC-605.1 83은 precheck GridRows의 다섯 칸 그대로(내원번호·차트번호·환자명·증상·기록날짜), 첫 줄 = 칸 이름")]
    public void ChartUsesGridRowsColumns()
    {
        var chart = ContactColumns.Chart(ContactData.Symptoms(2));
        Assert.Equal(GridRows.Columns("83").ToArray(), chart[0]);
        Assert.Equal(new[] { "V2", "900002", "가상환자02", ContactData.Symptom(2), ContactData.Day(2) }, chart[2]);
        Assert.Equal(3, chart.Count);
    }

    [Fact(DisplayName = "AC-605.3 47이 300,000줄까지는 되고 300,001줄이면 자르지 않고 E-BIT-READ-FAILED")]
    public void RxRowLimit()
    {
        var header = new[] { "차트번호", "휴대폰" };
        var row = new[] { "900001", "010-0000-0001" };
        var limit = new[] { header }.Concat(Enumerable.Repeat(row, ContactTargets.MaxRows)).ToList();
        Assert.Equal(2, ContactColumns.Rx("followup", limit).Count);
        limit.Add(row);
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ContactColumns.Rx("followup", limit)).Code);
    }

    [Fact(DisplayName = "AC-605.3 47 머리 줄이 없거나 꼭 있는 칸이 둘이면 E-BIT-EXPORT-FAILED(예외 글은 번호뿐)")]
    public void RxMissingOrDuplicate()
    {
        var noChart = Sheet(new[] { "환자명", "휴대폰" }, new[] { "가상환자01", "010-0000-0001" });
        var missing = Assert.Throws<BitException>(() => ContactColumns.Rx("followup", noChart));
        Assert.Equal("E-BIT-EXPORT-FAILED", missing.Code);
        Assert.Equal("E-BIT-EXPORT-FAILED", missing.Message);

        var twoDates = Sheet(new[] { "처방코드", "차트번호", "처방일자", "최초처방일자" }, new[] { "A49", "900001", "2026-10-01", "2026-01-01" });
        Assert.Equal("E-BIT-EXPORT-FAILED", Assert.Throws<BitException>(() => ContactColumns.Rx("injection", twoDates)).Code);
        // F/U는 처방일자를 찾지 않으므로 같은 표가 된다
        Assert.Equal(new[] { "차트번호" }, ContactColumns.Rx("followup", twoDates)[0]);
    }
}
