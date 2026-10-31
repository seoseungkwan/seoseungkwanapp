using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Precheck.Core.Protocol;

/// <summary>웹 → 확장 → 도우미 요청 {v, id, cmd, args} (design.md 4-2).</summary>
public sealed class Request
{
    public int V;
    public string Id = "";
    public string Cmd = "";

    /// <summary>요청의 args. 보내는 명령(store.save·bit.input)은 CommandTable.Validate가 payload를 푼 안쪽 값으로 바꾼다.</summary>
    public JsonElement Args;
}

/// <summary>봉투 읽기·만들기. 답은 result · chunk · end · progress · error (design.md 4-2).</summary>
public static class Envelope
{
    /// <summary>답 봉투의 v. commands.json의 protocol과 같아야 한다(시험이 확인).</summary>
    public const int Version = 1;

    /// <summary>progress total의 상한(bit.input 묶음 500명, AC-004.10).</summary>
    public const int MaxProgressTotal = 500;

    // 답 글자: 한글을 \uXXXX로 바꾸지 않아 조각이 덜 커진다. 받는 쪽은 JSON.parse라 HTML 이스케이프가 필요 없다
    internal static readonly JsonWriterOptions WriterOptions = new JsonWriterOptions
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    internal static readonly JsonSerializerOptions SerializerOptions = new JsonSerializerOptions
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    internal static readonly JsonDocumentOptions DocumentOptions = new JsonDocumentOptions
    {
        AllowTrailingCommas = false,
        CommentHandling = JsonCommentHandling.Disallow,
        MaxDepth = 64,
    };

    private static readonly UTF8Encoding StrictUtf8 = new UTF8Encoding(false, true);

    // 요청 id: 웹이 만드는 UUID. 답에 그대로 돌려주므로 글자를 좁혀 둔다
    private static readonly Regex IdShape = new Regex(@"^[A-Za-z0-9-]{1,64}\z", RegexOptions.CultureInvariant);

    private static readonly HashSet<string> EnvelopeKeys = new HashSet<string>(StringComparer.Ordinal) { "v", "id", "cmd", "args" };

    public static bool IsValidId(string? id) => id != null && IdShape.IsMatch(id);

    /// <summary>요청 봉투를 푼다. JSON·봉투 모양이 틀리면 ProtocolException(E-HELPER-BAD-MESSAGE).</summary>
    public static Request Parse(byte[] utf8Json)
    {
        if (utf8Json == null) throw new ArgumentNullException(nameof(utf8Json));

        JsonDocument document;
        try
        {
            StrictUtf8.GetCharCount(utf8Json);
            document = JsonDocument.Parse(utf8Json, DocumentOptions);
        }
        catch (JsonException)
        {
            throw new ProtocolException(ErrorCodes.BadMessage);
        }
        catch (ArgumentException)
        {
            // 잘못된 UTF-8(DecoderFallbackException은 ArgumentException)
            throw new ProtocolException(ErrorCodes.BadMessage);
        }

        using (document)
        {
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object) throw new ProtocolException(ErrorCodes.BadMessage);

            string? id = null;
            try
            {
                id = FindId(root);
                return ReadEnvelope(root, id);
            }
            catch (InvalidOperationException)
            {
                // 글자·열쇠에 짝 없는 대리쌍 이스케이프(\uD800 등): JSON 문법은 맞아도 글자로 풀 수 없다
                throw Bad(id);
            }
        }
    }

    private static Request ReadEnvelope(JsonElement root, string? id)
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var request = new Request();
        foreach (var property in root.EnumerateObject())
        {
            if (!EnvelopeKeys.Contains(property.Name) || !seen.Add(property.Name)) throw Bad(id);
            var value = property.Value;
            switch (property.Name)
            {
                case "v":
                    if (value.ValueKind != JsonValueKind.Number || !value.TryGetInt32(out request.V)) throw Bad(id);
                    break;
                case "id":
                    if (id == null) throw Bad(null);
                    request.Id = id;
                    break;
                case "cmd":
                    if (value.ValueKind != JsonValueKind.String) throw Bad(id);
                    request.Cmd = value.GetString() ?? "";
                    break;
                case "args":
                    if (value.ValueKind != JsonValueKind.Object) throw Bad(id);
                    request.Args = value.Clone();
                    break;
            }
        }
        if (seen.Count != EnvelopeKeys.Count) throw Bad(id);
        return request;
    }

    /// <summary>답 봉투의 맨 위 type 값("result"·"chunk"…). 없거나 읽을 수 없으면 null. 다른 칸은 풀지 않고 건너뛴다.</summary>
    internal static string? ReadType(byte[] utf8Json)
    {
        try
        {
            var reader = new Utf8JsonReader(utf8Json);
            if (!reader.Read() || reader.TokenType != JsonTokenType.StartObject) return null;
            while (reader.Read() && reader.TokenType == JsonTokenType.PropertyName)
            {
                var isType = reader.ValueTextEquals("type");
                if (!reader.Read()) return null;
                if (isType) return reader.TokenType == JsonTokenType.String ? reader.GetString() : null;
                reader.Skip();
            }
            return null;
        }
        catch (JsonException)
        {
            return null;
        }
        catch (InvalidOperationException)
        {
            return null;
        }
    }

    /// <summary>JSON 글자를 꺼낸다. 짝 없는 대리쌍 이스케이프라 풀 수 없으면 false(STJ의 GetString은 던진다).</summary>
    internal static bool TryGetString(JsonElement value, out string text)
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

    public static byte[] Result(string id, object data)
    {
        RequireId(id);
        if (data == null) throw new ArgumentNullException(nameof(data));
        return Write(writer =>
        {
            WriteHead(writer, id, "result");
            writer.WritePropertyName("data");
            JsonSerializer.Serialize(writer, data, data.GetType(), SerializerOptions);
        });
    }

    /// <summary>오류 답. id는 모를 때 빈 글자. code는 'E-…' 모양만 받는다(다른 글자를 답에 싣지 않는다).</summary>
    public static byte[] Error(string id, string code)
    {
        if (id == null || (id.Length > 0 && !IsValidId(id))) throw new ArgumentException("id 모양이 틀렸다", nameof(id));
        if (!ErrorCodes.IsCode(code)) throw new ArgumentException("오류 번호 모양이 틀렸다", nameof(code));
        return Write(writer =>
        {
            WriteHead(writer, id, "error");
            writer.WriteString("code", code);
        });
    }

    public static byte[] Progress(string id, int done, int total)
    {
        RequireId(id);
        if (total < 0 || total > MaxProgressTotal) throw new ArgumentOutOfRangeException(nameof(total));
        if (done < 0 || done > total) throw new ArgumentOutOfRangeException(nameof(done));
        return Write(writer =>
        {
            WriteHead(writer, id, "progress");
            writer.WriteNumber("done", done);
            writer.WriteNumber("total", total);
        });
    }

    internal static void RequireId(string id)
    {
        if (!IsValidId(id)) throw new ArgumentException("id 모양이 틀렸다", nameof(id));
    }

    internal static void WriteHead(Utf8JsonWriter writer, string id, string type)
    {
        writer.WriteNumber("v", Version);
        writer.WriteString("id", id);
        writer.WriteString("type", type);
    }

    internal static byte[] Write(Action<Utf8JsonWriter> body)
    {
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer, WriterOptions))
        {
            writer.WriteStartObject();
            body(writer);
            writer.WriteEndObject();
        }
        return buffer.ToArray();
    }

    /// <summary>봉투가 틀려도 id가 하나뿐이고 모양이 바르면 오류 답에 싣는다.</summary>
    private static string? FindId(JsonElement root)
    {
        string? found = null;
        var count = 0;
        foreach (var property in root.EnumerateObject())
        {
            if (property.Name != "id") continue;
            count++;
            if (property.Value.ValueKind == JsonValueKind.String) found = property.Value.GetString();
        }
        return count == 1 && IsValidId(found) ? found : null;
    }

    private static ProtocolException Bad(string? id) => new ProtocolException(ErrorCodes.BadMessage, id);
}
