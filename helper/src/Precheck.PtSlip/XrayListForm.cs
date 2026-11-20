using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Linq;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Precheck.Core.InjectionMemo;

namespace Precheck.PtSlip;

/// <summary>
/// [엑스레이] 목록 창(시안 ⑤, AC-7505.4): 비트 '접수메모(당일)' 칸 아래 6px에 뜨는 작은 창. 찍은 부위 줄마다 부위·마지막 날짜·지난 기간,
/// 경과면 노랑 '경과'와 [넣기](넣으면 '넣음 ✓'), 아래에 찍은 적 없는 부위의 작은 단추('&lt;부위&gt; 넣기' → '&lt;부위&gt; ✓'), 바닥에 기한 안내와 [닫기].
/// 테두리 없는 맨 위 창이고 작업 표시줄에 안 나오며 눌러도 포커스를 뺏지 않는다(WS_EX_NOACTIVATE, 비트 접수 화면이 맨 앞으로 남는다).
/// 떠 있는 동안만 Esc를 잡아 닫는다. 넣기 판단·치기는 부르는 쪽(put, MemoButtonForm)이 하고, 이 창은 그리고 누름을 넘기기만 한다.
/// 부위·날짜는 환자 값이라 화면에만 보이고 파일·로그·콘솔에 남기지 않는다. 만든 스레드(창 스레드)에서만 부른다.
/// </summary>
public sealed class XrayListForm : Form
{
    private const int WsExToolWindow = 0x00000080;
    private const int WsExNoActivate = 0x08000000;
    private const int WmMouseActivate = 0x0021;
    private const int MaNoActivate = 3;
    private const int WmHotKey = 0x0312;
    private const uint ModNoRepeat = 0x4000;
    private const uint VkEscape = 0x1B;
    /// <summary>앱 단축키 번호 범위 안, 주사 차수 단축키(0x7A01~)와 겹치지 않게</summary>
    private const int EscId = 0x7BE5;

    // 시안 .xwin 폭 400·모서리 8, .xt 높이 30, .xrows 위아래 4·양옆 10, .xr 줄 30·칸 52/84·틈 8, 단추 높이 24, .xnone 위 6·아래 8, 작은 단추 틈 6, .xfoot 8·10, 칸 아래 6
    private const int FormWidth = 400;
    private const int Radius = 8;
    private const int TitleHeight = 30;
    private const int PadX = 10;
    private const int RowsPadY = 4;
    private const int RowHeight = 30;
    private const int PartWidth = 52;
    private const int DateWidth = 84;
    private const int ColumnGap = 8;
    private const int ButtonHeight = 24;
    private const int ButtonPad = 10;
    private const int ChipPad = 8;
    private const int ChipGap = 6;
    private const int NeverTopPad = 6;
    private const int NeverBottomPad = 8;
    private const int FootPadY = 8;
    private const int DueHeight = 18;
    private const int BelowGap = 6;

    // 시안 색: .xt #DBE7F7/#1D3A63/#B8C9E2, .xwin 테두리 #7F9CC4, 줄 사이 #EDF0F4, .due #FFF4D6/#8A5A00/#E9CF8A, .chip #F5F8FD/#B8C9E2, .chip.done #E7F5EC/#9FD3B2
    private static readonly Color TitleBack = Color.FromArgb(0xDB, 0xE7, 0xF7);
    private static readonly Color TitleInk = Color.FromArgb(0x1D, 0x3A, 0x63);
    private static readonly Color TitleLine = Color.FromArgb(0xB8, 0xC9, 0xE2);
    private static readonly Color Edge = Color.FromArgb(0x7F, 0x9C, 0xC4);
    private static readonly Color RowLine = Color.FromArgb(0xED, 0xF0, 0xF4);
    private static readonly Color DueBack = Color.FromArgb(0xFF, 0xF4, 0xD6);
    private static readonly Color DueInk = Color.FromArgb(0x8A, 0x5A, 0x00);
    private static readonly Color DueEdge = Color.FromArgb(0xE9, 0xCF, 0x8A);
    private static readonly Color ChipBack = Color.FromArgb(0xF5, 0xF8, 0xFD);
    private static readonly Color OkBack = Color.FromArgb(0xE7, 0xF5, 0xEC);
    private static readonly Color OkEdge = Color.FromArgb(0x9F, 0xD3, 0xB2);

    // 시안 글 크기(px → pt ×0.75): 13px 본문·굵은 부위·제목, 12.5px 단추, 12px 작은 제목, 11.5px 경과·바닥 안내
    private static readonly Font TitleFont = new Font(SlipUi.FontName, 9.75f, FontStyle.Bold);
    private static readonly Font PartFont = new Font(SlipUi.FontName, 9.75f, FontStyle.Bold);
    private static readonly Font BodyFont = new Font(SlipUi.FontName, 9.75f);
    private static readonly Font ButtonFont = new Font(SlipUi.FontName, 9.375f, FontStyle.Bold);
    private static readonly Font ChipFont = new Font(SlipUi.FontName, 9.375f);
    private static readonly Font HeadFont = new Font(SlipUi.FontName, 9f);
    private static readonly Font SmallBold = new Font(SlipUi.FontName, 8.625f, FontStyle.Bold);
    private static readonly Font FootFont = new Font(SlipUi.FontName, 8.625f);

    private const TextFormatFlags OneLine = TextFormatFlags.NoPrefix | TextFormatFlags.SingleLine | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding;
    private const TextFormatFlags Centered = OneLine | TextFormatFlags.HorizontalCenter;
    private const TextFormatFlags Wrapped = TextFormatFlags.NoPrefix | TextFormatFlags.WordBreak | TextFormatFlags.NoPadding;

    private readonly Func<XrayItem, bool> put;
    private readonly HashSet<string> done = new HashSet<string>(StringComparer.Ordinal);
    private readonly List<RowBox> rows = new List<RowBox>();
    private readonly List<ChipBox> chips = new List<ChipBox>();
    private IReadOnlyList<XrayItem> items = Array.Empty<XrayItem>();
    private DateTime today;
    private Rectangle crossBox;
    private Rectangle closeBox;
    private Rectangle emptyBox;
    private Rectangle neverHead;
    private Rectangle footText;
    private int neverTop = -1;
    private int footTop;
    private bool escGrabbed;

    /// <param name="put">[넣기]·작은 단추를 눌렀다(창 스레드): 메모 칸에 넣었거나 이미 있으면 true(그 줄을 '넣음'으로), 못 넣었으면 false(알림은 부르는 쪽)</param>
    public XrayListForm(Func<XrayItem, bool> put)
    {
        this.put = put ?? throw new ArgumentNullException(nameof(put));
        Text = MemoNotices.XrayTitle;
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        AutoScaleMode = AutoScaleMode.None;
        BackColor = Color.White;
        SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
    }

    /// <summary>지금 보이는 목록(닫으면 빈 목록)</summary>
    public IReadOnlyList<XrayItem> Items => items;

    /// <summary>그 부위를 넣었다고 표시했나</summary>
    public bool IsDone(string part) => done.Contains(part);

    /// <summary>창 안 그 부위의 [넣기]·작은 단추 자리(누를 수 없으면 null)</summary>
    public Rectangle? PutBoxOf(string part)
    {
        foreach (var row in rows)
        {
            if (row.Item.Part == part && !row.Button.IsEmpty) return row.Button;
        }
        foreach (var chip in chips)
        {
            if (chip.Item.Part == part && !chip.Done) return chip.Box;
        }
        return null;
    }

    /// <summary>창 안 [닫기] 자리</summary>
    public Rectangle CloseBox => closeBox;

    /// <summary>창 안 ✕ 자리</summary>
    public Rectangle CrossBox => crossBox;

    /// <summary>목록을 보인다(이미 떠 있으면 바꾼다). already는 처음부터 '넣음'으로 보일 부위(칸에 그 부위 경과 글이 이미 있음).</summary>
    public void ShowList(Rectangle? anchor, IReadOnlyList<XrayItem> list, DateTime day, IEnumerable<string>? already)
    {
        items = list ?? Array.Empty<XrayItem>();
        today = day.Date;
        done.Clear();
        foreach (var part in already ?? Array.Empty<string>()) done.Add(part);
        Relayout();
        Place(anchor);
        Invalidate();
        if (!Visible) Show();
        GrabEsc();
    }

    /// <summary>메모 칸을 따라 자리를 옮긴다(0.25초마다, 떠 있을 때만)</summary>
    public void Follow(Rectangle? anchor)
    {
        if (Visible) Place(anchor);
    }

    /// <summary>닫는다([닫기]·✕·Esc·차트번호가 바뀜·접수 화면이 맨 앞이 아님·[엑스레이]를 다시 누름)</summary>
    public void HideList()
    {
        ReleaseEsc();
        if (Visible) Hide();
        items = Array.Empty<XrayItem>();
        done.Clear();
        rows.Clear();
        chips.Clear();
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
        if (m.Msg == WmHotKey && m.WParam.ToInt64() == EscId)
        {
            HideList();
            return;
        }
        base.WndProc(ref m);
    }

    protected override void OnVisibleChanged(EventArgs e)
    {
        base.OnVisibleChanged(e);
        if (!Visible) ReleaseEsc();
    }

    protected override void OnSizeChanged(EventArgs e)
    {
        base.OnSizeChanged(e);
        using var path = SlipUi.Rounded(new Rectangle(0, 0, Width, Height), SlipUi.S(Radius));
        var old = Region;
        Region = new Region(path);
        old?.Dispose();
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e);
        if (e.Button != MouseButtons.Left) return;
        if (crossBox.Contains(e.Location) || closeBox.Contains(e.Location))
        {
            HideList();
            return;
        }
        foreach (var row in rows)
        {
            if (!row.Button.IsEmpty && row.Button.Contains(e.Location))
            {
                Try(row.Item);
                return;
            }
        }
        foreach (var chip in chips)
        {
            if (!chip.Done && chip.Box.Contains(e.Location))
            {
                Try(chip.Item);
                return;
            }
        }
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        base.OnMouseMove(e);
        var onButton = crossBox.Contains(e.Location) || closeBox.Contains(e.Location)
            || rows.Any(row => !row.Button.IsEmpty && row.Button.Contains(e.Location))
            || chips.Any(chip => !chip.Done && chip.Box.Contains(e.Location));
        var cursor = onButton ? Cursors.Hand : Cursors.Default;
        if (Cursor != cursor) Cursor = cursor;
    }

    protected override void Dispose(bool disposing)
    {
        ReleaseEsc();
        base.Dispose(disposing);
    }

    private void Try(XrayItem item)
    {
        bool ok;
        try
        {
            ok = put(item);
        }
        catch (Exception)
        {
            ok = false;
        }
        // 넣는 사이 다른 환자를 불러와 창이 닫혔으면 그대로 둔다
        if (!ok || !Visible) return;
        done.Add(item.Part);
        Relayout();
        Invalidate();
    }

    private void GrabEsc()
    {
        if (escGrabbed || !IsHandleCreated) return;
        escGrabbed = RegisterHotKey(Handle, EscId, ModNoRepeat, VkEscape);
    }

    private void ReleaseEsc()
    {
        if (!escGrabbed) return;
        if (IsHandleCreated) UnregisterHotKey(Handle, EscId);
        escGrabbed = false;
    }

    private static int ButtonWidth(string text, Font font) => TextRenderer.MeasureText(text, font, Size.Empty, OneLine).Width + SlipUi.S(ButtonPad * 2) + 2;

    /// <summary>줄·작은 단추·바닥 자리를 다시 잰다(넣을 때마다 글 폭이 바뀐다)</summary>
    private void Relayout()
    {
        rows.Clear();
        chips.Clear();
        var width = SlipUi.S(FormWidth);
        var inner = width - SlipUi.S(PadX * 2);
        var shot = items.Where(item => item.Last != null).ToList();
        var never = items.Where(item => item.Last == null).ToList();
        crossBox = new Rectangle(width - SlipUi.S(TitleHeight), 0, SlipUi.S(TitleHeight), SlipUi.S(TitleHeight));
        var y = SlipUi.S(TitleHeight);

        emptyBox = Rectangle.Empty;
        if (shot.Count > 0 || never.Count == 0)
        {
            y += SlipUi.S(RowsPadY);
            if (shot.Count == 0)
            {
                emptyBox = new Rectangle(SlipUi.S(PadX), y, inner, SlipUi.S(RowHeight));
                y += SlipUi.S(RowHeight);
            }
            foreach (var item in shot)
            {
                var bounds = new Rectangle(SlipUi.S(PadX), y, inner, SlipUi.S(RowHeight));
                var button = Rectangle.Empty;
                if (item.Overdue && !done.Contains(item.Part))
                {
                    var w = ButtonWidth(MemoNotices.XrayPut, ButtonFont);
                    button = new Rectangle(bounds.Right - w, y + (SlipUi.S(RowHeight) - SlipUi.S(ButtonHeight)) / 2, w, SlipUi.S(ButtonHeight));
                }
                rows.Add(new RowBox(item, bounds, button));
                y += SlipUi.S(RowHeight);
            }
            y += SlipUi.S(RowsPadY);
        }

        neverTop = -1;
        if (never.Count > 0)
        {
            neverTop = y;
            y += SlipUi.S(NeverTopPad);
            // 줄 높이는 글꼴 높이로(세로 가운데·여백 없음으로 재면 낮게 나와 글 위가 잘린다)
            var headHeight = HeadFont.Height;
            neverHead = new Rectangle(SlipUi.S(PadX), y, inner, headHeight);
            y += headHeight + SlipUi.S(6);
            var x = SlipUi.S(PadX);
            foreach (var item in never)
            {
                var on = done.Contains(item.Part);
                var text = on ? MemoNotices.XrayChipDone(item.Part) : MemoNotices.XrayChip(item.Part);
                var w = TextRenderer.MeasureText(text, on ? ButtonFont : ChipFont, Size.Empty, OneLine).Width + SlipUi.S(ChipPad * 2) + 2;
                if (x > SlipUi.S(PadX) && x + w > width - SlipUi.S(PadX))
                {
                    x = SlipUi.S(PadX);
                    y += SlipUi.S(ButtonHeight) + SlipUi.S(ChipGap);
                }
                chips.Add(new ChipBox(item, new Rectangle(x, y, w, SlipUi.S(ButtonHeight)), on, text));
                x += w + SlipUi.S(ChipGap);
            }
            y += SlipUi.S(ButtonHeight) + SlipUi.S(NeverBottomPad);
        }

        footTop = y;
        var closeWidth = ButtonWidth(MemoNotices.XrayClose, ButtonFont);
        var hintWidth = inner - closeWidth - SlipUi.S(8);
        var hint = TextRenderer.MeasureText(MemoNotices.XrayFoot, FootFont, new Size(hintWidth, 0), Wrapped);
        var footHeight = Math.Max(hint.Height, SlipUi.S(ButtonHeight)) + SlipUi.S(FootPadY * 2);
        footText = new Rectangle(SlipUi.S(PadX), y + (footHeight - hint.Height) / 2, hintWidth, hint.Height);
        closeBox = new Rectangle(width - SlipUi.S(PadX) - closeWidth, y + (footHeight - SlipUi.S(ButtonHeight)) / 2, closeWidth, SlipUi.S(ButtonHeight));
        y += footHeight;
        Size = new Size(width, y);
    }

    /// <summary>메모 칸 왼쪽 아래 6px, 화면 아래로 넘치면 칸 위로. 칸 자리를 모르면 마우스 옆</summary>
    private void Place(Rectangle? anchor)
    {
        var box = anchor ?? new Rectangle(Cursor.Position, new Size(1, 1));
        var area = Screen.FromRectangle(box).WorkingArea;
        var x = box.Left;
        var y = box.Bottom + SlipUi.S(BelowGap);
        if (y + Height > area.Bottom) y = box.Top - SlipUi.S(BelowGap) - Height;
        x = Math.Max(area.Left, Math.Min(x, area.Right - Width));
        y = Math.Max(area.Top, Math.Min(y, area.Bottom - Height));
        if (Left != x || Top != y) Location = new Point(x, y);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.Clear(Color.White);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        var width = Width;

        // 제목 줄
        using (var back = new SolidBrush(TitleBack)) g.FillRectangle(back, 0, 0, width, SlipUi.S(TitleHeight));
        using (var line = new Pen(TitleLine)) g.DrawLine(line, 0, SlipUi.S(TitleHeight) - 1, width, SlipUi.S(TitleHeight) - 1);
        TextRenderer.DrawText(g, MemoNotices.XrayTitle, TitleFont, new Rectangle(SlipUi.S(PadX), 0, width, SlipUi.S(TitleHeight)), TitleInk, OneLine);
        TextRenderer.DrawText(g, "✕", BodyFont, crossBox, TitleInk, Centered);

        if (!emptyBox.IsEmpty) TextRenderer.DrawText(g, MemoNotices.XrayEmpty, BodyFont, emptyBox, SlipUi.Sub, OneLine);

        using (var rowLine = new Pen(RowLine))
        {
            for (var i = 0; i < rows.Count; i++)
            {
                var row = rows[i];
                var r = row.Bounds;
                if (i > 0) g.DrawLine(rowLine, r.Left, r.Top, r.Right, r.Top);
                var x = r.Left;
                TextRenderer.DrawText(g, row.Item.Part, PartFont, new Rectangle(x, r.Top, SlipUi.S(PartWidth), r.Height), SlipUi.Ink, OneLine);
                x += SlipUi.S(PartWidth + ColumnGap);
                TextRenderer.DrawText(g, MemoNotices.XrayDate(row.Item.Last!.Value), BodyFont, new Rectangle(x, r.Top, SlipUi.S(DateWidth), r.Height), SlipUi.Sub, OneLine);
                x += SlipUi.S(DateWidth + ColumnGap);
                var ago = XrayList.AgoText(row.Item.Last.Value, today);
                var agoWidth = TextRenderer.MeasureText(ago, BodyFont, Size.Empty, OneLine).Width;
                TextRenderer.DrawText(g, ago, BodyFont, new Rectangle(x, r.Top, agoWidth + 2, r.Height), SlipUi.Ink, OneLine);
                if (row.Item.Overdue)
                {
                    var markWidth = TextRenderer.MeasureText(MemoNotices.XrayDueMark, SmallBold, Size.Empty, OneLine).Width + SlipUi.S(12) + 2;
                    var mark = new Rectangle(x + agoWidth + SlipUi.S(6), r.Top + (r.Height - SlipUi.S(DueHeight)) / 2, markWidth, SlipUi.S(DueHeight));
                    Pill(g, mark, SlipUi.S(DueHeight) / 2, DueBack, DueEdge);
                    TextRenderer.DrawText(g, MemoNotices.XrayDueMark, SmallBold, mark, DueInk, Centered);
                    if (!row.Button.IsEmpty)
                    {
                        Pill(g, row.Button, SlipUi.S(4), Color.White, Edge);
                        TextRenderer.DrawText(g, MemoNotices.XrayPut, ButtonFont, row.Button, TitleInk, Centered);
                    }
                    else if (done.Contains(row.Item.Part))
                    {
                        TextRenderer.DrawText(g, MemoNotices.XrayPutDone, ButtonFont, r, SlipUi.Ok, OneLine | TextFormatFlags.Right);
                    }
                }
            }

            if (neverTop >= 0)
            {
                g.DrawLine(rowLine, 0, neverTop, width, neverTop);
                TextRenderer.DrawText(g, MemoNotices.XrayNeverHeading, HeadFont, neverHead, SlipUi.Sub, OneLine);
                foreach (var chip in chips)
                {
                    Pill(g, chip.Box, SlipUi.S(ButtonHeight) / 2, chip.Done ? OkBack : ChipBack, chip.Done ? OkEdge : TitleLine);
                    TextRenderer.DrawText(g, chip.Text, chip.Done ? ButtonFont : ChipFont, chip.Box, chip.Done ? SlipUi.Ok : TitleInk, Centered);
                }
            }
        }

        // 바닥
        using (var foot = new SolidBrush(SlipUi.FootBack)) g.FillRectangle(foot, 0, footTop, width, Height - footTop);
        using (var line = new Pen(SlipUi.Line)) g.DrawLine(line, 0, footTop, width, footTop);
        TextRenderer.DrawText(g, MemoNotices.XrayFoot, FootFont, footText, SlipUi.Sub, Wrapped);
        Pill(g, closeBox, SlipUi.S(4), Color.White, Edge);
        TextRenderer.DrawText(g, MemoNotices.XrayClose, ButtonFont, closeBox, TitleInk, Centered);

        using (var path = SlipUi.Rounded(new Rectangle(0, 0, width - 1, Height - 1), SlipUi.S(Radius)))
        using (var pen = new Pen(Edge))
        {
            g.DrawPath(pen, path);
        }
    }

    private static void Pill(Graphics g, Rectangle box, int radius, Color fill, Color edge)
    {
        using var path = SlipUi.Rounded(new Rectangle(box.X, box.Y, box.Width - 1, box.Height - 1), radius);
        using var brush = new SolidBrush(fill);
        using var pen = new Pen(edge);
        g.FillPath(brush, path);
        g.DrawPath(pen, path);
    }

    private sealed class RowBox
    {
        public RowBox(XrayItem item, Rectangle bounds, Rectangle button)
        {
            Item = item;
            Bounds = bounds;
            Button = button;
        }

        public XrayItem Item { get; }

        public Rectangle Bounds { get; }

        public Rectangle Button { get; }
    }

    private sealed class ChipBox
    {
        public ChipBox(XrayItem item, Rectangle box, bool done, string text)
        {
            Item = item;
            Box = box;
            Done = done;
            Text = text;
        }

        public XrayItem Item { get; }

        public Rectangle Box { get; }

        public bool Done { get; }

        public string Text { get; }
    }

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool RegisterHotKey(IntPtr hwnd, int id, uint modifiers, uint virtualKey);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UnregisterHotKey(IntPtr hwnd, int id);
}
