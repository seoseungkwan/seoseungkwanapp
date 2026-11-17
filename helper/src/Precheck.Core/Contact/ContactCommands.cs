using System;
using System.Linq;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Calendar;
using Precheck.Core.Claim;
using Precheck.Core.Protocol;
using Precheck.Core.Registration;
using Precheck.Core.Sunap;

namespace Precheck.Core.Contact;

/// <summary>
/// 환자 탭 도우미 명령. contact.targets(REQ-605, RegisterTargets): F/U·정기 주사 대상 표(83·47)를 읽어 chunk … end로 보낸다(ContactTargets).
/// store.load·store.save(REQ-606, RegisterStore)는 contact 칸 하나만 받는다. 명령 표(commands.json)의 다른 칸
/// (month·months·drafts·done·journal·settings)은 청구 작업 저장, precheck TASK-15 몫이라 무엇이든 E-HELPER-BAD-MESSAGE로 거절한다.
/// 칸을 먼저 보고(비트를 건드리지 않음) → 등록 병원을 다시 확인한다(HospitalGate). 비트 세션은 프로필 ID만 얻고 바로 닫는다.
/// 진단 기록은 Dispatcher가 명령 이름·오류 번호만 남긴다. 여기서는 기록하지 않는다.
/// </summary>
public static class ContactCommands
{
    public const string StoreLoadName = "store.load";
    public const string StoreSaveName = "store.save";

    private const string ContactField = "contact";
    private const string Busy = "E-BRIDGE-BUSY";

    /// <summary>store.save가 다른 도우미 프로세스를 기다리는 시간(AC-606.5).</summary>
    private static readonly TimeSpan SaveWait = TimeSpan.FromSeconds(5);

    public static void RegisterStore(Dispatcher dispatcher, BitServices services, ContactStore store, IWorkLock workLock)
    {
        if (dispatcher == null) throw new ArgumentNullException(nameof(dispatcher));
        if (services == null) throw new ArgumentNullException(nameof(services));
        if (store == null) throw new ArgumentNullException(nameof(store));
        if (workLock == null) throw new ArgumentNullException(nameof(workLock));

        dispatcher.Register(StoreLoadName, (request, sink) =>
        {
            if (OnlyContact(request.Args).ValueKind != JsonValueKind.True) throw BadMessage();
            // 다 읽은 뒤에 나눠 보낸다: 읽다 실패하면 조각 없이 error다
            Chunker.Send(sink, request.Id, store.Load(RegisteredProfile(services)));
        });

        dispatcher.Register(StoreSaveName, (request, sink) =>
        {
            var contact = OnlyContact(request.Args);
            if (contact.ValueKind != JsonValueKind.Object) throw BadMessage();
            var profileId = RegisteredProfile(services);
            using (var held = workLock.TryEnter(SaveWait))
            {
                if (held == null) throw new HelperException(Busy);
                store.Save(profileId, contact.GetRawText());
            }
            sink.Send(Envelope.Result(request.Id, new { saved = true }));
        });
    }

    /// <summary>args의 칸이 contact 하나여야 한다. 그 값을 돌려준다.</summary>
    private static JsonElement OnlyContact(JsonElement args)
    {
        if (args.ValueKind != JsonValueKind.Object) throw BadMessage();
        var fields = args.EnumerateObject().ToList();
        if (fields.Count != 1 || !string.Equals(fields[0].Name, ContactField, StringComparison.Ordinal)) throw BadMessage();
        return fields[0].Value;
    }

    private static string RegisteredProfile(BitServices services)
    {
        using var hospital = HospitalGate.Open(services);
        return hospital.Registration.ProfileId;
    }

    private static HelperException BadMessage() => new HelperException(ErrorCodes.BadMessage);

    public const string TargetsName = "contact.targets";

    /// <summary>
    /// contact.targets {kind, from, to}(REQ-605). 명령 표가 kind·날짜 모양·1,100일을 이미 검사했다. kind로 처리기를 나눈다(spec patients-bit-lists AC-2801.5):
    /// followup·injection → 31일·오늘 이하를 다시 보고 등록 병원 확인 → 83·47 표(ContactTargets.Build). 비트 로그인은 도우미가 켜진 동안 기억한다
    /// (등록 하나에 StatsLogin 하나, claim.month와 같은 방식). reservation → ReservationTargets.Build, lapsed → LapsedTargets.Build(기간을 다시 보고
    /// 등록 병원 확인 → SQL 하나, 통계 화면·로그인 없음), sunap → SunapTargets.Build(수납일지 하루 장부, spec sunap-ilji),
    /// calfind·calday → CalendarTargets.Find·Day(예약 탭 비트 찾기·접수와 비트 예약, spec clinic-calendar). 선택 칸 q는 calfind만 받는다(다른 kind에 오면 비트를 건드리지 않고 E-HELPER-BAD-MESSAGE).
    /// 모두 다 만든 JSON을 chunk … end로 보낸다. 막히면 오류 번호 하나로 error(Dispatcher).
    /// 명령 이름은 그대로라 크롬 확장은 다시 올리지 않는다(확장은 명령 이름만 본다).
    /// </summary>
    public static void RegisterTargets(Dispatcher dispatcher, BitServices services)
    {
        if (dispatcher == null) throw new ArgumentNullException(nameof(dispatcher));
        if (services == null) throw new ArgumentNullException(nameof(services));
        var login = new StatsLogin();

        dispatcher.Register(TargetsName, (request, sink) =>
        {
            var (kind, from, to, q) = TargetsArgs(request);
            Chunker.Send(sink, request.Id, BuildTargets(services, login, kind, from, to, q));
        });
    }

    /// <summary>kind마다 처리기. 모르는 kind는 ContactTargets가 E-HELPER-BAD-MESSAGE로 막는다(명령 표가 먼저 막는다).</summary>
    private static string BuildTargets(BitServices services, StatsLogin login, string kind, DateTime from, DateTime to, string? q)
    {
        if (q != null && kind != CalendarTargets.FindKind) throw new ProtocolException(ErrorCodes.BadMessage);
        return kind switch
        {
            ReservationTargets.Kind => ReservationTargets.Build(services, from, to),
            LapsedTargets.Kind => LapsedTargets.Build(services, from, to),
            SunapTargets.Kind => SunapTargets.Build(services, from, to),
            CalendarTargets.FindKind => CalendarTargets.Find(services, from, to, q),
            CalendarTargets.DayKind => CalendarTargets.Day(services, from, to),
            _ => ContactTargets.Build(services, login, kind, from, to),
        };
    }

    /// <summary>kind·from·to와 선택 칸 q(명령 표가 글자 1~20자를 이미 검사했다, 없으면 null).</summary>
    private static (string Kind, DateTime From, DateTime To, string? Q) TargetsArgs(Request request)
    {
        if (request.Args.ValueKind != JsonValueKind.Object
            || !request.Args.TryGetProperty("kind", out var kindValue) || !Envelope.TryGetString(kindValue, out var kind)
            || !request.Args.TryGetProperty("from", out var fromValue) || !Envelope.TryGetString(fromValue, out var fromText) || !FieldSpec.TryParseDate(fromText, out var from)
            || !request.Args.TryGetProperty("to", out var toValue) || !Envelope.TryGetString(toValue, out var toText) || !FieldSpec.TryParseDate(toText, out var to))
        {
            throw new ProtocolException(ErrorCodes.BadMessage, request.Id);
        }
        string? q = null;
        if (request.Args.TryGetProperty("q", out var qValue))
        {
            if (!Envelope.TryGetString(qValue, out var qText)) throw new ProtocolException(ErrorCodes.BadMessage, request.Id);
            q = qText;
        }
        return (kind, from, to, q);
    }
}
