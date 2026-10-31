using System;
using System.IO;
using System.Linq;
using System.Text;
using Precheck.Core.Bit;
using Precheck.Core.Registration;
using Precheck.Core.Tests.Bit;
using Xunit;

namespace Precheck.Core.Tests.Registration;

/// <summary>
/// AC-005.12 registration.dat 깨진 파일 규칙(design.md 9-3): 없으면 등록 없음(null). 깨졌으면(머리·크기·풀기·JSON·칸)
/// 맞는 .bak으로 되살리고 깨진 파일은 이름만 바꿔 둔다. .bak도 없거나 깨졌으면 E-STORE-BROKEN(파일은 그대로).
/// 그 상태에서 새로 저장하면 깨진 registration.dat·.bak을 먼저 이름을 바꿔 두고 새 파일을 쓴다(지우지 않음).
/// </summary>
public class RegistrationStoreTests
{
    private static readonly FakeProtector Protector = new FakeProtector();

    private static string[] Names(string folder) =>
        Directory.GetFiles(folder).Select(Path.GetFileName).OrderBy(n => n, StringComparer.Ordinal).ToArray()!;

    private static string Code(Action action) => Assert.Throws<BitException>(action).Code;

    /// <summary>깨진 파일 모양들: 머리 다름·풀기 실패·JSON 아님·칸 틀림·크기 넘음.</summary>
    private static byte[][] BrokenShapes()
    {
        var good = RegistrationFile.Write(Synthetic.Registration(), Protector);
        var tampered = (byte[])good.Clone();
        tampered[RegistrationFile.Header.Length] ^= 0xFF;
        var header = Encoding.ASCII.GetBytes(RegistrationFile.Header);
        return new[]
        {
            Encoding.ASCII.GetBytes("garbage"),
            Encoding.ASCII.GetBytes("PRECHECK-STORE-2\n").Concat(good.Skip(header.Length)).ToArray(),
            tampered,
            header.Concat(Protector.Protect(Encoding.UTF8.GetBytes("not json"))).ToArray(),
            header.Concat(Protector.Protect(Encoding.UTF8.GetBytes("{\"version\":1}"))).ToArray(),
            good.Concat(new byte[RegistrationFile.MaxBytes]).ToArray(),
        };
    }

    [Fact(DisplayName = "AC-005.12 registration.dat가 없으면 등록 없음(null), 파일을 만들지 않는다")]
    public void MissingIsNotRegistered()
    {
        using var folder = new TempFolder();
        Assert.Null(new RegistrationStore(folder.Path, Protector).Load());
        Assert.False(Directory.Exists(folder.Path));

        // .bak만 있어도 registration.dat가 없으면 등록 없음
        Directory.CreateDirectory(folder.Path);
        File.WriteAllBytes(Path.Combine(folder.Path, "registration.dat.bak"), RegistrationFile.Write(Synthetic.Registration(), Protector));
        Assert.Null(new RegistrationStore(folder.Path, Protector).Load());
    }

    [Fact(DisplayName = "AC-005.12 깨진 registration.dat + 맞는 .bak이면 .bak 값을 되살려 쓰고 깨진 파일은 지우지 않고 이름을 바꿔 둔다")]
    public void BrokenWithGoodBackupRestores()
    {
        foreach (var broken in BrokenShapes())
        {
            using var folder = new TempFolder();
            var store = new RegistrationStore(folder.Path, Protector);
            store.Save(Synthetic.Registration());
            store.Save(Synthetic.Registration(institution: Synthetic.OtherInstitution));
            var backup = File.ReadAllBytes(store.FilePath + ".bak");
            File.WriteAllBytes(store.FilePath, broken);

            var restored = store.Load();
            Assert.NotNull(restored);
            Assert.Equal(Synthetic.Institution, restored!.InstitutionCode);
            Assert.Equal(Synthetic.ProfileId, restored.ProfileId);

            var names = Names(folder.Path);
            Assert.Equal(3, names.Length);
            Assert.Equal(new[] { "registration.dat", "registration.dat.bak" }, names.Take(2));
            Assert.Matches(@"^registration\.dat\.broken-\d{8}T\d{6}(\d{3})?Z(-\d+)?$", names[2]);
            Assert.Equal(broken, File.ReadAllBytes(Path.Combine(folder.Path, names[2])));
            // registration.dat는 .bak 내용 그대로 되살아났고 .bak도 남아 있다
            Assert.Equal(backup, File.ReadAllBytes(store.FilePath));
            Assert.Equal(backup, File.ReadAllBytes(store.FilePath + ".bak"));

            // 다시 읽어도 같은 값, 더 이름을 바꾸지 않는다
            Assert.Equal(Synthetic.Institution, store.Load()!.InstitutionCode);
            Assert.Equal(3, Names(folder.Path).Length);
        }
    }

    [Fact(DisplayName = "AC-005.12 깨진 registration.dat + .bak 없음이면 E-STORE-BROKEN, 파일은 그대로 둔다")]
    public void BrokenWithoutBackupIsStoreBroken()
    {
        foreach (var broken in BrokenShapes())
        {
            using var folder = new TempFolder();
            Directory.CreateDirectory(folder.Path);
            var store = new RegistrationStore(folder.Path, Protector);
            File.WriteAllBytes(store.FilePath, broken);

            Assert.Equal("E-STORE-BROKEN", Code(() => store.Load()));
            Assert.Equal(new[] { "registration.dat" }, Names(folder.Path));
            Assert.Equal(broken, File.ReadAllBytes(store.FilePath));
        }
    }

    [Fact(DisplayName = "AC-005.12 깨진 registration.dat + 깨진 .bak이면 E-STORE-BROKEN, 두 파일 모두 그대로 둔다")]
    public void BrokenWithBrokenBackupIsStoreBroken()
    {
        using var folder = new TempFolder();
        Directory.CreateDirectory(folder.Path);
        var store = new RegistrationStore(folder.Path, Protector);
        File.WriteAllBytes(store.FilePath, Encoding.ASCII.GetBytes("broken-dat"));
        File.WriteAllBytes(store.FilePath + ".bak", Encoding.ASCII.GetBytes("broken-bak"));

        Assert.Equal("E-STORE-BROKEN", Code(() => store.Load()));
        Assert.Equal(new[] { "registration.dat", "registration.dat.bak" }, Names(folder.Path));
        Assert.Equal("broken-dat", File.ReadAllText(store.FilePath));
        Assert.Equal("broken-bak", File.ReadAllText(store.FilePath + ".bak"));
    }

    [Fact(DisplayName = "AC-005.12 깨진 상태에서 새로 저장하면 깨진 registration.dat·.bak은 이름이 바뀌어 남고 새 registration.dat만 읽힌다")]
    public void SaveOverBrokenSetsBrokenFilesAside()
    {
        using var folder = new TempFolder();
        Directory.CreateDirectory(folder.Path);
        var store = new RegistrationStore(folder.Path, Protector);
        File.WriteAllBytes(store.FilePath, Encoding.ASCII.GetBytes("broken-dat"));
        File.WriteAllBytes(store.FilePath + ".bak", Encoding.ASCII.GetBytes("broken-bak"));

        store.Save(Synthetic.Registration(institution: Synthetic.OtherInstitution));

        var names = Names(folder.Path);
        Assert.Equal(3, names.Length);
        Assert.Equal("registration.dat", names[0]);
        Assert.StartsWith("registration.dat.bak.broken-", names[1]);
        Assert.StartsWith("registration.dat.broken-", names[2]);
        Assert.Equal("broken-bak", File.ReadAllText(Path.Combine(folder.Path, names[1])));
        Assert.Equal("broken-dat", File.ReadAllText(Path.Combine(folder.Path, names[2])));
        Assert.Equal(Synthetic.OtherInstitution, store.Load()!.InstitutionCode);

        // 그 뒤 바꿔 쓰면 보통처럼 .bak 하나(새 파일의 전 값)가 생기고 이름 바꾼 깨진 파일은 그대로
        store.Save(Synthetic.Registration());
        var after = Names(folder.Path);
        Assert.Equal(4, after.Length);
        Assert.Contains("registration.dat.bak", after);
        Assert.Equal(Synthetic.Institution, store.Load()!.InstitutionCode);
        Assert.Equal("broken-dat", File.ReadAllText(Path.Combine(folder.Path, names[2])));
        Assert.Equal("broken-bak", File.ReadAllText(Path.Combine(folder.Path, names[1])));
    }

    [Fact(DisplayName = "AC-005.12 맞는 registration.dat + 깨진 .bak에서 바꿔 쓰면 깨진 .bak은 덮지 않고 이름을 바꿔 둔다")]
    public void SaveWithBrokenBackupKeepsIt()
    {
        using var folder = new TempFolder();
        var store = new RegistrationStore(folder.Path, Protector);
        store.Save(Synthetic.Registration());
        File.WriteAllBytes(store.FilePath + ".bak", Encoding.ASCII.GetBytes("broken-bak"));
        Assert.Equal(Synthetic.Institution, store.Load()!.InstitutionCode);

        store.Save(Synthetic.Registration(institution: Synthetic.OtherInstitution));

        var names = Names(folder.Path);
        Assert.Equal(new[] { "registration.dat", "registration.dat.bak" }, names.Take(2));
        var aside = Assert.Single(names.Skip(2));
        Assert.StartsWith("registration.dat.bak.broken-", aside);
        Assert.Equal("broken-bak", File.ReadAllText(Path.Combine(folder.Path, aside)));
        Assert.Equal(Synthetic.OtherInstitution, store.Load()!.InstitutionCode);
        Assert.Equal(Synthetic.Institution, RegistrationFile.Read(File.ReadAllBytes(store.FilePath + ".bak"), Protector)!.InstitutionCode);
    }

    [Fact(DisplayName = "AC-005.12 같은 시각에 두 번 깨져도 이름 바꾼 파일을 덮지 않는다")]
    public void BrokenNamesNeverOverwrite()
    {
        using var folder = new TempFolder();
        var store = new RegistrationStore(folder.Path, Protector);
        store.Save(Synthetic.Registration());
        store.Save(Synthetic.Registration());
        for (var i = 0; i < 3; i++)
        {
            File.WriteAllBytes(store.FilePath, Encoding.ASCII.GetBytes("broken-" + i));
            Assert.NotNull(store.Load());
        }
        var aside = Names(folder.Path).Where(n => n.StartsWith("registration.dat.broken-", StringComparison.Ordinal)).ToArray();
        Assert.Equal(3, aside.Length);
        Assert.Equal(
            new[] { "broken-0", "broken-1", "broken-2" },
            aside.Select(n => File.ReadAllText(Path.Combine(folder.Path, n))).OrderBy(t => t, StringComparer.Ordinal));
    }
}
