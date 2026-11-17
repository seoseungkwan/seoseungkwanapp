using System;
using System.Collections.Generic;
using Precheck.Core.Bit;

namespace Precheck.Core.PtSlip;

/// <summary>이름 찾기 결과 종류.</summary>
public enum NameKind
{
    /// <summary>차트번호 칸이 비었다(DB에 묻지 않음).</summary>
    Empty,

    Found,

    /// <summary>그 번호의 환자가 없거나 이름이 비었거나 틀린 번호(틀린 번호는 DB에 묻지 않음).</summary>
    NotFound,

    /// <summary>비트 DB를 읽지 못했다.</summary>
    Failed,
}

/// <summary>이름 찾기 결과. Found일 때만 Name이 있고 나머지는 빈 글이다. 환자 값이라 파일·로그에 남기지 않는다.</summary>
public sealed class NameResult
{
    public NameResult(NameKind kind, string name = "")
    {
        Kind = kind;
        Name = kind == NameKind.Found ? (name ?? "") : "";
    }

    public NameKind Kind { get; }

    public string Name { get; }
}

/// <summary>
/// 차트번호로 비트에서 이름 찾기(AC-6402.3·6402.4). 문장 하나를 매개변수(@cht)로, ReadOnlyGuard를 지나 읽기만 한다(5초).
/// dbo.PbsInf.PbsChtNum은 char(14)이고 앞을 빈칸으로 채운 오른쪽 맞춤이라 LTRIM(RTRIM(…))으로 견준다. 이름(PbsPatNam)만 읽는다.
/// 허용 목록은 Bit/Sql.cs(청구 Sql.All 밖)에 있다.
/// </summary>
public static class SlipNames
{
    public const string Sql = "SELECT TOP 1 PbsPatNam FROM dbo.PbsInf WHERE LTRIM(RTRIM(PbsChtNum))=@cht";

    /// <summary>이름 읽기 시간 제한.</summary>
    public static readonly TimeSpan Timeout = TimeSpan.FromSeconds(5);

    /// <summary>빈 칸은 Empty, 틀린 번호는 DB에 묻지 않고 NotFound. 줄이 없거나 이름이 비면 NotFound, 읽기 실패는 Failed.</summary>
    public static NameResult Find(IBitDb db, ChartInput chart)
    {
        if (chart == null || chart.Kind == ChartKind.Empty) return new NameResult(NameKind.Empty);
        if (chart.Kind != ChartKind.Ok) return new NameResult(NameKind.NotFound);
        try
        {
            var args = new Dictionary<string, object?>(StringComparer.Ordinal) { ["@cht"] = chart.Number };
            var rows = ReadOnlyGuard.Query(db, Sql, args, Timeout);
            if (rows.Count == 0 || rows[0] == null || rows[0].Count == 0) return new NameResult(NameKind.NotFound);
            var name = (Convert.ToString(rows[0][0], System.Globalization.CultureInfo.InvariantCulture) ?? "").Trim();
            return name.Length == 0 ? new NameResult(NameKind.NotFound) : new NameResult(NameKind.Found, name);
        }
        catch (Exception)
        {
            // 어떤 실패든 화면에는 '비트에서 이름을 읽지 못했어요'만 보인다(오류 내용·환자 값을 남기지 않는다)
            return new NameResult(NameKind.Failed);
        }
    }

    /// <summary>이름 칸 글(시안 그대로).</summary>
    public static string Message(NameResult result)
    {
        if (result == null) return "차트번호를 넣으면 이름이 나와요";
        switch (result.Kind)
        {
            case NameKind.Found: return result.Name;
            case NameKind.NotFound: return "없는 차트번호예요";
            case NameKind.Failed: return "비트에서 이름을 읽지 못했어요. 비트가 켜져 있는지 봐 주세요.";
            default: return "차트번호를 넣으면 이름이 나와요";
        }
    }

    /// <summary>[뽑기]는 이름을 찾았을 때만 눌린다(항목·부위는 비어도 됨).</summary>
    public static bool CanPrint(NameResult result) => result != null && result.Kind == NameKind.Found;
}
