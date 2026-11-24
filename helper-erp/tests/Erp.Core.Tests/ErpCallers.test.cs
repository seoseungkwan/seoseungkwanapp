using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Erp.Core;
using Precheck.Core.Protocol;
using Precheck.Core.Tests.Protocol;
using Xunit;

namespace Erp.Core.Tests;

/// <summary>
/// spec erp-copy-list REQ-3902(TASK-4, design.md 8절): ERP 도우미 하나가 두 확장을 받는다.
/// ErpCallers.ForMessageLoop는 첫 인자가 목록 확장('ERP 마감일지 입력 목록') origin과 글자 그대로 같을 때만 첫 인자를
/// 명령 표 확장('ERP 마감일지 채우기') origin으로 바꾼 새 배열을 주고, 그 밖은 받은 배열을 그대로 준다.
/// 기존 OriginGuard·MessageLoop(helper/)는 고치지 않는다.
/// </summary>
public class ErpCallersTests
{
    /// <summary>목록 확장 origin(글자 그대로). ID가 extension-erp-list/manifest.json key로 계산한 값인지는 AC-3902.3이 본다.</summary>
    private const string ListOrigin = "chrome-extension://gaipapghcaabmmnldghknjmjkknahdae/";

    /// <summary>명령 표(helper-erp/commands.json extensionId) 확장 = 지금 확장 'ERP 마감일지 채우기'.</summary>
    private const string TableOrigin = "chrome-extension://lkancaiekmoieooheifdimahhkejfmjc/";

    /// <summary>청구 확장(extension/manifest.json).</summary>
    private const string ClaimOrigin = "chrome-extension://cmnefbmfclmjkfbnjnbfnlndlpjnihka/";

    private static readonly CommandTable Table = ErpCommandTable.Load();

    /// <summary>크롬 규칙: 공개키(DER) SHA-256 앞 16바이트를 16진수로 쓰고 0-f를 a-p로 바꾼 것이 확장 ID.</summary>
    private static string ExtensionIdOf(string key)
    {
        using var sha = SHA256.Create();
        var hash = sha.ComputeHash(Convert.FromBase64String(key));
        var hex = string.Concat(hash.Take(16).Select(b => b.ToString("x2", System.Globalization.CultureInfo.InvariantCulture)));
        return new string(hex.Select(c => (char)('a' + Convert.ToInt32(c.ToString(), 16))).ToArray());
    }

    private static string ManifestKey(params string[] parts)
    {
        using var manifest = JsonDocument.Parse(File.ReadAllText(Repo.PathOf(parts), Encoding.UTF8));
        return manifest.RootElement.GetProperty("key").GetString()!;
    }

    // ---- AC-3902.1 ForMessageLoop ------------------------------------------------------------------

    [Fact(DisplayName = "AC-3902.1 목록 확장 origin이면 첫 인자만 명령 표 확장 origin으로 바꾼 새 배열(뒤 인자 그대로, 받은 배열은 안 바뀜)")]
    public void ListOriginBecomesTableOrigin()
    {
        Assert.Equal(TableOrigin, ErpCallers.Origin(Table.ExtensionId));
        Assert.Equal(ListOrigin, ErpCallers.Origin(ErpCallers.ListExtensionId));

        var args = new[] { ListOrigin, "--parent-window=0" };
        var forwarded = ErpCallers.ForMessageLoop(args, Table);
        Assert.Equal(new[] { TableOrigin, "--parent-window=0" }, forwarded);
        Assert.NotSame(args, forwarded);
        Assert.Equal(new[] { ListOrigin, "--parent-window=0" }, args);

        // 기존 OriginGuard는 고치지 않았으므로 받은 인자는 그대로 막고, 바꾼 인자만 지난다
        Assert.False(OriginGuard.IsAllowed(args, Table));
        Assert.True(OriginGuard.IsAllowed(forwarded, Table));

        var single = new[] { ListOrigin };
        Assert.Equal(new[] { TableOrigin }, ErpCallers.ForMessageLoop(single, Table));
        Assert.Equal(new[] { ListOrigin }, single);

        var longer = new[] { ListOrigin, "--parent-window=0", "x y" };
        Assert.Equal(new[] { TableOrigin, "--parent-window=0", "x y" }, ErpCallers.ForMessageLoop(longer, Table));
        Assert.Equal(new[] { ListOrigin, "--parent-window=0", "x y" }, longer);
    }

    /// <summary>받은 배열을 그대로 돌려주는 경우(requirements AC-3902.1 목록 여덟 가지 + 목록 origin이 첫 인자가 아님).</summary>
    public static TheoryData<string, string[]> Untouched => new TheoryData<string, string[]>
    {
        { "명령 표 확장", new[] { TableOrigin, "--parent-window=0" } },
        { "청구 확장", new[] { ClaimOrigin, "--parent-window=0" } },
        { "모르는 ID", new[] { "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/" } },
        { "대문자 목록 origin", new[] { ListOrigin.ToUpperInvariant() } },
        { "끝 / 없는 목록 origin", new[] { ListOrigin.TrimEnd('/') } },
        { "빈 글자", new[] { "" } },
        { "인자 없음", new string[0] },
        { "--register", new[] { "--register" } },
        { "목록 origin이 둘째 인자", new[] { "--parent-window=0", ListOrigin } },
    };

    [Theory(DisplayName = "AC-3902.1 그 밖(명령 표 확장·청구 확장·모르는 ID·대문자·끝 / 없음·빈 글자·인자 없음·--register)은 받은 배열 그대로")]
    [MemberData(nameof(Untouched))]
    public void OtherArgsAreUntouched(string label, string[] args)
    {
        var before = args.ToArray();
        var result = ErpCallers.ForMessageLoop(args, Table);
        Assert.True(ReferenceEquals(args, result), label);
        Assert.Equal(before, args);
    }

    [Fact(DisplayName = "AC-3902.1 args·table이 null이면 ArgumentNullException")]
    public void NullThrows()
    {
        Assert.Throws<ArgumentNullException>(() => ErpCallers.ForMessageLoop(null!, Table));
        Assert.Throws<ArgumentNullException>(() => ErpCallers.ForMessageLoop(new[] { ListOrigin }, null!));
    }

    // ---- AC-3902.3 ListExtensionId -----------------------------------------------------------------

    [Fact(DisplayName = "AC-3902.3 ListExtensionId는 extension-erp-list/manifest.json key로 계산한 ID(32자 a~p)이고 명령 표 extensionId·청구 확장 ID와 다르다")]
    public void ListExtensionIdIsManifestKey()
    {
        var listId = ExtensionIdOf(ManifestKey("extension-erp-list", "manifest.json"));
        Assert.Equal(ErpCallers.ListExtensionId, listId);
        Assert.Matches(new Regex("^[a-p]{32}$"), ErpCallers.ListExtensionId);
        Assert.Equal(ListOrigin, "chrome-extension://" + listId + "/");

        // 명령 표 확장(= extension-erp/manifest.json key)·청구 확장(= extension/manifest.json key, 웹 표 extensionId)과 다르다
        Assert.Equal(ExtensionIdOf(ManifestKey("extension-erp", "manifest.json")), Table.ExtensionId);
        Assert.NotEqual(ErpCallers.ListExtensionId, Table.ExtensionId);
        var claimId = ExtensionIdOf(ManifestKey("extension", "manifest.json"));
        Assert.Equal(claimId, CommandTable.LoadEmbedded().ExtensionId);
        Assert.NotEqual(ErpCallers.ListExtensionId, claimId);
    }
}
