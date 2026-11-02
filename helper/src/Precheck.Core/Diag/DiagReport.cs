using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

namespace Precheck.Core.Diag;

/// <summary>
/// 측정 보고서 쓰기. 멈추거나 죽어도 그때까지의 결과가 남게 쓸 때마다 디스크까지 비운다.
/// Line = 확정 줄(앞의 꼬리도 함께 확정). Tail = 아직 합산 중인 꼬리 줄: 확정한 자리까지 자르고 다시 쓴다.
/// 45분 감시 스레드도 쓰므로 잠금 안에서만 파일을 만진다. 메모장이 열 수 있게 UTF-8 BOM으로 시작한다.
/// </summary>
public sealed class DiagReport
{
    private static readonly UTF8Encoding Utf8 = new UTF8Encoding(false);

    private readonly object gate = new object();
    private readonly Stream stream;
    private long committed;

    public DiagReport(Stream stream)
    {
        this.stream = stream ?? throw new ArgumentNullException(nameof(stream));
        lock (gate)
        {
            stream.Write(new byte[] { 0xEF, 0xBB, 0xBF }, 0, 3);
            Sync();
            committed = stream.Position;
        }
    }

    public void Line(string text)
    {
        lock (gate)
        {
            Append(text);
            Sync();
            committed = stream.Position;
        }
    }

    public void Tail(IEnumerable<string> lines)
    {
        if (lines == null) throw new ArgumentNullException(nameof(lines));
        lock (gate)
        {
            stream.SetLength(committed);
            stream.Position = committed;
            foreach (var line in lines) Append(line);
            Sync();
        }
    }

    private void Append(string text)
    {
        var bytes = Utf8.GetBytes(DiagFormat.Clip(text) + "\r\n");
        stream.Write(bytes, 0, bytes.Length);
    }

    private void Sync()
    {
        stream.Flush();
        if (stream is FileStream file) file.Flush(true);
    }
}
