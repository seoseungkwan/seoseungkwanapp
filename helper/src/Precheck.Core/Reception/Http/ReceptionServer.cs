using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using Precheck.Core.Protocol;

namespace Precheck.Core.Reception.Http;

/// <summary>
/// 접수 현황 작은 웹 서버(design.md 7절, REQ-1406). TcpListener로 받기만 하고(바깥으로 붙는 길 없음, AC-1413.1), 응답마다 연결을 닫는다(keep-alive 없음).
/// - 받은 연결의 보낸 쪽이 사설 주소·이 PC 자신이 아니면 읽지 않고 끊는다(AC-1406.1).
/// - 동시에 32개가 열려 있으면 그다음 연결만 답 없이 끊는다(AC-1406.4). 연결마다 제 실행 줄(스레드) 하나라서
///   느린 연결(읽기는 5초까지 기다린다)이 공용 작업 줄을 붙잡지 않고, 다른 연결을 막지 않는다.
/// - 요청 하나를 HttpRequestReader로 읽는다: 아무것도 안 오거나 끊기면 답 없이 닫고, 400·408·413·431은 몸 없는 답을 쓴 뒤 닫는다.
///   그 밖은 ReceptionRouter의 답을 쓴다. 답을 쓴 뒤에는 보내기 쪽을 닫고 남은 받은 바이트를 잠깐 비워 답이 끊김(RST)에 묻히지 않게 한다.
/// - 기록(ReceptionLog)에는 오류 번호와 건수만 남는다(AC-1406.7). 한 연결의 오류는 그 연결에서 끝나고 서버는 계속 돈다.
/// </summary>
public sealed class ReceptionServer : IDisposable
{
    /// <summary>동시에 여는 연결 수의 끝(AC-1406.4).</summary>
    public const int MaxConnections = 32;

    /// <summary>답 쓰기 한 번을 기다리는 가장 긴 시간(읽지 않는 상대가 실행 줄을 붙잡지 않게).</summary>
    public static readonly TimeSpan WriteTimeout = TimeSpan.FromSeconds(5);

    /// <summary>답 뒤에 남은 받은 바이트를 비우는 가장 긴 시간과 양.</summary>
    private static readonly TimeSpan DrainTime = TimeSpan.FromSeconds(1);

    private const int DrainBytes = 64 * 1024;

    private readonly ReceptionRouter router;
    private readonly ReceptionLog? log;
    private readonly TimeSpan readTimeout;
    private readonly object gate = new object();
    private readonly HashSet<Socket> open = new HashSet<Socket>();

    private TcpListener? listener;
    private Thread? acceptor;
    private bool stopping;

    /// <param name="router">요청마다 답을 만든다.</param>
    /// <param name="log">기록(없으면 남기지 않음).</param>
    /// <param name="readTimeout">요청 하나를 다 받기까지 기다리는 시간. 없으면 HttpRequestReader.DefaultTimeout(5초).</param>
    public ReceptionServer(ReceptionRouter router, ReceptionLog? log = null, TimeSpan? readTimeout = null)
    {
        this.router = router ?? throw new ArgumentNullException(nameof(router));
        this.log = log;
        this.readTimeout = readTimeout ?? HttpRequestReader.DefaultTimeout;
        if (this.readTimeout <= TimeSpan.Zero) throw new ArgumentOutOfRangeException(nameof(readTimeout));
    }

    /// <summary>듣는 문(Start 뒤). port 0으로 열었으면 운영체제가 고른 번호다.</summary>
    public int Port { get; private set; }

    /// <summary>지금 열려 있는 연결 수.</summary>
    public int Connections
    {
        get
        {
            lock (gate) return open.Count;
        }
    }

    /// <summary>
    /// bind:port에서 듣기 시작한다(보통 IPAddress.Any, ReceptionPorts.Http). 받기는 뒤에서 돈다.
    /// 문을 다른 프로그램이 쓰고 있으면 기록에 E-RECEPTION-PORT-BUSY를 남기고 그 번호의 HelperException을 던진다(다른 문으로 바꾸지 않는다).
    /// </summary>
    public void Start(IPAddress bind, int port)
    {
        if (bind == null) throw new ArgumentNullException(nameof(bind));
        lock (gate)
        {
            if (stopping) throw new ObjectDisposedException(nameof(ReceptionServer));
            if (listener != null) throw new InvalidOperationException("이미 듣고 있다");
            var next = new TcpListener(bind, port);
            try
            {
                // 윈도우에서 다른 프로그램이 같은 문을 겹쳐 잡지 못하게 한다(다른 운영체제는 넘어간다)
                next.ExclusiveAddressUse = true;
            }
            catch (Exception e) when (e is SocketException || e is PlatformNotSupportedException || e is NotSupportedException)
            {
            }
            try
            {
                next.Start();
            }
            catch (SocketException e) when (e.SocketErrorCode == SocketError.AddressAlreadyInUse || e.SocketErrorCode == SocketError.AccessDenied)
            {
                log?.Note(ReceptionErrors.PortBusy);
                log?.Flush();
                throw new HelperException(ReceptionErrors.PortBusy);
            }
            listener = next;
            Port = ((IPEndPoint)next.LocalEndpoint).Port;
            acceptor = new Thread(AcceptLoop) { IsBackground = true, Name = "reception-accept" };
            acceptor.Start();
        }
    }

    /// <summary>받기를 멈추고 열린 연결을 모두 닫는다. 모아 둔 기록을 쓴다.</summary>
    public void Dispose()
    {
        Socket[] sockets;
        TcpListener? stopped;
        lock (gate)
        {
            if (stopping) return;
            stopping = true;
            stopped = listener;
            sockets = new Socket[open.Count];
            open.CopyTo(sockets);
            open.Clear();
        }
        try
        {
            stopped?.Stop();
        }
        catch (SocketException)
        {
        }
        foreach (var socket in sockets) Close(socket);
        if (acceptor != null && acceptor != Thread.CurrentThread) acceptor.Join(TimeSpan.FromSeconds(5));
        log?.Flush();
    }

    private void AcceptLoop()
    {
        var accepting = listener!;
        while (true)
        {
            Socket socket;
            try
            {
                socket = accepting.AcceptSocket();
            }
            catch (Exception e) when (e is SocketException || e is ObjectDisposedException || e is InvalidOperationException)
            {
                lock (gate)
                {
                    if (stopping) return;
                }
                // 받기 하나가 실패했다(상대가 먼저 끊음 등). 잠깐 쉬고 다시 받는다
                Thread.Sleep(10);
                continue;
            }
            Admit(socket);
        }
    }

    private void Admit(Socket socket)
    {
        IPAddress? remote;
        try
        {
            remote = (socket.RemoteEndPoint as IPEndPoint)?.Address;
        }
        catch (Exception e) when (e is SocketException || e is ObjectDisposedException)
        {
            remote = null;
        }
        if (remote == null || !ClientGuard.IsPrivateClient(remote))
        {
            log?.Note(ReceptionErrors.NotPrivate);
            Close(socket);
            return;
        }

        lock (gate)
        {
            if (stopping)
            {
                Close(socket);
                return;
            }
            if (open.Count >= MaxConnections)
            {
                log?.Note(ReceptionErrors.Busy);
                Close(socket);
                return;
            }
            open.Add(socket);
        }

        try
        {
            var worker = new Thread(() => Serve(socket, remote)) { IsBackground = true, Name = "reception-connection" };
            worker.Start();
        }
        catch (Exception)
        {
            log?.Note(ReceptionErrors.Failed);
            Release(socket);
        }
    }

    /// <summary>연결 하나: 요청 하나를 읽고 답 하나를 쓴 뒤 닫는다.</summary>
    private void Serve(Socket socket, IPAddress remote)
    {
        try
        {
            socket.NoDelay = true;
            socket.SendTimeout = (int)WriteTimeout.TotalMilliseconds;
            using var stream = new NetworkStream(socket, false);
            HttpResponse response;
            var drain = true;
            try
            {
                var request = HttpRequestReader.Read(stream, readTimeout);
                if (request == null) return;
                response = router.Handle(request, remote, Port);
            }
            catch (HttpReadException e)
            {
                log?.Note(ReceptionErrors.Http(e.Status));
                response = HttpResponse.Empty(e.Status);
                // 시간이 넘으면 읽기 하나가 아직 걸려 있다. 그 위에 더 읽지 않는다
                drain = e.Status != 408;
            }
            response.WriteTo(stream);
            Finish(socket, drain);
        }
        catch (Exception e) when (e is IOException || e is SocketException || e is ObjectDisposedException)
        {
            // 상대가 먼저 끊었다. 기록할 일이 아니다
        }
        catch (Exception)
        {
            log?.Note(ReceptionErrors.Failed);
        }
        finally
        {
            Release(socket);
        }
    }

    /// <summary>보내기 쪽을 닫아 답의 끝을 알리고, 상대가 닫을 때까지(1초·64KB까지) 남은 받은 바이트를 버린다.</summary>
    private static void Finish(Socket socket, bool drain)
    {
        socket.Shutdown(SocketShutdown.Send);
        if (!drain) return;
        var buffer = new byte[4096];
        var deadline = DateTime.UtcNow + DrainTime;
        var total = 0;
        while (total < DrainBytes)
        {
            var left = deadline - DateTime.UtcNow;
            if (left <= TimeSpan.Zero) return;
            if (!socket.Poll((int)Math.Min(left.TotalMilliseconds * 1000, int.MaxValue), SelectMode.SelectRead)) return;
            var n = socket.Receive(buffer);
            if (n <= 0) return;
            total += n;
        }
    }

    private void Release(Socket socket)
    {
        lock (gate) open.Remove(socket);
        Close(socket);
    }

    private static void Close(Socket socket)
    {
        try
        {
            socket.Close();
        }
        catch (Exception)
        {
            // 닫기 실패는 그 연결에서 끝난다
        }
    }
}
