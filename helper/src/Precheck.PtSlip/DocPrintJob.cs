using System;
using System.ComponentModel;
using System.Drawing;
using System.Drawing.Printing;
using System.Linq;
using System.Runtime.InteropServices;

namespace Precheck.PtSlip;

/// <summary>
/// 서류 여러 쪽을 A4 세로로 한 인쇄 작업에 보내기(AC-7406.2). 대화상자 없이(StandardPrintController) 보내고,
/// 쪽 크기·여백은 이 문서(PrintDocument)에만 정한다. 프린터 기본 설정(비트도 쓰는 A4 프린터)은 바꾸지 않는다:
/// SlipPrintJob처럼 보내기 전 기본값을 읽어 두고, 보낸 뒤 달라졌으면 되돌린다.
/// 보내기 전 확인(꺼짐·오류·걸린 우리 일)은 SlipPrintJob.CheckReady와 같은 규칙이다. 그 함수는 private이고
/// 'PT 후 진료 종이' 문서 이름에 묶여 있어 부를 수 없어서, 같은 규칙을 이 문서 이름으로 여기 둔다.
/// 문서 이름에는 환자 값을 넣지 않는다(인쇄 대기열에 보인다).
/// </summary>
public static class DocPrintJob
{
    /// <summary>인쇄 대기열에 보이는 문서 이름</summary>
    public const string DocumentName = "서류 한 번에 인쇄";

    /// <summary>A4 세로 쪽 크기(mm). drawPage가 받는 Graphics의 좌표 범위</summary>
    public const float PageWidthMm = 210f;
    public const float PageHeightMm = 297f;

    private const double MmPerHundredthInch = 0.254;
    /// <summary>A4 = 210×297mm를 1/100인치로(PaperSize 단위)</summary>
    private const int A4WidthHundredths = 827;
    private const int A4HeightHundredths = 1169;

    private const int DmOutBuffer = 2;
    private const int DmInBuffer = 8;
    // DEVMODEW: dmDeviceName(WCHAR[32]) 뒤 dmSpecVersion·dmDriverVersion·dmSize·dmDriverExtra
    private const int DmSizeOffset = 68;
    private const int DmDriverExtraOffset = 70;

    // 프린터 상태(SlipPrintJob과 같은 값): 꺼진 프린터 대기열에 넣은 서류가 나중에 다음 환자 서류와 섞여 나오지 않게
    private const int AttributeWorkOffline = 0x400;
    // PAUSED·ERROR·PENDING_DELETION·PAPER_JAM·PAPER_OUT·PAPER_PROBLEM·OFFLINE·NOT_AVAILABLE·NO_TONER·USER_INTERVENTION·OUT_OF_MEMORY·DOOR_OPEN·SERVER_UNKNOWN
    private const int BadStatus = 0x1 | 0x2 | 0x4 | 0x8 | 0x10 | 0x40 | 0x80 | 0x1000 | 0x40000 | 0x100000 | 0x200000 | 0x400000 | 0x800000;
    // 끝났거나 지우는 중인 일(JOB_STATUS_DELETING·DELETED·PRINTED·COMPLETE)은 걸린 일이 아니다
    private const int JobDone = 0x4 | 0x100 | 0x80 | 0x1000;
    /// <summary>JOB_STATUS_PRINTING: 프린터가 지금 찍고 있는 일</summary>
    private const int JobPrinting = 0x10;
    private const int JobControlDelete = 5;
    /// <summary>우리 서류가 이만큼 지나도 대기열에 있고 프린터가 아무것도 찍고 있지 않으면 안 나오는 것(SlipPrintJob과 같은 15초)</summary>
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

    /// <summary>윈도우 기본 프린터 이름. 없거나 못 읽으면 null</summary>
    public static string? DefaultPrinter()
    {
        try
        {
            var settings = new PrinterSettings();
            return settings.IsValid && !string.IsNullOrWhiteSpace(settings.PrinterName) ? settings.PrinterName : null;
        }
        catch (Exception e) when (e is InvalidPrinterException || e is Win32Exception)
        {
            return null;
        }
    }

    /// <summary>실제로 보낼 프린터: 설정이 빈칸이면 윈도우 기본 프린터(없으면 null), 아니면 설정 이름 그대로(앞뒤 빈칸만 뺌)</summary>
    public static string? Resolve(string? configured)
    {
        var wanted = (configured ?? "").Trim();
        return wanted.Length > 0 ? wanted : DefaultPrinter();
    }

    /// <summary>
    /// printerName(빈칸이면 윈도우 기본 프린터)으로 A4 세로 pageCount쪽을 한 인쇄 작업으로 보낸다.
    /// drawPage(g, i)는 i번째 쪽(0부터)을 그린다: g는 mm 단위(PageUnit=Millimeter)이고 (0,0)이 종이 왼쪽 위, 폭 210·높이 297.
    /// (프린터가 못 찍는 가장자리 HardMarginX/Y만큼은 미리 되돌려 둔다.)
    /// toFile이 있으면 그 파일로 쓴다(Microsoft Print to PDF 확인용, 대화상자 없이, 프린터 확인은 건너뜀).
    /// 프린터가 없거나 꺼짐·오류이거나, 그리다 실패했거나, 쪽을 다 보내지 못하면 예외.
    /// </summary>
    public static void Send(string printerName, int pageCount, Action<Graphics, int> drawPage, string? toFile = null)
    {
        if (pageCount <= 0) throw new ArgumentOutOfRangeException(nameof(pageCount));
        if (drawPage == null) throw new ArgumentNullException(nameof(drawPage));
        var printer = Resolve(printerName) ?? throw new InvalidOperationException("기본 프린터가 없다");

        using var document = new PrintDocument
        {
            DocumentName = DocumentName,
            PrintController = new StandardPrintController(),
            OriginAtMargins = false,
        };
        document.PrinterSettings.PrinterName = printer;
        if (!document.PrinterSettings.IsValid) throw new InvalidOperationException("설치되지 않은 프린터");
        document.PrinterSettings.Copies = 1;
        if (toFile != null)
        {
            document.PrinterSettings.PrintToFile = true;
            document.PrinterSettings.PrintFileName = toFile;
        }

        var page = document.DefaultPageSettings;
        page.PaperSize = A4Of(document.PrinterSettings);
        page.Landscape = false;
        page.Margins = new Margins(0, 0, 0, 0);

        Exception? drawFailed = null;
        var sent = 0;
        document.PrintPage += (sender, e) =>
        {
            try
            {
                var graphics = e.Graphics ?? throw new InvalidOperationException("인쇄 Graphics가 없다");
                graphics.PageUnit = GraphicsUnit.Millimeter;
                // OriginAtMargins=false면 (0,0)은 인쇄 가능 영역 왼쪽 위다. 프린터가 못 찍는 가장자리만큼 되돌려 종이 왼쪽 위에 맞춘다
                graphics.TranslateTransform(-HardMarginMm(e.PageSettings.HardMarginX), -HardMarginMm(e.PageSettings.HardMarginY));
                drawPage(graphics, sent);
            }
            catch (Exception ex)
            {
                drawFailed = ex;
                e.Cancel = true;
                e.HasMorePages = false;
                return;
            }
            sent++;
            e.HasMorePages = sent < pageCount;
        };

        if (toFile == null) CheckReady(printer);

        var savedDefaults = ReadDefaults(printer);
        try
        {
            document.Print();
        }
        finally
        {
            RestoreDefaults(printer, savedDefaults);
        }
        if (drawFailed != null) throw new InvalidOperationException("서류를 그리지 못했다", drawFailed);
        if (sent != pageCount) throw new InvalidOperationException("쪽을 다 보내지 못했다");
    }

    /// <summary>프린터가 아는 A4(종이 번호까지 드라이버 것), 없으면 A4 크기의 종이</summary>
    private static PaperSize A4Of(PrinterSettings settings)
    {
        try
        {
            var known = settings.PaperSizes.Cast<PaperSize>().FirstOrDefault(size => size.Kind == PaperKind.A4);
            if (known != null) return known;
        }
        catch (Exception e) when (e is InvalidPrinterException || e is Win32Exception)
        {
            // 종이 목록을 못 읽으면 아래 A4로
        }
        return new PaperSize("A4", A4WidthHundredths, A4HeightHundredths) { RawKind = (int)PaperKind.A4 };
    }

    /// <summary>
    /// 보내기 전 확인(SlipPrintJob.CheckReady와 같은 규칙). 프린터가 꺼짐·오류·종이 문제면, 또는 앞서 보낸 우리 서류가 15초 넘게
    /// 대기열에 걸려 있으면 예외(창에 실패 글). 걸린 우리 서류(이 사용자·문서 이름 "서류 한 번에 인쇄")는 지운다 — 프린터를 켜는 순간
    /// 옛 환자 서류가 나오지 않게. 서류는 여러 쪽이라 찍는 데 오래 걸릴 수 있어, 프린터가 무엇이든 지금 찍고 있으면 걸린 것으로 보지 않는다.
    /// 상태를 못 읽는 프린터는 막지 않는다(원래 길로 보낸다).
    /// </summary>
    private static void CheckReady(string printerName)
    {
        if (!OpenPrinter(printerName, out var handle, IntPtr.Zero) || handle == IntPtr.Zero) return;
        try
        {
            var (attributes, status) = ReadState(handle);
            var notReady = (attributes & AttributeWorkOffline) != 0 || (status & BadStatus) != 0;
            var cleared = ClearOwnJobs(handle, notReady ? TimeSpan.Zero : StaleAfter, notReady);
            if (notReady) throw new InvalidOperationException("프린터가 준비되지 않았다");
            if (cleared > 0) throw new InvalidOperationException("앞서 보낸 서류가 나오지 않았다");
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

    /// <summary>
    /// olderThan보다 오래 대기열에 있는 이 사용자의 "서류 한 번에 인쇄" 일을 지우고, 찾은 개수를 돌려준다(지우기는 최선 노력).
    /// evenIfPrinting이 아니고 대기열의 어떤 일이든 찍는 중이면 아무것도 지우지 않는다(프린터가 일하는 중).
    /// </summary>
    private static int ClearOwnJobs(IntPtr handle, TimeSpan olderThan, bool evenIfPrinting)
    {
        EnumJobs(handle, 0, 255, 1, IntPtr.Zero, 0, out var needed, out _);
        if (needed <= 0) return 0;
        var buffer = Marshal.AllocHGlobal(needed);
        try
        {
            if (!EnumJobs(handle, 0, 255, 1, buffer, needed, out _, out var returned)) return 0;
            var size = Marshal.SizeOf(typeof(JobInfo1));
            var jobs = new JobInfo1[returned];
            for (var i = 0; i < returned; i++) jobs[i] = (JobInfo1)Marshal.PtrToStructure(buffer + i * size, typeof(JobInfo1))!;
            if (!evenIfPrinting && jobs.Any(job => (job.Status & JobDone) == 0 && (job.Status & JobPrinting) != 0)) return 0;
            var found = 0;
            foreach (var job in jobs)
            {
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
