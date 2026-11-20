using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.Linq;
using System.Windows.Forms;
using Precheck.Core.DocPrint;

namespace Precheck.PtSlip;

/// <summary>
/// 뽑은 기록 창(서류 시안 ⑦, AC-7401.3): doc-log.tsv의 줄을 Core DocLog.Recent로 최근 것부터 보이고, 차트번호·이름으로 거른다.
/// 칸 '뽑은 때·차트·이름·서류·기간·장 수'. 읽기만 하고 기록 파일을 고치지 않는다.
/// </summary>
public sealed class DocLogForm : Form
{
    public const string Title = "뽑은 기록";
    public const string FilterCue = "차트번호나 이름으로 거르기";
    public const string LocalOnlyText = "이 기록은 접수 PC 안에만 있어요. 비트에는 남지 않고, 인터넷으로 보내지 않아요.";

    /// <summary>시안 .log 폭 900px</summary>
    private const int FormWidth = 900;
    private const int Inner = FormWidth - 36;

    private readonly IReadOnlyList<string> lines;
    private readonly TextBox filterBox;
    private readonly ListView list;

    /// <param name="lines">doc-log.tsv의 줄들(파일 차례 그대로, DocFiles.ReadLines).</param>
    public DocLogForm(IEnumerable<string> lines)
    {
        this.lines = (lines ?? Enumerable.Empty<string>()).ToArray();

        Text = Title;
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

        filterBox = new TextBox { Font = SlipUi.Body, MaxLength = 30 };
        DocUi.SetCue(filterBox, FilterCue);
        // 거르기 칸은 시안 .search input 모양(폭 280, 높이 34)
        var filter = new InputBox(filterBox, 280, 34) { Margin = new Padding(0, 0, 0, SlipUi.S(10)) };
        list = new ListView
        {
            View = View.Details,
            FullRowSelect = true,
            MultiSelect = false,
            HideSelection = true,
            HeaderStyle = ColumnHeaderStyle.Nonclickable,
            Font = SlipUi.Body,
            BorderStyle = BorderStyle.FixedSingle,
            Size = new Size(SlipUi.S(Inner), SlipUi.S(330)),
            Margin = Padding.Empty,
        };
        foreach (var name in new[] { "뽑은 때", "차트", "이름", "서류", "기간", "장 수" }) list.Columns.Add(name);
        // 칸 폭은 목록이 줄을 다 받은 뒤(창을 띄울 때·거를 때마다) 맞춘다
        Load += (sender, e) => FitColumns();

        var body = DocUi.Column(FormWidth, new Padding(SlipUi.S(18), SlipUi.S(14), SlipUi.S(18), SlipUi.S(14)));
        body.Controls.Add(filter);
        body.Controls.Add(list);
        body.Controls.Add(DocUi.Hint(LocalOnlyText, Inner, new Padding(0, SlipUi.S(6), 0, 0)));

        var closeButton = SlipUi.Plain("닫기");
        var foot = new FootPanel(FormWidth);
        foot.PlaceRight(closeButton);

        var root = DocUi.Stack(FlowDirection.TopDown);
        root.Location = Point.Empty;
        root.Controls.Add(body);
        root.Controls.Add(foot);
        Controls.Add(root);

        filterBox.TextChanged += (sender, e) => Fill();
        closeButton.Click += (sender, e) => Close();
        CancelButton = closeButton;
        ActiveControl = filterBox;
        Fill();
    }

    /// <summary>지금 보이는 줄 수(확인용).</summary>
    public int ShownCount => list.Items.Count;

    private void Fill()
    {
        list.BeginUpdate();
        try
        {
            list.Items.Clear();
            foreach (var line in DocLog.Recent(lines, filterBox.Text))
            {
                list.Items.Add(new ListViewItem(new[]
                {
                    line.AtText,
                    line.Chart,
                    line.Name,
                    line.KindsText,
                    line.RangeText,
                    line.Pages.ToString(CultureInfo.InvariantCulture),
                }));
            }
        }
        finally
        {
            list.EndUpdate();
        }
        if (list.IsHandleCreated) FitColumns();
    }

    /// <summary>칸 폭을 글(과 머리)에 맞춘다. 마지막 칸은 남는 폭을 채운다</summary>
    private void FitColumns()
    {
        foreach (ColumnHeader column in list.Columns) column.Width = -2;
        list.Columns[list.Columns.Count - 1].Width = -2;
    }
}
