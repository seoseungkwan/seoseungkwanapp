using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;
using Precheck.Core.DocPrint;
using Precheck.Core.PtSlip;

namespace Precheck.PtSlip;

/// <summary>
/// 설정 창(PT 종이 시안 ⑦·서류 시안 ⑥, AC-6401·AC-6403.4·AC-7406.3). 탭 셋:
/// `PT 종이` — 치료 항목·부위 목록(한 줄에 하나), 프린터와 [시험 1장](빈 양식)·[프린터 종이 설정], 종이 길이(mm), 빅솔론에 직접 보내기.
/// `서류` — 서류 프린터(A4, 빈칸 = 윈도우 기본)와 [시험 1장], 묶음 목록 고치기(이름·서류 4 체크·[+ 더하기]·[빼기]), [뽑은 기록 보기](DocLogForm).
/// `단추 자리` — 단추 자리(◀ 왼쪽으로 / 오른쪽으로 ▶, 20px씩, [서류]·[PT 먼저] 두 단추에 바로 보임).
/// [저장]·[취소]는 탭 아래 한 줄. [저장]은 Core 규칙(SlipSettingsRules·DocSettingsRules)으로 검사해 틀리면 저장하지 않고,
/// 맞으면 settings.json과 doc-settings.json에 함께 쓴다. [취소]·닫기는 버튼 자리를 처음대로 되돌린다.
/// </summary>
public sealed class SettingsForm : Form
{
    public const string Title = "설정";

    /// <summary>시안 .set 폭 620px: 여백 18 + 칸 282 + 틈 20 + 칸 282 + 여백 18</summary>
    private const int FormWidth = 620;
    private const int CellWidth = 282;
    private const int Gap = 20;
    /// <summary>탭 묶음 양옆 여백(시안 .tabs padding 0 18px에서 탭 안 여백 몫을 뺌)</summary>
    private const int TabsSide = 8;

    private readonly SlipSettings original;
    private readonly Action<int> offsetChanged;
    private readonly TextBox itemsBox;
    private readonly TextBox partsBox;
    private readonly ComboBox printerBox;
    private readonly NumericUpDown lengthBox;
    private readonly CheckBox directBox;
    private readonly Label errorLabel;
    private readonly TabControl tabs;
    private readonly TabPage slipPage;
    private readonly TabPage docsPage;
    private readonly DocSettings originalDocs;
    private readonly ComboBox docPrinterBox;
    private readonly ListBox bundleList;
    private readonly TextBox bundleName;
    private readonly CheckBox[] kindBoxes;
    private readonly PillButton addBundleButton;
    private readonly PillButton removeBundleButton;
    private readonly List<EditBundle> bundles;
    private bool loadingBundle;
    private int offset;

    /// <param name="offsetChanged">버튼 자리를 바꿀 때마다(그리고 취소하면 처음 값으로) 부른다.</param>
    /// <param name="docSettings">서류 설정. null이면 doc-settings.json에서 읽는다(없거나 깨졌으면 기본값).</param>
    public SettingsForm(SlipSettings settings, Action<int> offsetChanged, DocSettings? docSettings = null)
    {
        original = settings ?? throw new ArgumentNullException(nameof(settings));
        this.offsetChanged = offsetChanged ?? throw new ArgumentNullException(nameof(offsetChanged));
        offset = settings.ButtonOffsetPx;
        originalDocs = docSettings ?? DocSettingsRules.FromJson(DocFiles.ReadText());
        bundles = originalDocs.Bundles.Select(bundle => new EditBundle(bundle.Name, bundle.Kinds)).ToList();

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

        // PT 종이 탭: 지금까지의 칸 그대로(버튼 자리만 '단추 자리' 탭으로 옮김)
        var body = Grid(4);
        body.Controls.Add(Cell("치료 항목 (한 줄에 하나)", itemsBox), 0, 0);
        body.Controls.Add(Cell("치료 부위 (한 줄에 하나)", partsBox), 1, 0);
        var printerCell = Cell("프린터", Field(printerBox, testButton, driverButton));
        body.Controls.Add(printerCell, 0, 1);
        body.SetColumnSpan(printerCell, 2);
        body.Controls.Add(Cell("종이 길이", Field(lengthBox, mm)), 0, 2);
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

        // 단추 자리 탭: [서류]·[PT 먼저]가 함께 옮겨진다(ButtonForm)
        var buttonBody = Grid(1);
        buttonBody.Controls.Add(Cell("단추 자리", Field(leftButton, rightButton)), 0, 0);

        // 서류 탭(서류 시안 ⑥): 서류 프린터 → 묶음 → 뽑은 기록
        docPrinterBox = new ComboBox
        {
            DropDownStyle = ComboBoxStyle.DropDownList,
            Width = SlipUi.S(300),
            Font = SlipUi.Body,
            Anchor = AnchorStyles.Left,
            Margin = new Padding(0, 0, SlipUi.S(10), 0),
        };
        FillDocPrinters(originalDocs.PrinterName);
        var docTestButton = SlipUi.Plain("시험 1장", 36);
        docTestButton.Anchor = AnchorStyles.Left;
        var printerStack = Stack(
            Field(docPrinterBox, docTestButton),
            Note("처음엔 윈도우 기본 프린터가 골라져 있어요. PT 종이 프린터(빅솔론)와 따로예요."));

        bundleList = new ListBox
        {
            Font = SlipUi.Body,
            IntegralHeight = false,
            BorderStyle = BorderStyle.FixedSingle,
            Size = new Size(SlipUi.S(150), SlipUi.S(150)),
            Margin = Padding.Empty,
        };
        foreach (var bundle in bundles) bundleList.Items.Add(bundle.Name);
        addBundleButton = DocUi.Mini("+ 더하기");
        addBundleButton.Margin = new Padding(0, 0, SlipUi.S(6), 0);
        removeBundleButton = DocUi.Mini("빼기");
        var bundleButtons = Field(addBundleButton, removeBundleButton);
        bundleButtons.Margin = new Padding(0, SlipUi.S(8), 0, 0);
        var listColumn = Stack(bundleList, bundleButtons);
        listColumn.Margin = new Padding(0, 0, SlipUi.S(12), 0);
        bundleName = new TextBox
        {
            Font = SlipUi.Body,
            Width = SlipUi.S(260),
            MaxLength = 20,
            BorderStyle = BorderStyle.FixedSingle,
            Margin = new Padding(0, 0, 0, SlipUi.S(10)),
        };
        kindBoxes = DocNames.All.Select(kind => new CheckBox
        {
            Text = DocNames.Of(kind),
            AutoSize = false,
            Size = new Size(SlipUi.S(170), SlipUi.S(26)),
            Font = SlipUi.Body,
            Margin = new Padding(0, 0, SlipUi.S(8), SlipUi.S(6)),
        }).ToArray();
        var checks = new FlowLayoutPanel
        {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = true,
            MaximumSize = new Size(SlipUi.S(360), 0),
            Margin = Padding.Empty,
            Padding = Padding.Empty,
        };
        checks.Controls.AddRange(kindBoxes);
        var bundleEditor = Field(listColumn, Stack(bundleName, checks));

        var logButton = SlipUi.Plain("뽑은 기록 보기");
        var logStack = Stack(logButton, Note("누가 언제 어떤 서류를 뽑았는지 이 PC 안에만 남아요."));

        var docsBody = Grid(3);
        var docPrinterCell = Cell("서류 프린터 (A4)", printerStack);
        docsBody.Controls.Add(docPrinterCell, 0, 0);
        docsBody.SetColumnSpan(docPrinterCell, 2);
        var bundlesCell = Cell("묶음", bundleEditor);
        docsBody.Controls.Add(bundlesCell, 0, 1);
        docsBody.SetColumnSpan(bundlesCell, 2);
        var logCell = Cell("뽑은 기록", logStack);
        docsBody.Controls.Add(logCell, 0, 2);
        docsBody.SetColumnSpan(logCell, 2);

        DocsTabPanel = new Panel
        {
            Dock = DockStyle.Fill,
            AutoScroll = true,
            BackColor = Color.White,
            Margin = Padding.Empty,
            Padding = Padding.Empty,
        };

        tabs = new TabControl
        {
            Font = SlipUi.Body,
            Padding = new Point(SlipUi.S(14), SlipUi.S(5)),
            Margin = new Padding(SlipUi.S(TabsSide), SlipUi.S(10), SlipUi.S(TabsSide), SlipUi.S(12)),
        };
        DocsTabPanel.Controls.Add(docsBody);
        slipPage = Page("PT 종이", body);
        docsPage = Page("서류", DocsTabPanel);
        tabs.TabPages.Add(slipPage);
        tabs.TabPages.Add(docsPage);
        tabs.TabPages.Add(Page("단추 자리", buttonBody));
        FitTabs(body, buttonBody, docsBody);
        // 창 폭은 탭에 맞춘다(아래 줄·빨간 글도 같은 폭)
        var formWidth = tabs.Width + SlipUi.S(TabsSide * 2);

        errorLabel = SlipUi.ErrorBox(FormWidth);
        errorLabel.MinimumSize = new Size(formWidth - SlipUi.S(36), 0);
        errorLabel.MaximumSize = new Size(formWidth - SlipUi.S(36), 0);

        var cancelButton = SlipUi.Plain("취소");
        var saveButton = SlipUi.Primary("저장");
        var foot = new FootPanel(FormWidth) { Width = formWidth };
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
        root.Controls.Add(tabs);
        root.Controls.Add(errorLabel);
        root.Controls.Add(foot);
        Controls.Add(root);

        testButton.Click += (sender, e) => TestPrint();
        driverButton.Click += (sender, e) => EditDriver();
        // 버튼 자리 값이 클수록 비트 창 오른쪽 끝에서 더 왼쪽(Core SlipButton.Place)
        leftButton.Click += (sender, e) => MoveButton(SlipSettingsRules.ButtonOffsetStep);
        rightButton.Click += (sender, e) => MoveButton(-SlipSettingsRules.ButtonOffsetStep);
        docTestButton.Click += (sender, e) => DocTestPrint();
        bundleList.SelectedIndexChanged += (sender, e) => LoadBundle();
        bundleName.TextChanged += (sender, e) => OnBundleNameChanged();
        for (var i = 0; i < kindBoxes.Length; i++)
        {
            var kind = DocNames.All[i];
            var box = kindBoxes[i];
            box.CheckedChanged += (sender, e) => OnKindChanged(kind, box.Checked);
        }
        addBundleButton.Click += (sender, e) => AddBundle();
        removeBundleButton.Click += (sender, e) => RemoveBundle();
        logButton.Click += (sender, e) => ShowLog();
        if (bundleList.Items.Count > 0) bundleList.SelectedIndex = 0;
        LoadBundle();
        UpdateBundleButtons();
        cancelButton.Click += (sender, e) => Close();
        saveButton.Click += (sender, e) => Save();
        CancelButton = cancelButton;
        ActiveControl = itemsBox;
        // 처음 열 때 목록 글이 모두 골라진(파란) 채로 보이지 않게
        Shown += (sender, e) => itemsBox.Select(0, 0);
    }

    /// <summary>[저장]으로 쓴 새 설정. 저장하지 않고 닫았으면 null.</summary>
    public SlipSettings? Saved { get; private set; }

    /// <summary>[저장]으로 쓴 새 서류 설정(Saved와 함께 정해진다). 저장하지 않고 닫았으면 null.</summary>
    public DocSettings? SavedDocs { get; private set; }

    /// <summary>`서류` 탭의 판(탭 안을 꽉 채우고, 넘치면 스크롤). 서류 프린터·묶음·뽑은 기록 칸이 들어 있다</summary>
    internal Panel DocsTabPanel { get; }

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
            tabs.SelectedTab = slipPage;
            ShowError("치료 항목: " + items.Error);
            return;
        }
        var parts = SlipSettingsRules.ParseList(LinesOf(partsBox), SlipListKind.Parts);
        if (!parts.Ok)
        {
            tabs.SelectedTab = slipPage;
            ShowError("치료 부위: " + parts.Error);
            return;
        }
        var length = (int)lengthBox.Value;
        if (!SlipSettingsRules.IsPaperLength(length) || !SlipSettingsRules.IsButtonOffset(offset)) return;
        // 서류 묶음(AC-7401.2): 이름 1~10글자·겹침 없음·서류 1개 이상, 묶음 1~8개
        var check = DocSettingsRules.Check(bundles.Select(bundle => new DocBundle(bundle.Name, bundle.Kinds)).ToArray());
        if (!check.Ok)
        {
            tabs.SelectedTab = docsPage;
            ShowError(check.Error);
            return;
        }
        var next = new SlipSettings(items.Names, parts.Names, printerBox.SelectedItem as string ?? "", length, offset);
        var nextDocs = new DocSettings(ChosenDocPrinter(), check.Bundles);
        try
        {
            SettingsFile.WriteText(SlipSettingsRules.ToJson(next));
            SettingsFile.WriteDirectMode(directBox.Checked);
            DocFiles.WriteText(DocSettingsRules.ToJson(nextDocs));
        }
        catch (Exception)
        {
            ShowError("설정을 저장하지 못했어요. 다시 눌러 주세요.");
            return;
        }
        Saved = next;
        SavedDocs = nextDocs;
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

    /// <summary>서류 [시험 1장]: 고른 서류 프린터로 빈 A4에 테두리와 '서류 시험' 글만(환자 값 없음).</summary>
    private void DocTestPrint()
    {
        HideError();
        var printer = docPrinterBox.SelectedItem as string ?? "";
        Cursor = Cursors.WaitCursor;
        try
        {
            var page = new DocPage(new[]
            {
                DocOp.Box(10f, 10f, DocPage.WidthMm - 20f, DocPage.HeightMm - 20f, 0.5f),
                DocOp.Text(10f, DocPage.HeightMm / 2f - 10f, DocPage.WidthMm - 20f, 20f, "서류 시험", 28f, true, DocAlign.Center),
            });
            DocPrintJob.Send(printer, 1, (g, i) => DocDrawer.Draw(g, page));
        }
        catch (Exception)
        {
            ShowError(SlipUi.PrintFailed(DocPrintJob.Resolve(printer)));
        }
        finally
        {
            Cursor = Cursors.Default;
        }
    }

    /// <summary>서류 프린터: 처음에 빈칸(윈도우 기본)이었고 지금도 윈도우 기본 프린터를 골라 두었으면 빈칸 그대로 둔다(기본 프린터를 바꾸면 따라가게).</summary>
    private string ChosenDocPrinter()
    {
        var chosen = docPrinterBox.SelectedItem as string ?? "";
        if (originalDocs.PrinterName.Trim().Length == 0
            && (chosen.Length == 0 || string.Equals(chosen, DocPrintJob.DefaultPrinter(), StringComparison.OrdinalIgnoreCase))) return "";
        return chosen;
    }

    /// <summary>서류 프린터 목록. 설정이 빈칸이면 윈도우 기본 프린터를 미리 고른다.</summary>
    private void FillDocPrinters(string configured)
    {
        foreach (var installed in Printers.Installed()) docPrinterBox.Items.Add(installed);
        var chosen = string.IsNullOrWhiteSpace(configured) ? DocPrintJob.DefaultPrinter() : configured.Trim();
        if (string.IsNullOrEmpty(chosen)) return;
        // 설정에 적힌 프린터가 지금 없으면 그 이름을 그대로 보여 준다(고른 것을 몰래 바꾸지 않는다)
        if (!docPrinterBox.Items.Contains(chosen!)) docPrinterBox.Items.Add(chosen!);
        docPrinterBox.SelectedItem = chosen;
    }

    /// <summary>목록에서 고른 묶음을 오른쪽 이름 칸·서류 체크에</summary>
    private void LoadBundle()
    {
        if (loadingBundle) return;
        var bundle = SelectedBundle();
        loadingBundle = true;
        try
        {
            bundleName.Text = bundle?.Name ?? "";
            bundleName.Enabled = bundle != null;
            for (var i = 0; i < kindBoxes.Length; i++)
            {
                kindBoxes[i].Checked = bundle != null && bundle.Kinds.Contains(DocNames.All[i]);
                kindBoxes[i].Enabled = bundle != null;
            }
        }
        finally
        {
            loadingBundle = false;
        }
    }

    private void OnBundleNameChanged()
    {
        if (loadingBundle) return;
        var bundle = SelectedBundle();
        if (bundle == null) return;
        bundle.Name = bundleName.Text;
        loadingBundle = true;
        try
        {
            bundleList.Items[bundleList.SelectedIndex] = bundle.Name;
        }
        finally
        {
            loadingBundle = false;
        }
    }

    private void OnKindChanged(DocKind kind, bool on)
    {
        if (loadingBundle) return;
        var bundle = SelectedBundle();
        if (bundle == null) return;
        if (on) bundle.Kinds.Add(kind);
        else bundle.Kinds.Remove(kind);
    }

    /// <summary>[+ 더하기]: 겹치지 않는 이름의 빈 묶음(서류는 사용자가 고른다). 8개까지</summary>
    private void AddBundle()
    {
        if (bundles.Count >= DocSettingsRules.MaxBundles) return;
        var name = "새 묶음";
        for (var n = 2; bundles.Any(bundle => bundle.Name.Trim() == name); n++) name = "새 묶음 " + n;
        bundles.Add(new EditBundle(name, Array.Empty<DocKind>()));
        bundleList.Items.Add(name);
        bundleList.SelectedIndex = bundles.Count - 1;
        UpdateBundleButtons();
        bundleName.Focus();
        bundleName.SelectAll();
    }

    /// <summary>[빼기]: 고른 묶음을 뺀다. 하나는 남긴다</summary>
    private void RemoveBundle()
    {
        var index = bundleList.SelectedIndex;
        if (index < 0 || bundles.Count <= 1) return;
        bundles.RemoveAt(index);
        bundleList.Items.RemoveAt(index);
        bundleList.SelectedIndex = Math.Min(index, bundles.Count - 1);
        UpdateBundleButtons();
    }

    private void UpdateBundleButtons()
    {
        addBundleButton.Enabled = bundles.Count < DocSettingsRules.MaxBundles;
        removeBundleButton.Enabled = bundles.Count > 1;
    }

    private EditBundle? SelectedBundle()
    {
        var index = bundleList.SelectedIndex;
        return index >= 0 && index < bundles.Count ? bundles[index] : null;
    }

    /// <summary>[뽑은 기록 보기]: doc-log.tsv를 읽어 기록 창(읽기만)</summary>
    private void ShowLog()
    {
        using var form = new DocLogForm(DocFiles.ReadLines());
        form.ShowDialog(this);
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

    /// <summary>
    /// 탭 크기를 가장 큰 칸 묶음에 맞춘다(TabControl은 스스로 커지지 않는다). 탭 머리·테두리 몫은 윈도우가 알려 준 만큼(DisplayRectangle) 더한다.
    /// 서류 탭에 칸 묶음을 넣으면 그것도 생성자의 FitTabs에 함께 넘긴다(창 폭·아래 줄 폭이 이 크기로 정해진다).
    /// </summary>
    private void FitTabs(params Control[] bodies)
    {
        var content = Size.Empty;
        foreach (var body in bodies)
        {
            var preferred = body.PreferredSize;
            content = new Size(Math.Max(content.Width, preferred.Width), Math.Max(content.Height, preferred.Height));
        }
        tabs.Size = new Size(content.Width + SlipUi.S(40), content.Height + SlipUi.S(80));
        var display = tabs.DisplayRectangle;
        tabs.Size = new Size(content.Width + tabs.Width - display.Width, content.Height + tabs.Height - display.Height);
    }

    /// <summary>탭 한 장(흰 바탕, 안에 칸 묶음 하나).</summary>
    private static TabPage Page(string text, Control content)
    {
        var page = new TabPage(text)
        {
            UseVisualStyleBackColor = false,
            BackColor = Color.White,
            Padding = Padding.Empty,
            Margin = Padding.Empty,
        };
        content.Location = Point.Empty;
        page.Controls.Add(content);
        return page;
    }

    /// <summary>두 칸 표(시안 .setbody: 왼쪽 칸 + 틈, 오른쪽 칸).</summary>
    private static TableLayoutPanel Grid(int rows)
    {
        var grid = new TableLayoutPanel
        {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            ColumnCount = 2,
            RowCount = rows,
            Padding = new Padding(SlipUi.S(10), SlipUi.S(16), SlipUi.S(10), SlipUi.S(2)),
            Margin = Padding.Empty,
            BackColor = Color.White,
        };
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, SlipUi.S(CellWidth + Gap)));
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, SlipUi.S(CellWidth)));
        return grid;
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

    /// <summary>세로로 차례대로.</summary>
    private static FlowLayoutPanel Stack(params Control[] controls)
    {
        var stack = new FlowLayoutPanel
        {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            Margin = Padding.Empty,
            Padding = Padding.Empty,
        };
        stack.Controls.AddRange(controls);
        return stack;
    }

    /// <summary>흐린 작은 안내 글(시안 .hint).</summary>
    private static Label Note(string text) =>
        SlipUi.Caption(text, SlipUi.Help, SlipUi.Sub, new Padding(0, SlipUi.S(6), 0, 0), CellWidth * 2 + Gap);

    /// <summary>가로로 나란히(시안 .field).</summary>
    private static FlowLayoutPanel Field(params Control[] controls)
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

/// <summary>설정 창에서 고치는 중인 묶음 하나(저장할 때 DocSettingsRules.Check로 검사한다).</summary>
internal sealed class EditBundle
{
    public EditBundle(string name, IEnumerable<DocKind> kinds)
    {
        Name = name ?? "";
        Kinds = new HashSet<DocKind>(kinds ?? Enumerable.Empty<DocKind>());
    }

    public string Name { get; set; }

    public HashSet<DocKind> Kinds { get; }
}
