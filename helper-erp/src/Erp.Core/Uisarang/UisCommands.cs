using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Precheck.Core.Protocol;

namespace Erp.Core.Uisarang;

/// <summary>
/// 의사랑·비트 자료원 명령 처리기를 Dispatcher에 붙인다(spec erp-uisarang design.md 3-1~3-5·4-1·4-3, REQ-4210).
/// - RegisterUisarang(의사랑 PC): closing.source = { source: 'uisarang' } · closing.day = UisDay(오늘 뒤 날짜는 폴더에 닿기 전에 E-CLOSING-FUTURE-DATE,
///   묶음 검사도 폴더 전에) · closing.uisCodes = UisCodes · closing.codes·closing.findCodes = E-CLOSING-WRONG-SOURCE
/// - RegisterBitExtras(비트 PC, 지금 ClosingCommands.Register 뒤 한 줄): closing.source = { source: 'bit' } · closing.uisCodes = E-CLOSING-WRONG-SOURCE.
///   비트의 다른 세 명령 처리기는 건드리지 않는다(closing.day의 sales는 비트 처리기가 읽지 않는다)
/// 의사랑 처리기는 등록 확인·비트·네트워크에 닿지 않는다(엑셀 폴더·모아 둔 값만). 막히면 HelperException 번호로 error 하나, 기록은 명령 이름·번호뿐.
/// 명령 이름·오늘 뒤 날짜 번호는 비트 쪽과 같은 글자다(비트 부품을 참조하지 않으려고 글자로 둔다).
/// </summary>
public static class UisCommands
{
    public const string SourceName = "closing.source";
    public const string CodesName = "closing.uisCodes";
    public const string DayName = "closing.day";

    /// <summary>비트 코드 목록·찾기 명령(의사랑 PC에서는 E-CLOSING-WRONG-SOURCE).</summary>
    public const string BitCodesName = "closing.codes";
    public const string FindCodesName = "closing.findCodes";

    /// <summary>비트 자료원에 closing.uisCodes, 의사랑 자료원에 closing.codes·closing.findCodes(design.md 3-5).</summary>
    public const string WrongSource = "E-CLOSING-WRONG-SOURCE";

    /// <summary>엑셀 폴더를 만들 수 없음·연결·목록을 못 읽음(UisDiskFolder가 낸다).</summary>
    public const string FolderFailed = UisDiskFolder.FolderFailed;

    /// <summary>closing.day date가 도우미 PC 오늘보다 뒤(비트 closing.day와 같은 번호).</summary>
    public const string FutureDate = "E-CLOSING-FUTURE-DATE";

    public const string BitSource = "bit";
    public const string UisarangSource = "uisarang";

    // 명령 표의 date 칸 꼴(비트 처리기와 같다)
    private static readonly Regex DateShape = new Regex(@"^[0-9]{4}-[0-9]{2}-[0-9]{2}\z", RegexOptions.CultureInvariant);

    public static void RegisterUisarang(Dispatcher dispatcher, UisServices services)
    {
        if (dispatcher == null) throw new ArgumentNullException(nameof(dispatcher));
        if (services == null) throw new ArgumentNullException(nameof(services));

        dispatcher.Register(SourceName, (request, sink) => sink.Send(Envelope.Result(request.Id, new UisSourceResult(UisarangSource))));

        dispatcher.Register(DayName, (request, sink) =>
        {
            // 오늘 뒤 날짜·묶음 검사는 폴더를 열기 전에(폴더 만들기도 하지 않는다)
            var day = Day(request);
            if (day > services.Today().Date) throw new HelperException(FutureDate);
            var args = UisDay.Check(Args(request));
            var folder = services.Folder();
            var result = UisDay.Read(folder, services.Cache, day, args, services.FolderKind, code => services.Log?.Invoke(DayName, code));
            sink.Send(Envelope.Result(request.Id, result));
        });

        dispatcher.Register(CodesName, (request, sink) => sink.Send(Envelope.Result(request.Id, UisCodes.Read(services.Folder()))));

        dispatcher.Register(BitCodesName, (request, sink) => throw new HelperException(WrongSource));
        dispatcher.Register(FindCodesName, (request, sink) => throw new HelperException(WrongSource));
    }

    public static void RegisterBitExtras(Dispatcher dispatcher)
    {
        if (dispatcher == null) throw new ArgumentNullException(nameof(dispatcher));
        dispatcher.Register(SourceName, (request, sink) => sink.Send(Envelope.Result(request.Id, new UisSourceResult(BitSource))));
        dispatcher.Register(CodesName, (request, sink) => throw new HelperException(WrongSource));
    }

    /// <summary>date 칸. 명령 표가 이미 검사했지만 처리기만 불려도 틀린 글자로 읽지 않게 한 번 더 본다.</summary>
    private static DateTime Day(Request request)
    {
        if (Field(request, "date", out var value)
            && TryGetString(value, out var text)
            && DateShape.IsMatch(text)
            && DateTime.TryParseExact(text, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day))
        {
            return day;
        }
        throw Bad();
    }

    /// <summary>groups(꼭)·sales(없으면 빈 목록)를 묶음 목록으로. 묶음의 amountPrefixes·amountCodes·exclude는 읽지 않는다(AC-4210.3).</summary>
    private static UisArgs Args(Request request)
    {
        if (!Field(request, "groups", out var groups)) throw Bad();
        var sales = Field(request, "sales", out var salesValue) ? Groups(salesValue) : new List<UisCodeGroup>();
        return new UisArgs(Groups(groups), sales);
    }

    private static List<UisCodeGroup> Groups(JsonElement value)
    {
        if (value.ValueKind != JsonValueKind.Array) throw Bad();
        var groups = new List<UisCodeGroup>();
        foreach (var item in value.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object
                || !item.TryGetProperty("key", out var keyValue) || !TryGetString(keyValue, out var key)
                || !item.TryGetProperty("codes", out var codesValue) || codesValue.ValueKind != JsonValueKind.Array)
            {
                throw Bad();
            }
            var codes = new List<string>();
            foreach (var code in codesValue.EnumerateArray())
            {
                if (!TryGetString(code, out var text)) throw Bad();
                codes.Add(text);
            }
            groups.Add(new UisCodeGroup(key, codes));
        }
        return groups;
    }

    private static bool Field(Request request, string name, out JsonElement value)
    {
        value = default;
        return request.Args.ValueKind == JsonValueKind.Object && request.Args.TryGetProperty(name, out value);
    }

    /// <summary>JSON 글자를 꺼낸다. 짝 없는 대리쌍 이스케이프라 풀 수 없으면 false.</summary>
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

    private static HelperException Bad() => new HelperException(ErrorCodes.BadMessage);
}

/// <summary>closing.source 답(design.md 3-4): { source: 'bit' | 'uisarang' }.</summary>
public sealed class UisSourceResult
{
    public UisSourceResult(string source) { Source = source ?? throw new ArgumentNullException(nameof(source)); }

    [JsonPropertyName("source")]
    public string Source { get; }
}
