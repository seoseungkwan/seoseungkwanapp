using System;
using System.Drawing;
using System.Drawing.Printing;
using System.Linq;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace Precheck.PtSlip;

/// <summary>
/// 종이 1장 보내기(AC-6403.4). 대화상자 없이(StandardPrintController) 정한 프린터로 보낸다.
/// 종이 크기·여백은 이 문서(PrintDocument)에만 정한다. 프린터의 기본 설정(비트가 쓰는 것)은 바꾸지 않는다:
/// 어떤 드라이버는 문서 설정을 맞춰 보기만 해도(DocumentProperties) 그것을 자기 기본값으로 저장한다(이 PC의 Hancom PDF가 그랬다).
/// 그래서 보내기 전 기본값을 읽어 두고, 보낸 뒤 달라졌으면 읽어 둔 값으로 되돌린다.
/// 문서 이름에는 환자 값을 넣지 않는다(인쇄 대기열에 보인다).
/// </summary>
public static class SlipPrintJob
{
    /// <summary>인쇄 대기열에 보이는 문서 이름</summary>
    public const string DocumentName = "PT 후 진료 종이";

    private const double MmPerHundredthInch = 0.254;
    /// <summary>DEVMODE dmPaperSize의 '사용자 정의 크기'(DMPAPER_USER)</summary>
    private const int DmPaperUser = 256;

    private const int DmOutBuffer = 2;
    private const int DmInBuffer = 8;
    // DEVMODEW: dmDeviceName(WCHAR[32]) 뒤 dmSpecVersion·dmDriverVersion·dmSize·dmDriverExtra
    private const int DmSizeOffset = 68;
    private const int DmDriverExtraOffset = 70;

    // 프린터 상태(검토 지적: Print()는 대기열에 넣기만 하면 끝나서, 꺼진 프린터에 넣은 종이가 나중에 다음 환자 종이와 함께 나올 수 있다)
    private const int AttributeWorkOffline = 0x400;
    // PAUSED·ERROR·PENDING_DELETION·PAPER_JAM·PAPER_OUT·PAPER_PROBLEM·OFFLINE·NOT_AVAILABLE·NO_TONER·USER_INTERVENTION·OUT_OF_MEMORY·DOOR_OPEN·SERVER_UNKNOWN
    private const int BadStatus = 0x1 | 0x2 | 0x4 | 0x8 | 0x10 | 0x40 | 0x80 | 0x1000 | 0x40000 | 0x100000 | 0x200000 | 0x400000 | 0x800000;
    // 끝났거나 지우는 중인 일(JOB_STATUS_DELETING·DELETED·PRINTED·COMPLETE)은 걸린 일이 아니다
    private const int JobDone = 0x4 | 0x100 | 0x80 | 0x1000;
    private const int JobControlDelete = 5;
    /// <summary>우리 종이가 이만큼 지나도 대기열에 있으면 프린터가 안 찍고 있는 것(종이 1장은 1~2초면 나간다)</summary>
    private static readonly TimeSpan StaleAfter = TimeSpan.FromSeconds(15);

    [StructLayout(LayoutKind.Sequential)]
    private struct SystemTime
    {
        public short Year, Month, DayOfWeek, Day, Hour, Minute, Second, Milliseconds;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JobInfo1
    {
        public int JobId;
        public IntPtr PrinterName, MachineName, UserName, Document, Datatype, StatusText;
        public int Status, Priority, Position, TotalPages, PagesPrinted;
        public SystemTime Submitted;
    }

    private const int DmInPrompt = 4;
    private const int IdOk = 1;
    private const uint GmemMoveable = 0x2;

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr GlobalAlloc(uint flags, UIntPtr bytes);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr GlobalLock(IntPtr memory);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GlobalUnlock(IntPtr memory);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr GlobalFree(IntPtr memory);

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool OpenPrinter(string printerName, out IntPtr printer, IntPtr defaults);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool ClosePrinter(IntPtr printer);

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool GetPrinter(IntPtr printer, int level, IntPtr buffer, int size, out int needed);

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool EnumJobs(IntPtr printer, int firstJob, int count, int level, IntPtr buffer, int size, out int needed, out int returned);

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool SetJob(IntPtr printer, int jobId, int level, IntPtr job, int command);

    [DllImport("winspool.drv", CharSet = CharSet.Unicode)]
    private static extern int DocumentProperties(IntPtr hwnd, IntPtr printer, string deviceName, IntPtr devModeOutput, IntPtr devModeInput, int mode);

    /// <summary>
    /// printerName으로 폭 widthMm·길이 lengthMm 종이 1장. draw는 mm 단위 Graphics(왼쪽 위 = 종이 왼쪽 위)에 그린다.
    /// toFile이 있으면 그 파일로 쓴다(Microsoft Print to PDF 확인용, 대화상자 없이). 프린터가 없거나 보내지 못하면 예외.
    /// </summary>
    public static void Send(string printerName, int widthMm, int lengthMm, Action<Graphics> draw, string? toFile = null)
    {
        if (string.IsNullOrWhiteSpace(printerName)) throw new ArgumentException("프린터 이름이 비었다", nameof(printerName));
        if (widthMm <= 0) throw new ArgumentOutOfRangeException(nameof(widthMm));
        if (lengthMm <= 0) throw new ArgumentOutOfRangeException(nameof(lengthMm));
        if (draw == null) throw new ArgumentNullException(nameof(draw));

        using var document = new PrintDocument
        {
            DocumentName = DocumentName,
            PrintController = new StandardPrintController(),
            OriginAtMargins = false,
        };
        document.PrinterSettings.PrinterName = printerName;
        if (!document.PrinterSettings.IsValid) throw new InvalidOperationException("설치되지 않은 프린터");
        // [프린터 종이 설정]에서 이 프로그램용으로 저장한 드라이버 설정(예: 용지 유형 '연속')이 있으면 그것으로 시작한다.
        // 프린터 기본 설정은 그대로 둔다(의원 PC: 기본은 '간극이 있는 라벨'이라 이어진 롤에서 틈을 찾느라 종이를 계속 밀어냈다)
        var driverSettings = SettingsFile.ReadDriverSettings(printerName);
        if (driverSettings != null) ApplyDriverSettings(document, driverSettings);
        document.PrinterSettings.Copies = 1;
        if (toFile != null)
        {
            document.PrinterSettings.PrintToFile = true;
            document.PrinterSettings.PrintFileName = toFile;
        }

        var page = document.DefaultPageSettings;
        // RawKind를 DMPAPER_USER(256)로: 기본값(0)은 정해지지 않은 종이 번호라 빅솔론 라벨 드라이버(종이가 256 'Custom' 하나뿐)가 무시했다(의원 PC 첫 시험).
        // Kind는 그대로 Custom이라 .NET이 길이·폭(dmPaperLength/Width)도 같이 넣는다
        page.PaperSize = new PaperSize("PtSlip", HundredthsOfInch(widthMm), HundredthsOfInch(lengthMm)) { RawKind = DmPaperUser };
        page.Landscape = false;
        page.Margins = new Margins(0, 0, 0, 0);

        Exception? drawFailed = null;
        document.PrintPage += (sender, e) =>
        {
            try
            {
                var graphics = e.Graphics ?? throw new InvalidOperationException("인쇄 Graphics가 없다");
                graphics.PageUnit = GraphicsUnit.Millimeter;
                // OriginAtMargins=false면 (0,0)은 종이의 인쇄 가능 영역 왼쪽 위다. 프린터가 못 찍는 가장자리만큼 되돌려 종이 왼쪽 위에 맞춘다
                graphics.TranslateTransform(-HardMarginMm(e.PageSettings.HardMarginX), -HardMarginMm(e.PageSettings.HardMarginY));
                draw(graphics);
            }
            catch (Exception ex)
            {
                drawFailed = ex;
                e.Cancel = true;
            }
            e.HasMorePages = false;
        };

        if (toFile == null) CheckReady(printerName);

        var savedDefaults = ReadDefaults(printerName);
        try
        {
            document.Print();
        }
        finally
        {
            RestoreDefaults(printerName, savedDefaults);
        }
        if (drawFailed != null) throw new InvalidOperationException("종이를 그리지 못했다", drawFailed);
    }

    /// <summary>
    /// [프린터 종이 설정]: 프린터 드라이버의 설정 창을 이 프로그램 종이용으로 띄운다(프린터 기본 설정은 바꾸지 않는다).
    /// [확인]을 누르면 그 설정을 저장하고 true. 처음이면 프린터 기본 설정에서, 저장한 것이 있으면 그것에서 시작한다.
    /// </summary>
    public static bool EditDriverSettings(IWin32Window owner, string printerName)
    {
        if (owner == null) throw new ArgumentNullException(nameof(owner));
        if (string.IsNullOrWhiteSpace(printerName)) throw new ArgumentException("프린터 이름이 비었다", nameof(printerName));
        if (!OpenPrinter(printerName, out var handle, IntPtr.Zero) || handle == IntPtr.Zero) throw new InvalidOperationException("프린터를 열지 못했다");
        var defaults = ReadDefaults(printerName);
        IntPtr input = IntPtr.Zero, output = IntPtr.Zero;
        try
        {
            var size = DocumentProperties(owner.Handle, handle, printerName, IntPtr.Zero, IntPtr.Zero, 0);
            if (size <= DmDriverExtraOffset + 2) throw new InvalidOperationException("드라이버 설정 크기를 못 읽었다");
            var saved = SettingsFile.ReadDriverSettings(printerName);
            input = Marshal.AllocHGlobal(Math.Max(size, saved?.Length ?? 0));
            output = Marshal.AllocHGlobal(size);
            if (saved != null) Marshal.Copy(saved, 0, input, saved.Length);
            else if (DocumentProperties(owner.Handle, handle, printerName, input, IntPtr.Zero, DmOutBuffer) < 0) throw new InvalidOperationException("드라이버 설정을 못 읽었다");
            var result = DocumentProperties(owner.Handle, handle, printerName, output, input, DmInBuffer | DmInPrompt | DmOutBuffer);
            if (result != IdOk) return false;
            var length = (Marshal.ReadInt16(output, DmSizeOffset) & 0xFFFF) + (Marshal.ReadInt16(output, DmDriverExtraOffset) & 0xFFFF);
            if (length <= 0 || length > size) throw new InvalidOperationException("드라이버 설정 크기가 이상하다");
            var bytes = new byte[length];
            Marshal.Copy(output, bytes, 0, length);
            SettingsFile.WriteDriverSettings(printerName, bytes);
            return true;
        }
        finally
        {
            if (input != IntPtr.Zero) Marshal.FreeHGlobal(input);
            if (output != IntPtr.Zero) Marshal.FreeHGlobal(output);
            ClosePrinter(handle);
            RestoreDefaults(printerName, defaults);
        }
    }

    /// <summary>저장한 드라이버 설정(DEVMODE 바이트)을 이 문서의 프린터·쪽 설정에 넣는다. 드라이버 고유 칸(용지 유형 등)도 함께 간다</summary>
    private static void ApplyDriverSettings(PrintDocument document, byte[] devmode)
    {
        var global = GlobalAlloc(GmemMoveable, (UIntPtr)devmode.Length);
        if (global == IntPtr.Zero) throw new OutOfMemoryException();
        try
        {
            var pointer = GlobalLock(global);
            if (pointer == IntPtr.Zero) throw new InvalidOperationException("드라이버 설정을 담지 못했다");
            Marshal.Copy(devmode, 0, pointer, devmode.Length);
            GlobalUnlock(global);
            document.PrinterSettings.SetHdevmode(global);
            document.DefaultPageSettings.SetHdevmode(global);
        }
        finally
        {
            GlobalFree(global);
        }
    }

    /// <summary>
    /// 보내기 전 확인. 프린터가 꺼짐·오류·종이 문제면, 또는 앞서 보낸 우리 종이가 15초 넘게 대기열에 걸려 있으면 예외(창에 실패 글).
    /// 걸린 우리 종이(이 사용자·문서 이름 "PT 후 진료 종이")는 지운다 — 프린터를 켜는 순간 옛 환자 종이가 나오지 않게.
    /// 상태를 못 읽는 프린터는 막지 않는다(원래 길로 보낸다).
    /// </summary>
    private static void CheckReady(string printerName)
    {
        if (!OpenPrinter(printerName, out var handle, IntPtr.Zero) || handle == IntPtr.Zero) return;
        try
        {
            var (attributes, status) = ReadState(handle);
            var notReady = (attributes & AttributeWorkOffline) != 0 || (status & BadStatus) != 0;
            var cleared = ClearOwnJobs(handle, notReady ? TimeSpan.Zero : StaleAfter);
            if (notReady) throw new InvalidOperationException("프린터가 준비되지 않았다");
            if (cleared > 0) throw new InvalidOperationException("앞서 보낸 종이가 나오지 않았다");
        }
        finally
        {
            ClosePrinter(handle);
        }
    }

    /// <summary>PRINTER_INFO_2의 Attributes·Status. 못 읽으면 (0,0)</summary>
    private static (int Attributes, int Status) ReadState(IntPtr handle)
    {
        GetPrinter(handle, 2, IntPtr.Zero, 0, out var needed);
        if (needed <= 0) return (0, 0);
        var buffer = Marshal.AllocHGlobal(needed);
        try
        {
            if (!GetPrinter(handle, 2, buffer, needed, out _)) return (0, 0);
            // 포인터 13개(pServerName … pSecurityDescriptor) 뒤 Attributes, Priority, DefaultPriority, StartTime, UntilTime, Status
            var attributesOffset = 13 * IntPtr.Size;
            return (Marshal.ReadInt32(buffer, attributesOffset), Marshal.ReadInt32(buffer, attributesOffset + 5 * 4));
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    /// <summary>olderThan보다 오래 대기열에 있는 이 사용자의 "PT 후 진료 종이" 일을 지우고, 찾은 개수를 돌려준다(지우기는 최선 노력)</summary>
    private static int ClearOwnJobs(IntPtr handle, TimeSpan olderThan)
    {
        EnumJobs(handle, 0, 255, 1, IntPtr.Zero, 0, out var needed, out _);
        if (needed <= 0) return 0;
        var buffer = Marshal.AllocHGlobal(needed);
        try
        {
            if (!EnumJobs(handle, 0, 255, 1, buffer, needed, out _, out var returned)) return 0;
            var size = Marshal.SizeOf(typeof(JobInfo1));
            var found = 0;
            for (var i = 0; i < returned; i++)
            {
                var job = (JobInfo1)Marshal.PtrToStructure(buffer + i * size, typeof(JobInfo1))!;
                if ((job.Status & JobDone) != 0) continue;
                if (Marshal.PtrToStringUni(job.Document) != DocumentName) continue;
                if (!string.Equals(Marshal.PtrToStringUni(job.UserName), Environment.UserName, StringComparison.OrdinalIgnoreCase)) continue;
                if (DateTime.UtcNow - SubmittedUtc(job.Submitted) < olderThan) continue;
                found++;
                SetJob(handle, job.JobId, 0, IntPtr.Zero, JobControlDelete);
            }
            return found;
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    private static DateTime SubmittedUtc(SystemTime t)
    {
        try
        {
            return new DateTime(t.Year, t.Month, t.Day, t.Hour, t.Minute, t.Second, t.Milliseconds, DateTimeKind.Utc);
        }
        catch (ArgumentOutOfRangeException)
        {
            return DateTime.MinValue; // 시각을 못 읽으면 오래된 일로 본다
        }
    }

    /// <summary>mm → 1/100인치(PaperSize 단위). 반올림</summary>
    private static int HundredthsOfInch(int mm) => (int)Math.Round(mm / MmPerHundredthInch, MidpointRounding.AwayFromZero);

    /// <summary>HardMargin(1/100인치) → mm</summary>
    private static float HardMarginMm(float hundredths) => (float)(hundredths * MmPerHundredthInch);

    /// <summary>프린터의 지금 기본 설정(DEVMODE 바이트). DM_OUT_BUFFER로 읽기만 한다. 못 읽으면 null</summary>
    private static byte[]? ReadDefaults(string printerName)
    {
        var size = DocumentProperties(IntPtr.Zero, IntPtr.Zero, printerName, IntPtr.Zero, IntPtr.Zero, 0);
        if (size <= DmDriverExtraOffset + 2) return null;
        var buffer = Marshal.AllocHGlobal(size);
        try
        {
            if (DocumentProperties(IntPtr.Zero, IntPtr.Zero, printerName, buffer, IntPtr.Zero, DmOutBuffer) < 0) return null;
            var length = (Marshal.ReadInt16(buffer, DmSizeOffset) & 0xFFFF) + (Marshal.ReadInt16(buffer, DmDriverExtraOffset) & 0xFFFF);
            if (length <= 0 || length > size) return null;
            var bytes = new byte[length];
            Marshal.Copy(buffer, bytes, 0, length);
            return bytes;
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    /// <summary>기본 설정이 보내기 전과 달라졌으면 읽어 둔 값을 드라이버에 다시 넘겨 되돌린다(관리자 권한 없이). 실패해도 인쇄 결과는 그대로 둔다</summary>
    private static void RestoreDefaults(string printerName, byte[]? saved)
    {
        if (saved == null) return;
        var now = ReadDefaults(printerName);
        if (now == null || now.SequenceEqual(saved)) return;
        var size = DocumentProperties(IntPtr.Zero, IntPtr.Zero, printerName, IntPtr.Zero, IntPtr.Zero, 0);
        if (size <= 0) return;
        var input = Marshal.AllocHGlobal(saved.Length);
        var output = Marshal.AllocHGlobal(Math.Max(size, saved.Length));
        try
        {
            Marshal.Copy(saved, 0, input, saved.Length);
            DocumentProperties(IntPtr.Zero, IntPtr.Zero, printerName, output, input, DmInBuffer | DmOutBuffer);
        }
        finally
        {
            Marshal.FreeHGlobal(input);
            Marshal.FreeHGlobal(output);
        }
    }
}
