using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using Precheck.Core.Protocol;

namespace Precheck.Core.Input;

/// <summary>
/// 표준 입력을 따로 읽는 스레드와 차례 줄(AC-017.9). 메시지 고리(MessageLoop)는 이 흐름을 그대로 읽어 지금처럼 하나씩 처리한다.
/// 긴 명령을 처리하는 동안에도 여기서 계속 읽으므로 표준 입력이 닫히면 HostSignal이 곧바로 선다.
/// 스레드는 첫 Read 때 시작한다: 호출 origin이 틀리면 한 바이트도 읽지 않는다(AC-001.3).
/// 쌓인 바이트가 한도를 넘으면 소비될 때까지 더 읽지 않는다(크롬 메시지 하나의 최대 64MiB + 조금).
/// </summary>
public sealed class StdinPump : Stream
{
    private const int ChunkSize = 64 * 1024;
    private const int DefaultMaxBuffered = Framing.MaxIncoming + 1024 * 1024;

    private readonly Stream source;
    private readonly HostSignal signal;
    private readonly long maxBuffered;
    private readonly object gate = new object();
    private readonly Queue<byte[]> queue = new Queue<byte[]>();
    private byte[]? current;
    private int offset;
    private long buffered;
    private bool ended;
    private bool started;

    public StdinPump(Stream source, HostSignal signal, int maxBuffered = DefaultMaxBuffered)
    {
        this.source = source ?? throw new ArgumentNullException(nameof(source));
        this.signal = signal ?? throw new ArgumentNullException(nameof(signal));
        if (maxBuffered <= 0) throw new ArgumentOutOfRangeException(nameof(maxBuffered));
        this.maxBuffered = maxBuffered;
    }

    public override int Read(byte[] buffer, int start, int count)
    {
        if (buffer == null) throw new ArgumentNullException(nameof(buffer));
        if (count == 0) return 0;
        lock (gate)
        {
            StartOnce();
            while (current == null && queue.Count == 0 && !ended) Monitor.Wait(gate);
            if (current == null)
            {
                if (queue.Count == 0) return 0;
                current = queue.Dequeue();
                offset = 0;
            }
            var take = Math.Min(count, current.Length - offset);
            Buffer.BlockCopy(current, offset, buffer, start, take);
            offset += take;
            buffered -= take;
            if (offset == current.Length) current = null;
            Monitor.PulseAll(gate);
            return take;
        }
    }

    private void StartOnce()
    {
        if (started) return;
        started = true;
        new Thread(Pump) { IsBackground = true, Name = "precheck-stdin" }.Start();
    }

    private void Pump()
    {
        try
        {
            while (true)
            {
                var chunk = new byte[ChunkSize];
                var read = source.Read(chunk, 0, chunk.Length);
                if (read <= 0) break;
                if (read < chunk.Length) Array.Resize(ref chunk, read);
                lock (gate)
                {
                    while (buffered >= maxBuffered) Monitor.Wait(gate);
                    queue.Enqueue(chunk);
                    buffered += chunk.Length;
                    Monitor.PulseAll(gate);
                }
            }
        }
        catch (Exception e) when (e is not OutOfMemoryException)
        {
            // 읽기 오류는 닫힘으로 본다. 예외 글은 쓰지 않는다
        }
        // 신호를 먼저 세운다: 고리가 끝을 보기 전에 처리기가 닫힘을 볼 수 있게
        signal.MarkStdinClosed();
        lock (gate)
        {
            ended = true;
            Monitor.PulseAll(gate);
        }
    }

    public override bool CanRead => true;
    public override bool CanSeek => false;
    public override bool CanWrite => false;
    public override long Length => throw new NotSupportedException();
    public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
    public override void Flush() { }
    public override long Seek(long position, SeekOrigin origin) => throw new NotSupportedException();
    public override void SetLength(long value) => throw new NotSupportedException();
    public override void Write(byte[] buffer, int start, int count) => throw new NotSupportedException();
}
