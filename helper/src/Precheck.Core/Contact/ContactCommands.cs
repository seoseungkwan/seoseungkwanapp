using System;
using System.Linq;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Registration;

namespace Precheck.Core.Contact;

/// <summary>
/// 환자 탭 도우미 명령(REQ-606). store.load·store.save는 contact 칸 하나만 받는다. 명령 표(commands.json)의 다른 칸
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
}
