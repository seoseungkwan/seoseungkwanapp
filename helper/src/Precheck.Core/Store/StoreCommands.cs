using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Precheck.Core.Input;
using Precheck.Core.Protocol;

namespace Precheck.Core.Store;

/// <summary>
/// store.save·store.load 처리기(design.md 4-3). 칸 모양은 명령 표가 이미 검사했다(month 모양, 칸은 object).
/// open은 등록을 확인하고 저장소를 연다(WorkStore.ForRegistered). 등록 파일만 보고 비트 DB에는 붙지 않는다: 메모는 1초마다 저장되고,
/// 비트가 꺼져 있어도 고친 내용을 잃지 않아야 하며, 설정 사본·연락 표시는 비트를 읽는 명령이 아니다.
/// 파일은 작업 잠금(WorkLock)을 잡은 동안에만 쓴다(AC-017.10·AC-035.6). 5초 안에 못 잡으면 쓰지 않고 E-BRIDGE-BUSY다. 되살릴 일이 없는 store.load는 쓰지 않으므로 잠금 없이 읽는다.
/// </summary>
public static class StoreCommands
{
    public const string LoadName = "store.load";
    public const string SaveName = "store.save";

    /// <param name="tryLock">작업 잠금. 못 잡으면 null. 시험이 아니면 진짜 잠금을 쓴다.</param>
    public static void Register(Dispatcher dispatcher, Func<WorkStore> open, Func<IDisposable?>? tryLock = null)
    {
        if (dispatcher == null) throw new ArgumentNullException(nameof(dispatcher));
        if (open == null) throw new ArgumentNullException(nameof(open));
        var acquire = tryLock ?? (() => WorkLock.TryAcquire(WorkLock.StoreSaveWait));

        dispatcher.Register(SaveName, (request, sink) =>
        {
            Save(open, acquire, request);
            sink.Send(Envelope.Result(request.Id, new { saved = true }));
        });
        dispatcher.Register(LoadName, (request, sink) =>
        {
            var months = Months(request.Args);
            var settings = Flag(request.Args, "settings");
            var contact = Flag(request.Args, "contact");
            var store = open();
            var json = store.LoadWithoutRepair(months, settings, contact) ?? LoadRepairing(store, acquire, months, settings, contact);
            Chunker.Send(sink, request.Id, json);
        });
    }

    /// <summary>
    /// 웹이 보낸 journal은 모양만 보고 저장하지 않는다. 입력 기록은 도우미가 가지므로(TASK-17이 WorkStore.SaveMonth로 직접 쓴다)
    /// 입력 뒤에 늦게 도착한 저장이 기록을 되돌리거나 지우지 못한다.
    /// </summary>
    private static void Save(Func<WorkStore> open, Func<IDisposable?> acquire, Request request)
    {
        var args = request.Args;
        var month = args.TryGetProperty("month", out var monthValue) ? monthValue.GetString() : null;
        var drafts = Field(args, "drafts");
        var done = Field(args, "done");
        var contact = Field(args, "contact");
        var settings = Field(args, "settings");

        var hasMonthFields = drafts.HasValue || done.HasValue || args.TryGetProperty("journal", out _);
        if ((month != null) != hasMonthFields || (month == null && !contact.HasValue && !settings.HasValue))
        {
            throw new ProtocolException(ErrorCodes.BadMessage, request.Id);
        }

        using var workLock = acquire() ?? throw new HelperException(InputErrors.Busy);
        var store = open();
        if (drafts.HasValue || done.HasValue) store.SaveMonth(month!, drafts, done, journal: null);
        if (contact.HasValue) store.SaveContact(contact.Value);
        if (settings.HasValue) store.SaveSettings(settings.Value);
        store.Prune();
    }

    private static string LoadRepairing(WorkStore store, Func<IDisposable?> acquire, IReadOnlyList<string> months, bool settings, bool contact)
    {
        using var workLock = acquire() ?? throw new HelperException(InputErrors.Busy);
        return store.Load(months, settings, contact);
    }

    private static JsonElement? Field(JsonElement args, string name) =>
        args.TryGetProperty(name, out var value) ? value : (JsonElement?)null;

    private static bool Flag(JsonElement args, string name) =>
        args.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.True;

    private static IReadOnlyList<string> Months(JsonElement args) =>
        args.TryGetProperty("months", out var months)
            ? months.EnumerateArray().Select(month => month.GetString()!).ToList()
            : new List<string>();
}
