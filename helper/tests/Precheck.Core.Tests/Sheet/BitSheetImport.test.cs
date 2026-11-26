using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Precheck.Core.Sheet;
using Precheck.Core.Store;
using Xunit;

namespace Precheck.Core.Tests.Sheet;

/// <summary>가짜 DPAPI: 앞에 표시 한 바이트를 붙이고 거꾸로 둔다. 표시가 없으면 풀지 못한다(CryptographicException, IProtector 약속).</summary>
internal sealed class FakeBitSheetProtector : IProtector
{
    private const byte Mark = 0x5A;

    public byte[] Protect(byte[] plain) => new[] { Mark }.Concat(plain.Reverse()).ToArray();

    public byte[] Unprotect(byte[] cipher)
    {
        if (cipher.Length == 0 || cipher[0] != Mark) throw new CryptographicException("fake");
        return cipher.Skip(1).Reverse().ToArray();
    }

    public string Lock(string text) => Convert.ToBase64String(Protect(Encoding.UTF8.GetBytes(text)));
}

/// <summary>
/// 비트시트 %APPDATA%\BitSheet\settings.json(판 2) 가져오기(spec google-link TASK-9, AC-8510.3).
/// 비트시트 SettingsTests의 파일 시험(만들기·깨짐·옛 판·못 읽는 비밀 글자)을 '읽기만 하는 가져오기' 뜻으로 옮겼다:
/// 도우미는 비트시트 파일을 만들거나 고치거나 깨진 사본을 남기지 않는다. 주소·비밀 글자·메일은 지어낸 것이다.
/// </summary>
public class BitSheetImportTests
{
    private const string Token = "Abcdefghijklmnop0123456789ABCDEF";
    private const string Script = "https://script.google.com/macros/s/AKfycFAKE0123456789/exec";
    private const string Template = "https://docs.google.com/spreadsheets/d/FAKEtemplate_0123456789/edit";

    private static readonly FakeBitSheetProtector Protector = new FakeBitSheetProtector();

    private static string TempDir()
    {
        var dir = Path.Combine(Path.GetTempPath(), "bitsheet-import-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        return dir;
    }

    /// <summary>비트시트 SettingsFile.Save가 쓰는 꼴(PascalCase 칸, JavaScriptSerializer + 들여쓰기, 줄바꿈 \r\n)의 판 2 파일.</summary>
    private static string BitSheetFile(string? token = null, string version = "\"Version\": 2,\r\n  ", string free = "4", string url = Script) =>
        "{\r\n  " + version
        + "\"WebAppUrl\": \"" + url + "\",\r\n  \"TokenProtected\": \"" + (token ?? Protector.Lock(Token)) + "\",\r\n"
        + "  \"TemplateUrl\": \"" + Template + "\",\r\n  \"FileNamePattern\": \"{병원} 일일수납일지 {yyyy}년 {m}월\",\r\n"
        + "  \"HospitalName\": \"\",\r\n  \"FolderUrl\": \"\",\r\n  \"ShareWith\": [\r\n    \"desk@fake.test\",\r\n    \"not-a-mail\"\r\n  ],\r\n"
        + "  \"FirstRow\": 17,\r\n  \"LastRow\": 302,\r\n"
        + "  \"Columns\": {\r\n    \"Key\": \"B\",\r\n    \"Name\": \"C\",\r\n    \"Sign\": \"D\",\r\n    \"Amount\": \"F\",\r\n    \"Room\": \"I\",\r\n"
        + "    \"First\": \"J\",\r\n    \"Day90\": \"K\",\r\n    \"Block\": \"L\",\r\n    \"Therapy\": \"M\",\r\n    \"Note\": \"G\"\r\n  },\r\n"
        + "  \"MarkValue\": \"0\",\r\n  \"BitRoot\": \"C:\\\\DrBIT50\",\r\n  \"HospitalCode\": \"\",\r\n"
        + "  \"DeptRooms\": {\r\n    \"OS\": 1,\r\n    \"OS2\": 2\r\n  },\r\n  \"DeptRoomsHospital\": \"H1\",\r\n"
        + "  \"FirstVisitKinds\": [\r\n    \"1\"\r\n  ],\r\n  \"Day90Kinds\": [\r\n    \"3\"\r\n  ],\r\n  \"BlockCodes\": [\r\n    \"LA221\"\r\n  ],\r\n  \"TherapyCodes\": [],\r\n"
        + "  \"Free\": " + free + ",\r\n  \"FreeInsurance\": [\r\n    31\r\n  ],\r\n  \"CarInsurance\": [\r\n    21,\r\n    22\r\n  ],\r\n  \"AidInsurance\": [\r\n    51,\r\n    52\r\n  ],\r\n"
        + "  \"Signs\": {\r\n    \"Cash\": 1,\r\n    \"Card\": 2,\r\n    \"ReceivableCash\": 3,\r\n    \"ReceivableCard\": 4,\r\n    \"Transfer\": 5,\r\n    \"ReceivableTransfer\": 5,\r\n    \"Free\": 6\r\n  },\r\n"
        + "  \"StaffCols\": [\r\n    \"G\",\r\n    \"O\"\r\n  ],\r\n  \"ShiftCols\": \"A:P\",\r\n  \"StartWithWindows\": true,\r\n  \"IntervalEnabled\": true,\r\n"
        + "  \"IntervalMinutes\": 5,\r\n  \"HoursStart\": \"08:00\",\r\n  \"HoursEnd\": \"20:00\",\r\n  \"EveningEnabled\": true,\r\n  \"EveningTime\": \"19:30\"\r\n}";

    private static string Write(string dir, string text)
    {
        var path = Path.Combine(dir, "settings.json");
        File.WriteAllText(path, text, new UTF8Encoding(false));
        return path;
    }

    [Fact(DisplayName = "AC-8510.3 비트시트 판 2 설정 → 웹 설정 JSON + 비밀 글자(DPAPI entropy BitSheet.token.v1로 풂) + 코드 주소 + 함께 쓸 메일, 파일은 읽기만")]
    public void ImportsVersionTwo()
    {
        var dir = TempDir();
        var path = Write(dir, BitSheetFile());
        var before = File.ReadAllBytes(path);

        var got = BitSheetImport.Read(path, Protector);

        Assert.NotNull(got);
        Assert.Equal(Token, got!.Secret);
        Assert.Equal(SheetCode.Tag(Token), got.SecretTag);
        Assert.Equal(Script, got.Url);
        Assert.Equal(new[] { "desk@fake.test" }, got.ShareWith);
        Assert.Equal(Template, got.Settings.TemplateUrl);
        Assert.Equal("LA221", string.Join(",", got.Settings.BlockCodes));
        using (var doc = JsonDocument.Parse(got.SettingsJson))
        {
            var root = doc.RootElement;
            Assert.Equal(Template, root.GetProperty("templateUrl").GetString());
            Assert.Equal("H1", root.GetProperty("deptRoomsHospital").GetString());
            Assert.Equal("{\"OS\":1,\"OS2\":2}", root.GetProperty("deptRooms").GetRawText());
            Assert.Equal("discount", root.GetProperty("free").GetString());
            Assert.Equal("[\"LA221\"]", root.GetProperty("blockCodes").GetRawText());
            foreach (var key in new[] { "url", "shareWith", "scriptUrl", "webAppUrl", "token", "secret", "tokenProtected" })
            {
                Assert.False(root.TryGetProperty(key, out _), key);
            }
        }
        Assert.DoesNotContain(Token, got.SettingsJson, StringComparison.Ordinal);
        Assert.DoesNotContain("script.google.com", got.SettingsJson, StringComparison.Ordinal);
        Assert.DoesNotContain("desk@fake.test", got.SettingsJson, StringComparison.Ordinal);
        Assert.Equal(SheetSettingsJson.ToJson(got.Settings), got.SettingsJson);

        Assert.True(before.SequenceEqual(File.ReadAllBytes(path)), "읽기만 한다");
        Assert.Equal(new[] { "settings.json" }, Directory.GetFiles(dir).Select(Path.GetFileName));
        Assert.Equal("BitSheet.token.v1", Encoding.UTF8.GetString(BitSheetImport.Entropy()));
        Assert.Equal(Path.Combine(@"C:\Users\fake\AppData\Roaming", "BitSheet", "settings.json"), BitSheetImport.DefaultPath(@"C:\Users\fake\AppData\Roaming"));
    }

    [Fact(DisplayName = "AC-8510.3 BOM이 붙은 파일·한 줄 파일도 읽는다")]
    public void ReadsBomAndCompact()
    {
        var dir = TempDir();
        var path = Path.Combine(dir, "settings.json");
        File.WriteAllBytes(path, new byte[] { 0xEF, 0xBB, 0xBF }.Concat(Encoding.UTF8.GetBytes(BitSheetFile().Replace("\r\n", "").Replace("  ", ""))).ToArray());
        Assert.Equal(Token, BitSheetImport.Read(path, Protector)!.Secret);
    }

    [Fact(DisplayName = "AC-8510.3 비트시트 설정 파일이 없으면 null(가져올 것 없음), 아무것도 만들지 않는다")]
    public void MissingFileIsNothing()
    {
        var dir = TempDir();
        Assert.Null(BitSheetImport.Read(Path.Combine(dir, "settings.json"), Protector));
        Assert.Empty(Directory.GetFiles(dir));
        Assert.Null(BitSheetImport.Read(Path.Combine(dir, "BitSheet", "settings.json"), Protector));
        Assert.Empty(Directory.GetFileSystemEntries(dir));
    }

    [Fact(DisplayName = "AC-8510.3 깨진 파일은 아무것도 바꾸지 않고(깨진 사본도 만들지 않음) E-STORE-BROKEN만 낸다")]
    public void BrokenFileGivesOnlyACode()
    {
        var dir = TempDir();
        var path = Path.Combine(dir, "settings.json");
        var broken = Encoding.UTF8.GetBytes("{ \"WebAppUrl\": \"" + Script + "\", \"TokenProtected\": \"abc\", ");
        File.WriteAllBytes(path, broken);
        var e = Assert.Throws<SheetException>(() => BitSheetImport.Read(path, Protector));
        Assert.Equal("E-STORE-BROKEN", e.Code);
        Assert.Equal("E-STORE-BROKEN", e.Message);
        Assert.True(broken.SequenceEqual(File.ReadAllBytes(path)), "original untouched");
        Assert.Equal(new[] { "settings.json" }, Directory.GetFiles(dir).Select(Path.GetFileName));

        foreach (var text in new[] { "", "null", "[1,2]", "{\"Free\":\"zzz\"}", "{\"IntervalMinutes\":99999999999}", "{\"Columns\":[]}" })
        {
            File.WriteAllText(path, text);
            Assert.Equal("E-STORE-BROKEN", Assert.Throws<SheetException>(() => BitSheetImport.Read(path, Protector)).Code);
            Assert.Equal(text, File.ReadAllText(path));
        }
        File.WriteAllBytes(path, new byte[] { 0x7B, 0xFF, 0xFE, 0x7D });
        Assert.Equal("E-STORE-BROKEN", Assert.Throws<SheetException>(() => BitSheetImport.Read(path, Protector)).Code);
        Assert.Equal(new[] { "settings.json" }, Directory.GetFiles(dir).Select(Path.GetFileName));
    }

    [Fact(DisplayName = "AC-8510.3 판 칸이 없는 옛 파일: 옛 기본 FREE(받은 돈 0원)는 새 기본(할인 기록 FREE)으로 읽고, 비밀 글자는 그대로, 파일은 다시 쓰지 않는다")]
    public void OldVersionFileMigratesWithoutRewriting()
    {
        var dir = TempDir();
        var path = Write(dir, BitSheetFile(version: "", free: "0"));
        var before = File.ReadAllText(path);
        var got = BitSheetImport.Read(path, Protector)!;
        Assert.Equal(FreeRule.DiscountFree, got.Settings.Free);
        Assert.Contains("\"free\":\"discount\"", got.SettingsJson, StringComparison.Ordinal);
        Assert.Equal(Token, got.Secret);
        Assert.Equal(before, File.ReadAllText(path));

        // 판 2에서 고른 옛 규칙은 그대로
        Write(dir, BitSheetFile(free: "0"));
        Assert.Equal(FreeRule.OwedNotPaid, BitSheetImport.Read(path, Protector)!.Settings.Free);
    }

    [Fact(DisplayName = "AC-8510.3 이 PC에서 풀지 못하는(다른 PC·사용자) 비밀 글자·빈 비밀 글자·모양이 틀린 비밀 글자는 E-GSHEET-SECRET, 새로 만들지 않고 파일은 그대로")]
    public void UnreadableTokenIsNotReplaced()
    {
        var dir = TempDir();
        foreach (var token in new[] { "bm90LWEtZHBhcGktYmxvYg==", "", "not base64!", Protector.Lock("short"), Protector.Lock("Abcdefghijklmnop'0123456789") })
        {
            var path = Write(dir, BitSheetFile(token: token));
            var bytes = File.ReadAllBytes(path);
            Assert.Equal("E-GSHEET-SECRET", Assert.Throws<SheetException>(() => BitSheetImport.Read(path, Protector)).Code);
            Assert.True(bytes.SequenceEqual(File.ReadAllBytes(path)), "file untouched");
        }
        Assert.Equal(new[] { "settings.json" }, Directory.GetFiles(dir).Select(Path.GetFileName));
    }

    [Fact(DisplayName = "AC-8510.3 코드 주소가 구글 웹 앱 꼴이 아니면 주소는 빈 채로 가져온다(그 주소로는 보내지 않음)")]
    public void OddUrlIsNotImported()
    {
        var dir = TempDir();
        foreach (var url in new[] { "https://x/exec", "http://script.google.com/macros/s/AKfycFAKE0123456789/exec", "https://script.google.com/macros/s/AKfycFAKE0123456789/dev", "" })
        {
            var got = BitSheetImport.Read(Write(dir, BitSheetFile(url: url)), Protector)!;
            Assert.Equal("", got.Url);
            Assert.Equal(Token, got.Secret);
        }
        var work = BitSheetImport.Read(Write(dir, BitSheetFile(url: "https://script.google.com/a/macros/fake-clinic.test/s/AKfycFAKE0123456789/exec")), Protector)!;
        Assert.Equal("https://script.google.com/a/macros/fake-clinic.test/s/AKfycFAKE0123456789/exec", work.Url);
    }

    [Fact(DisplayName = "AC-8510.3 다른 프로그램이 파일을 잠가 읽지 못하면 E-STORE-FAILED")]
    public void LockedFileGivesStoreFailed()
    {
        if (!RuntimeInformation.IsOSPlatform(OSPlatform.Windows)) return; // 잠금은 윈도우에서만 읽기를 막는다
        var dir = TempDir();
        var path = Write(dir, BitSheetFile());
        using (new FileStream(path, FileMode.Open, FileAccess.ReadWrite, FileShare.None))
        {
            Assert.Equal("E-STORE-FAILED", Assert.Throws<SheetException>(() => BitSheetImport.Read(path, Protector)).Code);
        }
        Assert.Equal(Token, BitSheetImport.Read(path, Protector)!.Secret);
    }
}
