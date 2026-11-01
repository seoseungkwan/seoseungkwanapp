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
    public InputResult(string visitKey, string result, string reason)
    {
        VisitKey = visitKey;
        Result = result;
        Reason = reason;
    }

    public string VisitKey { get; }
    public string Result { get; }
    public string Reason { get; }
}

/// <summary>묶음의 끝. Code는 멈춘 이유 번호, Reason은 원본 문구, Fields는 E-BIT-UI-CHANGED의 칸 ID 목록.</summary>
public sealed class InputOutcome
{
    private static readonly string[] NoFields = new string[0];
    private static readonly InputResult[] NoResults = new InputResult[0];

    public InputOutcome(InputStatus status, string? code, string? reason, IReadOnlyList<string>? fields, IReadOnlyList<InputResult>? results)
    {
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

    public static InputOutcome Cancelled() => new InputOutcome(InputStatus.Cancelled, null, null, null, null);

    /// <summary>번호를 바꾼 복사본(결과를 저장하지 못했을 때).</summary>
    public InputOutcome WithCode(string code) => new InputOutcome(Status, code, Reason, Fields, Results);

    /// <summary>조각으로 보낼 JSON: {status, code, reason, fields, results: [{visitKey, result, reason}]}.</summary>
    public string ToJson()
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
                writer.WriteEndObject();
            }
            writer.WriteEndArray();
        }));
    }

    private static void WriteOptional(Utf8JsonWriter writer, string name, string? value)
    {
        if (value == null) writer.WriteNull(name);
        else writer.WriteString(name, value);
    }
}
