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
/// 글은 넘겨받은 것만 보인다: 도우미가 비트·묶음에서 만든 글(RegisterPrompt 등). 창 제목은 고정 글자.
/// TASK-17(입력 확인)도 이 창을 쓴다: 표준 입력이 닫히면 [취소]처럼 닫힌다(AC-017.9).
/// </summary>
public sealed class ConfirmWindow : IConfirmWindow, IInputConfirm
{
    public const string Title = "청구메모 도우미";

    private const int CloseCheckMs = 250;

    public bool Show(string text, TimeSpan timeout) => Ask(text, timeout, () => false);

    public bool Ask(string text, TimeSpan timeout, Func<bool> closeRequested)
    {
        if (text == null) throw new ArgumentNullException(nameof(text));
        if (closeRequested == null) throw new ArgumentNullException(nameof(closeRequested));
        if (timeout <= TimeSpan.Zero || closeRequested()) return false;
        return Sta.Run(() => ShowHere(text, timeout, closeRequested));
    }

    private static bool ShowHere(string text, TimeSpan timeout, Func<bool> closeRequested)
    {
        using var form = new ConfirmForm(text);
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
        return form.ShowDialog() == DialogResult.OK;
    }

    private sealed class ConfirmForm : Form
    {
        public ConfirmForm(string text)
        {
            Text = Title;
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

            var message = new Label
            {
                Text = text,
                AutoSize = true,
                MaximumSize = new Size(560, 0),
                Margin = new Padding(0, 0, 0, 16),
                UseMnemonic = false,
            };
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

            var layout = new TableLayoutPanel { ColumnCount = 1, RowCount = 2, AutoSize = true, Dock = DockStyle.Fill };
            layout.Controls.Add(message, 0, 0);
            layout.Controls.Add(buttons, 0, 1);
            Controls.Add(layout);

            CancelButton = cancel;
            ActiveControl = cancel;
        }
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
