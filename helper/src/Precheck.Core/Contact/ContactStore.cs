using System;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Registration;
using Precheck.Core.Store;

namespace Precheck.Core.Contact;

/// <summary>
/// 연락 표시·정기 주사 기록 파일 contact.dat(specs/patients design.md '도우미 저장 contact.dat', REQ-606).
/// 모양은 registration.dat와 같은 틀이다: 머리 `PRECHECK-STORE-1\n` + 암호화(DPAPI CurrentUser)한 JSON { "profileId", "contact" }.
/// contact 안쪽은 풀어 보지 않고 객체인지·크기만 본다(Worker가 만들고 읽는다). 받은 글자를 고치지 않고 그대로 넣고 돌려준다.
/// 쓰기·.bak·깨진 파일 이름 바꾸기는 RegistrationStore와 같다. 다른 점: .bak도 못 쓰면 E-STORE-BROKEN이면서 깨진 파일 이름을
/// 바꿔 둔다(AC-606.3). 그래서 한 번 알린 뒤 다음 읽기는 파일 없음({})으로 새로 시작한다. 깨진 파일은 어디서도 지우거나 덮지 않는다.
/// 다른 등록 프로필의 파일은 읽지 않는다: contact.dat면 {}, .bak이면 맞는 .bak이 아니다.
/// 예외 메시지에는 오류 번호만 들어간다.
/// </summary>
public sealed class ContactStore
{
    public const string FileName = "contact.dat";

    /// <summary>contact 글자의 UTF-8 최대 크기. Worker fitStore의 30MB(MAX_STORE_BYTES)가 이 아래다.</summary>
    public const int MaxContactBytes = 32 * 1024 * 1024;

    /// <summary>파일 최대 크기: contact + 겉 칸 + 머리 + 암호화가 덧붙이는 바이트까지 넉넉히. 넘으면 읽어 들이지 않고 깨진 파일로 본다.</summary>
    public const int MaxFileBytes = MaxContactBytes + 64 * 1024;

    private const string EmptyContact = "{}";
    private const string ProfileField = "profileId";
    private const string ContactField = "contact";

    private static readonly byte[] HeaderBytes = Encoding.ASCII.GetBytes(RegistrationFile.Header);
    private static readonly UTF8Encoding StrictUtf8 = new UTF8Encoding(false, true);

    // 저장할 때는 겉 칸 한 겹을 남긴다: 읽을 때 Envelope.DocumentOptions 한도에 걸려 깨진 파일이 되지 않게
    private static readonly JsonDocumentOptions ContactOptions = new JsonDocumentOptions
    {
        AllowTrailingCommas = Envelope.DocumentOptions.AllowTrailingCommas,
        CommentHandling = Envelope.DocumentOptions.CommentHandling,
        MaxDepth = Envelope.DocumentOptions.MaxDepth - 1,
    };

    private readonly string directory;
    private readonly IProtector protector;

    public ContactStore(string directory, IProtector protector)
    {
        if (string.IsNullOrWhiteSpace(directory)) throw new ArgumentException("저장 폴더가 비었다", nameof(directory));
        this.directory = directory;
        this.protector = protector ?? throw new ArgumentNullException(nameof(protector));
    }

    public string FilePath => Path.Combine(directory, FileName);

    public string BackupPath => FilePath + ".bak";

    /// <summary>
    /// 이 프로필의 contact JSON 글자. 파일이 없거나 다른 프로필의 파일이면 "{}". 깨졌으면 맞는 .bak으로 되살려 돌려주고,
    /// .bak도 못 쓰면 깨진 파일 이름을 바꿔 두고 BitException(E-STORE-BROKEN). 읽지 못하면 BitException(E-STORE-FAILED).
    /// </summary>
    public string Load(string profileId)
    {
        RequireProfile(profileId);
        try
        {
            if (!File.Exists(FilePath)) return EmptyContact;
            var current = ReadFile(FilePath);
            if (current != null) return current.BelongsTo(profileId) ? current.Contact : EmptyContact;

            var backup = File.Exists(BackupPath) ? ReadFile(BackupPath) : null;
            if (backup == null || !backup.BelongsTo(profileId))
            {
                File.Move(FilePath, BrokenName(FilePath));
                if (backup == null && File.Exists(BackupPath)) File.Move(BackupPath, BrokenName(BackupPath));
                throw new BitException(BitErrors.StoreBroken);
            }
            RestoreFromBackup();
            return backup.Contact;
        }
        catch (IOException)
        {
            throw new BitException(BitErrors.StoreFailed);
        }
        catch (UnauthorizedAccessException)
        {
            throw new BitException(BitErrors.StoreFailed);
        }
    }

    /// <summary>
    /// contact를 쓴다. 객체 JSON이 아니거나 32MB를 넘으면 아무것도 쓰지 않고 HelperException(E-HELPER-BAD-MESSAGE).
    /// 이미 있으면 바꿔 쓰고 전 파일을 .bak으로 남긴다. 깨진 contact.dat·.bak은 먼저 이름을 바꿔 둔다: 깨진 파일이 새 .bak이 되거나
    /// 맞는 .bak이 깨진 파일로 덮이지 않게. 쓰지 못하면 BitException(E-STORE-FAILED).
    /// </summary>
    public void Save(string profileId, string contactJson)
    {
        RequireProfile(profileId);
        RequireContact(contactJson);
        try
        {
            var data = Seal(profileId, contactJson);
            Directory.CreateDirectory(directory);
            SetAsideIfBroken(FilePath);
            SetAsideIfBroken(BackupPath);
            WriteReplacing(data);
        }
        catch (IOException)
        {
            throw new BitException(BitErrors.StoreFailed);
        }
        catch (UnauthorizedAccessException)
        {
            throw new BitException(BitErrors.StoreFailed);
        }
        catch (CryptographicException)
        {
            throw new BitException(BitErrors.StoreFailed);
        }
    }

    private static void RequireProfile(string profileId)
    {
        if (string.IsNullOrEmpty(profileId)) throw new ArgumentException("프로필 ID가 비었다", nameof(profileId));
    }

    private static void RequireContact(string contactJson)
    {
        // 크기는 글자 수가 아니라 UTF-8 바이트다(한글 한 자 3바이트). 넘으면 풀어 보지도 않는다
        if (contactJson == null || !FieldSpec.IsWellFormedUtf16(contactJson) || Encoding.UTF8.GetByteCount(contactJson) > MaxContactBytes)
        {
            throw BadContact();
        }
        try
        {
            using var document = JsonDocument.Parse(contactJson, ContactOptions);
            if (document.RootElement.ValueKind != JsonValueKind.Object) throw BadContact();
        }
        catch (JsonException)
        {
            throw BadContact();
        }
    }

    private static HelperException BadContact() => new HelperException(ErrorCodes.BadMessage);

    /// <summary>머리 + 암호화한 { profileId, contact }. 평문은 암호화한 뒤 지운다.</summary>
    private byte[] Seal(string profileId, string contactJson)
    {
        var clear = Serialize(profileId, contactJson);
        byte[] cipher;
        try
        {
            cipher = protector.Protect(clear);
        }
        finally
        {
            Array.Clear(clear, 0, clear.Length);
        }
        var output = new byte[HeaderBytes.Length + cipher.Length];
        Buffer.BlockCopy(HeaderBytes, 0, output, 0, HeaderBytes.Length);
        Buffer.BlockCopy(cipher, 0, output, HeaderBytes.Length, cipher.Length);
        return output;
    }

    private static byte[] Serialize(string profileId, string contactJson)
    {
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer))
        {
            writer.WriteStartObject();
            writer.WriteString(ProfileField, profileId);
            writer.WritePropertyName(ContactField);
            // 글자 그대로 넣는다. 다시 직렬화하면 한글이 \uXXXX로 늘어 32MB가 두 배가 된다. RequireContact가 이미 검사했다
            writer.WriteRawValue(contactJson, skipInputValidation: true);
            writer.WriteEndObject();
        }
        return buffer.ToArray();
    }

    /// <summary>파일 하나를 크기·머리·풀기·JSON·칸 검사로 읽는다. 깨졌으면 null. 읽지 못하면 IOException 그대로(깨진 것이 아니다).</summary>
    private Stored? ReadFile(string path)
    {
        if (new FileInfo(path).Length > MaxFileBytes) return null;
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

    private static Stored? Parse(byte[] clear)
    {
        try
        {
            StrictUtf8.GetCharCount(clear);
            using var document = JsonDocument.Parse(clear, Envelope.DocumentOptions);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return null;
            var names = root.EnumerateObject().Select(property => property.Name).ToList();
            if (names.Count != 2 || !names.Contains(ProfileField, StringComparer.Ordinal) || !names.Contains(ContactField, StringComparer.Ordinal)) return null;

            var contact = root.GetProperty(ContactField);
            if (!Envelope.TryGetString(root.GetProperty(ProfileField), out var profileId) || profileId.Length == 0 || contact.ValueKind != JsonValueKind.Object) return null;
            return new Stored(profileId, contact.GetRawText());
        }
        catch (JsonException)
        {
            return null;
        }
        catch (InvalidOperationException)
        {
            // 짝 없는 대리쌍 이스케이프 등 글자로 풀 수 없는 칸 이름
            return null;
        }
        catch (ArgumentException)
        {
            // 잘못된 UTF-8(DecoderFallbackException은 ArgumentException)
            return null;
        }
    }

    /// <summary>
    /// .bak을 임시 파일로 베낀 뒤 File.Replace 한 번으로 contact.dat를 되살리고 깨진 파일은 새 이름으로 남긴다(RegistrationStore와 같다).
    /// 윈도우 ReplaceFile이 깨진 파일을 옮긴 뒤 멈춰 contact.dat가 없어지면 임시 파일(.bak 내용)을 그 자리로 옮긴다.
    /// </summary>
    private void RestoreFromBackup()
    {
        var temporary = TemporaryPath();
        try
        {
            File.Copy(BackupPath, temporary);
            ReplaceOrPut(temporary, BrokenName(FilePath));
        }
        finally
        {
            if (File.Exists(temporary)) File.Delete(temporary);
        }
    }

    private void SetAsideIfBroken(string path)
    {
        if (File.Exists(path) && ReadFile(path) == null) File.Move(path, BrokenName(path));
    }

    private void WriteReplacing(byte[] data)
    {
        var temporary = TemporaryPath();
        try
        {
            using (var output = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                output.Write(data, 0, data.Length);
                output.Flush(true);
            }
            if (File.Exists(FilePath)) ReplaceOrPut(temporary, BackupPath);
            else File.Move(temporary, FilePath);
        }
        finally
        {
            if (File.Exists(temporary)) File.Delete(temporary);
        }
    }

    /// <summary>
    /// contact.dat를 임시 파일로 바꾸고 전 파일을 keepAs 이름으로 둔다. 윈도우 ReplaceFile이 전 파일을 옮긴 뒤 멈추면
    /// (ERROR_UNABLE_TO_MOVE_REPLACEMENT_2 등) contact.dat가 없어진다. 그대로 두면 다음 읽기가 {}라 쌓인 기록을 덮게 되므로 임시 파일을 그 자리로 옮긴다.
    /// </summary>
    private void ReplaceOrPut(string temporary, string keepAs)
    {
        try
        {
            File.Replace(temporary, FilePath, keepAs);
        }
        catch (IOException) when (!File.Exists(FilePath) && File.Exists(temporary))
        {
            File.Move(temporary, FilePath);
        }
    }

    private string TemporaryPath() => FilePath + "." + Guid.NewGuid().ToString("N") + ".tmp";

    /// <summary>깨진 파일의 새 이름: 원래 이름 + .broken-UTC 시각(밀리초까지). 이미 있으면 -2, -3…을 붙여 덮지 않는다.</summary>
    private static string BrokenName(string path)
    {
        var stem = path + RegistrationStore.BrokenMark + DateTime.UtcNow.ToString("yyyyMMdd'T'HHmmssfff'Z'", CultureInfo.InvariantCulture);
        var name = stem;
        for (var n = 2; File.Exists(name); n++) name = stem + "-" + n.ToString(CultureInfo.InvariantCulture);
        return name;
    }

    private sealed class Stored
    {
        public Stored(string profileId, string contact)
        {
            ProfileId = profileId;
            Contact = contact;
        }

        public string ProfileId { get; }

        public string Contact { get; }

        public bool BelongsTo(string profileId) => string.Equals(ProfileId, profileId, StringComparison.Ordinal);
    }
}
