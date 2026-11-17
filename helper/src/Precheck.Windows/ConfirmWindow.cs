using System;
using System.Drawing;
using System.Runtime.ExceptionServices;
using System.Threading;
using System.Windows.Forms;
using Precheck.Core.Bit;
using Precheck.Core.Input;

namespace Precheck.Windows;

/// <summary>
/// PC 확인 창(ADR-016, 목업 화면 5 '도우미 PC 확인 창'): 맨 위에 뜨는 윈도우 창. [확인]을 눌러야만 true.
/// [취소]·창 닫기·Esc·시간 지남이면 false. 기본 단추는 [취소]다(Enter로 실수로 확인되지 않게, 원본 Button2 기본).
/// 글은 넘겨받은 것만 보인다: 도우미가 비트·묶음에서 만든 글(RegisterPrompt 등).
/// 창 제목은 만들 때 넘긴 글이고 기본은 "청구메모 도우미"(Title)다. 접수 현황 프로그램은 "접수 현황"을 넘긴다(spec reception-other-clinic AC-5707.8).
/// TASK-17(입력 확인)도 이 창을 쓴다: 표준 입력이 닫히면 [취소]처럼 닫힌다(AC-017.9).
/// 입력 확인 창에는 체크 '이제부터 묻지 않기'가 있다(AC-037.4·AC-037.8, 승인 목업): 처음 꺼져 있고, 묻지 않기가 이미 켜진 채 뜨면 켜진 채 잠겨 끌 수 없다.
/// 맨 위 글(AC-035.9)이 있을 때만 그 글을 노란 바탕으로 그린다(승인 목업).
/// </summary>
public sealed class ConfirmWindow : IConfirmWindow, IInputConfirm
{
    /// <summary>기본 창 제목(도우미의 확인 창·진행 창 ProgressWindow가 쓴다).</summary>
    public const string Title = "청구메모 도우미";

    private const int CloseCheckMs = 250;
    private const int TextWidth = 560;

    private static readonly Color NoticeBack = Color.FromArgb(255, 243, 205);

    private readonly string title;

    /// <summary>제목이 "청구메모 도우미"인 창(도우미).</summary>
    public ConfirmWindow() : this(Title) { }

    /// <summary>제목이 title인 창(접수 현황 프로그램은 "접수 현황").</summary>
    public ConfirmWindow(string title)
    {
        if (string.IsNullOrWhiteSpace(title)) throw new ArgumentException("창 제목이 비었다", nameof(title));
        this.title = title;
    }

    public bool Show(string text, TimeSpan timeout) => Ask(text, timeout, () => false);

    /// <summary>체크 없는 창(비트 등록 확인 등).</summary>
    public bool Ask(string text, TimeSpan timeout, Func<bool> closeRequested)
    {
        if (text == null) throw new ArgumentNullException(nameof(text));
        if (closeRequested == null) throw new ArgumentNullException(nameof(closeRequested));
        if (timeout <= TimeSpan.Zero || closeRequested()) return false;
        return Sta.Run(() => ShowHere(title, text, null, timeout, closeRequested)).Confirmed;
    }

    /// <summary>입력 확인 창. noAskTicked는 [확인]을 누를 때 체크를 새로 켜 두었을 때만 참이다.</summary>
    public bool Ask(string text, bool noAskOn, TimeSpan timeout, Func<bool> closeRequested, out bool noAskTicked)
    {
        noAskTicked = false;
        if (text == null) throw new ArgumentNullException(nameof(text));
        if (closeRequested == null) throw new ArgumentNullException(nameof(closeRequested));
        if (timeout <= TimeSpan.Zero || closeRequested()) return false;
        var answer = Sta.Run(() => ShowHere(title, text, noAskOn, timeout, closeRequested));
        noAskTicked = answer.Ticked;
        return answer.Confirmed;
    }

    /// <param name="noAskOn">null이면 체크가 없는 창이다.</param>
    private static (bool Confirmed, bool Ticked) ShowHere(string title, string text, bool? noAskOn, TimeSpan timeout, Func<bool> closeRequested)
    {
        using var form = new ConfirmForm(title, text, noAskOn);
        using var closeCheck = new System.Windows.Forms.Timer { Interval = CloseCheckMs };
        closeCheck.Tick += (sender, e) =>
        {
            if (!closeRequested()) return;
            closeCheck.Stop();
            form.DialogResult = DialogResult.Cancel;
        };
        using var timer = new System.Windows.Forms.Timer { Interval = (int)Math.Max(1, Math.Min(int.MaxValue, timeout.TotalMilliseconds)) };
        timer.Tick += (sender, e) =>
        {
            timer.Stop();
            form.DialogResult = DialogResult.Cancel;
        };
        form.Shown += (sender, e) =>
        {
            timer.Start();
            closeCheck.Start();
            form.Activate();
        };
        var confirmed = form.ShowDialog() == DialogResult.OK;
        return (confirmed, confirmed && form.NoAskTicked);
    }

    private sealed class ConfirmForm : Form
    {
        private readonly CheckBox? noAsk;

        public ConfirmForm(string title, string text, bool? noAskOn)
        {
            Text = title;
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

            var notice = InputPrompt.SplitNotice(text, out var rest);
            if (notice != null)
            {
                layout.Controls.Add(new Label
                {
                    Text = notice,
                    AutoSize = true,
                    MaximumSize = new Size(TextWidth, 0),
                    Margin = new Padding(0, 0, 0, 12),
                    Padding = new Padding(8),
                    UseMnemonic = false,
                    BackColor = NoticeBack,
                });
            }

            layout.Controls.Add(new Label
            {
                Text = rest,
                AutoSize = true,
                MaximumSize = new Size(TextWidth, 0),
                Margin = new Padding(0, 0, 0, 16),
                UseMnemonic = false,
            });

            if (noAskOn.HasValue)
            {
                noAsk = new CheckBox
                {
                    Text = InputPrompt.NoAskLabel,
                    AutoSize = true,
                    MaximumSize = new Size(TextWidth, 0),
                    Margin = new Padding(0, 0, 0, 16),
                    UseMnemonic = false,
                    Checked = noAskOn.Value,
                    Enabled = !noAskOn.Value,
                };
                layout.Controls.Add(noAsk);
            }

            var ok = new Button { Text = "확인", DialogResult = DialogResult.OK, AutoSize = true, MinimumSize = new Size(96, 32) };
            var cancel = new Button { Text = "취소", DialogResult = DialogResult.Cancel, AutoSize = true, MinimumSize = new Size(96, 32) };
            var buttons = new FlowLayoutPanel
            {
                FlowDirection = FlowDirection.RightToLeft,
                Dock = DockStyle.Fill,
                AutoSize = true,
                WrapContents = false,
            };
            buttons.Controls.Add(cancel);
            buttons.Controls.Add(ok);

            layout.Controls.Add(buttons);
            Controls.Add(layout);

            CancelButton = cancel;
            ActiveControl = cancel;
        }

        /// <summary>체크를 이 창에서 새로 켰다. 이미 켜진 채 잠긴 체크는 새로 켠 것이 아니다.</summary>
        public bool NoAskTicked => noAsk != null && noAsk.Enabled && noAsk.Checked;
    }
}

/// <summary>WinForms 창·비트 로그인 창을 STA 스레드에서 돌린다(도우미 메시지 고리 스레드와 따로).</summary>
public static class Sta
{
    public static T Run<T>(Func<T> work)
    {
        if (work == null) throw new ArgumentNullException(nameof(work));
        if (Thread.CurrentThread.GetApartmentState() == ApartmentState.STA) return work();

        T result = default!;
        ExceptionDispatchInfo? failure = null;
        var thread = new Thread(() =>
        {
            try
            {
                result = work();
            }
            catch (Exception e)
            {
                failure = ExceptionDispatchInfo.Capture(e);
            }
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.IsBackground = true;
        thread.Start();
        thread.Join();
        failure?.Throw();
        return result;
    }
}
