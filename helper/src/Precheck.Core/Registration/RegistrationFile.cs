using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Precheck.Core.Store;

namespace Precheck.Core.Registration;

/// <summary>
/// registration.dat 모양(design.md 9-3): 머리 `PRECHECK-STORE-1\n` + 암호화(DPAPI CurrentUser + 고정 entropy)한 JSON.
/// 원본 security-profile.dat·statistics-binding.dat(머리 + DPAPI + JSON)과 같은 틀이다. 평문은 쓰고 나서 지운다.
/// JSON 칸은 Fields 그대로다(병원 이름 없음, AC-005.9). 읽을 때도 그 밖의 칸이 있으면 깨진 파일로 본다.
/// </summary>
public static class RegistrationFile
{
    /// <summary>저장 파일 머리. TASK-15 작업 저장 파일도 같은 머리를 쓴다.</summary>
    public const string Header = "PRECHECK-STORE-1\n";

    /// <summary>등록 파일 최대 크기(원본 ReadProtected 한도).</summary>
    public const int MaxBytes = 65536;

    /// <summary>등록 JSON 모양 번호.</summary>
    public const int Version = 1;

    /// <summary>등록 JSON 칸(쓰는 차례). 이 밖의 칸은 없다(AC-005.9).</summary>
    public static readonly string[] Fields = { "version", "profileId", "institutionCode", "scope", "installPath", "server", "database" };

    private static readonly byte[] HeaderBytes = Encoding.ASCII.GetBytes(Header);

    public static byte[] Write(HospitalRegistration registration, IProtector protector)
    {
        if (registration == null) throw new ArgumentNullException(nameof(registration));
        if (protector == null) throw new ArgumentNullException(nameof(protector));
        if (!registration.IsValid) throw new ArgumentException("등록 값이 틀렸다", nameof(registration));

        var clear = Serialize(registration);
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

    /// <summary>등록 파일을 푼다. 머리·크기·암호·JSON·칸 중 하나라도 틀리면 null(깨진 파일, RegistrationStore가 AC-005.12 규칙으로 다룬다).</summary>
    public static HospitalRegistration? Read(byte[] data, IProtector protector)
    {
        if (protector == null) throw new ArgumentNullException(nameof(protector));
        if (data == null || data.Length > MaxBytes || data.Length <= HeaderBytes.Length) return null;
        if (!data.Take(HeaderBytes.Length).SequenceEqual(HeaderBytes)) return null;

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

    private static byte[] Serialize(HospitalRegistration registration)
    {
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer))
        {
            writer.WriteStartObject();
            writer.WriteNumber("version", Version);
            writer.WriteString("profileId", registration.ProfileId);
            writer.WriteString("institutionCode", registration.InstitutionCode);
            writer.WriteString("scope", registration.Scope);
            writer.WriteString("installPath", registration.InstallPath);
            writer.WriteString("server", registration.Server);
            writer.WriteString("database", registration.Database);
            writer.WriteEndObject();
        }
        return buffer.ToArray();
    }

    private static HospitalRegistration? Parse(byte[] clear)
    {
        try
        {
            using var document = JsonDocument.Parse(clear);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return null;
            var names = root.EnumerateObject().Select(property => property.Name).ToList();
            if (names.Count != Fields.Length || names.Distinct(StringComparer.Ordinal).Count() != names.Count ||
                !names.All(name => Fields.Contains(name, StringComparer.Ordinal))) return null;
            if (!root.TryGetProperty("version", out var version) || version.ValueKind != JsonValueKind.Number ||
                !version.TryGetInt32(out var number) || number != Version) return null;

            var registration = new HospitalRegistration(
                institutionCode: Text(root, "institutionCode"),
                scope: Text(root, "scope"),
                installPath: Text(root, "installPath"),
                server: Text(root, "server"),
                database: Text(root, "database"),
                profileId: Text(root, "profileId"));
            return registration.IsValid ? registration : null;
        }
        catch (JsonException)
        {
            return null;
        }
        catch (InvalidOperationException)
        {
            // 짝 없는 대리쌍 이스케이프 등 글자로 풀 수 없는 값
            return null;
        }
    }

    private static string Text(JsonElement root, string name) =>
        root.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : "";
}
