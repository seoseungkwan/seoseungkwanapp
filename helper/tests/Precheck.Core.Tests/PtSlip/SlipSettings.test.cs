using System;
using System.Collections.Generic;
using System.Linq;
using Precheck.Core.PtSlip;
using Xunit;

namespace Precheck.Core.Tests.PtSlip;

/// <summary>
/// spec pt-slip REQ-6401: PT 후 진료 종이 프로그램의 설정 기본값·목록 규칙·JSON(SlipSettings·SlipSettingsRules).
/// 파일 읽기·쓰기는 윈도우 층(SettingsFile)이 하고, 여기서는 글 ↔ 설정만 본다.
/// </summary>
public class SlipSettingsTests
{
    private static readonly string[] DefaultItems = { "HP", "ICE", "ICT", "초음파", "레이저", "견인", "도수", "충격파" };
    private static readonly string[] DefaultParts = { "목", "어깨", "팔꿈치", "손목", "허리", "골반", "무릎", "발목" };

    private static void AssertDefaults(SlipSettings settings)
    {
        Assert.Equal(DefaultItems, settings.Items);
        Assert.Equal(DefaultParts, settings.Parts);
        Assert.Equal("", settings.PrinterName);
        Assert.Equal(60, settings.PaperLengthMm);
        Assert.Equal(0, settings.ButtonOffsetPx);
    }

    private static string Lines(int count) => string.Join("\n", Enumerable.Range(1, count).Select(n => "항목" + n));

    // ── AC-6401.1 설정 파일이 없으면 기본값 ─────────────────────────────

    [Fact(DisplayName = "AC-6401.1 기본값: 항목 HP·ICE·ICT·초음파·레이저·견인·도수·충격파, 부위 목~발목 8개, 프린터 빈칸, 종이 60mm, 버튼 자리 0")]
    public void DefaultsAreTheAgreedLists()
    {
        AssertDefaults(SlipSettings.Defaults);
    }

    [Fact(DisplayName = "AC-6401.1 설정 파일이 없으면(읽은 글 null) 기본값")]
    public void MissingFileReadsDefaults()
    {
        AssertDefaults(SlipSettingsRules.FromJson(null));
    }

    [Fact(DisplayName = "AC-6401.1 기본값 목록은 그대로 목록 규칙을 지난다")]
    public void DefaultListsPassTheirOwnRules()
    {
        var items = SlipSettingsRules.ParseList(SlipSettingsRules.ListText(SlipSettings.Defaults.Items), SlipListKind.Items);
        var parts = SlipSettingsRules.ParseList(SlipSettingsRules.ListText(SlipSettings.Defaults.Parts), SlipListKind.Parts);
        Assert.True(items.Ok, items.Error);
        Assert.True(parts.Ok, parts.Error);
        Assert.Equal(DefaultItems, items.Names);
        Assert.Equal(DefaultParts, parts.Names);
        Assert.True(SlipSettingsRules.IsPaperLength(SlipSettings.Defaults.PaperLengthMm));
        Assert.True(SlipSettingsRules.IsButtonOffset(SlipSettings.Defaults.ButtonOffsetPx));
    }

    // ── AC-6401.2 목록 글 바꾸기 ─────────────────────────────

    [Fact(DisplayName = "AC-6401.2 목록 글: 앞뒤 빈칸·빈 줄·겹친 이름(처음 것만 남김)을 빼고 줄 차례대로")]
    public void ListDropsBlanksAndRepeats()
    {
        var parsed = SlipSettingsRules.ParseList("  HP \r\n\r\nICE\n   \nHP\r\n도수 치료\n\tICT\t\n", SlipListKind.Items);
        Assert.True(parsed.Ok, parsed.Error);
        Assert.Equal("", parsed.Error);
        Assert.Equal(new[] { "HP", "ICE", "도수 치료", "ICT" }, parsed.Names);
    }

    [Theory(DisplayName = "AC-6401.2 목록 글: 어긋난 줄은 사용자가 본 줄 번호(빈 줄 포함, 1부터)와 함께 거절")]
    [InlineData("HP\n\n가나다라마바사아자차카", SlipListKind.Items, "3번째 줄은 1~10글자로 써 주세요")]
    [InlineData("가나다라마바사아자차카", SlipListKind.Parts, "1번째 줄은 1~10글자로 써 주세요")]
    [InlineData("HP\nI,CE\n가나다라마바사아자차카", SlipListKind.Items, "2번째 줄에 쉼표(,)는 쓸 수 없어요")]
    [InlineData("목\r\n어깨,허리", SlipListKind.Parts, "2번째 줄에 쉼표(,)는 쓸 수 없어요")]
    [InlineData("목\n\n 오른 ", SlipListKind.Parts, "3번째 줄: 오른·왼·양은 부위 이름으로 쓸 수 없어요")]
    [InlineData("왼", SlipListKind.Parts, "1번째 줄: 오른·왼·양은 부위 이름으로 쓸 수 없어요")]
    [InlineData("목\n양", SlipListKind.Parts, "2번째 줄: 오른·왼·양은 부위 이름으로 쓸 수 없어요")]
    public void ListRejectsBadLineWithNumber(string text, SlipListKind kind, string error)
    {
        var parsed = SlipSettingsRules.ParseList(text, kind);
        Assert.False(parsed.Ok);
        Assert.Equal(error, parsed.Error);
        Assert.Empty(parsed.Names);
    }

    [Fact(DisplayName = "AC-6401.2 목록 글: 10글자는 되고, 오른·왼·양은 부위 목록에서만 막는다(항목 이름·'오른쪽'처럼 더 긴 글은 됨)")]
    public void ListEdgesThatPass()
    {
        Assert.True(SlipSettingsRules.ParseList("가나다라마바사아자차", SlipListKind.Items).Ok);
        Assert.True(SlipSettingsRules.ParseList("오른\n왼\n양", SlipListKind.Items).Ok);
        var parts = SlipSettingsRules.ParseList("오른쪽\n양손", SlipListKind.Parts);
        Assert.True(parts.Ok, parts.Error);
        Assert.Equal(new[] { "오른쪽", "양손" }, parts.Names);
    }

    [Theory(DisplayName = "AC-6401.2 목록은 1~16개만(빈 글·빈 줄뿐·17개는 거절, 겹침을 빼고 16개면 됨)")]
    [InlineData(0)]
    [InlineData(17)]
    [InlineData(20)]
    public void ListCountOutOfRange(int count)
    {
        foreach (var kind in new[] { SlipListKind.Items, SlipListKind.Parts })
        {
            var parsed = SlipSettingsRules.ParseList(Lines(count), kind);
            Assert.False(parsed.Ok);
            Assert.Equal("1~16개까지 넣을 수 있어요", parsed.Error);
            Assert.Empty(parsed.Names);
        }
        Assert.Equal("1~16개까지 넣을 수 있어요", SlipSettingsRules.ParseList(" \n\n \r\n", SlipListKind.Items).Error);
    }

    [Fact(DisplayName = "AC-6401.2 목록은 16개까지 되고, 겹친 줄은 세지 않는다")]
    public void ListCountInRange()
    {
        Assert.Single(SlipSettingsRules.ParseList("HP", SlipListKind.Items).Names);
        Assert.Equal(16, SlipSettingsRules.ParseList(Lines(16), SlipListKind.Items).Names.Count);
        var withRepeat = SlipSettingsRules.ParseList(Lines(16) + "\n항목3", SlipListKind.Parts);
        Assert.True(withRepeat.Ok, withRepeat.Error);
        Assert.Equal(16, withRepeat.Names.Count);
    }

    [Fact(DisplayName = "AC-6401.2 줄 오류는 개수 오류보다 먼저 알린다")]
    public void LineErrorBeforeCountError()
    {
        Assert.Equal("18번째 줄에 쉼표(,)는 쓸 수 없어요", SlipSettingsRules.ParseList(Lines(17) + "\n가,나", SlipListKind.Items).Error);
    }

    [Fact(DisplayName = "AC-6401.2 목록 → 글(한 줄에 하나, 줄 끝 \\r\\n) → 목록은 같다")]
    public void ListTextRoundTrips()
    {
        Assert.Equal("HP\r\nICE\r\n도수", SlipSettingsRules.ListText(new[] { "HP", "ICE", "도수" }));
        Assert.Equal("", SlipSettingsRules.ListText(Array.Empty<string>()));
        Assert.Equal(DefaultParts, SlipSettingsRules.ParseList(SlipSettingsRules.ListText(DefaultParts), SlipListKind.Parts).Names);
    }

    [Theory(DisplayName = "AC-6401.2 종이 길이는 40~150mm만")]
    [InlineData(39, false)]
    [InlineData(40, true)]
    [InlineData(60, true)]
    [InlineData(150, true)]
    [InlineData(151, false)]
    [InlineData(0, false)]
    [InlineData(-60, false)]
    public void PaperLengthRange(int mm, bool ok)
    {
        Assert.Equal(ok, SlipSettingsRules.IsPaperLength(mm));
    }

    [Theory(DisplayName = "AC-6401.2 버튼 자리는 -400~400px, 20px 단위만")]
    [InlineData(-420, false)]
    [InlineData(-400, true)]
    [InlineData(-20, true)]
    [InlineData(0, true)]
    [InlineData(10, false)]
    [InlineData(20, true)]
    [InlineData(390, false)]
    [InlineData(400, true)]
    [InlineData(420, false)]
    public void ButtonOffsetRange(int px, bool ok)
    {
        Assert.Equal(ok, SlipSettingsRules.IsButtonOffset(px));
    }

    // ── AC-6401.3 JSON 쓰고 읽기 ─────────────────────────────

    [Fact(DisplayName = "AC-6401.3 JSON 모양: {items, parts, printer, paperMm, buttonOffset} 한 줄, 한글은 그대로")]
    public void JsonShape()
    {
        Assert.Equal(
            "{\"items\":[\"HP\",\"ICE\",\"ICT\",\"초음파\",\"레이저\",\"견인\",\"도수\",\"충격파\"]," +
            "\"parts\":[\"목\",\"어깨\",\"팔꿈치\",\"손목\",\"허리\",\"골반\",\"무릎\",\"발목\"]," +
            "\"printer\":\"\",\"paperMm\":60,\"buttonOffset\":0}",
            SlipSettingsRules.ToJson(SlipSettings.Defaults));
    }

    [Fact(DisplayName = "AC-6401.3 설정을 JSON으로 쓰고 다시 읽으면 같은 값")]
    public void JsonRoundTrips()
    {
        var settings = new SlipSettings(new[] { "도수", "충격파", "HP" }, new[] { "허리", "무릎" }, "BIXOLON SRP-350 \"2\"", 80, -40);
        var read = SlipSettingsRules.FromJson(SlipSettingsRules.ToJson(settings));
        Assert.Equal(new[] { "도수", "충격파", "HP" }, read.Items);
        Assert.Equal(new[] { "허리", "무릎" }, read.Parts);
        Assert.Equal("BIXOLON SRP-350 \"2\"", read.PrinterName);
        Assert.Equal(80, read.PaperLengthMm);
        Assert.Equal(-40, read.ButtonOffsetPx);

        var edges = SlipSettingsRules.FromJson(SlipSettingsRules.ToJson(new SlipSettings(new[] { "HP" }, new[] { "목" }, "", 150, 400)));
        Assert.Equal(150, edges.PaperLengthMm);
        Assert.Equal(400, edges.ButtonOffsetPx);
    }

    [Fact(DisplayName = "AC-6401.3 모르는 칸은 무시하고 읽는다")]
    public void JsonIgnoresUnknownKeys()
    {
        var read = SlipSettingsRules.FromJson("{\"items\":[\"HP\"],\"parts\":[\"목\"],\"printer\":\"P\",\"paperMm\":70,\"buttonOffset\":20,\"later\":true}");
        Assert.Equal(new[] { "HP" }, read.Items);
        Assert.Equal(new[] { "목" }, read.Parts);
        Assert.Equal("P", read.PrinterName);
        Assert.Equal(70, read.PaperLengthMm);
        Assert.Equal(20, read.ButtonOffsetPx);
    }

    public static IEnumerable<object[]> BrokenFiles()
    {
        const string ok = "\"items\":[\"HP\"],\"parts\":[\"목\"],\"printer\":\"\"";
        var cases = new[]
        {
            "",
            "   ",
            "{",
            "null",
            "[]",
            "\"text\"",
            "{}",
            "{" + ok + ",\"paperMm\":60}",
            "{\"parts\":[\"목\"],\"printer\":\"\",\"paperMm\":60,\"buttonOffset\":0}",
            "{\"items\":\"HP\",\"parts\":[\"목\"],\"printer\":\"\",\"paperMm\":60,\"buttonOffset\":0}",
            "{\"items\":[1],\"parts\":[\"목\"],\"printer\":\"\",\"paperMm\":60,\"buttonOffset\":0}",
            "{\"items\":[],\"parts\":[\"목\"],\"printer\":\"\",\"paperMm\":60,\"buttonOffset\":0}",
            "{\"items\":[\"가나다라마바사아자차카\"],\"parts\":[\"목\"],\"printer\":\"\",\"paperMm\":60,\"buttonOffset\":0}",
            "{\"items\":[\"H,P\"],\"parts\":[\"목\"],\"printer\":\"\",\"paperMm\":60,\"buttonOffset\":0}",
            "{\"items\":[\"HP\",\"HP\"],\"parts\":[\"목\"],\"printer\":\"\",\"paperMm\":60,\"buttonOffset\":0}",
            "{\"items\":[\" HP\"],\"parts\":[\"목\"],\"printer\":\"\",\"paperMm\":60,\"buttonOffset\":0}",
            "{\"items\":[\"HP\\nICE\"],\"parts\":[\"목\"],\"printer\":\"\",\"paperMm\":60,\"buttonOffset\":0}",
            "{\"items\":[\"HP\"],\"parts\":[\"오른\"],\"printer\":\"\",\"paperMm\":60,\"buttonOffset\":0}",
            "{\"items\":[" + string.Join(",", Enumerable.Range(1, 17).Select(n => "\"항목" + n + "\"")) + "],\"parts\":[\"목\"],\"printer\":\"\",\"paperMm\":60,\"buttonOffset\":0}",
            "{\"items\":[\"HP\"],\"parts\":[\"목\"],\"printer\":null,\"paperMm\":60,\"buttonOffset\":0}",
            "{\"items\":[\"HP\"],\"parts\":[\"목\"],\"printer\":3,\"paperMm\":60,\"buttonOffset\":0}",
            "{" + ok + ",\"paperMm\":39,\"buttonOffset\":0}",
            "{" + ok + ",\"paperMm\":151,\"buttonOffset\":0}",
            "{" + ok + ",\"paperMm\":60.5,\"buttonOffset\":0}",
            "{" + ok + ",\"paperMm\":\"60\",\"buttonOffset\":0}",
            "{" + ok + ",\"paperMm\":60,\"buttonOffset\":10}",
            "{" + ok + ",\"paperMm\":60,\"buttonOffset\":420}",
            "{" + ok + ",\"paperMm\":60,\"buttonOffset\":-420}",
            "{" + ok + ",\"paperMm\":60,\"buttonOffset\":99999999999}",
        };
        return cases.Select((text, n) => new object[] { n, text });
    }

    [Theory(DisplayName = "AC-6401.3 깨졌거나 규칙에 어긋난 설정 파일은 기본값")]
    [MemberData(nameof(BrokenFiles))]
    public void BrokenFileReadsDefaults(int caseNumber, string text)
    {
        Assert.True(caseNumber >= 0);
        AssertDefaults(SlipSettingsRules.FromJson(text));
    }
}
