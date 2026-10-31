using System;
using System.Text;

namespace Precheck.Core.Registration;

/// <summary>
/// 처음 등록·다시 등록 PC 확인 창의 글(AC-005.5, design.md 9-1). 도우미가 비트에서 읽은 등록 값으로만 만든다
/// (bit.register는 웹에서 받는 칸이 없다). 기관기호는 뒤 4자리를 가린다. 병원 이름 줄은 없다(AC-005.9):
/// 첫 값 줄은 가린 기관기호, 그 뒤 범위·설치 위치·DB. 범위 값을 이름 자리에 넣지 않는다.
/// </summary>
public static class RegisterPrompt
{
    private const string NewLine = "\r\n";

    public static string Build(HospitalRegistration registration, HospitalRegistration? previous = null)
    {
        if (registration == null) throw new ArgumentNullException(nameof(registration));
        var text = new StringBuilder();
        if (previous == null)
        {
            text.Append("이 병원으로 등록할까요?").Append(NewLine).Append(NewLine);
            AppendHospital(text, registration, "");
            text.Append(NewLine)
                .Append("[확인]을 누르면 이 PC에 등록합니다. 등록한 뒤 비트의 병원·설치 위치·서버·DB가 바뀌면 읽기와 입력을 멈춥니다.");
            return text.ToString();
        }

        text.Append("이 병원으로 다시 등록할까요?").Append(NewLine).Append(NewLine);
        text.Append("지금 등록").Append(NewLine);
        AppendHospital(text, previous, "  ");
        text.Append(NewLine).Append("새로 등록").Append(NewLine);
        AppendHospital(text, registration, "  ");
        text.Append(NewLine)
            .Append(string.Equals(previous.InstitutionCode, registration.InstitutionCode, StringComparison.Ordinal)
                ? "기관기호가 같아 하던 작업을 이어서 씁니다."
                : "기관기호가 달라 전 병원의 작업은 읽지 않습니다.")
            .Append(NewLine)
            .Append("[확인]을 누르면 지금 등록을 바꿔 씁니다.");
        return text.ToString();
    }

    /// <summary>기관기호 앞 4자리만 보이고 나머지는 *로(12345678 → 1234****).</summary>
    public static string MaskInstitution(string code)
    {
        var value = code ?? "";
        return value.Length <= 4 ? new string('*', 4) : value.Substring(0, 4) + new string('*', value.Length - 4);
    }

    private static void AppendHospital(StringBuilder text, HospitalRegistration registration, string indent)
    {
        text.Append(indent).Append("기관기호 ").Append(MaskInstitution(registration.InstitutionCode)).Append(NewLine);
        text.Append(indent).Append("비트 병원 범위: ").Append(registration.Scope).Append(NewLine);
        text.Append(indent).Append("비트 설치 위치: ").Append(registration.InstallPath).Append(NewLine);
        text.Append(indent).Append("비트 DB: ").Append(registration.Server).Append(" / ").Append(registration.Database).Append(NewLine);
    }
}
