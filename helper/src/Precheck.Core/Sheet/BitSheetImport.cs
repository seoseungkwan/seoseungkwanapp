using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.Store;

namespace Precheck.Core.Sheet;

/// <summary>비트시트 설정에서 가져온 것. 비밀 글자·주소·메일은 그 PC sheet.dat로만 가고 웹에는 SettingsJson·SecretTag만 간다.</summary>
public sealed class BitSheetImported
{
    public BitSheetImported(Settings settings, string settingsJson, string secret, string url, IReadOnlyList<string> shareWith)
    {
        Settings = settings;
        SettingsJson = settingsJson;
        Secret = secret;
        Url = url;
        ShareWith = shareWith;
    }

    public Settings Settings { get; }

    /// <summary>웹 설정 JSON(design.md 10-2, 주소·메일·비밀 글자 없음).</summary>
    public string SettingsJson { get; }

    /// <summary>풀어 낸 비밀 글자. 화면·기록·답에 내지 않는다.</summary>
    public string Secret { get; }

    public string SecretTag => SheetCode.Tag(Secret);

    /// <summary>구글 웹 앱 주소(꼴이 맞을 때만, 아니면 "").</summary>
    public string Url { get; }

    /// <summary>함께 쓸 메일(메일 모양만, 10개까지).</summary>
    public IReadOnlyList<string> ShareWith { get; }
}

/// <summary>
/// 비트시트 %APPDATA%\BitSheet\settings.json(판 2, 옛 판 1도) 가져오기(spec google-link TASK-9, AC-8510.3, design.md 5절).
/// 파일은 읽기만 한다: 만들거나 고치거나 깨진 사본을 남기지 않는다. 비밀 글자(TokenProtected)는 DPAPI(이 PC 이 사용자, entropy BitSheet.token.v1)로
/// 잠겨 있어, 부르는 쪽이 그 entropy로 만든 IProtector(Windows DpapiProtector(Entropy()))를 넘긴다.
/// 오류는 번호만: 읽기 실패(잠김 등) E-STORE-FAILED, 깨진 파일 E-STORE-BROKEN, 비밀 글자를 풀지 못함·모양 틀림 E-GSHEET-SECRET.
/// </summary>
public static class BitSheetImport
{
    public const int MaxShare = 10;

    /// <summary>설정 파일 크기 한도(비트시트 파일은 몇 KB다).</summary>
    public const int MaxBytes = 256 * 1024;

    private static readonly Regex MailShape = new Regex(@"^[^@\s]{1,64}@[^@\s]{1,189}\.[^@\s]{1,63}\z", RegexOptions.CultureInvariant);

    private static readonly JsonSerializerOptions ReadOptions = new JsonSerializerOptions
    {
        PropertyNameCaseInsensitive = true,
        AllowTrailingCommas = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
    };

    /// <summary>비트시트 Token.cs가 비밀 글자를 잠글 때 쓴 DPAPI entropy("BitSheet.token.v1").</summary>
    public static byte[] Entropy() => Encoding.UTF8.GetBytes("BitSheet.token.v1");

    /// <summary>%APPDATA%(Roaming) 아래 비트시트 설정 파일 자리.</summary>
    public static string DefaultPath(string appData) => Path.Combine(appData, "BitSheet", "settings.json");

    /// <summary>파일이 없으면 null(가져올 것 없음). 있으면 읽어 웹 설정·비밀 글자·주소·메일을 돌려준다.</summary>
    public static BitSheetImported? Read(string path, IProtector protector)
    {
        if (path == null) throw new ArgumentNullException(nameof(path));
        if (protector == null) throw new ArgumentNullException(nameof(protector));
        if (!File.Exists(path)) return null;

        byte[] bytes;
        try
        {
            bytes = File.ReadAllBytes(path);
        }
        catch (Exception e) when (e is IOException || e is UnauthorizedAccessException)
        {
            throw new SheetException(BitErrors.StoreFailed);
        }
        var settings = Load(bytes);
        settings.Migrate();
        settings.Normalize();
        var secret = Unlock(settings.TokenProtected, protector);
        var url = SheetUrls.IsScriptUrl(settings.WebAppUrl) ? settings.WebAppUrl : "";
        var share = settings.ShareWith.Where(m => m.Length <= 254 && MailShape.IsMatch(m)).Take(MaxShare).ToList();
        return new BitSheetImported(settings, SheetSettingsJson.ToJson(settings), secret, url, share);
    }

    private static Settings Load(byte[] bytes)
    {
        if (bytes.Length > MaxBytes) throw new SheetException(BitErrors.StoreBroken);
        var start = bytes.Length >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF ? 3 : 0;
        string text;
        try
        {
            text = new UTF8Encoding(false, true).GetString(bytes, start, bytes.Length - start);
        }
        catch (DecoderFallbackException)
        {
            throw new SheetException(BitErrors.StoreBroken);
        }
        try
        {
            return JsonSerializer.Deserialize<Settings>(text, ReadOptions) ?? throw new SheetException(BitErrors.StoreBroken);
        }
        catch (Exception e) when (e is JsonException || e is NotSupportedException || e is ArgumentException || e is InvalidOperationException)
        {
            throw new SheetException(BitErrors.StoreBroken);
        }
    }

    private static string Unlock(string tokenProtected, IProtector protector)
    {
        byte[] plain;
        try
        {
            plain = protector.Unprotect(Convert.FromBase64String(tokenProtected ?? ""));
        }
        catch (Exception e) when (e is FormatException || e is CryptographicException)
        {
            throw new SheetException(SheetErrors.Secret);
        }
        string secret;
        try
        {
            secret = new UTF8Encoding(false, true).GetString(plain);
        }
        catch (DecoderFallbackException)
        {
            throw new SheetException(SheetErrors.Secret);
        }
        finally
        {
            Array.Clear(plain, 0, plain.Length);
        }
        if (!SheetCode.IsValidSecret(secret)) throw new SheetException(SheetErrors.Secret);
        return secret;
    }
}
