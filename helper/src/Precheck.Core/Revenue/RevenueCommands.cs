using System;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Registration;

namespace Precheck.Core.Revenue;

/// <summary>
/// revenue.days 처리기를 Dispatcher에 붙인다(숫자 명령, 답은 result 하나, design.md 5절). 맨 처음에 등록 확인 관문을 지난다.
/// 막히거나 읽기가 실패하면 HelperException 번호로 error 하나만 답한다(Dispatcher, AC-003.6).
/// </summary>
public static class RevenueCommands
{
    public const string Name = "revenue.days";

    public static void Register(Dispatcher dispatcher, BitServices services)
    {
        if (dispatcher == null) throw new ArgumentNullException(nameof(dispatcher));
        if (services == null) throw new ArgumentNullException(nameof(services));

        dispatcher.Register(Name, (request, sink) =>
        {
            RevenueResult result;
            using (var hospital = HospitalGate.Open(services))
            {
                result = RevenueDays.Read(hospital.Db, hospital.Registration.Scope, Day(request, "from"), Day(request, "to"));
            }
            sink.Send(Envelope.Result(request.Id, result));
        });
    }

    /// <summary>날짜 칸. 명령 표가 이미 검사했지만(CommandTable.Validate) 처리기만 불려도 틀린 글자로 읽지 않게 한 번 더 본다.</summary>
    private static DateTime Day(Request request, string name)
    {
        if (request.Args.ValueKind == JsonValueKind.Object
            && request.Args.TryGetProperty(name, out var value)
            && Envelope.TryGetString(value, out var text)
            && FieldSpec.TryParseDate(text, out var day))
        {
            return day;
        }
        throw new ProtocolException(ErrorCodes.BadMessage, request.Id);
    }
}
