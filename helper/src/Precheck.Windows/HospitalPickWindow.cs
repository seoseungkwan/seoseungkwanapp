using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;
using Precheck.Core.Bit;
using Precheck.Core.Registration;

namespace Precheck.Windows;

/// <summary>
/// 병원 고르기 창(AC-005.19, 승인 시안 docs/mockups/reg-pick): 비트에 병원 범위가 둘 이상일 때 처음 등록·다시 등록에서 PC 확인 창 대신 뜬다.
/// ConfirmWindow와 같은 모양(맨 위·가운데·고정 테두리·맑은 고딕 10). 줄마다 라디오 하나(Tab으로 닿고 Space·마우스로 켬), 미리 고른 줄이 없으면 줄을 고를 때까지 [확인]이 꺼져 있다.
/// 기본 단추는 [취소](엔터로 잘못 등록되지 않게). [확인]이면 고른 줄 번호, [취소]·창 닫기·Esc·시간 지남이면 null.
/// 글은 HospitalPickView(도우미가 비트에서 읽은 값)로만 만든다.
/// </summary>
public sealed class HospitalPickWindow : IHospitalPick
{
    public int? Pick(HospitalPickView view, TimeSpan timeout)
    {
        if (view == null) throw new ArgumentNullException(nameof(view));
        if (timeout <= TimeSpan.Zero) return null;
        return Sta.Run(() => ShowHere(view, timeout));
    }

    /// <summary>창을 만든다(띄우지 않음). 시험은 이것으로 컨트롤만 본다.</summary>
    public static HospitalPickForm CreateForm(HospitalPickView view) => new HospitalPickForm(view);

    private static int? ShowHere(HospitalPickView view, TimeSpan timeout)
    {
        using var form = CreateForm(view);
        using var timer = new System.Windows.Forms.Timer { Interval = (int)Math.Max(1, Math.Min(int.MaxValue, timeout.TotalMilliseconds)) };
        timer.Tick += (sender, e) =>
        {
            timer.Stop();
            form.DialogResult = DialogResult.Cancel;
        };
        form.Shown += (sender, e) =>
        {
            timer.Start();
            form.Activate();
        };
        return form.ShowDialog() == DialogResult.OK ? form.Selected : null;
    }
}

/// <summary>병원 고르기 창의 폼. 시험이 컨트롤을 보려고 공개한다.</summary>
public sealed class HospitalPickForm : Form
{
    private const int TextWidth = 560;

    private static readonly Color NoticeBack = Color.FromArgb(255, 243, 205);
    private static readonly Color Muted = Color.FromArgb(90, 90, 90);
    private static readonly Color TagLine = Color.FromArgb(0, 90, 158);

    private readonly List<RadioButton> choices = new List<RadioButton>();

    public HospitalPickForm(HospitalPickView view)
    {
        if (view == null) throw new ArgumentNullException(nameof(view));
        Text = ConfirmWindow.Title;
        TopMost = true;
        ShowInTaskbar = true;
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        Font = new Font("Malgun Gothic", 10f);
        Padding = new Padding(16);

        var layout = new TableLayoutPanel { ColumnCount = 1, AutoSize = true, Dock = DockStyle.Fill };

        layout.Controls.Add(Line(HospitalPick.Question, new Padding(0, 0, 0, 12), bold: true));

        if (view.PreviousLine != null)
        {
            var previous = Line(view.PreviousLine, new Padding(0, 0, 0, 12));
            previous.BorderStyle = BorderStyle.FixedSingle;
            previous.Padding = new Padding(8);
            previous.BackColor = Color.White;
            layout.Controls.Add(previous);
        }

        var list = new TableLayoutPanel
        {
            ColumnCount = 1,
            AutoSize = true,
            BackColor = Color.White,
            BorderStyle = BorderStyle.FixedSingle,
            Margin = new Padding(0, 0, 0, 12),
            Padding = new Padding(4),
        };
        for (var i = 0; i < view.Choices.Count; i++) list.Controls.Add(Row(view, i));
        layout.Controls.Add(list);

        var warning = Line(HospitalPick.Warning, new Padding(0, 0, 0, 12));
        warning.Padding = new Padding(8);
        warning.BackColor = NoticeBack;
        layout.Controls.Add(warning);

        // 고른 줄로 등록하면 옮길 전 병원 저장 파일이 있을 때만 PC 확인 창과 같은 '전 병원 파일 보관' 한 줄(claim-learn AC-9317.3)
        ArchiveNote = Line("", new Padding(0, 0, 0, 12));
        layout.Controls.Add(ArchiveNote);

        var install = Line(view.InstallLine, new Padding(0));
        install.ForeColor = Muted;
        layout.Controls.Add(install);
        var database = Line(view.DatabaseLine, new Padding(0, 0, 0, 16));
        database.ForeColor = Muted;
        layout.Controls.Add(database);

        Ok = new Button { Text = "확인", DialogResult = DialogResult.OK, AutoSize = true, MinimumSize = new Size(96, 32) };
        Cancel = new Button { Text = "취소", DialogResult = DialogResult.Cancel, AutoSize = true, MinimumSize = new Size(96, 32) };
        var buttons = new FlowLayoutPanel
        {
            FlowDirection = FlowDirection.RightToLeft,
            Dock = DockStyle.Fill,
            AutoSize = true,
            WrapContents = false,
        };
        buttons.Controls.Add(Cancel);
        buttons.Controls.Add(Ok);
        layout.Controls.Add(buttons);
        Controls.Add(layout);

        if (view.Preselected is int preselected) choices[preselected].Checked = true;
        Ok.Enabled = Selected != null;
        ShowArchive(view);
        // 줄마다 다른 칸 안에 있어 윈도우가 라디오를 한 묶음으로 보지 않는다: 하나가 켜지면 나머지를 직접 끈다(TabStop은 그대로 둔다)
        foreach (var radio in choices)
        {
            radio.CheckedChanged += (sender, e) =>
            {
                if (radio.Checked)
                {
                    foreach (var other in choices.Where(other => !ReferenceEquals(other, radio))) other.Checked = false;
                }
                Ok.Enabled = Selected != null;
                ShowArchive(view);
            };
        }

        CancelButton = Cancel;
        ActiveControl = Cancel;
    }

    /// <summary>줄마다 라디오 하나(DB 범위 차례).</summary>
    public IReadOnlyList<RadioButton> Choices => choices;

    public Button Ok { get; }

    /// <summary>'전 병원 파일 보관' 한 줄. 고른 줄로 옮길 파일이 없거나 고른 줄이 없으면 빈 글자이고 보이지 않는다.</summary>
    public Label ArchiveNote { get; }

    public Button Cancel { get; }

    /// <summary>켜진 줄 번호. 없으면 null.</summary>
    public int? Selected
    {
        get
        {
            var index = choices.FindIndex(radio => radio.Checked);
            return index < 0 ? null : index;
        }
    }

    private void ShowArchive(HospitalPickView view)
    {
        var line = view.ArchiveLine(Selected);
        ArchiveNote.Text = line ?? "";
        ArchiveNote.Visible = line != null;
    }

    private Control Row(HospitalPickView view, int index)
    {
        var row = new TableLayoutPanel { ColumnCount = 2, AutoSize = true, Margin = new Padding(4, 4, 4, 4) };
        var radio = new RadioButton
        {
            Text = view.Title(index),
            AutoSize = true,
            UseMnemonic = false,
            Font = new Font(Font, FontStyle.Bold),
            Margin = new Padding(0),
            // 줄마다 칸이 달라 윈도우의 라디오 묶음(화살표·켜진 것만 Tab)이 안 맞는다: 자동 켜기를 끄고 줄마다 Tab이 닿게, 누름(마우스·Space)으로 켠다
            AutoCheck = false,
            TabStop = true,
        };
        radio.Click += (sender, e) => radio.Checked = true;
        choices.Add(radio);
        row.Controls.Add(radio, 0, 0);

        var tag = view.Tag(index);
        if (tag != null)
        {
            row.Controls.Add(new Label
            {
                Text = tag,
                AutoSize = true,
                UseMnemonic = false,
                ForeColor = TagLine,
                BorderStyle = BorderStyle.FixedSingle,
                Margin = new Padding(6, 3, 0, 0),
            }, 1, 0);
        }

        var detail = new Label
        {
            Text = view.Detail(index),
            AutoSize = true,
            UseMnemonic = false,
            ForeColor = Muted,
            Margin = new Padding(20, 0, 0, 4),
        };
        row.Controls.Add(detail, 0, 1);
        row.SetColumnSpan(detail, 2);
        return row;
    }

    private static Label Line(string text, Padding margin, bool bold = false)
    {
        var label = new Label
        {
            Text = text,
            AutoSize = true,
            MaximumSize = new Size(TextWidth, 0),
            Margin = margin,
            UseMnemonic = false,
        };
        if (bold) label.Font = new Font("Malgun Gothic", 10f, FontStyle.Bold);
        return label;
    }
}
