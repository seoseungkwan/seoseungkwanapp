using System;
using System.Linq;
using Precheck.Core.DocPrint;
using Precheck.Core.PtSlip;
using Xunit;

namespace Precheck.Core.Tests.DocPrint.Base;

/// <summary>
/// spec doc-print REQ-7401(설정): 서류 4종 이름·차례, 서류 프린터·묶음 기본값, 묶음 규칙, 설정 글(JSON).
/// 파일 읽기·쓰기는 윈도우 층(DocFiles)이 하고 여기서는 글 ↔ 설정만 본다. PT 종이 설정(settings.json)과는 따로다.
/// </summary>
public class DocSettingsTests
{
    private const string DefaultJson = "{\"printer\":\"\",\"bundles\":[{\"name\":\"실손보험용\",\"kinds\":[\"receipt\",\"detail\"]}]}";

    private static DocBundle Bundle(string name, params DocKind[] kinds) => new DocBundle(name, kinds);

    private static void AssertDefaults(DocSettings settings)
    {
        Assert.Equal("", settings.PrinterName);
        var bundle = Assert.Single(settings.Bundles);
        Assert.Equal("실손보험용", bundle.Name);
        Assert.Equal(new[] { DocKind.Receipt, DocKind.Detail }, bundle.Kinds);
    }

    // ── AC-7401.1 기본값 ─────────────────────────────

    [Fact(DisplayName = "AC-7401.1 서류 4종 이름과 차례: 진료비 영수증 → 진료비 세부내역서 → 처방전 사본 → 진료기록부")]
    public void KindNamesInPrintOrder()
    {
        Assert.Equal(new[] { DocKind.Receipt, DocKind.Detail, DocKind.RxCopy, DocKind.Chart }, DocNames.All);
        Assert.Equal(new[] { "진료비 영수증", "진료비 세부내역서", "처방전 사본", "진료기록부" }, DocNames.All.Select(DocNames.Of).ToArray());
        Assert.Equal(DocKind.RxCopy, DocNames.Find("처방전 사본"));
        Assert.Equal(DocKind.Chart, DocNames.Find("진료기록부"));
        Assert.Null(DocNames.Find("통원확인서"));
        Assert.Null(DocNames.Find(" 진료기록부"));
        Assert.Null(DocNames.Find(null));
        Assert.Throws<ArgumentOutOfRangeException>(() => DocNames.Of((DocKind)99));
    }

    [Fact(DisplayName = "AC-7401.1 설정 없음: 서류 프린터 빈칸(=윈도우 기본 프린터), 묶음 실손보험용 = [진료비 영수증, 진료비 세부내역서] 하나")]
    public void DefaultsWhenNoFile()
    {
        AssertDefaults(DocSettings.Defaults);
        AssertDefaults(DocSettingsRules.FromJson(null));
        AssertDefaults(DocSettingsRules.FromJson(""));
        AssertDefaults(DocSettingsRules.FromJson("  \r\n "));
        Assert.True(DocSettingsRules.Check(DocSettings.Defaults.Bundles).Ok);
        Assert.Equal(DefaultJson, DocSettingsRules.ToJson(DocSettings.Defaults));
    }

    [Fact(DisplayName = "AC-7401.1 PT 종이 설정 값은 그대로: 서류 설정 글은 PT 종이 설정으로 읽히지 않고, PT 종이 설정 글은 서류 설정으로 읽히지 않는다")]
    public void PtSlipSettingsStaySeparate()
    {
        var slip = new SlipSettings(new[] { "HP", "도수" }, new[] { "목" }, "BIXOLON SRP-350III", 80, 20);
        var slipJson = SlipSettingsRules.ToJson(slip);
        var docJson = DocSettingsRules.ToJson(new DocSettings("가상 프린터", new[] { Bundle("묶음1", DocKind.Chart) }));

        var slipBack = SlipSettingsRules.FromJson(slipJson);
        Assert.Equal(slip.Items, slipBack.Items);
        Assert.Equal("BIXOLON SRP-350III", slipBack.PrinterName);
        Assert.Equal(80, slipBack.PaperLengthMm);
        Assert.Equal(20, slipBack.ButtonOffsetPx);

        Assert.Equal(SlipSettings.Defaults.Items, SlipSettingsRules.FromJson(docJson).Items);
        Assert.Equal("", SlipSettingsRules.FromJson(docJson).PrinterName);
        AssertDefaults(DocSettingsRules.FromJson(slipJson));
    }

    // ── AC-7401.2 묶음 규칙 ─────────────────────────────

    [Fact(DisplayName = "AC-7401.2 묶음: 이름 앞뒤 빈칸을 빼고, 서류는 겹침 없이 서류 차례(영수증 → 세부내역서 → 처방전 → 진료기록부)로")]
    public void BundleIsNormalized()
    {
        var bundle = Bundle(" 실손 ", DocKind.Chart, DocKind.Receipt, DocKind.Chart, (DocKind)42);
        Assert.Equal(" 실손 ", bundle.Name);
        Assert.Equal(new[] { DocKind.Receipt, DocKind.Chart }, bundle.Kinds);

        var check = DocSettingsRules.Check(new[] { bundle, Bundle("\t처방\t", DocKind.RxCopy) });
        Assert.True(check.Ok, check.Error);
        Assert.Equal("", check.Error);
        Assert.Equal(new[] { "실손", "처방" }, check.Bundles.Select(b => b.Name).ToArray());
        Assert.Equal(new[] { DocKind.Receipt, DocKind.Chart }, check.Bundles[0].Kinds);
        Assert.Equal(new[] { DocKind.RxCopy }, check.Bundles[1].Kinds);
    }

    [Theory(DisplayName = "AC-7401.2 묶음 이름은 앞뒤 빈칸을 빼고 1~10글자")]
    [InlineData("", false)]
    [InlineData("   ", false)]
    [InlineData("가", true)]
    [InlineData("가나다라마바사아자차", true)]
    [InlineData("  가나다라마바사아자차  ", true)]
    [InlineData("가나다라마바사아자차카", false)]
    public void BundleNameLength(string name, bool ok)
    {
        var check = DocSettingsRules.Check(new[] { Bundle("실손보험용", DocKind.Receipt), Bundle(name, DocKind.Detail) });
        Assert.Equal(ok, check.Ok);
        Assert.Equal(ok ? "" : "2번째 묶음 이름은 1~10글자로 써 주세요", check.Error);
        if (!ok) Assert.Empty(check.Bundles);
    }

    [Fact(DisplayName = "AC-7401.2 묶음 이름은 겹치면 안 된다(앞뒤 빈칸을 뺀 글로 견줌)")]
    public void BundleNamesMustDiffer()
    {
        var check = DocSettingsRules.Check(new[] { Bundle("실손", DocKind.Receipt), Bundle("처방", DocKind.RxCopy), Bundle(" 실손 ", DocKind.Detail) });
        Assert.False(check.Ok);
        Assert.Equal("3번째 묶음 이름이 앞 묶음과 같아요", check.Error);
        Assert.Empty(check.Bundles);
    }

    [Fact(DisplayName = "AC-7401.2 묶음에는 서류가 1개 이상")]
    public void BundleNeedsAKind()
    {
        var check = DocSettingsRules.Check(new[] { Bundle("빈 묶음") });
        Assert.False(check.Ok);
        Assert.Equal("1번째 묶음에 서류를 하나 이상 골라 주세요", check.Error);
        var nullEntry = DocSettingsRules.Check(new DocBundle[] { Bundle("실손", DocKind.Receipt), null! });
        Assert.False(nullEntry.Ok);
        Assert.Equal("2번째 묶음 이름은 1~10글자로 써 주세요", nullEntry.Error);
    }

    [Theory(DisplayName = "AC-7401.2 묶음은 1~8개만")]
    [InlineData(0, false)]
    [InlineData(1, true)]
    [InlineData(8, true)]
    [InlineData(9, false)]
    public void BundleCount(int count, bool ok)
    {
        var bundles = Enumerable.Range(1, count).Select(n => Bundle("묶음" + n, DocKind.Receipt)).ToArray();
        var check = DocSettingsRules.Check(bundles);
        Assert.Equal(ok, check.Ok);
        Assert.Equal(ok ? "" : "묶음은 1~8개까지 만들 수 있어요", check.Error);
        Assert.Equal(ok ? count : 0, check.Bundles.Count);
        Assert.False(DocSettingsRules.Check(null).Ok);
    }

    [Fact(DisplayName = "AC-7401.2 JSON으로 쓰고 읽으면 같은 값(프린터 이름·묶음 이름·서류 차례)")]
    public void JsonRoundTrips()
    {
        var settings = new DocSettings("Samsung M2020 Series", new[]
        {
            Bundle("실손보험용", DocKind.Receipt, DocKind.Detail),
            Bundle("처방만", DocKind.RxCopy),
            Bundle("다 \"뽑기\"", DocKind.Chart, DocKind.RxCopy, DocKind.Detail, DocKind.Receipt),
        });

        var json = DocSettingsRules.ToJson(settings);
        Assert.StartsWith("{\"printer\":\"Samsung M2020 Series\",\"bundles\":[{\"name\":\"실손보험용\",\"kinds\":[\"receipt\",\"detail\"]}", json);
        Assert.Contains("\"kinds\":[\"receipt\",\"detail\",\"rxCopy\",\"chart\"]", json);
        Assert.DoesNotContain("\n", json);

        var back = DocSettingsRules.FromJson(json);
        Assert.Equal("Samsung M2020 Series", back.PrinterName);
        Assert.Equal(new[] { "실손보험용", "처방만", "다 \"뽑기\"" }, back.Bundles.Select(b => b.Name).ToArray());
        Assert.Equal(new[] { DocKind.RxCopy }, back.Bundles[1].Kinds);
        Assert.Equal(DocNames.All, back.Bundles[2].Kinds);
        Assert.Equal(json, DocSettingsRules.ToJson(back));
    }

    [Fact(DisplayName = "AC-7401.2 모르는 칸은 무시하고 읽는다")]
    public void UnknownFieldsIgnored()
    {
        var back = DocSettingsRules.FromJson("{\"version\":3,\"printer\":\"가상\",\"bundles\":[{\"name\":\"처방\",\"kinds\":[\"rxCopy\"],\"color\":\"blue\"}]}");
        Assert.Equal("가상", back.PrinterName);
        Assert.Equal("처방", Assert.Single(back.Bundles).Name);
    }

    [Theory(DisplayName = "AC-7401.2 깨진 파일·규칙에 어긋난 파일은 기본값")]
    [InlineData("{")]
    [InlineData("[]")]
    [InlineData("null")]
    [InlineData("\"실손\"")]
    [InlineData("{\"bundles\":[{\"name\":\"실손\",\"kinds\":[\"receipt\"]}]}")]
    [InlineData("{\"printer\":1,\"bundles\":[{\"name\":\"실손\",\"kinds\":[\"receipt\"]}]}")]
    [InlineData("{\"printer\":\"\"}")]
    [InlineData("{\"printer\":\"\",\"bundles\":{}}")]
    [InlineData("{\"printer\":\"\",\"bundles\":[]}")]
    [InlineData("{\"printer\":\"\",\"bundles\":[1]}")]
    [InlineData("{\"printer\":\"\",\"bundles\":[{\"kinds\":[\"receipt\"]}]}")]
    [InlineData("{\"printer\":\"\",\"bundles\":[{\"name\":7,\"kinds\":[\"receipt\"]}]}")]
    [InlineData("{\"printer\":\"\",\"bundles\":[{\"name\":\"실손\"}]}")]
    [InlineData("{\"printer\":\"\",\"bundles\":[{\"name\":\"실손\",\"kinds\":\"receipt\"}]}")]
    [InlineData("{\"printer\":\"\",\"bundles\":[{\"name\":\"실손\",\"kinds\":[]}]}")]
    [InlineData("{\"printer\":\"\",\"bundles\":[{\"name\":\"실손\",\"kinds\":[\"certificate\"]}]}")]
    [InlineData("{\"printer\":\"\",\"bundles\":[{\"name\":\"실손\",\"kinds\":[0]}]}")]
    [InlineData("{\"printer\":\"\",\"bundles\":[{\"name\":\"가나다라마바사아자차카\",\"kinds\":[\"receipt\"]}]}")]
    [InlineData("{\"printer\":\"\",\"bundles\":[{\"name\":\"실손\",\"kinds\":[\"receipt\"]},{\"name\":\"실손\",\"kinds\":[\"detail\"]}]}")]
    public void BrokenFileReadsDefaults(string json)
    {
        AssertDefaults(DocSettingsRules.FromJson(json));
    }

    [Fact(DisplayName = "AC-7401.2 묶음 9개 든 파일은 기본값")]
    public void TooManyBundlesInFileReadsDefaults()
    {
        var nine = new DocSettings("", Enumerable.Range(1, 9).Select(n => Bundle("묶음" + n, DocKind.Chart)));
        AssertDefaults(DocSettingsRules.FromJson(DocSettingsRules.ToJson(nine)));
    }
}
