using System;
using System.CodeDom.Compiler;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading;
using Microsoft.CSharp;
using Precheck.Core.Input;
using Precheck.Windows;
using Xunit;

namespace Precheck.Windows.Tests.Input;

[CollectionDefinition("fake-bit", DisableParallelization = true)]
public sealed class FakeBitCollection
{
}

/// <summary>
/// 가짜 비트: 시험 때 임시 폴더 &lt;뿌리&gt;\EXE\BITDoctorOrder.exe를 C#으로 만들어 띄운다(진짜 비트 파일·자료를 쓰지 않는다).
/// 칸 이름은 비트 화면 지문과 같고, 값은 모두 가짜다. 저장 단추를 누르면 메모 칸 글을 기록 파일에 쓴다.
/// 8.3 이름이 아닌 LOCALAPPDATA 아래에 둔다(Actions의 TEMP는 RUNNER~1 꼴이라 프로세스 경로와 글자가 다르다).
/// </summary>
public sealed class FakeBit : IDisposable
{
    // C# 5(.NET Framework csc)로 컴파일한다. 한글은 인자로 받는다. mode: normal · no-memo · two-memos · hidden-memo · unsaved · no-workdate
    private const string Code = @"
using System;
using System.IO;
using System.Text;
using System.Windows.Forms;

static class FakeBitProgram
{
    [STAThread]
    static void Main(string[] a)
    {
        string outpatientTitle = a[0], visitsTitle = a[1], chart = a[2], name = a[3], memo = a[4], work = a[5], from = a[6], to = a[7], mode = a[8], record = a[9], unsaved = a[10];

        var outpatient = new Form { Text = outpatientTitle, Width = 640, Height = 420, StartPosition = FormStartPosition.Manual, Left = 20, Top = 20 };
        var chartBox = new TextBox { Name = ""txtChtNum"", Text = chart, Left = 10, Top = 10, Width = 200 };
        var nameLabel = new Label { Name = ""lbPatName"", Text = name, Left = 10, Top = 40, Width = 200 };
        var memoBox = new TextBox { Name = ""txtBilCmt"", Text = memo, Multiline = true, Left = 10, Top = 70, Width = 400, Height = 100 };
        var save = new Button { Name = ""btnBilCmtModify"", Text = ""save"", Left = 10, Top = 180, Width = 100 };
        var workBox = new TextBox { Name = ""dtpWorkDate"", Text = work, Left = 10, Top = 210, Width = 200 };
        save.Click += delegate { File.WriteAllText(record, memoBox.Text, new UTF8Encoding(false)); };
        outpatient.Controls.Add(chartBox);
        outpatient.Controls.Add(nameLabel);
        outpatient.Controls.Add(save);
        if (mode != ""no-memo"") outpatient.Controls.Add(memoBox);
        if (mode != ""no-workdate"") outpatient.Controls.Add(workBox);
        if (mode == ""two-memos"") outpatient.Controls.Add(new TextBox { Name = ""txtBilCmt"", Left = 220, Top = 10, Width = 100 });
        if (mode == ""hidden-memo"") outpatient.Controls.Add(new TextBox { Name = ""txtBilCmt"", Left = 220, Top = 10, Width = 100, Visible = false });

        var visits = new Form { Text = visitsTitle, Width = 640, Height = 420, StartPosition = FormStartPosition.Manual, Left = 680, Top = 20, ShowInTaskbar = false };
        var combo = new ComboBox { Name = ""cbSch"", DropDownStyle = ComboBoxStyle.DropDownList, Left = 10, Top = 10, Width = 120 };
        combo.Items.Add(""name"");
        combo.Items.Add(a[11]);
        combo.SelectedIndex = 1;
        visits.Controls.Add(combo);
        visits.Controls.Add(new TextBox { Name = ""txtSch"", Left = 140, Top = 10, Width = 120 });
        visits.Controls.Add(new Button { Name = ""btnSch"", Text = ""search"", Left = 270, Top = 10, Width = 80 });
        visits.Controls.Add(new Panel { Name = ""ctgMain"", Left = 10, Top = 40, Width = 500, Height = 300 });
        visits.Controls.Add(new TextBox { Name = ""dtpFrom"", Text = from, Left = 360, Top = 10, Width = 100 });
        visits.Controls.Add(new TextBox { Name = ""dtpTo"", Text = to, Left = 470, Top = 10, Width = 100 });

        outpatient.Shown += delegate
        {
            visits.Show();
            if (mode == ""unsaved"")
            {
                var timer = new Timer { Interval = 200 };
                timer.Tick += delegate { timer.Stop(); MessageBox.Show(unsaved, ""BIT""); File.WriteAllText(record + "".dialog-closed"", ""x""); };
                timer.Start();
            }
        };
        Application.Run(outpatient);
    }
}
";

    private readonly Process process;

    private FakeBit(string root, Process process, string record)
    {
        Root = root;
        this.process = process;
        Record = record;
    }

    public const string Chart = "900001";
    public const string Name = "가상환자01";
    public const string Date = "2026-10-27";

    public string Root { get; }

    /// <summary>저장 단추를 누르면 메모 칸 글이 쓰이는 파일.</summary>
    public string Record { get; }

    public static string NewRoot() =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PrecheckTests", Guid.NewGuid().ToString("N"));

    public static FakeBit Start(string mode = "normal", string memo = "", string from = "2026-10-27", string to = "2026-10-29", string workDate = Date)
    {
        var root = NewRoot();
        var exeFolder = Path.Combine(root, "EXE");
        Directory.CreateDirectory(exeFolder);
        var exe = Path.Combine(exeFolder, "BITDoctorOrder.exe");
        Compile(exe);

        var record = Path.Combine(root, "saved.txt");
        var arguments = new[]
        {
            "외래진료실 ( " + Name + " 환자정보 )",
            "내원내역 " + from + " ~ " + to + " - 1명",
            Chart, Name, memo, workDate, from, to, mode, record, "저장되지 않은 처방이 있습니다", "차트번호",
        };
        var process = Process.Start(new ProcessStartInfo(exe, string.Join(" ", arguments.Select(Quote))) { UseShellExecute = false })
            ?? throw new InvalidOperationException("가짜 비트를 띄우지 못했다");
        return new FakeBit(root, process, record);
    }

    private static string Quote(string value) => "\"" + value + "\"";

    private static void Compile(string exe)
    {
        using var provider = new CSharpCodeProvider();
        var parameters = new CompilerParameters(new[] { "System.dll", "System.Windows.Forms.dll", "System.Drawing.dll" }, exe)
        {
            GenerateExecutable = true,
            GenerateInMemory = false,
            IncludeDebugInformation = false,
            CompilerOptions = "/target:winexe /platform:x86",
        };
        var result = provider.CompileAssemblyFromSource(parameters, Code);
        if (result.Errors.HasErrors) throw new InvalidOperationException("가짜 비트 컴파일 실패: " + result.Errors[0]);
    }

    /// <summary>창과 칸이 뜰 때까지 기다린다. 뜨지 않으면 마지막 지문을 돌려준다.</summary>
    public FingerprintResult WaitForWindows(UChartAutomation ui, TimeSpan? wait = null)
    {
        var deadline = DateTime.UtcNow + (wait ?? TimeSpan.FromSeconds(30));
        var last = ui.CheckFingerprint();
        while (!last.Counts.TryGetValue(UiFingerprint.VisitsWindow, out var count) || count != 1 || last.Problems.Contains(UiFingerprint.Process))
        {
            if (DateTime.UtcNow > deadline) return last;
            Thread.Sleep(200);
            last = ui.CheckFingerprint();
        }
        return ui.CheckFingerprint();
    }

    public void Dispose()
    {
        try
        {
            if (!process.HasExited)
            {
                process.Kill();
                process.WaitForExit(10000);
            }
        }
        catch (InvalidOperationException)
        {
        }
        process.Dispose();
        for (var attempt = 0; attempt < 10; attempt++)
        {
            try
            {
                if (Directory.Exists(Root)) Directory.Delete(Root, true);
                return;
            }
            catch (IOException)
            {
                Thread.Sleep(200);
            }
            catch (UnauthorizedAccessException)
            {
                Thread.Sleep(200);
            }
        }
    }
}

internal sealed class YesConfirm : IInputConfirm
{
    public int Asked;

    public bool Ask(string text, TimeSpan timeout, Func<bool> closeRequested)
    {
        Asked++;
        return true;
    }
}

internal sealed class NoProgress : IInputProgress
{
    public void Report(int done, int total)
    {
    }
}

internal sealed class ListJournal : IInputJournal
{
    public List<(string VisitKey, JournalState State)> Marks { get; } = new List<(string VisitKey, JournalState State)>();

    public void Mark(InputItem item, JournalState state) => Marks.Add((item.VisitKey, state));

    public JournalState? LastState(InputItem item)
    {
        JournalState? last = null;
        foreach (var mark in Marks)
        {
            if (mark.VisitKey == item.VisitKey) last = mark.State;
        }
        return last;
    }

    public void SaveResults(InputOutcome outcome)
    {
    }
}

/// <summary>진짜 MemoCompare(TASK-16)가 오기 전의 시험용 짝(AC-016.2 규칙).</summary>
internal sealed class ExactMatcher : IMemoMatcher
{
    public MemoMatch Compare(string ours, string? inBit)
    {
        if (inBit == null) return MemoMatch.Unknown;
        if (inBit.Trim().Length == 0) return MemoMatch.Absent;
        return MemoApproval.Matches(inBit, ours) ? MemoMatch.Same : MemoMatch.Different;
    }
}
