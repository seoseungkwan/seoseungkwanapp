using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;
using Precheck.Core.DocPrint;

namespace Precheck.PtSlip;

/// <summary>
/// 같은 이름이 여럿일 때 고르기(서류 시안 ③, AC-7402.2): '같은 이름이 N명이에요…' 아래 이름·생년월일·성별·마지막 내원·차트 목록
/// (Core PatientFinder가 마지막 내원일 최근 순으로 준 차례 그대로), [취소] [이 환자로]. 줄을 두 번 눌러도 고른다.
/// 환자 값은 화면에만 보이고 남기지 않는다.
/// </summary>
public sealed class PatientPickForm : Form
{
    public const string ChooseText = "이 환자로";

    private const int FormWidth = 640;
    private const int Inner = FormWidth - 36;

    private readonly IReadOnlyList<PatientHit> hits;
    private readonly ListView list;

    public PatientPickForm(IReadOnlyList<PatientHit> hits)
    {
        this.hits = hits ?? throw new ArgumentNullException(nameof(hits));

        Text = DocForm.Title;
        StartPosition = FormStartPosition.CenterParent;
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

        var hint = DocUi.Hint(PatientFinder.Message(new PatientResult(PatientKind.Many, hits)), Inner, new Padding(0, 0, 0, SlipUi.S(10)));
        list = new ListView
        {
            View = View.Details,
            FullRowSelect = true,
            MultiSelect = false,
            HideSelection = false,
            HeaderStyle = ColumnHeaderStyle.Nonclickable,
            Font = SlipUi.Body,
            BorderStyle = BorderStyle.FixedSingle,
            Margin = Padding.Empty,
        };
        foreach (var name in new[] { "이름", "생년월일", "성별", "마지막 내원", "차트" }) list.Columns.Add(name);
        foreach (var hit in hits)
        {
            list.Items.Add(new ListViewItem(new[] { hit.Name, hit.BirthText, hit.SexText, hit.LastVisitText, hit.Chart }));
        }
        // 줄 높이(글꼴) × 줄 수 + 머리. 많으면(이름 찾기는 50명까지) 8줄까지 보이고 스크롤
        var rowHeight = TextRenderer.MeasureText("가", SlipUi.Body).Height + SlipUi.S(8);
        list.Size = new Size(SlipUi.S(Inner), rowHeight * (Math.Min(Math.Max(hits.Count, 3), 8) + 1) + SlipUi.S(6));
        // 칸 폭은 목록이 줄을 다 받은 뒤(창을 띄울 때) 맞춘다
        Load += (sender, e) => FitColumns();
        if (list.Items.Count > 0)
        {
            list.Items[0].Selected = true;
            list.Items[0].Focused = true;
        }

        var body = DocUi.Column(FormWidth, new Padding(SlipUi.S(18), SlipUi.S(16), SlipUi.S(18), SlipUi.S(16)));
        body.Controls.Add(SlipUi.Heading("환자"));
        body.Controls.Add(hint);
        body.Controls.Add(list);

        var cancelButton = SlipUi.Plain("취소");
        var chooseButton = SlipUi.Primary(ChooseText);
        chooseButton.Width = Math.Max(chooseButton.Width, SlipUi.S(120));
        var foot = new FootPanel(FormWidth);
        foot.PlaceRight(chooseButton, cancelButton);

        var root = DocUi.Stack(FlowDirection.TopDown);
        root.Location = Point.Empty;
        root.Controls.Add(body);
        root.Controls.Add(foot);
        Controls.Add(root);

        list.SelectedIndexChanged += (sender, e) => chooseButton.Enabled = list.SelectedIndices.Count > 0;
        list.ItemActivate += (sender, e) => Choose();
        chooseButton.Click += (sender, e) => Choose();
        cancelButton.Click += (sender, e) =>
        {
            DialogResult = DialogResult.Cancel;
            Close();
        };
        AcceptButton = chooseButton;
        CancelButton = cancelButton;
        ActiveControl = list;
    }

    /// <summary>[이 환자로]로 고른 분. 고르지 않고 닫았으면 null.</summary>
    public PatientHit? Chosen { get; private set; }

    private void Choose()
    {
        if (list.SelectedIndices.Count == 0) return;
        var index = list.SelectedIndices[0];
        if (index < 0 || index >= hits.Count) return;
        Chosen = hits[index];
        DialogResult = DialogResult.OK;
        Close();
    }

    /// <summary>칸 폭을 글(과 머리)에 맞춘다. 마지막 칸(차트)은 남는 폭을 채운다(LVSCW_AUTOSIZE_USEHEADER)</summary>
    private void FitColumns()
    {
        foreach (ColumnHeader column in list.Columns) column.Width = -2;
        foreach (ColumnHeader column in list.Columns) column.Width = Math.Max(column.Width, SlipUi.S(70));
        list.Columns[list.Columns.Count - 1].Width = -2;
    }
}
