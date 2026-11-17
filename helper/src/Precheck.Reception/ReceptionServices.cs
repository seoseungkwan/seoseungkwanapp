using System;
using System.IO;
using System.Net;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Reception;
using Precheck.Core.Reception.Http;
using Precheck.Core.Reception.Settings;
using Precheck.Core.Registration;
using Precheck.Core.Store;
using Precheck.Windows;

namespace Precheck.Reception;

/// <summary>
/// 접수 현황 서버의 진짜 부품 한 벌(design.md 9절). 도우미(Precheck.Helper의 HelperServices)와 같은 부품·같은 data\ 폴더를 쓰고,
/// 크롬 통로(네이티브 메시징)는 없다. 비트 DB는 여기서 열지 않는다: 휴대폰 요청이 올 때 BoardCache·HistoryReader가 등록 확인을 지나 읽는다(AC-1411.2).
/// - 이 PC 주소는 LanAddressWatch(30초마다 다시 봄)가 라우터의 Host 검사(ClientGuard)에 준다.
/// - 듣는 곳은 IPAddress.Any · ReceptionPorts.Http 한 곳뿐이다. 문이 쓰이고 있으면 ReceptionServer가 기록하고 던진다(다른 문으로 바꾸지 않는다, AC-1411.5).
/// - 설정·로고(spec reception-other-clinic design.md 1절·4절)도 같은 data\ 폴더·같은 DPAPI에 두고, 켤 때 설정을 한 번 읽어 표시 파일보다 먼저 설정 파일을 만든다.
///   옛 고르기 목록 파일(reception-lists.dat)은 설정을 처음 만들 때 SettingsStore가 읽어 옮기기만 하고, 이 프로그램은 그 파일을 쓰지도 지우지도 않는다(AC-5704.4).
/// - 비트 부품 만들기(CreateBit)는 여기 한 곳이고 --register(RegisterEntry)도 이것을 쓴다(spec reception-other-clinic TASK-8).
/// </summary>
internal static class ReceptionServices
{
    /// <summary>접수 현황 프로그램이 띄우는 비트 등록 확인 창의 제목(spec reception-other-clinic AC-5707.8). 도우미 창은 "청구메모 도우미" 그대로다.</summary>
    public const string ConfirmTitle = "접수 현황";

    /// <summary>우리 의원 처음 값을 만들 때 로고 파일로 옮기는 품은 로고 그림(Core csproj가 reception/www를 reception/… 이름으로 품는다).</summary>
    private const string WordmarkResource = "reception/logo-wordmark.png";

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

    /// <summary>
    /// 길 나누기 한 벌: 비트 부품·접수 현황 캐시·엑스레이 표시·화면용 열쇠·품은 화면 파일·이 PC 주소·이 PC 자신만 여는 주소 보내기 화면(/link, 부를 때마다 lan.Current()의 주소와 같은 설정·로고 파일의 머리 로고),
    /// 그리고 설정(요청마다 지금 설정)·설정·처방 코드·로고 길(spec reception-other-clinic design.md 4절).
    /// </summary>
    public static ReceptionRouter CreateRouter(ReceptionLog log)
    {
        var protector = new DpapiProtector();
        var bit = CreateBit(protector);
        var lan = new LanAddressWatch(LanAddresses.ReadSystem, () => DateTime.UtcNow);
        // 설정·로고(spec reception-other-clinic design.md 1절): 같은 data\ 폴더의 reception-settings.dat·reception-logo.dat, 같은 DPAPI.
        // 표시 파일보다 먼저 설정 파일을 만든다: 새 병원이 다음에 켤 때 표시 파일 때문에 우리 의원으로 잘못 보이지 않게
        var logo = new LogoStore(new StoreFolder(DataDirectory()), protector, log.Note);
        var settings = new SettingsStore(new StoreFolder(DataDirectory()), protector, EmbeddedWordmark, logo, log.Note);
        settings.Current();
        var marks = new XrayMarks(new StoreFolder(DataDirectory()), protector, Now, log.Note);
        // 어레인지 표시(spec reception-arrange design.md 6절): 같은 data\ 폴더의 reception-arrange.dat, 같은 DPAPI
        var arrange = new ArrangeMarks(new StoreFolder(DataDirectory()), protector, Now, log.Note);
        return new ReceptionRouter(
            bit,
            new BoardCache(bit, Now),
            marks,
            new VisitKeys(),
            new StaticFiles(EmbeddedStaticSource.Core()),
            () => lan.Current(),
            log,
            Now,
            // 주소 보내기 화면의 머리 로고도 같은 설정·로고 파일을 따른다(spec reception-other-clinic AC-5715)
            linkPage: LinkPage.For(() => lan.Current(), settings.Current, logo),
            arrangeMarks: arrange,
            // 옛 칸 지도. 라우터는 쓰지 않는다(칸은 설정으로 정한다)
            arrangeMap: ArrangeMap.Rules,
            settings: settings.Current,
            settingsRoutes: new SettingsRoutes(settings, logo, new CodesReader(bit, Now), log));
    }

    /// <summary>
    /// 도우미 HelperServices.Create와 같은 비트 부품(화면 내보내기는 접수 현황이 쓰지 않아 뺀다). 서버와 --register(RegisterEntry)가 같이 쓴다:
    /// 등록 파일은 서버가 읽는 바로 그 data\ 폴더, 확인 창 제목은 "접수 현황"(AC-5707.8).
    /// </summary>
    public static BitServices CreateBit(DpapiProtector protector)
    {
        var store = new RegistrationStore(DataDirectory(), protector);
        var locator = new InstallationLocator(AppDomain.CurrentDomain.BaseDirectory, () => RegisteredInstall(store));
        return new BitServices(locator, new SqlBitConnector(), new VendorLogin(), new ConfirmWindow(ConfirmTitle), store);
    }

    /// <summary>품은 우리 의원 로고 그림(PNG). SettingsStore가 우리 의원 처음 값을 만들 때만 부른다(없으면 null).</summary>
    private static byte[]? EmbeddedWordmark() => EmbeddedStaticSource.Core().Read(WordmarkResource);

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
