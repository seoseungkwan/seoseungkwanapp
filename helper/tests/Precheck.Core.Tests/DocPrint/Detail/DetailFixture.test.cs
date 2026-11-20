using System;
using System.Collections.Generic;
using System.Linq;
using Precheck.Core.DocPrint;
using Precheck.Core.DocPrint.Docs.Detail;
using Precheck.Core.Tests.Bit;

namespace Precheck.Core.Tests.DocPrint.Detail;

/// <summary>
/// 세부내역서 시험이 같이 쓰는 지어낸 값(가상의원·가상환자01·90001). 비트 줄 모양은 DetailSql 문장의 칸 차례 그대로다.
/// 내원 V1(11-03, 국민건강보험 30%)·V2(11-10, 10%) 수납 끝, V3(11-10) 수납 전, V9(11-05) 안 고른 날.
/// </summary>
internal static class DetailFixture
{
    public static readonly byte[] Seal = { 0x89, 0x50, 0x4E, 0x47, 1, 2, 3 };

    public static readonly PatientHit Patient = new PatientHit("90001", "가상환자01", "19800302", "F", "20261110");

    /// <summary>맑은 고딕 흉내: 한글·전각은 1em, 그 밖은 0.55em(1em = pt × 0.3528mm).</summary>
    public static readonly Func<string, float, float> Width = (text, pt) =>
        (text ?? "").Sum(c => c >= 0x1100 ? 1.0f : 0.55f) * pt * 0.3528f;

    public static HospitalInfo Hospital(byte[]? seal) =>
        new HospitalInfo("가상의원", "12345678", "가상시 가상로 1", "1234567890", "가상원장", "가상의원", "02-000-0000", "02-000-0001", seal);

    public static VisitDay Day(int day, params string[] visits) => new VisitDay(new DateTime(2026, 11, day), false, false, visits);

    public static DocContext Context(IEnumerable<VisitDay>? days = null, bool withSeal = true, PatientHit? patient = null, HospitalInfo? hospital = null) =>
        new DocContext(
            "90001",
            patient ?? Patient,
            days ?? new[] { Day(3, "V1"), Day(10, "V2", "V3") },
            new DateTime(2026, 11, 1),
            new DateTime(2026, 11, 20),
            hospital ?? Hospital(withSeal ? Seal : null),
            Width,
            new DateTime(2026, 11, 20, 10, 15, 0));

    /// <summary>하루에 count줄씩 days일(11-01부터): 내원 D01…, 줄 이름 줄001…(재활물리치료료 묶음, 급여 1,000원), 모두 수납 끝.</summary>
    public static (object?[][] Lines, object?[][] Visits, VisitDay[] Days) Many(int days, int count)
    {
        var lines = new List<object?[]>();
        var visits = new List<object?[]>();
        var picked = new List<VisitDay>();
        var n = 0;
        for (var d = 1; d <= days; d++)
        {
            var visit = "D" + d.ToString("00", System.Globalization.CultureInfo.InvariantCulture);
            var day8 = "202611" + d.ToString("00", System.Globalization.CultureInfo.InvariantCulture);
            for (var k = 1; k <= count; k++)
            {
                n++;
                lines.Add(Line(visit, day8, k, "MM" + n.ToString("000", System.Globalization.CultureInfo.InvariantCulture), "줄" + n.ToString("000", System.Globalization.CultureInfo.InvariantCulture), 1000m, 1m, 1, 1, 1000m, 6, "0"));
            }
            visits.Add(Visit(visit, day8, "PN", "국민건강보험", 1000m * count, 1000m * count, 300m * count, 700m * count, 0m, 1000m * count, 300m * count));
            picked.Add(Day(d, visit));
        }
        return (lines.ToArray(), visits.ToArray(), picked.ToArray());
    }

    /// <summary>처방 줄: [내원, 날, 순서, 청구 코드, 이름, 단가, 1회량, 횟수, 일수, 금액, 영수증 항목, 급여 구분].</summary>
    public static object?[] Line(string visit, string day8, int seq, string code, string name, decimal price, decimal qty, int times, int days, decimal amount, int inc, string ins) =>
        new object?[] { visit, day8, seq, code, name, price, qty, (short)times, (short)days, amount, (short)inc, ins };

    /// <summary>내원 줄: [내원, 날, 상태, 보험 이름, 총진료비, 급여 총액, 급여 본인, 공단, 비급여, 항목 급여 합, 항목 본인 합]. 영수증이 없으면 금액 칸이 NULL.</summary>
    public static object?[] Visit(string visit, string day8, string state, string insurance, decimal? total, decimal? insured, decimal? own, decimal? corp, decimal? non, decimal? itemInsured, decimal? itemOwn) =>
        new object?[] { visit, day8, state, insurance, total, insured, own, corp, non, itemInsured, itemOwn };

    public static object?[][] Lines() => new[]
    {
        Line("V1        ", "20261103", 3, "MM015 ", "가상물리치료", 7910m, 1m, 1, 1, 7911m, 6, "0"),
        Line("V1", "20261103", 1, "AA254", "재진진찰료", 12000m, 1m, 1, 1, 12000m, 1, "0"),
        Line("V1", "20261103", 2, "640000001", "가상주사약", 89.6m, 1m, 1, 1, 89.6m, 29, "0"),
        Line("V1", "20261103", 4, "NN001", "가상도수치료", 50000m, 1m, 1, 1, 50000m, 6, "2"),
        Line("V1", "20261103", 5, "MM100", "가상전액치료", 3000m, 1m, 1, 1, 3000m, 6, "3"),
        Line("V2", "20261110", 1, "HA471", LongName, 5000m, 2m, 1, 1, 10000m, 30, "0"),
        Line("V2", "20261110", 2, "J5000001", "가상선별재료", 1000m, 1m, 2, 1, 2000m, 15, "F"),
        Line("V3", "20261110", 1, "AA254", "수납전줄", 12000m, 1m, 1, 1, 12000m, 1, "0"),
        Line("V9", "20261105", 1, "AA254", "안고른날줄", 12000m, 1m, 1, 1, 12000m, 1, "0"),
    };

    public static object?[][] Visits() => new[]
    {
        Visit("V1", "20261103", "PN", "국민건강보험", 73000m, 20000m, 5900m, 14100m, 50000m, 20000m, 6000m),
        Visit("V9", "20261105", "PN", "국민건강보험", 12000m, 12000m, 3600m, 8400m, 0m, 12000m, 3600m),
        Visit("V2", "20261110", "PN", "국민건강보험", 12000m, 12000m, 2900m, 9100m, 0m, 10000m, 1000m),
        Visit("V3", "20261110", "TN", "국민건강보험", null, null, null, null, null, null, null),
    };

    /// <summary>한 줄에 안 들어가 두 줄로 나눠야 하는 긴 이름(한글 22자 + 빈칸 8, 비트 영상진단 이름 길이쯤).</summary>
    public const string LongName = "가상 영상진단 슬관절 양측 정면 측면 축면 촬영 판독료";

    public static FakeDb Db(object?[][]? lines = null, object?[][]? visits = null) =>
        new FakeDb()
            .Answer(DetailSql.LinesSql, _ => lines ?? Lines())
            .Answer(DetailSql.VisitsSql, _ => visits ?? Visits());

    /// <summary>쪽의 글 전부(차례대로).</summary>
    public static string[] Texts(DocPage page) => page.Ops.Where(op => op.Kind == DocOpKind.Text).Select(op => op.Value).ToArray();

    public static DocOp TextOp(DocPage page, string value) => page.Ops.First(op => op.Kind == DocOpKind.Text && op.Value == value);
}
