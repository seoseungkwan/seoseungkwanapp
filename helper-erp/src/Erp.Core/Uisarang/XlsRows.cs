using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using ExcelDataReader;

namespace Erp.Core.Uisarang;

/// <summary>
/// 의사랑 통계 엑셀(.xls, BIFF8)의 첫 시트를 줄·칸으로 읽는다(spec erp-uisarang design.md 5-6, ADR-050, AC-4203.1·AC-4203.2).
/// - BIFF8 전용 입구 ExcelReaderFactory.CreateBinaryReader만 쓴다. zip(.xlsx)·HTML·CSV를 저절로 고르는 입구는 쓰지 않아 그런 파일은 UisFileException이다
/// - 줄은 시트 차례 그대로(빈 줄 포함), 줄마다 칸 수는 시트 칸 수로 같다. 칸: double·int → 숫자 칸, 글자 → 글자 칸(빈 글자는 빈 칸),
///   날짜 → 글자 'yyyy-MM-dd', 그 밖 → 글자(InvariantCulture). 글자는 고치지 않는다(쉼표 숫자·코드 빈칸 정리는 보고서 셈이 한다)
/// - 읽지 못하면(깨짐·BIFF8 아님·빈 파일·한도 넘음) 늘 같은 글의 UisFileException 하나. 읽기 부품의 예외(글에 칸 값이 들 수 있음)는 싣지 않는다
/// - 코드 페이지는 등록하지 않는다(도우미 .NET Framework 4.8은 기본으로 있다. net10.0 시험은 시험 시작에서 등록)
/// </summary>
public static class XlsRows
{
    /// <summary>시트 줄 한도(넘으면 의사랑 보고서가 아니거나 너무 큰 파일).</summary>
    public const int MaxRows = 20000;

    /// <summary>시트 칸 한도.</summary>
    public const int MaxColumns = 64;

    public static IReadOnlyList<IReadOnlyList<XlsCell>> Read(byte[] bytes) => Read(bytes, MaxRows, MaxColumns);

    /// <summary>한도를 정해 읽는다(시험이 작은 가짜 파일로 한도를 본다).</summary>
    public static IReadOnlyList<IReadOnlyList<XlsCell>> Read(byte[] bytes, int maxRows, int maxColumns)
    {
        if (bytes == null || bytes.Length == 0) throw new UisFileException();
        try
        {
            using var stream = new MemoryStream(bytes, writable: false);
            using var reader = ExcelReaderFactory.CreateBinaryReader(stream);
            var width = reader.FieldCount;
            if (width < 0 || width > maxColumns || reader.RowCount > maxRows) throw new UisFileException();

            var rows = new List<IReadOnlyList<XlsCell>>();
            while (reader.Read())
            {
                var count = reader.FieldCount;
                if (rows.Count >= maxRows || count > maxColumns) throw new UisFileException();
                // 칸 수가 시트 칸 수와 다른 줄이 와도 시트 칸 수에 맞춘다(모자란 칸은 빈 칸)
                var row = new XlsCell[width];
                for (var i = 0; i < Math.Min(count, width); i++) row[i] = Cell(reader.GetValue(i));
                rows.Add(row);
            }
            return rows;
        }
        catch (UisFileException)
        {
            throw;
        }
        catch (Exception)
        {
            // 읽기 부품의 예외 글·안쪽 예외에는 칸 값이 들 수 있어 버리고 고정 글 하나로 바꾼다
            throw new UisFileException();
        }
    }

    private static XlsCell Cell(object? value) => value switch
    {
        null => XlsCell.Empty,
        double number => new XlsCell(number),
        int number => new XlsCell(number),
        string text => text.Length == 0 ? XlsCell.Empty : new XlsCell(text),
        DateTime date => new XlsCell(date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)),
        _ => new XlsCell(Convert.ToString(value, CultureInfo.InvariantCulture) ?? ""),
    };
}
