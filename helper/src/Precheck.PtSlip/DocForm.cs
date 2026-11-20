using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Globalization;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows.Forms;
using Precheck.Core.Bit;
using Precheck.Core.DocPrint;

namespace Precheck.PtSlip;

/// <summary>
/// 서류 창이 바깥과 닿는 곳(비트 열기·서류 4종·인쇄 보내기·기록 쓰기). 처음 값이 실제이고, 확인 프로그램은 가짜 DB·PDF 파일로 바꿔 넣는다.
/// 로그인·검사를 건너뛰는 길이 아니라 같은 창을 다른 자료로 돌려 보는 자리다.
/// </summary>
public sealed class DocServices
{
    /// <summary>비트 DB 열기(백그라운드에서 부른다). 실제는 DocLoader.OpenBit</summary>
    public Func<IBitDb> OpenDb { get; set; } = DocLoader.OpenBit;

    /// <summary>서류 4종. 실제는 DocSources.All</summary>
    public IReadOnlyList<IDocSource> Sources { get; set; } = DocSources.All;

    /// <summary>(프린터 이름, 쪽 수, i번째 쪽 그리기) → 한 인쇄 작업. 실제는 DocPrintJob.Send(대화상자 없이 종이로). 백그라운드에서 부른다</summary>
    public Action<string, int, Action<Graphics, int>> Send { get; set; } = (printer, pages, draw) => DocPrintJob.Send(printer, pages, draw);

    /// <summary>뽑은 기록 한 줄 더하기. 실제는 DocFiles.AppendLine(doc-log.tsv)</summary>
    public Action<string> AppendLog { get; set; } = DocFiles.AppendLine;
}

/// <summary>
/// '서류 한 번에 인쇄' 창(서류 시안 ②~⑤, spec doc-print AC-7402·AC-7403·AC-7404·AC-7406.2).
/// 환자 → 기간·왔던 날 → 묶음·서류 → [인쇄]. 판단은 Core(SearchInput·PatientFinder·QuickRange·VisitDays·DocPicks·DocPlan·DocLogLine),
/// 비트 읽기는 DocLoader(백그라운드, 0.3초 뒤, 마지막 요청만), 쪽 그리기는 DocDrawer, 보내기는 DocPrintJob.
/// 환자 값은 화면과 종이, 그리고 다 보낸 뒤의 뽑은 기록(doc-log.tsv) 말고는 어디에도 남기지 않는다.
/// </summary>
public sealed class DocForm : Form
{
    public const string Title = "서류 한 번에 인쇄";

    // 화면 글(시안 notes.md 그대로)
    public const string FromBitText = "비트에서 가져옴";
    public const string OtherPatientText = "다른 환자";
    public const string SearchCue = "차트번호나 이름";
    public const string FindText = "찾기";
    public const string LaterText = "기간 · 왔던 날 · 서류";
    public const string PickFirstText = "환자를 고르면 나와요.";
    public const string RxTag = "처방";
    public const string UnpaidTag = "수납 전";
    public const string UnpaidHelp = "'수납 전'인 날은 금액이 아직 없어서 처음엔 빠져 있어요. 수납한 뒤 다시 열면 체크돼요.";
    public const string BundleHelp = "묶음을 누르면 그 묶음의 서류만 체크돼요. 그 뒤에 하나씩 더하거나 빼도 돼요.";
    public const string ReceiptNote = "날짜마다";
    public const string RxNote = "처방 있는 날만";

    // 시안에 없는 경우의 글(시안 문장 모양을 따름)
    public const string NoDaysText = "이 기간에 왔던 날이 없어요.";
    public const string DaysFailedText = "비트에서 왔던 날을 읽지 못했어요. 비트가 켜져 있는지 봐 주세요.";
    public const string DocsFailedText = "비트에서 서류 내용을 읽지 못했어요. 비트가 켜져 있는지 봐 주세요.";

    /// <summary>시안 .doc 폭 980px(두 칸 490씩, 칸 안 여백 18)과 환자를 고르기 전 640px</summary>
    private const int WideWidth = 980;
    private const int NarrowWidth = 640;
    private const int ColWidth = 490;
    private const int ColInner = ColWidth - 36;
    private const int NarrowInner = NarrowWidth - 36;
    private const int DayRowHeight = 34;
    private const int DocRowHeight = 38;
    private const int DaysMaxHeight = 300;

    private readonly Action<IWin32Window> openSettings;
    private readonly DocServices services;
    private readonly DocLoader loader;
    private readonly DocPicks picks = new DocPicks();

    // 환자를 고르기 전(시안 ④)
    private readonly FlowLayoutPanel searchBody;
    private readonly FlowLayoutPanel laterCol;
    private readonly TextBox searchBox;
    private readonly Label searchHint;

    // 환자를 고른 뒤(시안 ②)
    private readonly FlowLayoutPanel mainBody;
    private readonly Label nameLabel;
    private readonly Label metaLabel;
    private readonly PillLabel fromPill;
    private readonly PillButton otherButton;
    private readonly DateTimePicker fromPicker;
    private readonly DateTimePicker toPicker;
    private readonly List<(QuickKind Kind, PillButton Button)> quickButtons = new List<(QuickKind, PillButton)>();
    private readonly Label dayCount;
    private readonly PillButton allButton;
    private readonly PillButton noneButton;
    private readonly Panel daysHead;
    private readonly RoundPanel daysBox;
    private readonly Panel daysScroll;
    private readonly CheckList dayList;
    private readonly Label noDays;
    private readonly Label unpaidHelp;
    private readonly Label daysError;
    private readonly FlowLayoutPanel bundleRow;
    private readonly List<(DocBundle Bundle, PillButton Button)> bundleButtons = new List<(DocBundle, PillButton)>();
    private readonly CheckList docList;
    private readonly Label docsError;

    // 아래
    private readonly NoticeBox notice;
    private readonly FootPanel foot;
    private readonly PillButton settingsButton;
    private readonly SumText sum;
    private readonly PillButton closeButton;
    private readonly PillButton printButton;

    private DocSettings settings;
    private string? printerName;
    private PatientHit? patient;
    private bool wide;
    private QuickKind? quick = QuickRange.Default;
    private IReadOnlyList<VisitDay> days = Array.Empty<VisitDay>();
    private bool[] dayOn = new bool[0];
    private bool daysLoading;
    private bool daysFailed;
    /// <summary>서류마다 그린 쪽 수(고르지 않은 서류도 센다). null이면 세는 중</summary>
    private Dictionary<DocKind, int>? counts;
    private bool countFailed;
    private bool sending;
    private bool settingDates;

    /// <param name="settings">서류 프린터·묶음(doc-settings.json).</param>
    /// <param name="chartFromBit">[서류]를 누를 때 맨 앞 비트 창 제목에서 꺼낸 차트번호(CurrentChart.FromTitle). 못 읽었으면 null.</param>
    /// <param name="openSettings">[⚙ 설정]을 누르면 이 창을 주인으로 설정 창을 연다.</param>
    /// <param name="services">바깥과 닿는 곳. null이면 실제(비트·서류 4종·프린터·doc-log.tsv).</param>
    public DocForm(DocSettings settings, string? chartFromBit, Action<IWin32Window> openSettings, DocServices? services = null)
    {
        this.settings = settings ?? throw new ArgumentNullException(nameof(settings));
        this.openSettings = openSettings ?? throw new ArgumentNullException(nameof(openSettings));
        this.services = services ?? new DocServices();
        loader = new DocLoader(this, this.services.OpenDb);
        printerName = DocPrintJob.Resolve(settings.PrinterName);

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

        // ── 환자를 고르기 전(시안 ④): 찾기 칸 하나 + 아래는 흐린 안내
        searchBox = new TextBox { BorderStyle = BorderStyle.None, Font = DocUi.SearchFont, MaxLength = 30 };
        DocUi.SetCue(searchBox, SearchCue);
        var findButton = SlipUi.Plain(FindText);
        findButton.Margin = new Padding(SlipUi.S(8), 0, 0, 0);
        findButton.Anchor = AnchorStyles.Left;
        var input = new InputBox(searchBox, NarrowInner - 8) { Margin = Padding.Empty, Anchor = AnchorStyles.Left };
        input.Width = SlipUi.S(NarrowInner) - SlipUi.S(8) - findButton.Width;
        var searchRow = Row(input, findButton);
        searchHint = DocUi.Hint("", NarrowInner, new Padding(0, SlipUi.S(6), 0, 0));
        var patientCol = DocUi.Column(NarrowWidth, new Padding(SlipUi.S(18), SlipUi.S(16), SlipUi.S(18), SlipUi.S(16)));
        patientCol.Controls.Add(SlipUi.Heading("환자"));
        patientCol.Controls.Add(searchRow);
        patientCol.Controls.Add(searchHint);
        laterCol = DocUi.Column(NarrowWidth, new Padding(SlipUi.S(18), SlipUi.S(16), SlipUi.S(18), SlipUi.S(16)));
        laterCol.Controls.Add(SlipUi.Caption(LaterText, SlipUi.BodyBold, DocUi.Off, new Padding(0, 0, 0, SlipUi.S(8))));
        laterCol.Controls.Add(DocUi.Hint(PickFirstText, NarrowInner, Padding.Empty));
        searchBody = DocUi.Stack(FlowDirection.TopDown);
        searchBody.Controls.Add(patientCol);
        searchBody.Controls.Add(laterCol);
        searchBody.Paint += (sender, e) => DocUi.TopLine(e.Graphics, laterCol.Top, searchBody.Width);

        // ── 환자를 고른 뒤(시안 ②) 왼쪽 칸: 환자 → 기간 → 왔던 날
        nameLabel = new Label { AutoSize = true, UseMnemonic = false, Font = SlipUi.WhoFont, ForeColor = SlipUi.Ok, Anchor = AnchorStyles.Left, Margin = new Padding(0, 0, SlipUi.S(12), SlipUi.S(2)) };
        metaLabel = new Label { AutoSize = true, UseMnemonic = false, Font = SlipUi.Body, ForeColor = SlipUi.Ink, Anchor = AnchorStyles.Left, Margin = new Padding(0, 0, SlipUi.S(12), SlipUi.S(2)) };
        fromPill = new PillLabel(FromBitText) { Anchor = AnchorStyles.Left, Margin = new Padding(0, 0, SlipUi.S(12), SlipUi.S(2)) };
        otherButton = DocUi.Chip(OtherPatientText, SlipUi.Small, SlipUi.Small, 32, 12, new Padding(0, SlipUi.S(6), 0, 0));
        otherButton.Anchor = AnchorStyles.Left;
        var whoCard = new RoundFlow
        {
            Padding = new Padding(SlipUi.S(12), SlipUi.S(10), SlipUi.S(12), SlipUi.S(10)),
            MinimumSize = new Size(SlipUi.S(ColInner), 0),
            MaximumSize = new Size(SlipUi.S(ColInner), 0),
            Margin = new Padding(0, 0, 0, SlipUi.S(16)),
        };
        whoCard.Controls.Add(nameLabel);
        whoCard.Controls.Add(metaLabel);
        whoCard.Controls.Add(fromPill);
        whoCard.Controls.Add(otherButton);

        fromPicker = DocUi.DatePicker();
        toPicker = DocUi.DatePicker();
        var tilde = SlipUi.Caption("~", SlipUi.Body, SlipUi.Ink, new Padding(SlipUi.S(8), 0, SlipUi.S(8), 0));
        tilde.Anchor = AnchorStyles.Left;
        var rangeRow = Row(fromPicker, tilde, toPicker);
        rangeRow.Margin = new Padding(0, 0, 0, SlipUi.S(8));
        var quickRow = SlipUi.Flow(ColInner, new Padding(0, 0, 0, SlipUi.S(10)));
        foreach (var kind in QuickRange.Kinds)
        {
            var button = DocUi.Chip(QuickRange.NameOf(kind), SlipUi.Small, SlipUi.SmallBold, 32, 11, new Padding(0, 0, SlipUi.S(6), SlipUi.S(6)));
            var picked = kind;
            button.Click += (sender, e) => OnQuick(picked);
            quickButtons.Add((kind, button));
            quickRow.Controls.Add(button);
        }

        var daysLabel = SlipUi.Caption("왔던 날", SlipUi.BodyBold, SlipUi.Ink, Padding.Empty);
        dayCount = SlipUi.Caption("", SlipUi.Help, SlipUi.Sub, Padding.Empty);
        allButton = DocUi.Mini("모두");
        noneButton = DocUi.Mini("모두 풀기");
        daysHead = new Panel { Size = new Size(SlipUi.S(ColInner), SlipUi.S(28)), Margin = new Padding(0, 0, 0, SlipUi.S(8)) };
        daysHead.Controls.Add(daysLabel);
        daysHead.Controls.Add(dayCount);
        daysHead.Controls.Add(allButton);
        daysHead.Controls.Add(noneButton);
        daysHead.Layout += (sender, e) =>
        {
            var h = daysHead.Height;
            daysLabel.Location = new Point(0, (h - daysLabel.Height) / 2);
            dayCount.Location = new Point(daysLabel.Right + SlipUi.S(8), (h - dayCount.Height) / 2);
            noneButton.Location = new Point(daysHead.Width - noneButton.Width, (h - noneButton.Height) / 2);
            allButton.Location = new Point(noneButton.Left - SlipUi.S(6) - allButton.Width, (h - allButton.Height) / 2);
        };

        dayList = new CheckList(DayRowHeight, 10) { Dock = DockStyle.Top };
        daysScroll = new Panel { Dock = DockStyle.Fill, AutoScroll = true, BackColor = Color.White };
        daysScroll.Controls.Add(dayList);
        noDays = new Label { Dock = DockStyle.Fill, Text = "", UseMnemonic = false, Font = SlipUi.Small, ForeColor = SlipUi.Sub, TextAlign = ContentAlignment.MiddleLeft, Padding = new Padding(SlipUi.S(10), 0, 0, 0), Visible = false };
        daysBox = new RoundPanel { Size = new Size(SlipUi.S(ColInner), SlipUi.S(DayRowHeight) + 4), Padding = new Padding(2), Margin = Padding.Empty };
        daysBox.Controls.Add(daysScroll);
        daysBox.Controls.Add(noDays);
        unpaidHelp = DocUi.Hint(UnpaidHelp, ColInner, new Padding(0, SlipUi.S(6), 0, 0));
        daysError = DocUi.Hint(DaysFailedText, ColInner, new Padding(0, SlipUi.S(6), 0, 0));
        daysError.ForeColor = SlipUi.Bad;

        var left = DocUi.Column(ColWidth, new Padding(SlipUi.S(18), SlipUi.S(16), SlipUi.S(18), SlipUi.S(16)));
        left.Controls.Add(SlipUi.Heading("환자"));
        left.Controls.Add(whoCard);
        left.Controls.Add(SlipUi.Heading("기간"));
        left.Controls.Add(rangeRow);
        left.Controls.Add(quickRow);
        left.Controls.Add(daysHead);
        left.Controls.Add(daysBox);
        left.Controls.Add(unpaidHelp);
        left.Controls.Add(daysError);

        // 오른쪽 칸: 묶음 → 서류
        bundleRow = SlipUi.Flow(ColInner, Padding.Empty);
        docList = new CheckList(DocRowHeight, 12) { Dock = DockStyle.Fill };
        var docsBox = new RoundPanel { Size = new Size(SlipUi.S(ColInner), SlipUi.S(DocRowHeight) * DocNames.All.Count + 4), Padding = new Padding(2), Margin = Padding.Empty };
        docsBox.Controls.Add(docList);
        docsError = DocUi.Hint(DocsFailedText, ColInner, new Padding(0, SlipUi.S(6), 0, 0));
        docsError.ForeColor = SlipUi.Bad;
        var right = DocUi.Column(ColWidth, new Padding(SlipUi.S(18), SlipUi.S(16), SlipUi.S(18), SlipUi.S(16)));
        right.Controls.Add(SlipUi.Heading("묶음"));
        right.Controls.Add(bundleRow);
        right.Controls.Add(DocUi.Hint(BundleHelp, ColInner, new Padding(0, 0, 0, SlipUi.S(16))));
        right.Controls.Add(SlipUi.Heading("서류"));
        right.Controls.Add(docsBox);
        right.Controls.Add(docsError);

        mainBody = DocUi.Stack(FlowDirection.LeftToRight);
        mainBody.Controls.Add(left);
        mainBody.Controls.Add(right);
        // 두 칸 사이 세로줄(시안 .col + .col): 오른쪽 칸 왼쪽 끝, 그 칸보다 아래는 바깥 판이 잇는다
        right.Paint += (sender, e) =>
        {
            using var pen = new Pen(SlipUi.Line);
            e.Graphics.DrawLine(pen, 0, 0, 0, right.Height);
        };
        mainBody.Paint += (sender, e) =>
        {
            using var pen = new Pen(SlipUi.Line);
            e.Graphics.DrawLine(pen, right.Left, 0, right.Left, mainBody.Height);
        };

        // ── 아래: 알림(보내는 중·실패) + 아래 줄
        notice = new NoticeBox(WideWidth);
        settingsButton = SlipUi.Ghost("⚙ 설정");
        sum = new SumText();
        closeButton = SlipUi.Plain("닫기");
        closeButton.DisabledFill = Color.White;
        closeButton.DisabledInk = DocUi.Off;
        printButton = SlipUi.Primary("인쇄");
        foot = new FootPanel(NarrowWidth);
        foot.Controls.Add(settingsButton);
        foot.Controls.Add(sum);
        foot.Controls.Add(closeButton);
        foot.Controls.Add(printButton);

        var root = DocUi.Stack(FlowDirection.TopDown);
        root.Location = Point.Empty;
        root.Controls.Add(searchBody);
        root.Controls.Add(mainBody);
        root.Controls.Add(notice);
        root.Controls.Add(foot);
        Controls.Add(root);

        // 처음: 이번 달, 첫 묶음
        var month = QuickRange.Of(QuickRange.Default, DateTime.Today, null);
        SetDates(month.From, month.To);
        if (settings.Bundles.Count > 0) picks.Apply(settings.Bundles[0]);
        BuildBundles();

        searchBox.KeyDown += (sender, e) =>
        {
            if (e.KeyCode != Keys.Enter) return;
            e.SuppressKeyPress = true;
            Search();
        };
        findButton.Click += (sender, e) => Search();
        otherButton.Click += (sender, e) =>
        {
            if (sending) return;
            searchBox.Text = "";
            ShowSearch("", false);
        };
        fromPicker.ValueChanged += (sender, e) => OnDatesChanged();
        toPicker.ValueChanged += (sender, e) => OnDatesChanged();
        allButton.Click += (sender, e) => SetAllDays(true);
        noneButton.Click += (sender, e) => SetAllDays(false);
        dayList.Toggled += OnDayToggled;
        docList.Toggled += OnDocToggled;
        settingsButton.Click += (sender, e) =>
        {
            if (!sending) this.openSettings(this);
        };
        closeButton.Click += (sender, e) => Close();
        printButton.Click += (sender, e) => Print();
        CancelButton = closeButton;
        Shown += (sender, e) =>
        {
            Activate();
            if (!wide) searchBox.Focus();
        };

        var chart = chartFromBit == null ? null : SearchInput.Parse(chartFromBit);
        if (chart != null && chart.Kind == SearchKind.Chart)
        {
            // 비트에서 보던 환자: 그 차트번호로 찾는 동안 찾기 칸에 번호를 두고, 찾으면 '비트에서 가져옴'
            searchBox.Text = chart.Value;
            ShowSearch("", false);
            loader.Run(DocLane.Patient, db => PatientFinder.Find(db, chart, DateTime.Today), result => OnFound(result, true), () => OnFound(new PatientResult(PatientKind.Failed), true));
        }
        else
        {
            ShowSearch(PatientFinder.NoCurrentMessage, false);
        }
    }

    /// <summary>[인쇄]를 보내는 중(창을 닫거나 바꾸면 안 된다).</summary>
    public bool IsSending => sending;

    /// <summary>지금 고른 환자가 그 차트번호(앞 0 뺀 숫자)인가.</summary>
    public bool ShowsChart(string? chart) =>
        patient != null && chart != null && string.Equals(patient.Chart.TrimStart('0'), chart.TrimStart('0'), StringComparison.Ordinal);

    /// <summary>설정을 저장하면 새 프린터·묶음으로(고른 서류는 그대로 둔다).</summary>
    public void ApplySettings(DocSettings next)
    {
        settings = next ?? throw new ArgumentNullException(nameof(next));
        printerName = DocPrintJob.Resolve(settings.PrinterName);
        BuildBundles();
        RenderFoot();
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        // 보내는 동안은 닫지 않는다(반쪽 작업·기록 없는 종이가 남지 않게)
        if (sending && e.CloseReason == CloseReason.UserClosing) e.Cancel = true;
        base.OnFormClosing(e);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) loader.Dispose();
        base.Dispose(disposing);
    }

    // ───────────── 환자

    private void Search()
    {
        if (sending || wide) return;
        var input = SearchInput.Parse(searchBox.Text);
        if (input.Kind == SearchKind.Empty)
        {
            loader.Cancel(DocLane.Patient);
            SetSearchHint("", false);
            searchBox.Focus();
            return;
        }
        if (input.Kind == SearchKind.Invalid)
        {
            // 틀린 글은 비트에 묻지 않는다
            loader.Cancel(DocLane.Patient);
            SetSearchHint(PatientFinder.Message(new PatientResult(PatientKind.None)), true);
            return;
        }
        SetSearchHint("", false);
        loader.Run(DocLane.Patient, db => PatientFinder.Find(db, input, DateTime.Today), result => OnFound(result, false), () => OnFound(new PatientResult(PatientKind.Failed), false));
    }

    private void OnFound(PatientResult result, bool fromBit)
    {
        if (sending || wide) return;
        switch (result.Kind)
        {
            case PatientKind.Found:
                ShowPatient(result.Hits[0], fromBit);
                return;
            case PatientKind.Many:
                SetSearchHint(PatientFinder.Message(result), false);
                using (var pick = new PatientPickForm(result.Hits))
                {
                    if (pick.ShowDialog(this) == DialogResult.OK && pick.Chosen != null) ShowPatient(pick.Chosen, false);
                }
                return;
            case PatientKind.Failed:
                SetSearchHint(PatientFinder.Message(result), true);
                return;
            default:
                if (fromBit)
                {
                    // 비트 창의 번호로 못 찾았으면 빈 찾기 칸으로(시안 ④)
                    searchBox.Text = "";
                    SetSearchHint(PatientFinder.NoCurrentMessage, false);
                }
                else
                {
                    SetSearchHint(PatientFinder.Message(result), true);
                }
                searchBox.Focus();
                return;
        }
    }

    /// <summary>환자를 고르기 전 모양(시안 ④). 고른 환자·왔던 날·장 수는 버린다.</summary>
    private void ShowSearch(string hint, bool bad)
    {
        loader.Cancel(DocLane.Days);
        loader.Cancel(DocLane.Count);
        patient = null;
        days = Array.Empty<VisitDay>();
        dayOn = new bool[0];
        counts = null;
        notice.HideNotice();
        SetSearchHint(hint, bad);
        SetWide(false);
        if (Visible) searchBox.Focus();
    }

    private void SetSearchHint(string text, bool bad)
    {
        searchHint.Text = text;
        searchHint.ForeColor = bad ? SlipUi.Bad : SlipUi.Sub;
        searchHint.Visible = text.Length > 0;
    }

    /// <summary>환자를 채우고(시안 ②) 지금 기간의 왔던 날을 읽는다.</summary>
    private void ShowPatient(PatientHit hit, bool fromBit)
    {
        loader.Cancel(DocLane.Patient);
        patient = hit;
        nameLabel.Text = hit.Name;
        metaLabel.Text = string.Join(" · ", new[] { hit.BirthText, hit.SexText, "차트 " + hit.Chart }.Where(part => part.Length > 0));
        fromPill.Visible = fromBit;
        notice.HideNotice();
        SetWide(true);
        if (quick == QuickKind.All) LoadAll();
        else LoadDays();
    }

    // ───────────── 기간·왔던 날

    private void OnQuick(QuickKind kind)
    {
        if (sending || patient == null) return;
        quick = kind;
        RenderChips();
        if (kind == QuickKind.All)
        {
            LoadAll();
            return;
        }
        var range = QuickRange.Of(kind, DateTime.Today, null);
        SetDates(range.From, range.To);
        LoadDays();
    }

    private void OnDatesChanged()
    {
        if (settingDates || sending) return;
        quick = null;
        RenderChips();
        if (patient != null) LoadDays();
    }

    private void SetDates(DateTime from, DateTime to)
    {
        settingDates = true;
        try
        {
            fromPicker.Value = from.Date;
            toPicker.Value = to.Date;
        }
        finally
        {
            settingDates = false;
        }
    }

    private void LoadDays()
    {
        if (patient == null) return;
        var chart = patient.Chart;
        var from = fromPicker.Value.Date;
        var to = toPicker.Value.Date;
        StartDays();
        loader.Run(DocLane.Days, db => VisitDays.Read(db, chart, from, to), OnDays, OnDaysFailed);
    }

    /// <summary>'전체': 첫 내원을 읽어 기간을 정하고 그 기간의 왔던 날을 함께 읽는다.</summary>
    private void LoadAll()
    {
        if (patient == null) return;
        var chart = patient.Chart;
        StartDays();
        loader.Run(DocLane.Days, db =>
        {
            var range = QuickRange.Of(QuickKind.All, DateTime.Today, VisitDays.FirstVisit(db, chart));
            return (range.From, range.To, Days: VisitDays.Read(db, chart, range.From, range.To));
        }, read =>
        {
            SetDates(read.From, read.To);
            OnDays(read.Days);
        }, OnDaysFailed);
    }

    private void StartDays()
    {
        loader.Cancel(DocLane.Count);
        days = Array.Empty<VisitDay>();
        dayOn = new bool[0];
        daysLoading = true;
        daysFailed = false;
        counts = null;
        countFailed = false;
        RenderDays();
        RenderDocs();
        RenderFoot();
    }

    private void OnDays(IReadOnlyList<VisitDay> read)
    {
        days = read;
        // 수납 전인 날은 처음엔 체크를 풀어 둔다(AC-7403.2)
        dayOn = read.Select(day => !day.Unpaid).ToArray();
        daysLoading = false;
        daysFailed = false;
        RenderDays();
        LoadCounts();
    }

    private void OnDaysFailed()
    {
        days = Array.Empty<VisitDay>();
        dayOn = new bool[0];
        daysLoading = false;
        daysFailed = true;
        counts = null;
        RenderDays();
        RenderDocs();
        RenderFoot();
    }

    private void OnDayToggled(int index)
    {
        if (sending || index < 0 || index >= dayOn.Length) return;
        dayOn[index] = !dayOn[index];
        RenderDays();
        LoadCounts();
    }

    private void SetAllDays(bool on)
    {
        if (sending || dayOn.Length == 0) return;
        for (var i = 0; i < dayOn.Length; i++) dayOn[i] = on;
        RenderDays();
        LoadCounts();
    }

    private IReadOnlyList<VisitDay> ChosenDays() => days.Where((day, i) => i < dayOn.Length && dayOn[i]).ToArray();

    // ───────────── 묶음·서류·장 수

    private void BuildBundles()
    {
        bundleRow.SuspendLayout();
        SlipUi.ClearControls(bundleRow);
        bundleButtons.Clear();
        foreach (var bundle in settings.Bundles)
        {
            var button = DocUi.Chip(bundle.Name, SlipUi.Body, SlipUi.BodyBold, 36, 14, new Padding(0, 0, SlipUi.S(6), SlipUi.S(6)));
            var picked = bundle;
            button.Click += (sender, e) =>
            {
                if (sending) return;
                picks.Apply(picked);
                RenderDocs();
                RenderFoot();
            };
            bundleButtons.Add((bundle, button));
            bundleRow.Controls.Add(button);
        }
        bundleRow.ResumeLayout(true);
        RenderDocs();
    }

    private void OnDocToggled(int index)
    {
        if (sending || index < 0 || index >= DocNames.All.Count) return;
        picks.Toggle(DocNames.All[index]);
        RenderDocs();
        RenderFoot();
    }

    /// <summary>고른 날이 바뀌면 서류 4종의 장 수를 다시 센다(Core DocPlan, 고른 날이 없으면 비트에 묻지 않고 0).</summary>
    private void LoadCounts()
    {
        loader.Cancel(DocLane.Count);
        countFailed = false;
        var chosen = ChosenDays();
        if (patient == null || chosen.Count == 0)
        {
            counts = DocNames.All.ToDictionary(kind => kind, kind => 0);
            RenderDocs();
            RenderFoot();
            return;
        }
        counts = null;
        RenderDocs();
        RenderFoot();
        var hit = patient;
        var from = fromPicker.Value.Date;
        var to = toPicker.Value.Date;
        var sources = services.Sources;
        loader.Run(DocLane.Count, db =>
        {
            var plan = DocPlan.Build(sources, db, Context(db, hit, chosen, from, to), DocNames.All);
            return DocNames.All.ToDictionary(kind => kind, plan.CountOf);
        }, read =>
        {
            counts = read;
            RenderDocs();
            RenderFoot();
        }, () =>
        {
            countFailed = true;
            RenderDocs();
            RenderFoot();
        });
    }

    private static DocContext Context(IBitDb db, PatientHit hit, IReadOnlyList<VisitDay> chosen, DateTime from, DateTime to)
    {
        var today = DateTime.Today;
        return new DocContext(hit.Chart, hit, chosen, from, to, HospitalInfo.Read(db, today), DocDrawer.WidthMm, today);
    }

    private int Total() => counts == null ? 0 : picks.Kinds.Sum(kind => counts.TryGetValue(kind, out var n) ? n : 0);

    /// <summary>[인쇄]: 환자·날짜 1개·서류 1개 이상이고 다 센 장 수가 0보다 클 때만(AC-7404.2).</summary>
    private bool CanPrint() =>
        !sending && patient != null && counts != null && !daysLoading && ChosenDays().Count > 0 && picks.Kinds.Count > 0 && Total() > 0;

    // ───────────── 그리기

    private void SetWide(bool next)
    {
        var shown = Visible;
        var center = new Point(Left + Width / 2, Top + Height / 2);
        wide = next;
        SuspendLayout();
        searchBody.Visible = !wide;
        mainBody.Visible = wide;
        foot.Width = SlipUi.S(wide ? WideWidth : NarrowWidth);
        RenderChips();
        RenderDays();
        RenderDocs();
        RenderFoot();
        ResumeLayout(true);
        if (!shown) return;
        // 크기가 바뀌어도 창 가운데는 그대로(화면 밖으로는 안 나가게)
        var area = Screen.FromControl(this).WorkingArea;
        var x = Math.Max(area.Left, Math.Min(center.X - Width / 2, area.Right - Width));
        var y = Math.Max(area.Top, Math.Min(center.Y - Height / 2, area.Bottom - Height));
        Location = new Point(x, y);
    }

    private void RenderChips()
    {
        foreach (var (kind, button) in quickButtons) DocUi.SetOn(button, quick == kind, SlipUi.Accent, SlipUi.Small, SlipUi.SmallBold);
    }

    private void RenderDays()
    {
        var chosen = dayOn.Count(on => on);
        dayCount.Text = daysLoading || daysFailed ? "" : days.Count.ToString(CultureInfo.InvariantCulture) + "일 중 " + chosen.ToString(CultureInfo.InvariantCulture) + "일 고름";
        daysHead.PerformLayout();
        var rows = new List<CheckRow>();
        for (var i = 0; i < days.Count; i++)
        {
            var day = days[i];
            var row = new CheckRow(day.DateText, dayOn[i]) { Muted = !dayOn[i] };
            if (day.HasRx) row.Tags.Add((RxTag, SlipUi.Ok, DocUi.OkSoft));
            if (day.Unpaid) row.Tags.Add((UnpaidTag, DocUi.Warn, DocUi.WarnSoft));
            rows.Add(row);
        }
        var oldScroll = daysScroll.AutoScrollPosition;
        dayList.SetRows(rows);
        daysScroll.Visible = rows.Count > 0;
        noDays.Visible = rows.Count == 0;
        noDays.Text = daysLoading || daysFailed ? "" : NoDaysText;
        var inner = rows.Count == 0 ? SlipUi.S(DayRowHeight) : Math.Min(rows.Count * dayList.RowHeight, SlipUi.S(DaysMaxHeight));
        daysBox.Height = inner + daysBox.Padding.Vertical;
        // 체크를 바꿔도 보던 자리 그대로
        daysScroll.AutoScrollPosition = new Point(-oldScroll.X, -oldScroll.Y);
        unpaidHelp.Visible = days.Any(day => day.Unpaid);
        daysError.Visible = daysFailed;
        allButton.Enabled = noneButton.Enabled = days.Count > 0;
    }

    private void RenderDocs()
    {
        var rows = new List<CheckRow>();
        foreach (var kind in DocNames.All)
        {
            var on = picks.IsOn(kind);
            var count = counts != null && counts.TryGetValue(kind, out var n) ? n.ToString(CultureInfo.InvariantCulture) + "장" : countFailed ? "-" : "…";
            rows.Add(new CheckRow(DocNames.Of(kind), on)
            {
                Right = patient == null ? "" : count,
                RightNote = kind == DocKind.Receipt ? ReceiptNote : kind == DocKind.RxCopy ? RxNote : "",
                RightDim = !on,
            });
        }
        docList.SetRows(rows);
        var chosen = new HashSet<DocKind>(picks.Kinds);
        foreach (var (bundle, button) in bundleButtons)
        {
            var same = chosen.SetEquals(bundle.Kinds);
            DocUi.SetOn(button, same, SlipUi.Navy, SlipUi.Body, SlipUi.BodyBold);
        }
        docsError.Visible = countFailed;
    }

    private void RenderFoot()
    {
        var printer = printerName ?? "프린터 없음";
        sum.Visible = wide;
        sum.Set(printer, wide && counts != null && !countFailed ? Total() : (int?)null);
        var label = wide && counts != null && !countFailed ? "인쇄 (" + Total().ToString(CultureInfo.InvariantCulture) + "장)" : "인쇄";
        if (printButton.Text != label)
        {
            printButton.Text = label;
            printButton.Width = Math.Max(SlipUi.S(120), TextRenderer.MeasureText(label, SlipUi.PrimaryFont).Width + SlipUi.S(36));
        }
        printButton.Enabled = CanPrint();
        closeButton.Enabled = !sending;
        settingsButton.Enabled = !sending;
        printButton.Invalidate();
        LayoutFoot();
    }

    /// <summary>아래 줄(시안 .foot): 왼쪽 [⚙ 설정], 오른쪽부터 [인쇄] [닫기] 프린터·모두 N장</summary>
    private void LayoutFoot()
    {
        var h = foot.Height;
        settingsButton.Location = new Point(SlipUi.S(18), (h - settingsButton.Height) / 2);
        var x = foot.Width - SlipUi.S(18);
        // 창이 보이기 전에는 Visible이 늘 거짓이라, 보일지 말지는 지금 모양(wide)으로 정한다
        foreach (var control in wide ? new Control[] { printButton, closeButton, sum } : new Control[] { printButton, closeButton })
        {
            x -= control.Width;
            control.Location = new Point(x, (h - control.Height) / 2);
            x -= SlipUi.S(8);
        }
        foot.Invalidate();
    }

    // ───────────── 인쇄

    /// <summary>
    /// [인쇄](AC-7406.2): 지금 고른 날·서류로 쪽 계획(DocPlan, 서류 차례·날짜순)을 다시 읽어 서류 프린터로 한 작업에 보낸다.
    /// 읽기·그리기·보내기는 백그라운드 한 덩어리이고, 화면은 BeginInvoke로만 고친다. 보내는 동안 'N장 중 M장' 막대와 잠금.
    /// 다 보내면 뽑은 기록 한 줄을 남기고 창을 닫는다. 못 보내면 창을 두고 빨간 글(고른 것은 그대로).
    /// </summary>
    private void Print()
    {
        if (!CanPrint() || patient == null) return;
        var job = new PrintJob(patient, ChosenDays(), picks.Kinds, fromPicker.Value.Date, toPicker.Value.Date, printerName, services);
        sending = true;
        loader.Cancel(DocLane.Count);
        Lock(true);
        notice.ShowRun(0, Total());
        RenderFoot();
        Task.Run(() => Send(job)).ContinueWith(task =>
        {
            // Send는 예외를 밖으로 내지 않는다. 그래도 무슨 일이 생기면 못 보낸 것으로 본다
            var outcome = task.Status == TaskStatus.RanToCompletion ? task.Result : PrintOutcome.SendFailed;
            _ = task.Exception;
            OnUi(() => AfterPrint(outcome, job.Printer));
        }, TaskScheduler.Default);
    }

    /// <summary>백그라운드: 쪽 계획 읽기 → 보내기 → (다 보냈으면) 기록 한 줄. 화면은 OnUi로만</summary>
    private PrintOutcome Send(PrintJob job)
    {
        DocPlan plan;
        try
        {
            plan = loader.ReadNow(db => DocPlan.Build(job.Services.Sources, db, Context(db, job.Patient, job.Days, job.From, job.To), job.Kinds));
        }
        catch (Exception)
        {
            return PrintOutcome.ReadFailed;
        }
        if (!plan.CanPrint) return PrintOutcome.Nothing;
        var total = plan.Total;
        var pages = plan.Pages;
        OnUi(() =>
        {
            if (sending) notice.ShowRun(0, total);
        });
        if (job.Printer == null) return PrintOutcome.SendFailed;
        try
        {
            job.Services.Send(job.Printer, total, (g, i) =>
            {
                DocDrawer.Draw(g, pages[i]);
                var done = i + 1;
                OnUi(() =>
                {
                    if (sending) notice.ShowRun(done, total);
                });
            });
        }
        catch (Exception)
        {
            // 프린터 오류 글은 보이지 않는다(값이 섞일 수 있다). 정해 둔 글만 보인다
            return PrintOutcome.SendFailed;
        }
        try
        {
            // 기록에는 다 보낸 것만(AC-7401.3)
            job.Services.AppendLog(new DocLogLine(DateTime.Now, job.Patient.Chart, job.Patient.Name, plan.Kinds, job.From, job.To, job.Days.Count, total).ToTsv());
        }
        catch (Exception)
        {
            // 종이는 다 나갔다. 기록만 못 남겼으니 창은 그대로 닫는다
        }
        return PrintOutcome.Sent;
    }

    private void AfterPrint(PrintOutcome outcome, string? printer)
    {
        switch (outcome)
        {
            case PrintOutcome.Sent:
                sending = false;
                Close();
                return;
            case PrintOutcome.ReadFailed:
                Fail(DocsFailedText);
                return;
            case PrintOutcome.SendFailed:
                Fail(SlipUi.PrintFailed(printer));
                return;
            default:
                // 그 사이 비트 자료가 바뀌어 뽑을 쪽이 없어졌다: 장 수를 다시 센다
                sending = false;
                Lock(false);
                notice.HideNotice();
                LoadCounts();
                return;
        }
    }

    /// <summary>창의 화면 스레드에서 action(창이 닫혔으면 버림)</summary>
    private void OnUi(Action action)
    {
        if (IsDisposed || !IsHandleCreated) return;
        try
        {
            BeginInvoke(action);
        }
        catch (InvalidOperationException)
        {
            // 창이 닫히는 중
        }
    }

    private void Fail(string text)
    {
        sending = false;
        Lock(false);
        notice.ShowBad(text);
        RenderFoot();
    }

    /// <summary>보내는 동안 고를 칸을 잠근다(단추들은 sending으로 막고, 날짜·목록은 끈다)</summary>
    private void Lock(bool locked)
    {
        fromPicker.Enabled = !locked;
        toPicker.Enabled = !locked;
        dayList.Enabled = !locked;
        docList.Enabled = !locked;
        otherButton.Enabled = !locked;
        allButton.Enabled = noneButton.Enabled = !locked && days.Count > 0;
        RenderFoot();
    }

    private static FlowLayoutPanel Row(params Control[] controls)
    {
        var row = DocUi.Stack(FlowDirection.LeftToRight);
        row.Controls.AddRange(controls);
        return row;
    }

    private enum PrintOutcome
    {
        Sent,
        ReadFailed,
        SendFailed,
        Nothing,
    }

    /// <summary>[인쇄]를 누른 그때의 고른 것(보내는 동안 화면이 바뀌어도 이 값으로)</summary>
    private sealed class PrintJob
    {
        public PrintJob(PatientHit patient, IReadOnlyList<VisitDay> days, IReadOnlyList<DocKind> kinds, DateTime from, DateTime to, string? printer, DocServices services)
        {
            Patient = patient;
            Days = days;
            Kinds = kinds;
            From = from;
            To = to;
            Printer = printer;
            Services = services;
        }

        public PatientHit Patient { get; }

        public IReadOnlyList<VisitDay> Days { get; }

        public IReadOnlyList<DocKind> Kinds { get; }

        public DateTime From { get; }

        public DateTime To { get; }

        public string? Printer { get; }

        public DocServices Services { get; }
    }
}

/// <summary>서류 창들(서류·동명이인·뽑은 기록·설정 서류 탭)이 같이 쓰는 시안 색·글꼴·작은 도구. 공통 색은 SlipUi 것을 쓴다.</summary>
internal static class DocUi
{
    public static readonly Color Off = Hex(0xB8C3D3);
    public static readonly Color RowLine = Hex(0xEDF0F4);
    public static readonly Color BoxEdge = Hex(0x8A94A3);
    public static readonly Color OkSoft = Hex(0xE7F5EC);
    public static readonly Color Warn = Hex(0x8A5A00);
    public static readonly Color WarnSoft = Hex(0xFFF4D6);
    public static readonly Color BarBack = Hex(0xD7E3F8);
    public static readonly Color HeadBack = Hex(0xF6F7F9);

    // 시안 px → pt(× 0.75)
    public static readonly Font SearchFont = new Font(SlipUi.FontName, 12.75f);
    public static readonly Font PillFont = new Font(SlipUi.FontName, 9f, FontStyle.Bold);
    public static readonly Font TagFont = new Font(SlipUi.FontName, 8.625f, FontStyle.Bold);
    public static readonly Font NoteFont = new Font(SlipUi.FontName, 9f);
    public static readonly Font MessageFont = new Font(SlipUi.FontName, 10.125f);

    private const int EmSetCueBanner = 0x1501;

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr SendMessage(IntPtr hwnd, int msg, IntPtr wParam, string lParam);

    /// <summary>빈 글 칸 안 흐린 안내(시안 placeholder). 칸에 커서가 있어도 보인다</summary>
    public static void SetCue(TextBox box, string text)
    {
        void Apply() => SendMessage(box.Handle, EmSetCueBanner, (IntPtr)1, text);
        if (box.IsHandleCreated) Apply();
        else box.HandleCreated += (sender, e) => Apply();
    }

    /// <summary>스스로 크기를 맞추는 줄·칸(여백 없음)</summary>
    public static FlowLayoutPanel Stack(FlowDirection direction) => new FlowLayoutPanel
    {
        AutoSize = true,
        AutoSizeMode = AutoSizeMode.GrowAndShrink,
        FlowDirection = direction,
        WrapContents = false,
        Margin = Padding.Empty,
        Padding = Padding.Empty,
    };

    /// <summary>폭이 정해진 세로 칸(안 여백 padding). width는 여백을 넣은 바깥 폭</summary>
    public static FlowLayoutPanel Column(int width, Padding padding)
    {
        var column = Stack(FlowDirection.TopDown);
        column.Padding = padding;
        column.MinimumSize = new Size(SlipUi.S(width), 0);
        column.MaximumSize = new Size(SlipUi.S(width), 0);
        return column;
    }

    /// <summary>흐린 작은 안내 글(시안 .hint, 넘치면 다음 줄)</summary>
    public static Label Hint(string text, int maxWidth, Padding margin) => SlipUi.Caption(text, SlipUi.Help, SlipUi.Sub, margin, maxWidth);

    /// <summary>둥근 단추 하나. 폭은 켜진 글꼴(굵게)로 재서 켜고 꺼도 폭이 그대로다</summary>
    public static PillButton Chip(string text, Font font, Font onFont, int heightPx, int padPx, Padding margin)
    {
        var button = new PillButton(text) { Font = font, Margin = margin };
        button.Size = new Size(TextRenderer.MeasureText(text, onFont).Width + SlipUi.S(padPx * 2), SlipUi.S(heightPx));
        return button;
    }

    /// <summary>작은 단추(시안 .mini: 높이 26, 12.5px)</summary>
    public static PillButton Mini(string text)
    {
        var button = Chip(text, SlipUi.Help, SlipUi.Help, 26, 9, Padding.Empty);
        button.Radius = SlipUi.S(5);
        button.DisabledFill = Color.White;
        button.DisabledInk = Off;
        return button;
    }

    public static void SetOn(PillButton button, bool on, Color onColor, Font font, Font onFont)
    {
        button.Fill = on ? onColor : Color.White;
        button.Edge = on ? onColor : SlipUi.Line;
        button.Ink = on ? Color.White : SlipUi.Ink;
        button.Font = on ? onFont : font;
        button.Invalidate();
    }

    /// <summary>날짜 고르기(시안 .date: yyyy-MM-dd)</summary>
    public static DateTimePicker DatePicker() => new DateTimePicker
    {
        Format = DateTimePickerFormat.Custom,
        CustomFormat = "yyyy-MM-dd",
        Font = SlipUi.Body,
        Width = SlipUi.S(132),
        Anchor = AnchorStyles.Left,
        Margin = Padding.Empty,
    };

    /// <summary>칸 사이 윗선</summary>
    public static void TopLine(Graphics g, int y, int width)
    {
        using var pen = new Pen(SlipUi.Line);
        g.DrawLine(pen, 0, y, width, y);
    }

    /// <summary>둥근 테두리(굵기 widthPx)</summary>
    public static void PaintEdge(Graphics g, Size size, Color edge, int widthPx, int radius)
    {
        var inset = widthPx / 2;
        var box = new Rectangle(inset, inset, size.Width - 1 - 2 * inset, size.Height - 1 - 2 * inset);
        if (box.Width <= 0 || box.Height <= 0) return;
        var mode = g.SmoothingMode;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        using (var path = SlipUi.Rounded(box, radius))
        using (var pen = new Pen(edge, widthPx))
        {
            g.DrawPath(pen, path);
        }
        g.SmoothingMode = mode;
    }

    /// <summary>둥근 바탕 위 가운데 글(시안 .tag·.from)</summary>
    public static void PaintPill(Graphics g, Rectangle box, string text, Font font, Color fore, Color back)
    {
        var mode = g.SmoothingMode;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        using (var path = SlipUi.Rounded(box, box.Height / 2))
        using (var brush = new SolidBrush(back))
        {
            g.FillPath(brush, path);
        }
        g.SmoothingMode = mode;
        TextRenderer.DrawText(g, text, font, box, fore, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine | TextFormatFlags.NoPrefix | TextFormatFlags.NoPadding);
    }

    public static int TextWidth(Graphics g, string text, Font font) =>
        string.IsNullOrEmpty(text) ? 0 : TextRenderer.MeasureText(g, text, font, Size.Empty, TextFormatFlags.SingleLine | TextFormatFlags.NoPrefix | TextFormatFlags.NoPadding).Width;

    /// <summary>창 없이 잴 때(크기 정하기)</summary>
    public static int TextWidth(string text, Font font) =>
        string.IsNullOrEmpty(text) ? 0 : TextRenderer.MeasureText(text, font, Size.Empty, TextFormatFlags.SingleLine | TextFormatFlags.NoPrefix | TextFormatFlags.NoPadding).Width;

    private static Color Hex(int rgb) => Color.FromArgb((rgb >> 16) & 0xFF, (rgb >> 8) & 0xFF, rgb & 0xFF);
}

/// <summary>둥근 테두리 칸(시안 .days·.docs). 안의 것은 Padding만큼 안쪽에</summary>
internal sealed class RoundPanel : Panel
{
    public RoundPanel()
    {
        BackColor = Color.White;
        SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
    }

    public Color Edge { get; set; } = SlipUi.Line;

    public int EdgeWidth { get; set; } = 1;

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        DocUi.PaintEdge(e.Graphics, ClientSize, Edge, EdgeWidth, SlipUi.S(6));
    }
}

/// <summary>둥근 테두리 + 안에서 줄 바꿈하는 칸(시안 .who-card)</summary>
internal sealed class RoundFlow : FlowLayoutPanel
{
    public RoundFlow()
    {
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        FlowDirection = FlowDirection.LeftToRight;
        WrapContents = true;
        BackColor = Color.White;
        SetStyle(ControlStyles.ResizeRedraw, true);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        DocUi.PaintEdge(e.Graphics, ClientSize, SlipUi.Line, 1, SlipUi.S(6));
    }
}

/// <summary>찾기 칸(시안 .search input: 높이 40, 테두리 2px, 커서가 있으면 파랑). 글 칸은 테두리 없이 안에</summary>
internal sealed class InputBox : Panel
{
    private readonly TextBox box;

    public InputBox(TextBox box, int widthPx, int heightPx = 40)
    {
        this.box = box ?? throw new ArgumentNullException(nameof(box));
        BackColor = Color.White;
        Size = new Size(SlipUi.S(widthPx), SlipUi.S(heightPx));
        SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
        box.BorderStyle = BorderStyle.None;
        box.BackColor = Color.White;
        Controls.Add(box);
        box.GotFocus += (sender, e) => Invalidate();
        box.LostFocus += (sender, e) => Invalidate();
        Click += (sender, e) => box.Focus();
    }

    protected override void OnLayout(LayoutEventArgs levent)
    {
        base.OnLayout(levent);
        var side = SlipUi.S(10);
        box.Width = Math.Max(1, Width - 2 * side);
        box.Location = new Point(side, (Height - box.Height) / 2);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        var width = Math.Max(1, SlipUi.S(2));
        DocUi.PaintEdge(e.Graphics, ClientSize, box.Focused ? SlipUi.Accent : SlipUi.Line, width, SlipUi.S(6));
    }
}

/// <summary>둥근 표시 글(시안 .from '비트에서 가져옴': 옅은 파랑 바탕, 남색 굵은 12px, 높이 22)</summary>
internal sealed class PillLabel : Control
{
    public PillLabel(string text)
    {
        Text = text;
        SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.SupportsTransparentBackColor, true);
        BackColor = Color.White;
        Size = new Size(TextRenderer.MeasureText(text, DocUi.PillFont).Width + SlipUi.S(16), SlipUi.S(22));
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.Clear(Parent?.BackColor ?? Color.White);
        DocUi.PaintPill(e.Graphics, new Rectangle(0, 0, Width - 1, Height - 1), Text, DocUi.PillFont, SlipUi.Navy, SlipUi.AccentSoft);
    }
}

/// <summary>체크 목록 한 줄</summary>
internal sealed class CheckRow
{
    public CheckRow(string text, bool on)
    {
        Text = text ?? "";
        On = on;
    }

    public string Text { get; }

    public bool On { get; }

    /// <summary>흐린 줄(시안 .day.off: 회색 글, 옅은 바탕)</summary>
    public bool Muted { get; set; }

    /// <summary>글 뒤 표(시안 .tag: 처방·수납 전)</summary>
    public List<(string Text, Color Fore, Color Back)> Tags { get; } = new List<(string Text, Color Fore, Color Back)>();

    /// <summary>오른쪽 끝 글(시안 .n: '7장')과 그 뒤 흐린 덧말('날짜마다')</summary>
    public string Right { get; set; } = "";

    public string RightNote { get; set; } = "";

    /// <summary>오른쪽 글을 아주 흐리게(시안 .docline.off: 안 고른 서류의 장 수)</summary>
    public bool RightDim { get; set; }
}

/// <summary>
/// 체크 목록(시안 .days·.docs): 줄마다 네모 체크·글·표·오른쪽 글을 직접 그린다. 줄을 누르면 Toggled(줄 번호).
/// 컨트롤 하나로 그려 날이 많아도(전체 기간) 가볍다. 스크롤은 감싼 칸이 한다.
/// </summary>
internal sealed class CheckList : Control
{
    private const TextFormatFlags Flags = TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine | TextFormatFlags.NoPrefix | TextFormatFlags.NoPadding;

    private readonly int pad;
    private List<CheckRow> rows = new List<CheckRow>();

    public CheckList(int rowHeightPx, int padPx)
    {
        RowHeight = SlipUi.S(rowHeightPx);
        pad = SlipUi.S(padPx);
        BackColor = Color.White;
        Cursor = Cursors.Hand;
        Margin = Padding.Empty;
        SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
    }

    public event Action<int>? Toggled;

    public int RowHeight { get; }

    public void SetRows(IEnumerable<CheckRow> next)
    {
        rows = (next ?? Enumerable.Empty<CheckRow>()).ToList();
        if (Dock == DockStyle.Top || Dock == DockStyle.None) Height = rows.Count * RowHeight;
        Invalidate();
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e);
        if (e.Button != MouseButtons.Left || !Enabled) return;
        var index = e.Y / RowHeight;
        if (e.Y >= 0 && index < rows.Count) Toggled?.Invoke(index);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.Clear(BackColor);
        if (rows.Count == 0) return;
        var first = Math.Max(0, e.ClipRectangle.Top / RowHeight);
        var last = Math.Min(rows.Count - 1, e.ClipRectangle.Bottom / RowHeight);
        for (var i = first; i <= last; i++) PaintRow(g, i, rows[i]);
    }

    private void PaintRow(Graphics g, int index, CheckRow row)
    {
        var top = index * RowHeight;
        if (row.Muted)
        {
            using var back = new SolidBrush(SlipUi.FootBack);
            g.FillRectangle(back, 0, top, Width, RowHeight);
        }
        if (index > 0)
        {
            using var line = new Pen(DocUi.RowLine);
            g.DrawLine(line, 0, top, Width, top);
        }
        var size = SlipUi.S(18);
        var box = new Rectangle(pad, top + (RowHeight - size) / 2, size, size);
        PaintBox(g, box, row.On);

        var x = box.Right + SlipUi.S(10);
        var ink = row.Muted ? SlipUi.Sub : SlipUi.Ink;
        var textWidth = DocUi.TextWidth(g, row.Text, SlipUi.Body);
        TextRenderer.DrawText(g, row.Text, SlipUi.Body, new Rectangle(x, top, textWidth + 2, RowHeight), ink, Flags);
        x += textWidth + SlipUi.S(10);
        foreach (var (text, fore, back) in row.Tags)
        {
            var width = DocUi.TextWidth(g, text, DocUi.TagFont) + SlipUi.S(14);
            var height = SlipUi.S(20);
            DocUi.PaintPill(g, new Rectangle(x, top + (RowHeight - height) / 2, width, height), text, DocUi.TagFont, fore, back);
            x += width + SlipUi.S(6);
        }

        if (row.Right.Length == 0) return;
        var right = Width - pad;
        if (row.RightNote.Length > 0)
        {
            var noteWidth = DocUi.TextWidth(g, row.RightNote, DocUi.NoteFont);
            TextRenderer.DrawText(g, row.RightNote, DocUi.NoteFont, new Rectangle(right - noteWidth, top, noteWidth + 2, RowHeight), row.RightDim ? DocUi.Off : SlipUi.Sub, Flags);
            right -= noteWidth + SlipUi.S(5);
        }
        var countWidth = DocUi.TextWidth(g, row.Right, SlipUi.Small);
        TextRenderer.DrawText(g, row.Right, SlipUi.Small, new Rectangle(right - countWidth, top, countWidth + 2, RowHeight), row.RightDim ? DocUi.Off : SlipUi.Ink, Flags);
    }

    /// <summary>네모 체크(시안 .box: 18px, 테두리 1.5px, 켜면 파랑 + 흰 ✓)</summary>
    private static void PaintBox(Graphics g, Rectangle box, bool on)
    {
        var mode = g.SmoothingMode;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        using (var path = SlipUi.Rounded(box, SlipUi.S(3)))
        {
            using var fill = new SolidBrush(on ? SlipUi.Accent : Color.White);
            g.FillPath(fill, path);
            using var edge = new Pen(on ? SlipUi.Accent : DocUi.BoxEdge, SlipUi.S(3) / 2f);
            g.DrawPath(edge, path);
        }
        if (on)
        {
            using var check = new Pen(Color.White, Math.Max(1.5f, SlipUi.S(2))) { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round };
            float x = box.X, y = box.Y, w = box.Width, h = box.Height;
            g.DrawLines(check, new[] { new PointF(x + w * 0.24f, y + h * 0.52f), new PointF(x + w * 0.43f, y + h * 0.71f), new PointF(x + w * 0.77f, y + h * 0.31f) });
        }
        g.SmoothingMode = mode;
    }
}

/// <summary>창 아래 알림(시안 .msg): 보내는 중(옅은 파랑 + 막대)·실패(옅은 빨강). 처음엔 숨김</summary>
internal sealed class NoticeBox : Control
{
    private const TextFormatFlags Flags = TextFormatFlags.WordBreak | TextFormatFlags.NoPrefix | TextFormatFlags.NoPadding;

    private string message = "";
    private bool bad;
    private float? fraction;

    public NoticeBox(int formWidthPx)
    {
        Size = new Size(SlipUi.S(formWidthPx - 36), SlipUi.S(40));
        Margin = new Padding(SlipUi.S(18), 0, SlipUi.S(18), SlipUi.S(12));
        Visible = false;
        SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
    }

    /// <summary>'프린터로 보내는 중이에요… N장 중 M장' + 막대</summary>
    public void ShowRun(int sent, int total)
    {
        message = "프린터로 보내는 중이에요… " + total.ToString(CultureInfo.InvariantCulture) + "장 중 " + sent.ToString(CultureInfo.InvariantCulture) + "장";
        bad = false;
        fraction = total > 0 ? Math.Max(0f, Math.Min(1f, sent / (float)total)) : 0f;
        Fit();
    }

    public void ShowBad(string text)
    {
        message = text ?? "";
        bad = true;
        fraction = null;
        Fit();
    }

    public void HideNotice()
    {
        message = "";
        fraction = null;
        Visible = false;
    }

    private void Fit()
    {
        var inner = Width - SlipUi.S(24);
        var textHeight = TextRenderer.MeasureText(message, DocUi.MessageFont, new Size(inner, 0), Flags).Height;
        Height = SlipUi.S(10) + textHeight + (fraction != null ? SlipUi.S(16) : 0) + SlipUi.S(10);
        Visible = true;
        Invalidate();
        Update();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.Clear(Parent?.BackColor ?? Color.White);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        using (var path = SlipUi.Rounded(new Rectangle(0, 0, Width - 1, Height - 1), SlipUi.S(6)))
        using (var back = new SolidBrush(bad ? SlipUi.BadSoft : SlipUi.AccentSoft))
        {
            g.FillPath(back, path);
        }
        var side = SlipUi.S(12);
        var inner = Width - 2 * side;
        var textHeight = TextRenderer.MeasureText(g, message, DocUi.MessageFont, new Size(inner, 0), Flags).Height;
        TextRenderer.DrawText(g, message, DocUi.MessageFont, new Rectangle(side, SlipUi.S(10), inner, textHeight), bad ? SlipUi.Bad : SlipUi.Navy, Flags);
        if (fraction is float done)
        {
            var bar = new Rectangle(side, SlipUi.S(10) + textHeight + SlipUi.S(8), inner, SlipUi.S(8));
            using (var path = SlipUi.Rounded(bar, bar.Height / 2))
            using (var back = new SolidBrush(DocUi.BarBack))
            {
                g.FillPath(back, path);
            }
            var width = (int)Math.Round(bar.Width * done);
            if (width > 0)
            {
                using var path = SlipUi.Rounded(new Rectangle(bar.X, bar.Y, Math.Max(width, bar.Height), bar.Height), bar.Height / 2);
                using var fill = new SolidBrush(SlipUi.Accent);
                g.FillPath(fill, path);
            }
        }
    }
}

/// <summary>아래 줄 '프린터 이름 · 모두 N장'(시안 .foot .sum: 흐린 13px + 굵은 15px)</summary>
internal sealed class SumText : Control
{
    private const TextFormatFlags Flags = TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine | TextFormatFlags.NoPrefix | TextFormatFlags.NoPadding;

    private string lead = "";
    private string count = "";

    public SumText()
    {
        Margin = Padding.Empty;
        SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
        Size = new Size(1, SlipUi.S(24));
    }

    /// <summary>pages가 null이면(세는 중) 프린터 이름만</summary>
    public void Set(string printer, int? pages)
    {
        lead = pages == null ? printer : printer + " · 모두 ";
        count = pages == null ? "" : pages.Value.ToString(CultureInfo.InvariantCulture) + "장";
        Text = lead + count;
        Width = Math.Max(1, DocUi.TextWidth(lead, SlipUi.Small) + DocUi.TextWidth(count, SlipUi.PrimaryFont) + 2);
        Invalidate();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.Clear(Parent?.BackColor ?? SlipUi.FootBack);
        var leadWidth = DocUi.TextWidth(g, lead, SlipUi.Small);
        TextRenderer.DrawText(g, lead, SlipUi.Small, new Rectangle(0, 0, leadWidth + 1, Height), SlipUi.Sub, Flags);
        if (count.Length > 0) TextRenderer.DrawText(g, count, SlipUi.PrimaryFont, new Rectangle(leadWidth, 0, Width - leadWidth, Height), SlipUi.Ink, Flags);
    }
}
