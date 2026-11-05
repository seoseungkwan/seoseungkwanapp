using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Precheck.Core.Contact;
using Precheck.Core.Registration;
using Precheck.Core.Store;
using Precheck.Core.Tests.Protocol;

namespace Precheck.Core.Tests.Contact.Store;

/// <summary>
/// 가짜 암호화: 표시 + 바이트 뒤집기·XOR(되돌릴 수 있다). 표시가 틀리면 CryptographicException(DPAPI처럼).
/// DPAPI가 없는 이 서버에서 규칙만 본다. 실제 DPAPI 왕복은 Actions 윈도우·의원 PC에서 본다.
/// </summary>
internal sealed class ReverseProtector : IProtector
{
    private static readonly byte[] Mark = Encoding.ASCII.GetBytes("REV1");

    public bool FailProtect { get; set; }

    public Action? BeforeProtect { get; set; }

    public byte[] Protect(byte[] plain)
    {
        BeforeProtect?.Invoke();
        if (FailProtect) throw new CryptographicException("fake");
        var output = new byte[Mark.Length + plain.Length];
        Buffer.BlockCopy(Mark, 0, output, 0, Mark.Length);
        for (var i = 0; i < plain.Length; i++) output[Mark.Length + i] = (byte)(plain[plain.Length - 1 - i] ^ 0x5A);
        return output;
    }

    public byte[] Unprotect(byte[] cipher)
    {
        if (cipher.Length < Mark.Length || !cipher.Take(Mark.Length).SequenceEqual(Mark)) throw new CryptographicException("fake");
        var output = new byte[cipher.Length - Mark.Length];
        for (var i = 0; i < output.Length; i++) output[i] = (byte)(cipher[cipher.Length - 1 - i] ^ 0x5A);
        return output;
    }
}

/// <summary>가짜 작업 잠금: 비었는지 정해 두고, 기다린 시간과 잡고 푼 횟수를 적는다.</summary>
internal sealed class FakeWorkLock : IWorkLock
{
    public bool Free { get; set; } = true;

    public List<TimeSpan> Waits { get; } = new List<TimeSpan>();

    public int Entered { get; private set; }

    public int Released { get; private set; }

    public bool IsHeld => Entered > Released;

    public IDisposable? TryEnter(TimeSpan wait)
    {
        Waits.Add(wait);
        if (!Free) return null;
        Entered++;
        return new Holding(this);
    }

    private sealed class Holding : IDisposable
    {
        private readonly FakeWorkLock owner;

        public Holding(FakeWorkLock owner) { this.owner = owner; }

        public void Dispose() => owner.Released++;
    }
}

/// <summary>시험이 같이 쓰는 가짜 contact 글자·파일 도우미. 환자 값은 모두 지어낸 것이다(가상환자NN, 9로 시작하는 차트번호, 010-0000-NNNN).</summary>
internal static class Contacts
{
    public const string Profile = "0123456789abcdef0123456789abcdef";
    public const string OtherProfile = "fedcba9876543210fedcba9876543210";

    /// <summary>design.md '`contact` 안쪽 모양'의 가짜 값. 띄어쓰기·한글·이모지까지 그대로 돌아와야 한다.</summary>
    public static string Sample(string contactedOn = "2026-10-30") =>
        "{\"v\": 1, \"marks\":{\"f|V0001|" + Fake.Chart + "|2026-11-03\":\"" + contactedOn + "\"},"
        + "\"recall\":{\"from\":\"2026-01-01\",\"readThrough\":\"2026-10-30\",\"records\":[{\"chart\":\"" + Fake.Chart
        + "\",\"name\":\"" + Fake.Name + "\",\"date\":\"2026-10-01\",\"codes\":[\"A49\"],"
        + "\"text\":\"무릎 통증 😀 / 1주 뒤 f/u\",\"phone\":\"" + Fake.Phone + "\"}]}}";

    /// <summary>UTF-8로 정확히 size바이트인 ASCII 객체 JSON.</summary>
    public static string OfBytes(int size) => "{\"a\":\"" + new string('x', size - 8) + "\"}";

    /// <summary>객체가 depth겹인 JSON.</summary>
    public static string Nested(int depth)
    {
        var text = new StringBuilder();
        for (var i = 1; i < depth; i++) text.Append("{\"a\":");
        text.Append("{}");
        text.Append('}', depth - 1);
        return text.ToString();
    }

    public static string[] Names(string folder) =>
        Directory.GetFiles(folder).Select(Path.GetFileName).OrderBy(n => n, StringComparer.Ordinal).ToArray()!;

    public static byte[] Header => Encoding.ASCII.GetBytes(RegistrationFile.Header);

    /// <summary>머리 + 가짜 암호화한 바이트: 저장 모양을 손으로 만든다.</summary>
    public static byte[] Sealed(IProtector protector, byte[] clear) => Header.Concat(protector.Protect(clear)).ToArray();

    public static byte[] Sealed(IProtector protector, string clear) => Sealed(protector, Encoding.UTF8.GetBytes(clear));

    /// <summary>저장 파일을 풀어 안쪽 JSON 글자로.</summary>
    public static string Opened(IProtector protector, string path)
    {
        var data = File.ReadAllBytes(path);
        return Encoding.UTF8.GetString(protector.Unprotect(data.Skip(Header.Length).ToArray()));
    }

    /// <summary>파일 안에 그 글자의 UTF-8 바이트가 그대로 있나.</summary>
    public static bool Holds(string path, string text)
    {
        var data = File.ReadAllBytes(path);
        var needle = Encoding.UTF8.GetBytes(text);
        for (var i = 0; i + needle.Length <= data.Length; i++)
        {
            var j = 0;
            while (j < needle.Length && data[i + j] == needle[j]) j++;
            if (j == needle.Length) return true;
        }
        return false;
    }
}
