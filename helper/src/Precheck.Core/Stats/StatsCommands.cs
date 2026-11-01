using System;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Registration;

namespace Precheck.Core.Stats;

/// <summary>
/// stats.rows 처리기를 Dispatcher에 붙인다(AC-503.1). args {from, to}는 명령 표가 이미 검사했다(날짜, 800일 이하).
/// 처음에 등록 확인 관문 HospitalGate.Open(도우미 Commands/RequireHospital이 감싸는 같은 관문, Core에서 부를 수 있는 쪽)을
/// 지나고, 돌려받은 세션으로만 읽는다. 다 만든 JSON을 세션을 닫은 뒤 Chunker로 chunk … end에 보낸다.
/// 막히면 BitException 번호로 error 답만 간다(Dispatcher, 반쪽 자료 없음, AC-503.3).
/// </summary>
public static class StatsCommands
{
    public const string RowsName = "stats.rows";

    public static void Register(Dispatcher dispatcher, BitServices services)
    {
        if (dispatcher == null) throw new ArgumentNullException(nameof(dispatcher));
        if (services == null) throw new ArgumentNullException(nameof(services));

        dispatcher.Register(RowsName, (request, sink) =>
        {
            var from = Arg(request, "from");
            var to = Arg(request, "to");
            string json;
            using (var hospital = HospitalGate.Open(services))
            {
                var rows = StatsRows.Read(hospital.Db, hospital.Registration.Scope, from, to);
                json = StatsPayload.Build(from, to, rows, null);
            }
            Chunker.Send(sink, request.Id, json);
        });
    }

    private static string Arg(Request request, string name)
    {
        if (request.Args.ValueKind != JsonValueKind.Object
            || !request.Args.TryGetProperty(name, out var value)
            || !Envelope.TryGetString(value, out var text))
        {
            throw new HelperException(ErrorCodes.BadMessage);
        }
        return text;
    }
}
