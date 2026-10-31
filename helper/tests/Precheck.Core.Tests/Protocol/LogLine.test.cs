using System;
using Precheck.Core.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Protocol;

public class LogLineTests
{
    private static readonly DateTimeOffset At = new DateTimeOffset(2026, 10, 30, 9, 5, 7, 123, TimeSpan.FromHours(9));

    [Fact(DisplayName = "AC-001.6 기록 한 줄 = 시각 · 명령 이름 · 오류 번호")]
    public void FormatsTimeCommandAndCode()
    {
        Assert.Equal("2026-10-30T09:05:07.123+09:00 claim.month E-BIT-READ-FAILED", LogLine.Format(At, "claim.month", "E-BIT-READ-FAILED"));
        Assert.Equal("2026-10-30T09:05:07.123+09:00 hello -", LogLine.Format(At, "hello", null));
        Assert.Equal("2026-10-30T09:05:07.123+09:00 - E-HELPER-BAD-MESSAGE", LogLine.Format(At, null, "E-HELPER-BAD-MESSAGE"));
    }

    [Theory(DisplayName = "AC-001.6 표에 없는 명령 이름은 'unknown'으로 쓴다(모르는 cmd에 환자 글자가 섞여 올 수 있음)")]
    [InlineData(Fake.Name)]
    [InlineData(Fake.Chart)]
    [InlineData("hello " + Fake.Name)]
    [InlineData("claim.month\n900001")]
    [InlineData("")]
    public void UnknownCommandNamesAreHidden(string cmd)
    {
        var line = LogLine.Format(At, cmd, "E-HELPER-UNKNOWN-COMMAND");

        Assert.Equal("2026-10-30T09:05:07.123+09:00 unknown E-HELPER-UNKNOWN-COMMAND", line);
    }

    [Theory(DisplayName = "AC-001.6 오류 번호 자리에는 'E-…' 모양만 쓴다")]
    [InlineData(Fake.Name)]
    [InlineData("E-BIT-READ-FAILED " + Fake.Chart)]
    [InlineData("E-bit")]
    [InlineData("E-")]
    public void NonCodesAreHidden(string code)
    {
        var line = LogLine.Format(At, "hello", code);

        Assert.Equal("2026-10-30T09:05:07.123+09:00 hello invalid", line);
        Assert.DoesNotContain(Fake.Name, line);
        Assert.DoesNotContain(Fake.Chart, line);
    }

    [Fact(DisplayName = "AC-001.6 기록 시각은 문화권과 상관없이 같은 모양이다")]
    public void FormatIsCultureInvariant()
    {
        var previous = System.Globalization.CultureInfo.CurrentCulture;
        try
        {
            System.Globalization.CultureInfo.CurrentCulture = new System.Globalization.CultureInfo("ar-SA");
            Assert.Equal("2026-10-30T09:05:07.123+09:00 hello -", LogLine.Format(At, "hello", null));
        }
        finally
        {
            System.Globalization.CultureInfo.CurrentCulture = previous;
        }
    }
}
