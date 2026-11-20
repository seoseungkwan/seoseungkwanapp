using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Precheck.Core.Bit;
using Precheck.Windows;

namespace Precheck.PtSlip;

/// <summary>서류 창의 읽기 줄: 줄마다 가장 마지막 요청만 창에 반영한다.</summary>
public enum DocLane
{
    /// <summary>환자 찾기(차트번호·이름)</summary>
    Patient,

    /// <summary>왔던 날(기간·첫 내원)</summary>
    Days,

    /// <summary>서류별 장 수(쪽 계획)</summary>
    Count,
}

/// <summary>
/// 서류 창(DocForm)의 비트 읽기(spec doc-print TASK-3). 모두 백그라운드에서 하고, 요청 0.3초 뒤에 시작하며,
/// 같은 줄(DocLane)에서는 가장 마지막 요청의 결과만 화면 스레드에서 반영한다(늦게 온 옛 결과는 버림).
/// 비트 DB는 한 번에 하나만 열고(읽을 때마다 열고 닫는다), 여는 길은 PT 종이 NameSource와 같다(OpenBit).
/// 실패하면 예외 글을 버리고 failed만 부른다(글에 환자 값이 섞일 수 있다). 읽은 값은 파일·로그에 남기지 않는다.
/// </summary>
public sealed class DocLoader : IDisposable
{
    public const int DelayMs = 300;

    /// <summary>찾은 비트 설치 위치(한 번 찾으면 다시 훑지 않는다. 실패하면 잊고 다음에 다시 찾는다)</summary>
    private static volatile string? installPath;

    private readonly Control owner;
    private readonly Func<IBitDb> openDb;
    private readonly SemaphoreSlim gate = new SemaphoreSlim(1, 1);
    private readonly Dictionary<DocLane, LaneState> lanes = new Dictionary<DocLane, LaneState>();
    private volatile bool disposed;

    /// <param name="owner">결과를 반영할 창(그 창의 화면 스레드로 BeginInvoke한다).</param>
    /// <param name="openDb">비트 DB를 연다(백그라운드 스레드에서 부른다). 돌려준 것이 IDisposable이면 읽은 뒤 닫는다. 실제는 OpenBit.</param>
    public DocLoader(Control owner, Func<IBitDb> openDb)
    {
        this.owner = owner ?? throw new ArgumentNullException(nameof(owner));
        this.openDb = openDb ?? throw new ArgumentNullException(nameof(openDb));
        foreach (DocLane lane in Enum.GetValues(typeof(DocLane)))
        {
            var state = new LaneState();
            state.Timer.Tick += (sender, e) =>
            {
                state.Timer.Stop();
                var start = state.Start;
                state.Start = null;
                start?.Invoke();
            };
            lanes[lane] = state;
        }
    }

    /// <summary>
    /// 실제 비트 DB를 연다(NameSource와 같은 길): InstallationLocator(설치 찾기) → SqlBitConnector.Open
    /// (비트 DLL 접속 정보·사설 서버 검사·되돌리는 트랜잭션). 닫으면(Dispose) 트랜잭션을 되돌린다. 못 열면 예외.
    /// </summary>
    public static IBitDb OpenBit()
    {
        try
        {
            var path = installPath ?? new InstallationLocator(AppDomain.CurrentDomain.BaseDirectory).Find();
            var session = new SqlBitConnector().Open(path);
            installPath = path;
            return session;
        }
        catch (Exception)
        {
            installPath = null;
            throw;
        }
    }

    /// <summary>
    /// 그 줄의 앞 요청(기다리는 것·읽는 것)을 버리고, 0.3초 뒤 read를 백그라운드에서 부른다.
    /// 끝나면 화면 스레드에서 done(값), 열기·읽기가 실패하면 failed(). 화면 스레드에서만 부른다.
    /// </summary>
    public void Run<T>(DocLane lane, Func<IBitDb, T> read, Action<T> done, Action failed)
    {
        if (read == null) throw new ArgumentNullException(nameof(read));
        if (done == null) throw new ArgumentNullException(nameof(done));
        if (failed == null) throw new ArgumentNullException(nameof(failed));
        if (disposed) return;
        var state = lanes[lane];
        state.Timer.Stop();
        var version = ++state.Version;
        state.Start = () => Fire(state, version, read, done, failed);
        state.Timer.Start();
    }

    /// <summary>그 줄의 기다리는·읽는 요청을 버린다(결과가 와도 반영하지 않는다).</summary>
    public void Cancel(DocLane lane)
    {
        var state = lanes[lane];
        state.Timer.Stop();
        state.Start = null;
        state.Version++;
    }

    /// <summary>그 줄에 아직 반영되지 않은 지금 요청이 있는가(기다리는 중이거나 읽는 중).</summary>
    public bool IsBusy(DocLane lane)
    {
        var state = lanes[lane];
        return state.Start != null || (state.Reading != 0 && state.Reading == state.Version);
    }

    /// <summary>
    /// 기다리지 않고 지금 스레드에서 읽는다([인쇄] 직전 쪽 계획). 백그라운드 스레드에서만 부른다(화면이 멈추지 않게).
    /// 다른 읽기와 한 번에 하나만. 실패는 예외 그대로.
    /// </summary>
    public T ReadNow<T>(Func<IBitDb, T> read)
    {
        if (read == null) throw new ArgumentNullException(nameof(read));
        return Read(read);
    }

    public void Dispose()
    {
        if (disposed) return;
        disposed = true;
        foreach (var state in lanes.Values)
        {
            state.Timer.Stop();
            state.Start = null;
            state.Version++;
            state.Timer.Dispose();
        }
    }

    /// <summary>백그라운드에서 읽고, 결과는 창의 화면 스레드로 넘겨(BeginInvoke) 그 줄의 지금 요청일 때만 반영한다.</summary>
    private void Fire<T>(LaneState state, int version, Func<IBitDb, T> read, Action<T> done, Action failed)
    {
        state.Reading = version;
        Task.Run(() =>
        {
            T value = default!;
            bool ok;
            try
            {
                value = Read(read);
                ok = true;
            }
            catch (Exception)
            {
                // 오류 글은 버린다(환자 값이 섞일 수 있다). 창에는 정해 둔 글만 보인다
                ok = false;
            }
            Post(() =>
            {
                if (state.Reading == version) state.Reading = 0;
                if (disposed || version != state.Version) return; // 늦게 온 옛 결과는 버린다
                if (ok) done(value);
                else failed();
            });
        });
    }

    /// <summary>창의 화면 스레드에서 action. 창이 닫혔으면 버린다</summary>
    private void Post(Action action)
    {
        if (disposed || owner.IsDisposed || !owner.IsHandleCreated) return;
        try
        {
            owner.BeginInvoke(action);
        }
        catch (InvalidOperationException)
        {
            // 그 사이 창이 닫혔다
        }
    }

    /// <summary>한 번에 하나만: 열고 → 읽고 → 닫는다</summary>
    private T Read<T>(Func<IBitDb, T> read)
    {
        gate.Wait();
        try
        {
            var db = openDb();
            try
            {
                return read(db);
            }
            finally
            {
                (db as IDisposable)?.Dispose();
            }
        }
        finally
        {
            gate.Release();
        }
    }

    private sealed class LaneState
    {
        public System.Windows.Forms.Timer Timer { get; } = new System.Windows.Forms.Timer { Interval = DelayMs };

        /// <summary>0.3초 뒤 시작할 일(없으면 null)</summary>
        public Action? Start { get; set; }

        /// <summary>요청할 때마다 1씩 는다(0은 '없음'으로 쓴다)</summary>
        public int Version { get; set; }

        /// <summary>지금 읽는 요청의 Version(없으면 0)</summary>
        public int Reading { get; set; }
    }
}
