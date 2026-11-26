using System;
using System.Diagnostics;
using System.IO;
using Precheck.Core.Sheet;
using Precheck.Windows;

namespace Precheck.Helper.Commands;

/// <summary>
/// 수납 명령(sheet.*, spec google-link TASK-10)이 쓰는 윈도 부품 한 벌. 만들기만 하고 비트·구글·클립보드를 건드리지 않는다.
/// - sheet.dat: 도우미 저장 폴더(%LOCALAPPDATA%\Seoseungkwan\PrecheckHelper\data) · DPAPI CurrentUser + 도우미 저장 entropy(design.md 5절)
/// - 비트시트 가져오기: %APPDATA%\BitSheet\settings.json의 TokenProtected를 비트시트 entropy(BitSheet.token.v1)로 푼다(읽기만)
/// - 구글: HttpWebRequest(TLS 1.2, 넘김은 손으로, 60초와 남은 시간 중 짧은 것) · 확인 창·클립보드는 STA
/// </summary>
internal static class SheetHelperServices
{
    public static SheetServices Create()
    {
        var store = new SheetStore(HelperServices.DataDirectory(), new DpapiProtector());
        var bitSheet = BitSheetImport.DefaultPath(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData));
        var watch = Stopwatch.StartNew();
        return new SheetServices(
            HelperServices.Create(),
            store,
            left => new SheetHttpTransport(left),
            new SheetConfirmWindow(),
            new SheetClipboard(),
            () => BitSheetImport.Read(bitSheet, new DpapiProtector(BitSheetImport.Entropy())),
            () => File.Exists(bitSheet),
            () => watch.Elapsed);
    }
}
