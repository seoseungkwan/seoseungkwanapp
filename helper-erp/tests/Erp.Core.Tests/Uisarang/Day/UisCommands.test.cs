using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.Json;
using Erp.Core.Closing;
using Erp.Core.Tests.Closing;
using Erp.Core.Uisarang;
using Precheck.Core.Protocol;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Protocol;
using Xunit;

namespace Erp.Core.Tests.Uisarang.Day;

/// <summary>
/// spec erp-uisarang TASK-13: 의사랑 명령 처리기 UisCommands(design.md 3-1~3-5·4-1)를 ERP 명령 표(ErpCommandTable)로 만든 Dispatcher에 붙여 본다.
/// 의사랑 도우미 = RegisterUisarang(가짜 폴더·임시 폴더 모아 둔 값), 비트 도우미 = 지금 ClosingCommands.Register + RegisterBitExtras.
/// </summary>
public class UisCommandsTests
{
    private static readonly CommandTable Table = ErpCommandTable.Load();

    private const string Usual =
        "{\"date\":\"2026-11-23\",\"groups\":[{\"key\":\"carm\",\"codes\":[\"CA100\"]},{\"key\":\"ptVisit\",\"codes\":[\"AA222\"]}]," +
        "\"sales\":[{\"key\":\"carm\",\"codes\":[\"CA100\"]},{\"key\":\"pt\",\"codes\":[\"PT100\",\"KK090\"]}]}";

    private sealed class Outcome
    {
        public ListSink Sink { get; } = new ListSink();

        public List<(string? Name, string? Code)> Log { get; } = new List<(string? Name, string? Code)>();

        public string Text => string.Concat(Sink.Messages.Select(Encoding.UTF8.GetString));

        public Exception? Thrown { get; set; }

        /// <summary>진단 기록 줄(ErpLogLine 꼴) 그대로.</summary>
        public string[] Lines => Log.Select(entry => ErpLogLine.Format(new DateTimeOffset(2026, 11, 23, 18, 30, 0, TimeSpan.FromHours(9)), entry.Name, entry.Code)).ToArray();
    }

    /// <summary>의사랑 도우미: 가짜 폴더 + 임시 폴더 모아 둔 값, 오늘 2026-11-23. 폴더를 몇 번 만들었는지 센다.</summary>
    private sealed class UisRig : IDisposable
    {
        public DayRig Day { get; } = new DayRig();

        /// <summary>부를 때마다 지금 Day.Cache로 만든다(시험이 모아 둔 값 자리를 바꿀 수 있게).</summary>
        public UisServices Services => new UisServices(
            () =>
            {
                FolderMade++;
                if (FolderFails) throw new HelperException("E-UIS-FOLDER");
                return Day.Folder;
            },
            UisFolderKind.Profile,
            Day.Cache,
            () => Today,
            (name, code) => Notes.Add((name, code)));

        public DateTime Today { get; set; } = new DateTime(2026, 11, 23, 9, 0, 0);

        public int FolderMade { get; private set; }

        public bool FolderFails { get; set; }

        public List<(string? Name, string? Code)> Notes { get; } = new List<(string? Name, string? Code)>();

        public Outcome Handle(string cmd, string args)
        {
            var outcome = new Outcome();
            var dispatcher = new Dispatcher(Table, (name, code) => outcome.Log.Add((name, code)));
            UisCommands.RegisterUisarang(dispatcher, Services);
            try
            {
                dispatcher.Handle(Encoding.UTF8.GetBytes(Requests.Envelope(cmd, args)), outcome.Sink);
            }
            catch (Exception e)
            {
                outcome.Thrown = e;
            }
            outcome.Log.AddRange(Notes);
            Notes.Clear();
            return outcome;
        }

        public void Dispose() => Day.Dispose();
    }

    private static JsonElement One(Outcome outcome, string type)
    {
        Assert.Null(outcome.Thrown);
        var reply = Assert.Single(outcome.Sink.Replies);
        Assert.Equal(type, reply.GetProperty("type").GetString());
        return reply;
    }

    private static string ErrorOf(Outcome outcome) => One(outcome, "error").GetProperty("code").GetString()!;

    private static JsonElement DataOf(Outcome outcome) => One(outcome, "result").GetProperty("data");

    // ---- 자료원 두 갈래(AC-4210.2) ---------------------------------------------------------------------

    [Fact(DisplayName = "AC-4210.2 의사랑 도우미: closing.source = { source: 'uisarang' }, closing.codes·closing.findCodes = E-CLOSING-WRONG-SOURCE(폴더에 닿지 않음)")]
    public void UisarangSourceAndWrongSource()
    {
        using var rig = new UisRig();
        rig.Day.All();

        var source = DataOf(rig.Handle("closing.source", "{}"));
        Assert.Equal(new[] { "source" }, DayKit.Keys(source));
        Assert.Equal("uisarang", source.GetProperty("source").GetString());
        Assert.Equal("E-CLOSING-WRONG-SOURCE", ErrorOf(rig.Handle("closing.codes", "{}")));
        Assert.Equal("E-CLOSING-WRONG-SOURCE", ErrorOf(rig.Handle("closing.findCodes", "{\"text\":\"CA\"}")));
        Assert.Equal(0, rig.FolderMade);
        Assert.Equal(6, rig.Day.Folder.Names.Count);
        Assert.Equal("E-CLOSING-WRONG-SOURCE", UisCommands.WrongSource);
        Assert.Equal("E-UIS-FOLDER", UisCommands.FolderFailed);
        Assert.Equal("closing.source", UisCommands.SourceName);
        Assert.Equal("closing.uisCodes", UisCommands.CodesName);
    }

    [Fact(DisplayName = "AC-4210.2 의사랑 도우미: closing.day(sales 있든 없든)·closing.uisCodes는 의사랑 처리기(result 하나, chunk 없음)")]
    public void UisarangDayAndCodes()
    {
        using var rig = new UisRig();
        rig.Day.All();
        var outcome = rig.Handle("closing.day", Usual);
        var day = DataOf(outcome);
        DayKit.DumpRaw("command", "2026-11-23", outcome.Sink.Messages[0]);

        Assert.Equal("uisarang", day.GetProperty("source").GetString());
        Assert.Equal("profile", day.GetProperty("uis").GetProperty("folder").GetString());
        Assert.Equal(new[] { "carm", "ptVisit", "pt" }, day.GetProperty("groups").EnumerateArray().Select(group => group.GetProperty("key").GetString()));
        Assert.Equal(220_000, day.GetProperty("groups")[0].GetProperty("total").GetInt64());
        Assert.Equal(57, day.GetProperty("patients").GetProperty("return").GetInt64());

        rig.Day.NewFolder();
        var noSales = DataOf(rig.Handle("closing.day", "{\"date\":\"2026-11-23\",\"groups\":[{\"key\":\"carm\",\"codes\":[\"CA100\"]}]}"));
        Assert.Equal(new[] { "carm" }, noSales.GetProperty("groups").EnumerateArray().Select(group => group.GetProperty("key").GetString()));
        Assert.Equal(JsonValueKind.Null, noSales.GetProperty("groups")[0].GetProperty("total").ValueKind);
        Assert.True(noSales.GetProperty("uis").GetProperty("reports")[0].GetProperty("cached").GetBoolean());

        rig.Day.NewFolder().Fixture(DayKitNames.Rx, "rx-3months.xls");
        var codes = DataOf(rig.Handle("closing.uisCodes", "{}"));
        Assert.Equal("ok", codes.GetProperty("state").GetString());
        Assert.Equal(12, codes.GetProperty("codes").GetArrayLength());
        Assert.Empty(rig.Day.Folder.Names);
    }

    [Fact(DisplayName = "AC-4210.2 비트 도우미: 지금 처리기 + RegisterBitExtras → closing.source = { source: 'bit' }, closing.uisCodes = E-CLOSING-WRONG-SOURCE, closing.day는 sales를 읽지 않는다")]
    public void BitExtras()
    {
        using var rig = new Rig { Today = ClosingFake.Day.AddDays(1) }.Registered();
        ClosingFake.Quiet(rig.Session);

        Outcome Handle(string cmd, string args, bool extras = true)
        {
            var outcome = new Outcome();
            var dispatcher = new Dispatcher(Table, (name, code) => outcome.Log.Add((name, code)));
            ClosingCommands.Register(dispatcher, rig.Services);
            if (extras) UisCommands.RegisterBitExtras(dispatcher);
            dispatcher.Handle(Encoding.UTF8.GetBytes(Requests.Envelope(cmd, args)), outcome.Sink);
            return outcome;
        }

        var source = DataOf(Handle("closing.source", "{}"));
        Assert.Equal(new[] { "source" }, DayKit.Keys(source));
        Assert.Equal("bit", source.GetProperty("source").GetString());
        Assert.Equal("E-CLOSING-WRONG-SOURCE", ErrorOf(Handle("closing.uisCodes", "{}")));

        const string groups = "\"groups\":[{\"key\":\"carm\",\"codes\":[\"CARM1\"]}]";
        var withSales = Handle("closing.day", "{\"date\":\"" + ClosingFake.DayText + "\"," + groups + ",\"sales\":[{\"key\":\"carm\",\"codes\":[\"ZZ9\"]}]}");
        var without = Handle("closing.day", "{\"date\":\"" + ClosingFake.DayText + "\"," + groups + "}", extras: false);
        Assert.Equal(without.Text, withSales.Text);
        var data = DataOf(withSales);
        Assert.False(data.TryGetProperty("source", out _));
        Assert.False(data.TryGetProperty("uis", out _));
        Assert.Equal(DataOf(Handle("closing.codes", "{}", extras: false)).GetRawText(), DataOf(Handle("closing.codes", "{}")).GetRawText());
    }

    // ---- 인자·오늘 뒤 날짜(AC-4210.3) -------------------------------------------------------------------

    [Fact(DisplayName = "AC-4210.3 오늘 뒤 날짜는 폴더에 닿기 전에 E-CLOSING-FUTURE-DATE, groups·sales에 같은 key 둘·건수 묶음이 아닌 key는 E-HELPER-BAD-MESSAGE")]
    public void BadArgsStopBeforeFolder()
    {
        using var rig = new UisRig();
        rig.Day.All();

        Assert.Equal("E-CLOSING-FUTURE-DATE", ErrorOf(rig.Handle("closing.day", Usual.Replace("2026-11-23", "2026-11-24"))));
        Assert.Equal("E-HELPER-BAD-MESSAGE", ErrorOf(rig.Handle("closing.day",
            "{\"date\":\"2026-11-23\",\"groups\":[{\"key\":\"carm\",\"codes\":[\"A\"]},{\"key\":\"carm\",\"codes\":[\"B\"]}]}")));
        Assert.Equal("E-HELPER-BAD-MESSAGE", ErrorOf(rig.Handle("closing.day",
            "{\"date\":\"2026-11-23\",\"groups\":[],\"sales\":[{\"key\":\"pt\",\"codes\":[\"A\"]},{\"key\":\"pt\",\"codes\":[\"B\"]}]}")));
        Assert.Equal("E-HELPER-BAD-MESSAGE", ErrorOf(rig.Handle("closing.day",
            "{\"date\":\"2026-11-23\",\"groups\":[{\"key\":\"pt\",\"codes\":[\"PT100\"]}]}")));
        Assert.Equal("E-HELPER-BAD-MESSAGE", ErrorOf(rig.Handle("closing.day",
            "{\"date\":\"2026-11-23\",\"groups\":[{\"key\":\"injection\",\"codes\":[\"PT100\"]}]}")));
        Assert.Equal(0, rig.FolderMade);
        Assert.Equal(6, rig.Day.Folder.Names.Count);
        Assert.Empty(rig.Day.Folder.Calls);

        // 오늘(시각은 보지 않음)은 된다
        rig.Today = new DateTime(2026, 11, 23, 0, 0, 1);
        Assert.Equal("uisarang", DataOf(rig.Handle("closing.day", Usual)).GetProperty("source").GetString());
    }

    [Fact(DisplayName = "AC-4210.3 UisDay.Check: 같은 key 둘·모르는 key·코드 0개·21개·21자는 E-HELPER-BAD-MESSAGE, 코드는 꼴 정리·겹침 뺌")]
    public void CheckArgs()
    {
        void Bad(UisArgs args)
        {
            var e = Assert.Throws<HelperException>(() => UisDay.Check(args));
            Assert.Equal("E-HELPER-BAD-MESSAGE", e.Code);
        }

        Bad(DayKit.Args(new[] { DayKit.G("carm", "A"), DayKit.G("carm", "B") }));
        Bad(DayKit.Args(sales: new[] { DayKit.G("etc1", "A"), DayKit.G("etc1", "B") }));
        Bad(DayKit.Args(new[] { DayKit.G("etc1", "A") }));
        Bad(DayKit.Args(sales: new[] { DayKit.G("ptVisit", "A") }));
        Bad(DayKit.Args(new[] { DayKit.G("carm") }));
        Bad(DayKit.Args(new[] { DayKit.G("carm", Enumerable.Range(0, 21).Select(i => "C" + i).ToArray()) }));
        Bad(DayKit.Args(new[] { DayKit.G("carm", new string('A', 21)) }));

        var ok = UisDay.Check(DayKit.Args(new[] { DayKit.G("carm", " ca100 ", "CA100", "prolo  c") }, new[] { DayKit.G("pt", "kk090") }));
        Assert.Equal(new[] { "CA100", "PROLO C" }, ok.Groups[0].Codes);
        Assert.Equal(new[] { "KK090" }, ok.Sales[0].Codes);
    }

    [Fact(DisplayName = "AC-4210.3 묶음의 amountPrefixes·amountCodes·exclude는 읽지 않고, 폴더를 못 만들면 E-UIS-FOLDER")]
    public void IgnoredFieldsAndFolderFailure()
    {
        using var rig = new UisRig();
        rig.Day.All();
        var data = DataOf(rig.Handle("closing.day",
            "{\"date\":\"2026-11-23\",\"groups\":[{\"key\":\"carm\",\"codes\":[\"CA100\"],\"amountPrefixes\":[\"CA\"],\"amountCodes\":[\"SO100\"]," +
            "\"exclude\":[{\"code\":\"CA100\",\"with\":[\"SO100\"]}]}]}"));
        Assert.Equal(4, data.GetProperty("groups")[0].GetProperty("patients").GetInt64());
        Assert.Equal(JsonValueKind.Null, data.GetProperty("groups")[0].GetProperty("total").ValueKind);

        rig.FolderFails = true;
        Assert.Equal("E-UIS-FOLDER", ErrorOf(rig.Handle("closing.day", Usual)));
        Assert.Equal("E-UIS-FOLDER", ErrorOf(rig.Handle("closing.uisCodes", "{}")));
    }

    // ---- 환자 표시 글자·기록(AC-4209.1·AC-4209.4) ---------------------------------------------------------

    [Fact(DisplayName = "AC-4209.1 성공·날짜 다름·종류 모름·깨짐·같은 종류 둘·코드 목록에서 답·기록 줄·모아 둔 값(복호 뒤)·예외 글에 환자 표시 글자·파일 이름이 없다")]
    public void NoPatientTextAnywhere()
    {
        var setups = new List<(string Cmd, Action<DayRig> Setup)>
        {
            ("closing.day", day => day.All()),
            ("closing.day", day => day.All().Fixture(DayKitNames.RsvPatients, "rsv-patients-other-day.xls").Fixture(DayKitNames.Income, "income-other-date.xls")),
            ("closing.day", day => day.All().Fixture("가-모르는 표.xls", "other-report.xls")),
            ("closing.day", day => day.All().Fixture("나-깨짐.xls", "broken.xls").Fixture("다-html.xls", "html.xls")),
            ("closing.day", day => day.All().Fixture("통계-내원일별환자현황-환자별 (1).xls", "visit-patients.xls")),
            ("closing.day", day => day.All().Fixture(DayKitNames.VisitPatients, "visit-patients-no-date.xls")),
            ("closing.uisCodes", day => day.All().Fixture(DayKitNames.Rx, "rx-3months.xls")),
        };
        foreach (var (cmd, setup) in setups)
        {
            using var rig = new UisRig();
            setup(rig.Day);
            var names = rig.Day.Folder.Names.ToArray();
            var outcome = rig.Handle(cmd, cmd == "closing.day" ? Usual : "{}");

            Assert.Null(outcome.Thrown);
            Assert.Single(outcome.Sink.Messages);
            var texts = new[]
            {
                ("답", outcome.Text),
                ("기록 줄", string.Join("\n", outcome.Lines)),
                ("모아 둔 값", rig.Day.CachePlain()),
            };
            foreach (var (where, text) in texts)
            {
                DayKit.NoMarkers(text, where);
                foreach (var name in names) Assert.DoesNotContain(name, text);
                Assert.DoesNotContain("ERP마감", text);
            }
        }
    }

    [Fact(DisplayName = "AC-4209.1 처리기 안에서 오류가 나도(폴더·인자·날짜) 예외 글·오류 답에 환자 표시 글자가 없다")]
    public void ErrorsCarryNoPatientText()
    {
        using var rig = new UisRig();
        rig.Day.All();
        rig.FolderFails = true;
        var outcomes = new[]
        {
            rig.Handle("closing.day", Usual),
            rig.Handle("closing.day", Usual.Replace("2026-11-23", "2026-12-01")),
            rig.Handle("closing.uisCodes", "{}"),
        };
        foreach (var outcome in outcomes)
        {
            Assert.Null(outcome.Thrown);
            DayKit.NoMarkers(outcome.Text, "오류 답");
        }

        var thrown = Assert.ThrowsAny<Exception>(() => UisDay.Check(DayKit.Args(new[] { DayKit.G("carm", "가짜환자01") , DayKit.G("carm", "9000001") })));
        DayKit.NoMarkers(thrown.ToString(), "예외 글");
    }

    [Fact(DisplayName = "AC-4209.4 의사랑 명령 진단 기록은 시각·명령 이름·오류 번호뿐(파일 이름·보고서 종류·숫자·폴더 경로 없음), 모아 둔 값을 못 쓰면 번호 하나 더")]
    public void LogIsNameAndCodeOnly()
    {
        using var rig = new UisRig();
        rig.Day.All();
        var all = new List<string>();
        all.AddRange(rig.Handle("closing.source", "{}").Lines);
        all.AddRange(rig.Handle("closing.day", Usual).Lines);
        all.AddRange(rig.Handle("closing.codes", "{}").Lines);
        all.AddRange(rig.Handle("closing.day", Usual.Replace("2026-11-23", "2026-11-25")).Lines);
        rig.Day.NewFolder().Fixture(DayKitNames.Rx, "rx-3months.xls");
        all.AddRange(rig.Handle("closing.uisCodes", "{}").Lines);

        // 모아 둔 값 자리가 파일이라 쓸 수 없음 → 답은 그대로, 기록에 번호 하나
        var blocker = rig.Day.Temp.Write("blocker", "x");
        rig.Day.Cache = new UisCache(blocker, rig.Day.Protector, () => rig.Day.Now);
        rig.Day.NewFolder();
        rig.Day.All();
        var failed = rig.Handle("closing.day", Usual);
        Assert.Equal("uisarang", DataOf(failed).GetProperty("source").GetString());
        all.AddRange(failed.Lines);

        Assert.Contains(all, line => line.EndsWith(" closing.day E-UIS-CACHE", StringComparison.Ordinal));
        Assert.Contains(all, line => line.EndsWith(" closing.source -", StringComparison.Ordinal));
        Assert.Contains(all, line => line.EndsWith(" closing.codes E-CLOSING-WRONG-SOURCE", StringComparison.Ordinal));
        Assert.Contains(all, line => line.EndsWith(" closing.day E-CLOSING-FUTURE-DATE", StringComparison.Ordinal));
        foreach (var line in all)
        {
            var parts = line.Split(' ');
            Assert.Equal(3, parts.Length);
            Assert.True(Table.Has(parts[1]), line);
            Assert.True(parts[2] == "-" || ErrorCodes.IsCode(parts[2]), line);
            foreach (var word in new[] { "통계", "xls", "income", "visitPatients", "ERP마감", "97", "5182300" }) Assert.DoesNotContain(word, parts[1] + parts[2]);
        }
    }
}

/// <summary>DayRig 파일 이름(정적 using 없이 부르려고).</summary>
internal static class DayKitNames
{
    public const string Income = DayRig.Income;
    public const string Rx = DayRig.Rx;
    public const string VisitPatients = DayRig.VisitPatients;
    public const string RsvPatients = DayRig.RsvPatients;
}
