using System;
using System.Drawing;
using System.Windows.Forms;
using Precheck.Core.PtSlip;

namespace Precheck.PtSlip;

/// <summary>
/// 비트 창에 붙는 [서류] [PT 먼저] 두 단추(PT 종이 시안 ①·서류 시안 ①, AC-6403.3·AC-7406.3). 테두리 없는 맨 위 작은 창 하나에
/// 두 단추를 그리고(사이 틈은 창 모양에서 빼서 비트가 보인다), 작업 표시줄에 안 나오며, 눌러도 비트에서 초점을 뺏지 않는다(WS_EX_NOACTIVATE).
/// 0.25초마다 맨 앞 비트 창을 보고 그 오른쪽 위에 붙는다: [PT 먼저] 자리는 Core SlipButton.Place 그대로, [서류]는 그 왼쪽에 붙어
/// 같이 움직이고 같이 숨는다. 비트 판단은 SlipButton.IsBitProcess. 비트가 맨 앞이 아니면 숨는다(이 프로그램 창이 맨 앞이면 그대로 둔다).
/// [PT 먼저]를 누르면 고르는 창, [서류]를 누르면 DocsClicked만 일으킨다. 오른쪽 클릭은 두 단추 모두 `설정`·`끝내기`.
/// </summary>
public sealed class ButtonForm : Form
{
    public const string ButtonText = "PT 먼저";
    public const string DocsText = "서류";

    private const int TickMs = 250;
    private const int WsExToolWindow = 0x00000080;
    private const int WsExNoActivate = 0x08000000;
    private const int WmMouseActivate = 0x0021;
    private const int MaNoActivate = 3;

    private static readonly Color Yellow = Color.FromArgb(0xFF, 0xD2, 0x3F);
    private static readonly Color Shade = Color.FromArgb(0xC9, 0xA6, 0x32);
    /// <summary>서류 시안 .topbtn.doc: 연한 파랑 바탕, 글은 [PT 먼저]와 같은 진한 색</summary>
    private static readonly Color DocsBlue = Color.FromArgb(0xBF, 0xE0, 0xFF);
    private static readonly Color DocsShade = Color.FromArgb(0x8D, 0xB4, 0xDB);
    private static readonly Font ButtonFont = new Font(SlipUi.FontName, 9.75f, FontStyle.Bold);

    private readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer { Interval = TickMs };
    private readonly ContextMenuStrip menu = new ContextMenuStrip();
    private readonly NameSource names = new NameSource();
    private SlipSettings settings;
    /// <summary>지금 버튼 자리(설정 창에서 옮기는 동안은 저장 전 값)</summary>
    private int offset;
    /// <summary>마지막으로 본 비트 창(설정 창이 맨 앞일 때도 버튼 자리를 바로 옮기려고)</summary>
    private Rectangle? lastBit;
    private PickForm? pick;
    private SettingsForm? settingsForm;
    /// <summary>창 안 두 단추 자리(창 왼쪽 위 기준 px): [서류] 왼쪽, 틈 6, [PT 먼저] 오른쪽</summary>
    private readonly Rectangle docsBox;
    private readonly Rectangle ptBox;

    public ButtonForm()
        : this(LoadSettings())
    {
    }

    public ButtonForm(SlipSettings settings)
    {
        this.settings = settings ?? throw new ArgumentNullException(nameof(settings));
        offset = settings.ButtonOffsetPx;

        Text = ButtonText;
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        AutoScaleMode = AutoScaleMode.None;
        BackColor = Yellow;
        ForeColor = SlipUi.Ink;
        Font = ButtonFont;
        Cursor = Cursors.Hand;
        SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
        // 시안 .topbtn: 높이 26, 양옆 12, [서류] 오른쪽 틈 6
        var height = SlipUi.S(26);
        var docsWidth = TextRenderer.MeasureText(DocsText, ButtonFont).Width + SlipUi.S(24);
        var ptWidth = TextRenderer.MeasureText(ButtonText, ButtonFont).Width + SlipUi.S(24);
        docsBox = new Rectangle(0, 0, docsWidth, height);
        ptBox = new Rectangle(docsWidth + SlipUi.S(6), 0, ptWidth, height);
        Size = new Size(ptBox.Right, height);

        menu.Items.Add("설정", null, (sender, e) => OpenSettings(null));
        menu.Items.Add("끝내기", null, (sender, e) => Application.Exit());
        ContextMenuStrip = menu;

        timer.Tick += (sender, e) => Follow();
        timer.Start();
    }

    /// <summary>[서류]를 눌렀다(창 열기는 받는 쪽이 한다)</summary>
    public event EventHandler? DocsClicked;

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
        // 두 단추 모양만 창으로 남긴다(사이 틈은 비트가 보이고 눌러도 비트로 간다). 자리를 아직 안 정했으면 창 전체 한 덩이
        var region = new Region(Rectangle.Empty);
        foreach (var box in ptBox.IsEmpty ? new[] { new Rectangle(0, 0, Width, Height) } : new[] { docsBox, ptBox })
        {
            using var path = SlipUi.Rounded(box, SlipUi.S(6));
            region.Union(path);
        }
        var old = Region;
        Region = region;
        old?.Dispose();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.Clear(Yellow);
        PaintButton(g, docsBox, DocsText, DocsBlue, DocsShade);
        PaintButton(g, ptBox, ButtonText, Yellow, Shade);
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e);
        if (e.Button != MouseButtons.Left) return;
        if (docsBox.Contains(e.Location)) DocsClicked?.Invoke(this, EventArgs.Empty);
        else if (ptBox.Contains(e.Location)) OpenPick();
    }

    /// <summary>단추 하나: 바탕, 아래 그늘 선(시안 box-shadow 0 1px), 가운데 굵은 글</summary>
    private static void PaintButton(Graphics g, Rectangle box, string text, Color fill, Color shade)
    {
        if (box.IsEmpty) return;
        using (var brush = new SolidBrush(fill))
        {
            g.FillRectangle(brush, box);
        }
        using (var pen = new Pen(shade))
        {
            g.DrawLine(pen, box.Left, box.Bottom - 1, box.Right, box.Bottom - 1);
        }
        TextRenderer.DrawText(g, text, ButtonFont, box, SlipUi.Ink,
            TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine | TextFormatFlags.NoPrefix);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            timer.Dispose();
            menu.Dispose();
        }
        base.Dispose(disposing);
    }

    /// <summary>설정 파일을 읽는다. 없거나 깨졌거나 못 읽으면 기본값(AC-6401.1·AC-6401.3).</summary>
    private static SlipSettings LoadSettings()
    {
        string? text;
        try
        {
            text = SettingsFile.ReadText();
        }
        catch (Exception)
        {
            text = null;
        }
        return SlipSettingsRules.FromJson(text);
    }

    /// <summary>0.25초마다: 맨 앞 비트 창에 붙거나, 비트가 맨 앞이 아니면 숨는다.</summary>
    private void Follow()
    {
        try
        {
            var bit = BitWindows.FindBitWindow(SlipButton.IsBitProcess);
            if (bit != null)
            {
                lastBit = bit.Bounds;
                PlaceOn(bit.Bounds);
                if (!Visible) Show();
                return;
            }
            var front = BitWindows.ReadForeground();
            if (front != null && BitWindows.IsOwnProcess(front)) return;
            if (Visible) Hide();
        }
        catch (Exception)
        {
            // 창 읽기가 한 번 실패해도 버튼은 살아 있고 다음 0.25초에 다시 본다
        }
    }

    /// <summary>[PT 먼저]는 지금까지와 같은 자리(SlipButton.Place), 창은 [서류]만큼 더 왼쪽에서 시작한다</summary>
    private void PlaceOn(Rectangle bit)
    {
        var (x, y) = SlipButton.Place(bit.Right, bit.Top, ptBox.Width, offset);
        x -= ptBox.Left;
        if (Left != x || Top != y) Location = new Point(x, y);
    }

    /// <summary>설정 창의 ◀ ▶: 저장 전에도 두 단추를 바로 함께 옮겨 보인다.</summary>
    private void MoveButton(int px)
    {
        offset = px;
        if (lastBit is Rectangle bit) PlaceOn(bit);
    }

    private void OpenPick()
    {
        // 옛 창(앞 환자 번호·이름·고른 것이 남은 창)은 다시 띄우지 않고 닫는다. 늘 빈 새 창으로 시작해야 다른 환자 종이가 나가지 않는다(검토 지적)
        if (pick != null && !pick.IsDisposed)
        {
            var old = pick;
            pick = null;
            old.Close();
        }
        var form = new PickForm(settings, names.Find, OpenSettings);
        form.FormClosed += (sender, e) =>
        {
            if (ReferenceEquals(pick, form)) pick = null;
        };
        pick = form;
        form.Show();
        form.Activate();
    }

    /// <summary>설정 창(하나만). 저장하면 새 설정을 버튼·열린 고르는 창에 바로 쓴다.</summary>
    private void OpenSettings(IWin32Window? owner)
    {
        if (settingsForm != null && !settingsForm.IsDisposed)
        {
            settingsForm.Activate();
            return;
        }
        using var form = new SettingsForm(settings, MoveButton);
        settingsForm = form;
        try
        {
            if (owner == null) form.ShowDialog();
            else form.ShowDialog(owner);
        }
        finally
        {
            settingsForm = null;
        }
        if (form.Saved != null)
        {
            settings = form.Saved;
            if (pick != null && !pick.IsDisposed) pick.ApplySettings(settings);
        }
        MoveButton(settings.ButtonOffsetPx);
    }
}
