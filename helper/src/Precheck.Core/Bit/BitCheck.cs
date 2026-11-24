using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;
using Precheck.Core.Protocol;
using Precheck.Core.Registration;

namespace Precheck.Core.Bit;

/// <summary>bit.check 단계 하나 {name, ok, code?}. 성공한 단계에는 code 칸이 없다.</summary>
public sealed class BitCheckStep
{
    public BitCheckStep(string name, bool ok, string? code)
    {
        Name = name;
        Ok = ok;
        Code = code;
    }

    [JsonPropertyName("name")]
    public string Name { get; }

    [JsonPropertyName("ok")]
    public bool Ok { get; }

    [JsonPropertyName("code")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Code { get; }
}

/// <summary>bit.check 답 {steps, registered, institutionCode?} (design.md 4-3). 병원 이름은 주지 않는다(AC-005.9).</summary>
public sealed class BitCheckResult
{
    public BitCheckResult(IReadOnlyList<BitCheckStep> steps, HospitalRegistration? registration)
    {
        Steps = steps;
        Registered = registration != null;
        InstitutionCode = string.IsNullOrEmpty(registration?.InstitutionCode) ? null : registration!.InstitutionCode; // 못 찾은 등록은 칸을 주지 않는다(AC-005.15)
    }

    [JsonPropertyName("steps")]
    public IReadOnlyList<BitCheckStep> Steps { get; }

    /// <summary>이 PC에 읽을 수 있는 등록 파일이 있는가(비트 병원과 같은지는 registration 단계가 말한다).</summary>
    [JsonPropertyName("registered")]
    public bool Registered { get; }

    /// <summary>등록한 기관기호 8자리. 웹 화면이 뒤 4자리를 가리고, 서버에 올리지 않는다.</summary>
    [JsonPropertyName("institutionCode")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? InstitutionCode { get; }
}

/// <summary>
/// bit.check(AC-005.7): find(비트 찾기) → db(DB 열고 병원 범위 읽기) → registration(등록 병원인지, AC-005.6과 같은 확인).
/// 실패한 단계부터 뒤는 모두 ok:false와 그 번호. 등록 파일이 있으면 기관기호를 함께 준다.
/// 등록 파일이 깨지고 .bak도 못 쓰면 registered:false, registration 단계는 E-STORE-BROKEN(AC-005.12).
/// </summary>
public static class BitCheck
{
    public const string FindStep = "find";
    public const string DbStep = "db";
    public const string RegistrationStep = "registration";

    private static readonly IReadOnlyDictionary<string, object?> NoArgs = new Dictionary<string, object?>();

    public static BitCheckResult Run(BitServices services)
    {
        if (services == null) throw new ArgumentNullException(nameof(services));

        HospitalRegistration? registration = null;
        string? storeFailed = null;
        try
        {
            registration = services.Store.Load();
        }
        catch (HelperException e)
        {
            storeFailed = e.Code;
        }

        var steps = new List<BitCheckStep>();
        var root = "";
        IBitSession? session = null;
        try
        {
            var failed = Step(steps, FindStep, null, () => root = services.Locator.Find());
            failed = Step(steps, DbStep, failed, () =>
            {
                session = services.Connector.Open(root);
                ReadOnlyGuard.Query(session, Sql.ScopesSql, NoArgs, Sql.MetaTimeout);
            });
            Step(steps, RegistrationStep, failed, () =>
            {
                if (storeFailed != null) throw new BitException(storeFailed);
                HospitalCheck.VerifyCurrent(session!, registration, services.Today().Date);
            });
        }
        finally
        {
            session?.Dispose();
        }
        return new BitCheckResult(steps, registration);
    }

    /// <summary>앞 단계가 실패했으면 그 번호로 실패, 아니면 해 보고 HelperException 번호로 실패. 다음 단계에 넘길 실패 번호를 준다.</summary>
    private static string? Step(List<BitCheckStep> steps, string name, string? failed, Action action)
    {
        if (failed != null)
        {
            steps.Add(new BitCheckStep(name, false, failed));
            return failed;
        }
        try
        {
            action();
        }
        catch (HelperException e)
        {
            steps.Add(new BitCheckStep(name, false, e.Code));
            return e.Code;
        }
        steps.Add(new BitCheckStep(name, true, null));
        return null;
    }
}
