using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using FlaUI.Core.AutomationElements;
using FlaUI.Core.Input;
using FlaUI.Core.WindowsAPI;
using FlaUI.UIA3;
using Precheck.Core.Input;

namespace Precheck.Windows;

/// <summary>
/// 비트 화면 자동 입력의 윈도우 부분. 원본 vendor/range_bridge의 UChartAutomation·RangeAutomation을 옮겼다(기간 입력 다리. 하루 입력도 이 길로 된다).
/// 내원내역 날짜는 바꾸지 않는다: 사람이 띄워 둔 기간을 읽고, 차트번호로 검색된 줄을 위에서부터 열어 환자와 진료일(dtpWorkDate)이 맞는 줄에서 멈춘다.
/// 원본 판단 규칙·문구는 Core ChartRules·VisitOpener·InputRunner에 있고 여기는 Win32·FlaUI만 한다.
/// 원본과 다른 점:
/// · 저장 안 한 처방 창의 [확인]을 누르지 않는다(원본 ConfirmUnsavedPrescription을 옮기지 않음, AC-017.5). 창을 알아보면 멈춘다.
/// · 칸 찾기: 원본 FindByIds는 첫 칸을 썼다. 지문 칸은 Locate의 Pick 규칙(하나, 또는 보이는 것 하나)으로 찾는다(AC-017.4). 나머지(dtpFrom 등)는 원본처럼 첫 칸.
/// · 메모 읽기: 원본 GetText는 시간 지남을 빈칸으로 돌려줬다. ReadMemo는 null이다(빈칸으로 보고 쓰지 않게).
/// · DPI: 원본은 다리 프로세스 전체를 Per-Monitor V2로 켰다. 도우미는 비트 화면 DLL도 같은 프로세스에 띄우므로 이 스레드만 켜고 Dispose에서 되돌린다.
/// · 조회모드 안내창('다른 사용자가 사용중'): 원본 파이썬 중계가 자동으로 눌렀다. 옮기지 않았다(명세에 없음). 사람이 누르거나 90초 뒤 그 사람을 건너뛴다.
/// 진단 기록·예외에 환자 글자를 남기지 않는다(AC-001.6).
/// </summary>
public sealed class UChartAutomation : IChartUi, IVisitRowScreen
{
    private sealed class Ctl
    {
        public nint Root;
        public nint Chart;
        public nint Name;
        public nint Memo;
        public nint Save;
    }

    private delegate bool EnumProc(nint hwnd, nint lParam);

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT
    {
        public int X;
        public int Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct GUITHREADINFO
    {
        public int cbSize;
        public int flags;
        public nint hwndActive;
        public nint hwndFocus;
        public nint hwndCapture;
        public nint hwndMenuOwner;
        public nint hwndMoveSize;
        public nint hwndCaret;
        public RECT rcCaret;
    }

    private const string ID_CHART = "txtChtNum";
    private const string ID_NAME = "lbPatName";
    private const string ID_MEMO = "txtBilCmt";
    private const string ID_SAVE = "btnBilCmtModify";

    private const uint WM_SETTEXT = 12u;
    private const uint WM_GETTEXT = 13u;
    private const uint WM_GETTEXTLENGTH = 14u;
    private const uint WM_COMMAND = 273u;
    private const uint CB_GETCOUNT = 326u;
    private const uint CB_GETCURSEL = 327u;
    private const uint CB_SETCURSEL = 334u;
    private const uint EM_SETSEL = 177u;
    private const uint EM_REPLACESEL = 194u;
    private const uint BM_CLICK = 245u;
    private const uint BM_GETCHECK = 240u;
    private const uint SMTO_ABORTIFHUNG = 2u;
    private const int MaxTextLength = 50000;

    /// <summary>DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2(원본 InitDpi).</summary>
    private static readonly nint PerMonitorV2 = -4;

    private readonly UIA3Automation _uia;
    private readonly NativeTarget target;
    private readonly IWaitClock clock = new SystemWaitClock();
    private readonly nint previousDpi;
    private Ctl? ctl;
    private nint grid;
    private Point firstRow;

    /// <param name="installation">등록한 비트 설치 위치(NativeTarget 규칙의 뿌리).</param>
    public UChartAutomation(string installation)
    {
        target = new NativeTarget(installation);
        previousDpi = EnterDpi();
        _uia = new UIA3Automation();
        _uia.ConnectionTimeout = TimeSpan.FromSeconds(2.0);
        _uia.TransactionTimeout = TimeSpan.FromSeconds(2.0);
    }

    public void Dispose()
    {
        _uia.Dispose();
        if (previousDpi != IntPtr.Zero) LeaveDpi(previousDpi);
    }

    private static nint EnterDpi()
    {
        try
        {
            return SetThreadDpiAwarenessContext(PerMonitorV2);
        }
        catch (Exception e) when (e is EntryPointNotFoundException || e is DllNotFoundException)
        {
            return IntPtr.Zero;
        }
    }

    private static void LeaveDpi(nint previous)
    {
        try
        {
            SetThreadDpiAwarenessContext(previous);
        }
        catch (Exception e) when (e is EntryPointNotFoundException || e is DllNotFoundException)
        {
            // 이 윈도우에는 없는 기능이다
        }
    }

    // ── 지문 ──────────────────────────────────────────────

    public FingerprintResult CheckFingerprint()
    {
        var counts = new Dictionary<string, int>(StringComparer.Ordinal);
        var candidates = target.Candidates();
        counts[UiFingerprint.Process] = candidates.Count;
        var pids = candidates.Count == 1 ? candidates : new HashSet<uint>();

        var mains = TopWindows(pids, UiFingerprint.OutpatientWindow);
        counts[UiFingerprint.OutpatientWindow] = mains.Count;
        CountControls(counts, mains.Count == 1 ? mains[0] : IntPtr.Zero, UiFingerprint.Outpatient.Concat(new[] { UiFingerprint.WorkDate }).ToArray());

        var lists = TopWindows(pids, UiFingerprint.VisitsWindow);
        counts[UiFingerprint.VisitsWindow] = lists.Count;
        CountControls(counts, lists.Count == 1 ? lists[0] : IntPtr.Zero, UiFingerprint.Visits);

        return new FingerprintResult(counts);
    }

    private void CountControls(Dictionary<string, int> counts, nint root, string[] ids)
    {
        var found = root == IntPtr.Zero ? ids.ToDictionary(id => id, _ => new List<nint>()) : FindAllByIds(root, ids);
        foreach (var id in ids)
        {
            var list = found[id];
            counts[id] = UiFingerprint.Resolve(list.Count, list.Count(IsWindowVisible));
        }
    }

    private static List<nint> TopWindows(HashSet<uint> pids, string titleHint)
    {
        var found = new List<nint>();
        if (pids.Count == 0) return found;
        EnumWindows((h, _) =>
        {
            GetWindowThreadProcessId(h, out var pid);
            if (pids.Contains(pid) && IsWindowVisible(h) && GetText(h).IndexOf(titleHint, StringComparison.Ordinal) >= 0) found.Add(h);
            return true;
        }, IntPtr.Zero);
        return found;
    }

    /// <summary>ID마다 그 창 아래에서 찾은 칸 전부(원본 Locate의 수집).</summary>
    private Dictionary<string, List<nint>> FindAllByIds(nint root, params string[] ids)
    {
        var found = ids.ToDictionary(id => id, _ => new List<nint>(), StringComparer.Ordinal);
        var children = new List<nint>();
        EnumChildWindows(root, (h, _) =>
        {
            children.Add(h);
            return true;
        }, IntPtr.Zero);
        foreach (var child in children)
        {
            string key;
            try
            {
                key = _uia.FromHandle(child).Properties.AutomationId.ValueOrDefault ?? "";
            }
            catch (Exception e) when (e is not OutOfMemoryException)
            {
                continue;
            }
            if (found.TryGetValue(key, out var list)) list.Add(child);
        }
        return found;
    }

    /// <summary>원본 Locate의 Pick: 하나뿐이면 그것, 여럿이면 보이는 것이 정확히 하나일 때만 그것.</summary>
    private static nint Pick(List<nint> list)
    {
        if (list.Count == 1) return list[0];
        var visible = list.Where(IsWindowVisible).ToList();
        return visible.Count == 1 ? visible[0] : IntPtr.Zero;
    }

    // ── 저장 안 한 처방 창·비트 확인 창. 읽기만 한다. 절대 누르지 않는다 ───────

    private List<nint> Dialogs()
    {
        var pids = target.ProcessIds();
        var found = new List<nint>();
        if (pids.Count == 0) return found;
        EnumWindows((h, _) =>
        {
            GetWindowThreadProcessId(h, out var pid);
            if (pids.Contains(pid) && IsWindowVisible(h) && GetCls(h) == "#32770") found.Add(h);
            return true;
        }, IntPtr.Zero);
        return found;
    }

    private static bool IsUnsavedPrescriptionDialog(nint dialog)
    {
        var children = new List<nint>();
        EnumChildWindows(dialog, (h, _) =>
        {
            children.Add(h);
            return true;
        }, IntPtr.Zero);
        return ChartRules.ContainsUnsavedPrescription(children.Select(GetText));
    }

    public bool HasUnsavedRxDialog() => Dialogs().Any(IsUnsavedPrescriptionDialog);

    public DialogState ReadDialog()
    {
        var dialogs = Dialogs();
        if (dialogs.Any(IsUnsavedPrescriptionDialog)) return DialogState.UnsavedRx;
        return dialogs.Count == 1 ? DialogState.Dialog : DialogState.None;
    }

    // ── 외래진료실 ─────────────────────────────────────────

    public ChartLocate Locate()
    {
        ctl = null;
        var mains = TopWindows(target.ProcessIds(), UiFingerprint.OutpatientWindow);
        if (mains.Count != 1)
        {
            return ChartLocate.NotFound("U차트 외래진료실 창을 찾지 못했습니다. U차트 본 화면이 열려 있는지 확인해 주세요.");
        }
        var found = FindAllByIds(mains[0], ID_CHART, ID_NAME, ID_MEMO, ID_SAVE);
        var located = new Ctl
        {
            Root = mains[0],
            Chart = Pick(found[ID_CHART]),
            Name = Pick(found[ID_NAME]),
            Memo = Pick(found[ID_MEMO]),
            Save = Pick(found[ID_SAVE]),
        };
        var missing = new List<string>();
        var labels = new List<string>();
        Note(located.Chart, ID_CHART, "차트번호(txtChtNum)", missing, labels);
        Note(located.Name, ID_NAME, "환자명(lbPatName)", missing, labels);
        Note(located.Memo, ID_MEMO, "청구메모(txtBilCmt)", missing, labels);
        Note(located.Save, ID_SAVE, "임시저장(btnBilCmtModify)", missing, labels);
        if (missing.Count > 0)
        {
            return ChartLocate.Missing("U차트에서 칸을 찾지 못했거나 여러 개라 판단할 수 없습니다: " + string.Join(", ", labels), missing);
        }
        ctl = located;
        return ChartLocate.Found();
    }

    private static void Note(nint handle, string id, string label, List<string> missing, List<string> labels)
    {
        if (handle != IntPtr.Zero) return;
        missing.Add(id);
        labels.Add(label);
    }

    /// <summary>원본 WaitOpenRange: 칸을 다시 찾되, 못 찾으면 전에 찾은 칸을 그대로 둔다.</summary>
    public void Relocate()
    {
        var previous = ctl;
        if (!Locate().Ok) ctl = previous;
    }

    public ChartIdentity ReadIdentity()
    {
        var c = ctl;
        return c == null ? new ChartIdentity("", "", "U차트 외래진료실 창을 찾지 못했습니다") : Identity(c);
    }

    private static ChartIdentity Identity(Ctl c) => ChartRules.Identity(GetText(c.Chart), GetText(c.Name), GetText(c.Root));

    public string? ReadWorkDate()
    {
        var c = ctl;
        return c == null ? null : ReadWorkDate(c, out _);
    }

    /// <summary>원본 ReadWorkDate: 외래진료실에 열린 내원의 진료일. 비트가 칸을 새로 만들 수 있어 부를 때마다 찾는다.</summary>
    private string? ReadWorkDate(Ctl c, out string? error)
    {
        error = null;
        var handle = Pick(FindAllByIds(c.Root, UiFingerprint.WorkDate)[UiFingerprint.WorkDate]);
        if (handle == IntPtr.Zero || !target.OwnsControls(c.Root, handle))
        {
            error = "외래진료실 진료일 칸을 찾지 못했습니다";
            return null;
        }
        var date = ChartRules.DateOf(GetText(handle));
        if (date == null) error = "외래진료실 진료일을 읽지 못했습니다";
        return date;
    }

    public ChartRead ReadTarget()
    {
        var c = ctl;
        if (c == null) return new ChartRead(false, "", "", null, null, null);
        var owned = target.OwnsControls(c.Root, c.Chart, c.Name, c.Memo, c.Save);
        var identity = Identity(c);
        var work = ReadWorkDate(c, out var workError);
        return new ChartRead(owned, identity.Chart, identity.Name, identity.Error, work, workError);
    }

    // ── 내원내역 ───────────────────────────────────────────

    private nint FindListWindow(out string? error)
    {
        error = null;
        var lists = TopWindows(target.ProcessIds(), UiFingerprint.VisitsWindow);
        if (lists.Count == 0)
        {
            error = "U차트 내원내역 창이 열려 있지 않습니다";
            return IntPtr.Zero;
        }
        if (lists.Count > 1)
        {
            error = "U차트 내원내역 창이 여러 개 열려 있습니다";
            return IntPtr.Zero;
        }
        return lists[0];
    }

    /// <summary>원본 ReadListFilter: 조회 기간(dtpFrom ~ dtpTo, 못 읽으면 창 제목)과 처방코드 칸(txtOdrCod). 읽기만 한다.</summary>
    public ListFilter ReadListFilter()
    {
        var list = FindListWindow(out var error);
        if (list == IntPtr.Zero) return new ListFilter(null, null, null, null, error);
        var found = FindAllByIds(list, "dtpFrom", "dtpTo", "txtOdrCod", "chkOdrExcept");
        var period = ChartRules.ListPeriod(TextOfFirst(found["dtpFrom"]), TextOfFirst(found["dtpTo"]), GetText(list));
        if (period.Error != null) return period;
        var codeBox = found["txtOdrCod"];
        var exceptBox = found["chkOdrExcept"];
        return new ListFilter(
            period.From,
            period.To,
            codeBox.Count == 0 ? null : GetText(codeBox[0]).Trim(),
            exceptBox.Count == 0 ? (bool?)null : IsChecked(exceptBox[0]),
            null);
    }

    private static string? TextOfFirst(List<nint> list) => list.Count == 0 ? null : GetText(list[0]);

    private static bool IsChecked(nint h)
    {
        SendMessageTimeout(h, BM_GETCHECK, IntPtr.Zero, IntPtr.Zero, SMTO_ABORTIFHUNG, 1000u, out var result);
        return ((IntPtr)result).ToInt64() == 1;
    }

    /// <summary>원본 OpenPatientRange: 내원내역에서 차트번호로 찾아 그 진료일의 내원을 연다. 줄 고리는 Core VisitOpener.</summary>
    public ChartOpenResult OpenPatient(string expChart, string expName, string expDate)
    {
        var started = clock.NowMs;
        var located = Locate();
        if (!located.Ok)
        {
            return located.Fields.Count > 0
                ? ChartOpenResult.UiChanged(located.Error ?? "", located.Fields)
                : ChartOpenResult.Failed(located.Error ?? "U차트를 찾지 못했습니다.");
        }
        var c = ctl!;
        var identity = Identity(c);
        if (identity.Error == null
            && ChartRules.SamePatient(identity.Chart, identity.Name, expChart, expName)
            && ChartRules.Digits(ReadWorkDate(c, out _)) == ChartRules.Digits(expDate))
        {
            return ChartOpenResult.Opened("U차트에 이미 열려 있습니다.");
        }

        var filter = ReadListFilter();
        if (filter.Error != null) return ChartOpenResult.Failed(filter.Error);
        var wanted = ChartRules.DateOf(expDate);
        if (wanted == null || string.CompareOrdinal(wanted, filter.From) < 0 || string.CompareOrdinal(wanted, filter.To) > 0)
        {
            return ChartOpenResult.Failed($"U차트 내원내역 기간({filter.From} ~ {filter.To}) 밖의 내원일({expDate})입니다. 내원내역 기간을 맞춰 주세요.");
        }

        var list = FindListWindow(out var listError);
        if (list == IntPtr.Zero) return ChartOpenResult.Failed(listError ?? "");
        if (IsIconic(list)) return ChartOpenResult.Failed("U차트 내원내역 창이 최소화되어 있습니다. 화면에 띄워 주세요.");

        var found = FindAllByIds(list, UiFingerprint.Visits);
        var cb = Pick(found["cbSch"]);
        var searchBox = Pick(found["txtSch"]);
        var searchButton = Pick(found["btnSch"]);
        var main = Pick(found["ctgMain"]);
        var missing = UiFingerprint.Visits.Where(id => Pick(found[id]) == IntPtr.Zero).ToList();
        if (missing.Count > 0)
        {
            return ChartOpenResult.UiChanged("내원내역 창에서 칸을 찾지 못했습니다: " + string.Join(", ", missing), missing);
        }

        var modeFailure = EnsureChartMode(cb);
        if (modeFailure != null) return ChartOpenResult.Failed(modeFailure);

        var digits = ChartRules.Digits(expChart);
        SendMessageTimeoutStr(searchBox, WM_SETTEXT, IntPtr.Zero, digits, SMTO_ABORTIFHUNG, 1000u, out _);
        Thread.Sleep(100);
        if (GetText(searchBox).Trim() != digits) return ChartOpenResult.Failed("내원내역 검색칸에 차트번호를 넣지 못했습니다.");

        var countBefore = GetText(list);
        if (!ClickButton(searchButton)) return ChartOpenResult.Failed("내원내역 검색 버튼을 누르지 못했습니다.");
        var rows = ChartRules.SearchCount(WaitSearchCount(list, countBefore));
        if (rows == null) return ChartOpenResult.Failed("검색 결과 수를 읽지 못했습니다.");
        if (rows == 0) return ChartOpenResult.Failed("U차트 내원내역에서 이 환자의 내원을 찾지 못했습니다. 처방코드·상병 검색 조건을 확인해 주세요.");

        // 비트 내원내역 목록(C1TrueDBGrid)은 칸 내용을 읽을 수 없어, 검색된 줄을 위에서부터 차례로 연다.
        // 줄 위치를 픽셀로 계산하지 않고 첫 줄을 한 번 눌러 초점을 준 뒤 ↓ 키로 그 줄에 가서 Enter로 연다(원본 1.21.3)
        GetWindowRect(main, out var rect);
        var dpi = 96u;
        try
        {
            dpi = GetDpiForWindow(main);
        }
        catch (Exception e) when (e is EntryPointNotFoundException || e is DllNotFoundException)
        {
            // 옛 윈도우: 96으로 본다
        }
        var first = ChartRules.FirstRowPoint(rect.Left, rect.Top, rect.Bottom, dpi);
        if (first.TooSmall) return ChartOpenResult.Failed("U차트 내원내역 목록이 너무 작습니다. 목록이 보이게 창을 키워 주세요.");
        grid = main;
        firstRow = new Point(first.X, first.Y);

        var position = Mouse.Position;
        try
        {
            return VisitOpener.OpenRows(this, clock, started, rows.Value, ChartRules.FullyVisibleRows(rect.Top, rect.Bottom, dpi), expChart, expName, expDate);
        }
        finally
        {
            try
            {
                Mouse.Position = position;
            }
            catch (Exception e) when (e is not OutOfMemoryException)
            {
                // 마우스를 되돌리지 못해도 입력 결과와 상관없다
            }
        }
    }

    /// <summary>원본: 검색 종류가 '차트번호'가 아니면 콤보 항목을 차례로 골라 맞춘다(30개까지). 못 맞추면 원래대로 두고 원본 문구.</summary>
    private static string? EnsureChartMode(nint cb)
    {
        var text = GetText(cb);
        if (ChartRules.IsChartMode(GetText(cb))) return null;

        SendMessageTimeout(cb, CB_GETCOUNT, IntPtr.Zero, IntPtr.Zero, SMTO_ABORTIFHUNG, 1000u, out var countResult);
        SendMessageTimeout(cb, CB_GETCURSEL, IntPtr.Zero, IntPtr.Zero, SMTO_ABORTIFHUNG, 1000u, out var selected);
        var count = (int)((IntPtr)countResult).ToInt64();
        for (var index = 0; index < count && index < 30; index++)
        {
            SendMessageTimeout(cb, CB_SETCURSEL, index, IntPtr.Zero, SMTO_ABORTIFHUNG, 1000u, out _);
            Thread.Sleep(50);
            if (ChartRules.IsChartMode(GetText(cb)))
            {
                nint change = 0x10000 | (GetDlgCtrlID(cb) & 0xFFFF);
                SendMessageTimeout(GetParent(cb), WM_COMMAND, change, cb, SMTO_ABORTIFHUNG, 1000u, out _);
                Thread.Sleep(200);
                return null;
            }
        }
        SendMessageTimeout(cb, CB_SETCURSEL, selected, IntPtr.Zero, SMTO_ABORTIFHUNG, 1000u, out _);
        return $"내원내역 검색 종류를 '차트번호'로 맞추지 못했습니다. (읽은 값: '{text}', 항목 수: {count}) 이 문구를 알려 주세요.";
    }

    /// <summary>원본 WaitSearchCount: 결과 수가 바뀌고 0.3초 그대로면 바로, 아니면 1.5초 뒤 읽는다.</summary>
    private static string WaitSearchCount(nint window, string before)
    {
        var watch = Stopwatch.StartNew();
        var last = before;
        var changedAt = -1L;
        while (watch.ElapsedMilliseconds < 1500)
        {
            Thread.Sleep(100);
            var now = GetText(window);
            if (now != last)
            {
                last = now;
                changedAt = watch.ElapsedMilliseconds;
                continue;
            }
            var count = ChartRules.SearchCount(now);
            if (changedAt >= 0 && now != before && count > 0 && watch.ElapsedMilliseconds >= 500 && watch.ElapsedMilliseconds - changedAt >= 300) return now;
        }
        return GetText(window);
    }

    public bool ListPointVisible()
    {
        var at = WindowFromPoint(new POINT { X = firstRow.X, Y = firstRow.Y });
        return at == grid || IsChild(grid, at);
    }

    /// <summary>원본 OpenListRow: 첫 줄을 눌러 초점을 주고 ↑ up번·↓ row번 뒤 Enter. 키마다 앞서 초점이 목록에 있는지 본다(다른 창에 키가 들어가지 않게).</summary>
    public string? OpenListRow(int row, int up)
    {
        const string lost = "U차트 내원내역 목록에 키보드 초점을 맞추지 못해 멈췄습니다. 비트 화면을 확인해 주세요.";
        Mouse.Click(firstRow);
        var watch = Stopwatch.StartNew();
        while (!ListHasFocus(grid))
        {
            if (watch.ElapsedMilliseconds > 1000) return lost;
            Thread.Sleep(30);
        }
        for (var i = 0; i < up + row; i++)
        {
            if (!ListHasFocus(grid)) return lost;
            Keyboard.Type(i < up ? VirtualKeyShort.UP : VirtualKeyShort.DOWN);
        }
        Thread.Sleep(50);
        if (!ListHasFocus(grid)) return lost;
        Keyboard.Type(VirtualKeyShort.RETURN);
        return null;
    }

    /// <summary>키 입력은 맨 앞 창 스레드의 초점 칸으로 간다: 그 스레드가 목록의 스레드이고 초점이 목록 안이어야 한다.</summary>
    private static bool ListHasFocus(nint list)
    {
        var thread = GetWindowThreadProcessId(list, out _);
        if (thread == 0 || GetWindowThreadProcessId(GetForegroundWindow(), out _) != thread) return false;
        var info = new GUITHREADINFO { cbSize = Marshal.SizeOf(typeof(GUITHREADINFO)) };
        return GetGUIThreadInfo(thread, ref info) && info.hwndFocus != IntPtr.Zero && (info.hwndFocus == list || IsChild(list, info.hwndFocus));
    }

    // ── 메모 칸 ────────────────────────────────────────────

    private Ctl Located() => ctl ?? throw new InvalidOperationException("Locate를 먼저 불러야 한다");

    /// <summary>메모 칸 글. 원본 GetText와 달리 메시지가 실패하거나 시간이 지나면 빈칸이 아니라 null이다.</summary>
    public string? ReadMemo()
    {
        var c = ctl;
        return c == null ? null : TryGetText(c.Memo);
    }

    public bool IsMemoEditable() => IsWindowEnabled(Located().Memo);

    public void SelectAllMemo() => SendMessageTimeout(Located().Memo, EM_SETSEL, IntPtr.Zero, -1, SMTO_ABORTIFHUNG, 1000u, out _);

    public void ReplaceMemoSelection(string text)
    {
        SendMessageTimeoutStr(Located().Memo, EM_REPLACESEL, 1, text, SMTO_ABORTIFHUNG, 2000u, out _);
        Thread.Sleep(150);
    }

    public bool IsValuePatternSupported() => _uia.FromHandle(Located().Memo).Patterns.Value.IsSupported;

    public void SetMemoValue(string text)
    {
        _uia.FromHandle(Located().Memo).Patterns.Value.Pattern.SetValue(text);
        Thread.Sleep(150);
    }

    public bool ClickSave()
    {
        if (!ClickButton(Located().Save)) return false;
        Thread.Sleep(700);
        return true;
    }

    /// <summary>원본 ClickSave: 칸이 켜져 있으면 UIA Invoke, 안 되면 BM_CLICK. 검색·임시저장 단추에만 쓴다. 대화 상자 단추에는 쓰지 않는다.</summary>
    private bool ClickButton(nint h)
    {
        if (!IsWindowEnabled(h)) return false;
        try
        {
            var element = _uia.FromHandle(h);
            if (element.Patterns.Invoke.IsSupported)
            {
                element.Patterns.Invoke.Pattern.Invoke();
                return true;
            }
        }
        catch (Exception e) when (e is not OutOfMemoryException)
        {
            // 원본처럼 아래 메시지로 넘어간다
        }
        return PostMessage(h, BM_CLICK, IntPtr.Zero, IntPtr.Zero);
    }

    // ── Win32 ──────────────────────────────────────────────

    private static string GetCls(nint h)
    {
        var name = new StringBuilder(256);
        GetClassName(h, name, name.Capacity);
        return name.ToString();
    }

    /// <summary>원본 GetText: 글자가 없거나 시간이 지나면 빈 글자.</summary>
    private static string GetText(nint h) => TryGetText(h) ?? "";

    private static string? TryGetText(nint h)
    {
        if (SendMessageTimeout(h, WM_GETTEXTLENGTH, IntPtr.Zero, IntPtr.Zero, SMTO_ABORTIFHUNG, 500u, out var lengthResult) == IntPtr.Zero) return null;
        var length = (int)((IntPtr)lengthResult).ToInt64();
        if (length <= 0) return "";
        if (length > MaxTextLength) length = MaxTextLength;
        var text = new StringBuilder(length + 1);
        if (SendMessageTimeoutSb(h, WM_GETTEXT, length + 1, text, SMTO_ABORTIFHUNG, 500u, out _) == IntPtr.Zero) return null;
        return text.ToString();
    }

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumProc cb, nint lParam);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(nint h, out uint pid);

    [DllImport("user32.dll")]
    private static extern bool EnumChildWindows(nint parent, EnumProc cb, nint lParam);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(nint h);

    [DllImport("user32.dll")]
    private static extern bool IsWindowEnabled(nint h);

    [DllImport("user32.dll")]
    private static extern bool PostMessage(nint h, uint msg, nint w, nint l);

    [DllImport("user32.dll", EntryPoint = "SendMessageTimeoutW")]
    private static extern nint SendMessageTimeout(nint h, uint msg, nint w, nint l, uint flags, uint timeout, out nint result);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, EntryPoint = "SendMessageTimeoutW")]
    private static extern nint SendMessageTimeoutSb(nint h, uint msg, nint w, StringBuilder l, uint flags, uint timeout, out nint result);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, EntryPoint = "SendMessageTimeoutW")]
    private static extern nint SendMessageTimeoutStr(nint h, uint msg, nint w, string l, uint flags, uint timeout, out nint result);

    [DllImport("user32.dll")]
    private static extern bool IsIconic(nint h);

    [DllImport("user32.dll")]
    private static extern bool IsChild(nint parent, nint h);

    [DllImport("user32.dll")]
    private static extern nint GetParent(nint h);

    [DllImport("user32.dll")]
    private static extern int GetDlgCtrlID(nint h);

    [DllImport("user32.dll")]
    private static extern nint WindowFromPoint(POINT p);

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(nint h, out RECT r);

    [DllImport("user32.dll")]
    private static extern uint GetDpiForWindow(nint h);

    [DllImport("user32.dll")]
    private static extern nint SetThreadDpiAwarenessContext(nint value);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, EntryPoint = "GetClassNameW")]
    private static extern int GetClassName(nint h, StringBuilder sb, int max);

    [DllImport("user32.dll")]
    private static extern bool GetGUIThreadInfo(uint idThread, ref GUITHREADINFO info);

    [DllImport("user32.dll")]
    private static extern nint GetForegroundWindow();
}
