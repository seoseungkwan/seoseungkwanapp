using System;
using System.Collections.Generic;
using System.Globalization;
using System.Threading.Tasks;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Registration;

namespace Precheck.Core.Reception;

/// <summary>접수 현황 읽기 답: 날 줄(IsOk) 또는 볼 수 없음(HTTP 503, 환자 자료 없음). Error는 볼 수 없게 된 읽기의 오류 번호만(기록용).</summary>
public sealed class BoardResult
{
    private BoardResult(BoardInput? input, string? error)
    {
        Input = input;
        Error = error;
    }

    public static BoardResult Ok(BoardInput input) => new BoardResult(input ?? throw new ArgumentNullException(nameof(input)), null);

    public static BoardResult Unavailable(string? error) => new BoardResult(null, error);

    public bool IsOk => Input != null;

    public BoardInput? Input { get; }

    /// <summary>볼 수 없을 때 그 까닭의 오류 번호(E-BIT-NOT-REGISTERED 등). 환자 글자·예외 글은 없다.</summary>
    public string? Error { get; }
}

/// <summary>
/// 비트 읽기 캐시(design.md 3절, REQ-1403). 날 줄(BoardInput)만 들고, 화면 JSON은 요청마다 BoardBuilder가 만든다.
/// 요청이 와야만 읽는다(타이머 없음, AC-1403.3). 읽기는 한 번에 하나이고 나머지 요청은 그 결과를 함께 기다린다(최대 9초, AC-1403.2·AC-1403.8).
/// 읽기마다 등록 확인 관문(HospitalGate)을 지나고, 막히거나 실패하면 볼 수 없음이다(AC-1403.5).
/// - 마지막 읽기가 끝난 지 8초 안이면 그 날 줄(AC-1403.2). fresh는 이 8초 묶음만 건너뛰고, 끝난 지 2초 안이면 그 결과(AC-1403.8).
/// - 걸린 시간 d가 3초를 넘으면 끝난 때부터 min(3d, 60초) 동안 다시 읽지 않고 그 날 줄을 준다(AC-1403.4).
/// - 실패하면 앞서 읽은 날 줄을 버리고, 끝난 때부터 10초(3배 쉼이 더 길면 그것) 동안 다시 읽지 않고 볼 수 없음(AC-1403.5).
/// - 날이 바뀌면 앞 날 줄을 주지 않고 새 날을 읽으며, 이름표도 다시 읽는다(AC-1403.6·AC-1403.7).
/// </summary>
public sealed class BoardCache
{
    /// <summary>이만큼 안의 날 줄은 다시 읽지 않는다(AC-1403.2).</summary>
    public static readonly TimeSpan Batch = TimeSpan.FromSeconds(8);

    /// <summary>fresh라도 마지막 읽기가 끝난 지 이만큼 안이면 그 결과(AC-1403.8).</summary>
    public static readonly TimeSpan FreshRecent = TimeSpan.FromSeconds(2);

    /// <summary>이보다 오래 걸린 읽기 뒤에는 쉰다(AC-1403.4).</summary>
    public static readonly TimeSpan Slow = TimeSpan.FromSeconds(3);

    /// <summary>쉼의 끝(AC-1403.4).</summary>
    public static readonly TimeSpan MaxRest = TimeSpan.FromSeconds(60);

    /// <summary>실패 뒤 쉼(AC-1403.5).</summary>
    public static readonly TimeSpan FailRest = TimeSpan.FromSeconds(10);

    /// <summary>요청 하나가 읽기를 기다리는 가장 긴 시간(읽기 한 번 8초 + 1초).</summary>
    public static readonly TimeSpan MaxWait = TimeSpan.FromSeconds(9);

    private const int SlowFactor = 3;

    private readonly Func<VerifiedHospital> open;
    private readonly Func<DateTime> now;
    private readonly object gate = new object();

    // 아래 칸은 gate 안에서만 읽고 쓴다
    private Task<BoardResult>? reading;
    private BoardInput? last;
    private DateTime lastEnd = DateTime.MinValue;
    private DateTime quietUntil = DateTime.MinValue;
    private string? lastError;

    // 읽기 작업 안에서만 쓴다(읽기는 한 번에 하나)
    private BoardNames? names;

    /// <summary>services로 읽기마다 등록 확인(HospitalGate.Open)을 한다. now는 이 PC의 시계(시험은 가짜 시계).</summary>
    public BoardCache(BitServices services, Func<DateTime>? now = null)
    {
        if (services == null) throw new ArgumentNullException(nameof(services));
        open = () => HospitalGate.Open(services);
        this.now = now ?? (() => DateTime.Now);
    }

    /// <summary>접수 현황 날 줄 또는 볼 수 없음. fresh는 화면의 [새로 고침](GET /api/board?fresh=1). 던지지 않는다.</summary>
    public BoardResult Get(bool fresh = false)
    {
        Task<BoardResult> task;
        lock (gate)
        {
            var at = now();
            var today = last != null && last.Day == Key(at) ? last : null;
            if (!fresh && today != null && at - lastEnd < Batch) return BoardResult.Ok(today);
            if (reading == null)
            {
                if (at < quietUntil) return today != null ? BoardResult.Ok(today) : BoardResult.Unavailable(lastError);
                if (fresh && today != null && at - lastEnd < FreshRecent) return BoardResult.Ok(today);
                var start = at;
                reading = Task.Run(() => ReadOnce(start));
            }
            task = reading;
        }
        return task.Wait(MaxWait) ? task.Result : BoardResult.Unavailable(BitErrors.ReadFailed);
    }

    /// <summary>등록 확인 → 비트 읽기 한 번. 무엇이 실패해도 던지지 않고 볼 수 없음으로 바꾼다(오류 번호만 남김).</summary>
    private BoardResult ReadOnce(DateTime start)
    {
        BoardResult result;
        try
        {
            using var hospital = open();
            var day = Key(start);
            var input = BoardReader.Read(hospital.Db, hospital.Registration.Scope, start, now, names?.Day == day ? names.Table : null);
            names = new BoardNames(input.Day, input.RxNames);
            result = BoardResult.Ok(input);
        }
        catch (Exception e)
        {
            result = BoardResult.Unavailable(e is HelperException helper ? helper.Code : BitErrors.ReadFailed);
        }

        var end = now();
        var took = end - start;
        var rest = took > Slow ? Min(TimeSpan.FromTicks(took.Ticks * SlowFactor), MaxRest) : TimeSpan.Zero;
        lock (gate)
        {
            lastEnd = end;
            if (result.IsOk)
            {
                last = result.Input;
                lastError = null;
                quietUntil = end + rest;
            }
            else
            {
                last = null;
                lastError = result.Error;
                quietUntil = end + (rest > FailRest ? rest : FailRest);
            }
            reading = null;
        }
        return result;
    }

    private sealed class BoardNames
    {
        public BoardNames(string day, IReadOnlyDictionary<string, string> table)
        {
            Day = day;
            Table = table;
        }

        public string Day { get; }
        public IReadOnlyDictionary<string, string> Table { get; }
    }

    private static TimeSpan Min(TimeSpan a, TimeSpan b) => a < b ? a : b;

    private static string Key(DateTime at) => at.ToString("yyyyMMdd", CultureInfo.InvariantCulture);
}
