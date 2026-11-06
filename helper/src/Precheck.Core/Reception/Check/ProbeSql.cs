using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;

namespace Precheck.Core.Reception.Check;

/// <summary>
/// 같은 확인 실행에서 INFORMATION_SCHEMA로 읽은 dbo 표·칸 이름(CheckSql.TableColumns·LinkedColumns 답의 TABLE_NAME, COLUMN_NAME, DATA_TYPE 줄).
/// 찾기 틀(ProbeSql)은 여기 있는 이름으로만 만든다(AC-1401.9). 모양이 틀린 이름(ProbeSql.IsName)은 처음부터 받지 않는다.
/// </summary>
public sealed class ProbeSchema
{
    private static readonly HashSet<string> TextTypes = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "char", "varchar", "nchar", "nvarchar", "text", "ntext",
    };

    private readonly List<string> tables = new List<string>();
    private readonly Dictionary<string, List<(string Name, bool Text)>> columns = new Dictionary<string, List<(string Name, bool Text)>>(StringComparer.Ordinal);

    private ProbeSchema() { }

    /// <summary>INFORMATION_SCHEMA 줄에서 만든다. 줄 순서를 지키고, 겹친 (표, 칸)은 한 번만, 이름이 글자가 아니거나 모양이 틀린 줄은 버린다.</summary>
    public static ProbeSchema From(IEnumerable<IReadOnlyList<object?>> rows)
    {
        if (rows == null) throw new ArgumentNullException(nameof(rows));
        var schema = new ProbeSchema();
        foreach (var row in rows)
        {
            if (row == null || row.Count < 2) continue;
            if (!(row[0] is string table) || !(row[1] is string column) || !ProbeSql.IsName(table) || !ProbeSql.IsName(column)) continue;
            if (!schema.columns.TryGetValue(table, out var list))
            {
                list = new List<(string Name, bool Text)>();
                schema.columns.Add(table, list);
                schema.tables.Add(table);
            }
            if (list.Any(c => c.Name == column)) continue;
            list.Add((column, row.Count > 2 && row[2] is string type && TextTypes.Contains(type)));
        }
        return schema;
    }

    /// <summary>표 이름(처음 나온 순서).</summary>
    public IReadOnlyList<string> Tables => tables.AsReadOnly();

    /// <summary>그 표의 칸 이름(줄 순서). 없는 표면 빈 목록.</summary>
    public IReadOnlyList<string> Columns(string table) => Of(table).Select(c => c.Name).ToArray();

    /// <summary>그 표의 글자 칸(char·varchar·nchar·nvarchar·text·ntext) 이름.</summary>
    public IReadOnlyList<string> TextColumns(string table) => Of(table).Where(c => c.Text).Select(c => c.Name).ToArray();

    /// <summary>이 답에 그 표·칸이 있는가(대소문자까지 같게).</summary>
    public bool Has(string table, string column) => Of(table).Any(c => c.Name == column);

    private IEnumerable<(string Name, bool Text)> Of(string table) =>
        table != null && columns.TryGetValue(table, out var list) ? list : Enumerable.Empty<(string Name, bool Text)>();
}

/// <summary>
/// 확인 모드의 찾기 틀 세 가지와 증상 글 세기 틀(spec reception-phone design.md 1절, AC-1401.9·AC-1401.17). 표·칸 이름은 같은 실행의 ProbeSchema에 있고
/// ^[A-Za-z][A-Za-z0-9_]{0,63}$ 모양일 때만 [ ]로 감싸 넣는다. 그 밖은 DB에 닿기 전에 BitException(E-BIT-READ-FAILED).
/// 모두 그날(@from~@to) 외래 접수 + 등록 병원 범위(CheckSql.TodayScope)에 붙은 줄만 읽는 SELECT 하나다.
/// 도우미 허용 목록(Sql.IsAllowed)·ReadOnlyGuard·CheckSql은 이 글을 받지 않는다. 확인 모드 세션만 IsProbe로 받는다.
/// </summary>
public static class ProbeSql
{
    /// <summary>틀이 받는 매개변수: @from·@to Char(12), @hospital VarChar(32).</summary>
    public static readonly IReadOnlyList<SqlParam> Parameters = Array.AsReadOnly(CheckSql.TodayRange);

    /// <summary>Sample(모양 보기)이 받는 표(AC-1401.7). 순서는 PbsInf·OcmInf·OrcInf.</summary>
    public static readonly IReadOnlyList<string> SampleTables = Array.AsReadOnly(new[] { "PbsInf", "OcmInf", "OrcInf" });

    /// <summary>Sample 표마다 그날 접수에 잇는 칸(이 저장소에 이미 쓰인 칸)과 OcmInf 쪽 칸.</summary>
    private static readonly Dictionary<string, (string Key, string Target)> SampleLinks = new Dictionary<string, (string Key, string Target)>(StringComparer.Ordinal)
    {
        ["PbsInf"] = ("PbsChtNum", "OcmChtNum"),
        ["OcmInf"] = ("OcmNum", "OcmNum"),
        ["OrcInf"] = ("OrcOcmNum", "OcmNum"),
    };

    // \z: $는 끝 줄바꿈 앞에서도 맞으므로 쓰지 않는다
    private static readonly Regex NameShape = new Regex(@"^[A-Za-z][A-Za-z0-9_]{0,63}\z", RegexOptions.CultureInvariant);

    // 만든 글을 다시 풀 때 이름 자리만 꺼낸다. 이름 모양·나머지 글은 다시 만들어 견준다
    private static readonly Regex Head = new Regex(
        @"^SELECT (?:TOP 300 )?t\.\[(?<a>[^\]]*)\](?:,t\.\[(?<b>[^\]]*)\])? FROM dbo\.\[(?<t>[^\]]*)\] t",
        RegexOptions.CultureInvariant);

    /// <summary>증상 글 세기 틀(TextCount)이 받는 매개변수: @from·@to Char(12), @hospital VarChar(32), 친 글 @text VarChar(200)(AC-1401.17).</summary>
    public static readonly IReadOnlyList<SqlParam> TextCountParameters =
        Array.AsReadOnly(CheckSql.TodayRange.Concat(new[] { new SqlParam("@text", SqlParamKind.VarChar, 200) }).ToArray());

    // 세기 틀을 다시 풀 때 이름 자리만 꺼낸다. 나머지 글은 다시 만들어 견준다
    private static readonly Regex CountBody = new Regex(
        @"\nFROM dbo\.\[(?<t>[^\]]*)\] t\nCROSS APPLY \(SELECT CAST\(t\.\[(?<c>[^\]]*)\] AS nvarchar\(max\)\) Val\) v\nWHERE t\.\[(?<k>[^\]]*)\] IN ",
        RegexOptions.CultureInvariant);

    /// <summary>표·칸 이름 모양: 영문자로 시작하고 영문자·숫자·_만, 64글자까지.</summary>
    public static bool IsName(string? name) => name != null && NameShape.IsMatch(name);

    /// <summary>그날 내원의 (내원번호, 글자): 내원번호 칸이 그날 접수의 OcmNum인 줄.</summary>
    public static string VisitLinked(ProbeSchema schema, string table, string visitColumn, string textColumn)
    {
        Require(schema, table, visitColumn, textColumn);
        return Pair(table, visitColumn, textColumn, "OcmNum");
    }

    /// <summary>그날 환자의 (차트번호, 글자): 차트번호 칸(함수 없이)이 그날 접수의 OcmChtNum인 줄.</summary>
    public static string ChartLinked(ProbeSchema schema, string table, string chartColumn, string textColumn)
    {
        Require(schema, table, chartColumn, textColumn);
        return Pair(table, chartColumn, textColumn, "OcmChtNum");
    }

    /// <summary>모양 보기용 300줄: SampleTables의 표만, 그날 접수에 붙은 줄의 그 칸.</summary>
    public static string Sample(ProbeSchema schema, string table, string column)
    {
        if (table == null || !SampleLinks.TryGetValue(table, out var link)) throw Blocked();
        Require(schema, table, link.Key, column);
        return One(table, column, link.Key, link.Target);
    }

    /// <summary>
    /// 증상 글 세기(AC-1401.17): 내원번호 칸이 그날 범위(@from~@to) 접수의 OcmNum인 줄을 DB 안에서 센다. 돌아오는 것은 한 줄
    /// (Total, NonEmpty, Containing, MinLength, MaxLength)뿐이고 칸 값은 돌아오지 않는다. 칸 값은 nvarchar(max)로 읽어(text·ntext도)
    /// 공백·CR·LF·탭을 뺀 글에 @text(공백을 뺀 친 글)가 있으면 품은 줄이다. 길이는 빈 글 아닌 줄의 LEN(글자 수).
    /// </summary>
    public static string TextCount(ProbeSchema schema, string table, string visitColumn, string textColumn)
    {
        Require(schema, table, visitColumn, textColumn);
        return Count(table, visitColumn, textColumn);
    }

    /// <summary>글자가 TextCount로 만든 글과 똑같은가(이름 모양까지). 확인 모드 세션만 TextCountParameters와 함께 받는다.</summary>
    public static bool IsTextCount(string? sql)
    {
        if (sql == null) return false;
        var match = CountBody.Match(sql);
        if (!match.Success) return false;
        var table = match.Groups["t"].Value;
        var text = match.Groups["c"].Value;
        var key = match.Groups["k"].Value;
        return IsName(table) && IsName(text) && IsName(key) && sql == Count(table, key, text);
    }

    /// <summary>기록지 코드 틀(AC-1401.18)의 표. 칸 이름(SheetColumns)은 고정이고 내원번호 칸만 같은 실행의 칸 목록에서 넣는다.</summary>
    public const string SheetTable = "EmrInf";

    /// <summary>기록지 코드 틀이 읽는 칸: 기록지 종류·코드·값(값은 세기만 한다).</summary>
    public static readonly IReadOnlyList<string> SheetColumns = Array.AsReadOnly(new[] { "EmrShtTyp", "EmrShtCod", "EmrShtVal" });

    // 기록지 코드 틀을 다시 풀 때 내원번호 칸 이름만 꺼낸다. 나머지 글은 다시 만들어 견준다
    private static readonly Regex SheetKey = new Regex(@"\nWHERE t\.\[(?<k>[^\]]*)\] IN \(SELECT c\.OcmNum ", RegexOptions.CultureInvariant);

    /// <summary>
    /// 증상 기록지 코드 세기(AC-1401.18): 그날 범위 접수에 붙은 EmrInf 줄 가운데 EmrShtVal(공백·CR·LF·탭을 뺌)에 @text가 든 줄을
    /// (EmrShtTyp, EmrShtCod)마다 센다. 돌아오는 것은 (Typ, Cod, Containing) 많은 순 15줄까지이고 글 값은 돌아오지 않는다. 매개변수는 TextCountParameters.
    /// </summary>
    public static string SheetHits(ProbeSchema schema, string visitColumn)
    {
        RequireSheet(schema, visitColumn);
        return Hits(visitColumn);
    }

    /// <summary>
    /// 기록지 코드 짝(AC-1401.18): 그날 범위 접수에 붙은 EmrInf 줄을 (EmrShtTyp, EmrShtCod)마다 줄 수·빈 글 아닌 줄·빈 글 아닌 줄의 최소·최대 길이로 센다.
    /// 줄 수 많은 순 15줄까지. 매개변수는 Parameters(@text 없음).
    /// </summary>
    public static string SheetCodes(ProbeSchema schema, string visitColumn)
    {
        RequireSheet(schema, visitColumn);
        return Codes(visitColumn);
    }

    /// <summary>글자가 SheetHits로 만든 글과 똑같은가(이름 모양까지). 확인 모드 세션만 TextCountParameters와 함께 받는다.</summary>
    public static bool IsSheetHits(string? sql) => SheetKeyOf(sql) is string key && sql == Hits(key);

    /// <summary>글자가 SheetCodes로 만든 글과 똑같은가(이름 모양까지). 확인 모드 세션만 Parameters와 함께 받는다.</summary>
    public static bool IsSheetCodes(string? sql) => SheetKeyOf(sql) is string key && sql == Codes(key);

    private static string? SheetKeyOf(string? sql)
    {
        if (sql == null) return null;
        var match = SheetKey.Match(sql);
        return match.Success && IsName(match.Groups["k"].Value) ? match.Groups["k"].Value : null;
    }

    private static void RequireSheet(ProbeSchema schema, string visitColumn) =>
        Require(schema, SheetTable, new[] { visitColumn }.Concat(SheetColumns).ToArray());

    private const string SheetSelect =
        "SELECT TOP 15 RTRIM(CAST(t.[EmrShtTyp] AS nvarchar(40))) Typ,RTRIM(CAST(t.[EmrShtCod] AS nvarchar(40))) Cod,";

    private const string SheetGroup = "\nGROUP BY t.[EmrShtTyp],t.[EmrShtCod]";

    private static string SheetFrom(string key) =>
        "\nFROM dbo.[EmrInf] t\nCROSS APPLY (SELECT CAST(t.[EmrShtVal] AS nvarchar(max)) Val) v" + Within(key, "OcmNum");

    private static string Hits(string key) =>
        SheetSelect + "COUNT_BIG(*) Containing" + SheetFrom(key) + "\n AND CHARINDEX(@text," + Squeezed + ")>0" + SheetGroup
        + "\nORDER BY Containing DESC,Typ,Cod";

    private static string Codes(string key) =>
        SheetSelect + "COUNT_BIG(*) Total,COUNT_BIG(CASE WHEN " + Filled + " THEN 1 END) NonEmpty,"
        + "MIN(CASE WHEN " + Filled + " THEN LEN(v.Val) END) MinLength,MAX(CASE WHEN " + Filled + " THEN LEN(v.Val) END) MaxLength"
        + SheetFrom(key) + SheetGroup + "\nORDER BY Total DESC,Typ,Cod";

    /// <summary>글자가 틀 세 가지 가운데 하나로 만든 글과 똑같은가(이름 모양까지). 이름이 그 실행의 답에 있었는지는 만들 때 본다.</summary>
    public static bool IsProbe(string? sql)
    {
        if (sql == null) return false;
        var match = Head.Match(sql);
        if (!match.Success) return false;
        var table = match.Groups["t"].Value;
        var first = match.Groups["a"].Value;
        if (!IsName(table) || !IsName(first)) return false;
        if (match.Groups["b"].Success)
        {
            var text = match.Groups["b"].Value;
            return IsName(text) && (sql == Pair(table, first, text, "OcmNum") || sql == Pair(table, first, text, "OcmChtNum"));
        }
        return SampleLinks.TryGetValue(table, out var link) && sql == One(table, first, link.Key, link.Target);
    }

    private static void Require(ProbeSchema schema, string table, params string[] columns)
    {
        if (schema == null) throw new ArgumentNullException(nameof(schema));
        if (!IsName(table)) throw Blocked();
        foreach (var column in columns)
        {
            if (!IsName(column) || !schema.Has(table, column)) throw Blocked();
        }
    }

    private static BitException Blocked() => new BitException(BitErrors.ReadFailed);

    private static string Pair(string table, string key, string text, string target) =>
        "SELECT t.[" + key + "],t.[" + text + "] FROM dbo.[" + table + "] t" + Within(key, target);

    private static string One(string table, string column, string key, string target) =>
        "SELECT TOP 300 t.[" + column + "] FROM dbo.[" + table + "] t" + Within(key, target);

    private const string Squeezed = "REPLACE(REPLACE(REPLACE(REPLACE(v.Val,N' ',N''),NCHAR(13),N''),NCHAR(10),N''),NCHAR(9),N'')";

    private const string Filled = "LEN(LTRIM(v.Val))>0";

    private static string Count(string table, string key, string text) =>
        "SELECT COUNT_BIG(*) Total,COUNT_BIG(CASE WHEN " + Filled + " THEN 1 END) NonEmpty,COUNT_BIG(CASE WHEN CHARINDEX(@text," + Squeezed + ")>0 THEN 1 END) Containing,"
        + "MIN(CASE WHEN " + Filled + " THEN LEN(v.Val) END) MinLength,MAX(CASE WHEN " + Filled + " THEN LEN(v.Val) END) MaxLength"
        + "\nFROM dbo.[" + table + "] t\nCROSS APPLY (SELECT CAST(t.[" + text + "] AS nvarchar(max)) Val) v" + Within(key, "OcmNum");

    private static string Within(string key, string target) =>
        "\nWHERE t.[" + key + "] IN (SELECT c." + target + " FROM dbo.OcmInf c\n WHERE " + CheckSql.TodayScope + ")";
}
