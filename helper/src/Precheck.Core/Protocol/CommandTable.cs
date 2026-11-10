using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Precheck.Core.Protocol;

/// <summary>
/// 명령 표 src/lib/bridge/commands.json(EmbeddedResource "commands.json"). 확장·웹·도우미가 같은 파일을 읽는다 (design.md 4-3).
/// Validate는 모르는 cmd를 E-HELPER-UNKNOWN-COMMAND, 틀린 args를 E-HELPER-BAD-MESSAGE로 막는다 (AC-001.2).
/// 맨 위 erp 구역(없어도 됨)은 새 확장 'ERP 마감일지 채우기'의 ID·공개키·명령이다. 부른 쪽(Caller) 구역에 없는 명령은
/// E-HELPER-UNKNOWN-COMMAND다 (spec erp-closing-fill design.md 3-1, AC-3601.3·AC-3601.4).
/// </summary>
public sealed class CommandTable
{
    private const string ResourceName = "commands.json";

    private static readonly Regex ExtensionIdShape = new Regex(@"^[a-p]{32}\z", RegexOptions.CultureInvariant);
    private static readonly Regex HostNameShape = new Regex(@"^[a-z0-9_]+(?:\.[a-z0-9_]+)*\z", RegexOptions.CultureInvariant);
    private static readonly Regex OriginShape = new Regex(@"^https://[a-z0-9-]+(?:\.[a-z0-9-]+)+\z", RegexOptions.CultureInvariant);
    private static readonly string[] RootKeys = { "protocol", "hostName", "origin", "extensionId", "extensionKey", "commands" };
    private const string ErpKey = "erp";
    private static readonly string[] ErpKeys = { "extensionId", "extensionKey", "commands" };

    private readonly Dictionary<string, CommandSpec> commands;
    private readonly List<string> names;
    private readonly Dictionary<string, CommandSpec> erpCommands;
    private readonly List<string> erpNames;

    private CommandTable(int protocol, string hostName, string origin, string extensionId, string extensionKey,
        Dictionary<string, CommandSpec> commands, List<string> names, ErpSection? erp)
    {
        Protocol = protocol;
        HostName = hostName;
        Origin = origin;
        ExtensionId = extensionId;
        ExtensionKey = extensionKey;
        this.commands = commands;
        this.names = names;
        ErpExtensionId = erp?.ExtensionId;
        ErpExtensionKey = erp?.ExtensionKey;
        erpCommands = erp?.Commands ?? new Dictionary<string, CommandSpec>(StringComparer.Ordinal);
        erpNames = erp?.Names ?? new List<string>();
    }

    public int Protocol { get; }
    public string HostName { get; }
    public string ExtensionId { get; }

    /// <summary>확장 manifest key에 넣는 공개키(DER, base64). 비밀이 아니다.</summary>
    public string ExtensionKey { get; }

    /// <summary>확장에 말할 수 있는 우리 사이트 origin 하나.</summary>
    public string Origin { get; }

    /// <summary>표에 적힌 차례대로의 명령 이름(commands 구역: 웹·기존 확장이 부르는 것).</summary>
    public IReadOnlyCollection<string> Names => names;

    /// <summary>새 확장의 ID. erp 구역이 없으면 null.</summary>
    public string? ErpExtensionId { get; }

    /// <summary>새 확장 manifest key에 넣는 공개키(DER, base64). 비밀이 아니다. erp 구역이 없으면 null.</summary>
    public string? ErpExtensionKey { get; }

    /// <summary>erp.commands 구역에 적힌 차례대로의 명령 이름(erp 구역이 없으면 비어 있음).</summary>
    public IReadOnlyCollection<string> ErpNames => erpNames;

    /// <summary>도우미 안에 실린 commands.json 바이트 그대로.</summary>
    public static byte[] EmbeddedBytes()
    {
        using var stream = typeof(CommandTable).Assembly.GetManifestResourceStream(ResourceName)
            ?? throw new InvalidDataException("명령 표(commands.json)가 도우미에 실려 있지 않다");
        using var buffer = new MemoryStream();
        stream.CopyTo(buffer);
        return buffer.ToArray();
    }

    public static CommandTable LoadEmbedded() => Parse(EmbeddedBytes());

    /// <summary>명령 표 JSON을 읽는다. 표 자체가 틀리면(모르는 열쇠·종류, 틀린 ID·origin) InvalidDataException.</summary>
    public static CommandTable Parse(byte[] utf8Json)
    {
        try
        {
            using var document = JsonDocument.Parse(utf8Json, Envelope.DocumentOptions);
            return FromRoot(document.RootElement);
        }
        catch (JsonException)
        {
            throw FieldSpec.Broken("JSON");
        }
    }

    /// <summary>두 구역(commands·erp.commands) 가운데 하나에 있는 이름인가(처리기 붙이기·기록 이름용).</summary>
    public bool Has(string cmd) => SpecOf(cmd) != null;

    public bool IsPatient(string cmd) => SpecOf(cmd)?.Patient == true;

    /// <summary>웹이 큰 글자를 보내는 명령(store.save·bit.input): args = {payload: 글자}.</summary>
    public bool IsSend(string cmd) => SpecOf(cmd)?.Send == true;

    /// <summary>PC 확인 창을 거치는 명령(bit.register·bit.input).</summary>
    public bool NeedsConfirm(string cmd) => SpecOf(cmd)?.Confirm == true;

    private CommandSpec? SpecOf(string cmd)
    {
        if (cmd == null) return null;
        return commands.TryGetValue(cmd, out var spec) || erpCommands.TryGetValue(cmd, out spec) ? spec : null;
    }

    /// <summary>
    /// 요청을 표로 검사한다. 보내는 명령은 payload 글자를 JSON으로 풀어 안쪽 모양으로 검사하고,
    /// 통과하면 r.Args를 푼 안쪽 값으로 바꾼다(처리기는 안쪽 값만 본다). 부른 쪽은 기존 확장(Caller.Web)으로 본다.
    /// </summary>
    public void Validate(Request r) => Validate(r, Caller.Web);

    /// <summary>부른 쪽 구역(Web = commands, Erp = erp.commands)에 없는 이름은 E-HELPER-UNKNOWN-COMMAND (AC-3601.3).</summary>
    public void Validate(Request r, Caller caller)
    {
        if (r == null) throw new ArgumentNullException(nameof(r));
        var section = caller switch
        {
            Caller.Web => commands,
            Caller.Erp => erpCommands,
            _ => throw new ArgumentOutOfRangeException(nameof(caller)),
        };
        if (!section.TryGetValue(r.Cmd ?? "", out var spec)) throw new ProtocolException(ErrorCodes.UnknownCommand, r.Id);

        JsonElement args;
        try
        {
            args = spec.Payload != null ? UnpackPayload(r.Args, spec.Payload, r.Id) : r.Args;
            if (spec.Payload == null && !FieldSpec.CheckObject(args, spec.Args)) throw Bad(r.Id);
            if (spec.MaxDays.HasValue) CheckPeriod(args, spec.MaxDays.Value, r.Id);
        }
        catch (InvalidOperationException)
        {
            // 칸 이름·글자에 짝 없는 대리쌍 이스케이프(\ud83d 등): JSON 문법은 맞아도 글자로 풀 수 없다.
            // 이모지 중간에서 잘린 메모를 JSON.stringify하면 생긴다. 도우미를 멈추지 않고 칸 오류로 답한다 (AC-001.1·AC-001.2)
            throw Bad(r.Id);
        }
        r.Args = args;
    }

    private static JsonElement UnpackPayload(JsonElement args, FieldSpec payload, string id)
    {
        if (args.ValueKind != JsonValueKind.Object) throw Bad(id);
        var properties = args.EnumerateObject().ToList();
        if (properties.Count != 1 || properties[0].Name != "payload"
            || !Envelope.TryGetString(properties[0].Value, out var payloadText))
        {
            throw Bad(id);
        }

        JsonElement inner;
        try
        {
            using var document = JsonDocument.Parse(payloadText, Envelope.DocumentOptions);
            inner = document.RootElement.Clone();
        }
        catch (JsonException)
        {
            throw Bad(id);
        }

        if (!FieldSpec.CheckObject(inner, payload.Fields!)) throw Bad(id);
        return inner;
    }

    /// <summary>기간: from ≤ to, 시작·끝 날을 함께 센 날 수 ≤ maxDays.</summary>
    private static void CheckPeriod(JsonElement args, int maxDays, string id)
    {
        if (!Envelope.TryGetString(args.GetProperty("from"), out var fromText) || !FieldSpec.TryParseDate(fromText, out var from)
            || !Envelope.TryGetString(args.GetProperty("to"), out var toText) || !FieldSpec.TryParseDate(toText, out var to))
        {
            throw Bad(id);
        }
        if (from > to || (to - from).Days + 1 > maxDays) throw Bad(id);
    }

    private static ProtocolException Bad(string id) => new ProtocolException(ErrorCodes.BadMessage, id);

    // ---- 표 읽기 ----------------------------------------------------------------------------------

    private static CommandTable FromRoot(JsonElement root)
    {
        if (root.ValueKind != JsonValueKind.Object) throw FieldSpec.Broken("root");
        var keys = root.EnumerateObject().Select(p => p.Name).ToList();
        var hasErp = keys.Contains(ErpKey);
        if (keys.Count != RootKeys.Length + (hasErp ? 1 : 0) || !RootKeys.All(keys.Contains)) throw FieldSpec.Broken("root");

        var protocolElement = root.GetProperty("protocol");
        if (protocolElement.ValueKind != JsonValueKind.Number || !protocolElement.TryGetInt32(out var protocol) || protocol < 1)
        {
            throw FieldSpec.Broken("protocol");
        }

        var hostName = ReadString(root, "hostName", HostNameShape, "hostName");
        var origin = ReadString(root, "origin", OriginShape, "origin");
        var extensionId = ReadString(root, "extensionId", ExtensionIdShape, "extensionId");
        var extensionKey = ReadKey(root, "extensionKey", "extensionKey");
        var commands = ReadCommands(root.GetProperty("commands"), "commands", out var names);

        var erp = hasErp ? ReadErp(root.GetProperty(ErpKey), extensionId, commands) : null;
        return new CommandTable(protocol, hostName, origin, extensionId, extensionKey, commands, names, erp);
    }

    /// <summary>erp 구역: extensionId·extensionKey·commands 셋뿐. ID는 기존 확장과 달라야 하고 명령 이름은 commands와 겹치지 않는다.</summary>
    private static ErpSection ReadErp(JsonElement element, string webExtensionId, Dictionary<string, CommandSpec> webCommands)
    {
        if (element.ValueKind != JsonValueKind.Object) throw FieldSpec.Broken(ErpKey);
        var keys = element.EnumerateObject().Select(p => p.Name).ToList();
        if (keys.Count != ErpKeys.Length || !ErpKeys.All(keys.Contains)) throw FieldSpec.Broken(ErpKey);

        var extensionId = ReadString(element, "extensionId", ExtensionIdShape, "erp.extensionId");
        if (string.Equals(extensionId, webExtensionId, StringComparison.Ordinal)) throw FieldSpec.Broken("erp.extensionId");
        var extensionKey = ReadKey(element, "extensionKey", "erp.extensionKey");
        var commands = ReadCommands(element.GetProperty("commands"), "erp.commands", out var names);
        if (names.Any(webCommands.ContainsKey)) throw FieldSpec.Broken("erp.commands");

        return new ErpSection(extensionId, extensionKey, commands, names);
    }

    private static Dictionary<string, CommandSpec> ReadCommands(JsonElement element, string where, out List<string> names)
    {
        if (element.ValueKind != JsonValueKind.Object) throw FieldSpec.Broken(where);
        var commands = new Dictionary<string, CommandSpec>(StringComparer.Ordinal);
        names = new List<string>();
        foreach (var property in element.EnumerateObject())
        {
            if (property.Name.Length == 0 || commands.ContainsKey(property.Name)) throw FieldSpec.Broken(where);
            commands[property.Name] = CommandSpec.Parse(property.Value, property.Name);
            names.Add(property.Name);
        }
        if (names.Count == 0) throw FieldSpec.Broken(where);
        return commands;
    }

    /// <summary>확장 공개키(DER, base64): 비지 않고 base64로 풀려야 한다.</summary>
    private static string ReadKey(JsonElement parent, string name, string where)
    {
        var text = ReadString(parent, name, null, where);
        try
        {
            if (Convert.FromBase64String(text).Length == 0) throw FieldSpec.Broken(where);
        }
        catch (FormatException)
        {
            throw FieldSpec.Broken(where);
        }
        return text;
    }

    private static string ReadString(JsonElement parent, string name, Regex? shape, string where)
    {
        var element = parent.GetProperty(name);
        var text = element.ValueKind == JsonValueKind.String ? element.GetString() ?? "" : "";
        if (text.Length == 0 || (shape != null && !shape.IsMatch(text))) throw FieldSpec.Broken(where);
        return text;
    }

    private sealed class ErpSection
    {
        public ErpSection(string extensionId, string extensionKey, Dictionary<string, CommandSpec> commands, List<string> names)
        {
            ExtensionId = extensionId;
            ExtensionKey = extensionKey;
            Commands = commands;
            Names = names;
        }

        public string ExtensionId { get; }
        public string ExtensionKey { get; }
        public Dictionary<string, CommandSpec> Commands { get; }
        public List<string> Names { get; }
    }

    private sealed class CommandSpec
    {
        private static readonly HashSet<string> Keys = new HashSet<string>(StringComparer.Ordinal) { "patient", "send", "confirm", "maxDays", "args" };

        public bool Patient { get; private set; }
        public bool Send { get; private set; }
        public bool Confirm { get; private set; }
        public int? MaxDays { get; private set; }
        public Dictionary<string, FieldSpec> Args { get; private set; } = new Dictionary<string, FieldSpec>(StringComparer.Ordinal);

        /// <summary>보내는 명령의 payload 칸(안쪽 모양 fields를 가진다).</summary>
        public FieldSpec? Payload { get; private set; }

        public static CommandSpec Parse(JsonElement element, string name)
        {
            if (element.ValueKind != JsonValueKind.Object) throw FieldSpec.Broken(name);
            var spec = new CommandSpec();
            var seen = new HashSet<string>(StringComparer.Ordinal);
            foreach (var property in element.EnumerateObject())
            {
                if (!Keys.Contains(property.Name) || !seen.Add(property.Name)) throw FieldSpec.Broken(name);
            }
            if (!seen.Contains("patient") || !seen.Contains("args")) throw FieldSpec.Broken(name);

            spec.Patient = ReadFlag(element, "patient", name);
            spec.Send = seen.Contains("send") && ReadFlag(element, "send", name);
            spec.Confirm = seen.Contains("confirm") && ReadFlag(element, "confirm", name);
            if (seen.Contains("maxDays"))
            {
                var days = element.GetProperty("maxDays");
                if (days.ValueKind != JsonValueKind.Number || !days.TryGetInt32(out var maxDays) || maxDays < 1) throw FieldSpec.Broken(name);
                spec.MaxDays = maxDays;
            }

            spec.Args = FieldSpec.ParseFields(element.GetProperty("args"), name, allowPayload: spec.Send);
            if (spec.Send)
            {
                // 보내는 명령의 args는 {payload} 하나(design.md 4-2 SendRequest)
                if (spec.Args.Count != 1 || !spec.Args.TryGetValue("payload", out var payload) || payload.Kind != "payload" || payload.Optional)
                {
                    throw FieldSpec.Broken(name);
                }
                spec.Payload = payload;
            }
            if (spec.MaxDays.HasValue)
            {
                var fields = spec.Payload?.Fields ?? spec.Args;
                foreach (var end in new[] { "from", "to" })
                {
                    if (!fields.TryGetValue(end, out var field) || field.Kind != "date" || field.Optional) throw FieldSpec.Broken(name);
                }
            }
            return spec;
        }

        private static bool ReadFlag(JsonElement element, string key, string name)
        {
            var value = element.GetProperty(key);
            if (value.ValueKind == JsonValueKind.True) return true;
            if (value.ValueKind == JsonValueKind.False) return false;
            throw FieldSpec.Broken(name);
        }
    }
}
