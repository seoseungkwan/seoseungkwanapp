using System;
using System.Drawing;
using System.Windows.Forms;
using Precheck.Core.PtSlip;

namespace Precheck.PtSlip;

/// <summary>
/// 설정 창(시안 ⑦, AC-6401·AC-6403.4): 치료 항목·부위 목록(한 줄에 하나), 프린터와 [시험 1장](빈 양식), 종이 길이(mm),
/// 버튼 자리(◀ 왼쪽으로 / 오른쪽으로 ▶, 20px씩, 바로 버튼에 보임). [저장]은 Core 규칙으로 검사해 틀리면 저장하지 않고,
/// 맞으면 settings.json에 쓴다. [취소]·닫기는 버튼 자리를 처음대로 되돌린다.
/// </summary>
public sealed class SettingsForm : Form
{
    public const string Title = "설정";

    /// <summary>시안 .set 폭 620px: 여백 18 + 칸 282 + 틈 20 + 칸 282 + 여백 18</summary>
    private const int FormWidth = 620;
    private const int CellWidth = 282;
    private const int Gap = 20;

    private readonly SlipSettings original;
    private readonly Action<int> offsetChanged;
    private readonly TextBox itemsBox;
    private readonly TextBox partsBox;
    private readonly ComboBox printerBox;
    private readonly NumericUpDown lengthBox;
    private readonly CheckBox directBox;
    private readonly Label errorLabel;
    private int offset;

    /// <param name="offsetChanged">버튼 자리를 바꿀 때마다(그리고 취소하면 처음 값으로) 부른다.</param>
    public SettingsForm(SlipSettings settings, Action<int> offsetChanged)
    {
        original = settings ?? throw new ArgumentNullException(nameof(settings));
        this.offsetChanged = offsetChanged ?? throw new ArgumentNullException(nameof(offsetChanged));
        offset = settings.ButtonOffsetPx;

        Text = Title;
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowIcon = false;
        ShowInTaskbar = false;
        AutoScaleMode = AutoScaleMode.None;
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        BackColor = Color.White;
        ForeColor = SlipUi.Ink;
        Font = SlipUi.Body;

        itemsBox = LinesBox(SlipSettingsRules.ListText(settings.Items));
        partsBox = LinesBox(SlipSettingsRules.ListText(settings.Parts));

        printerBox = new ComboBox
        {
            DropDownStyle = ComboBoxStyle.DropDownList,
            Width = SlipUi.S(300),
            Font = SlipUi.Body,
            Anchor = AnchorStyles.Left,
            Margin = new Padding(0, 0, SlipUi.S(10), 0),
        };
        FillPrinters(settings.PrinterName);
        var testButton = SlipUi.Plain("시험 1장", 36);
        testButton.Anchor = AnchorStyles.Left;
        testButton.Margin = new Padding(0, 0, SlipUi.S(10), 0);
        // 프린터 드라이버 설정 창(용지 유형 '연속' 등)을 이 프로그램 종이용으로. 프린터 기본 설정은 바꾸지 않는다
        var driverButton = SlipUi.Plain("프린터 종이 설정", 36);
        driverButton.Anchor = AnchorStyles.Left;

        lengthBox = new NumericUpDown
        {
            // 종이 길이 칸은 규칙 범위(40~150mm, AC-6401.2)만 받는다. 저장할 때 IsPaperLength로 한 번 더 본다
            Minimum = SlipSettingsRules.MinPaperMm,
            Maximum = SlipSettingsRules.MaxPaperMm,
            Value = Math.Max(SlipSettingsRules.MinPaperMm, Math.Min(SlipSettingsRules.MaxPaperMm, settings.PaperLengthMm)),
            Width = SlipUi.S(64),
            Font = SlipUi.NumberFont,
            TextAlign = HorizontalAlignment.Center,
            Anchor = AnchorStyles.Left,
            Margin = new Padding(0, 0, SlipUi.S(10), 0),
        };
        var mm = SlipUi.Caption("mm", SlipUi.Body, SlipUi.Ink, Padding.Empty);
        mm.Anchor = AnchorStyles.Left;

        var leftButton = SlipUi.Plain("◀ 왼쪽으로", 36);
        leftButton.Margin = new Padding(0, 0, SlipUi.S(10), 0);
        var rightButton = SlipUi.Plain("오른쪽으로 ▶", 36);

        var body = new TableLayoutPanel
        {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            ColumnCount = 2,
            RowCount = 4,
            Padding = new Padding(SlipUi.S(18), SlipUi.S(18), SlipUi.S(18), SlipUi.S(2)),
            Margin = Padding.Empty,
        };
        body.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, SlipUi.S(CellWidth + Gap)));
        body.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, SlipUi.S(CellWidth)));
        body.Controls.Add(Cell("치료 항목 (한 줄에 하나)", itemsBox), 0, 0);
        body.Controls.Add(Cell("치료 부위 (한 줄에 하나)", partsBox), 1, 0);
        var printerCell = Cell("프린터", Field(printerBox, testButton, driverButton));
        body.Controls.Add(printerCell, 0, 1);
        body.SetColumnSpan(printerCell, 2);
        body.Controls.Add(Cell("종이 길이", Field(lengthBox, mm)), 0, 2);
        body.Controls.Add(Cell("버튼 자리", Field(leftButton, rightButton)), 1, 2);
        // 드라이버를 거치지 않고 빅솔론 명령(SLCS)으로 '연속 용지, 이 길이'를 알려 주며 보낸다. [저장]하면 바뀐다([시험 1장]은 바로 따른다)
        directBox = new CheckBox
        {
            Text = "빅솔론에 직접 보내기 (종이가 길게 계속 나오면 켜세요)",
            AutoSize = true,
            Checked = SettingsFile.ReadDirectMode(),
            Font = SlipUi.Body,
            Margin = new Padding(0, SlipUi.S(6), 0, SlipUi.S(4)),
        };
        body.Controls.Add(directBox, 0, 3);
        body.SetColumnSpan(directBox, 2);

        errorLabel = SlipUi.ErrorBox(FormWidth);

        var cancelButton = SlipUi.Plain("취소");
        var saveButton = SlipUi.Primary("저장");
        var foot = new FootPanel(FormWidth);
        foot.PlaceRight(saveButton, cancelButton);

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

        testButton.Click += (sender, e) => TestPrint();
        driverButton.Click += (sender, e) => EditDriver();
        // 버튼 자리 값이 클수록 비트 창 오른쪽 끝에서 더 왼쪽(Core SlipButton.Place)
        leftButton.Click += (sender, e) => MoveButton(SlipSettingsRules.ButtonOffsetStep);
        rightButton.Click += (sender, e) => MoveButton(-SlipSettingsRules.ButtonOffsetStep);
        cancelButton.Click += (sender, e) => Close();
        saveButton.Click += (sender, e) => Save();
        CancelButton = cancelButton;
        ActiveControl = itemsBox;
        // 처음 열 때 목록 글이 모두 골라진(파란) 채로 보이지 않게
        Shown += (sender, e) => itemsBox.Select(0, 0);
    }

    /// <summary>[저장]으로 쓴 새 설정. 저장하지 않고 닫았으면 null.</summary>
    public SlipSettings? Saved { get; private set; }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        // 저장하지 않고 닫으면 버튼 자리를 처음대로
        if (Saved == null && offset != original.ButtonOffsetPx) offsetChanged(original.ButtonOffsetPx);
        base.OnFormClosed(e);
    }

    private void MoveButton(int delta)
    {
        var next = offset + delta;
        if (!SlipSettingsRules.IsButtonOffset(next)) return;
        offset = next;
        offsetChanged(offset);
    }

    private void Save()
    {
        HideError();
        var items = SlipSettingsRules.ParseList(LinesOf(itemsBox), SlipListKind.Items);
        if (!items.Ok)
        {
            ShowError("치료 항목: " + items.Error);
            return;
        }
        var parts = SlipSettingsRules.ParseList(LinesOf(partsBox), SlipListKind.Parts);
        if (!parts.Ok)
        {
            ShowError("치료 부위: " + parts.Error);
            return;
        }
        var length = (int)lengthBox.Value;
        if (!SlipSettingsRules.IsPaperLength(length) || !SlipSettingsRules.IsButtonOffset(offset)) return;
        var next = new SlipSettings(items.Names, parts.Names, printerBox.SelectedItem as string ?? "", length, offset);
        try
        {
            SettingsFile.WriteText(SlipSettingsRules.ToJson(next));
            SettingsFile.WriteDirectMode(directBox.Checked);
        }
        catch (Exception)
        {
            ShowError("설정을 저장하지 못했어요. 다시 눌러 주세요.");
            return;
        }
        Saved = next;
        DialogResult = DialogResult.OK;
        Close();
    }

    /// <summary>[시험 1장]: 고른 프린터로 빈 양식만(가짜 이름도 넣지 않는다).</summary>
    private void TestPrint()
    {
        HideError();
        var printer = printerBox.SelectedItem as string;
        var length = (int)lengthBox.Value;
        Cursor = Cursors.WaitCursor;
        try
        {
            if (string.IsNullOrEmpty(printer))
            {
                ShowError(SlipUi.PrintFailed(null));
                return;
            }
            SlipPrintJob.Send(printer!, SlipDrawer.PaperWidthMm, length, g => SlipDrawer.Draw(g, SlipText.Blank, SlipDrawer.PaperWidthMm, length), direct: directBox.Checked);
        }
        catch (Exception)
        {
            ShowError(SlipUi.PrintFailed(printer));
        }
        finally
        {
            Cursor = Cursors.Default;
        }
    }

    /// <summary>[프린터 종이 설정]: 고른 프린터의 드라이버 설정 창. [확인]하면 이 프로그램 종이에만 쓰도록 바로 저장된다.</summary>
    private void EditDriver()
    {
        HideError();
        var printer = printerBox.SelectedItem as string;
        if (string.IsNullOrEmpty(printer))
        {
            ShowError(SlipUi.PrintFailed(null));
            return;
        }
        try
        {
            SlipPrintJob.EditDriverSettings(this, printer!);
        }
        catch (Exception)
        {
            ShowError("프린터 종이 설정 창을 열지 못했어요(" + printer + "). 프린터가 켜져 있는지 보고 다시 눌러 주세요.");
        }
    }

    /// <summary>설치된 프린터들. 설정이 빈칸이면 Printers.Choose가 고른 것(BIXOLON)을 미리 고른다.</summary>
    private void FillPrinters(string configured)
    {
        foreach (var installed in Printers.Installed()) printerBox.Items.Add(installed);
        var chosen = string.IsNullOrEmpty(configured) ? Printers.Choose(configured) : configured;
        if (string.IsNullOrEmpty(chosen)) return;
        // 설정에 적힌 프린터가 지금 없으면 그 이름을 그대로 보여 준다(고른 것을 몰래 바꾸지 않는다)
        if (!printerBox.Items.Contains(chosen!)) printerBox.Items.Add(chosen!);
        printerBox.SelectedItem = chosen;
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

    private static string LinesOf(TextBox box) => box.Text.Replace("\r\n", "\n");

    private static TextBox LinesBox(string text) => new TextBox
    {
        Multiline = true,
        AcceptsReturn = true,
        WordWrap = false,
        ScrollBars = ScrollBars.Vertical,
        Font = SlipUi.Body,
        BorderStyle = BorderStyle.FixedSingle,
        Size = new Size(SlipUi.S(CellWidth), SlipUi.S(190)),
        Margin = Padding.Empty,
        Text = (text ?? "").Replace("\r\n", "\n").Replace("\n", "\r\n"),
    };

    /// <summary>굵은 제목 + 그 아래 칸(시안 .lbl).</summary>
    private static Control Cell(string label, Control content)
    {
        var cell = new FlowLayoutPanel
        {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            Margin = new Padding(0, 0, 0, SlipUi.S(16)),
            Padding = Padding.Empty,
        };
        cell.Controls.Add(SlipUi.Heading(label));
        cell.Controls.Add(content);
        return cell;
    }

    /// <summary>가로로 나란히(시안 .field).</summary>
    private static Control Field(params Control[] controls)
    {
        var field = new FlowLayoutPanel
        {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = false,
            Margin = Padding.Empty,
            Padding = Padding.Empty,
        };
        field.Controls.AddRange(controls);
        return field;
    }
}
