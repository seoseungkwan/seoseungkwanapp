using System;
using System.Drawing;
using System.Windows.Forms;
using Precheck.Core.Sheet;

namespace Precheck.Windows;

/// <summary>
/// 수납일지 구글 코드 주소·함께 쓸 메일 바꾸기 확인 창(spec google-link TASK-10, design.md 2절 표 17): 맨 위에 뜨는 윈도 창. [바꾸기]를 눌러야만 참.
/// [취소]·창 닫기·Esc·2분 지남이면 거짓. 기본 단추는 [취소](Enter로 실수로 바뀌지 않게). 지금 ConfirmWindow와 같은 STA 창 꼴(Sta.Run)이고 그 파일은 고치지 않는다.
/// 주소·메일은 줄이지 않고 읽기 전용 글 칸에 다 보인다(긴 주소도 줄을 바꿔 보임). 글은 SheetPrompt 한 곳에서 온다.
/// </summary>
public sealed class SheetConfirmWindow : ISheetConfirm
{
    private const int TextWidth = 560;

    public bool Show(string text, TimeSpan timeout)
    {
        if (text == null) throw new ArgumentNullException(nameof(text));
        if (timeout <= TimeSpan.Zero) return false;
        return Sta.Run(() => ShowHere(text, timeout));
    }

    private static bool ShowHere(string text, TimeSpan timeout)
    {
        using var form = new SheetForm(text);
        using var timer = new Timer { Interval = (int)Math.Max(1, Math.Min(int.MaxValue, timeout.TotalMilliseconds)) };
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
        return form.ShowDialog() == DialogResult.OK;
    }

    private sealed class SheetForm : Form
    {
        public SheetForm(string text)
        {
            Text = SheetPrompt.Title;
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

            // 안내 글과 주소·메일 줄을 나눈다(SheetPrompt.Text: 안내 + 빈 줄 + 주소·메일)
            var split = text.IndexOf("\n\n", StringComparison.Ordinal);
            var intro = split < 0 ? text : text.Substring(0, split);
            var values = split < 0 ? "" : text.Substring(split + 2);

            var layout = new TableLayoutPanel { ColumnCount = 1, AutoSize = true, Dock = DockStyle.Fill };
            layout.Controls.Add(new Label
            {
                Text = intro,
                AutoSize = true,
                MaximumSize = new Size(TextWidth, 0),
                Margin = new Padding(0, 0, 0, 12),
                UseMnemonic = false,
            });
            if (values.Length > 0)
            {
                layout.Controls.Add(new TextBox
                {
                    Text = values.Replace("\n", Environment.NewLine),
                    ReadOnly = true,
                    Multiline = true,
                    WordWrap = true,
                    ScrollBars = ScrollBars.Vertical,
                    TabStop = false,
                    Width = TextWidth,
                    Height = Font.Height * 6,
                    Margin = new Padding(0, 0, 0, 16),
                });
            }

            var change = new Button { Text = SheetPrompt.Change, DialogResult = DialogResult.OK, AutoSize = true, MinimumSize = new Size(96, 32) };
            var cancel = new Button { Text = SheetPrompt.Cancel, DialogResult = DialogResult.Cancel, AutoSize = true, MinimumSize = new Size(96, 32) };
            var buttons = new FlowLayoutPanel
            {
                FlowDirection = FlowDirection.RightToLeft,
                Dock = DockStyle.Fill,
                AutoSize = true,
                WrapContents = false,
            };
            buttons.Controls.Add(cancel);
            buttons.Controls.Add(change);
            layout.Controls.Add(buttons);
            Controls.Add(layout);

            CancelButton = cancel;
            ActiveControl = cancel;
        }
    }
}
