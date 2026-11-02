using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace Precheck.Core.Diag;

/// <summary>
/// 보고서 칸 거르기와 줄 만들기(specs/diag-read-speed). 환자 자료가 보고서에 들어가지 않게 하는 마지막 문이다:
/// 숫자 칸은 숫자 형만, 이름 칸은 영문 식별자 모양만 지나고 나머지는 ?로 적는다. rows·col 줄의 표·칸 이름은 답에서 가져오지 않고 정해 둔 목록을 쓴다.
/// 제품 읽기의 줄은 여기 오지 않는다(Statement는 줄 수만 받는다). 여기 오는 줄은 sys.*·서버 속성 문장의 답뿐이다.
/// </summary>
public static class DiagFormat
{
    public const string Unknown = "?";
    public const int MaxLineLength = 1500;

    // 잘린 색인 줄이 "뒤에 색인 없음"으로 읽히지 않게 표시한다
    private const string ClippedMark = "...(잘림)";

    private static readonly Regex IdentifierShape = new Regex(@"^[A-Za-z_][A-Za-z0-9_$#@.\-]{0,127}\z", RegexOptions.CultureInvariant);
    private static readonly Regex VersionShape = new Regex(@"^[0-9]+(\.[0-9]+)+\z", RegexOptions.CultureInvariant);
    private static readonly Regex EditionShape = new Regex(@"^[A-Za-z][A-Za-z0-9 .:()\-]{0,127}\z", RegexOptions.CultureInvariant);

    // 229 권한 거부, 230 칸 권한 거부, 262 CREATE 등 권한 거부, 297 사용자 권한 없음, 300 VIEW SERVER STATE 거부
    private static readonly HashSet<int> PermissionNumbers = new HashSet<int> { 229, 230, 262, 297, 300 };

    /// <summary>SqlException.Number: 명령 시간 초과.</summary>
    public const int TimeoutNumber = -2;

    /// <summary>숫자 형이면 값, 아니면 null(글자는 숫자처럼 생겨도 숫자가 아니다). bool은 1·0, decimal은 정수 부분.</summary>
    public static long? Count(object? cell)
    {
        switch (cell)
        {
            case bool flag: return flag ? 1 : 0;
            case byte number: return number;
            case sbyte number: return number;
            case short number: return number;
            case ushort number: return number;
            case int number: return number;
            case uint number: return number;
            case long number: return number;
            case decimal number when number >= long.MinValue && number <= long.MaxValue: return decimal.ToInt64(decimal.Truncate(number));
            default: return null;
        }
    }

    public static string Number(object? cell) => Text(Count(cell));

    public static string Identifier(object? cell) =>
        cell is string text && IdentifierShape.IsMatch(text) ? text : Unknown;

    public static string Version(object? cell) =>
        cell is string text && VersionShape.IsMatch(text) ? text : Unknown;

    public static string Edition(object? cell) =>
        cell is string text && EditionShape.IsMatch(text) && text.IndexOf("Edition", StringComparison.Ordinal) >= 0 ? text : Unknown;

    /// <summary>실패를 글자로: 권한 번호면 권한 없음, 시간 초과는 알아볼 수 있게, 그 밖은 번호나 거른 종류.</summary>
    public static string Failure(int? sqlNumber, string? kind)
    {
        if (sqlNumber.HasValue)
        {
            if (PermissionNumbers.Contains(sqlNumber.Value)) return "권한 없음";
            if (sqlNumber.Value == TimeoutNumber) return "오류 -2(시간 초과)";
            return "오류 " + sqlNumber.Value.ToString(CultureInfo.InvariantCulture);
        }
        return "오류 " + Identifier(kind);
    }

    public static string Clip(string line)
    {
        var flat = (line ?? "").Replace('\r', ' ').Replace('\n', ' ');
        return flat.Length <= MaxLineLength ? flat : flat.Substring(0, MaxLineLength - ClippedMark.Length) + ClippedMark;
    }

    public static string Header(string commit, string helperVersion, DateTime started, int rangeDays, TimeSpan statementLimit, TimeSpan ceiling) =>
        "speed-report commit=" + commit
        + " helper=" + helperVersion
        + " started=" + started.ToString("yyyy-MM-dd'T'HH:mm", CultureInfo.InvariantCulture)
        + " range_days=" + Text(rangeDays)
        + " limit_s=" + Text((long)statementLimit.TotalSeconds)
        + " ceiling_s=" + Text((long)ceiling.TotalSeconds);

    public static string ServerLine(IReadOnlyList<IReadOnlyList<object?>> rows)
    {
        var row = First(rows);
        return "server version=" + Version(Cell(row, 0)) + " level=" + Identifier(Cell(row, 1)) + " edition=" + Edition(Cell(row, 2));
    }

    public static string DatabaseLine(IReadOnlyList<IReadOnlyList<object?>> rows)
    {
        var row = First(rows);
        return "db compat=" + Number(Cell(row, 0))
            + " snapshot=" + Number(Cell(row, 1))
            + " rcsi=" + Number(Cell(row, 2))
            + " auto_create=" + Number(Cell(row, 3))
            + " auto_update=" + Number(Cell(row, 4))
            + " recovery=" + Identifier(Cell(row, 5));
    }

    public static string SessionLine(long openMs, IReadOnlyList<IReadOnlyList<object?>> rows) =>
        "session open_ms=" + Text(openMs) + " isolation=" + Number(Cell(First(rows), 0));

    public static string PermissionLine(IReadOnlyList<IReadOnlyList<object?>> rows)
    {
        var row = First(rows);
        return "perm view_server_state=" + Number(Cell(row, 0)) + " sysadmin=" + Number(Cell(row, 1));
    }

    /// <summary>VIEW SERVER STATE가 확실히 있을 때만 참(모르면 막힘 확인을 믿지 않는다).</summary>
    public static bool CanViewServerState(IReadOnlyList<IReadOnlyList<object?>> rows) => Count(Cell(First(rows), 0)) == 1;

    public static string CpuLine(IReadOnlyList<IReadOnlyList<object?>> rows)
    {
        var row = First(rows);
        return "cpu logical=" + Number(Cell(row, 0)) + " schedulers=" + Number(Cell(row, 1));
    }

    public static string MemoryLine(IReadOnlyList<IReadOnlyList<object?>> rows)
    {
        var row = First(rows);
        return "memory physical_mb=" + Text(Count(Cell(row, 0)) / 1024) + " committed_target_mb=" + Text(Count(Cell(row, 1)) / 1024);
    }

    public static string ConfigLine(IReadOnlyList<IReadOnlyList<object?>> rows) =>
        "config max_server_memory_mb=" + Number(Named(rows, "max server memory (MB)"))
        + " maxdop=" + Number(Named(rows, "max degree of parallelism"))
        + " cost_threshold=" + Number(Named(rows, "cost threshold for parallelism"));

    public static string RowsLine(IReadOnlyList<IReadOnlyList<object?>> rows) =>
        "rows " + string.Join(" ", DiagSql.ReportedTables.Select(table => table + "=" + Number(Named(rows, table))));

    public static IReadOnlyList<string> ColumnLines(IReadOnlyList<IReadOnlyList<object?>> rows)
    {
        var lines = new List<string>();
        foreach (var column in DiagSql.ReportedColumns)
        {
            var row = rows.FirstOrDefault(r => Same(Cell(r, 0), column.Table) && Same(Cell(r, 1), column.Column));
            var name = "col " + column.Table + "." + column.Column + " ";
            lines.Add(row == null
                ? name + Unknown
                : name + Identifier(Cell(row, 2)) + " len=" + Number(Cell(row, 3)) + " null=" + Number(Cell(row, 4)) + " coll=" + Identifier(Cell(row, 5)));
        }
        return lines;
    }

    /// <summary>표마다 한 줄. 색인·키 순서는 문장이 정했다. 이름은 모양만 거른다(요청한 색인 칸이 사라지지 않게).</summary>
    public static IReadOnlyList<string> IndexLines(IReadOnlyList<IReadOnlyList<object?>> rows)
    {
        var lines = new List<string>();
        foreach (var table in DiagSql.ReportedTables)
        {
            var indexes = new List<string>();
            foreach (var group in rows.Where(r => Same(Cell(r, 0), table)).GroupBy(r => Cell(r, 1) as string ?? "", StringComparer.Ordinal))
            {
                var first = group.First();
                var flags = Kind(Cell(first, 2)) + (Count(Cell(first, 3)) == 1 ? ",U" : "") + (Count(Cell(first, 4)) == 1 ? ",off" : "");
                var keys = group.Where(r => Count(Cell(r, 5)) != 1).Select(r => Identifier(Cell(r, 6))).ToList();
                var included = group.Where(r => Count(Cell(r, 5)) == 1).Select(r => Identifier(Cell(r, 6))).ToList();
                indexes.Add(Identifier(group.Key) + "[" + flags + "](" + string.Join(",", keys) + ")"
                    + (included.Count > 0 ? "+(" + string.Join(",", included) + ")" : ""));
            }
            lines.Add("idx " + table + ": " + (indexes.Count > 0 ? string.Join("; ", indexes) : "none"));
        }
        return lines;
    }

    public static string BlockLine(IReadOnlyList<IReadOnlyList<object?>> rows)
    {
        var row = First(rows);
        return "block others=" + Number(Cell(row, 0)) + " blocked=" + Number(Cell(row, 1)) + " max_wait_ms=" + Number(Cell(row, 2));
    }

    /// <summary>세션 비용·대기 글. 읽지 못했으면 null을 넘긴다.</summary>
    public static string Cost(IReadOnlyList<IReadOnlyList<object?>>? cost, IReadOnlyList<IReadOnlyList<object?>>? waits)
    {
        var row = cost == null ? null : First(cost);
        var text = new StringBuilder("cpu=" + Number(Cell(row, 0)) + " reads=" + Number(Cell(row, 1)) + " lreads=" + Number(Cell(row, 2)) + " waits=");
        if (waits == null) text.Append(Unknown);
        else if (waits.Count == 0) text.Append("none");
        else text.Append(string.Join(",", waits.Select(wait => Identifier(Cell(wait, 0)) + ":" + Number(Cell(wait, 1)))));
        return text.ToString();
    }

    public static string Statement(string label, long count, long totalMs, long maxMs, long? firstRowMs, long rows, long errors, string? lastError) =>
        "stmt " + Identifier(label)
        + " n=" + Text(count)
        + " ms=" + Text(totalMs)
        + " max=" + Text(maxMs)
        + " first=" + Text(firstRowMs)
        + " rows=" + Text(rows)
        + (errors > 0 ? " errs=" + Text(errors) + " last=" + lastError : "");

    public static string Piece(string label, long ms, long? rows, string? error, string cost) =>
        "piece " + Identifier(label) + " ms=" + Text(ms) + " rows=" + Text(rows) + (error != null ? " err=" + error : "") + " " + cost;

    /// <summary>두 FirstVisits 건수가 같은가. 건수로만 비교한다.</summary>
    public static string Agree(long? asWritten, long? plainJoin)
    {
        var state = !asWritten.HasValue || !plainJoin.HasValue ? "unknown" : asWritten == plainJoin ? "same" : "differ";
        return "agree first_visits=" + state;
    }

    private static string Kind(object? typeDesc)
    {
        var text = typeDesc as string;
        if (text == "CLUSTERED") return "C";
        return text == "NONCLUSTERED" ? "N" : "O";
    }

    // 문장의 t.name IN (...)은 DB 정렬 규칙으로 찾으므로 대소문자를 구분하지 않는 DB면 표기가 다른 이름도 온다. 적는 이름은 정해 둔 목록 값이라 답의 표기가 보고서에 가지 않는다
    private static bool Same(object? cell, string name) => cell is string text && string.Equals(text, name, StringComparison.OrdinalIgnoreCase);

    /// <summary>첫 칸이 그 이름인 줄의 둘째 칸.</summary>
    private static object? Named(IReadOnlyList<IReadOnlyList<object?>> rows, string name) =>
        Cell(rows.FirstOrDefault(row => Same(Cell(row, 0), name)), 1);

    private static IReadOnlyList<object?>? First(IReadOnlyList<IReadOnlyList<object?>> rows) => rows.Count > 0 ? rows[0] : null;

    private static object? Cell(IReadOnlyList<object?>? row, int index) => row != null && index < row.Count ? row[index] : null;

    private static string Text(long? value) => value.HasValue ? value.Value.ToString(CultureInfo.InvariantCulture) : Unknown;
}
