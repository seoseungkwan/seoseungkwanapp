using System;
using System.IO;
using System.Linq;
using System.Text;
using Precheck.Core.Registration;
using Precheck.Core.Tests.Bit;
using Xunit;

namespace Precheck.Core.Tests.Registration;

/// <summary>
/// AC-005.5 registration.dat: 머리 PRECHECK-STORE-1\n + 암호화(DPAPI, 여기서는 가짜 IProtector).
/// 병원 이름·기관기호·범위·설치 위치·서버·DB 이름·프로필 ID를 담는다. 깨진 파일은 등록 없음으로 본다.
/// </summary>
public class RegistrationFileTests
{
    private static readonly FakeProtector Protector = new FakeProtector();

    private static bool Contains(byte[] haystack, byte[] needle) =>
        Enumerable.Range(0, Math.Max(0, haystack.Length - needle.Length + 1)).Any(i => haystack.Skip(i).Take(needle.Length).SequenceEqual(needle));

    [Fact(DisplayName = "AC-005.5 등록 파일은 머리 PRECHECK-STORE-1\\n 뒤에 암호화한 내용만 둔다(평문이 보이지 않음)")]
    public void WritesHeaderAndCipher()
    {
        var registration = Synthetic.Registration(name: "가상의원");
        var data = RegistrationFile.Write(registration, Protector);

        var header = Encoding.ASCII.GetBytes("PRECHECK-STORE-1\n");
        Assert.Equal(header, data.Take(header.Length).ToArray());
        Assert.Equal("PRECHECK-STORE-1\n", RegistrationFile.Header);
        Assert.False(Contains(data, Encoding.UTF8.GetBytes("가상의원")));
        Assert.False(Contains(data, Encoding.UTF8.GetBytes(Synthetic.Institution)));
        Assert.False(Contains(data, Encoding.UTF8.GetBytes(Synthetic.Scope)));
    }

    [Fact(DisplayName = "AC-005.5 등록 파일 왕복: 병원 이름·기관기호·범위·설치 위치·서버·DB 이름·프로필 ID가 그대로")]
    public void RoundTrip()
    {
        var registration = Synthetic.Registration(name: "가상의원");
        var read = RegistrationFile.Read(RegistrationFile.Write(registration, Protector), Protector);

        Assert.NotNull(read);
        Assert.Equal("가상의원", read!.HospitalName);
        Assert.Equal(Synthetic.Institution, read.InstitutionCode);
        Assert.Equal(Synthetic.Scope, read.Scope);
        Assert.Equal(Synthetic.Root, read.InstallPath);
        Assert.Equal(Synthetic.Server, read.Server);
        Assert.Equal(Synthetic.Database, read.Database);
        Assert.Equal(Synthetic.ProfileId, read.ProfileId);
    }

    [Fact(DisplayName = "AC-005.5 머리가 틀리거나·풀 수 없거나·너무 크거나·내용이 틀린 파일은 등록 없음(null)")]
    public void BrokenFilesAreNotRegistrations()
    {
        var good = RegistrationFile.Write(Synthetic.Registration(), Protector);

        Assert.Null(RegistrationFile.Read(new byte[0], Protector));
        Assert.Null(RegistrationFile.Read(Encoding.ASCII.GetBytes("PRECHECK-STORE-1\n"), Protector));
        Assert.Null(RegistrationFile.Read(Encoding.ASCII.GetBytes("PRECHECK-STORE-2\n").Concat(good.Skip(17)).ToArray(), Protector));

        var tampered = (byte[])good.Clone();
        tampered[17] ^= 0xFF; // 가짜 암호의 머리를 깨뜨림 → CryptographicException
        Assert.Null(RegistrationFile.Read(tampered, Protector));

        Assert.Null(RegistrationFile.Read(good.Concat(new byte[70_000]).ToArray(), Protector));

        // 암호는 풀리지만 내용이 틀림(JSON 아님, 칸이 틀림)
        Assert.Null(RegistrationFile.Read(Wrap("not json"), Protector));
        Assert.Null(RegistrationFile.Read(Wrap("{\"version\":1}"), Protector));
        var json = Encoding.UTF8.GetString(Protector.Unprotect(good.Skip(17).ToArray()));
        Assert.Null(RegistrationFile.Read(Wrap(json.Replace(Synthetic.Institution, "1234567")), Protector));
        Assert.Null(RegistrationFile.Read(Wrap(json.Replace("\"version\":1", "\"version\":2")), Protector));
        Assert.Null(RegistrationFile.Read(Wrap(json.Replace(Synthetic.ProfileId, "NOT-HEX")), Protector));
    }

    private static byte[] Wrap(string json) =>
        Encoding.ASCII.GetBytes(RegistrationFile.Header).Concat(Protector.Protect(Encoding.UTF8.GetBytes(json))).ToArray();

    [Fact(DisplayName = "AC-005.5 틀린 등록 값(기관기호 8자리 아님·빈 칸·프로필 ID 모양)은 쓰지 않는다")]
    public void RefusesToWriteInvalid()
    {
        foreach (var registration in new[]
        {
            Synthetic.Registration(institution: "1234567"),
            Synthetic.Registration(scope: " "),
            Synthetic.Registration(server: ""),
            Synthetic.Registration(database: ""),
            Synthetic.Registration(install: ""),
            Synthetic.Registration(name: ""),
            Synthetic.Registration(profileId: "XYZ"),
        })
        {
            Assert.False(registration.IsValid);
            Assert.Throws<ArgumentException>(() => RegistrationFile.Write(registration, Protector));
        }
        Assert.True(Synthetic.Registration().IsValid);
    }

    // ---- 저장 폴더(%LOCALAPPDATA%\Seoseungkwan\PrecheckHelper\data\registration.dat) --------------------

    [Fact(DisplayName = "AC-005.5 저장은 data 폴더의 registration.dat 하나, 바꿔 쓰면 .bak 하나를 남긴다")]
    public void StoreSavesAndReplaces()
    {
        using var folder = new TempFolder();
        var store = new RegistrationStore(folder.Path, Protector);
        Assert.Null(store.Load());

        store.Save(Synthetic.Registration());
        Assert.Equal(new[] { "registration.dat" }, Directory.GetFiles(folder.Path).Select(Path.GetFileName));
        Assert.Equal(Synthetic.Institution, store.Load()!.InstitutionCode);

        store.Save(Synthetic.Registration(institution: Synthetic.OtherInstitution));
        Assert.Equal(new[] { "registration.dat", "registration.dat.bak" }, Directory.GetFiles(folder.Path).Select(Path.GetFileName).OrderBy(n => n, StringComparer.Ordinal));
        Assert.Equal(Synthetic.OtherInstitution, store.Load()!.InstitutionCode);

        File.WriteAllBytes(Path.Combine(folder.Path, "registration.dat"), Encoding.ASCII.GetBytes("garbage"));
        Assert.Null(store.Load());
    }
}
