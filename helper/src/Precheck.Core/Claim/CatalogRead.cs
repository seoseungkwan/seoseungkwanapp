using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;

namespace Precheck.Core.Claim;

/// <summary>병원 등록 처방코드 하나(원본 PrescriptionCatalogCode {code, name, kind, active, standardCode}).</summary>
public sealed class PrescriptionCode
{
    public PrescriptionCode(string code, string name, string kind, string standardCode)
    {
        Code = code;
        Name = name;
        Kind = kind;
        StandardCode = standardCode;
    }

    public string Code { get; }

    public string Name { get; }

    /// <summary>drug · procedure · lab · other · unknown(원본 Classify).</summary>
    public string Kind { get; }

    public string StandardCode { get; }
}

/// <summary>비트 LA 신경차단술 코드 하나(원본 LaCatalogCode {code, name, active}).</summary>
public sealed class LaCode
{
    public LaCode(string code, string name, bool active)
    {
        Code = code;
        Name = name;
        Active = active;
    }

    public string Code { get; }

    public string Name { get; }

    public bool Active { get; }
}

/// <summary>
/// 병원 처방 목록 읽기(원본 PrescriptionCatalog·LaCatalog): 처방 마스터(SeeMst)만 읽는다(처방·내원·환자 표는 읽지 않는다).
/// 원본이 거절하던 것(모양 틀림·같은 코드의 다른 정의·한도 넘음·빈 목록)은 E-BIT-READ-FAILED.
/// </summary>
public static class CatalogRead
{
    public const int MaximumPrescriptions = 12000;
    public const int MaximumLa = 10000;

    private static readonly Regex LaCodeShape = new Regex("^LA[0-9][A-Z0-9_.-]{0,37}$");
    private static readonly Regex LaControl = new Regex("[\\x00-\\x1f\\x7f]");
    private static readonly Regex Spaces = new Regex("\\s+");

    /// <summary>원본 PrescriptionCatalog.Query: 오늘 유효한 병원 등록 처방코드.</summary>
    public static List<PrescriptionCode> Prescriptions(IBitDb db, DateTime today)
    {
        var args = new Dictionary<string, object?>(StringComparer.Ordinal) { ["@today"] = ClaimText.Day(today) };
        var rows = new List<PrescriptionCode>();
        var seen = new Dictionary<string, PrescriptionCode>(StringComparer.OrdinalIgnoreCase);
        foreach (var row in ReadOnlyGuard.Query(db, Sql.PrescriptionCatalogSql, args, Sql.PrescriptionCatalogTimeout))
        {
            string code = ClaimText.Cell(row, 0), name = ClaimText.Cell(row, 1), standard = ClaimText.Cell(row, 2);
            var kind = Classify(ClaimText.Cell(row, 3), ClaimText.Cell(row, 4), ClaimText.Cell(row, 5));
            // 원본 invalid_catalog
            if (!ValidCode(code, false) || !ValidCode(standard, true) || !ValidName(name)) throw Failed();
            if (seen.TryGetValue(code, out var previous))
            {
                // 원본 ambiguous_catalog: 겹치는 정의가 정렬 차례만으로 다른 약·시술을 고르면 안 된다
                if (previous.Code != code || previous.Name != name || previous.StandardCode != standard || previous.Kind != kind) throw Failed();
                continue;
            }
            if (rows.Count >= MaximumPrescriptions) throw Failed();
            var entry = new PrescriptionCode(code, name, kind, standard);
            seen.Add(code, entry);
            rows.Add(entry);
        }
        // 원본 empty_catalog
        if (rows.Count == 0) throw Failed();
        return rows;
    }

    /// <summary>원본 LaCatalog.Query: LA로 시작하는 코드마다 첫 줄(지금 유효한 것 먼저)만, 이름에 '신경'·'차단'이 함께 있는 것만.</summary>
    public static List<LaCode> La(IBitDb db, DateTime today)
    {
        var args = new Dictionary<string, object?>(StringComparer.Ordinal) { ["@today"] = ClaimText.Day(today), ["@prefix"] = Sql.LaPrefix };
        var rows = new List<LaCode>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var row in ReadOnlyGuard.Query(db, Sql.LaCatalogSql, args, Sql.LaCatalogTimeout))
        {
            var code = ClaimText.Cell(row, 0).ToUpperInvariant();
            var name = ClaimText.Cell(row, 1);
            if (!seen.Add(code)) continue;
            if (!LaCodeShape.IsMatch(code) || !ValidLaName(name)) throw Failed();
            if (!IsNerveBlockName(name)) continue;
            if (rows.Count >= MaximumLa) throw Failed();
            bool active;
            try
            {
                active = Convert.ToBoolean(ClaimText.Raw(row, 2), CultureInfo.InvariantCulture);
            }
            catch (Exception e) when (e is FormatException || e is InvalidCastException)
            {
                throw Failed();
            }
            rows.Add(new LaCode(code, name, active));
        }
        return rows;
    }

    /// <summary>원본 PrescriptionCatalog.Classify(SeeCodTyp·SeeCodDiv·SeeItmCod).</summary>
    public static string Classify(string codeType, string division, string item)
    {
        item ??= "";
        if (codeType == "S") return "other"; // 묶음 처방(세트)
        if (codeType != "I" && codeType != "P") return "unknown";
        // DtlMst CODTBL: 3 등재 약, 4 조제 성분, 5 일반 약
        if (division == "3" || division == "4" || division == "5") return "drug";
        if (division == "8") return "other"; // 치료 재료
        if (division != "1" && division != "2") return "unknown";
        if (item.Length != 6) return "unknown";
        var group = item.Substring(0, 2);
        if (group == "09") return "lab";
        if (group == "04" || group == "05" || group == "06" || group == "07" || group == "08") return "procedure";
        return "other";
    }

    private static bool ValidCode(string value, bool empty)
    {
        if (value == null || value != value.Trim() || value.Length > 40 || (!empty && value.Length == 0)) return false;
        if (value.Equals("__proto__", StringComparison.OrdinalIgnoreCase) || value.Equals("constructor", StringComparison.OrdinalIgnoreCase)
            || value.Equals("prototype", StringComparison.OrdinalIgnoreCase)) return false;
        foreach (var ch in value)
        {
            if (!char.IsLetter(ch) && !char.IsNumber(ch) && " ._+-*(),/".IndexOf(ch) < 0) return false;
        }
        return true;
    }

    private static bool ValidName(string value)
    {
        if (value == null || value != value.Trim() || value.Length > 120) return false;
        foreach (var ch in value)
        {
            if (char.IsControl(ch)) return false;
        }
        return true;
    }

    private static bool ValidLaName(string name) => name != null && name.Length <= 120 && name == name.Trim() && !LaControl.IsMatch(name);

    private static bool IsNerveBlockName(string name)
    {
        var compact = Spaces.Replace(name ?? "", "");
        return compact.Contains("신경") && compact.Contains("차단");
    }

    private static BitException Failed() => new BitException(BitErrors.ReadFailed);
}
