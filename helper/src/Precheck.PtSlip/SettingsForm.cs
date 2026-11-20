using System;
using System.Drawing;
using System.Windows.Forms;
using Precheck.Core.InjectionMemo;
using Precheck.Core.PtSlip;

namespace Precheck.PtSlip;

/// <summary>
/// 설정 창(시안 ⑦, AC-6401·AC-6403.4): 치료 항목·부위 목록(한 줄에 하나), 프린터와 [시험 1장](빈 양식), 종이 길이(mm),
/// 버튼 자리(◀ 왼쪽으로 / 오른쪽으로 ▶, 20px씩, 바로 버튼에 보임). [저장]은 Core 규칙으로 검사해 틀리면 저장하지 않고,
/// 맞으면 settings.json에 쓴다. [취소]·닫기는 버튼 자리를 처음대로 되돌린다.
/// 맨 아래 주사 차수 묶음(injection-memo 시안 ④, AC-7504.1): [주사 차수] 단추 자리(◀ ▶ 20px씩, -400~400px, 바로 단추에 보임)와
/// 단축키(F4·F8·F10·F11). [저장]하면 memo-settings.json에 쓰고 단추·단축키에 바로 쓴다. [취소]·닫기는 단추 자리를 처음대로.
/// </summary>
public sealed class SettingsForm : Form
{
    public const string Title = "설정";

    // 주사 차수 묶음 글(시안 docs/mockups/injection-memo/notes.md '화면 글자' 그대로)
    public const string MemoOffsetLabel = "주사 차수 단추 자리";
    public const string MemoOffsetNote = "접수 화면 '접수메모(당일)' 옆";
    public const string MemoLeftText = "◀ 왼쪽으로";
    public const string MemoRightText = "오른쪽으로 ▶";
    public const string MemoOffsetHint = "비트 단추나 글을 가리면 옆으로 옮겨요. 한 번에 20px씩, 접수 화면에 바로 보여요.";
    public const string MemoKeyLabel = "주사 차수 단축키";
    public const string MemoKeyHint = "비트가 쓰는 키(F1·F2·F3·F5·F6·F7·F9·F12)는 고를 수 없어요.";

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
    private readonly MemoSettings memoOriginal;
    private readonly ComboBox memoKeyBox;
    private int offset;
    private int memoOffset;

    /// <param name="offsetChanged">버튼 자리를 바꿀 때마다(그리고 취소하면 처음 값으로) 부른다.</param>
    public SettingsForm(SlipSettings settings, Action<int> offsetChanged)
    {
        original = settings ?? throw new ArgumentNullException(nameof(settings));
        this.offsetChanged = offsetChanged ?? throw new ArgumentNullException(nameof(offsetChanged));
        offset = settings.ButtonOffsetPx;
        memoOriginal = MemoSettings.FromJson(MemoSettingsFile.ReadText());
        memoOffset = memoOriginal.ButtonOffsetPx;

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

        var memoLeftButton = SlipUi.Plain(MemoLeftText, 36);
        memoLeftButton.Margin = new Padding(0, 0, SlipUi.S(8), 0);
        var memoRightButton = SlipUi.Plain(MemoRightText, 36);
        memoKeyBox = new ComboBox
        {
            DropDownStyle = ComboBoxStyle.DropDownList,
            Width = SlipUi.S(140),
            Font = SlipUi.Body,
            Margin = Padding.Empty,
        };
        foreach (var key in MemoSettings.AllowedKeys) memoKeyBox.Items.Add(key);
        memoKeyBox.SelectedItem = memoOriginal.HotKey;

        var body = new TableLayoutPanel
        {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            ColumnCount = 2,
            RowCount = 5,
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
        var memoGroup = MemoGroup(memoLeftButton, memoRightButton, memoKeyBox);
        body.Controls.Add(memoGroup, 0, 4);
        body.SetColumnSpan(memoGroup, 2);

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
        // [주사 차수] 단추 자리는 +가 오른쪽(MemoSettings)
        memoLeftButton.Click += (sender, e) => MoveMemoButton(-MemoSettings.ButtonOffsetStep);
        memoRightButton.Click += (sender, e) => MoveMemoButton(MemoSettings.ButtonOffsetStep);
        cancelButton.Click += (sender, e) => Close();
        saveButton.Click += (sender, e) => Save();
        CancelButton = cancelButton;
        ActiveControl = itemsBox;
        // 처음 열 때 목록 글이 모두 골라진(파란) 채로 보이지 않게
        Shown += (sender, e) => itemsBox.Select(0, 0);
    }

    /// <summary>
    /// Program이 만든 [주사 차수] 단추. 설정 창은 [PT 먼저] 단추(ButtonForm)가 열므로 여기로 잇는다.
    /// 없으면(null) 주사 차수 설정은 파일에만 쓰고 단추·단축키를 바로 바꾸지 않는다.
    /// </summary>
    public static MemoButtonForm? MemoButton { get; set; }

    /// <summary>[저장]으로 쓴 새 설정. 저장하지 않고 닫았으면 null.</summary>
    public SlipSettings? Saved { get; private set; }

    /// <summary>[저장]으로 쓴 새 주사 차수 설정. 저장하지 않고 닫았으면 null.</summary>
    public MemoSettings? SavedMemo { get; private set; }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        // 저장하지 않고 닫으면 버튼 자리를 처음대로
        if (Saved == null && offset != original.ButtonOffsetPx) offsetChanged(original.ButtonOffsetPx);
        if (SavedMemo == null && memoOffset != memoOriginal.ButtonOffsetPx) MemoButton?.PreviewOffset(memoOriginal.ButtonOffsetPx);
        base.OnFormClosed(e);
    }

    private void MoveButton(int delta)
    {
        var next = offset + delta;
        if (!SlipSettingsRules.IsButtonOffset(next)) return;
        offset = next;
        offsetChanged(offset);
    }

    /// <summary>주사 차수 ◀ ▶: -400~400px 안에서만, 저장 전에도 단추를 바로 옮긴다.</summary>
    private void MoveMemoButton(int delta)
    {
        var next = memoOffset + delta;
        if (!MemoSettings.IsButtonOffset(next)) return;
        memoOffset = next;
        MemoButton?.PreviewOffset(memoOffset);
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
        var memoKey = memoKeyBox.SelectedItem as string;
        if (!MemoSettings.IsAllowedKey(memoKey) || !MemoSettings.IsButtonOffset(memoOffset)) return;
        var nextMemo = new MemoSettings(memoKey!, memoOffset);
        try
        {
            SettingsFile.WriteText(SlipSettingsRules.ToJson(next));
            SettingsFile.WriteDirectMode(directBox.Checked);
            MemoSettingsFile.WriteText(nextMemo.ToJson());
        }
        catch (Exception)
        {
            ShowError("설정을 저장하지 못했어요. 다시 눌러 주세요.");
            return;
        }
        Saved = next;
        SavedMemo = nextMemo;
        // 단추 자리·단축키를 바로 바꾼다(단축키는 다시 등록)
        MemoButton?.Apply(nextMemo);
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

    /// <summary>
    /// 맨 아래 주사 차수 묶음(injection-memo 시안 ④): 옅은 윗줄, '주사 차수 단추 자리'(+ 흐린 '접수메모(당일) 옆') · ◀ ▶ · 안내,
    /// '주사 차수 단축키' · F4·F8·F10·F11 고르기 · 안내. 두 칸 폭(282 + 20 + 282)을 다 쓴다.
    /// </summary>
    private static Control MemoGroup(Control leftButton, Control rightButton, Control keyBox)
    {
        const int width = CellWidth + Gap + CellWidth;
        var group = SlipUi.Column(width, Padding.Empty);
        group.Controls.Add(new Panel
        {
            // 시안 hr.div: #EDF0F4 1px
            BackColor = Color.FromArgb(0xED, 0xF0, 0xF4),
            Size = new Size(SlipUi.S(width), 1),
            Margin = new Padding(0, SlipUi.S(10), 0, SlipUi.S(18)),
        });

        var heading = SlipUi.Flow(width, new Padding(0, 0, 0, SlipUi.S(8)));
        var title = SlipUi.Caption(MemoOffsetLabel, SlipUi.BodyBold, SlipUi.Ink, Padding.Empty);
        // 시안 .lbl .k: 흐린 12.5px, 제목 오른쪽 6px, 아래 끝을 제목 글자에 맞춘다
        var note = SlipUi.Caption(MemoOffsetNote, SlipUi.Help, SlipUi.Sub, new Padding(SlipUi.S(6), SlipUi.S(2), 0, 0));
        heading.Controls.Add(title);
        heading.Controls.Add(note);
        group.Controls.Add(heading);
        group.Controls.Add(Field(leftButton, rightButton));
        group.Controls.Add(SlipUi.Caption(MemoOffsetHint, SlipUi.Help, SlipUi.Sub, new Padding(0, SlipUi.S(6), 0, SlipUi.S(20)), width));

        group.Controls.Add(SlipUi.Heading(MemoKeyLabel));
        group.Controls.Add(keyBox);
        group.Controls.Add(SlipUi.Caption(MemoKeyHint, SlipUi.Help, SlipUi.Sub, new Padding(0, SlipUi.S(6), 0, SlipUi.S(16)), width));
        return group;
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
