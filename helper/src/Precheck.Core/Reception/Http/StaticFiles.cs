using System;
using System.Collections.Generic;

namespace Precheck.Core.Reception.Http;

/// <summary>
/// 휴대폰 화면 파일 내주기(design.md 7절, AC-1406.5). 원천(IStaticSource)의 reception/… 이름만 처음에 한 번 읽어 두고,
/// 요청 경로는 그 표와 글자 그대로 견준다. 요청 경로를 디스크 경로로 쓰지 않으므로 ..·\·퍼센트 글자로 밖을 가리킬 수 없다.
/// - 이름은 '\' → '/'로 맞추고 앞의 reception/을 뗀 뒤 '/'를 붙인 것이 요청 경로다(reception/fonts/title.woff2 → /fonts/title.woff2).
/// - 형식은 확장자 표로만 정한다. 표에 없는 확장자 파일은 내주지 않는다(nosniff와 함께 브라우저가 형식을 짐작하지 않게).
/// - / 는 /index.html과 같다.
/// </summary>
public sealed class StaticFiles
{
    public const string Prefix = "reception/";

    /// <summary>확장자 → Content-Type</summary>
    public static IReadOnlyDictionary<string, string> ContentTypes { get; } = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        [".html"] = "text/html; charset=utf-8",
        [".css"] = "text/css; charset=utf-8",
        [".js"] = "text/javascript; charset=utf-8",
        [".woff2"] = "font/woff2",
        [".webmanifest"] = "application/manifest+json",
        [".png"] = "image/png",
        [".txt"] = "text/plain; charset=utf-8",
    };

    private const string Index = "/index.html";

    private readonly Dictionary<string, (string Type, byte[] Body)> files = new Dictionary<string, (string, byte[])>(StringComparer.Ordinal);

    public StaticFiles(IStaticSource source)
    {
        if (source == null) throw new ArgumentNullException(nameof(source));
        foreach (var name in source.Names)
        {
            if (name == null) continue;
            var normal = name.Replace('\\', '/');
            if (!normal.StartsWith(Prefix, StringComparison.Ordinal) || normal.Length == Prefix.Length) continue;
            var type = TypeOf(normal);
            if (type == null) continue;
            var body = source.Read(name);
            if (body == null) continue;
            files["/" + normal.Substring(Prefix.Length)] = (type, body);
        }
    }

    /// <summary>그 경로의 화면 파일 답(200). 넣어 둔 파일이 아니면 null</summary>
    public HttpResponse? Get(string path)
    {
        if (path == null) return null;
        var key = path == "/" ? Index : path;
        return files.TryGetValue(key, out var file) ? HttpResponse.Bytes(file.Type, file.Body) : null;
    }

    private static string? TypeOf(string name)
    {
        var slash = name.LastIndexOf('/');
        var dot = name.LastIndexOf('.');
        if (dot <= slash + 1) return null;
        return ContentTypes.TryGetValue(name.Substring(dot), out var type) ? type : null;
    }
}
