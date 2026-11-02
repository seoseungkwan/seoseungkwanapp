using System;
using System.IO;

namespace Precheck.Core.Diag;

/// <summary>
/// 쉬운 말 진행 표시. 쓰는 글은 여기 적힌 고정 글과 단계 설명, 분·초 숫자뿐이다(환자 값·예외 글을 받지 않는다).
/// 30초마다 Tick을 부르는 쪽이 다른 스레드라 잠금 안에서 쓴다.
/// </summary>
public sealed class DiagProgress
{
    private readonly object gate = new object();
    private readonly TextWriter output;
    private readonly Func<TimeSpan> elapsed;
    private readonly int total;
    private TimeSpan stepStart;
    private bool reading;

    public DiagProgress(TextWriter output, Func<TimeSpan> elapsed, int total)
    {
        this.output = output ?? throw new ArgumentNullException(nameof(output));
        this.elapsed = elapsed ?? throw new ArgumentNullException(nameof(elapsed));
        this.total = total;
    }

    public void Step(int number, string what)
    {
        lock (gate)
        {
            output.WriteLine(number + "/" + total + " 읽는 중… (" + what + ")");
            output.Flush();
            stepStart = elapsed();
            reading = true;
        }
    }

    public void Skip(int number, string what)
    {
        lock (gate)
        {
            output.WriteLine(number + "/" + total + " 건너뛰어요 (" + what + ")");
            output.Flush();
            reading = false;
        }
    }

    public void Tick()
    {
        lock (gate)
        {
            if (!reading) return;
            var spent = elapsed() - stepStart;
            var text = spent.TotalMinutes < 1 ? (int)spent.TotalSeconds + "초째" : (int)spent.TotalMinutes + "분째";
            output.WriteLine("   아직 읽는 중이에요 (" + text + ")");
            output.Flush();
        }
    }

    public void Finish()
    {
        lock (gate)
        {
            reading = false;
        }
    }
}
