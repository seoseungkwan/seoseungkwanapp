using System;
using System.Linq;
using System.Text.RegularExpressions;

namespace Precheck.Core.Registration;

/// <summary>
/// 이 PC에 등록한 병원(registration.dat, AC-005.5). 값은 모두 도우미가 비트에서 읽은 것이다.
/// 병원 이름은 없다(AC-005.9): 원본 비트 읽기에 병원 이름 SQL이 없고, 화면은 사이트가 가진 병원 이름을 쓴다.
/// ProfileId는 등록할 때 만든 무작위 32자리 16진수: 작업 저장 파일이 같은 병원 것인지 이것으로 본다(TASK-15, AC-015.4).
/// </summary>
public sealed class HospitalRegistration
{
    /// <summary>칸 하나의 최대 길이(경로 260자 안).</summary>
    public const int MaxFieldLength = 260;

    private static readonly Regex InstitutionShape = new Regex(@"^[0-9]{8}\z", RegexOptions.CultureInvariant);
    private static readonly Regex ProfileShape = new Regex(@"^[0-9a-f]{32}\z", RegexOptions.CultureInvariant);

    public HospitalRegistration(string institutionCode, string scope, string installPath, string server, string database, string profileId)
    {
        InstitutionCode = institutionCode ?? "";
        Scope = scope ?? "";
        InstallPath = installPath ?? "";
        Server = server ?? "";
        Database = database ?? "";
        ProfileId = profileId ?? "";
    }

    /// <summary>요양기관기호(8자리 숫자). 서버에 올리지 않는다. 화면·확인 창은 뒤 4자리를 가린다.</summary>
    public string InstitutionCode { get; }

    /// <summary>비트 병원 범위(DepMst.DepHspNum = HspMst.HspCod).</summary>
    public string Scope { get; }

    /// <summary>비트 설치 위치(C:\DrBIT50).</summary>
    public string InstallPath { get; }

    /// <summary>비트 DB 서버 이름(접속 정보의 Data Source).</summary>
    public string Server { get; }

    /// <summary>비트 DB 이름(Initial Catalog).</summary>
    public string Database { get; }

    public string ProfileId { get; }

    /// <summary>모든 칸이 차 있고(공백만 아님, 길이 안), 기관기호 8자리 숫자, 프로필 ID 32자리 16진수.</summary>
    public bool IsValid =>
        new[] { Scope, InstallPath, Server, Database }.All(Filled) &&
        InstitutionShape.IsMatch(InstitutionCode) && ProfileShape.IsMatch(ProfileId);

    private static bool Filled(string value) =>
        !string.IsNullOrWhiteSpace(value) && value.Length <= MaxFieldLength && value.All(c => !char.IsControl(c));
}
