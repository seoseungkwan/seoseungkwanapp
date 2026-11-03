using System;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;

namespace Precheck.Core.Claim;

/// <summary>
/// claim.dates·claim.month·claim.memos 처리기를 Dispatcher에 붙인다(BitCommands.Register가 부른다). args {from, to}는 명령 표가 이미 검사했다
/// (날짜 모양, claim.month 35일·claim.dates·claim.memos 400일). 모두 처음에 등록 병원을 다시 확인한다(HospitalGate, AC-005.6).
/// claim.dates는 숫자만이라 result, claim.month·claim.memos는 환자 자료라 다 만든 JSON을 chunk … end로 보낸다(AC-001.5).
/// 막히면 BitException·ProtocolException 번호 하나로 error(Dispatcher). 기록에는 명령 이름과 번호만 남는다.
/// </summary>
public static class ClaimCommands
{
    public const string DatesName = "claim.dates";
    public const string MonthName = "claim.month";
    public const string MemosName = "claim.memos";

    public static void Register(Dispatcher dispatcher, BitServices services)
    {
        if (dispatcher == null) throw new ArgumentNullException(nameof(dispatcher));
        if (services == null) throw new ArgumentNullException(nameof(services));
        var login = new StatsLogin();

        dispatcher.Register(DatesName, (request, sink) =>
        {
            var (from, to) = Period(request);
            sink.Send(Envelope.Result(request.Id, ClaimDates.Run(services, from, to)));
        });
        dispatcher.Register(MonthName, (request, sink) =>
        {
            var (from, to) = Period(request);
            var json = ClaimMonthPayload.Build(services, login, from, to);
            Chunker.Send(sink, request.Id, json);
        });
        dispatcher.Register(MemosName, (request, sink) =>
        {
            var (from, to) = Period(request);
            Chunker.Send(sink, request.Id, MemoRowsRead.Build(services, from, to));
        });
    }

    private static (DateTime From, DateTime To) Period(Request request)
    {
        if (request.Args.ValueKind != JsonValueKind.Object
            || !request.Args.TryGetProperty("from", out var fromValue) || !Envelope.TryGetString(fromValue, out var fromText) || !FieldSpec.TryParseDate(fromText, out var from)
            || !request.Args.TryGetProperty("to", out var toValue) || !Envelope.TryGetString(toValue, out var toText) || !FieldSpec.TryParseDate(toText, out var to))
        {
            throw new ProtocolException(ErrorCodes.BadMessage, request.Id);
        }
        return (from, to);
    }
}
