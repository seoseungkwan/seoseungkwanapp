using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Reflection;

namespace Precheck.Core.Bit;

/// <summary>
/// 비트 통계 화면 표(C1FlexGrid) 읽기. 원본 NativeReportAdapter.ReadGrids 그대로 리플렉션으로 읽는다(비트 DLL을 참조하지 않는다):
/// 보이는 칸(Visible이고 Width가 0이 아님)·보이는 줄만, 칸 값은 화면 표시 글자(GetDataDisplay). 머리 줄(Rows.Fixed)도 앞에 함께 준다.
/// 표를 읽는 길이 없으면 E-BIT-EXPORT-FAILED. 플랫폼과 상관없어 Core에 두고 가짜 표로 시험한다.
/// </summary>
public static class GridReader
{
    private const BindingFlags Members = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance;

    /// <summary>표의 보이는 줄들(머리 줄 포함). 줄·보이는 칸이 없거나 모든 칸이 비었으면 빈 목록. culture는 원본처럼 ko-KR(숫자 표시 읽기).</summary>
    public static IReadOnlyList<IReadOnlyList<string>> Read(object grid, CultureInfo culture)
    {
        if (culture == null) throw new ArgumentNullException(nameof(culture));
        try
        {
            return ReadGrid(grid ?? throw Broken(), culture);
        }
        catch (TargetInvocationException)
        {
            // 비트 표 안의 예외 글은 버린다(환자 값이 섞일 수 있다)
            throw Broken();
        }
        catch (Exception e) when (e is InvalidCastException || e is FormatException || e is OverflowException || e is AmbiguousMatchException ||
            e is ArgumentException || e is NullReferenceException || e is TargetParameterCountException)
        {
            throw Broken();
        }
    }

    private static IReadOnlyList<IReadOnlyList<string>> ReadGrid(object grid, CultureInfo culture)
    {
        object rows = Get(grid, "Rows"), cols = Get(grid, "Cols");
        int rowCount = Convert.ToInt32(Get(rows, "Count"), CultureInfo.InvariantCulture);
        int colCount = Convert.ToInt32(Get(cols, "Count"), CultureInfo.InvariantCulture);
        int fixedRows = Convert.ToInt32(Get(rows, "Fixed"), CultureInfo.InvariantCulture);
        var display = grid.GetType().GetMethod("GetDataDisplay", new[] { typeof(int), typeof(int) }) ?? throw Broken();

        var visible = new List<int>();
        for (var c = 0; c < colCount; c++)
        {
            var column = Index(cols, c);
            if (Convert.ToBoolean(Get(column, "Visible"), CultureInfo.InvariantCulture) && Convert.ToInt32(Get(column, "Width"), CultureInfo.InvariantCulture) != 0) visible.Add(c);
        }
        var sheet = new List<IReadOnlyList<string>>();
        if (visible.Count == 0 || rowCount == 0) return sheet;

        for (var r = 0; r < rowCount; r++)
        {
            if (!Convert.ToBoolean(Get(Index(rows, r), "Visible"), CultureInfo.InvariantCulture)) continue;
            var record = new string[visible.Count];
            for (var i = 0; i < visible.Count; i++)
            {
                var c = visible[i];
                var value = Index(grid, r, c);
                var shown = Convert.ToString(display.Invoke(grid, new object[] { r, c }), CultureInfo.InvariantCulture) ?? "";
                var column = Index(cols, c);
                record[i] = GridCell.Text(value, shown, r < fixedRows, Get(column, "DataMap") != null, Get(column, "DataType") as Type, culture);
            }
            sheet.Add(record);
        }
        return sheet.Any(row => row.Any(v => !string.IsNullOrWhiteSpace(v))) ? sheet : new List<IReadOnlyList<string>>();
    }

    private static object Get(object target, string name)
    {
        var property = target.GetType().GetProperty(name, Members) ?? throw Broken();
        return property.GetValue(target, null)!;
    }

    private static object Index(object target, params int[] indexes)
    {
        var property = target.GetType().GetProperties(Members).FirstOrDefault(x => x.Name == "Item" &&
            x.GetIndexParameters().Length == indexes.Length && x.GetIndexParameters().All(p => p.ParameterType == typeof(int))) ?? throw Broken();
        return property.GetValue(target, indexes.Cast<object>().ToArray())!;
    }

    private static BitException Broken() => new BitException(BitErrors.ExportFailed);
}

/// <summary>
/// 표 칸 하나의 글자(원본 ReadGrids → 엑셀 → mx999가 String()으로 읽은 결과와 같게).
/// 머리 줄이 아니고, DataMap이 없고, 글자 칸이 아니고, 값이 숫자이며 화면 표시 글자가 같은 수일 때만 값의 숫자 글자(1,234 → 1234),
/// 그 밖은 화면 표시 글자 그대로.
/// </summary>
public static class GridCell
{
    public static string Text(object? value, string display, bool header, bool mapped, Type? dataType, CultureInfo culture)
    {
        display ??= "";
        if (header || mapped || dataType == typeof(string) || !IsNumber(value)) return display;
        if (!decimal.TryParse(display, NumberStyles.Number | NumberStyles.AllowCurrencySymbol, culture, out var shown)) return display;
        decimal exact;
        try
        {
            exact = Convert.ToDecimal(value, CultureInfo.InvariantCulture);
        }
        catch (OverflowException)
        {
            return display;
        }
        return shown == exact ? Number(exact) : display;
    }

    private static bool IsNumber(object? value) =>
        value is byte || value is sbyte || value is short || value is ushort || value is int || value is uint ||
        value is long || value is ulong || value is decimal || value is float || value is double;

    /// <summary>엑셀 숫자 칸을 JS String(Number)로 읽은 모양: 소수점 뒤 끝 0과 점을 뺀다(2.50 → 2.5).</summary>
    private static string Number(decimal value)
    {
        var text = value.ToString(CultureInfo.InvariantCulture);
        if (text.IndexOf('.') >= 0) text = text.TrimEnd('0').TrimEnd('.');
        return text == "-0" ? "0" : text;
    }
}
