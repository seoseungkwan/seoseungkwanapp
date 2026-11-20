using System;
using System.Collections.Generic;
using System.Globalization;
using Precheck.Core.Bit;

namespace Precheck.Core.DocPrint;

/// <summary>
/// 병원 정보(spec doc-print AC-7405.1, notes/bit-docs.md §6·§7): 비트 HspMst의 그날 유효한 한 줄. 글은 앞뒤 빈칸을 뺐고 빈 칸은 빈 글.
/// </summary>
public sealed class HospitalInfo
{
    public HospitalInfo(string name, string institutionNumber, string address, string businessNumber, string owner, string receiptName, string phone, string fax, byte[]? seal)
    {
        Name = Clean(name);
        InstitutionNumber = Clean(institutionNumber);
        Address = Clean(address);
        BusinessNumber = Clean(businessNumber);
        Owner = Clean(owner);
        ReceiptName = Clean(receiptName);
        Phone = Clean(phone);
        Fax = Clean(fax);
        Seal = seal != null && seal.Length > 0 ? seal : null;
    }

    /// <summary>HspMst 줄이 없을 때: 모두 빈 글, 직인 없음.</summary>
    public static HospitalInfo Empty { get; } = new HospitalInfo("", "", "", "", "", "", "", "", null);

    /// <summary>HspNam.</summary>
    public string Name { get; }

    /// <summary>요양기관기호 HspInsNum.</summary>
    public string InstitutionNumber { get; }

    /// <summary>HspHspAdr.</summary>
    public string Address { get; }

    /// <summary>사업자등록번호로 추정하는 HspRgnNum(10자리). 견본과 맞춰 볼 것.</summary>
    public string BusinessNumber { get; }

    /// <summary>대표자 HspOwnNam.</summary>
    public string Owner { get; }

    /// <summary>영수증에 찍는 이름으로 추정하는 HspRcpNam.</summary>
    public string ReceiptName { get; }

    /// <summary>HspTelNum.</summary>
    public string Phone { get; }

    /// <summary>HspFaxNum.</summary>
    public string Fax { get; }

    /// <summary>병원 직인 그림 HspSignImg(그림 파일 바이트), 없거나 0바이트면 null.</summary>
    public byte[]? Seal { get; }

    /// <summary>DocSql.HospitalSql(@day = 그날 yyyyMMdd)로 읽기만 한다. 줄이 없으면 Empty, 읽기 실패는 BitException 그대로.</summary>
    public static HospitalInfo Read(IBitDb db, DateTime day)
    {
        var args = new Dictionary<string, object?>(StringComparer.Ordinal) { ["@day"] = day.Date.ToString("yyyyMMdd", CultureInfo.InvariantCulture) };
        var rows = ReadOnlyGuard.Query(db, DocSql.HospitalSql, args, DocSql.ReadTimeout);
        if (rows.Count == 0 || rows[0] == null || rows[0].Count < 9) return Empty;
        var row = rows[0];
        return new HospitalInfo(Text(row[0]), Text(row[1]), Text(row[2]), Text(row[3]), Text(row[4]), Text(row[5]), Text(row[6]), Text(row[7]), row[8] as byte[]);
    }

    private static string Text(object? value) => value == null || value is DBNull ? "" : Convert.ToString(value, CultureInfo.InvariantCulture) ?? "";

    private static string Clean(string? text) => (text ?? "").Trim();
}
