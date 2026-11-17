using System;
using System.Collections.Generic;
using System.Data.Common;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;

namespace Precheck.Core.Reception.Check;

/// <summary>
/// 확인 보고서의 칸 하나(열쇠=값, 열쇠가 없으면 값만). 값은 만들 때 이미 걸러져 있다(design.md 1절 '보고서 거르기', AC-1401.10):
/// 표·칸 이름은 영문 이름 모양만, 숫자는 숫자 형만, 상태 코드는 ^[A-Z0-9]{1,4}$만, 값 목록은 AC-1401.7 조건일 때만,
/// 화면 83 칸 제목은 도우미가 아는 제목만 지나고 나머지는 ?다. 오류는 형 이름·도우미 오류 번호·SQL 오류 번호만(.Message 금지).
/// 칸을 만드는 길은 이 팩토리뿐이라 보고서(CheckReport)에는 걸러진 글만 간다.
/// </summary>
public sealed class CheckField
{
    public const string Unknown = "?";

    private const string Skip = "건너뜀";
    private const string FailedOpen = "실패(";
    private const string TimeoutWord = "시간 초과";

    // .NET의 $는 끝 줄바꿈 앞에서도 맞으므로 \z로 끝을 잡는다
    private static readonly Regex NameShape = new Regex(@"^[A-Za-z][A-Za-z0-9_]{0,63}\z", RegexOptions.CultureInvariant);
    private static readonly Regex KeyShape = new Regex(@"^[A-Za-z][A-Za-z0-9_]{0,31}\z", RegexOptions.CultureInvariant);
    private static readonly Regex StatusShape = new Regex(@"^[A-Z0-9]{1,4}\z", RegexOptions.CultureInvariant);
    // 값 목록 한 값: ASCII 글자·숫자 두 글자 이하(코드 모양)나 한글 완성형 한 글자(남·여). 두 글자 한글은 이름일 수 있어 막는다
    private static readonly Regex SmallValueShape = new Regex(@"^(?:[A-Za-z0-9]{1,2}|[\uAC00-\uD7A3])\z", RegexOptions.CultureInvariant);
    private static readonly Regex Space = new Regex(@"\s", RegexOptions.CultureInvariant);
    private static readonly Regex RxCodeShape = new Regex(@"^[0-9A-Za-z가-힣_]{1,16}\z", RegexOptions.CultureInvariant);

    private static readonly Regex RxNameShape = new Regex(@"^[0-9A-Za-z가-힣 ()\[\]/.,·+\-%]{1,40}\z", RegexOptions.CultureInvariant);

    private static readonly Regex Letter = new Regex(@"[A-Za-z가-힣]", RegexOptions.CultureInvariant);

    private static readonly Regex CodeShape = new Regex(@"^(?:(?=[0-9]*[A-Za-z_])[A-Za-z0-9_]{1,16}|[0-9]{1,5})\z", RegexOptions.CultureInvariant);

    /// <summary>화면 83에서 도우미가 아는 칸 제목(GridRows 83의 칸). 코드의 글이라 보고서에 적어도 된다.</summary>
    private static readonly HashSet<string> ScreenTitles = new HashSet<string>(GridRows.Columns(StatsScreens.Symptoms), StringComparer.Ordinal);

    /// <summary>값 목록(AC-1401.7): 4가지 이하일 때만 적는다.</summary>
    private const int MaxValues = 4;

    private readonly string? key;
    private readonly string value;

    private CheckField(string? key, string value)
    {
        if (key != null && !IsKey(key)) throw new ArgumentException("보고서 칸 이름 모양이 틀렸다", nameof(key));
        this.key = key;
        this.value = value;
    }

    /// <summary>표·칸·형식 이름: ^[A-Za-z][A-Za-z0-9_]{0,63}$ 모양 글자만.</summary>
    public static CheckField Name(string? key, object? value) => new CheckField(key, NameText(value));

    /// <summary>표.칸: 두 이름을 따로 거른다.</summary>
    public static CheckField Column(string? key, object? table, object? column) => new CheckField(key, NameText(table) + "." + NameText(column));

    /// <summary>숫자 형만(bool은 1·0, 소수는 한 자리까지). 숫자처럼 생긴 글자는 숫자가 아니다.</summary>
    public static CheckField Number(string? key, object? value) => new CheckField(key, NumberText(value) ?? Unknown);

    /// <summary>비트 상태·수납 코드: ^[A-Z0-9]{1,4}$ 모양 글자만.</summary>
    public static CheckField Status(string? key, object? value) =>
        new CheckField(key, value is string text && StatusShape.IsMatch(text) ? text : Unknown);

    /// <summary>
    /// 기록지 코드(EmrShtTyp·EmrShtCod, AC-1401.18): 영문·숫자·_ 1~16자이고 영문·_가 하나라도 있거나 숫자만 5자까지일 때만(정수 형은 숫자 글로).
    /// 숫자만 6자 이상은 차트번호일 수 있어 ?다.
    /// </summary>
    public static CheckField Code(string? key, object? value)
    {
        var text = value is string raw ? raw : value is bool || value is double || value is float || value is decimal ? null : NumberText(value);
        return new CheckField(key, text != null && CodeShape.IsMatch(text) ? text : Unknown);
    }

    /// <summary>처방 코드(spec reception-arrange AC-3302.3): 글자 형이고 ^[0-9A-Za-z가-힣_]{1,16}$일 때만 그대로, 아니면 ?.</summary>
    public static CheckField RxCode(string? key, object? value) =>
        new CheckField(key, value is string text && RxCodeShape.IsMatch(text) ? text : Unknown);

    /// <summary>
    /// 코드 사전의 처방 이름(AC-3302.3): 앞뒤 공백을 뗀 글이 ^[0-9A-Za-z가-힣 ()\[\]/.,·+\-%]{1,40}$이고 영문·한글이 하나 이상일 때만, 아니면 ?.
    /// 글자가 없는 값(전화번호·번호 모양)은 이름이 아니라 적지 않는다.
    /// </summary>
    public static CheckField RxName(string? key, object? value)
    {
        var text = (value as string)?.Trim();
        return new CheckField(key, text != null && RxNameShape.IsMatch(text) && Letter.IsMatch(text) ? text : Unknown);
    }

    /// <summary>어레인지 칸(AC-3302.2): 지도가 넣는 칸 열쇠(xray…), 없으면 -, 칸 열쇠 모양(ArrangeKeys.IsMarkKey)이 아니면 ?.</summary>
    public static CheckField Arrange(string? key, string? col) => new CheckField(key, col == null ? "-" : ArrangeKeys.IsMarkKey(col) ? col : Unknown);

    /// <summary>
    /// 모양 단계의 값 목록(AC-1401.7): 빈 값을 뺀 서로 다른 값이 1~4가지이고 모두 ASCII 글자·숫자 두 글자 이하나 한글 한 글자(앞뒤 공백은 뗀다)일 때만
    /// 정렬해 쉼표로 잇는다. 하나라도 어긋나면 ?(두 글자 한글 이름이 지나지 않게).
    /// </summary>
    public static CheckField Values(string? key, IEnumerable<object?>? values) => new CheckField(key, ValuesText(values));

    /// <summary>화면 83 칸 제목(AC-1401.4): 칸마다 도우미가 아는 제목(공백을 뗀 글이 같을 때)이면 그 제목, 아니면 ?.</summary>
    public static CheckField Titles(string? key, IEnumerable<object?>? titles) =>
        new CheckField(key, titles == null ? Unknown : string.Join(",", titles.Select(TitleText)));

    /// <summary>건너뛴 단계(로그인 취소·엔터만 침).</summary>
    public static CheckField Skipped(string? key) => new CheckField(key, Skip);

    /// <summary>실패한 항목(AC-1401.11): 실패(도우미 오류 번호) · 실패(형 이름 SQL 오류 번호) · 실패(형 이름).</summary>
    public static CheckField Failed(string? key, Exception error)
    {
        if (error == null) throw new ArgumentNullException(nameof(error));
        return new CheckField(key, FailedOpen + FailureCode(Unwrap(error)) + ")");
    }

    /// <summary>시간 제한을 넘은 항목(AC-1401.11).</summary>
    public static CheckField TimedOut(string? key) => new CheckField(key, FailedOpen + TimeoutWord + ")");

    /// <summary>보고서 줄의 라벨·칸 열쇠 모양(코드에 적어 둔 영문 낱말).</summary>
    internal static bool IsKey(string? text) => text != null && KeyShape.IsMatch(text);

    public override string ToString() => key == null ? value : key + "=" + value;

    private static string NameText(object? value) => value is string text && NameShape.IsMatch(text) ? text : Unknown;

    private static string? NumberText(object? value)
    {
        switch (value)
        {
            case bool flag: return flag ? "1" : "0";
            case byte number: return number.ToString(CultureInfo.InvariantCulture);
            case sbyte number: return number.ToString(CultureInfo.InvariantCulture);
            case short number: return number.ToString(CultureInfo.InvariantCulture);
            case ushort number: return number.ToString(CultureInfo.InvariantCulture);
            case int number: return number.ToString(CultureInfo.InvariantCulture);
            case uint number: return number.ToString(CultureInfo.InvariantCulture);
            case long number: return number.ToString(CultureInfo.InvariantCulture);
            case ulong number: return number.ToString(CultureInfo.InvariantCulture);
            case decimal number: return number.ToString("0.#", CultureInfo.InvariantCulture);
            case double number when !double.IsNaN(number) && !double.IsInfinity(number): return number.ToString("0.#", CultureInfo.InvariantCulture);
            case float number when !float.IsNaN(number) && !float.IsInfinity(number): return number.ToString("0.#", CultureInfo.InvariantCulture);
            default: return null;
        }
    }

    private static string ValuesText(IEnumerable<object?>? values)
    {
        if (values == null) return Unknown;
        var seen = new SortedSet<string>(StringComparer.Ordinal);
        foreach (var value in values)
        {
            if (value == null) continue;
            string? text;
            if (value is string raw) text = raw.Trim();
            else if (value is double || value is float || value is decimal) return Unknown;
            else text = NumberText(value);
            if (text == null) return Unknown;
            if (text.Length == 0) continue;
            if (!SmallValueShape.IsMatch(text)) return Unknown;
            seen.Add(text);
            if (seen.Count > MaxValues) return Unknown;
        }
        return seen.Count == 0 ? Unknown : string.Join(",", seen);
    }

    private static string TitleText(object? title)
    {
        if (!(title is string text)) return Unknown;
        var compact = Space.Replace(text, "");
        return ScreenTitles.Contains(compact) ? compact : Unknown;
    }

    // 작업(Task)·리플렉션이 싼 예외는 속의 것 하나를 본다
    private static Exception Unwrap(Exception error)
    {
        for (var depth = 0; depth < 8; depth++)
        {
            if (error is AggregateException aggregate && aggregate.InnerExceptions.Count == 1) error = aggregate.InnerExceptions[0];
            else if (error is TargetInvocationException && error.InnerException != null) error = error.InnerException;
            else break;
        }
        return error;
    }

    private static string FailureCode(Exception error)
    {
        if (error is HelperException helper && ErrorCodes.IsCode(helper.Code)) return helper.Code;
        var name = NameText(error.GetType().Name);
        var number = error is DbException ? SqlNumber(error) : null;
        return number.HasValue ? name + " " + number.Value.ToString(CultureInfo.InvariantCulture) : name;
    }

    /// <summary>SqlException.Number(Core는 SqlClient를 모르므로 DbException의 int Number를 이름으로 읽는다). 없으면 null.</summary>
    private static int? SqlNumber(Exception error)
    {
        try
        {
            var property = error.GetType().GetProperty("Number", BindingFlags.Public | BindingFlags.Instance);
            return property != null && property.PropertyType == typeof(int) ? (int?)(int)property.GetValue(error)! : null;
        }
        catch (Exception e) when (e is TargetInvocationException || e is AmbiguousMatchException || e is MethodAccessException)
        {
            return null;
        }
    }
}

/// <summary>
/// 확인 보고서 쓰기(AC-1401.10·11). 줄은 라벨(정해 둔 영문 낱말) + 걸러진 칸(CheckField)뿐이다. 멈추거나 죽어도
/// 그때까지의 줄이 남게 줄마다 디스크까지 비운다. 메모장이 열 수 있게 UTF-8 BOM으로 시작하고 줄 끝은 CRLF다.
/// 시간 감시 스레드도 쓸 수 있게 잠금 안에서만 파일을 만진다.
/// </summary>
public sealed class CheckReport : IDisposable
{
    private static readonly UTF8Encoding Utf8 = new UTF8Encoding(false);
    private static readonly Regex BuildShape = new Regex(@"^[0-9A-Za-z][0-9A-Za-z.+\-]{0,39}\z", RegexOptions.CultureInvariant);

    private readonly object gate = new object();
    private readonly Stream stream;

    public CheckReport(Stream stream, string filePath)
    {
        this.stream = stream ?? throw new ArgumentNullException(nameof(stream));
        FilePath = filePath ?? "";
        lock (gate)
        {
            stream.Write(new byte[] { 0xEF, 0xBB, 0xBF }, 0, 3);
            Sync();
        }
    }

    /// <summary>보고서 파일 경로(끝나면 콘솔에 쓰고 메모장으로 연다). 흐름으로 만들었으면 빈 글.</summary>
    public string FilePath { get; }

    /// <summary>푼 폴더(appDirectory의 부모) → 임시 폴더 차례로 새 보고서 파일을 연다(CheckReportPath). 어디에도 못 쓰면 IOException.</summary>
    public static CheckReport Create(string appDirectory, string tempDirectory, DateTime when)
    {
        var stream = CheckReportPath.Open(CheckReportPath.Folders(appDirectory, tempDirectory), when, out var path);
        try
        {
            return new CheckReport(stream, path);
        }
        catch
        {
            stream.Dispose();
            throw;
        }
    }

    /// <summary>첫 줄: 시작 시각(분까지)과 빌드 표시(판·커밋 모양 글자만, 아니면 ?).</summary>
    public void Header(DateTime started, string? build) =>
        Write("reception-check started=" + started.ToString("yyyy-MM-dd'T'HH:mm", CultureInfo.InvariantCulture)
            + " build=" + (build != null && BuildShape.IsMatch(build) ? build : CheckField.Unknown));

    /// <summary>줄 하나: 라벨 + 칸들. 라벨이 정해 둔 모양이 아니면 ArgumentException(아무것도 쓰지 않는다).</summary>
    public void Line(string label, params CheckField[] fields)
    {
        if (!CheckField.IsKey(label)) throw new ArgumentException("보고서 줄 라벨 모양이 틀렸다", nameof(label));
        var text = new StringBuilder(label);
        foreach (var field in fields ?? new CheckField[0])
        {
            if (field == null) throw new ArgumentNullException(nameof(fields));
            text.Append(' ').Append(field);
        }
        Write(text.ToString());
    }

    public void Dispose()
    {
        lock (gate) stream.Dispose();
    }

    private void Write(string line)
    {
        var bytes = Utf8.GetBytes(line + "\r\n");
        lock (gate)
        {
            stream.Write(bytes, 0, bytes.Length);
            Sync();
        }
    }

    private void Sync()
    {
        stream.Flush();
        if (stream is FileStream file) file.Flush(true);
    }
}
