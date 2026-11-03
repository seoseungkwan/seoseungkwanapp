using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using Precheck.Core.Protocol;

namespace Precheck.Core.Input;

public enum InputStatus
{
    Cancelled,
    Finished,
    Stopped,
}

/// <summary>사람마다 결과 셋(AC-017.6).</summary>
public static class InputResults
{
    public const string Done = "완료";
    public const string Check = "확인 필요";
    public const string Skipped = "건너뜀";
}

public sealed class InputResult
{
    public InputResult(string visitKey, string result, string reason, string? previousMemo = null)
    {
        VisitKey = visitKey;
        Result = result;
        Reason = reason;
        PreviousMemo = previousMemo;
    }

    public string VisitKey { get; }
    public string Result { get; }
    public string Reason { get; }

    /// <summary>바꾼 사람의 원래 메모(AC-037.1). 다른 줄은 null이고 답에 칸을 쓰지 않는다.</summary>
    public string? PreviousMemo { get; }
}

/// <summary>묶음의 끝. Code는 멈춘 이유 번호, Reason은 원본 문구, Fields는 E-BIT-UI-CHANGED의 칸 ID 목록, Unconfirmed는 쓰다 멈춰 먼저 풀어야 할 진료(AC-035.4).</summary>
public sealed class InputOutcome
{
    private static readonly string[] NoFields = new string[0];
    private static readonly InputResult[] NoResults = new InputResult[0];
    private static readonly UnconfirmedVisit[] NoVisits = new UnconfirmedVisit[0];
    private static readonly InputItem[] NoItems = new InputItem[0];

    public InputOutcome(InputStatus status, string? code, string? reason, IReadOnlyList<string>? fields, IReadOnlyList<InputResult>? results, IReadOnlyList<UnconfirmedVisit>? unconfirmed = null, IReadOnlyList<InputItem>? excluded = null)
    {
        Unconfirmed = unconfirmed ?? NoVisits;
        Excluded = excluded ?? NoItems;
        Status = status;
        Code = code;
        Reason = reason;
        Fields = fields ?? NoFields;
        Results = results ?? NoResults;
    }

    public InputStatus Status { get; }
    public string? Code { get; }
    public string? Reason { get; }
    public IReadOnlyList<string> Fields { get; }
    public IReadOnlyList<InputResult> Results { get; }
    public IReadOnlyList<UnconfirmedVisit> Unconfirmed { get; }

    /// <summary>확인 창 앞에서 미리 뺀 사람(입력 기록의 달을 찾는 데만 쓴다, AC-035.2). 답에 싣지 않는다.</summary>
    public IReadOnlyList<InputItem> Excluded { get; }

    /// <summary>미리 뺀 사람과 그 건너뜀 결과를 더한 복사본.</summary>
    public InputOutcome WithExcluded(IReadOnlyList<InputItem> items, IReadOnlyList<InputResult> results) =>
        new InputOutcome(Status, Code, Reason, Fields, results.Concat(Results).ToList(), Unconfirmed, items);

    public static InputOutcome Cancelled() => new InputOutcome(InputStatus.Cancelled, null, null, null, null);

    /// <summary>번호를 바꾼 복사본(결과를 저장하지 못했을 때).</summary>
    public InputOutcome WithCode(string code) => new InputOutcome(Status, code, Reason, Fields, Results, Unconfirmed, Excluded);

    /// <summary>
    /// 조각으로 보낼 JSON: {status, code, reason, fields, results: [{visitKey, result, reason, previousMemo?}], unconfirmed?: [{visitKey, date}], noAsk}. previousMemo·unconfirmed는 있을 때만 칸을 쓴다.
    /// noAsk는 도우미의 묻지 않기 상태다(AC-037.4): 취소·멈춤에도 싣는다.
    /// </summary>
    public string ToJson(bool noAsk = false)
    {
        return Encoding.UTF8.GetString(Envelope.Write(writer =>
        {
            writer.WriteString("status", Status.ToString().ToLowerInvariant());
            WriteOptional(writer, "code", Code);
            WriteOptional(writer, "reason", Reason);
            writer.WriteStartArray("fields");
            foreach (var field in Fields) writer.WriteStringValue(field);
            writer.WriteEndArray();
            writer.WriteStartArray("results");
            foreach (var result in Results)
            {
                writer.WriteStartObject();
                writer.WriteString("visitKey", result.VisitKey);
                writer.WriteString("result", result.Result);
                writer.WriteString("reason", result.Reason);
                if (result.PreviousMemo != null) writer.WriteString("previousMemo", result.PreviousMemo);
                writer.WriteEndObject();
            }
            writer.WriteEndArray();
            if (Unconfirmed.Count > 0)
            {
                writer.WriteStartArray("unconfirmed");
                foreach (var visit in Unconfirmed)
                {
                    writer.WriteStartObject();
                    writer.WriteString("visitKey", visit.VisitKey);
                    writer.WriteString("date", visit.Date);
                    writer.WriteEndObject();
                }
                writer.WriteEndArray();
            }
            writer.WriteBoolean("noAsk", noAsk);
        }));
    }

    private static void WriteOptional(Utf8JsonWriter writer, string name, string? value)
    {
        if (value == null) writer.WriteNull(name);
        else writer.WriteString(name, value);
    }
}
