using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Threading.Tasks;
using System.Windows.Forms;
using Precheck.Core.PtSlip;

namespace Precheck.PtSlip;

/// <summary>
/// 고르는 창(시안 ②~⑤, AC-6402·AC-6403.4): 차트번호 → 이름(칠 때마다 0.3초 기다린 뒤 백그라운드로 찾고, 늦게 온 옛 결과는 버림),
/// 치료 항목·부위 버튼, 고른 부위 표(✕로 뺌), 오른쪽 종이 미리보기, [뽑기](이름을 찾았을 때만).
/// 판단은 Core(ChartInput·SlipPicks·SlipNames·SlipText), 이름 찾기는 넘겨받은 함수(실제는 NameSource.Find, 확인 때는 가짜).
/// 차트번호·이름은 화면과 종이에만 쓰고 로그·파일에 남기지 않는다(AC-6403.5).
/// </summary>
public sealed class PickForm : Form
{
    public const string Title = "PT 후 진료 종이";
    public const string HelpText = "오른·왼·양을 먼저 누르고 부위를 누르면 '오른 어깨'처럼 들어가요.";

    private const int LookupDelayMs = 300;
    /// <summary>시안 .pick 폭 860px: 여백 18 + 왼쪽 504 + 틈 20 + 미리보기 300 + 여백 18</summary>
    private const int FormWidth = 860;
    private const int LeftWidth = 504;
    private const int RightWidth = 300;
    /// <summary>시안 .side-col .paper: 100mm × 2.9px</summary>
    private const int PreviewWidth = 290;
    /// <summary>"PT 후 진료 ( " + 빈칸 4 + " / " + 빈칸 4 + " )" = SlipText.Blank 머리(괄호 안 빈칸 6개씩)</summary>
    private const string BlankHalf = "    ";

    private readonly Func<ChartInput, NameResult> findName;
    private readonly Action<IWin32Window> openSettings;
    private readonly SlipPicks picks = new SlipPicks();
    private readonly System.Windows.Forms.Timer lookupTimer = new System.Windows.Forms.Timer { Interval = LookupDelayMs };
    private readonly List<PillButton> itemButtons = new List<PillButton>();
    private readonly List<PillButton> sideButtons = new List<PillButton>();

    private readonly TextBox chartBox;
    private readonly Label whoLabel;
    private readonly FlowLayoutPanel itemsPanel;
    private readonly FlowLayoutPanel partsPanel;
    private readonly FlowLayoutPanel chosenPanel;
    private readonly PictureBox preview;
    private readonly Label errorLabel;
    private readonly PillButton printButton;

    private SlipSettings settings;
    private ChartInput chart = ChartInput.Parse("");
    /// <summary>지금 차트번호의 결과. null이면 찾는 중(그동안 [뽑기]는 안 눌린다)</summary>
    private NameResult? name;
    private int lookupVersion;
    private bool sending;

    /// <param name="findName">차트번호 → 이름 결과. 백그라운드 스레드에서 부른다(빈칸·틀린 번호는 바로 부른다).</param>
    /// <param name="openSettings">[⚙ 설정]을 누르면 이 창을 주인으로 설정 창을 연다.</param>
    public PickForm(SlipSettings settings, Func<ChartInput, NameResult> findName, Action<IWin32Window> openSettings)
    {
        this.settings = settings ?? throw new ArgumentNullException(nameof(settings));
        this.findName = findName ?? throw new ArgumentNullException(nameof(findName));
        this.openSettings = openSettings ?? throw new ArgumentNullException(nameof(openSettings));

        Text = Title;
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowIcon = false;
        AutoScaleMode = AutoScaleMode.None;
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        BackColor = Color.White;
        ForeColor = SlipUi.Ink;
        Font = SlipUi.Body;

        chartBox = new TextBox
        {
            Width = SlipUi.S(150),
            Font = SlipUi.ChartFont,
            BorderStyle = BorderStyle.FixedSingle,
            MaxLength = 20,
            Margin = new Padding(0, 0, SlipUi.S(12), 0),
        };
        whoLabel = new Label { AutoSize = true, UseMnemonic = false, Anchor = AnchorStyles.Left, Margin = Padding.Empty };
        var chartRow = SlipUi.Flow(LeftWidth, new Padding(0, 0, 0, SlipUi.S(16)));
        chartRow.WrapContents = false;
        chartRow.Controls.Add(chartBox);
        chartRow.Controls.Add(whoLabel);

        itemsPanel = SlipUi.Flow(LeftWidth, new Padding(0, 0, 0, SlipUi.S(8)));
        partsPanel = SlipUi.Flow(LeftWidth, Padding.Empty);
        chosenPanel = SlipUi.Flow(LeftWidth, new Padding(0, SlipUi.S(2), 0, 0));
        chosenPanel.MinimumSize = new Size(SlipUi.S(LeftWidth), SlipUi.S(30));

        var left = SlipUi.Column(LeftWidth, Padding.Empty);
        left.Controls.Add(SlipUi.Heading("차트번호"));
        left.Controls.Add(chartRow);
        left.Controls.Add(SlipUi.Heading("치료 항목"));
        left.Controls.Add(itemsPanel);
        left.Controls.Add(SlipUi.Heading("치료 부위"));
        left.Controls.Add(partsPanel);
        left.Controls.Add(chosenPanel);
        left.Controls.Add(SlipUi.Caption(HelpText, SlipUi.Help, SlipUi.Sub, new Padding(0, SlipUi.S(6), 0, 0), LeftWidth));

        preview = new PictureBox { SizeMode = PictureBoxSizeMode.AutoSize, Margin = Padding.Empty };
        var right = SlipUi.Column(RightWidth, new Padding(SlipUi.S(20), 0, 0, 0));
        right.Controls.Add(SlipUi.Caption("종이 미리보기", SlipUi.SmallBold, SlipUi.Sub, new Padding(0, 0, 0, SlipUi.S(8))));
        right.Controls.Add(preview);

        var body = new FlowLayoutPanel
        {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = false,
            Padding = new Padding(SlipUi.S(18)),
            Margin = Padding.Empty,
        };
        body.Controls.Add(left);
        body.Controls.Add(right);

        errorLabel = SlipUi.ErrorBox(FormWidth);

        var settingsButton = SlipUi.Ghost("⚙ 설정");
        var closeButton = SlipUi.Plain("닫기");
        printButton = SlipUi.Primary("뽑기");
        var foot = new FootPanel(FormWidth);
        foot.PlaceLeft(settingsButton);
        foot.PlaceRight(printButton, closeButton);

        var root = new FlowLayoutPanel
        {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            Margin = Padding.Empty,
            Padding = Padding.Empty,
            Location = Point.Empty,
        };
        root.Controls.Add(body);
        root.Controls.Add(errorLabel);
        root.Controls.Add(foot);
        Controls.Add(root);

        BuildChoices();

        chartBox.TextChanged += (sender, e) => OnChartChanged();
        lookupTimer.Tick += OnLookupTick;
        settingsButton.Click += (sender, e) => this.openSettings(this);
        closeButton.Click += (sender, e) => Close();
        printButton.Click += (sender, e) => Print();
        CancelButton = closeButton;
        ActiveControl = chartBox;
        Shown += (sender, e) =>
        {
            Activate();
            chartBox.Focus();
        };

        OnChartChanged();
    }

    /// <summary>설정을 저장하면 목록·종이 길이를 새 값으로(이미 고른 것은 그대로 둔다).</summary>
    public void ApplySettings(SlipSettings next)
    {
        settings = next ?? throw new ArgumentNullException(nameof(next));
        BuildChoices();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            lookupTimer.Dispose();
            preview.Image?.Dispose();
        }
        base.Dispose(disposing);
    }

    private void BuildChoices()
    {
        SuspendLayout();
        SlipUi.ClearControls(itemsPanel);
        itemButtons.Clear();
        foreach (var item in settings.Items)
        {
            var button = SlipUi.Chip(item, 64);
            button.Click += (sender, e) => OnItem(item);
            itemButtons.Add(button);
            itemsPanel.Controls.Add(button);
        }

        SlipUi.ClearControls(partsPanel);
        sideButtons.Clear();
        foreach (var side in SlipPicks.Sides)
        {
            var button = SlipUi.Chip(side, 52);
            button.Click += (sender, e) => OnSide(side);
            sideButtons.Add(button);
            partsPanel.Controls.Add(button);
        }
        partsPanel.Controls.Add(new Panel
        {
            Size = new Size(1, SlipUi.S(38)),
            BackColor = SlipUi.Line,
            Margin = new Padding(SlipUi.S(4), 0, SlipUi.S(12), SlipUi.S(8)),
        });
        foreach (var part in settings.Parts)
        {
            var button = SlipUi.Chip(part, 64);
            button.Click += (sender, e) => OnPart(part);
            partsPanel.Controls.Add(button);
        }
        ResumeLayout(true);
        ShowPicks();
    }

    private void OnItem(string item)
    {
        picks.ToggleItem(item);
        ShowPicks();
    }

    private void OnSide(string side)
    {
        picks.ToggleSide(side);
        ShowPicks();
    }

    private void OnPart(string part)
    {
        picks.AddPart(part);
        ShowPicks();
    }

    private void OnRemovePart(string part)
    {
        picks.RemovePart(part);
        ShowPicks();
    }

    /// <summary>버튼 켜짐·고른 부위 표·미리보기를 지금 고른 것에 맞춘다.</summary>
    private void ShowPicks()
    {
        foreach (var button in itemButtons) SlipUi.SetOn(button, picks.IsItemOn(button.Text), SlipUi.Accent);
        foreach (var button in sideButtons) SlipUi.SetOn(button, picks.PendingSide == button.Text, SlipUi.Navy);

        chosenPanel.SuspendLayout();
        SlipUi.ClearControls(chosenPanel);
        var key = SlipUi.Caption("고른 부위:", SlipUi.Small, SlipUi.Sub, new Padding(0, 0, SlipUi.S(4), 0));
        key.Anchor = AnchorStyles.Left;
        chosenPanel.Controls.Add(key);
        if (picks.Parts.Count == 0)
        {
            var none = SlipUi.Caption("없음", SlipUi.Small, SlipUi.Sub, Padding.Empty);
            none.Anchor = AnchorStyles.Left;
            chosenPanel.Controls.Add(none);
        }
        foreach (var part in picks.Parts)
        {
            var tag = SlipUi.Tag(part);
            tag.Click += (sender, e) => OnRemovePart(part);
            chosenPanel.Controls.Add(tag);
        }
        chosenPanel.ResumeLayout(true);
        ShowPreview();
    }

    private void OnChartChanged()
    {
        lookupTimer.Stop();
        lookupVersion++;
        HideError();
        chart = ChartInput.Parse(chartBox.Text);
        if (chart.Kind == ChartKind.Ok)
        {
            // 찾는 동안에는 옛 이름을 보이지 않고 [뽑기]도 막는다(다른 환자 종이가 나오지 않게)
            name = null;
            ShowName();
            lookupTimer.Start();
            return;
        }
        // 빈칸·틀린 번호는 DB를 읽지 않으니 바로 답한다
        name = Safe(chart);
        ShowName();
    }

    private async void OnLookupTick(object? sender, EventArgs e)
    {
        lookupTimer.Stop();
        var version = lookupVersion;
        var asked = chart;
        var found = await Task.Run(() => Safe(asked));
        if (IsDisposed || version != lookupVersion) return; // 늦게 온 옛 결과는 버린다
        name = found;
        ShowName();
    }

    private NameResult Safe(ChartInput asked)
    {
        try
        {
            return findName(asked);
        }
        catch (Exception)
        {
            return NameSource.Failed;
        }
    }

    private void ShowName()
    {
        if (name == null)
        {
            whoLabel.Text = "";
        }
        else
        {
            whoLabel.Text = SlipNames.Message(name);
            switch (name.Kind)
            {
                case NameKind.Found:
                    whoLabel.Font = SlipUi.WhoFont;
                    whoLabel.ForeColor = SlipUi.Ok;
                    break;
                case NameKind.Empty:
                    whoLabel.Font = SlipUi.Body;
                    whoLabel.ForeColor = SlipUi.Sub;
                    break;
                default:
                    whoLabel.Font = SlipUi.BodyBold;
                    whoLabel.ForeColor = SlipUi.Bad;
                    break;
            }
        }
        printButton.Enabled = !sending && name != null && SlipNames.CanPrint(name);
        ShowPreview();
    }

    /// <summary>미리보기 글. 이름을 찾기 전에는 머리 괄호 안을 빈 양식(SlipText.Blank)과 같은 빈칸으로 둔다.</summary>
    private SlipText CurrentText()
    {
        if (name != null && name.Kind == NameKind.Found) return SlipText.Of(chart.Number, name.Name, picks);
        return SlipText.Of(BlankHalf, BlankHalf, picks);
    }

    private void ShowPreview()
    {
        var old = preview.Image;
        preview.Image = SlipDrawer.Preview(CurrentText(), settings.PaperLengthMm, SlipUi.S(PreviewWidth));
        old?.Dispose();
    }

    /// <summary>[뽑기]: 설정 프린터(빈칸이면 BIXOLON)로 대화상자 없이 1장. 되면 닫고, 안 되면 빨간 글을 보이고 창을 둔다(AC-6403.4).</summary>
    private void Print()
    {
        if (sending || name == null || !SlipNames.CanPrint(name)) return;
        var length = settings.PaperLengthMm;
        var text = SlipText.Of(chart.Number, name.Name, picks);
        HideError();
        sending = true;
        printButton.Enabled = false;
        Cursor = Cursors.WaitCursor;
        Update();
        string? printer = null;
        var sent = false;
        try
        {
            printer = Printers.Choose(settings.PrinterName);
            if (printer != null)
            {
                SlipPrintJob.Send(printer, SlipDrawer.PaperWidthMm, length, g => SlipDrawer.Draw(g, text, SlipDrawer.PaperWidthMm, length));
                sent = true;
            }
        }
        catch (Exception)
        {
            // 프린터 오류 글은 보이지 않는다(번호·이름이 섞일 수 있다). 정해 둔 글만 보인다
            sent = false;
        }
        finally
        {
            sending = false;
            Cursor = Cursors.Default;
        }
        if (sent)
        {
            Close();
            return;
        }
        ShowError(SlipUi.PrintFailed(printer));
        printButton.Enabled = SlipNames.CanPrint(name);
    }

    private void ShowError(string text)
    {
        errorLabel.Text = text;
        errorLabel.Visible = true;
    }

    private void HideError()
    {
        if (!errorLabel.Visible) return;
        errorLabel.Visible = false;
        errorLabel.Text = "";
    }
}

/// <summary>창 아래 줄(시안 .foot): 윗선, 옅은 바탕, 왼쪽 단추 하나와 오른쪽 단추들.</summary>
internal sealed class FootPanel : Panel
{
    private const int Side = 18;
    private const int Gap = 8;

    public FootPanel(int width)
    {
        Size = new Size(SlipUi.S(width), SlipUi.S(62));
        BackColor = SlipUi.FootBack;
        Margin = Padding.Empty;
        SetStyle(ControlStyles.ResizeRedraw, true);
    }

    public void PlaceLeft(Control control)
    {
        control.Location = new Point(SlipUi.S(Side), (Height - control.Height) / 2);
        Controls.Add(control);
    }

    /// <summary>오른쪽 끝부터 왼쪽으로 차례로(첫 단추가 맨 오른쪽).</summary>
    public void PlaceRight(params Control[] controls)
    {
        var x = Width - SlipUi.S(Side);
        foreach (var control in controls)
        {
            x -= control.Width;
            control.Location = new Point(x, (Height - control.Height) / 2);
            Controls.Add(control);
            x -= SlipUi.S(Gap);
        }
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        using var pen = new Pen(SlipUi.Line);
        e.Graphics.DrawLine(pen, 0, 0, Width, 0);
    }
}

/// <summary>
/// 둥근 모서리 단추(시안 .chip·.btn·.tag). 바탕·테두리·글 색을 정해 직접 그린다(눌리지 않을 때의 색도 시안대로).
/// Tail이 있으면 글 오른쪽에 보통 굵기로 붙인다(고른 부위 표의 ✕).
/// </summary>
internal sealed class PillButton : Button
{
    public PillButton(string text)
    {
        Text = text;
        UseMnemonic = false;
        Cursor = Cursors.Hand;
        SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
    }

    public Color Fill { get; set; } = Color.White;

    /// <summary>Color.Empty면 테두리 없음.</summary>
    public Color Edge { get; set; } = SlipUi.Line;

    public Color Ink { get; set; } = SlipUi.Ink;

    public Color DisabledFill { get; set; } = SlipUi.DisabledBack;

    public Color DisabledInk { get; set; } = Color.White;

    public int Radius { get; set; } = SlipUi.S(6);

    public string? Tail { get; set; }

    public Font? TailFont { get; set; }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.Clear(Parent?.BackColor ?? Color.White);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        var box = new Rectangle(0, 0, Width - 1, Height - 1);
        using (var path = SlipUi.Rounded(box, Radius))
        {
            using var fill = new SolidBrush(Enabled ? Fill : DisabledFill);
            g.FillPath(fill, path);
            if (Edge != Color.Empty && Enabled)
            {
                using var pen = new Pen(Edge);
                g.DrawPath(pen, path);
            }
        }
        var ink = Enabled ? Ink : DisabledInk;
        const TextFormatFlags flags = TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine | TextFormatFlags.NoPrefix | TextFormatFlags.NoPadding;
        if (Tail == null)
        {
            TextRenderer.DrawText(g, Text, Font, ClientRectangle, ink, flags | TextFormatFlags.HorizontalCenter);
        }
        else
        {
            var tailFont = TailFont ?? Font;
            var tailWidth = TextRenderer.MeasureText(g, Tail, tailFont, Size.Empty, flags).Width;
            var right = Width - SlipUi.S(8) - tailWidth;
            TextRenderer.DrawText(g, Text, Font, new Rectangle(SlipUi.S(10), 0, Math.Max(0, right - SlipUi.S(10)), Height), ink, flags);
            TextRenderer.DrawText(g, Tail, tailFont, new Rectangle(right, 0, tailWidth, Height), ink, flags);
        }
        if (Focused && ShowFocusCues) ControlPaint.DrawFocusRectangle(g, Rectangle.Inflate(ClientRectangle, -3, -3));
    }
}

/// <summary>세 창이 같이 쓰는 시안 색·글꼴·크기(px는 96dpi 기준, 이 PC 배율로 늘린다).</summary>
internal static class SlipUi
{
    public const string FontName = "Malgun Gothic";

    public static readonly Color Ink = Hex(0x1D2430);
    public static readonly Color Sub = Hex(0x5D6878);
    public static readonly Color Line = Hex(0xC9D0DA);
    public static readonly Color Accent = Hex(0x1F6FEB);
    public static readonly Color AccentSoft = Hex(0xE5EFFF);
    public static readonly Color Navy = Hex(0x0F3D8A);
    public static readonly Color Ok = Hex(0x137A3A);
    public static readonly Color Bad = Hex(0xC62828);
    public static readonly Color BadSoft = Hex(0xFDECEC);
    public static readonly Color DisabledBack = Hex(0xB8C3D3);
    public static readonly Color FootBack = Hex(0xFAFBFC);

    // 시안 px → pt(× 0.75). 글꼴은 pt라 배율에 맞춰 저절로 커진다
    public static readonly Font Body = new Font(FontName, 10.5f);
    public static readonly Font BodyBold = new Font(FontName, 10.5f, FontStyle.Bold);
    public static readonly Font Small = new Font(FontName, 9.75f);
    public static readonly Font SmallBold = new Font(FontName, 9.75f, FontStyle.Bold);
    public static readonly Font Help = new Font(FontName, 9.375f);
    public static readonly Font ChartFont = new Font(FontName, 15f);
    public static readonly Font WhoFont = new Font(FontName, 15f, FontStyle.Bold);
    public static readonly Font PrimaryFont = new Font(FontName, 11.25f, FontStyle.Bold);
    public static readonly Font NumberFont = new Font(FontName, 11.25f);

    private static readonly Lazy<float> Dpi = new Lazy<float>(() =>
    {
        using var g = Graphics.FromHwnd(IntPtr.Zero);
        return g.DpiX;
    });

    /// <summary>96dpi 기준 px를 이 화면 배율로.</summary>
    public static int S(int px) => (int)Math.Round(px * Dpi.Value / 96f);

    public static string PrintFailed(string? printer) =>
        "프린터로 보내지 못했어요(" + (string.IsNullOrEmpty(printer) ? "프린터 없음" : printer) + "). 프린터가 켜져 있고 종이가 있는지 보고 다시 눌러 주세요.";

    public static Label Heading(string text) => Caption(text, BodyBold, Ink, new Padding(0, 0, 0, S(8)));

    public static Label Caption(string text, Font font, Color color, Padding margin, int maxWidth = 0) => new Label
    {
        Text = text,
        Font = font,
        ForeColor = color,
        AutoSize = true,
        UseMnemonic = false,
        Margin = margin,
        MaximumSize = new Size(maxWidth > 0 ? S(maxWidth) : 0, 0),
    };

    /// <summary>폭이 정해진 줄(넘치면 다음 줄로).</summary>
    public static FlowLayoutPanel Flow(int width, Padding margin) => new FlowLayoutPanel
    {
        AutoSize = true,
        AutoSizeMode = AutoSizeMode.GrowAndShrink,
        FlowDirection = FlowDirection.LeftToRight,
        WrapContents = true,
        MinimumSize = new Size(S(width), 0),
        MaximumSize = new Size(S(width), 0),
        Margin = margin,
        Padding = Padding.Empty,
    };

    /// <summary>폭이 정해진 세로 칸.</summary>
    public static FlowLayoutPanel Column(int width, Padding margin) => new FlowLayoutPanel
    {
        AutoSize = true,
        AutoSizeMode = AutoSizeMode.GrowAndShrink,
        FlowDirection = FlowDirection.TopDown,
        WrapContents = false,
        MinimumSize = new Size(S(width), 0),
        MaximumSize = new Size(S(width), 0),
        Margin = margin,
        Padding = Padding.Empty,
    };

    /// <summary>빨간 알림 칸(시안 .err). 처음엔 숨김.</summary>
    public static Label ErrorBox(int formWidth) => new Label
    {
        AutoSize = true,
        UseMnemonic = false,
        Visible = false,
        Font = Small,
        ForeColor = Bad,
        BackColor = BadSoft,
        Padding = new Padding(S(12), S(10), S(12), S(10)),
        Margin = new Padding(S(18), 0, S(18), S(12)),
        MinimumSize = new Size(S(formWidth - 36), 0),
        MaximumSize = new Size(S(formWidth - 36), 0),
    };

    /// <summary>치료 항목·부위 버튼(시안 .chip: 높이 38, 양옆 12, 최소 폭).</summary>
    public static PillButton Chip(string text, int minWidth)
    {
        var button = new PillButton(text) { Font = Body, Margin = new Padding(0, 0, S(8), S(8)) };
        button.Size = new Size(Math.Max(S(minWidth), TextRenderer.MeasureText(text, BodyBold).Width + S(24)), S(38));
        return button;
    }

    /// <summary>안의 컨트롤을 모두 빼고 버린다(목록을 다시 만들 때).</summary>
    public static void ClearControls(Control parent)
    {
        var old = new Control[parent.Controls.Count];
        parent.Controls.CopyTo(old, 0);
        parent.Controls.Clear();
        foreach (var control in old) control.Dispose();
    }

    public static void SetOn(PillButton button, bool on, Color onColor)
    {
        button.Fill = on ? onColor : Color.White;
        button.Edge = on ? onColor : Line;
        button.Ink = on ? Color.White : Ink;
        button.Font = on ? BodyBold : Body;
        button.Invalidate();
    }

    /// <summary>고른 부위 표 하나(시안 .tag: 옅은 파랑, 굵은 글 + ✕). 누르면 뺀다.</summary>
    public static PillButton Tag(string part)
    {
        var button = new PillButton(part)
        {
            Font = SmallBold,
            Fill = AccentSoft,
            Edge = Color.Empty,
            Ink = Navy,
            Tail = "✕",
            TailFont = Small,
            Margin = new Padding(0, S(1), S(6), S(1)),
            Anchor = AnchorStyles.Left,
        };
        var textWidth = TextRenderer.MeasureText(part, SmallBold).Width;
        var tailWidth = TextRenderer.MeasureText("✕", Small).Width;
        button.Size = new Size(S(10) + textWidth + S(6) + tailWidth + S(8), S(28));
        button.Radius = button.Height / 2;
        return button;
    }

    /// <summary>보통 단추(시안 .btn).</summary>
    public static PillButton Plain(string text, int height = 38)
    {
        var button = new PillButton(text) { Font = Body, Margin = Padding.Empty };
        button.Size = new Size(TextRenderer.MeasureText(text, Body).Width + S(36), S(height));
        return button;
    }

    /// <summary>파란 주 단추(시안 .btn.primary: 최소 폭 110, 15px 굵게).</summary>
    public static PillButton Primary(string text)
    {
        var button = new PillButton(text) { Font = PrimaryFont, Fill = Accent, Edge = Accent, Ink = Color.White, Margin = Padding.Empty };
        button.Size = new Size(Math.Max(S(110), TextRenderer.MeasureText(text, PrimaryFont).Width + S(36)), S(38));
        return button;
    }

    /// <summary>테두리 없는 흐린 단추(시안 .btn.ghost).</summary>
    public static PillButton Ghost(string text)
    {
        var button = new PillButton(text) { Font = Body, Fill = FootBack, Edge = Color.Empty, Ink = Sub, Margin = Padding.Empty };
        button.Size = new Size(TextRenderer.MeasureText(text, Body).Width + S(36), S(38));
        return button;
    }

    public static GraphicsPath Rounded(Rectangle box, int radius)
    {
        var path = new GraphicsPath();
        var d = Math.Max(1, Math.Min(radius * 2, Math.Min(box.Width, box.Height)));
        path.AddArc(box.X, box.Y, d, d, 180, 90);
        path.AddArc(box.Right - d, box.Y, d, d, 270, 90);
        path.AddArc(box.Right - d, box.Bottom - d, d, d, 0, 90);
        path.AddArc(box.X, box.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }

    private static Color Hex(int rgb) => Color.FromArgb((rgb >> 16) & 0xFF, (rgb >> 8) & 0xFF, rgb & 0xFF);
}
