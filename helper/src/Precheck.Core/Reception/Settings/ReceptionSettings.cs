using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Precheck.Core.Reception.Settings;

/// <summary>로고 모양 글(AC-5701.1).</summary>
public static class LogoModes
{
    /// <summary>로고 그림(data\reception-logo.dat, GET /api/logo).</summary>
    public const string Pic = "pic";

    /// <summary>병원 이름 글자(logo.text).</summary>
    public const string Text = "text";

    /// <summary>로고 없이.</summary>
    public const string None = "none";

    internal static bool IsMode(string? mode) => mode == Pic || mode == Text || mode == None;
}

/// <summary>칸 종류 글(AC-5701.2): 처방 칸은 처방으로 저절로 채우고, 직접 칸은 처방을 보지 않는다.</summary>
public static class ColKinds
{
    public const string Rx = "rx";
    public const string Mn = "mn";

    internal static bool IsKind(string? kind) => kind == Rx || kind == Mn;
}

/// <summary>
/// 설정 문서의 logo(AC-5701.1): mode는 pic·text·none, text는 null 또는 앞뒤 빈칸을 뺀 1~20글자(제어 글자·짝 없는 대리쌍 없음, mode text면 null 아님),
/// ver는 0 이상(0이면 로고 그림 파일이 없다는 뜻, 서버만 올린다). text는 mode가 text가 아닐 때도 남긴다(다시 text로 바꾸면 그 글).
/// </summary>
public sealed class LogoSetting
{
    public const int MaxText = 20;

    /// <summary>규칙에 어긋나면 ArgumentException. text는 앞뒤 빈칸을 뺀 글로 남는다.</summary>
    public LogoSetting(string mode, string? text, int ver)
    {
        if (!LogoModes.IsMode(mode)) throw new ArgumentException("로고 모양이 틀렸다", nameof(mode));
        if (ver < 0) throw new ArgumentException("로고 판 번호가 음수다", nameof(ver));
        if (mode == LogoModes.Text && text == null) throw new ArgumentException("병원 이름 글자 모양인데 글이 없다", nameof(text));
        Mode = mode;
        Text = text == null ? null : PickLists.CleanText(text, nameof(text), MaxText, true);
        Ver = ver;
    }

    public string Mode { get; }

    public string? Text { get; }

    public int Ver { get; }
}

/// <summary>처음 설정 안내(AC-5701.1·AC-5712.7): ① 로고 정함 ② 어레인지 탭 정함 ③ 다 함(done, 한 번 참이면 SettingsStore가 참으로 지킨다, AC-5701.8).</summary>
public sealed class SetupState
{
    public SetupState(bool logo, bool tab, bool done)
    {
        Logo = logo;
        Tab = tab;
        Done = done;
    }

    public bool Logo { get; }

    public bool Tab { get; }

    public bool Done { get; }
}

/// <summary>
/// 어레인지 칸 하나(AC-5701.2·AC-5701.3). 열쇠 k는 처음 일곱 칸(xray·sono·carm·pt·ds·eswt·trac) 또는 더한 칸 x1~x99, added는 더한 칸일 때만 참,
/// name은 앞뒤 빈칸을 뺀 1~10글자("|"·제어 글자 없음), kind는 rx·mn, steps는 2·3, rule은 xray 칸에만 있는 참·거짓(단순 촬영 G 코드 전부).
/// codes는 대문자로 바꾼 ^[0-9A-Z가-힣_]{1,16}$, 칸 안 겹침 없음, 40개까지(직접 칸에서도 남겨 둔다).
/// </summary>
public sealed class SettingsCol
{
    public const int MaxName = 10;
    public const int MaxCodes = 40;

    private static readonly Regex AddedKey = new Regex(@"^x[1-9][0-9]?\z", RegexOptions.CultureInvariant);
    private static readonly Regex CodeShape = new Regex(@"^[0-9A-Z가-힣_]{1,16}\z", RegexOptions.CultureInvariant);

    /// <summary>규칙에 어긋나면 ArgumentException(칸끼리의 규칙은 ReceptionSettings가 본다). name은 앞뒤 빈칸을 뺀 글, codes는 대문자로 남는다.</summary>
    public SettingsCol(string k, string name, string kind, int steps, bool show, bool added, bool? rule, IEnumerable<string> codes)
    {
        if (k == null) throw new ArgumentNullException(nameof(k));
        if (!ReceptionSettings.OriginalKeys.Contains(k, StringComparer.Ordinal) && !IsAddedKey(k)) throw new ArgumentException("칸 열쇠가 틀렸다", nameof(k));
        if (added != IsAddedKey(k)) throw new ArgumentException("더한 칸 표시가 열쇠와 맞지 않다", nameof(added));
        if (!ColKinds.IsKind(kind)) throw new ArgumentException("칸 종류가 틀렸다", nameof(kind));
        if (steps != 2 && steps != 3) throw new ArgumentException("칸 단계가 틀렸다", nameof(steps));
        if ((k == ReceptionSettings.XrayKey) != rule.HasValue) throw new ArgumentException("rule은 xray 칸에만 있다", nameof(rule));
        if (codes == null) throw new ArgumentNullException(nameof(codes));
        var upper = codes.Select(code => code == null ? throw new ArgumentNullException(nameof(codes)) : code.ToUpperInvariant()).ToArray();
        if (upper.Length > MaxCodes) throw new ArgumentException("처방 코드가 너무 많다", nameof(codes));
        if (!upper.All(code => CodeShape.IsMatch(code))) throw new ArgumentException("처방 코드 모양이 틀렸다", nameof(codes));
        if (upper.Distinct(StringComparer.Ordinal).Count() != upper.Length) throw new ArgumentException("한 칸 안에 같은 처방 코드가 있다", nameof(codes));

        K = k;
        Name = PickLists.CleanText(name, nameof(name), MaxName, false);
        Kind = kind;
        Steps = steps;
        Show = show;
        Added = added;
        Rule = rule;
        Codes = Array.AsReadOnly(upper);
    }

    /// <summary>칸 열쇠(판의 cells 열쇠).</summary>
    public string K { get; }

    /// <summary>칸 이름(머리·쓰는 법·안내 줄·띠 글).</summary>
    public string Name { get; }

    /// <summary>rx(처방 칸)·mn(직접 칸).</summary>
    public string Kind { get; }

    /// <summary>2 = 준비 → 완료, 3 = 준비 → 준비완료 → 완료.</summary>
    public int Steps { get; }

    public bool Show { get; }

    /// <summary>더한 칸(x1~x99)이면 참.</summary>
    public bool Added { get; }

    /// <summary>xray 칸만: 단순 촬영 G 코드 전부를 넣나. 다른 칸은 null.</summary>
    public bool? Rule { get; }

    /// <summary>이 칸에 넣을 처방 코드(대문자).</summary>
    public IReadOnlyList<string> Codes { get; }

    /// <summary>더한 칸 열쇠 모양(x1~x99)인가.</summary>
    public static bool IsAddedKey(string? k) => k != null && AddedKey.IsMatch(k);

    /// <summary>더한 칸 열쇠의 번호(x12 → 12). 더한 칸이 아니면 0.</summary>
    internal static int NumberOf(string k) => IsAddedKey(k) ? int.Parse(k.Substring(1), System.Globalization.CultureInfo.InvariantCulture) : 0;
}

/// <summary>
/// 접수 현황 설정 문서(spec reception-other-clinic design.md 1절, REQ-5701). 저장 파일 = GET /api/settings 답 = POST /api/settings 몸:
/// { rev, logo: { mode, text, ver }, tab, setup: { logo, tab, done }, nextX, cols: [{ k, name, kind, steps, show, added, (rule), codes }], picks }.
/// 모양 규칙(AC-5701.1~4)은 생성자 한 곳이 본다(어긋나면 ArgumentException). TryParse는 하나라도 빠지거나 더 있으면 받지 않는다.
/// 처음 값 둘: 우리 의원(Ours, AC-5701.5 — 지금 ArrangeMap 값 그대로)·새 병원(Fresh, AC-5701.6). 바꿀 수 없는 것은 ChangeProblem(AC-5704.2).
/// 고칠 수 없는 값이고, 바꾼 문서는 With…로 만든다.
/// </summary>
public sealed class ReceptionSettings
{
    public const int MaxCols = 12;

    public const string XrayKey = "xray";
    public const string SonoKey = "sono";
    public const string CarmKey = "carm";

    /// <summary>처음부터 있던 일곱 칸 열쇠(지금 표 차례).</summary>
    public static IReadOnlyList<string> OriginalKeys { get; } = Array.AsReadOnly(new[] { XrayKey, SonoKey, CarmKey, "pt", "ds", "eswt", "trac" });

    private static readonly UTF8Encoding StrictUtf8 = new UTF8Encoding(false, true);

    // 맨 위 객체 → picks → carm → procs 배열 → 시술 객체
    private static readonly JsonDocumentOptions DocumentJson = new JsonDocumentOptions { MaxDepth = 5 };

    // 우리 의원 처음 값의 처방 코드(spec reception-arrange REQ-3311, 사용자 결정 2026-11-09 — 지금 ArrangeMap.Rules와 같은 코드)
    private static readonly string[] OurSonoCodes = { "SONO1", "SONO", "EB422", "EB466", "HA280" };
    private static readonly string[] OurCarmCodes = { "CARM1", "G0400" };

    /// <summary>모양 규칙(AC-5701.1~4)에 어긋나면 ArgumentException(null이면 ArgumentNullException).</summary>
    public ReceptionSettings(long rev, LogoSetting logo, bool tab, SetupState setup, int nextX, IEnumerable<SettingsCol> cols, PickLists picks)
    {
        if (rev < 0) throw new ArgumentException("rev가 음수다", nameof(rev));
        if (nextX < 0) throw new ArgumentException("nextX가 음수다", nameof(nextX));
        Logo = logo ?? throw new ArgumentNullException(nameof(logo));
        Setup = setup ?? throw new ArgumentNullException(nameof(setup));
        Picks = picks ?? throw new ArgumentNullException(nameof(picks));
        if (cols == null) throw new ArgumentNullException(nameof(cols));
        var list = cols.Select(col => col ?? throw new ArgumentNullException(nameof(cols))).ToArray();

        if (list.Length > MaxCols) throw new ArgumentException("칸이 12개를 넘는다", nameof(cols));
        foreach (var key in OriginalKeys)
        {
            if (list.Count(col => col.K == key) != 1) throw new ArgumentException("처음 일곱 칸이 한 번씩 있지 않다", nameof(cols));
        }
        var added = list.Where(col => col.Added).Select(col => col.K).ToArray();
        if (added.Distinct(StringComparer.Ordinal).Count() != added.Length) throw new ArgumentException("더한 칸 열쇠가 겹친다", nameof(cols));
        if (added.Any(k => SettingsCol.NumberOf(k) >= nextX)) throw new ArgumentException("더한 칸 번호가 nextX보다 작지 않다", nameof(nextX));
        if (!list.Any(col => col.Show)) throw new ArgumentException("보이는 칸이 없다", nameof(cols));
        if (list.Select(col => col.Name).Distinct(StringComparer.Ordinal).Count() != list.Length) throw new ArgumentException("칸 이름이 겹친다", nameof(cols));
        if (Picks.Extra.Count != added.Length || !added.All(k => Picks.Extra.ContainsKey(k)))
            throw new ArgumentException("더한 칸 목록 열쇠가 더한 칸과 다르다", nameof(picks));

        Rev = rev;
        Tab = tab;
        NextX = nextX;
        Cols = Array.AsReadOnly(list);
    }

    /// <summary>저장할 때마다 1 오른다(rev가 다른 저장은 409, AC-5704.2).</summary>
    public long Rev { get; }

    public LogoSetting Logo { get; }

    /// <summary>어레인지 탭을 쓰나.</summary>
    public bool Tab { get; }

    public SetupState Setup { get; }

    /// <summary>다음 더한 칸 열쇠 번호(x{nextX}). 칸을 빼도 줄이지 않는다.</summary>
    public int NextX { get; }

    /// <summary>표 차례 그대로의 칸(숨긴 칸 포함).</summary>
    public IReadOnlyList<SettingsCol> Cols { get; }

    /// <summary>고르기 목록 + 더한 칸 목록(Extra 열쇠 = 더한 칸 열쇠).</summary>
    public PickLists Picks { get; }

    /// <summary>
    /// 우리 의원 처음 값(AC-5701.5): 로고 pic(text null·ver 1 = 품은 로고 그림을 옮김)·탭 켜짐·setup 셋 다 참·nextX 1·일곱 칸
    /// X-RAY(rx·2단계·rule 참)·SONO(rx·3·SONO1·SONO·EB422·EB466·HA280)·C-ARM(rx·3·CARM1·G0400)·PT·도수·충격파·견인(mn·2), 모두 보임,
    /// picks는 받은 목록(옛 reception-lists.dat를 읽은 값)에 extra {}. rev 0.
    /// </summary>
    public static ReceptionSettings Ours(PickLists picks)
    {
        if (picks == null) throw new ArgumentNullException(nameof(picks));
        return Initial(new LogoSetting(LogoModes.Pic, null, 1), new SetupState(true, true, true), OurSonoCodes, OurCarmCodes, picks);
    }

    /// <summary>
    /// 새 병원 처음 값(AC-5701.6): 로고 none·text null·ver 0·탭 켜짐·setup 셋 다 거짓·일곱 칸은 우리 의원과 같되 SONO·C-ARM codes 없음,
    /// picks는 지금 기본 목록 + extra {}. rev 0.
    /// </summary>
    public static ReceptionSettings Fresh() =>
        Initial(new LogoSetting(LogoModes.None, null, 0), new SetupState(false, false, false), new string[0], new string[0], PickLists.Defaults);

    private static ReceptionSettings Initial(LogoSetting logo, SetupState setup, string[] sono, string[] carm, PickLists picks)
    {
        var empty = new string[0];
        var cols = new[]
        {
            new SettingsCol(XrayKey, "X-RAY", ColKinds.Rx, 2, true, false, true, empty),
            new SettingsCol(SonoKey, "SONO", ColKinds.Rx, 3, true, false, null, sono),
            new SettingsCol(CarmKey, "C-ARM", ColKinds.Rx, 3, true, false, null, carm),
            new SettingsCol("pt", "PT", ColKinds.Mn, 2, true, false, null, empty),
            new SettingsCol("ds", "도수", ColKinds.Mn, 2, true, false, null, empty),
            new SettingsCol("eswt", "충격파", ColKinds.Mn, 2, true, false, null, empty),
            new SettingsCol("trac", "견인", ColKinds.Mn, 2, true, false, null, empty),
        };
        return new ReceptionSettings(0, logo, true, setup, 1, cols, picks.WithExtra(new KeyValuePair<string, IReadOnlyList<string>>[0]));
    }

    /// <summary>rev만 바꾼 사본.</summary>
    public ReceptionSettings WithRev(long rev) => new ReceptionSettings(rev, Logo, Tab, Setup, NextX, Cols, Picks);

    /// <summary>logo만 바꾼 사본(로고 올리기는 서버가 ver를 올린다).</summary>
    public ReceptionSettings WithLogo(LogoSetting logo) => new ReceptionSettings(Rev, logo, Tab, Setup, NextX, Cols, Picks);

    /// <summary>setup만 바꾼 사본.</summary>
    public ReceptionSettings WithSetup(SetupState setup) => new ReceptionSettings(Rev, Logo, Tab, setup, NextX, Cols, Picks);

    /// <summary>
    /// 이 문서(저장된 것)에서 next로 바꿀 수 없는 것(AC-5704.2가 400으로 답함): "nextX"(줄이기)·"logo.ver"(바꾸기, 서버만 올림)·"logo.mode"(ver 0 = 로고 그림 파일이 없는데 pic).
    /// 문제가 없으면 null. 뺀 더한 칸을 같은 열쇠로 되살리는 것은 된다(열쇠가 nextX보다 작으면 모양 규칙 안). rev는 보지 않는다(SettingsStore가 본다).
    /// </summary>
    public IReadOnlyList<string>? ChangeProblem(ReceptionSettings next)
    {
        if (next == null) throw new ArgumentNullException(nameof(next));
        var problems = new List<string>();
        if (next.NextX < NextX) problems.Add("nextX");
        if (next.Logo.Ver != Logo.Ver) problems.Add("logo.ver");
        if (next.Logo.Mode == LogoModes.Pic && next.Logo.Ver == 0) problems.Add("logo.mode");
        return problems.Count == 0 ? null : problems.AsReadOnly();
    }

    /// <summary>
    /// 몸·파일 글이 설정 문서 모양(AC-5701.1~4)뿐인 바른 UTF-8 JSON인가. 칸 차례는 상관없고 같은 칸 두 번·모르는 칸·빠진 칸은 틀림이다.
    /// 아니면 false이고 settings는 새 병원 처음 값이다. 던지지 않는다.
    /// </summary>
    public static bool TryParse(byte[] json, out ReceptionSettings settings)
    {
        settings = Fresh();
        if (json == null) return false;
        try
        {
            using var document = JsonDocument.Parse(StrictUtf8.GetString(json), DocumentJson);
            var root = document.RootElement;
            if (!HasExactly(root, "rev", "logo", "tab", "setup", "nextX", "cols", "picks")) return false;

            var logo = root.GetProperty("logo");
            var setup = root.GetProperty("setup");
            var cols = root.GetProperty("cols");
            if (!HasExactly(logo, "mode", "text", "ver") || !HasExactly(setup, "logo", "tab", "done") || cols.ValueKind != JsonValueKind.Array) return false;
            if (!TryLong(root.GetProperty("rev"), out var rev) || !TryInt(root.GetProperty("nextX"), out var nextX)) return false;
            if (!TryBool(root.GetProperty("tab"), out var tab)
                || !TryBool(setup.GetProperty("logo"), out var setupLogo)
                || !TryBool(setup.GetProperty("tab"), out var setupTab)
                || !TryBool(setup.GetProperty("done"), out var setupDone)) return false;

            var mode = logo.GetProperty("mode");
            var text = logo.GetProperty("text");
            if (mode.ValueKind != JsonValueKind.String || (text.ValueKind != JsonValueKind.String && text.ValueKind != JsonValueKind.Null)) return false;
            if (!TryInt(logo.GetProperty("ver"), out var ver)) return false;

            if (cols.GetArrayLength() > MaxCols) return false;
            var list = new List<SettingsCol>();
            foreach (var col in cols.EnumerateArray())
            {
                if (!TryCol(col, out var read)) return false;
                list.Add(read);
            }
            if (!PickLists.TryReadWithExtra(root.GetProperty("picks"), out var picks)) return false;

            settings = new ReceptionSettings(
                rev,
                new LogoSetting(mode.GetString()!, text.ValueKind == JsonValueKind.Null ? null : text.GetString(), ver),
                tab,
                new SetupState(setupLogo, setupTab, setupDone),
                nextX,
                list,
                picks);
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
        catch (InvalidOperationException)
        {
            // 짝 없는 대리쌍 이스케이프처럼 글로 풀 수 없는 값
            return false;
        }
        catch (ArgumentException)
        {
            // 잘못된 UTF-8(DecoderFallbackException) 또는 모양 규칙에 어긋남
            return false;
        }
    }

    /// <summary>문서 전체를 값 하나로 쓴다(저장 파일·GET /api/settings 답). 칸은 { k, name, kind, steps, show, added, (xray만 rule), codes }.</summary>
    public void Write(Utf8JsonWriter writer)
    {
        if (writer == null) throw new ArgumentNullException(nameof(writer));
        writer.WriteStartObject();
        writer.WriteNumber("rev", Rev);
        writer.WriteStartObject("logo");
        writer.WriteString("mode", Logo.Mode);
        if (Logo.Text == null) writer.WriteNull("text");
        else writer.WriteString("text", Logo.Text);
        writer.WriteNumber("ver", Logo.Ver);
        writer.WriteEndObject();
        writer.WriteBoolean("tab", Tab);
        writer.WriteStartObject("setup");
        writer.WriteBoolean("logo", Setup.Logo);
        writer.WriteBoolean("tab", Setup.Tab);
        writer.WriteBoolean("done", Setup.Done);
        writer.WriteEndObject();
        writer.WriteNumber("nextX", NextX);
        writer.WriteStartArray("cols");
        foreach (var col in Cols)
        {
            writer.WriteStartObject();
            writer.WriteString("k", col.K);
            writer.WriteString("name", col.Name);
            writer.WriteString("kind", col.Kind);
            writer.WriteNumber("steps", col.Steps);
            writer.WriteBoolean("show", col.Show);
            writer.WriteBoolean("added", col.Added);
            if (col.Rule.HasValue) writer.WriteBoolean("rule", col.Rule.Value);
            writer.WriteStartArray("codes");
            foreach (var code in col.Codes) writer.WriteStringValue(code);
            writer.WriteEndArray();
            writer.WriteEndObject();
        }
        writer.WriteEndArray();
        writer.WritePropertyName("picks");
        Picks.Write(writer, true);
        writer.WriteEndObject();
    }

    /// <summary>칸 하나: 칸 이름은 k에 따라 정확히 그것들뿐(xray만 rule). 값 모양이 틀리면 false, 규칙은 SettingsCol이 본다.</summary>
    private static bool TryCol(JsonElement col, out SettingsCol read)
    {
        read = null!;
        if (col.ValueKind != JsonValueKind.Object || !col.TryGetProperty("k", out var kValue) || kValue.ValueKind != JsonValueKind.String) return false;
        var k = kValue.GetString()!;
        var isXray = k == XrayKey;
        if (isXray ? !HasExactly(col, "k", "name", "kind", "steps", "show", "added", "rule", "codes") : !HasExactly(col, "k", "name", "kind", "steps", "show", "added", "codes"))
            return false;
        var name = col.GetProperty("name");
        var kind = col.GetProperty("kind");
        var codes = col.GetProperty("codes");
        if (name.ValueKind != JsonValueKind.String || kind.ValueKind != JsonValueKind.String || codes.ValueKind != JsonValueKind.Array) return false;
        if (!TryInt(col.GetProperty("steps"), out var steps)
            || !TryBool(col.GetProperty("show"), out var show)
            || !TryBool(col.GetProperty("added"), out var added)) return false;
        bool? rule = null;
        if (isXray)
        {
            if (!TryBool(col.GetProperty("rule"), out var ruleValue)) return false;
            rule = ruleValue;
        }
        if (codes.GetArrayLength() > SettingsCol.MaxCodes) return false;
        var list = new List<string>();
        foreach (var code in codes.EnumerateArray())
        {
            if (code.ValueKind != JsonValueKind.String) return false;
            list.Add(code.GetString()!);
        }
        read = new SettingsCol(k, name.GetString()!, kind.GetString()!, steps, show, added, rule, list);
        return true;
    }

    private static bool TryLong(JsonElement value, out long number)
    {
        number = 0;
        return value.ValueKind == JsonValueKind.Number && value.TryGetInt64(out number) && number >= 0;
    }

    private static bool TryInt(JsonElement value, out int number)
    {
        number = 0;
        return value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out number) && number >= 0;
    }

    private static bool TryBool(JsonElement value, out bool flag)
    {
        flag = value.ValueKind == JsonValueKind.True;
        return value.ValueKind == JsonValueKind.True || value.ValueKind == JsonValueKind.False;
    }

    /// <summary>객체이고 칸 이름이 정확히 그것들뿐(차례 무관, 겹침 없음)인가.</summary>
    private static bool HasExactly(JsonElement value, params string[] names)
    {
        if (value.ValueKind != JsonValueKind.Object) return false;
        var seen = value.EnumerateObject().Select(p => p.Name).ToList();
        return seen.Count == names.Length && names.All(name => seen.Contains(name, StringComparer.Ordinal));
    }
}
