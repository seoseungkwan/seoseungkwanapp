using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Registration;
using Precheck.Core.Store;

namespace Precheck.Core.Sheet;

/// <summary>
/// 이 PC sheet.dat에 둔 것(design.md 5절·9-2): 비밀 글자·수납 구글 코드 주소·함께 쓸 메일·주소 확인(hello) 여부·오늘 줄 지문 하나.
/// 비밀 글자·주소·메일은 이 파일에만 있다(브라우저·서버·기록 파일에 가지 않는다).
/// </summary>
public sealed class SheetState
{
    public string? Secret { get; set; }

    public string? Url { get; set; }

    public List<string> ShareWith { get; set; } = new List<string>();

    /// <summary>이 주소의 구글 코드가 이 PC 비밀 글자를 아는지 hello로 본 뒤 참(sheet.code·주소 바꾸기면 거짓).</summary>
    public bool Verified { get; set; }

    /// <summary>지난번 보낸 줄 지문(날짜·SHA-256·줄 수, 환자 값 없음). 날이 바뀌면 바꾼다.</summary>
    public RowsPrint? Print { get; set; }

    public bool HasSecret => SheetCode.IsValidSecret(Secret);
}

/// <summary>
/// sheet.dat 읽기·쓰기(spec google-link TASK-10, AC-8511.2): 도우미 저장 폴더, 머리 `PRECHECK-STORE-1\n` + DPAPI(IProtector) JSON.
/// 지금 저장 파일(registration.dat)과 같은 틀: 임시 파일 → File.Replace(.bak 남김). 깨진 파일(다른 윈도 계정·고장)은 지우지 않고 이름을 바꿔 둔다.
/// 없거나 풀지 못하면 빈 상태(비밀 글자 없음) — 부르는 쪽이 E-GSHEET-SECRET으로 다룬다. 읽기·쓰기 실패는 E-STORE-FAILED.
/// </summary>
public sealed class SheetStore
{
    public const string FileName = "sheet.dat";

    public const int MaxBytes = 65536;

    private const int Version = 1;
    private const int MaxShare = 10;

    private static readonly byte[] HeaderBytes = Encoding.ASCII.GetBytes(RegistrationFile.Header);
    private static readonly Regex DayShape = new Regex(@"^[0-9]{4}-[0-9]{2}-[0-9]{2}\z", RegexOptions.CultureInvariant);
    private static readonly Regex HashShape = new Regex(@"^[0-9a-f]{64}\z", RegexOptions.CultureInvariant);

    private readonly string directory;
    private readonly IProtector protector;

    public SheetStore(string directory, IProtector protector)
    {
        if (string.IsNullOrWhiteSpace(directory)) throw new ArgumentException("저장 폴더가 비었다", nameof(directory));
        this.directory = directory;
        this.protector = protector ?? throw new ArgumentNullException(nameof(protector));
    }

    public string FilePath => Path.Combine(directory, FileName);

    public string BackupPath => FilePath + ".bak";

    /// <summary>지금 상태. 파일이 없거나 풀지 못하면 빈 상태(전 .bak이 맞으면 그것).</summary>
    public SheetState Load()
    {
        try
        {
            if (!File.Exists(FilePath)) return new SheetState();
            return ReadFile(FilePath) ?? (File.Exists(BackupPath) ? ReadFile(BackupPath) : null) ?? new SheetState();
        }
        catch (Exception e) when (e is IOException || e is UnauthorizedAccessException)
        {
            throw new SheetException(BitErrors.StoreFailed);
        }
    }

    public void Save(SheetState state)
    {
        if (state == null) throw new ArgumentNullException(nameof(state));
        var data = Write(state);
        try
        {
            Directory.CreateDirectory(directory);
            SetAsideIfBroken(FilePath);
            SetAsideIfBroken(BackupPath);
            WriteReplacing(data);
        }
        catch (Exception e) when (e is IOException || e is UnauthorizedAccessException)
        {
            throw new SheetException(BitErrors.StoreFailed);
        }
    }

    private byte[] Write(SheetState state)
    {
        var buffer = new MemoryStream();
        using (var w = new Utf8JsonWriter(buffer))
        {
            w.WriteStartObject();
            w.WriteNumber("version", Version);
            if (state.HasSecret) w.WriteString("secret", state.Secret); else w.WriteNull("secret");
            if (SheetUrls.IsScriptUrl(state.Url)) w.WriteString("url", state.Url); else w.WriteNull("url");
            w.WriteStartArray("shareWith");
            foreach (var mail in (state.ShareWith ?? new List<string>()).Where(m => !string.IsNullOrEmpty(m)).Take(MaxShare)) w.WriteStringValue(mail);
            w.WriteEndArray();
            w.WriteBoolean("verified", state.Verified);
            if (state.Print != null)
            {
                w.WriteStartObject("print");
                w.WriteString("day", state.Print.Day);
                w.WriteString("hash", state.Print.Hash);
                w.WriteNumber("rows", state.Print.Rows);
                w.WriteEndObject();
            }
            else
            {
                w.WriteNull("print");
            }
            w.WriteEndObject();
        }
        var clear = buffer.ToArray();
        byte[] cipher;
        try
        {
            cipher = protector.Protect(clear);
        }
        finally
        {
            Array.Clear(clear, 0, clear.Length);
            buffer.SetLength(0);
        }
        var output = new byte[HeaderBytes.Length + cipher.Length];
        Buffer.BlockCopy(HeaderBytes, 0, output, 0, HeaderBytes.Length);
        Buffer.BlockCopy(cipher, 0, output, HeaderBytes.Length, cipher.Length);
        return output;
    }

    /// <summary>파일 하나를 머리·크기·풀기·JSON·칸 모양으로 읽는다. 깨졌으면 null.</summary>
    private SheetState? ReadFile(string path)
    {
        if (new FileInfo(path).Length > MaxBytes) return null;
        var data = File.ReadAllBytes(path);
        if (data.Length <= HeaderBytes.Length || !data.Take(HeaderBytes.Length).SequenceEqual(HeaderBytes)) return null;
        var cipher = new byte[data.Length - HeaderBytes.Length];
        Buffer.BlockCopy(data, HeaderBytes.Length, cipher, 0, cipher.Length);
        byte[] clear;
        try
        {
            clear = protector.Unprotect(cipher);
        }
        catch (CryptographicException)
        {
            return null;
        }
        try
        {
            return Parse(clear);
        }
        finally
        {
            Array.Clear(clear, 0, clear.Length);
        }
    }

    private static SheetState? Parse(byte[] clear)
    {
        JsonDocument doc;
        try
        {
            doc = JsonDocument.Parse(clear);
        }
        catch (JsonException)
        {
            return null;
        }
        using (doc)
        {
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return null;
            if (!root.TryGetProperty("version", out var version) || version.ValueKind != JsonValueKind.Number || !version.TryGetInt32(out var v) || v != Version) return null;
            var state = new SheetState();
            if (!OptionalText(root, "secret", out var secret) || (secret != null && !SheetCode.IsValidSecret(secret))) return null;
            if (!OptionalText(root, "url", out var url) || (url != null && !SheetUrls.IsScriptUrl(url))) return null;
            state.Secret = secret;
            state.Url = url;
            if (!root.TryGetProperty("shareWith", out var share) || share.ValueKind != JsonValueKind.Array || share.GetArrayLength() > MaxShare) return null;
            foreach (var mail in share.EnumerateArray())
            {
                if (mail.ValueKind != JsonValueKind.String) return null;
                state.ShareWith.Add(mail.GetString() ?? "");
            }
            if (!root.TryGetProperty("verified", out var verified) || (verified.ValueKind != JsonValueKind.True && verified.ValueKind != JsonValueKind.False)) return null;
            state.Verified = verified.GetBoolean();
            if (root.TryGetProperty("print", out var print) && print.ValueKind == JsonValueKind.Object)
            {
                if (!OptionalText(print, "day", out var day) || !OptionalText(print, "hash", out var hash) || day == null || hash == null
                    || !DayShape.IsMatch(day) || !HashShape.IsMatch(hash)
                    || !print.TryGetProperty("rows", out var rows) || rows.ValueKind != JsonValueKind.Number || !rows.TryGetInt32(out var n) || n < 0)
                {
                    return null;
                }
                state.Print = new RowsPrint(day, hash, n);
            }
            return state;
        }
    }

    /// <summary>칸이 null이거나 글자면 참(text에 담음). 없거나 다른 꼴이면 거짓.</summary>
    private static bool OptionalText(JsonElement obj, string name, out string? text)
    {
        text = null;
        if (!obj.TryGetProperty(name, out var value)) return false;
        if (value.ValueKind == JsonValueKind.Null) return true;
        if (value.ValueKind != JsonValueKind.String) return false;
        text = value.GetString();
        return true;
    }

    private void SetAsideIfBroken(string path)
    {
        if (File.Exists(path) && ReadFile(path) == null) File.Move(path, BrokenName(path));
    }

    private void WriteReplacing(byte[] data)
    {
        var temporary = FilePath + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            using (var output = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                output.Write(data, 0, data.Length);
                output.Flush(true);
            }
            if (File.Exists(FilePath)) File.Replace(temporary, FilePath, BackupPath);
            else File.Move(temporary, FilePath);
        }
        finally
        {
            if (File.Exists(temporary)) File.Delete(temporary);
        }
    }

    /// <summary>깨진 파일의 새 이름: 원래 이름 + .broken-UTC 시각. 이미 있으면 -2, -3…을 붙여 덮지 않는다.</summary>
    private static string BrokenName(string path)
    {
        var stem = path + RegistrationStore.BrokenMark + DateTime.UtcNow.ToString("yyyyMMdd'T'HHmmssfff'Z'", CultureInfo.InvariantCulture);
        var name = stem;
        for (var n = 2; File.Exists(name); n++) name = stem + "-" + n.ToString(CultureInfo.InvariantCulture);
        return name;
    }
}
