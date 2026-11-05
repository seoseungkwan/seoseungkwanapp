using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using Precheck.Core.Protocol;

namespace Precheck.Core.Reception;

/// <summary>접수 현황 서버가 기록에 남기는 오류 번호(design.md 7절). 번호만 남고 요청 글·주소·경로는 남지 않는다(AC-1406.7).</summary>
public static class ReceptionErrors
{
    /// <summary>동시에 32개를 넘는 연결이 와서 그 연결만 끊었다(AC-1406.4).</summary>
    public const string Busy = "E-RECEPTION-BUSY";

    /// <summary>사설 주소·이 PC 자신이 아닌 곳의 연결을 답 없이 끊었다(AC-1406.1).</summary>
    public const string NotPrivate = "E-RECEPTION-NOT-PRIVATE";

    /// <summary>Host가 이 PC 주소:문이 아니어서 403(AC-1406.2).</summary>
    public const string BadHost = "E-RECEPTION-HOST";

    /// <summary>쓰기 요청이 Origin·X-Reception·JSON 검사에 떨어져 403(AC-1406.3).</summary>
    public const string BadWrite = "E-RECEPTION-WRITE";

    /// <summary>뜻밖의 오류로 500. 예외 글은 남기지 않는다.</summary>
    public const string Failed = "E-RECEPTION-FAILED";

    /// <summary>47200번 문을 다른 프로그램이 써서 켜지 못했다(AC-1411.5).</summary>
    public const string PortBusy = "E-RECEPTION-PORT-BUSY";

    /// <summary>요청을 읽다 답한 문제(400·408·413·431, AC-1406.4)의 번호</summary>
    public static string Http(int status) => "E-RECEPTION-HTTP-" + status.ToString(CultureInfo.InvariantCulture);
}

/// <summary>
/// 접수 현황 서버 기록(design.md 7절, AC-1406.7): 기록 폴더의 reception-yyyy-MM-dd.log에 "시각 - 오류번호 건수" 한 줄씩(LogLine 모양).
/// - 오류 번호 모양('E-…')이 아닌 글은 받지 않고 "invalid"로 센다. 환자 글자·주소·경로·예외 글이 들어갈 길이 없다.
/// - 같은 1분 안에는 처음 한 번만 바로 쓰고 나머지는 번호마다 건수로 모았다가, 1분이 지난 뒤의 다음 기록이나 Flush 때 한 줄씩 쓴다.
///   그래서 연결이 마구 와도 기록은 1분에 번호마다 한 줄을 넘지 않는다.
/// - 쓰지 못하면 조용히 넘어간다(서버를 멈추지 않는다). 여러 작업이 함께 불러도 안전하다.
/// </summary>
public sealed class ReceptionLog
{
    public const string FilePrefix = "reception-";

    /// <summary>이 시간 안의 같은 번호는 건수로 묶는다.</summary>
    public static readonly TimeSpan Window = TimeSpan.FromMinutes(1);

    private const string Invalid = "invalid";
    private static readonly UTF8Encoding Utf8 = new UTF8Encoding(false);

    private readonly string folder;
    private readonly Func<DateTime> now;
    private readonly object gate = new object();
    private readonly Dictionary<string, int> pending = new Dictionary<string, int>(StringComparer.Ordinal);
    private readonly List<string> order = new List<string>();
    private DateTime? lastWrite;

    /// <param name="folder">기록 폴더(도우미의 logs\). 없으면 처음 쓸 때 만든다.</param>
    /// <param name="now">이 PC의 시계(시험은 가짜 시계).</param>
    public ReceptionLog(string folder, Func<DateTime>? now = null)
    {
        if (string.IsNullOrWhiteSpace(folder)) throw new ArgumentException("기록 폴더가 비었다", nameof(folder));
        this.folder = folder;
        this.now = now ?? (() => DateTime.Now);
    }

    /// <summary>그날 기록 파일 경로</summary>
    public static string PathOf(string folder, DateTime day) =>
        Path.Combine(folder, FilePrefix + day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) + ".log");

    /// <summary>오류 번호 하나를 센다. 번호 모양이 아니면(null 포함) invalid로 센다. 던지지 않는다.</summary>
    public void Note(string? code)
    {
        var key = ErrorCodes.IsCode(code) ? code! : Invalid;
        lock (gate)
        {
            if (pending.TryGetValue(key, out var count)) pending[key] = count + 1;
            else
            {
                pending[key] = 1;
                order.Add(key);
            }
            var at = SafeNow();
            if (lastWrite == null || at - lastWrite.Value >= Window || at < lastWrite.Value) WriteLocked(at);
        }
    }

    /// <summary>모아 둔 건수를 바로 쓴다(서버를 끌 때). 던지지 않는다.</summary>
    public void Flush()
    {
        lock (gate)
        {
            if (pending.Count > 0) WriteLocked(SafeNow());
        }
    }

    private DateTime SafeNow()
    {
        try
        {
            return now();
        }
        catch (Exception)
        {
            return DateTime.Now;
        }
    }

    private void WriteLocked(DateTime at)
    {
        var lines = new StringBuilder();
        foreach (var key in order)
        {
            lines.Append(LogLine.Format(Offset(at), null, key == Invalid ? Invalid : key))
                .Append(' ').Append(pending[key].ToString(CultureInfo.InvariantCulture)).Append("\r\n");
        }
        pending.Clear();
        order.Clear();
        lastWrite = at;
        try
        {
            Directory.CreateDirectory(folder);
            File.AppendAllText(PathOf(folder, at), lines.ToString(), Utf8);
        }
        catch (Exception)
        {
            // 기록 실패로 서버를 멈추지 않는다
        }
    }

    private static DateTimeOffset Offset(DateTime at)
    {
        try
        {
            return new DateTimeOffset(at);
        }
        catch (ArgumentException)
        {
            return new DateTimeOffset(DateTime.SpecifyKind(at, DateTimeKind.Unspecified), TimeSpan.Zero);
        }
    }
}
