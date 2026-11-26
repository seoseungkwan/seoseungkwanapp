using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using Precheck.Core.Bit;

namespace Precheck.Core.Sheet;

/// <summary>
/// 시간 한도 하나(spec google-link design.md 9-2: 비트 읽기 20초 · 구글 보내기 45초 · 전체 60초). 시계는 넘겨받는다(시험은 가짜 시계).
/// 넘으면 E-GSHEET-TIMEOUT.
/// </summary>
public sealed class SheetDeadline
{
    public static readonly TimeSpan Bit = TimeSpan.FromSeconds(20);
    public static readonly TimeSpan Google = TimeSpan.FromSeconds(45);
    public static readonly TimeSpan Total = TimeSpan.FromSeconds(60);

    private readonly Func<TimeSpan> clock;
    private readonly TimeSpan end;

    public SheetDeadline(Func<TimeSpan> clock, TimeSpan budget)
    {
        this.clock = clock ?? throw new ArgumentNullException(nameof(clock));
        end = clock() + budget;
    }

    /// <summary>남은 시간(지나면 0 이하).</summary>
    public TimeSpan Left => end - clock();

    public void Check()
    {
        if (Left <= TimeSpan.Zero) throw new SheetException(SheetErrors.Timeout);
    }
}

/// <summary>비트 읽기 몫(20초) 안에서만 문장을 돌린다: 문장마다 시간 한도를 남은 시간까지 줄이고, 앞뒤로 한도를 본다.</summary>
internal sealed class BudgetDb : IBitDb
{
    private readonly IBitDb inner;
    private readonly SheetDeadline deadline;

    public BudgetDb(IBitDb inner, SheetDeadline deadline)
    {
        this.inner = inner ?? throw new ArgumentNullException(nameof(inner));
        this.deadline = deadline ?? throw new ArgumentNullException(nameof(deadline));
    }

    public IReadOnlyList<IReadOnlyList<object?>> Query(string sql, IReadOnlyDictionary<string, object?> args, TimeSpan timeout)
    {
        deadline.Check();
        var left = deadline.Left;
        var rows = inner.Query(sql, args, timeout < left ? timeout : left);
        deadline.Check();
        return rows;
    }
}

/// <summary>구글 몫(45초, 전체 60초 안) 안에서만 HTTP를 보낸다: 보내기 앞뒤로 한도를 본다(넘김 GET도 한 번씩).</summary>
internal sealed class BudgetTransport : ISheetTransport
{
    private readonly ISheetTransport inner;
    private readonly SheetDeadline deadline;

    public BudgetTransport(ISheetTransport inner, SheetDeadline deadline)
    {
        this.inner = inner ?? throw new ArgumentNullException(nameof(inner));
        this.deadline = deadline ?? throw new ArgumentNullException(nameof(deadline));
    }

    public SheetHttpReply Send(string method, string url, string? jsonBody)
    {
        deadline.Check();
        var reply = inner.Send(method, url, jsonBody);
        deadline.Check();
        return reply;
    }
}

/// <summary>
/// 주소 확인(spec google-link AC-8511.3, design.md 8-1·9-2): 비밀 글자 없이 hello(nonce)를 보내 mac = base64url(HMAC-SHA256(비밀 글자, nonce))이
/// 맞는지 같은 시간 비교로 본다. 틀리면 E-GSHEET-KEY, hello를 모르는 7판이면(답 읽기에서) E-GSHEET-OLD.
/// </summary>
public static class SheetHello
{
    public static void Verify(WebAppClient client, string url, string secret, string nonce)
    {
        if (client == null) throw new ArgumentNullException(nameof(client));
        var reply = client.Call(url, new Dictionary<string, object> { ["action"] = "hello", ["nonce"] = nonce });
        if (!Matches(secret, nonce, reply.Mac)) throw new SheetException(SheetErrors.Key);
    }

    /// <summary>mac이 HMAC-SHA256(비밀 글자, nonce)의 base64url(덧붙임 없음)과 같은가. 길이가 달라도 끝까지 견준다.</summary>
    public static bool Matches(string secret, string nonce, string? mac)
    {
        if (secret == null) throw new ArgumentNullException(nameof(secret));
        if (nonce == null) throw new ArgumentNullException(nameof(nonce));
        var expected = Encoding.ASCII.GetBytes(Mac(secret, nonce));
        var given = Encoding.ASCII.GetBytes(mac ?? "");
        var diff = expected.Length ^ given.Length;
        for (var i = 0; i < expected.Length; i++) diff |= expected[i] ^ (i < given.Length ? given[i] : 0);
        return diff == 0;
    }

    public static string Mac(string secret, string nonce)
    {
        var key = Encoding.UTF8.GetBytes(secret);
        try
        {
            using (var hmac = new HMACSHA256(key))
            {
                return Convert.ToBase64String(hmac.ComputeHash(Encoding.UTF8.GetBytes(nonce))).TrimEnd('=').Replace('+', '-').Replace('/', '_');
            }
        }
        finally
        {
            Array.Clear(key, 0, key.Length);
        }
    }
}
