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
/// TASK-43(AC-005.13, 원본과 다름): 처음 등록·매번 확인은 ReadScopes·ReadCodes(빈 범위·8자리 아닌 기관기호 줄은 뺌)로,
/// 통계 화면 확인은 UserScopeOrNull로 본다. 원본 검사 함수(ValidateScope 등)는 원본 시험 사례(AC-005.4) 그대로 둔다.
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
        if (!LoginShapeOk(user)) throw Mismatch();
        var rows = ReadOnlyGuard.Query(db, Sql.UserScopeSql, Args(("@user", user.UserId), ("@workDate", user.WorkDate)), Sql.MetaTimeout);
        var scopes = new HashSet<string>(StringComparer.Ordinal);
        foreach (var row in rows) scopes.Add((First(row) ?? "").Trim());
        if (scopes.Count != 1 || string.IsNullOrWhiteSpace(scopes.First())) throw Mismatch();
        return scopes.First();
    }

    /// <summary>로그인 창이 준 값 모양: 사용자 ID 1~8자, 작업일 yyyyMMdd(원본 Authorize 앞부분).</summary>
    public static bool LoginShapeOk(VendorUser? user) =>
        user != null && !string.IsNullOrWhiteSpace(user.UserId) && user.UserId.Length <= 8 && TryDay(user.WorkDate, out _);

    /// <summary>
    /// 통계 화면 확인(AC-005.13): 로그인한 계정의 그날 범위를 하나로 읽으면 그것, 아니면 null —
    /// 계정·작업일 모양이 틀리면 읽지 않고 null, 빈 값을 빼고 없거나 둘 이상이어도 null.
    /// </summary>
    public static string? UserScopeOrNull(IBitDb db, VendorUser user)
    {
        if (!LoginShapeOk(user)) return null;
        var rows = ReadOnlyGuard.Query(db, Sql.UserScopeSql, Args(("@user", user.UserId), ("@workDate", user.WorkDate)), Sql.MetaTimeout);
        var scopes = Filled(rows.Select(First));
        return scopes.Count == 1 ? scopes[0] : null;
    }

    /// <summary>처음 등록에서 범위가 여럿일 때 최근 내원을 세는 날 수(AC-005.18).</summary>
    public const int RecentDays = 30;

    /// <summary>
    /// 최근 내원이 있는 범위(AC-005.18): 오늘 RecentDays일 전 0시 ~ 다음 날 0시의 외래·접수 취소 아님 내원이 1건 이상인 범위.
    /// 빈 값·NULL을 빼고 뒤 공백을 지운 서로 다른 값.
    /// </summary>
    public static IReadOnlyList<string> ReadActiveScopes(IBitDb db, DateTime today)
    {
        var day = today.Date;
        var rows = ReadOnlyGuard.Query(db, Sql.ActiveScopesSql,
            Args(("@from", Day(day.AddDays(-RecentDays)) + "0000"), ("@to", Day(day.AddDays(1)) + "0000")), Sql.MemoTimeout);
        return Filled(rows.Where(row => row != null && row.Count > 1 && Count(row[1]) > 0).Select(First));
    }

    /// <summary>
    /// DB 안 범위가 여럿일 때 처음 등록할 범위(AC-005.18): ① 로그인 계정의 범위가 DB 안에 있으면 그것(최근 내원은 읽지 않음)
    /// ② 아니면 최근 내원이 있는 범위 가운데 DB 안에 있는 것이 하나면 그것 ③ 못 정하면 null.
    /// </summary>
    public static string? ChooseScope(IBitDb db, IReadOnlyList<string> scopes, VendorUser user, DateTime today)
    {
        if (scopes == null) throw new ArgumentNullException(nameof(scopes));
        var mine = UserScopeOrNull(db, user);
        if (mine != null && scopes.Contains(mine, StringComparer.Ordinal)) return mine;
        var active = ReadActiveScopes(db, today).Where(scope => scopes.Contains(scope, StringComparer.Ordinal)).ToList();
        return active.Count == 1 ? active[0] : null;
    }

    /// <summary>DB 안 병원 범위: 빈 값·NULL을 빼고 뒤 공백을 지운 서로 다른 값(AC-005.13). TASK-46부터 여럿이어도 등록 범위가 들어 있으면 된다(AC-005.18).</summary>
    public static IReadOnlyList<string> ReadScopes(IBitDb db) =>
        Filled(ReadOnlyGuard.Query(db, Sql.ScopesSql, NoArgs, Sql.MetaTimeout).Select(First));

    /// <summary>그날 그 범위의 기관기호 가운데 8자리 숫자인 것만, 뒤 공백을 지운 서로 다른 값(AC-005.13).</summary>
    public static IReadOnlyList<string> ReadCodes(IBitDb db, string scope, DateTime day) =>
        Filled(ReadInstitutionNumbers(db, scope, day)).Where(value => EightDigits.IsMatch(value)).ToList();

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
    /// 읽기 전에 E-BIT-HOSPITAL-MISMATCH. 그다음 DB 안 범위에 등록 범위가 들어 있는지(TASK-46부터, 다른 범위가 함께 있어도 됨 — AC-005.18),
/// 오늘 날짜의 기관기호가 등록과 같은지 다시 읽는다.
    /// 처음 등록과 같은 기준이다(AC-005.13): 빈 범위 줄과 8자리 아닌 기관기호 줄은 빼고 본다.
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
        // 다른 범위가 함께 있어도 등록 범위가 들어 있으면 통과한다(AC-005.18). 자료 SQL은 모두 등록 범위로 거른다
        if (!ReadScopes(session).Contains(registration.Scope, StringComparer.Ordinal)) throw Mismatch();
        if (registration.InstitutionCode.Length == 0) return; // 못 찾은 등록은 번호를 보지 않는다(AC-005.13)
        var codes = ReadCodes(session, registration.Scope, today);
        if (codes.Count != 1 || codes[0] != registration.InstitutionCode) throw Mismatch();
    }

    // 원본 TreatmentUsage.IdentitySql(기간 기관기호 확인, Sql.PeriodIdentitySql)은 TASK-43부터 부르지 않는다(AC-005.15):
    // 자료는 그 PC 비트에서 바로 읽고, 같은 의원인지는 매번 확인(VerifyCurrent)이 본다.

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

    /// <summary>빈 값·NULL을 빼고 뒤 공백을 지운 서로 다른 값(처음 나온 차례).</summary>
    private static List<string> Filled(IEnumerable<string?> values) =>
        values.Select(value => (value ?? "").Trim()).Where(value => value.Length > 0).Distinct(StringComparer.Ordinal).ToList();

    private static long Count(object? value)
    {
        if (value == null || value is DBNull) return 0;
        try
        {
            return Convert.ToInt64(value, CultureInfo.InvariantCulture);
        }
        catch (Exception e) when (e is FormatException || e is InvalidCastException || e is OverflowException)
        {
            return 0;
        }
    }

    private static BitException Mismatch() => new BitException(BitErrors.HospitalMismatch);
}
