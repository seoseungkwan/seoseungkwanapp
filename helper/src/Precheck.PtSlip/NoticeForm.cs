using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;
using Precheck.Core.InjectionMemo;

namespace Precheck.PtSlip;

/// <summary>알림 색(시안 .toast): 초록 = 넣음, 노랑 = 안 넣음(기록 쪽 이유), 빨강 = 환자 없음·읽기 실패·넣지 못함</summary>
public enum NoticeTone
{
    Ok,
    Warn,
    Bad,
}

/// <summary>
/// [주사 차수] 결과 알림(시안 ③, AC-7503.3): '접수메모(당일)' 칸 아래 작은 상자, 2~3초 뒤 저절로 사라진다.
/// 테두리 없는 맨 위 창이고 작업 표시줄에 안 나오며 포커스를 뺏지 않는다(WS_EX_NOACTIVATE, 눌러도 비트가 맨 앞으로 남고 상자만 닫힌다).
/// 글은 Core MemoNotices가 고른 시안 글 그대로다. 환자 값·메모 글이 들 수 있어 화면에만 보이고 파일·로그·콘솔에 남기지 않는다.
/// 만든 스레드(창 스레드)에서만 부른다.
/// </summary>
public sealed class NoticeForm : Form
{
    /// <summary>넣었을 때는 2.5초, 안 넣었거나 못 넣었을 때는 3초(직접 적을 글을 읽을 틈)</summary>
    public const int OkMs = 2500;
    public const int OtherMs = 3000;

    private const int WsExToolWindow = 0x00000080;
    private const int WsExNoActivate = 0x08000000;
    private const int WmMouseActivate = 0x0021;
    private const int MaNoActivate = 3;

    /// <summary>시안 .toast: 안쪽 여백 8·12, 아이콘과 글 사이 8, 모서리 6, 칸 아래 8. 글이 이보다 길면 줄을 바꾼다</summary>
    private const int PadX = 12;
    private const int PadY = 8;
    private const int IconGap = 8;
    private const int Radius = 6;
    private const int BelowGap = 8;
    private const int MaxTextWidth = 560;

    private const TextFormatFlags Flags = TextFormatFlags.NoPrefix | TextFormatFlags.NoPadding | TextFormatFlags.WordBreak;

    // 시안 13.5px(→ 10.125pt), 아이콘만 굵게
    private static readonly Font TextFont = new Font(SlipUi.FontName, 10.125f);
    private static readonly Font IconFont = new Font(SlipUi.FontName, 10.125f, FontStyle.Bold);

    private readonly Timer timer = new Timer();
    private NoticeTone tone = NoticeTone.Ok;
    private string message = "";
    private Size textSize;
    private int iconWidth;

    public NoticeForm()
    {
        Text = "주사 차수 알림";
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        AutoScaleMode = AutoScaleMode.None;
        SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
        timer.Tick += (sender, e) => Dismiss();
    }

    /// <summary>지금 보이는(마지막으로 보인) 알림 글</summary>
    public string Message => message;

    /// <summary>지금 알림 색</summary>
    public NoticeTone Tone => tone;

    /// <summary>결과 종류 → 색(넣지 못함은 부르는 쪽이 Bad를 준다)</summary>
    public static NoticeTone ToneOf(MemoResultKind kind)
    {
        switch (kind)
        {
            case MemoResultKind.Insert:
                return NoticeTone.Ok;
            case MemoResultKind.NoRecord:
            case MemoResultKind.Finished:
            case MemoResultKind.TooEarly:
            case MemoResultKind.AlreadyHas:
                return NoticeTone.Warn;
            default:
                return NoticeTone.Bad;
        }
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

    /// <summary>
    /// 알림을 보인다(이미 떠 있으면 글을 바꾸고 시간을 다시 잰다). 자리는 메모 칸(물리 픽셀) 왼쪽 아래 8px,
    /// 화면 아래로 넘치면 칸 위로. 칸 자리를 모르면 마우스 옆.
    /// </summary>
    public void ShowAt(Rectangle? anchor, string text, NoticeTone noticeTone)
    {
        message = text ?? "";
        tone = noticeTone;
        Measure();
        Place(anchor);
        Invalidate();
        if (!Visible) Show();
        timer.Stop();
        timer.Interval = tone == NoticeTone.Ok ? OkMs : OtherMs;
        timer.Start();
    }

    protected override void WndProc(ref Message m)
    {
        // 눌러도 이 창이 앞으로 오지 않게(비트가 맨 앞으로 남는다)
        if (m.Msg == WmMouseActivate)
        {
            m.Result = (IntPtr)MaNoActivate;
            return;
        }
        base.WndProc(ref m);
    }

    protected override void OnSizeChanged(EventArgs e)
    {
        base.OnSizeChanged(e);
        using var path = SlipUi.Rounded(new Rectangle(0, 0, Width, Height), SlipUi.S(Radius));
        var old = Region;
        Region = new Region(path);
        old?.Dispose();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var (back, ink, edge) = Colors(tone);
        var g = e.Graphics;
        g.Clear(back);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        using (var path = SlipUi.Rounded(new Rectangle(0, 0, Width - 1, Height - 1), SlipUi.S(Radius)))
        using (var pen = new Pen(edge))
        {
            g.DrawPath(pen, path);
        }
        var left = SlipUi.S(PadX);
        var top = SlipUi.S(PadY);
        TextRenderer.DrawText(g, GlyphOf(tone), IconFont, new Rectangle(left, top, iconWidth + SlipUi.S(IconGap), textSize.Height), ink, Flags);
        TextRenderer.DrawText(g, message, TextFont, new Rectangle(left + iconWidth + SlipUi.S(IconGap), top, textSize.Width, textSize.Height), ink, Flags);
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e);
        Dismiss();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) timer.Dispose();
        base.Dispose(disposing);
    }

    /// <summary>시안 색: ok #E7F5EC/#137A3A/#9FD3B2, warn #FFF4D6/#8A5A00/#E9CF8A, bad #FDECEC/#C62828/#F0B4B4</summary>
    private static (Color Back, Color Ink, Color Edge) Colors(NoticeTone tone)
    {
        switch (tone)
        {
            case NoticeTone.Ok:
                return (Color.FromArgb(0xE7, 0xF5, 0xEC), SlipUi.Ok, Color.FromArgb(0x9F, 0xD3, 0xB2));
            case NoticeTone.Warn:
                return (Color.FromArgb(0xFF, 0xF4, 0xD6), Color.FromArgb(0x8A, 0x5A, 0x00), Color.FromArgb(0xE9, 0xCF, 0x8A));
            default:
                return (SlipUi.BadSoft, SlipUi.Bad, Color.FromArgb(0xF0, 0xB4, 0xB4));
        }
    }

    private static string GlyphOf(NoticeTone tone) => tone == NoticeTone.Ok ? "✓" : tone == NoticeTone.Warn ? "!" : "×";

    private void Measure()
    {
        // 글자 하나만 재면 고정 여백이 붙어 아이콘과 글 사이가 시안(8px)보다 벌어진다: 두 글자 폭 − 한 글자 폭 = 실제 글자 폭
        // (한 줄로 잰다: 줄바꿈을 켜면 '××'가 두 줄로 갈려 폭이 한 글자와 같아진다)
        const TextFormatFlags singleLine = (Flags & ~TextFormatFlags.WordBreak) | TextFormatFlags.SingleLine;
        var glyph = GlyphOf(tone);
        var single = TextRenderer.MeasureText(glyph, IconFont, Size.Empty, singleLine);
        iconWidth = Math.Max(1, Math.Min(single.Width, TextRenderer.MeasureText(glyph + glyph, IconFont, Size.Empty, singleLine).Width - single.Width));
        var line = TextRenderer.MeasureText(message, TextFont, Size.Empty, singleLine);
        textSize = line.Width <= SlipUi.S(MaxTextWidth)
            ? line
            : TextRenderer.MeasureText(message, TextFont, new Size(SlipUi.S(MaxTextWidth), 0), Flags);
        var height = Math.Max(textSize.Height, single.Height);
        textSize = new Size(textSize.Width, height);
        Size = new Size(SlipUi.S(PadX) * 2 + iconWidth + SlipUi.S(IconGap) + textSize.Width, SlipUi.S(PadY) * 2 + height);
    }

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

    /// <summary>바로 숨긴다(눌렀을 때·시간이 지났을 때, 새 결과로 아래 알림을 치울 때).</summary>
    public void Dismiss()
    {
        timer.Stop();
        if (Visible) Hide();
    }
}
