using System;
using System.Collections.Generic;
using Precheck.Core.Bit;
using Precheck.Core.PtSlip;
using Precheck.Windows;

namespace Precheck.PtSlip;

/// <summary>
/// 실제 비트 DB로 차트번호의 이름 찾기(AC-6402.3). 가끔 쓰는 기능이라 찾을 때마다 열고 닫는다:
/// InstallationLocator(설치 찾기) → SqlBitConnector.Open(비트 DLL 접속 정보·사설 서버 검사·되돌리는 트랜잭션,
/// 그 안에서 VendorRuntime.Prepare로 비트 DLL 자리를 맞춘다) → Core SlipNames.Find(매개변수로 읽기만, 5초).
/// 무엇이 잘못되든 Failed로 돌려준다(예외 글에는 값이 섞일 수 있어 버린다). 차트번호·이름은 어디에도 남기지 않는다.
/// 백그라운드 스레드에서 불린다(PickForm).
/// </summary>
public sealed class NameSource
{
    /// <summary>비트에서 이름을 읽지 못함.</summary>
    public static readonly NameResult Failed = new NameResult(NameKind.Failed, "");

    /// <summary>찾은 설치 위치(한 번 찾으면 다시 훑지 않는다. 실패하면 잊고 다음에 다시 찾는다).</summary>
    private volatile string? installPath;

    public NameResult Find(ChartInput chart)
    {
        if (chart == null) throw new ArgumentNullException(nameof(chart));
        // 빈칸·틀린 번호는 DB를 열지 않는다(Core가 DB를 읽지 않고 답한다)
        if (chart.Kind != ChartKind.Ok) return Safe(() => SlipNames.Find(Unopened.Instance, chart));
        try
        {
            var path = installPath ?? new InstallationLocator(AppDomain.CurrentDomain.BaseDirectory).Find();
            using var session = new SqlBitConnector().Open(path);
            var found = SlipNames.Find(session, chart);
            installPath = path;
            return found;
        }
        catch (Exception)
        {
            installPath = null;
            return Failed;
        }
    }

    private static NameResult Safe(Func<NameResult> find)
    {
        try
        {
            return find();
        }
        catch (Exception)
        {
            return Failed;
        }
    }

    /// <summary>열지 않은 DB: 읽으려 하면 실패(빈칸·틀린 번호에는 쓰이지 않아야 한다).</summary>
    private sealed class Unopened : IBitDb
    {
        public static readonly Unopened Instance = new Unopened();

        public IReadOnlyList<IReadOnlyList<object?>> Query(string sql, IReadOnlyDictionary<string, object?> args, TimeSpan timeout) =>
            throw new BitException(BitErrors.ReadFailed);
    }
}
