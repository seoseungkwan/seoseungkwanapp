using System;
using System.Linq;
using Precheck.Core.InjectionMemo;
using Xunit;

namespace Precheck.Core.Tests.InjectionMemo;

/// <summary>spec injection-memo AC-7504.1 주사 차수 단축키·단추 자리 설정(memo-settings.json 글). 환자 값은 담지 않는다.</summary>
public class MemoSettingsTests
{
    [Fact(DisplayName = "AC-7504.1 설정이 없으면 단축키 F8·단추 자리 0, 파일 이름 memo-settings.json")]
    public void Defaults()
    {
        Assert.Equal("F8", MemoSettings.Defaults.HotKey);
        Assert.Equal(0, MemoSettings.Defaults.ButtonOffsetPx);
        Assert.Equal("memo-settings.json", MemoSettings.FileName);
        Assert.Same(MemoSettings.Defaults, MemoSettings.FromJson(null));
    }

    [Fact(DisplayName = "AC-7504.1 단축키는 F4·F8·F10·F11만(비트가 쓰는 F1·F2·F3·F5·F6·F7·F9·F12 안 됨)")]
    public void AllowedKeys()
    {
        Assert.Equal(new[] { "F4", "F8", "F10", "F11" }, MemoSettings.AllowedKeys);
        foreach (var key in new[] { "F4", "F8", "F10", "F11" }) Assert.True(MemoSettings.IsAllowedKey(key));
        foreach (var key in new[] { "F1", "F2", "F3", "F5", "F6", "F7", "F9", "F12", "f8", "F8 ", "F13", "", null }) Assert.False(MemoSettings.IsAllowedKey(key));
        Assert.Throws<ArgumentException>(() => new MemoSettings("F9", 0));
    }

    [Fact(DisplayName = "AC-7504.1 단추 자리 -400~400px")]
    public void ButtonOffsetRange()
    {
        foreach (var px in new[] { -400, -20, 0, 20, 400 }) Assert.True(MemoSettings.IsButtonOffset(px));
        foreach (var px in new[] { -420, -401, 401, 420, int.MaxValue }) Assert.False(MemoSettings.IsButtonOffset(px));
        Assert.Equal(400, MemoSettings.MaxButtonOffset);
        Assert.Equal(20, MemoSettings.ButtonOffsetStep);
        Assert.Throws<ArgumentException>(() => new MemoSettings("F8", 420));
    }

    [Fact(DisplayName = "AC-7504.1 JSON으로 쓰고 읽으면 같은 값(한 줄 {\"hotKey\",\"buttonOffset\"}, 모르는 칸은 무시)")]
    public void JsonRoundTrip()
    {
        Assert.StartsWith("{\"hotKey\":\"F8\",\"buttonOffset\":0,\"xrayParts\":[\"무릎\",", MemoSettings.Defaults.ToJson());
        foreach (var settings in new[] { new MemoSettings("F11", -400), new MemoSettings("F4", 400), new MemoSettings("F10", -20) })
        {
            var back = MemoSettings.FromJson(settings.ToJson());
            Assert.Equal(settings.HotKey, back.HotKey);
            Assert.Equal(settings.ButtonOffsetPx, back.ButtonOffsetPx);
        }
        var extra = MemoSettings.FromJson("{\"hotKey\":\"F10\",\"buttonOffset\":-20,\"other\":[1]}");
        Assert.Equal("F10", extra.HotKey);
        Assert.Equal(-20, extra.ButtonOffsetPx);
    }

    [Theory(DisplayName = "AC-7504.1 깨진 파일·틀린 값은 기본값(F8·0)")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("{")]
    [InlineData("[]")]
    [InlineData("\"F8\"")]
    [InlineData("{}")]
    [InlineData("{\"hotKey\":\"F9\",\"buttonOffset\":0}")]
    [InlineData("{\"hotKey\":\"F8\",\"buttonOffset\":500}")]
    [InlineData("{\"hotKey\":8,\"buttonOffset\":0}")]
    [InlineData("{\"hotKey\":\"F4\"}")]
    [InlineData("{\"buttonOffset\":20}")]
    [InlineData("{\"hotKey\":\"F4\",\"buttonOffset\":1.5}")]
    [InlineData("{\"hotKey\":\"F4\",\"buttonOffset\":\"20\"}")]
    public void BrokenFileIsDefaults(string json)
    {
        var settings = MemoSettings.FromJson(json);
        Assert.Equal("F8", settings.HotKey);
        Assert.Equal(0, settings.ButtonOffsetPx);
    }

    [Fact(DisplayName = "AC-7505.5 메모에 넣을 엑스레이: 처음엔 표 20부위 중 팔·허벅지·다리·종아리만 끔, 표 차례로 저장·읽기, 모르는 이름 버림, 깨진 값은 처음 값")]
    public void XrayPartsSetting()
    {
        var all = XrayParts.All.ToArray();
        Assert.Equal(20, all.Length);
        Assert.Equal("무릎", all[0]);
        var expected = all.Where(p => p != "팔" && p != "허벅지" && p != "다리" && p != "종아리").ToArray();
        Assert.Equal(expected, MemoSettings.Defaults.XrayParts.ToArray());

        var chosen = new MemoSettings("F10", 20, new[] { "허리", "무릎", "모름", "허리" });
        Assert.Equal(new[] { "무릎", "허리" }, chosen.XrayParts.ToArray());
        var back = MemoSettings.FromJson(chosen.ToJson());
        Assert.Equal("F10", back.HotKey);
        Assert.Equal(20, back.ButtonOffsetPx);
        Assert.Equal(new[] { "무릎", "허리" }, back.XrayParts.ToArray());

        Assert.Empty(MemoSettings.FromJson("{\"hotKey\":\"F8\",\"buttonOffset\":0,\"xrayParts\":[]}").XrayParts);
        Assert.Equal(expected, MemoSettings.FromJson("{\"hotKey\":\"F8\",\"buttonOffset\":0}").XrayParts.ToArray());
        Assert.Equal(expected, MemoSettings.FromJson("{\"hotKey\":\"F8\",\"buttonOffset\":0,\"xrayParts\":\"무릎\"}").XrayParts.ToArray());
        Assert.Equal(new[] { "무릎" }, MemoSettings.FromJson("{\"hotKey\":\"F8\",\"buttonOffset\":0,\"xrayParts\":[\"무릎\",3,null,\"가슴\"]}").XrayParts.ToArray());
        Assert.Equal(expected, new MemoSettings("F8", 0).XrayParts.ToArray());
    }
}
