using System;
using System.Drawing;
using System.Threading;
using System.Windows.Forms;
using Precheck.Core.Input;

namespace Precheck.Windows;

/// <summary>
/// 입력 중 진행 창(목업 화면 5 '입력 중'): 진행 N/M명과 [멈추기]. 숫자만 보인다(이름·차트번호·메모 없음, AC-017.6).
/// 맨 위에 뜨지만 초점을 뺏지 않는다: 자동 입력은 비트 목록이 초점을 가진 동안만 키를 누른다.
/// [멈추기]는 '지금 사람까지'다(AC-017.5). 창 닫기도 멈추기로 본다.
/// </summary>
public sealed class ProgressWindow : IProgressWindow
{
    private readonly ManualResetEventSlim ready = new ManualResetEventSlim();
    private readonly Thread thread;
    private ProgressForm? form;
    private int stop;

    public ProgressWindow()
    {
        thread = new Thread(() =>
        {
            using var created = new ProgressForm(RequestStop);
            form = created;
            created.HandleCreated += (sender, e) => ready.Set();
            Application.Run(created);
        })
        {
            IsBackground = true,
            Name = "precheck-progress",
        };
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        // [멈추기] 없이 입력하지 않는다: 창이 뜨지 않으면 입력 전에 여기서 멈춘다
        if (!ready.Wait(TimeSpan.FromSeconds(10))) throw new InvalidOperationException("진행 창을 띄우지 못했다");
    }

    public bool StopPressed => Volatile.Read(ref stop) != 0;

    /// <summary>[멈추기]. 지금 사람까지 하고 멈춘다.</summary>
    public void RequestStop() => Volatile.Write(ref stop, 1);

    public void Update(int done, int total) => OnForm(target => target.Show(done, total, StopPressed));

    public void Dispose()
    {
        OnForm(target => target.CloseForGood());
        thread.Join(TimeSpan.FromSeconds(5));
        ready.Dispose();
    }

    private void OnForm(Action<ProgressForm> work)
    {
        var target = form;
        if (target == null || !ready.IsSet) return;
        try
        {
            target.BeginInvoke(new Action(() => work(target)));
        }
        catch (InvalidOperationException)
        {
            // 창이 이미 닫혔다
        }
    }

    private sealed class ProgressForm : Form
    {
        private const int WsExNoActivate = 0x08000000;
        private const int WsExTopMost = 0x00000008;

        private readonly Action requestStop;
        private readonly Label count;
        private readonly Button stop;
        private bool closing;

        public ProgressForm(Action requestStop)
        {
            this.requestStop = requestStop;
            Text = ConfirmWindow.Title;
            TopMost = true;
            ShowInTaskbar = true;
            MaximizeBox = false;
            MinimizeBox = false;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            StartPosition = FormStartPosition.Manual;
            AutoSize = true;
            AutoSizeMode = AutoSizeMode.GrowAndShrink;
            Font = new Font("Malgun Gothic", 10f);
            Padding = new Padding(12);

            count = new Label { Text = "입력 준비 중", AutoSize = true, Margin = new Padding(0, 0, 0, 8), UseMnemonic = false };
            var note = new Label
            {
                Text = "입력하는 동안 마우스와 키보드를 쓰지 마세요.",
                AutoSize = true,
                MaximumSize = new Size(320, 0),
                Margin = new Padding(0, 0, 0, 8),
                UseMnemonic = false,
            };
            stop = new Button { Text = "멈추기", AutoSize = true, MinimumSize = new Size(96, 32) };
            stop.Click += (sender, e) => PressStop();

            var layout = new TableLayoutPanel { ColumnCount = 1, RowCount = 3, AutoSize = true, Dock = DockStyle.Fill };
            layout.Controls.Add(count, 0, 0);
            layout.Controls.Add(note, 0, 1);
            layout.Controls.Add(stop, 0, 2);
            Controls.Add(layout);

            Load += (sender, e) =>
            {
                var area = Screen.PrimaryScreen?.WorkingArea ?? new Rectangle(0, 0, 800, 600);
                Location = new Point(area.Right - Width - 16, area.Bottom - Height - 16);
            };
        }

        protected override bool ShowWithoutActivation => true;

        protected override CreateParams CreateParams
        {
            get
            {
                var parameters = base.CreateParams;
                parameters.ExStyle |= WsExNoActivate | WsExTopMost;
                return parameters;
            }
        }

        public void Show(int done, int total, bool stopped)
        {
            count.Text = "입력 " + done + "/" + total + "명";
            if (stopped) ShowStopped();
        }

        public void CloseForGood()
        {
            closing = true;
            Close();
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (!closing)
            {
                // 입력 중에 창을 닫으면 멈추기로 본다. 창은 끝날 때까지 남는다
                e.Cancel = true;
                PressStop();
            }
            base.OnFormClosing(e);
        }

        private void PressStop()
        {
            requestStop();
            ShowStopped();
        }

        private void ShowStopped()
        {
            stop.Enabled = false;
            stop.Text = "지금 환자까지 하고 멈춥니다";
        }
    }
}
