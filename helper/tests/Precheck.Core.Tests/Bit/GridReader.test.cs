using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Precheck.Core.Bit;
using Xunit;

namespace Precheck.Core.Tests.Bit;

/// <summary>
/// AC-008.3 비트 통계 화면 표 읽기(원본 NativeReportAdapter.ReadGrids): 표 객체(C1FlexGrid)를 리플렉션으로 읽는다.
/// 보이는 줄·칸만, 화면 표시 글자(GetDataDisplay)로. 숫자 칸은 표시 글자가 같은 수일 때만 값으로(원본 그대로).
/// 시험은 C1FlexGrid 모양을 흉내 낸 가짜 표다.
/// </summary>
public class GridReaderTests
{
    public sealed class FakeRow
    {
        public bool Visible { get; set; } = true;
    }

    public sealed class FakeColumn
    {
        public bool Visible { get; set; } = true;
        public int Width { get; set; } = 80;
        public Type? DataType { get; set; }
        public object? DataMap { get; set; }
    }

    public sealed class FakeRows
    {
        internal readonly List<FakeRow> Items = new List<FakeRow>();
        public int Count => Items.Count;
        public int Fixed { get; set; } = 1;
        public FakeRow this[int index] => Items[index];
    }

    public sealed class FakeColumns
    {
        internal readonly List<FakeColumn> Items = new List<FakeColumn>();
        public int Count => Items.Count;
        public FakeColumn this[int index] => Items[index];
    }

    /// <summary>값(this[r, c])과 화면 표시 글자(GetDataDisplay)를 따로 가진 표.</summary>
    public class FakeGrid
    {
        internal readonly List<object?[]> Values = new List<object?[]>();
        internal readonly List<string[]> Displays = new List<string[]>();

        public FakeRows Rows { get; } = new FakeRows();
        public FakeColumns Cols { get; } = new FakeColumns();

        public object? this[int row, int col] => Values[row][col];

        public string GetDataDisplay(int row, int col) => Displays[row][col];

        public FakeGrid Columns(params FakeColumn[] columns)
        {
            Cols.Items.AddRange(columns);
            return this;
        }

        public FakeGrid Row(object?[] values, string[]? displays = null, bool visible = true)
        {
            Values.Add(values);
            Displays.Add(displays ?? values.Select(v => Convert.ToString(v, CultureInfo.InvariantCulture) ?? "").ToArray());
            Rows.Items.Add(new FakeRow { Visible = visible });
            return this;
        }
    }

    /// <summary>GetDataDisplay가 없는 표(비트 업데이트로 표가 바뀐 경우).</summary>
    public sealed class GridWithoutDisplay
    {
        public FakeRows Rows { get; } = new FakeRows();
        public FakeColumns Cols { get; } = new FakeColumns();
        public object? this[int row, int col] => null;
    }

    private static FakeColumn Text() => new FakeColumn { DataType = typeof(string) };

    private static FakeColumn Number() => new FakeColumn { DataType = typeof(int) };

    [Fact(DisplayName = "AC-008.3 보이는 줄·칸만(Visible이고 Width가 0이 아닌 칸) 화면 표시 글자로 읽는다. 머리 줄도 같은 줄 목록의 앞에 온다")]
    public void ReadsVisibleCellsAsDisplayed()
    {
        var grid = new FakeGrid()
            .Columns(Text(), Text(), new FakeColumn { DataType = typeof(string), Visible = false }, new FakeColumn { DataType = typeof(string), Width = 0 }, Text())
            .Row(new object?[] { "내원번호", "차트번호", "주민번호", "주소", "환자명" })
            .Row(new object?[] { "V1", "900001", "000000-0000000", "가상동", "가상환자01" })
            .Row(new object?[] { "V9", "900009", "x", "x", "가상환자09" }, visible: false)
            .Row(new object?[] { "V2", "900002", "000000-0000000", "가상동", "가상환자02" }, new[] { "V2", "900002", "000000-0000000", "가상동", "가상환자02 " });

        var sheet = GridReader.Read(grid, CultureInfo.InvariantCulture);

        Assert.Equal(3, sheet.Count);
        Assert.Equal(new[] { "내원번호", "차트번호", "환자명" }, sheet[0]);
        Assert.Equal(new[] { "V1", "900001", "가상환자01" }, sheet[1]);
        Assert.Equal(new[] { "V2", "900002", "가상환자02 " }, sheet[2]);
        Assert.DoesNotContain(sheet, row => row.Contains("000000-0000000") || row.Contains("가상동"));
    }

    [Fact(DisplayName = "AC-008.3 숫자 칸은 표시 글자가 같은 수일 때만 값(1,234 → 1234), 다르면·글자 칸·DataMap 칸·머리 줄은 표시 글자")]
    public void NumbersLikeOriginal()
    {
        var grid = new FakeGrid()
            .Columns(Number(), Number(), Text(), new FakeColumn { DataType = typeof(int), DataMap = new object() }, new FakeColumn { DataType = typeof(double) })
            .Row(new object?[] { 1, 2, "3", 4, 5.0 }, new[] { "수량", "총투여량", "코드", "급여", "비율" })
            .Row(new object?[] { 1234, 7, 900001, 1, 0.5 }, new[] { "1,234", "칠", "900,001", "급여", "0.5" })
            .Row(new object?[] { 2.50m, null, "", 2, 1.25 }, new[] { "2.5", "", "", "비급여", "1.25" });

        var sheet = GridReader.Read(grid, CultureInfo.InvariantCulture);

        Assert.Equal(new[] { "수량", "총투여량", "코드", "급여", "비율" }, sheet[0]);
        Assert.Equal(new[] { "1234", "칠", "900,001", "급여", "0.5" }, sheet[1]);
        Assert.Equal(new[] { "2.5", "", "", "비급여", "1.25" }, sheet[2]);
    }

    [Fact(DisplayName = "AC-008.3 표에 줄·보이는 칸이 없거나 모든 칸이 비었으면 빈 표(줄 0개)")]
    public void EmptyGrids()
    {
        Assert.Empty(GridReader.Read(new FakeGrid().Columns(Text()), CultureInfo.InvariantCulture));
        Assert.Empty(GridReader.Read(new FakeGrid().Columns(new FakeColumn { Visible = false }).Row(new object?[] { "x" }), CultureInfo.InvariantCulture));
        Assert.Empty(GridReader.Read(new FakeGrid().Columns(Text(), Text()).Row(new object?[] { "", " " }), CultureInfo.InvariantCulture));
    }

    [Fact(DisplayName = "AC-008.3 표를 읽는 길(GetDataDisplay·Rows·Cols·칸 속성)이 없으면 E-BIT-EXPORT-FAILED")]
    public void MissingMembers()
    {
        var withoutDisplay = new GridWithoutDisplay();
        withoutDisplay.Cols.Items.Add(Text());
        Assert.Equal("E-BIT-EXPORT-FAILED", Assert.Throws<BitException>(() => GridReader.Read(withoutDisplay, CultureInfo.InvariantCulture)).Code);
        Assert.Equal("E-BIT-EXPORT-FAILED", Assert.Throws<BitException>(() => GridReader.Read(new object(), CultureInfo.InvariantCulture)).Code);
        Assert.Equal("E-BIT-EXPORT-FAILED", Assert.Throws<BitException>(() => GridReader.Read(null!, CultureInfo.InvariantCulture)).Code);
    }
}
