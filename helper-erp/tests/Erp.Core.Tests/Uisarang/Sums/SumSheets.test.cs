using System;
using System.Collections.Generic;
using System.Linq;
using Erp.Core.Uisarang;

namespace Erp.Core.Tests.Uisarang.Sums;

/// <summary>
/// spec erp-uisarang TASK-7 시험이 같이 쓰는 줄 만들기(시험은 없음). 가짜 엑셀(fixtures/fake-uisarang)에 없는 모양은
/// 생성기에 더하지 않고 여기서 줄을 만들어 UisReport.Read에 넣는다(tasks.md 머리 규칙). 숫자는 지은 값이다.
/// </summary>
internal static class SumSheets
{
    public static readonly string[] IncomeHeader =
    {
        "보험구분", "총진료비", "급여총액", "청구액", "진료수납액", "비급여", "초진수", "재진수", "인원계", "현금수납액", "카드수납액",
    };

    public static readonly string[] RxHeader = { "코드", "처방명칭", "총투여량", "총액" };

    public static XlsCell C(object? value) => value switch
    {
        null => XlsCell.Empty,
        string text => new XlsCell(text),
        int number => new XlsCell(number),
        long number => new XlsCell(number),
        double number => new XlsCell(number),
        _ => throw new ArgumentException("칸 값은 글자·숫자·null만"),
    };

    public static IReadOnlyList<XlsCell> Row(params object?[] cells) => cells.Select(C).ToArray();

    public static IReadOnlyList<XlsCell> Header(IEnumerable<string> names) => names.Select(name => new XlsCell(name)).ToArray();

    public static UisSheet Fake(string name) => UisReport.Read(FakeUisFiles.Rows(name));

    /// <summary>라벨 줄(조회일 마감 일자) + 머리글 + 자료 줄.</summary>
    public static UisSheet With(string[] header, params object?[][] lines)
    {
        var rows = new List<IReadOnlyList<XlsCell>>
        {
            Row("[조 회 일]", "2026-11-23 ~ 2026-11-23"),
            Header(header),
        };
        rows.AddRange(lines.Select(line => Row(line)));
        return UisReport.Read(rows);
    }

    /// <summary>일일수입통계 머리글(IncomeHeader 차례) + 자료 줄.</summary>
    public static UisSheet Income(params object?[][] lines) => With(IncomeHeader, lines);

    /// <summary>기간별처방통계 머리글(코드·처방명칭·총투여량·총액) + 자료 줄.</summary>
    public static UisSheet Rx(params object?[][] lines) => With(RxHeader, lines);

    /// <summary>머리글 차례 그대로 한 줄(IncomeHeader 차례: 보험구분 + 숫자 열 칸).</summary>
    public static object?[] L(params object?[] cells) => cells;
}
