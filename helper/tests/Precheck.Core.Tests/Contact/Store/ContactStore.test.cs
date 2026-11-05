using System;
using System.IO;
using System.Linq;
using System.Text;
using Precheck.Core.Contact;
using Precheck.Core.Protocol;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Contact.Store;

/// <summary>
/// REQ-606 contact.dat(design.md '도우미 저장 contact.dat'): 머리 + 암호화한 {profileId, contact}. 쓰기·.bak·깨진 파일 이름 바꾸기는
/// RegistrationStore와 같다. 다른 점 하나: 둘 다 깨지면 E-STORE-BROKEN이면서 깨진 파일 이름도 바꿔 둔다(AC-606.3).
/// 암호화는 가짜(ReverseProtector), 파일 바꿔치기는 이 서버(.NET on 리눅스)의 File.Replace다.
/// </summary>
public class ContactStoreTests
{
    private const string Profile = Contacts.Profile;

    private static string Code(Action action) => Assert.ThrowsAny<HelperException>(action).Code;

    private static (TempFolder Folder, ReverseProtector Protector, ContactStore Store) Open()
    {
        var folder = new TempFolder();
        var protector = new ReverseProtector();
        return (folder, protector, new ContactStore(folder.Path, protector));
    }

    /// <summary>깨진 파일 모양들: 빈 파일·머리 다름·머리만·풀기 실패·JSON 아님·칸 틀림·글자 깨짐.</summary>
    private static byte[][] BrokenShapes(ReverseProtector protector)
    {
        var good = Contacts.Sealed(protector, "{\"profileId\":\"" + Profile + "\",\"contact\":{}}");
        var tampered = (byte[])good.Clone();
        tampered[Contacts.Header.Length] ^= 0xFF;
        var badUtf8 = Encoding.ASCII.GetBytes("{\"profileId\":\"" + Profile + "\",\"contact\":{\"a\":\"?\"}}");
        badUtf8[Array.IndexOf(badUtf8, (byte)'?')] = 0xFF;
        return new[]
        {
            new byte[0],
            Encoding.ASCII.GetBytes("garbage"),
            Encoding.ASCII.GetBytes("PRECHECK-STORE-2\n").Concat(good.Skip(Contacts.Header.Length)).ToArray(),
            Contacts.Header,
            tampered,
            Contacts.Sealed(protector, "not json"),
            Contacts.Sealed(protector, "[]"),
            Contacts.Sealed(protector, "{\"profileId\":\"" + Profile + "\"}"),
            Contacts.Sealed(protector, "{\"contact\":{}}"),
            Contacts.Sealed(protector, "{\"contact\":{},\"contact\":{}}"),
            Contacts.Sealed(protector, "{\"profileId\":\"\",\"contact\":{}}"),
            Contacts.Sealed(protector, "{\"profileId\":1,\"contact\":{}}"),
            Contacts.Sealed(protector, "{\"profileId\":\"" + Profile + "\",\"contact\":[]}"),
            Contacts.Sealed(protector, "{\"profileId\":\"" + Profile + "\",\"contact\":{},\"month\":\"2026-10\"}"),
            Contacts.Sealed(protector, badUtf8),
        };
    }

    [Fact(DisplayName = "AC-606.1 저장하면 contact.dat 하나에 머리 PRECHECK-STORE-1 + 암호화한 {profileId, contact}만 쓴다")]
    public void WritesHeaderAndProfile()
    {
        var (folder, protector, store) = Open();
        using (folder)
        {
            store.Save(Profile, Contacts.Sample());

            Assert.Equal(Path.Combine(folder.Path, "contact.dat"), store.FilePath);
            Assert.Equal(new[] { "contact.dat" }, Contacts.Names(folder.Path));
            var data = File.ReadAllBytes(store.FilePath);
            Assert.Equal("PRECHECK-STORE-1\n", Encoding.ASCII.GetString(data, 0, Contacts.Header.Length));

            var inner = Json.Parse(Contacts.Opened(protector, store.FilePath));
            Assert.Equal(new[] { "profileId", "contact" }, Json.Keys(inner));
            Assert.Equal(Profile, inner.GetProperty("profileId").GetString());
            Assert.Equal(Contacts.Sample(), inner.GetProperty("contact").GetRawText());
        }
    }

    [Fact(DisplayName = "AC-606.1 다시 저장하면 바꿔치기: .bak 하나에 바로 전 값이 남고 임시 파일은 없다")]
    public void ReplaceKeepsOneBackup()
    {
        var (folder, protector, store) = Open();
        using (folder)
        {
            store.Save(Profile, "{\"n\":1}");
            store.Save(Profile, "{\"n\":2}");
            store.Save(Profile, "{\"n\":3}");

            Assert.Equal(new[] { "contact.dat", "contact.dat.bak" }, Contacts.Names(folder.Path));
            Assert.Equal("{\"n\":3}", store.Load(Profile));
            Assert.Equal("{\"n\":2}", Json.Parse(Contacts.Opened(protector, store.BackupPath)).GetProperty("contact").GetRawText());
        }
    }

    [Fact(DisplayName = "AC-606.1 저장 파일·.bak 바이트에 평문 JSON 글자가 없고, 암호화 전에 폴더에 아무 파일도 쓰지 않는다")]
    public void NoPlainText()
    {
        var (folder, protector, store) = Open();
        using (folder)
        {
            var filesAtProtect = -1;
            protector.BeforeProtect = () => filesAtProtect = Directory.Exists(folder.Path) ? Directory.GetFiles(folder.Path).Length : 0;
            store.Save(Profile, Contacts.Sample());
            Assert.Equal(0, filesAtProtect);
            store.Save(Profile, Contacts.Sample("2026-10-31"));

            foreach (var path in new[] { store.FilePath, store.BackupPath })
            {
                foreach (var plain in new[] { Fake.Name, Fake.Chart, Fake.Phone, "무릎", "contact", "profileId", Profile, "marks", "recall" })
                {
                    Assert.False(Contacts.Holds(path, plain), plain);
                }
            }
        }
    }

    [Fact(DisplayName = "AC-606.2 저장한 contact 글자가 띄어쓰기·한글·이모지까지 그대로 돌아온다")]
    public void RoundTrip()
    {
        var (folder, _, store) = Open();
        using (folder)
        {
            store.Save(Profile, Contacts.Sample());
            Assert.Equal(Contacts.Sample(), store.Load(Profile));
        }
    }

    [Fact(DisplayName = "AC-606.2 파일이 없으면 {}, 폴더·파일을 만들지 않는다(.bak만 있어도 파일이 없는 것)")]
    public void MissingIsEmpty()
    {
        var (folder, protector, store) = Open();
        using (folder)
        {
            Assert.Equal("{}", store.Load(Profile));
            Assert.False(Directory.Exists(folder.Path));

            Directory.CreateDirectory(folder.Path);
            File.WriteAllBytes(store.BackupPath, Contacts.Sealed(protector, "{\"profileId\":\"" + Profile + "\",\"contact\":{\"n\":1}}"));
            Assert.Equal("{}", store.Load(Profile));
            Assert.Equal(new[] { "contact.dat.bak" }, Contacts.Names(folder.Path));
        }
    }

    [Fact(DisplayName = "AC-606.2 다른 등록 프로필의 파일이면 {}이고 파일은 그대로 둔다")]
    public void OtherProfileIsEmpty()
    {
        var (folder, _, store) = Open();
        using (folder)
        {
            store.Save(Contacts.OtherProfile, Contacts.Sample());
            var before = File.ReadAllBytes(store.FilePath);

            Assert.Equal("{}", store.Load(Profile));

            Assert.Equal(new[] { "contact.dat" }, Contacts.Names(folder.Path));
            Assert.Equal(before, File.ReadAllBytes(store.FilePath));
            Assert.Equal(Contacts.Sample(), store.Load(Contacts.OtherProfile));
        }
    }

    [Fact(DisplayName = "AC-606.2 다른 프로필의 파일 위에 저장하면 내 값만 읽히고 전 프로필 값은 내 쪽으로 돌아오지 않는다")]
    public void SaveOverOtherProfile()
    {
        var (folder, _, store) = Open();
        using (folder)
        {
            store.Save(Contacts.OtherProfile, Contacts.Sample());
            store.Save(Profile, "{\"n\":1}");

            Assert.Equal("{\"n\":1}", store.Load(Profile));
            Assert.Equal("{}", store.Load(Contacts.OtherProfile));
            Assert.Equal(new[] { "contact.dat", "contact.dat.bak" }, Contacts.Names(folder.Path));
        }
    }

    [Fact(DisplayName = "AC-606.3 깨진 contact.dat + 맞는 .bak이면 .bak 값을 쓰고 되살리며, 깨진 파일은 지우지 않고 이름만 바꾼다")]
    public void BrokenWithGoodBackup()
    {
        foreach (var broken in BrokenShapes(new ReverseProtector()))
        {
            var (folder, _, store) = Open();
            using (folder)
            {
                store.Save(Profile, "{\"n\":1}");
                store.Save(Profile, "{\"n\":2}");
                var backup = File.ReadAllBytes(store.BackupPath);
                File.WriteAllBytes(store.FilePath, broken);

                Assert.Equal("{\"n\":1}", store.Load(Profile));

                var names = Contacts.Names(folder.Path);
                Assert.Equal(3, names.Length);
                Assert.Equal(new[] { "contact.dat", "contact.dat.bak" }, names.Take(2));
                Assert.Matches(@"^contact\.dat\.broken-\d{8}T\d{9}Z(-\d+)?$", names[2]);
                Assert.Equal(broken, File.ReadAllBytes(Path.Combine(folder.Path, names[2])));
                Assert.Equal(backup, File.ReadAllBytes(store.FilePath));
                Assert.Equal(backup, File.ReadAllBytes(store.BackupPath));

                // 다시 읽어도 같은 값, 더 이름을 바꾸지 않는다
                Assert.Equal("{\"n\":1}", store.Load(Profile));
                Assert.Equal(3, Contacts.Names(folder.Path).Length);
            }
        }
    }

    [Fact(DisplayName = "AC-606.3 깨진 contact.dat + 깨진 .bak이면 E-STORE-BROKEN이고 두 파일 모두 이름만 바뀌어 남는다. 다음 읽기는 {}")]
    public void BrokenWithBrokenBackup()
    {
        foreach (var broken in BrokenShapes(new ReverseProtector()))
        {
            var (folder, _, store) = Open();
            using (folder)
            {
                Directory.CreateDirectory(folder.Path);
                File.WriteAllBytes(store.FilePath, broken);
                File.WriteAllBytes(store.BackupPath, Encoding.ASCII.GetBytes("broken-bak"));

                Assert.Equal("E-STORE-BROKEN", Code(() => store.Load(Profile)));

                var names = Contacts.Names(folder.Path);
                Assert.Equal(2, names.Length);
                Assert.StartsWith("contact.dat.bak.broken-", names[0]);
                Assert.StartsWith("contact.dat.broken-", names[1]);
                Assert.Equal("broken-bak", File.ReadAllText(Path.Combine(folder.Path, names[0])));
                Assert.Equal(broken, File.ReadAllBytes(Path.Combine(folder.Path, names[1])));

                // 한 번 알린 뒤에는 새로 시작한다(깨진 파일은 그대로 남아 있다)
                Assert.Equal("{}", store.Load(Profile));
                Assert.Equal(names, Contacts.Names(folder.Path));
            }
        }
    }

    [Fact(DisplayName = "AC-606.3 깨진 contact.dat + .bak 없음이면 E-STORE-BROKEN이고 깨진 파일은 이름만 바뀌어 남는다")]
    public void BrokenWithoutBackup()
    {
        foreach (var broken in BrokenShapes(new ReverseProtector()))
        {
            var (folder, _, store) = Open();
            using (folder)
            {
                Directory.CreateDirectory(folder.Path);
                File.WriteAllBytes(store.FilePath, broken);

                Assert.Equal("E-STORE-BROKEN", Code(() => store.Load(Profile)));

                var name = Assert.Single(Contacts.Names(folder.Path));
                Assert.StartsWith("contact.dat.broken-", name);
                Assert.Equal(broken, File.ReadAllBytes(Path.Combine(folder.Path, name)));
            }
        }
    }

    [Fact(DisplayName = "AC-606.3 깨진 contact.dat + 다른 프로필의 .bak은 맞는 .bak이 아니다: E-STORE-BROKEN, 되살리지 않고 .bak은 그대로")]
    public void BrokenWithOtherProfileBackup()
    {
        var (folder, _, store) = Open();
        using (folder)
        {
            store.Save(Contacts.OtherProfile, Contacts.Sample());
            store.Save(Contacts.OtherProfile, "{\"n\":2}");
            var backup = File.ReadAllBytes(store.BackupPath);
            File.WriteAllBytes(store.FilePath, Encoding.ASCII.GetBytes("broken"));

            Assert.Equal("E-STORE-BROKEN", Code(() => store.Load(Profile)));

            var names = Contacts.Names(folder.Path);
            Assert.Equal(2, names.Length);
            Assert.Equal("contact.dat.bak", names[0]);
            Assert.StartsWith("contact.dat.broken-", names[1]);
            Assert.Equal(backup, File.ReadAllBytes(store.BackupPath));
            Assert.Equal("{}", store.Load(Profile));
        }
    }

    [Fact(DisplayName = "AC-606.3 크기 한도를 넘은 파일은 깨진 파일이다(읽어 들이지 않는다)")]
    public void OversizeIsBroken()
    {
        var (folder, _, store) = Open();
        using (folder)
        {
            store.Save(Profile, "{\"n\":1}");
            store.Save(Profile, "{\"n\":2}");
            using (var stream = new FileStream(store.FilePath, FileMode.Open, FileAccess.Write)) stream.SetLength(ContactStore.MaxFileBytes + 1L);

            Assert.Equal("{\"n\":1}", store.Load(Profile));
            Assert.Single(Directory.GetFiles(folder.Path, "contact.dat.broken-*"));
        }
    }

    [Fact(DisplayName = "AC-606.3 맞는 contact.dat + 깨진 .bak: 읽기는 그대로, 저장은 깨진 .bak을 덮지 않고 이름을 바꿔 둔다")]
    public void SaveKeepsBrokenBackup()
    {
        var (folder, protector, store) = Open();
        using (folder)
        {
            store.Save(Profile, "{\"n\":1}");
            File.WriteAllBytes(store.BackupPath, Encoding.ASCII.GetBytes("broken-bak"));

            Assert.Equal("{\"n\":1}", store.Load(Profile));
            Assert.Equal(new[] { "contact.dat", "contact.dat.bak" }, Contacts.Names(folder.Path));

            store.Save(Profile, "{\"n\":2}");

            var names = Contacts.Names(folder.Path);
            Assert.Equal(new[] { "contact.dat", "contact.dat.bak" }, names.Take(2));
            var aside = Assert.Single(names.Skip(2));
            Assert.StartsWith("contact.dat.bak.broken-", aside);
            Assert.Equal("broken-bak", File.ReadAllText(Path.Combine(folder.Path, aside)));
            Assert.Equal("{\"n\":2}", store.Load(Profile));
            Assert.Equal("{\"n\":1}", Json.Parse(Contacts.Opened(protector, store.BackupPath)).GetProperty("contact").GetRawText());
        }
    }

    [Fact(DisplayName = "AC-606.3 깨진 contact.dat 위에 저장하면 깨진 파일이 새 .bak이 되지 않고 맞는 .bak도 덮이지 않는다")]
    public void SaveOverBrokenKeepsGoodBackup()
    {
        var (folder, _, store) = Open();
        using (folder)
        {
            store.Save(Profile, "{\"n\":1}");
            store.Save(Profile, "{\"n\":2}");
            var backup = File.ReadAllBytes(store.BackupPath);
            File.WriteAllBytes(store.FilePath, Encoding.ASCII.GetBytes("broken"));

            store.Save(Profile, "{\"n\":3}");

            var names = Contacts.Names(folder.Path);
            Assert.Equal(3, names.Length);
            Assert.Equal(backup, File.ReadAllBytes(store.BackupPath));
            Assert.StartsWith("contact.dat.broken-", names[2]);
            Assert.Equal("broken", File.ReadAllText(Path.Combine(folder.Path, names[2])));
            Assert.Equal("{\"n\":3}", store.Load(Profile));
        }
    }

    [Fact(DisplayName = "AC-606.3 같은 시각에 여러 번 깨져도 이름 바꾼 파일을 덮지 않는다")]
    public void BrokenNamesNeverOverwrite()
    {
        var (folder, _, store) = Open();
        using (folder)
        {
            store.Save(Profile, "{\"n\":1}");
            store.Save(Profile, "{\"n\":2}");
            for (var i = 0; i < 3; i++)
            {
                File.WriteAllBytes(store.FilePath, Encoding.ASCII.GetBytes("broken-" + i));
                Assert.Equal("{\"n\":1}", store.Load(Profile));
            }
            var aside = Contacts.Names(folder.Path).Where(n => n.StartsWith("contact.dat.broken-", StringComparison.Ordinal)).ToArray();
            Assert.Equal(
                new[] { "broken-0", "broken-1", "broken-2" },
                aside.Select(n => File.ReadAllText(Path.Combine(folder.Path, n))).OrderBy(t => t, StringComparer.Ordinal));
        }
    }

    [Fact(DisplayName = "AC-606.3 쓰기 막힌 폴더면 E-STORE-FAILED")]
    public void BlockedFolderFails()
    {
        using var folder = new TempFolder();
        Directory.CreateDirectory(folder.Path);
        var blocked = Path.Combine(folder.Path, "blocked");
        File.WriteAllText(blocked, "not a folder");
        var store = new ContactStore(Path.Combine(blocked, "data"), new ReverseProtector());

        Assert.Equal("E-STORE-FAILED", Code(() => store.Save(Profile, Contacts.Sample())));
        Assert.Equal(new[] { "blocked" }, Contacts.Names(folder.Path));
    }

    [Fact(DisplayName = "AC-606.3 바꿔치기가 실패하면 E-STORE-FAILED, 전 파일은 그대로이고 임시 파일을 남기지 않는다")]
    public void ReplaceFailureKeepsOld()
    {
        var (folder, _, store) = Open();
        using (folder)
        {
            store.Save(Profile, "{\"n\":1}");
            Directory.CreateDirectory(store.BackupPath); // .bak 자리에 폴더가 있어 전 파일을 옮기지 못한다

            Assert.Equal("E-STORE-FAILED", Code(() => store.Save(Profile, "{\"n\":2}")));

            Assert.Equal(new[] { "contact.dat" }, Contacts.Names(folder.Path));
            Assert.Equal("{\"n\":1}", store.Load(Profile));
        }
    }

    [Fact(DisplayName = "AC-606.3 파일이 잠겨 읽지 못하면 깨진 것이 아니라 E-STORE-FAILED: 이름을 바꾸지 않는다")]
    public void LockedFileIsNotBroken()
    {
        var (folder, _, store) = Open();
        using (folder)
        {
            store.Save(Profile, "{\"n\":1}");
            using (new FileStream(store.FilePath, FileMode.Open, FileAccess.ReadWrite, FileShare.None))
            {
                Assert.Equal("E-STORE-FAILED", Code(() => store.Load(Profile)));
                Assert.Equal("E-STORE-FAILED", Code(() => store.Save(Profile, "{\"n\":2}")));
            }

            Assert.Equal(new[] { "contact.dat" }, Contacts.Names(folder.Path));
            Assert.Equal("{\"n\":1}", store.Load(Profile));
        }
    }

    [Fact(DisplayName = "AC-606.3 암호화가 실패하면 E-STORE-FAILED, 전 파일은 그대로다")]
    public void ProtectFailureFails()
    {
        var (folder, protector, store) = Open();
        using (folder)
        {
            store.Save(Profile, "{\"n\":1}");
            protector.FailProtect = true;

            Assert.Equal("E-STORE-FAILED", Code(() => store.Save(Profile, "{\"n\":2}")));

            Assert.Equal(new[] { "contact.dat" }, Contacts.Names(folder.Path));
            Assert.Equal("{\"n\":1}", store.Load(Profile));
        }
    }

    [Fact(DisplayName = "AC-606.4 객체 JSON이 아니면 E-HELPER-BAD-MESSAGE, 아무것도 쓰지 않는다")]
    public void NotObjectRejected()
    {
        var (folder, _, store) = Open();
        using (folder)
        {
            foreach (var bad in new[] { "", " ", "[]", "1", "\"글자\"", "null", "{", "{} {}", "{\"a\":1,}", "/* 주석 */{}", "{\"a\":\"\ud83d\"}" })
            {
                Assert.Equal("E-HELPER-BAD-MESSAGE", Code(() => store.Save(Profile, bad)));
            }
            Assert.False(Directory.Exists(folder.Path));
        }
    }

    [Fact(DisplayName = "AC-606.4 contact가 정확히 32MB면 저장·읽기가 되고(파일 한도에 걸리지 않음) 32MB + 1은 E-HELPER-BAD-MESSAGE")]
    public void SizeLimit()
    {
        Assert.Equal(32 * 1024 * 1024, ContactStore.MaxContactBytes);
        var (folder, _, store) = Open();
        using (folder)
        {
            var biggest = Contacts.OfBytes(ContactStore.MaxContactBytes);
            store.Save(Profile, biggest);
            Assert.True(store.Load(Profile) == biggest);

            var before = File.ReadAllBytes(store.FilePath);
            Assert.Equal("E-HELPER-BAD-MESSAGE", Code(() => store.Save(Profile, Contacts.OfBytes(ContactStore.MaxContactBytes + 1))));
            Assert.True(before.SequenceEqual(File.ReadAllBytes(store.FilePath)));
            Assert.Equal(new[] { "contact.dat" }, Contacts.Names(folder.Path));
        }
    }

    [Fact(DisplayName = "AC-606.4 크기는 글자 수가 아니라 UTF-8 바이트로 잰다: 한글 12,000,000자(36MB)는 거절")]
    public void SizeIsUtf8Bytes()
    {
        var (folder, _, store) = Open();
        using (folder)
        {
            var korean = "{\"a\":\"" + new string('가', 12_000_000) + "\"}";
            Assert.True(korean.Length < ContactStore.MaxContactBytes);

            Assert.Equal("E-HELPER-BAD-MESSAGE", Code(() => store.Save(Profile, korean)));
            Assert.False(Directory.Exists(folder.Path));
        }
    }

    [Fact(DisplayName = "AC-606.4 저장한 뒤 읽지 못할 만큼 깊은 JSON은 저장할 때 거절한다(겉 칸 한 겹까지 64겹)")]
    public void DepthRoundTrips()
    {
        var (folder, _, store) = Open();
        using (folder)
        {
            var deepest = Contacts.Nested(63);
            store.Save(Profile, deepest);
            Assert.Equal(deepest, store.Load(Profile));
            Assert.Equal(new[] { "contact.dat" }, Contacts.Names(folder.Path));

            Assert.Equal("E-HELPER-BAD-MESSAGE", Code(() => store.Save(Profile, Contacts.Nested(64))));
        }
    }
}
