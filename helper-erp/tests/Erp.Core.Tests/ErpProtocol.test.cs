using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using Erp.Core;
using Erp.Core.Closing;
using Erp.Core.Tests.Closing;
using Precheck.Core.Protocol;
using Precheck.Core.Revenue;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Protocol;
using Xunit;

namespace Erp.Core.Tests;

/// <summary>
/// AC-3601.3 기존 OriginGuard·Dispatcher·MessageLoop(1a721ef 그대로)에 ERP 명령 표를 넣으면(TASK-11, design.md 3-1):
/// 새 확장 origin만 받아 closing.codes·closing.day만 처리하고 hello·claim.month 등은 E-HELPER-UNKNOWN-COMMAND,
/// 다른 origin(기존 확장 포함)이면 하나도 읽지 않고 켜지자마자 끝난다.
/// </summary>
public class ErpProtocolTests
{
    private const string NewExtension = "chrome-extension://lkancaiekmoieooheifdimahhkejfmjc/";
    private const string OldExtension = "chrome-extension://cmnefbmfclmjkfbnjnbfnlndlpjnihka/";

    private static readonly CommandTable Table = ErpCommandTable.Load();
    private static readonly CommandTable WebTable = CommandTable.LoadEmbedded();

    private sealed class Outcome
    {
        public int Code { get; set; }
        public List<JsonElement> Replies { get; set; } = new List<JsonElement>();
        public List<(string? Name, string? Code)> Log { get; } = new List<(string? Name, string? Code)>();
        public long InputPosition { get; set; }
        public byte[] Output { get; set; } = new byte[0];
    }

    /// <summary>
    /// 등록된 PC: 마감일지·매출 문장은 가짜 기본 답, 1년 코드 목록(CodeListSql)은 빈 답(ClosingFake.Quiet).
    /// 도우미 PC 오늘은 마감 일자(2026-11-09) 다음 날이다(오늘보다 뒤 날짜는 E-CLOSING-FUTURE-DATE, TASK-16).
    /// </summary>
    private static Rig Ready()
    {
        var rig = new Rig { Today = ClosingFake.Day.AddDays(1) }.Registered();
        ClosingFake.Quiet(rig.Session);
        return rig;
    }

    /// <summary>ERP 도우미처럼: ERP 표 → Dispatcher → ClosingCommands.Register → MessageLoop.Run.</summary>
    private static Outcome Run(Rig rig, string[] args, params byte[][] frames)
    {
        var outcome = new Outcome();
        var input = new MemoryStream(Frames.Concat(frames));
        var output = new MemoryStream();
        Action<string?, string?> log = (name, code) => outcome.Log.Add((name, code));
        var dispatcher = new Dispatcher(Table, log);
        ClosingCommands.Register(dispatcher, rig.Services);

        outcome.Code = MessageLoop.Run(args, input, output, Table, dispatcher, log);

        outcome.InputPosition = input.Position;
        outcome.Output = output.ToArray();
        outcome.Replies = Frames.ReadAll(outcome.Output).Select(Json.Parse).ToList();
        return outcome;
    }

    private static byte[] Frame(string cmd, string args, string id) => Frames.Frame(Requests.Envelope(cmd, args, id));

    private static string Type(JsonElement reply) => reply.GetProperty("type").GetString()!;

    // ---- OriginGuard ------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3601.3 OriginGuard에 ERP 표를 넣으면 새 확장 origin(첫 인자)만 받는다. 기존 확장·모르는 origin·인자 없음은 막는다")]
    public void OriginGuardTakesOnlyNewExtension()
    {
        Assert.Equal(NewExtension, Requests.Allowed(Table));
        Assert.True(OriginGuard.IsAllowed(new[] { NewExtension }, Table));
        Assert.True(OriginGuard.IsAllowed(new[] { NewExtension, "--parent-window=0" }, Table));

        foreach (var args in new[]
        {
            new[] { OldExtension },
            new[] { OldExtension, "--parent-window=0" },
            new[] { "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/" },
            new[] { "https://erp.minesolution.com" },
            new[] { NewExtension.ToUpperInvariant() },
            new[] { NewExtension.TrimEnd('/') },
            new[] { "" },
            new string[0],
        })
        {
            Assert.False(OriginGuard.IsAllowed(args, Table), string.Join(" ", args));
        }
        Assert.False(OriginGuard.IsAllowed(null, Table));

        // 기존 도우미(웹 표)는 지금처럼 기존 확장만 받는다(새 확장은 막힌다)
        Assert.True(OriginGuard.IsAllowed(new[] { OldExtension }, WebTable));
        Assert.False(OriginGuard.IsAllowed(new[] { NewExtension }, WebTable));
    }

    // ---- MessageLoop ------------------------------------------------------------------------------

    public static TheoryData<string[]> OtherOrigins => new TheoryData<string[]>
    {
        new[] { OldExtension, "--parent-window=0" },
        new[] { OldExtension },
        new[] { "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/" },
        new[] { "--register" },
        new string[0],
    };

    [Theory(DisplayName = "AC-3601.3 기존 확장·모르는 origin이 켜면 하나도 읽지 않고 답 없이 바로 끝난다(기록은 오류 번호 하나, 비트를 열지 않음)")]
    [MemberData(nameof(OtherOrigins))]
    public void OtherOriginExitsAtOnce(string[] args)
    {
        using var rig = Ready();
        var outcome = Run(rig, args, Frame("closing.codes", "{}", "c-1"), Frame("hello", "{}", "h-1"));

        Assert.Equal(MessageLoop.ExitRejected, outcome.Code);
        Assert.Equal(0, outcome.InputPosition);
        Assert.Empty(outcome.Output);
        Assert.Equal(((string?)null, (string?)ErrorCodes.Rejected), Assert.Single(outcome.Log));
        Assert.Empty(rig.Connector.Opened);
    }

    [Fact(DisplayName = "AC-3601.3 새 확장이 켜면 closing.codes·closing.day는 result, hello·claim.month·revenue.days는 E-HELPER-UNKNOWN-COMMAND로 답하고 계속, 입력이 닫히면 0으로 끝난다")]
    public void NewExtensionGetsOnlyClosing()
    {
        using var rig = Ready();
        var outcome = Run(
            rig,
            new[] { NewExtension, "--parent-window=0" },
            Frame("closing.codes", "{}", "c-1"),
            Frame("hello", "{}", "h-1"),
            Frame("claim.month", "{\"month\":\"2026-10\"}", "m-1"),
            Frame("revenue.days", "{\"from\":\"2026-11-09\",\"to\":\"2026-11-09\"}", "r-1"),
            Frame("closing.day", "{\"date\":\"2026-11-09\",\"groups\":[{\"key\":\"carm\",\"codes\":[\"CARM1\"]}]}", "d-1"));

        Assert.Equal(MessageLoop.ExitOk, outcome.Code);
        Assert.Equal(new[] { "c-1", "h-1", "m-1", "r-1", "d-1" }, outcome.Replies.Select(reply => reply.GetProperty("id").GetString()));
        Assert.Equal(new[] { "result", "error", "error", "error", "result" }, outcome.Replies.Select(Type));
        foreach (var reply in outcome.Replies.Skip(1).Take(3)) Assert.Equal(ErrorCodes.UnknownCommand, reply.GetProperty("code").GetString());
        Assert.Equal(ClosingFake.DayText, outcome.Replies[4].GetProperty("data").GetProperty("date").GetString());
        Assert.Equal(
            new (string?, string?)[]
            {
                ("closing.codes", null),
                ("unknown", ErrorCodes.UnknownCommand),
                ("unknown", ErrorCodes.UnknownCommand),
                ("unknown", ErrorCodes.UnknownCommand),
                ("closing.day", null),
            },
            outcome.Log);
    }

    // ---- Dispatcher --------------------------------------------------------------------------------

    [Fact(DisplayName = "AC-3601.3 ERP 표의 Dispatcher에는 hello·기존 명령 처리기를 붙일 수 없다(표에 없는 이름), closing.* 둘만 붙는다")]
    public void DispatcherTakesOnlyClosingHandlers()
    {
        using var rig = Ready();
        var dispatcher = new Dispatcher(Table);
        Assert.Throws<ArgumentException>(() => Hello.Register(dispatcher, Table));
        Assert.Throws<ArgumentException>(() => RevenueCommands.Register(dispatcher, rig.Services));
        ClosingCommands.Register(dispatcher, rig.Services);

        var sink = new ListSink();
        dispatcher.Handle(System.Text.Encoding.UTF8.GetBytes(Requests.Envelope("hello", "{}")), sink);
        Assert.Equal(ErrorCodes.UnknownCommand, Assert.Single(sink.Replies).GetProperty("code").GetString());
        Assert.Empty(rig.Connector.Opened);
    }

    // ---- 진단 기록 한 줄(AC-3606.3) ------------------------------------------------------------------

    [Fact(DisplayName = "AC-3606.3 ERP 기록 줄은 기존 LogLine과 같은 '시각 명령이름 오류번호' 모양이고 명령 이름은 ERP 표에 있는 closing.*만(그 밖은 unknown)")]
    public void LogLineUsesErpTable()
    {
        var at = new DateTimeOffset(2026, 11, 10, 9, 0, 0, TimeSpan.FromHours(9));

        Assert.Equal("2026-11-10T09:00:00.000+09:00 closing.day -", ErpLogLine.Format(at, "closing.day", null));
        Assert.Equal("2026-11-10T09:00:00.000+09:00 closing.codes E-BIT-NOT-REGISTERED", ErpLogLine.Format(at, "closing.codes", "E-BIT-NOT-REGISTERED"));
        Assert.Equal("2026-11-10T09:00:00.000+09:00 unknown E-HELPER-UNKNOWN-COMMAND", ErpLogLine.Format(at, "hello", ErrorCodes.UnknownCommand));
        Assert.Equal("2026-11-10T09:00:00.000+09:00 unknown invalid", ErpLogLine.Format(at, Fake.Chart, Fake.Name));

        // 모양은 기존 LogLine과 같다(기존 표에 있는 이름·없는 이름 모두 같은 자리에 같은 글)
        Assert.Equal(LogLine.Format(at, null, ErrorCodes.Rejected), ErpLogLine.Format(at, null, ErrorCodes.Rejected));
        Assert.Equal(LogLine.Format(at, Fake.Chart, "x"), ErpLogLine.Format(at, Fake.Chart, "x"));
        Assert.Equal("2026-11-10T09:00:00.000+09:00 unknown -", LogLine.Format(at, "closing.day", null));
    }
}
