using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Linq;
using System.Threading;
using System.Windows.Forms;
using Precheck.Core.InjectionMemo;

namespace Precheck.PtSlip;

/// <summary>
/// 비트 접수 화면 '접수메모(당일)' 칸 오른쪽에 붙는 [주사 차수]와 그 바로 오른쪽 [엑스레이] 단추(시안 ①②, AC-7503.2·AC-7505.4). 한 창 안에 두 단추를 그리고
/// (사이 6px은 창 밖이라 눌리지 않는다) 같이 움직이고 같이 숨는다. [PT 먼저] 단추(ButtonForm)처럼
/// 테두리 없는 맨 위 작은 창이고 작업 표시줄에 안 나오며, 눌러도 비트에서 포커스를 뺏지 않는다(WS_EX_NOACTIVATE).
/// 0.25초마다 접수 화면이 맨 앞인지 보고(findScreen = ReceptionWindows.FindForeground) 맞으면 메모 칸 오른쪽(+ 설정의 단추 자리 px)에
/// 붙어 보이고 단축키를 잡는다. 아니면 숨고 단축키를 놓는다(이 프로그램 창이 맨 앞이면 단추는 그대로 둔다).
/// [주사 차수]·단축키는 주사 차수만(compute): 화면의 차트번호 칸·메모 칸 글을 읽어 백그라운드에서 Core InjectionMemoService를 부르고,
/// 결과를 창 스레드에서 받아 Insert면 칸 끝에 글을 넣고(MemoTyper.Append) 알림(NoticeForm)을 띄운다.
/// [엑스레이]는 그 환자가 찍은 엑스레이 목록 창(XrayListForm, 시안 ⑤)을 메모 칸 아래에 띄우고(readXray, 다시 누르면 닫음),
/// 창의 [넣기]마다 그때 칸 글로 Core MemoCompose.ComposeXrayPart를 불러 칸 끝에 넣는다. 차트번호가 바뀌거나 접수 화면이 맨 앞이 아니면 창을 닫는다.
/// 판단은 하지 않고 Core를 부르기만 한다.
/// 칸 글·결과 글은 파일·로그·콘솔에 남기지 않는다. 만든 스레드(창 스레드)에서만 부른다.
/// </summary>
public sealed class MemoButtonForm : Form
{
    public const string ButtonText = "주사 차수";
    public const string XrayText = "엑스레이";

    private const int TickMs = 250;
    private const int WsExToolWindow = 0x00000080;
    private const int WsExNoActivate = 0x08000000;
    private const int WmMouseActivate = 0x0021;
    private const int MaNoActivate = 3;

    /// <summary>시안 .mrow 틈 6px(메모 칸과 단추, 두 단추 사이), .injbtn 양옆 10px·.xrbtn 양옆 9px·모서리 4px, 높이는 메모 칸과 같게(20~40px)</summary>
    private const int BesideGap = 6;
    private const int SidePad = 10;
    private const int XraySidePad = 9;
    private const int Radius = 4;
    private const int MinHeight = 20;
    private const int MaxHeight = 40;

    // 시안 --inj #C9F0D6, --inj-shade #4A9B66, 글 #12361F 12.5px 굵게(→ 9.375pt)
    private static readonly Color Fill = Color.FromArgb(0xC9, 0xF0, 0xD6);
    private static readonly Color Edge = Color.FromArgb(0x4A, 0x9B, 0x66);
    private static readonly Color Ink = Color.FromArgb(0x12, 0x36, 0x1F);
    private static readonly Font ButtonFont = new Font(SlipUi.FontName, 9.375f, FontStyle.Bold);
    // 시안 .xrbtn 바탕 #DBE7F7, 테두리 #7F9CC4, 글 #1D3A63
    private static readonly Color XrayFill = Color.FromArgb(0xDB, 0xE7, 0xF7);
    private static readonly Color XrayEdge = Color.FromArgb(0x7F, 0x9C, 0xC4);
    private static readonly Color XrayInk = Color.FromArgb(0x1D, 0x3A, 0x63);

    private readonly Func<ReceptionScreen?> findScreen;
    private readonly HotKeys hotKeys;
    private readonly Func<string?, string?, DateTime, MemoResult> compute;
    private readonly Func<string?, DateTime, IReadOnlyList<string>, XrayListResult> readXray;
    private readonly XrayListForm xrayList;
    /// <summary>[엑스레이] 창을 띄울 때의 차트번호 칸 글·메모 칸(바뀌면 창을 닫는다)</summary>
    private string? listChart;
    private IntPtr listBox;
    private readonly int injectionWidth;
    private readonly int xrayWidth;
    private readonly SynchronizationContext ui;
    private readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer { Interval = TickMs };
    private readonly NoticeForm notice = new NoticeForm();
    private MemoSettings settings;
    /// <summary>지금 단추 자리(설정 창에서 옮기는 동안은 저장 전 값)</summary>
    private int offset;
    /// <summary>마지막으로 본 메모 칸(설정 창이 맨 앞일 때도 단추 자리를 바로 옮기려고)</summary>
    private Rectangle? lastMemo;
    /// <summary>계산 중(누름이 겹치면 두 번째는 무시)</summary>
    private bool busy;

    /// <param name="findScreen">맨 앞 접수 화면 찾기(ReceptionWindows.FindForeground). 0.25초마다·누를 때 창 스레드에서 부른다</param>
    /// <param name="hotKeys">주사 차수 단축키(접수 화면이 맨 앞일 때만 잡는다). 만들고 없애기는 부르는 쪽</param>
    /// <param name="settings">단축키·단추 자리·찍은 적 없을 때 보여 줄 엑스레이</param>
    /// <param name="compute">[주사 차수]: (차트번호 칸 글, 메모 칸 글, 오늘) → 결과. 백그라운드 스레드에서 부른다(비트 DB 읽기)</param>
    /// <param name="readXray">[엑스레이]: (차트번호 칸 글, 오늘, 찍은 적 없을 때 보여 줄 엑스레이) → 목록. 백그라운드 스레드에서 부른다(비트 DB 읽기)</param>
    public MemoButtonForm(Func<ReceptionScreen?> findScreen, HotKeys hotKeys, MemoSettings settings, Func<string?, string?, DateTime, MemoResult> compute,
        Func<string?, DateTime, IReadOnlyList<string>, XrayListResult> readXray)
    {
        this.findScreen = findScreen ?? throw new ArgumentNullException(nameof(findScreen));
        this.hotKeys = hotKeys ?? throw new ArgumentNullException(nameof(hotKeys));
        this.settings = settings ?? throw new ArgumentNullException(nameof(settings));
        this.compute = compute ?? throw new ArgumentNullException(nameof(compute));
        this.readXray = readXray ?? throw new ArgumentNullException(nameof(readXray));
        offset = settings.ButtonOffsetPx;
        // 컨트롤을 만들면 이 스레드에 WinForms 동기화 문맥이 깔린다(결과를 창 스레드로 돌려보낼 때 쓴다)
        ui = SynchronizationContext.Current ?? new WindowsFormsSynchronizationContext();

        Text = ButtonText;
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        AutoScaleMode = AutoScaleMode.None;
        BackColor = Fill;
        ForeColor = Ink;
        Font = ButtonFont;
        Cursor = Cursors.Hand;
        SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
        injectionWidth = TextRenderer.MeasureText(ButtonText, ButtonFont).Width + SlipUi.S(SidePad * 2) + 2;
        xrayWidth = TextRenderer.MeasureText(XrayText, ButtonFont).Width + SlipUi.S(XraySidePad * 2) + 2;
        Size = new Size(injectionWidth + SlipUi.S(BesideGap) + xrayWidth, SlipUi.S(24));

        xrayList = new XrayListForm(Put);

        timer.Tick += (sender, e) => Follow();
        timer.Start();
    }

    /// <summary>[엑스레이] 목록 창</summary>
    public XrayListForm ListWindow => xrayList;

    /// <summary>지금 쓰는 설정(저장된 값)</summary>
    public MemoSettings Settings => settings;

    /// <summary>계산 중인가(누름이 겹치면 두 번째는 무시한다)</summary>
    public bool Busy => busy;

    /// <summary>설정 창 ◀ ▶: 저장 전에도 단추를 바로 옮겨 보인다(취소하면 저장된 값으로 다시 부른다)</summary>
    public void PreviewOffset(int px)
    {
        offset = px;
        if (lastMemo is Rectangle memo) PlaceBeside(memo);
    }

    /// <summary>설정 저장 뒤: 단추 자리와 단축키를 새 값으로(단축키를 다시 등록한다)</summary>
    public void Apply(MemoSettings next)
    {
        settings = next ?? throw new ArgumentNullException(nameof(next));
        PreviewOffset(next.ButtonOffsetPx);
        var key = HotKeys.KeyOf(next.HotKey);
        if (key != null) hotKeys.ChangeKey(key.Value);
    }

    /// <summary>
    /// [주사 차수]를 눌렀다(단추·단축키, 창 스레드). 계산 중이면 무시. 맨 앞 접수 화면이 없으면 아무것도 안 한다.
    /// 차트번호 칸 글은 받은 그대로 넘긴다(다듬기·환자 없음 판단은 Core).
    /// </summary>
    public void Press() => Run((chart, memo, today) => compute(chart, memo, today));

    /// <summary>
    /// [엑스레이]를 눌렀다(창 스레드). 목록 창이 떠 있으면 닫는다. 아니면 차트번호 칸 글로 백그라운드에서 목록을 읽어(저장된 '찍은 적 없을 때 보여 줄 엑스레이'로)
    /// 창 스레드에서 띄운다. 계산 중이면 무시. 맨 앞 접수 화면이 없으면 아무것도 안 한다.
    /// </summary>
    public void PressXray()
    {
        if (xrayList.Visible)
        {
            CloseList();
            return;
        }
        if (busy || IsDisposed) return;
        var screen = SafeFind();
        if (screen == null) return;

        var chart = screen.ReadChart();
        var box = screen.MemoBox;
        var anchor = screen.MemoBounds() ?? lastMemo;
        var today = DateTime.Today;
        var chosen = settings.XrayParts;
        busy = true;
        ThreadPool.QueueUserWorkItem(_ =>
        {
            XrayListResult result;
            try
            {
                result = readXray(chart, today, chosen);
            }
            catch (Exception)
            {
                result = new XrayListResult(XrayListKind.Failed);
            }
            PostSafely(state => FinishXray((XrayListResult)state!, chart, box, anchor, today), result);
        });
    }

    /// <summary>
    /// 목록 결과(창 스레드): 환자 없음·읽기 실패는 빨강 알림(창 없음). 읽는 동안 맨 앞 접수 화면·메모 칸·차트번호 칸 글이 바뀌었으면 '읽기 실패'.
    /// 같으면 지금 메모 칸에 그 부위 경과 글이 이미 있는 부위를 '넣음'으로 표시해 창을 띄운다.
    /// </summary>
    private void FinishXray(XrayListResult result, string? chart, IntPtr box, Rectangle? anchor, DateTime today)
    {
        try
        {
            if (IsDisposed) return;
            if (result.Kind == XrayListKind.NoPatient)
            {
                notice.ShowAt(anchor, MemoNotices.NoPatient, NoticeTone.Bad);
                return;
            }
            var screen = result.Kind == XrayListKind.Ok ? SafeFind() : null;
            var chartNow = screen?.ReadChart();
            var memoNow = screen?.ReadMemo();
            if (screen == null || screen.MemoBox != box || chartNow == null || memoNow == null || !string.Equals(chartNow, chart, StringComparison.Ordinal))
            {
                notice.ShowAt(anchor, MemoNotices.Failed, NoticeTone.Bad);
                return;
            }
            var already = result.Items.Where(item => MemoCompose.HasXrayFor(memoNow, item.Part)).Select(item => item.Part).ToArray();
            listChart = chart;
            listBox = box;
            notice.Dismiss();
            xrayList.ShowList(screen.MemoBounds() ?? anchor, result.Items, today, already);
        }
        catch (Exception)
        {
            // 창을 못 띄워도 프로그램은 산다(다음 누름은 받는다)
        }
        finally
        {
            PostSafely(_ => busy = false, null);
        }
    }

    /// <summary>
    /// 목록 창 [넣기](창 스레드): 맨 앞 접수 화면의 메모 칸·차트번호 칸이 창을 띄울 때와 같아야 한다(다르면 창을 닫고 안 넣음).
    /// 지금 칸 글로 경과 글을 만들어(MemoCompose.ComposeXrayPart) 칸 끝에 넣는다. 그 부위 경과 글이 이미 있으면 넣지 않고 '넣음'.
    /// 칸이 꽉 참(50자)·잠김·막힘·실패면 '넣지 못함'(빨강, 직접 적을 글). 넣은 뒤 알림은 없다(그 줄이 '넣음 ✓'으로 바뀐다).
    /// </summary>
    private bool Put(XrayItem item)
    {
        try
        {
            var screen = SafeFind();
            var chartNow = screen?.ReadChart();
            if (screen == null || screen.MemoBox != listBox || (chartNow != null && !string.Equals(chartNow, listChart, StringComparison.Ordinal)))
            {
                CloseList();
                return false;
            }
            var anchor = screen.MemoBounds() ?? lastMemo;
            var memo = screen.ReadMemo();
            if (chartNow == null || memo == null)
            {
                notice.ShowAt(anchor, MemoNotices.Failed, NoticeTone.Bad);
                return false;
            }
            var result = MemoCompose.ComposeXrayPart(memo, item.Part, item.Years);
            if (result.Kind == MemoResultKind.XrayAlreadyHas) return true;
            if (result.Kind != MemoResultKind.Insert) return false;
            var typed = MemoTyper.Append(listBox, result.Append);
            if (typed != MemoTypeResult.Typed)
            {
                notice.ShowAt(anchor, MemoNotices.TypeFailed(result.Text), NoticeTone.Bad);
                return false;
            }
            return true;
        }
        catch (Exception)
        {
            return false;
        }
    }

    /// <summary>목록 창을 닫고 띄울 때 본 칸을 잊는다</summary>
    private void CloseList()
    {
        xrayList.HideList();
        listChart = null;
        listBox = IntPtr.Zero;
    }

    private ReceptionScreen? SafeFind()
    {
        try
        {
            return findScreen();
        }
        catch (Exception)
        {
            return null;
        }
    }

    private void Run(Func<string?, string?, DateTime, MemoResult> work)
    {
        if (busy || IsDisposed) return;
        ReceptionScreen? screen;
        try
        {
            screen = findScreen();
        }
        catch (Exception)
        {
            return;
        }
        if (screen == null) return;

        var chart = screen.ReadChart();
        var memo = screen.ReadMemo();
        var box = screen.MemoBox;
        var anchor = screen.MemoBounds() ?? lastMemo;
        var today = DateTime.Today;
        busy = true;
        ThreadPool.QueueUserWorkItem(_ =>
        {
            MemoResult result;
            try
            {
                result = work(chart, memo, today);
            }
            catch (Exception)
            {
                // 무엇이 잘못되든 '읽기 실패' 알림만(예외 글에는 값이 섞일 수 있어 버린다)
                result = new MemoResult(MemoResultKind.Failed);
            }
            PostSafely(state => Finish((MemoResult)state!, chart, memo, box, anchor), result);
        });
    }

    protected override bool ShowWithoutActivation => true;

    protected override CreateParams CreateParams
    {
        get
        {
            var created = base.CreateParams;
            created.ExStyle |= WsExToolWindow | WsExNoActivate;
            return created;
        }
    }

    protected override void WndProc(ref Message m)
    {
        // 눌러도 이 창이 앞으로 오지 않게(비트 접수 화면이 맨 앞으로 남는다)
        if (m.Msg == WmMouseActivate)
        {
            m.Result = (IntPtr)MaNoActivate;
            return;
        }
        base.WndProc(ref m);
    }

    /// <summary>창 안 [주사 차수] 자리(왼쪽)</summary>
    private Rectangle InjectionBox => new Rectangle(0, 0, injectionWidth, Height);

    /// <summary>창 안 [엑스레이] 자리(6px 띄운 오른쪽)</summary>
    private Rectangle XrayBox => new Rectangle(injectionWidth + SlipUi.S(BesideGap), 0, xrayWidth, Height);

    protected override void OnSizeChanged(EventArgs e)
    {
        base.OnSizeChanged(e);
        // 두 단추 모양만 창으로(사이 틈은 비트 화면이 보이고 눌린다)
        using var left = SlipUi.Rounded(InjectionBox, SlipUi.S(Radius));
        using var right = SlipUi.Rounded(XrayBox, SlipUi.S(Radius));
        var shape = new Region(left);
        shape.Union(right);
        var old = Region;
        Region = shape;
        old?.Dispose();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.Clear(Fill);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        DrawButton(g, InjectionBox, ButtonText, Fill, Edge, Ink);
        DrawButton(g, XrayBox, XrayText, XrayFill, XrayEdge, XrayInk);
    }

    private static void DrawButton(Graphics g, Rectangle box, string text, Color fill, Color edge, Color ink)
    {
        using (var path = SlipUi.Rounded(new Rectangle(box.X, box.Y, box.Width - 1, box.Height - 1), SlipUi.S(Radius)))
        using (var brush = new SolidBrush(fill))
        using (var pen = new Pen(edge))
        {
            g.FillPath(brush, path);
            g.DrawPath(pen, path);
        }
        TextRenderer.DrawText(g, text, ButtonFont, box, ink,
            TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine | TextFormatFlags.NoPrefix);
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e);
        if (e.Button != MouseButtons.Left) return;
        if (InjectionBox.Contains(e.Location)) Press();
        else if (XrayBox.Contains(e.Location)) PressXray();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            timer.Dispose();
            notice.Dispose();
            xrayList.Dispose();
        }
        base.Dispose(disposing);
    }

    /// <summary>
    /// 0.25초마다: 접수 화면이 맨 앞이면 메모 칸 옆에 붙고 단축키를 잡는다. 아니면 숨고 단축키를 놓는다.
    /// [엑스레이] 창은 메모 칸을 따라가고, 접수 화면이 맨 앞이 아니거나 메모 칸·차트번호 칸 글이 바뀌면 닫는다.
    /// </summary>
    private void Follow()
    {
        try
        {
            var screen = findScreen();
            hotKeys.Follow(screen != null);
            if (screen != null && screen.MemoBounds() is Rectangle memo)
            {
                lastMemo = memo;
                PlaceBeside(memo);
                if (!Visible) Show();
                FollowList(screen, memo);
                return;
            }
            if (xrayList.Visible) CloseList();
            var front = BitWindows.ReadForeground();
            if (front != null && BitWindows.IsOwnProcess(front)) return;
            if (Visible) Hide();
        }
        catch (Exception)
        {
            // 창 읽기가 한 번 실패해도 단추는 살아 있고 다음 0.25초에 다시 본다
        }
    }

    /// <summary>[엑스레이] 창이 떠 있으면: 메모 칸이 다르거나 차트번호 칸 글이 바뀌면(다른 환자) 닫고, 아니면 메모 칸 아래로 따라간다</summary>
    private void FollowList(ReceptionScreen screen, Rectangle memo)
    {
        if (!xrayList.Visible) return;
        var chartNow = screen.ReadChart();
        if (screen.MemoBox != listBox || (chartNow != null && !string.Equals(chartNow, listChart, StringComparison.Ordinal)))
        {
            CloseList();
            return;
        }
        xrayList.Follow(memo);
    }

    /// <summary>메모 칸 오른쪽 6px + 단추 자리(+는 오른쪽), 위 끝과 높이는 메모 칸에 맞춘다(물리 픽셀)</summary>
    private void PlaceBeside(Rectangle memo)
    {
        var height = Math.Max(SlipUi.S(MinHeight), Math.Min(SlipUi.S(MaxHeight), memo.Height));
        if (Height != height) Height = height;
        var x = memo.Right + SlipUi.S(BesideGap) + offset;
        var y = memo.Top + (memo.Height - height) / 2;
        if (Left != x || Top != y) Location = new Point(x, y);
    }

    /// <summary>
    /// 결과(창 스레드): Insert면 넣기 바로 전에 화면을 다시 본다 — 접수 화면이 맨 앞이 아니거나 메모 칸이 바뀌었거나
    /// 차트번호 칸·메모 칸 글이 계산에 넣었던 글과 하나라도 다르면(읽는 동안 다른 환자를 불러왔거나 메모를 고침) 넣지 않고 '읽기 실패'(빨강).
    /// 같으면 칸 끝에 Append를 넣고 — 들어가면 '넣었어요'(초록), 꽉 참·잠김·막힘·실패면 '넣지 못함'(빨강, 직접 적을 글).
    /// 그 밖은 결과 알림(노랑·빨강, 읽기 실패 글은 늘 빨강). 넣기는 창 스레드에서만(대비 길이 UI Automation이라 STA).
    /// </summary>
    private void Finish(MemoResult result, string? chart, string? memo, IntPtr box, Rectangle? anchor)
    {
        try
        {
            if (IsDisposed) return;
            if (result.Kind == MemoResultKind.Insert)
            {
                if (!SameScreen(chart, memo, box))
                {
                    notice.ShowAt(anchor, MemoNotices.Failed, NoticeTone.Bad);
                    return;
                }
                var typed = MemoTyper.Append(box, result.Append);
                if (typed != MemoTypeResult.Typed)
                {
                    notice.ShowAt(anchor, MemoNotices.TypeFailed(result.Text), NoticeTone.Bad);
                    return;
                }
                notice.ShowAt(anchor, MemoNotices.Of(result), NoticeTone.Ok);
                return;
            }
            var text = MemoNotices.Of(result);
            notice.ShowAt(anchor, text, text == MemoNotices.Failed ? NoticeTone.Bad : NoticeForm.ToneOf(result.Kind));
        }
        catch (Exception)
        {
            // 알림을 못 띄워도 프로그램은 산다(다음 누름은 받는다)
        }
        finally
        {
            // 넣는 동안(창 스레드가 멈춘 사이) 쌓인 단축키는 이 뒤에 오므로 그것까지 무시하고 풀어 준다
            PostSafely(_ => busy = false, null);
        }
    }

    /// <summary>창 스레드로 넘긴다. 읽는 사이 프로그램을 끝내거나 로그오프해 창 스레드가 없어졌으면 조용히 버린다(스레드풀 예외로 오류 창이 뜨지 않게)</summary>
    private void PostSafely(SendOrPostCallback callback, object? state)
    {
        try
        {
            ui.Post(callback, state);
        }
        catch (Exception e) when (e is InvalidOperationException || e is ObjectDisposedException || e is System.ComponentModel.InvalidAsynchronousStateException)
        {
            // 끝나는 중: 넣지도 알리지도 않는다
        }
    }

    /// <summary>넣기 바로 전: 맨 앞 접수 화면의 메모 칸이 그대로이고 두 칸 글이 누를 때 읽은 글과 똑같은가(못 읽으면 다르다고 본다)</summary>
    private bool SameScreen(string? chart, string? memo, IntPtr box)
    {
        ReceptionScreen? screen;
        try
        {
            screen = findScreen();
        }
        catch (Exception)
        {
            return false;
        }
        if (screen == null || screen.MemoBox != box) return false;
        var chartNow = screen.ReadChart();
        var memoNow = screen.ReadMemo();
        return chartNow != null && memoNow != null
            && string.Equals(chartNow, chart, StringComparison.Ordinal)
            && string.Equals(memoNow, memo, StringComparison.Ordinal);
    }
}
