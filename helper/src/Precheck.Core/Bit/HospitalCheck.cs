using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using Precheck.Core.Registration;

namespace Precheck.Core.Bit;

/// <summary>
/// 병원 확인(AC-005.4·AC-005.6). 원본 HospitalSecurity의 ValidateScope·ValidateInstitutionNumbers·VerifyInstitutionNumber·
/// Authorize(범위 읽기)·VerifyCurrentInstitution 규칙 그대로. 막히면 BitException(E-BIT-HOSPITAL-MISMATCH).
/// 병원 메타(범위·기관기호)만 읽고 환자·보고 표는 읽지 않는다. 성공을 기억해 두지 않는다(매번 다시 읽는다).
/// </summary>
public static class HospitalCheck
{
    private static readonly Regex EightDigits = new Regex(@"^[0-9]{8}\z", RegexOptions.CultureInvariant);

    private static readonly IReadOnlyDictionary<string, object?> NoArgs = new Dictionary<string, object?>();

    /// <summary>원본 ValidateScope: 범위 줄이 정확히 하나이고 비어 있지 않으며 (뒤 공백을 지우면) 등록한 범위와 같다.</summary>
    public static void ValidateScope(IEnumerable<string?> rows, string expected)
    {
        var values = (rows ?? Enumerable.Empty<string?>()).ToArray();
        if (values.Length != 1 || string.IsNullOrWhiteSpace(values[0]) || values[0]!.Trim() != expected) throw Mismatch();
    }

    /// <summary>원본 ValidateInstitutionNumbers: 등록 기관기호가 8자리 숫자이고, 줄이 하나 이상이며, 모든 줄이 8자리 숫자로 그것과 같다.</summary>
    public static void ValidateInstitutionNumbers(IEnumerable<string?> rows, string expected)
    {
        var values = (rows ?? Enumerable.Empty<string?>()).ToArray();
        if (!EightDigits.IsMatch(expected ?? "") || values.Length == 0 ||
            values.Any(value => value == null || !EightDigits.IsMatch(value.Trim()) || value.Trim() != expected))
        {
            throw Mismatch();
        }
    }

    /// <summary>
    /// 원본 Authorize 앞부분: 비트 로그인 사용자(8자 이하)·작업일(yyyyMMdd)로 그 사용자의 병원 범위를 읽는다. 정확히 하나여야 한다.
    /// </summary>
    public static string ReadUserScope(IBitDb db, VendorUser user)
    {
        if (user == null || string.IsNullOrWhiteSpace(user.UserId) || user.UserId.Length > 8 || !TryDay(user.WorkDate, out _)) throw Mismatch();
        var rows = ReadOnlyGuard.Query(db, Sql.UserScopeSql, Args(("@user", user.UserId), ("@workDate", user.WorkDate)), Sql.MetaTimeout);
        var scopes = new HashSet<string>(StringComparer.Ordinal);
        foreach (var row in rows) scopes.Add((First(row) ?? "").Trim());
        if (scopes.Count != 1 || string.IsNullOrWhiteSpace(scopes.First())) throw Mismatch();
        return scopes.First();
    }

    /// <summary>처음 등록: 그날 그 범위의 기관기호. 줄이 모두 같은 8자리 숫자 하나일 때만 그것을 준다.</summary>
    public static string ReadInstitutionCode(IBitDb db, string scope, DateTime day)
    {
        var numbers = ReadInstitutionNumbers(db, scope, day);
        var first = numbers.FirstOrDefault()?.Trim() ?? "";
        ValidateInstitutionNumbers(numbers, first);
        return first;
    }

    /// <summary>원본 VerifyInstitutionNumber: 그날 그 범위의 기관기호가 모두 expected와 같다.</summary>
    public static void VerifyInstitutionNumber(IBitDb db, string scope, DateTime day, string expected) =>
        ValidateInstitutionNumbers(ReadInstitutionNumbers(db, scope, day), expected);

    /// <summary>DB 안의 병원 범위가 scope 하나뿐이다(다른 병원 자료가 섞인 DB에서는 쓰지 않는다).</summary>
    public static void VerifyOnlyScope(IBitDb db, string scope)
    {
        var rows = ReadOnlyGuard.Query(db, Sql.ScopesSql, NoArgs, Sql.MetaTimeout);
        ValidateScope(rows.Select(First), scope);
    }

    /// <summary>
    /// 원본 VerifyCurrentInstitution(AC-005.6): 등록이 없으면 E-BIT-NOT-REGISTERED. 설치 위치·서버·DB 이름이 등록과 다르면
    /// 읽기 전에 E-BIT-HOSPITAL-MISMATCH. 그다음 DB 안 범위가 등록 범위 하나뿐인지, 오늘 날짜의 기관기호가 등록과 같은지 다시 읽는다.
    /// </summary>
    public static void VerifyCurrent(IBitSession session, HospitalRegistration? registration, DateTime today)
    {
        if (session == null) throw new ArgumentNullException(nameof(session));
        if (registration == null) throw new BitException(BitErrors.NotRegistered);
        var target = session.Target;
        if (!WinPath.Same(registration.InstallPath, target.InstallPath) ||
            !string.Equals(registration.Server, target.Server, StringComparison.OrdinalIgnoreCase) ||
            !string.Equals(registration.Database, target.Database, StringComparison.OrdinalIgnoreCase))
        {
            throw Mismatch();
        }
        VerifyOnlyScope(session, registration.Scope);
        VerifyInstitutionNumber(session, registration.Scope, today, registration.InstitutionCode);
    }

    /// <summary>
    /// 원본 TreatmentUsage.IdentitySql 확인(RxHistory·ClaimMemoHistory·RxDiagnosisTrend가 자료 전에 돌림): 조회 기간(first~last)에
    /// 등록 범위의 기관기호가 등록한 것인 줄이 하나 이상이고 다른 기관기호 줄이 없어야 한다. 아니면 E-BIT-HOSPITAL-MISMATCH.
    /// </summary>
    public static void VerifyPeriod(IBitDb db, HospitalRegistration registration, DateTime first, DateTime last)
    {
        if (registration == null) throw new BitException(BitErrors.NotRegistered);
        var rows = ReadOnlyGuard.Query(db, Sql.PeriodIdentitySql, Args(
            ("@scope", registration.Scope), ("@institution", registration.InstitutionCode), ("@firstDay", Day(first)), ("@lastDay", Day(last))), Sql.MetaTimeout);
        var row = rows.FirstOrDefault();
        if (row == null || row.Count < 2 || Count(row[0]) < 1 || Count(row[1]) != 0) throw Mismatch();
    }

    private static long Count(object? value)
    {
        try
        {
            return value == null ? -1 : Convert.ToInt64(value, CultureInfo.InvariantCulture);
        }
        catch (Exception e) when (e is FormatException || e is InvalidCastException || e is OverflowException)
        {
            return -1;
        }
    }

    /// <summary>yyyyMMdd 글자(원본 작업일 모양).</summary>
    public static string Day(DateTime day) => day.ToString("yyyyMMdd", CultureInfo.InvariantCulture);

    internal static bool TryDay(string? text, out DateTime day) =>
        DateTime.TryParseExact(text ?? "", "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out day);

    private static List<string?> ReadInstitutionNumbers(IBitDb db, string scope, DateTime day)
    {
        var rows = ReadOnlyGuard.Query(db, Sql.InstitutionSql, Args(("@scope", scope), ("@day", Day(day))), Sql.MetaTimeout);
        return rows.Select(First).ToList();
    }

    private static string? First(IReadOnlyList<object?> row)
    {
        var value = row != null && row.Count > 0 ? row[0] : null;
        return value == null ? null : Convert.ToString(value, CultureInfo.InvariantCulture);
    }

    private static IReadOnlyDictionary<string, object?> Args(params (string Name, object? Value)[] pairs)
    {
        var args = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var pair in pairs) args[pair.Name] = pair.Value;
        return args;
    }

    private static BitException Mismatch() => new BitException(BitErrors.HospitalMismatch);
}
