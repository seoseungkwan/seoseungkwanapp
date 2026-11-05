using System;
using System.Collections.Generic;

namespace Precheck.Core.Reception.Http;

/// <summary>
/// 휴대폰이 보낸 HTTP 요청 하나(design.md 7절). <see cref="HttpRequestReader"/>가 길이·시간 제한 안에서 읽어 만든다.
/// 머리 이름은 대소문자를 가리지 않는다. 같은 이름이 여러 번 오면 ", "로 이어 붙인 한 값이 되어서
/// Host·Origin·X-Reception·Content-Type이 두 번 오면 <see cref="ClientGuard"/>의 같음 검사에서 저절로 떨어진다.
/// 경로·질의는 퍼센트 글자를 풀지 않은 그대로다(길 나누기가 정해 둔 글과 견준다).
/// </summary>
public sealed class HttpRequest
{
    private readonly Dictionary<string, string> _headers;

    public HttpRequest(string method, string target, IEnumerable<KeyValuePair<string, string>> headers, byte[] body)
    {
        Method = method ?? throw new ArgumentNullException(nameof(method));
        Target = target ?? throw new ArgumentNullException(nameof(target));
        if (target.Length == 0 || target[0] != '/') throw new ArgumentException("요청 경로는 / 로 시작해야 한다", nameof(target));
        Body = body ?? throw new ArgumentNullException(nameof(body));
        _headers = Combine(headers ?? throw new ArgumentNullException(nameof(headers)));

        var question = target.IndexOf('?');
        Path = question < 0 ? target : target.Substring(0, question);
        Query = question < 0 ? null : target.Substring(question + 1);
    }

    /// <summary>요청 방법(GET·POST·OPTIONS …), 대문자 그대로</summary>
    public string Method { get; }

    /// <summary>요청 줄의 경로 + 질의 그대로(예: /api/board?fresh=1)</summary>
    public string Target { get; }

    /// <summary>? 앞의 경로(예: /api/board)</summary>
    public string Path { get; }

    /// <summary>? 뒤의 질의 글. ?가 없으면 null, ?만 있으면 빈 글</summary>
    public string? Query { get; }

    /// <summary>몸 바이트(Content-Length만큼, 없으면 빈 배열)</summary>
    public byte[] Body { get; }

    /// <summary>머리 전부(이름은 대소문자 무시, 같은 이름은 이어 붙인 한 값)</summary>
    public IReadOnlyDictionary<string, string> Headers => _headers;

    /// <summary>그 이름의 머리 값. 없으면 null</summary>
    public string? Header(string name) => name != null && _headers.TryGetValue(name, out var value) ? value : null;

    /// <summary>같은 이름(대소문자 무시)의 머리를 온 차례대로 ", "로 이어 붙인다</summary>
    internal static Dictionary<string, string> Combine(IEnumerable<KeyValuePair<string, string>> headers)
    {
        var combined = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var header in headers)
        {
            if (header.Key == null || header.Value == null) throw new ArgumentException("머리 이름·값이 비었다", nameof(headers));
            combined[header.Key] = combined.TryGetValue(header.Key, out var before) ? before + ", " + header.Value : header.Value;
        }
        return combined;
    }
}
