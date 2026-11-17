using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using Precheck.Core.Reception;
using Precheck.Core.Tests.Protocol;
using Xunit;

// 이 TASK의 시험만 한 거르기로 돌리려고 Embed 이름 공간에 둔다
namespace Precheck.Core.Tests.Reception.Embed;

/// <summary>
/// 휴대폰 화면 파일 품기(TASK-16, design.md 7절·10절). Core csproj가 <c>reception/www/**</c>를 <c>reception/…</c> 이름으로 품어
/// 도우미가 바깥 주소 없이 화면·글꼴·로고·매니페스트를 함께 내준다.
/// AC-1407.8 글꼴(fonts/title.woff2)·로고·화면 파일을 모두 품고, 내용이 저장소 파일과 같다.
/// AC-1407.9 홈 화면 추가에 쓰는 manifest.webmanifest와 그 아이콘(병원과 상관없는 icon.png, spec reception-other-clinic AC-5709.4)도 품는다.
/// 옛 로고 그림(logo-mark.png·logo-wordmark.png)도 그대로 품는다(우리 의원 옮기기가 wordmark를 쓴다, spec reception-other-clinic design.md 7절).
/// 화면이 부르는 파일(index.html의 /… 주소·.js의 './….js' 가져오기, 새로 생기는 settings.js 포함)은 모두 품고 화면 파일로 나간다(spec reception-other-clinic TASK-8).
/// 윈도우 빌드의 %(RecursiveDir)은 '\'라서 이름을 '/'로 맞춰 견준다(StaticFiles와 같은 규칙).
/// </summary>
public class StaticEmbedTests
{
    private const string Prefix = "reception/";

    private static readonly Assembly Core = typeof(ReceptionSql).Assembly;

    private static string Www => Repo.PathOf("reception", "www");

    /// <summary>품은 이름('/'로 맞춤) → 원래 이름.</summary>
    private static Dictionary<string, string> Embedded() =>
        Core.GetManifestResourceNames()
            .Where(n => n.Replace('\\', '/').StartsWith(Prefix, StringComparison.Ordinal))
            .ToDictionary(n => n.Replace('\\', '/'), n => n, StringComparer.Ordinal);

    /// <summary>저장소의 reception/www 파일 → 품을 이름.</summary>
    private static List<string> OnDisk()
    {
        if (!Directory.Exists(Www)) return new List<string>();
        return Directory.EnumerateFiles(Www, "*", SearchOption.AllDirectories)
            .Select(f => Prefix + f.Substring(Www.Length).TrimStart(Path.DirectorySeparatorChar, '/').Replace('\\', '/'))
            .OrderBy(n => n, StringComparer.Ordinal)
            .ToList();
    }

    private static byte[] Bytes(string resource)
    {
        using var stream = Core.GetManifestResourceStream(resource) ?? throw new InvalidOperationException(resource);
        using var copy = new MemoryStream();
        stream.CopyTo(copy);
        return copy.ToArray();
    }

    [Fact(DisplayName = "AC-1407.8 Core는 reception/www의 파일을 모두 reception/… 이름으로 품고, 내용이 저장소 파일과 같다")]
    public void EmbedsEveryScreenFile()
    {
        var disk = OnDisk();
        foreach (var must in new[] { "index.html", "theme.css", "style.css", "dom.js", "fonts/title.woff2", "fonts/OFL.txt", "logo-wordmark.png", "logo-mark.png", "icon.png" })
            Assert.Contains(Prefix + must, disk);

        var embedded = Embedded();
        foreach (var name in disk)
        {
            Assert.True(embedded.ContainsKey(name), $"품지 않았다: {name}");
            var file = Path.Combine(new[] { Www }.Concat(name.Substring(Prefix.Length).Split('/')).ToArray());
            Assert.Equal(File.ReadAllBytes(file), Bytes(embedded[name]));
        }
    }

    [Fact(DisplayName = "AC-1407.8 품은 reception/ 파일은 reception/www에 있는 것뿐이다(시험·글꼴 만드는 스크립트는 품지 않는다)")]
    public void EmbedsOnlyScreenFiles()
    {
        var disk = new HashSet<string>(OnDisk(), StringComparer.Ordinal);
        Assert.NotEmpty(disk);
        var embedded = Embedded().Keys.ToList();
        Assert.NotEmpty(embedded);
        foreach (var name in embedded)
        {
            Assert.Contains(name, disk);
            Assert.DoesNotContain("tests/", name, StringComparison.Ordinal);
            Assert.False(name.EndsWith(".py", StringComparison.Ordinal), name);
        }
    }

    [Fact(DisplayName = "AC-1407.9 홈 화면 추가에 쓰는 매니페스트와 그 아이콘(icon.png 512×512 PNG, spec reception-other-clinic AC-5709.4)을 품고, 옛 로고 그림 logo-mark.png도 그대로 품는다")]
    public void EmbedsManifestAndIcon()
    {
        var embedded = Embedded();
        Assert.Contains(Prefix + "manifest.webmanifest", embedded.Keys);
        using var manifest = System.Text.Json.JsonDocument.Parse(Bytes(embedded[Prefix + "manifest.webmanifest"]));
        var icons = manifest.RootElement.GetProperty("icons").EnumerateArray().ToArray();
        Assert.NotEmpty(icons);
        foreach (var entry in icons)
        {
            var src = entry.GetProperty("src").GetString()!;
            Assert.StartsWith("/", src);
            Assert.Contains(Prefix + src.Substring(1), embedded.Keys);
            var png = Bytes(embedded[Prefix + src.Substring(1)]);
            Assert.Equal(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }, png.Take(8).ToArray());
            var size = BigEndian(png, 16) + "x" + BigEndian(png, 20);
            Assert.Equal(entry.GetProperty("sizes").GetString(), size);
        }
        Assert.Equal("/icon.png", icons[0].GetProperty("src").GetString());

        Assert.Contains(Prefix + "logo-mark.png", embedded.Keys);
        var mark = Bytes(embedded[Prefix + "logo-mark.png"]);
        Assert.Equal(new byte[] { 0x89, 0x50, 0x4E, 0x47 }, mark.Take(4).ToArray());
    }

    [Fact(DisplayName = "AC-1407.8 화면이 부르는 파일(index.html의 /… 주소, .js 파일의 './….js' 가져오기 — 새 settings.js 포함)은 모두 저장소에 있고, 품었고, 품은 화면 파일로 200이다")]
    public void EmbedsEveryReferencedFile()
    {
        var embedded = Embedded();
        var files = new Precheck.Core.Reception.Http.StaticFiles(Precheck.Core.Reception.Http.EmbeddedStaticSource.Core());
        var referenced = new SortedSet<string>(StringComparer.Ordinal);
        var index = File.ReadAllText(Path.Combine(Www, "index.html"));
        foreach (System.Text.RegularExpressions.Match m in System.Text.RegularExpressions.Regex.Matches(index, @"(?:src|href)=""/([^""?#]+)"""))
            referenced.Add(m.Groups[1].Value);
        foreach (var script in Directory.EnumerateFiles(Www, "*.js"))
        {
            foreach (System.Text.RegularExpressions.Match m in System.Text.RegularExpressions.Regex.Matches(File.ReadAllText(script), @"(?:from\s+|import\s*\(\s*)'\./([^']+)'"))
                referenced.Add(m.Groups[1].Value);
        }
        Assert.Contains("app.js", referenced);
        Assert.Contains("icon.png", referenced);
        if (File.Exists(Path.Combine(Www, "settings.js"))) Assert.Contains("settings.js", referenced);
        foreach (var name in referenced)
        {
            Assert.True(File.Exists(Path.Combine(new[] { Www }.Concat(name.Split('/')).ToArray())), $"저장소에 없다: {name}");
            Assert.True(embedded.ContainsKey(Prefix + name), $"품지 않았다: {name}");
            var answer = files.Get("/" + name);
            Assert.True(answer != null && answer.Status == 200, $"화면 파일로 나가지 않는다: {name}");
        }
    }

    private static long BigEndian(byte[] bytes, int at) =>
        ((long)bytes[at] << 24) | ((long)bytes[at + 1] << 16) | ((long)bytes[at + 2] << 8) | bytes[at + 3];
}
