using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;

namespace Precheck.Core.Reception.Http;

/// <summary>
/// 요청을 읽다가 답할 수 있는 문제를 만났다(400 모양 틀림, 408 시간 넘김, 413 몸이 큼, 431 줄·머리가 큼, AC-1406.4).
/// 서버는 그 상태 번호로 몸 없는 답을 쓰고 그 연결만 닫는다. 메시지에는 번호만 들어간다(요청 글을 싣지 않는다).
/// </summary>
public sealed class HttpReadException : Exception
{
    public HttpReadException(int status) : base("http read " + status)
    {
        Status = status;
    }

    public int Status { get; }
}

/// <summary>
/// 연결 하나에서 HTTP/1.x 요청 하나를 아주 좁게 읽는다(design.md 7절, AC-1406.4).
/// - 요청 줄(줄 끝 빼고) 1024바이트, 머리(줄 끝 포함, 끝 빈 줄 뺌) 8192바이트를 넘으면 줄 끝을 기다리지 않고 431.
/// - 시간은 요청 전체에 걸린다: 조금씩 계속 와도 timeout 안에 다 오지 않으면 408. 아무것도 오지 않았으면 답 없이 끊는다(null).
/// - 몸은 Content-Length만(8192바이트 넘으면 413, 길마다 더 좁은 한도는 라우터가 본다, spec reception-arrange-tune AC-3603.5), Transfer-Encoding은 400.
///   몸 뒤에 더 온 바이트는 버린다(Connection: close).
/// - 요청 줄은 "대문자 방법 SP /로 시작하는 ASCII 경로 SP HTTP/1.1|HTTP/1.0", 머리 줄은 "이름: 값"만. 그 밖은 400.
/// - 끝까지 오기 전에 연결이 끊기거나 읽다 오류가 나면 null(답할 상대가 없다).
/// 상태를 남기지 않아 한 연결의 오류가 다른 연결에 번지지 않는다.
/// 시간이 넘으면 읽기 하나가 아직 걸려 있을 수 있으므로, 부른 쪽은 답(408)을 쓴 뒤 그 연결을 꼭 닫는다.
/// </summary>
public static class HttpRequestReader
{
    public const int MaxRequestLine = 1024;
    public const int MaxHeaderBytes = 8192;
    public const int MaxBody = 8192;

    /// <summary>요청 하나를 다 받기까지 기다리는 기본 시간(AC-1406.4)</summary>
    public static readonly TimeSpan DefaultTimeout = TimeSpan.FromSeconds(5);

    private const byte Cr = (byte)'\r';
    private const byte Lf = (byte)'\n';
    private const int MaxMethod = 16;
    private const int TimedOut = -1;

    // 줄 끝 CRLF 두 번 + 몸까지 한 번에 담는 크기. 줄·머리 검사가 먼저 걸려서 넘칠 일이 없다
    private const int Capacity = MaxRequestLine + 2 + MaxHeaderBytes + 2 + MaxBody;

    public static HttpRequest? Read(Stream s, TimeSpan timeout)
    {
        if (s == null) throw new ArgumentNullException(nameof(s));
        if (timeout <= TimeSpan.Zero) throw new ArgumentOutOfRangeException(nameof(timeout));

        var watch = Stopwatch.StartNew();
        var buf = new byte[Capacity];
        var len = 0;
        var scan = new Scan();
        while (true)
        {
            var request = scan.Advance(buf, len);
            if (request != null) return request;

            var remaining = timeout - watch.Elapsed;
            var n = remaining > TimeSpan.Zero ? ReadWithin(s, buf, len, Capacity - len, remaining) : TimedOut;
            if (n == TimedOut)
            {
                if (len == 0) return null;
                throw new HttpReadException(408);
            }
            if (n <= 0) return null;
            len += n;
        }
    }

    /// <summary>한 번 읽는다. 남은 시간 안에 오지 않으면 TimedOut, 끝·오류면 0</summary>
    private static int ReadWithin(Stream s, byte[] buf, int offset, int count, TimeSpan remaining)
    {
        Task<int> read;
        try
        {
            read = s.ReadAsync(buf, offset, count);
        }
        catch (Exception e) when (e is IOException || e is ObjectDisposedException || e is InvalidOperationException)
        {
            return 0;
        }
        try
        {
            var waitMs = (int)Math.Min(Math.Ceiling(remaining.TotalMilliseconds), int.MaxValue);
            if (!read.Wait(waitMs))
            {
                // 늦게라도 끝나면(닫힌 연결의 오류 포함) 예외를 본 것으로 해 둔다
                read.ContinueWith(t => _ = t.Exception, TaskContinuationOptions.OnlyOnFaulted | TaskContinuationOptions.ExecuteSynchronously);
                return TimedOut;
            }
            return read.Result;
        }
        catch (AggregateException)
        {
            return 0;
        }
    }

    /// <summary>받은 바이트를 앞에서부터 한 번만 훑는다(조각으로 와도 같은 결과)</summary>
    private sealed class Scan
    {
        private int _cursor;
        private bool _lineDone;
        private string _method = "";
        private string _target = "";
        private int _headerStart;
        private int _lineStart;
        private readonly List<KeyValuePair<string, string>> _headers = new List<KeyValuePair<string, string>>();
        private int _bodyStart = -1;
        private Dictionary<string, string>? _combined;
        private int _bodyLength;

        public HttpRequest? Advance(byte[] buf, int len)
        {
            if (!_lineDone && !RequestLine(buf, len)) return null;
            if (_bodyStart < 0 && !HeaderLines(buf, len)) return null;
            if (len - _bodyStart < _bodyLength) return null;

            var body = new byte[_bodyLength];
            Array.Copy(buf, _bodyStart, body, 0, _bodyLength);
            return new HttpRequest(_method, _target, _combined!, body);
        }

        private bool RequestLine(byte[] buf, int len)
        {
            var lf = Array.IndexOf(buf, Lf, _cursor, len - _cursor);
            if (lf < 0)
            {
                // CR 하나는 줄 끝일 수 있어 한 바이트 더 기다린다
                if (len > MaxRequestLine + 1) throw new HttpReadException(431);
                _cursor = len;
                return false;
            }
            var end = lf > 0 && buf[lf - 1] == Cr ? lf - 1 : lf;
            if (end > MaxRequestLine) throw new HttpReadException(431);
            ParseRequestLine(buf, end);
            _lineDone = true;
            _headerStart = _lineStart = _cursor = lf + 1;
            return true;
        }

        private bool HeaderLines(byte[] buf, int len)
        {
            while (true)
            {
                var lf = Array.IndexOf(buf, Lf, _cursor, len - _cursor);
                if (lf < 0)
                {
                    // 끝나지 않은 줄까지 더해 이미 넘었으면 빈 줄을 기다리지 않는다(남은 CR 하나는 끝 빈 줄일 수 있다)
                    if (len - _headerStart > MaxHeaderBytes + 1) throw new HttpReadException(431);
                    _cursor = len;
                    return false;
                }
                var end = lf > _lineStart && buf[lf - 1] == Cr ? lf - 1 : lf;
                if (end == _lineStart)
                {
                    _bodyStart = lf + 1;
                    _combined = HttpRequest.Combine(_headers);
                    _bodyLength = BodyLength(_combined);
                    return true;
                }
                if (lf + 1 - _headerStart > MaxHeaderBytes) throw new HttpReadException(431);
                _headers.Add(ParseHeader(buf, _lineStart, end));
                _lineStart = _cursor = lf + 1;
            }
        }

        private void ParseRequestLine(byte[] buf, int end)
        {
            var first = Array.IndexOf(buf, (byte)' ', 0, end);
            var second = first < 0 ? -1 : Array.IndexOf(buf, (byte)' ', first + 1, end - first - 1);
            if (first <= 0 || second < 0 || Array.IndexOf(buf, (byte)' ', second + 1, end - second - 1) >= 0) throw new HttpReadException(400);
            if (first > MaxMethod) throw new HttpReadException(400);
            for (var i = 0; i < first; i++)
            {
                if (buf[i] < 'A' || buf[i] > 'Z') throw new HttpReadException(400);
            }
            if (second - first - 1 == 0 || buf[first + 1] != '/') throw new HttpReadException(400);
            for (var i = first + 1; i < second; i++)
            {
                // 보이는 ASCII만(빈칸·제어·DEL·8비트 글자·# 없음)
                if (buf[i] < 0x21 || buf[i] > 0x7E || buf[i] == '#') throw new HttpReadException(400);
            }
            var version = Latin1(buf, second + 1, end);
            if (version != "HTTP/1.1" && version != "HTTP/1.0") throw new HttpReadException(400);
            _method = Latin1(buf, 0, first);
            _target = Latin1(buf, first + 1, second);
        }

        private static KeyValuePair<string, string> ParseHeader(byte[] buf, int start, int end)
        {
            var colon = Array.IndexOf(buf, (byte)':', start, end - start);
            if (colon <= start) throw new HttpReadException(400);
            for (var i = start; i < colon; i++)
            {
                if (!IsTokenChar(buf[i])) throw new HttpReadException(400);
            }
            var from = colon + 1;
            var to = end;
            while (from < to && (buf[from] == ' ' || buf[from] == '\t')) from++;
            while (to > from && (buf[to - 1] == ' ' || buf[to - 1] == '\t')) to--;
            for (var i = from; i < to; i++)
            {
                if ((buf[i] < 0x20 && buf[i] != '\t') || buf[i] == 0x7F) throw new HttpReadException(400);
            }
            return new KeyValuePair<string, string>(Latin1(buf, start, colon), Latin1(buf, from, to));
        }

        private static int BodyLength(Dictionary<string, string> headers)
        {
            if (headers.ContainsKey("Transfer-Encoding")) throw new HttpReadException(400);
            if (!headers.TryGetValue("Content-Length", out var text)) return 0;
            if (text.Length == 0) throw new HttpReadException(400);
            foreach (var c in text)
            {
                if (c < '0' || c > '9') throw new HttpReadException(400);
            }
            var digits = text.TrimStart('0');
            if (digits.Length > 4) throw new HttpReadException(413);
            var length = digits.Length == 0 ? 0 : int.Parse(digits, System.Globalization.CultureInfo.InvariantCulture);
            if (length > MaxBody) throw new HttpReadException(413);
            return length;
        }

        private static bool IsTokenChar(byte b) =>
            (b >= 'a' && b <= 'z') || (b >= 'A' && b <= 'Z') || (b >= '0' && b <= '9') || "!#$%&'*+-.^_`|~".IndexOf((char)b) >= 0;

        /// <summary>바이트를 글자 하나씩(ISO-8859-1) 옮긴다. 머리 값의 8비트 글자는 그대로 남아 같음 검사에서 떨어진다</summary>
        private static string Latin1(byte[] buf, int from, int to)
        {
            var chars = new char[to - from];
            for (var i = from; i < to; i++) chars[i - from] = (char)buf[i];
            return new string(chars);
        }
    }
}
