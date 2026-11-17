using System.Linq;
using Precheck.Core.Reception;
using Xunit;

// 이 TASK의 시험만 한 거르기로 돌리려고 ArrangeFill 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.ArrangeFill;

/// <summary>
/// 확인 결과로 채운 지도(spec reception-arrange REQ-3311, TASK-12). 근거는 4회차 의원 PC 보고서(2026-11-09 14:00, build=0.4.0+check5,
/// docs/reception/check-result.md)의 arrangeCode·arrangePart 줄과 그 보고서를 본 사용자 결정(2026-11-09)이다.
/// AC-3311.1 X-RAY 규칙은 보고서 근거로 채우고(Unconfirmed 없음), 부위 칸은 근거가 없어 null로 둔다.
/// AC-3311.2 채운 지도는 Validate 문제가 없고, 보고서 코드 표 가운데 칸에 드는 코드·안 드는 코드를 이 표로 고정한다.
/// </summary>
public class ArrangeFillTests
{
    /// <summary>보고서 코드 표의 G 촬영 코드(이름이 '부위 N매') 38개. G0400(C-Arm형 영상증폭장치이용료)은 촬영이 아니라 뺀다.</summary>
    public static TheoryData<string, string> XrayCodes => new TheoryData<string, string>
    {
        { "G4302", "흉추2매" }, { "G7504", "족골4매" }, { "G3304", "견관절4매" }, { "G5101", "골반1매" },
        { "G7403", "족관절3매" }, { "G4102", "경추2매" }, { "G5601", "하지1매" }, { "G7204", "슬관절4매" },
        { "G4504", "요추4매" }, { "G7701", "슬개골1매" }, { "G6102", "전박골2매" }, { "G6604", "수근골4매" },
        { "G8102", "수지골2매" }, { "G6404", "수관절4매" }, { "G4502", "요추2매" }, { "G3503", "늑골3매" },
        { "G8202", "족지골2매" }, { "G4902007", "전척추2매" }, { "G4104", "경추4매" }, { "G2101", "흉부1매" },
        { "G4304", "흉추4매" }, { "G6204", "주관절4매" }, { "G6401", "수관절1매" }, { "G6602", "수근골2매" },
        { "G5202", "고관절2매" }, { "G5204", "고관절4매" }, { "G5105", "골반5매 또는 그 이상" }, { "G6302", "상박골2매" },
        { "G7304", "하퇴골4매" }, { "G4702", "천골미골2매" }, { "G7502", "족골2매" }, { "G3402", "흉골2매" },
        { "G7102", "대퇴골2매" }, { "G1104", "두부4매" }, { "G3104", "쇄골4매" }, { "G6202", "주관절2매" },
        { "G7201", "슬관절1매" }, { "G7302", "하퇴골2매" },
    };

    [Fact(DisplayName = "AC-3311.2 X-RAY 시험 표는 보고서의 G 촬영 코드 38개다(겹침 없음)")]
    public void XrayTableSize()
    {
        var codes = XrayCodes.Select(row => (string)row[0]).ToArray();
        Assert.Equal(38, codes.Length);
        Assert.Equal(codes.Length, codes.Distinct().Count());
    }

    [Theory(DisplayName = "AC-3311.2 보고서의 G 촬영 코드(부위 N매)는 모두 X-RAY 칸이다(코드만으로도, 이름과 함께도)")]
    [MemberData(nameof(XrayCodes))]
    public void XrayFromReport(string code, string name)
    {
        Assert.Equal(ArrangeKeys.Xray, ArrangeMap.Match(code, null));
        Assert.Equal(ArrangeKeys.Xray, ArrangeMap.Match(code, name));
    }

    [Theory(DisplayName = "AC-3311.2 초음파(SONO1·SONO·EB422·EB466)와 관절조영(HA280)은 SONO 칸이다(사용자 결정 2026-11-09)")]
    [InlineData("SONO1", "비급여초음파")]
    [InlineData("SONO", null)]
    [InlineData("EB422", "흉부-흉벽/ 흉막/ 늑골 등 초음파")]
    [InlineData("EB466", "근골격/ 연부-관절 초음파-견관절(편측)")]
    [InlineData("HA280", "관절조영")]
    public void SonoFromReport(string code, string? name)
    {
        Assert.Equal(ArrangeKeys.Sono, ArrangeMap.Match(code, name));
    }

    [Theory(DisplayName = "AC-3311.2 CARM1(c-arm가이드)과 G0400(C-Arm형 영상증폭장치이용료)은 C-ARM 칸이다(G0400은 X-RAY가 아니다, 사용자 결정 2026-11-09)")]
    [InlineData("CARM1", "c-arm가이드")]
    [InlineData("G0400", "C-Arm형 영상증폭장치이용료")]
    public void CarmFromReport(string code, string name)
    {
        Assert.Equal(ArrangeKeys.Carm, ArrangeMap.Match(code, name));
    }

    [Theory(DisplayName = "AC-3311.2 보고서의 다른 처방(진찰·주사·차단술·물리치료·도수·충격파·견인·부목·검사·약)은 어느 칸에도 들지 않는다")]
    [InlineData("AA254", "재진진찰료-의과의원보건의료원내의과")]
    [InlineData("A30", "리포라제주")]
    [InlineData("MM085", "재활저출력레이저치료 [1일당]")]
    [InlineData("LA358", "척수신경총  신경근 및 신경절차단술-후지내측지")]
    [InlineData("MM015", "표층열치료(심층열동시)")]
    [InlineData("MM020", "심층열치료 [1일당]")]
    [InlineData("MM080", "간섭파전류치료")]
    [InlineData("CRYO", "신장분사치료")]
    [InlineData("KK090", "관절강내 주사")]
    [InlineData("MM011", "한냉치료-콜드팩")]
    [InlineData("도수", "도수치료 [1일당] - 의원")]
    [InlineData("MA4", "도수치료(30분)")]
    [InlineData("MM051", "간헐적 견인치료- 경추경인")]
    [InlineData("MM052", "간헐적 견인치료- 골반견인")]
    [InlineData("PROLO", "증식치료(사지관절부위)")]
    [InlineData("ESWT10", "체외충격파(3000타)")]
    [InlineData("ESWT7", "체외충격파(2000타)")]
    [InlineData("T6154", "부목-단하지[하퇴로부터 족부까지]")]
    [InlineData("D48", "STARFIX LIGHT (SHORT LEG)")]
    [InlineData("D0113", "C-반응성단백-[정밀면역검사](정량)")]
    [InlineData("N0645", "사지골절도수정복술(중수골 중족골 지골)")]
    [InlineData("JA", "자기장치료")]
    [InlineData("CD", "cd복사")]
    [InlineData("MS11", "MS11")]
    [InlineData("342", "보나링에이정")]
    public void OthersGoNowhere(string code, string name)
    {
        Assert.Null(ArrangeMap.Match(code, name));
    }

    [Theory(DisplayName = "AC-3311.2 X-RAY 규칙은 G 뒤 숫자 4자리(1~8로 시작) 또는 7자리만이다(G0····, 다른 자리 수, 앞뒤 글자는 아님)")]
    [InlineData("G0400")]
    [InlineData("G0101")]
    [InlineData("G9101")]
    [InlineData("G430")]
    [InlineData("G43021")]
    [InlineData("G490200")]
    [InlineData("G49020071")]
    [InlineData("XG4302")]
    [InlineData("G4302A")]
    public void XrayPatternEdges(string code)
    {
        Assert.NotEqual(ArrangeKeys.Xray, ArrangeMap.Match(code, null));
    }

    [Fact(DisplayName = "AC-3311.1 X-RAY 규칙을 보고서 근거로 채워 확인 안 된 칸(Unconfirmed)이 없고, 부위 칸(PartColumn)은 근거가 없어 null이다")]
    public void FilledLists()
    {
        Assert.Empty(ArrangeMap.Unconfirmed);
        // 보고서 arrangePart(SONO1·CARM1 줄 1149개): 값이 여럿인 글자 칸은 번호·시각·코드·사용자 칸뿐이고 부위로 볼 칸이 없다
        Assert.Null(ArrangeMap.PartColumn);
    }

    [Fact(DisplayName = "AC-3311.2 채운 지도는 Validate(Rules, Unconfirmed)로 문제가 없다")]
    public void FilledMapHasNoProblems()
    {
        Assert.Empty(ArrangeMap.Validate(ArrangeMap.Rules, ArrangeMap.Unconfirmed));
    }
}
