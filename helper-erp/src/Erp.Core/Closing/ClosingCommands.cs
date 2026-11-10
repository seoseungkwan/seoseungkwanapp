using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Registration;

namespace Erp.Core.Closing;

/// <summary>
/// closing.codes·closing.day 처리기를 Dispatcher에 붙인다(spec erp-closing-fill design.md 3-4). 둘 다 숫자 명령(patient: false)이라
/// 답은 result 하나다. 맨 처음에 등록 확인 관문을 지난다(revenue.days와 같음, AC-3606.3). 막히거나 읽기가 실패하면
/// HelperException 번호로 error 하나만 답하고, 진단 기록에는 Dispatcher가 명령 이름·오류 번호만 남긴다.
/// ERP 도우미 명령 표(helper-erp/commands.json, ErpCommandTable)에만 있는 이름이라 ERP 도우미에서만 붙는다(AC-3601.3).
/// </summary>
public static class ClosingCommands
{
    public const string CodesName = "closing.codes";
    public const string DayName = "closing.day";

    // 명령 표의 date 칸 꼴(기존 FieldSpec.TryParseDate와 같다. 그 클래스는 Precheck.Core 안에서만 보인다)
    private static readonly Regex DateShape = new Regex(@"^[0-9]{4}-[0-9]{2}-[0-9]{2}\z", RegexOptions.CultureInvariant);

    public static void Register(Dispatcher dispatcher, BitServices services)
    {
        if (dispatcher == null) throw new ArgumentNullException(nameof(dispatcher));
        if (services == null) throw new ArgumentNullException(nameof(services));

        dispatcher.Register(CodesName, (request, sink) =>
        {
            ClosingCodesResult result;
            using (var hospital = HospitalGate.Open(services))
            {
                result = ClosingCodes.Read(hospital.Db, hospital.Registration.Scope, services.Today());
            }
            sink.Send(Envelope.Result(request.Id, result));
        });

        dispatcher.Register(DayName, (request, sink) =>
        {
            ClosingDayResult result;
            using (var hospital = HospitalGate.Open(services))
            {
                // 같은 key 두 번 같은 묶음 검사는 ClosingDay.Read가 DB에 닿기 전에 한다(E-HELPER-BAD-MESSAGE)
                result = ClosingDay.Read(hospital.Db, hospital.Registration.Scope, Day(request), Groups(request));
            }
            sink.Send(Envelope.Result(request.Id, result));
        });
    }

    /// <summary>date 칸. 명령 표가 이미 검사했지만(CommandTable.Validate) 처리기만 불려도 틀린 글자로 읽지 않게 한 번 더 본다.</summary>
    private static DateTime Day(Request request)
    {
        if (Field(request, "date", out var value)
            && TryGetString(value, out var text)
            && TryParseDate(text, out var day))
        {
            return day;
        }
        throw Bad(request);
    }

    /// <summary>groups 칸을 [{key, codes}] 목록으로 푼다. 모양이 틀리면 E-HELPER-BAD-MESSAGE.</summary>
    private static IReadOnlyList<ClosingGroup> Groups(Request request)
    {
        if (!Field(request, "groups", out var value) || value.ValueKind != JsonValueKind.Array) throw Bad(request);
        var groups = new List<ClosingGroup>();
        foreach (var item in value.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object
                || !item.TryGetProperty("key", out var keyValue) || !TryGetString(keyValue, out var key)
                || !item.TryGetProperty("codes", out var codesValue) || codesValue.ValueKind != JsonValueKind.Array)
            {
                throw Bad(request);
            }
            var codes = new List<string>();
            foreach (var codeValue in codesValue.EnumerateArray())
            {
                if (!TryGetString(codeValue, out var code)) throw Bad(request);
                codes.Add(code);
            }
            groups.Add(new ClosingGroup(key, codes));
        }
        return groups;
    }

    private static bool Field(Request request, string name, out JsonElement value)
    {
        value = default;
        return request.Args.ValueKind == JsonValueKind.Object && request.Args.TryGetProperty(name, out value);
    }

    private static ProtocolException Bad(Request request) => new ProtocolException(ErrorCodes.BadMessage, request.Id);

    /// <summary>JSON 글자를 꺼낸다. 짝 없는 대리쌍 이스케이프라 풀 수 없으면 false(기존 Envelope.TryGetString과 같다. 그것은 Precheck.Core 안에서만 보인다).</summary>
    private static bool TryGetString(JsonElement value, out string text)
    {
        text = "";
        if (value.ValueKind != JsonValueKind.String) return false;
        try
        {
            text = value.GetString() ?? "";
            return true;
        }
        catch (InvalidOperationException)
        {
            return false;
        }
    }

    /// <summary>'yyyy-MM-dd' 날짜(기존 FieldSpec.TryParseDate와 같다).</summary>
    private static bool TryParseDate(string? text, out DateTime date)
    {
        date = default;
        return text != null && DateShape.IsMatch(text)
            && DateTime.TryParseExact(text, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out date);
    }
}
