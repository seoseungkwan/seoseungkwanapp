using System;
using System.IO;
using System.Net;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Reception;
using Precheck.Core.Reception.Http;
using Precheck.Core.Registration;
using Precheck.Core.Store;
using Precheck.Windows;

namespace Precheck.Reception;

/// <summary>
/// 접수 현황 서버의 진짜 부품 한 벌(design.md 9절). 도우미(Precheck.Helper의 HelperServices)와 같은 부품·같은 data\ 폴더를 쓰고,
/// 크롬 통로(네이티브 메시징)는 없다. 비트 DB는 여기서 열지 않는다: 휴대폰 요청이 올 때 BoardCache·HistoryReader가 등록 확인을 지나 읽는다(AC-1411.2).
/// - 이 PC 주소는 LanAddressWatch(30초마다 다시 봄)가 라우터의 Host 검사(ClientGuard)에 준다.
/// - 듣는 곳은 IPAddress.Any · ReceptionPorts.Http 한 곳뿐이다. 문이 쓰이고 있으면 ReceptionServer가 기록하고 던진다(다른 문으로 바꾸지 않는다, AC-1411.5).
/// </summary>
internal static class ReceptionServices
{
    /// <summary>도우미 저장 폴더(HelperServices.DataDirectory와 같은 곳). 등록 파일·엑스레이 표시가 여기 있다.</summary>
    public static string DataDirectory() =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Seoseungkwan", "PrecheckHelper", "data");

    /// <summary>도우미 기록 폴더(도우미 DiagnosticLog와 같은 곳). 접수 현황 기록은 reception-yyyy-MM-dd.log.</summary>
    public static string LogsDirectory() =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Seoseungkwan", "PrecheckHelper", "logs");

    /// <summary>접수 현황 기록(오류 번호와 건수만, AC-1406.7).</summary>
    public static ReceptionLog OpenLog() => new ReceptionLog(LogsDirectory(), Now);

    /// <summary>부품을 만들고 IPAddress.Any:47200에서 듣기 시작한 서버. 켜지 못하면 서버를 닫고 그 예외를 그대로 던진다.</summary>
    public static ReceptionServer Listen(ReceptionLog log)
    {
        var router = CreateRouter(log);
        var server = new ReceptionServer(router, log);
        try
        {
            server.Start(IPAddress.Any, ReceptionPorts.Http);
            return server;
        }
        catch
        {
            server.Dispose();
            throw;
        }
    }

    /// <summary>길 나누기 한 벌: 비트 부품·접수 현황 캐시·엑스레이 표시·화면용 열쇠·품은 화면 파일·이 PC 주소.</summary>
    public static ReceptionRouter CreateRouter(ReceptionLog log)
    {
        var protector = new DpapiProtector();
        var bit = CreateBit(protector);
        var lan = new LanAddressWatch(LanAddresses.ReadSystem, () => DateTime.UtcNow);
        var marks = new XrayMarks(new StoreFolder(DataDirectory()), protector, Now, log.Note);
        return new ReceptionRouter(
            bit,
            new BoardCache(bit, Now),
            marks,
            new VisitKeys(),
            new StaticFiles(EmbeddedStaticSource.Core()),
            () => lan.Current(),
            log,
            Now,
            qrPage: LinkPage(lan));
    }

    /// <summary>
    /// 이 PC 자신만 여는 주소 보내기 화면(/link)의 답(lan.Current()의 주소마다 링크). TASK-25가 Core LinkPage로 채우고 라우터 매개변수 이름을 바꾼다.
    /// 지금은 없음이라 그 길은 404다.
    /// </summary>
    private static Func<HttpResponse>? LinkPage(LanAddressWatch lan) => null;

    /// <summary>도우미 HelperServices.Create와 같은 비트 부품(화면 내보내기는 접수 현황이 쓰지 않아 뺀다).</summary>
    private static BitServices CreateBit(DpapiProtector protector)
    {
        var store = new RegistrationStore(DataDirectory(), protector);
        var locator = new InstallationLocator(AppDomain.CurrentDomain.BaseDirectory, () => RegisteredInstall(store));
        return new BitServices(locator, new SqlBitConnector(), new VendorLogin(), new ConfirmWindow(), store);
    }

    /// <summary>등록해 둔 설치 위치. 등록을 읽지 못하면 없는 것으로 본다(도우미와 같다).</summary>
    private static string? RegisteredInstall(RegistrationStore store)
    {
        try
        {
            return store.Load()?.InstallPath;
        }
        catch (HelperException)
        {
            return null;
        }
    }

    /// <summary>이 PC의 시계(오늘 날짜·기다린 분·엑스레이 시각).</summary>
    private static DateTime Now() => DateTime.Now;
}
