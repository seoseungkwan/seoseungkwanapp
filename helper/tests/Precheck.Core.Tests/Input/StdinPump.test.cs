using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using Precheck.Core.Input;
using Precheck.Core.Protocol;
using Precheck.Core.Tests.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Input;

/// <summary>AC-017.9 표준 입력 읽기 스레드와 닫힘 신호. 메시지 고리(MessageLoop)는 그대로 두고 AC-001.1·AC-001.3이 지켜지는지도 본다.</summary>
public class StdinPumpTests
{
    private static readonly CommandTable Table = CommandTable.LoadEmbedded();

    /// <summary>크롬 쪽 파이프 흉내: Push로 넣고 Close로 닫는다. 읽을 것이 없으면 Read가 막힌다.</summary>
    private sealed class PipeStream : Stream
    {
        private readonly BlockingCollection<byte[]> queue = new BlockingCollection<byte[]>();
        private byte[] current = new byte[0];
        private int offset;
        public int Reads;
        public bool Throw;

        public void Push(byte[] data) => queue.Add(data);

        public void Close2() => queue.CompleteAdding();

        public override int Read(byte[] buffer, int start, int count)
        {
            Interlocked.Increment(ref Reads);
            if (Throw) throw new IOException("가짜 파이프 오류");
            if (offset == current.Length)
            {
                if (!queue.TryTake(out var next, Timeout.Infinite)) return 0;
                current = next;
                offset = 0;
            }
            var take = Math.Min(count, current.Length - offset);
            Buffer.BlockCopy(current, offset, buffer, start, take);
            offset += take;
            return take;
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

    private static void WaitFor(Func<bool> condition)
    {
        var deadline = DateTime.UtcNow.AddSeconds(10);
        while (!condition())
        {
            Assert.True(DateTime.UtcNow < deadline, "기다린 일이 일어나지 않았다");
            Thread.Sleep(10);
        }
    }

    private static byte[] Hello(string id = "req-1") => Frames.Frame(Requests.Envelope("hello", "{}", id));

    [Fact(DisplayName = "AC-017.9 명령 처리 중(고리가 읽지 않는 동안)에도 표준 입력이 닫히면 신호가 서고, 처리기가 끝난 뒤 고리는 정상 끝")]
    public void ClosedWhileHandling()
    {
        var pipe = new PipeStream();
        var signal = new HostSignal();
        var output = new MemoryStream();
        using var pump = new StdinPump(pipe, signal);
        var dispatcher = new Dispatcher(Table);
        var sawSignal = false;
        dispatcher.Register("hello", (request, sink) =>
        {
            Assert.False(signal.StdinClosed);
            pipe.Close2();
            WaitFor(() => signal.StdinClosed);
            sawSignal = true;
            sink.Send(Envelope.Result(request.Id, new { ok = true }));
        });
        pipe.Push(Hello());

        var code = MessageLoop.Run(new[] { Requests.Allowed(Table) }, pump, output, Table, dispatcher, null);

        Assert.True(sawSignal);
        Assert.Equal(MessageLoop.ExitOk, code);
        Assert.Single(Frames.ReadAll(output.ToArray()));
    }

    [Fact(DisplayName = "AC-017.9 메시지는 차례 줄에 쌓여 지금처럼 하나씩 처리되고, 닫혀도 쌓인 메시지는 처리한 뒤 끝난다(AC-001.1)")]
    public void QueuesInOrder()
    {
        var pipe = new PipeStream();
        var signal = new HostSignal();
        var output = new MemoryStream();
        using var pump = new StdinPump(pipe, signal);
        var dispatcher = new Dispatcher(Table);
        var order = new List<string>();
        var running = 0;
        dispatcher.Register("hello", (request, sink) =>
        {
            Assert.Equal(1, Interlocked.Increment(ref running));
            order.Add(request.Id);
            if (request.Id == "req-1")
            {
                // 첫 명령 중에 다음 메시지가 오고 표준 입력이 닫힌다
                pipe.Push(Hello("req-2"));
                pipe.Close2();
                WaitFor(() => signal.StdinClosed);
            }
            Interlocked.Decrement(ref running);
        });
        pipe.Push(Hello("req-1"));

        Assert.Equal(MessageLoop.ExitOk, MessageLoop.Run(new[] { Requests.Allowed(Table) }, pump, output, Table, dispatcher, null));
        Assert.Equal(new[] { "req-1", "req-2" }, order);
    }

    [Fact(DisplayName = "AC-017.9 AC-001.3 호출 origin이 틀리면 표준 입력을 한 바이트도 읽지 않는다(스레드는 첫 읽기 때 시작)")]
    public void BadOriginReadsNothing()
    {
        var pipe = new PipeStream();
        var signal = new HostSignal();
        using var pump = new StdinPump(pipe, signal);
        var dispatcher = new Dispatcher(Table);
        Assert.Equal(MessageLoop.ExitRejected, MessageLoop.Run(new[] { "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/" }, pump, new MemoryStream(), Table, dispatcher, null));
        Thread.Sleep(50);
        Assert.Equal(0, pipe.Reads);
        Assert.False(signal.StdinClosed);
    }

    [Fact(DisplayName = "AC-017.9 AC-001.1 끊긴 틀은 그대로 틀 깨짐으로 끝난다")]
    public void BrokenFrame()
    {
        var pipe = new PipeStream();
        var signal = new HostSignal();
        using var pump = new StdinPump(pipe, signal);
        pipe.Push(Frames.Header(100));
        pipe.Close2();
        Assert.Equal(MessageLoop.ExitFramingBroken, MessageLoop.Run(new[] { Requests.Allowed(Table) }, pump, new MemoryStream(), Table, new Dispatcher(Table), null));
        Assert.True(signal.StdinClosed);
    }

    [Fact(DisplayName = "AC-017.9 표준 입력 읽기 오류도 닫힘으로 본다(Read는 끝을 돌려준다)")]
    public void ReadErrorIsClosed()
    {
        var pipe = new PipeStream { Throw = true };
        var signal = new HostSignal();
        using var pump = new StdinPump(pipe, signal);
        Assert.Equal(0, pump.Read(new byte[8], 0, 8));
        Assert.True(signal.StdinClosed);
    }

    [Fact(DisplayName = "AC-017.9 바이트는 나뉘어 와도 차례 그대로, 한도를 넘으면 소비를 기다렸다가 잃지 않고 넘긴다")]
    public void BackPressureKeepsBytes()
    {
        var pipe = new PipeStream();
        var signal = new HostSignal();
        using var pump = new StdinPump(pipe, signal, maxBuffered: 16);
        var data = Enumerable.Range(0, 1000).Select(n => (byte)(n % 251)).ToArray();
        foreach (var part in data.Select((value, index) => new { value, index }).GroupBy(x => x.index / 7))
        {
            pipe.Push(part.Select(x => x.value).ToArray());
        }
        pipe.Close2();

        var read = new List<byte>();
        var buffer = new byte[5];
        int got;
        while ((got = pump.Read(buffer, 0, buffer.Length)) > 0) read.AddRange(buffer.Take(got));
        Assert.Equal(data, read);
        Assert.True(signal.StdinClosed);
    }

    [Fact(DisplayName = "AC-017.9 HostSignal은 한 번 서면 그대로이고 처음엔 서 있지 않다")]
    public void Signal()
    {
        var signal = new HostSignal();
        Assert.False(signal.StdinClosed);
        signal.MarkStdinClosed();
        signal.MarkStdinClosed();
        Assert.True(signal.StdinClosed);
    }
}
