using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Registration;

namespace Precheck.Core.Input;

/// <summary>bit.input이 쓰는 부품 한 벌. 도우미는 Precheck.Windows의 것을, 시험은 가짜를 넣는다.</summary>
public sealed class InputServices
{
    public InputServices(
        BitServices bit,
        HostSignal signal,
        Func<string, IChartUi> openUi,
        IInputConfirm confirm,
        Func<int, IProgressWindow> openProgress,
        Func<HospitalRegistration, IBatchJournal> openJournal,
        IMemoMatcher matcher,
        Func<IDisposable?>? tryLock = null,
        Action<string?, string?>? log = null,
        NoAskSwitch? noAsk = null)
    {
        Bit = bit ?? throw new ArgumentNullException(nameof(bit));
        Signal = signal ?? throw new ArgumentNullException(nameof(signal));
        OpenUi = openUi ?? throw new ArgumentNullException(nameof(openUi));
        Confirm = confirm ?? throw new ArgumentNullException(nameof(confirm));
        OpenProgress = openProgress ?? throw new ArgumentNullException(nameof(openProgress));
        OpenJournal = openJournal ?? throw new ArgumentNullException(nameof(openJournal));
        Matcher = matcher ?? throw new ArgumentNullException(nameof(matcher));
        TryLock = tryLock ?? (() => WorkLock.TryAcquire(WorkLock.InputWait));
        Log = log;
        NoAsk = noAsk ?? new NoAskSwitch();
    }

    public BitServices Bit { get; }
    public HostSignal Signal { get; }

    /// <summary>등록한 설치 위치로 비트 화면을 잡는다.</summary>
    public Func<string, IChartUi> OpenUi { get; }

    public IInputConfirm Confirm { get; }

    /// <summary>진행 창을 띄운다(인자: 전체 수). [확인] 뒤에만 부른다.</summary>
    public Func<int, IProgressWindow> OpenProgress { get; }

    public Func<HospitalRegistration, IBatchJournal> OpenJournal { get; }
    public IMemoMatcher Matcher { get; }

    /// <summary>작업 잠금. 못 잡으면 null.</summary>
    public Func<IDisposable?> TryLock { get; }

    public Action<string?, string?>? Log { get; }

    /// <summary>이 도우미 프로세스의 묻지 않기(AC-037.4). Program.cs가 처리기를 한 번 붙이므로 프로세스마다 하나다.</summary>
    public NoAskSwitch NoAsk { get; }
}

/// <summary>
/// bit.input 처리기: 묶음 검사(받은 그대로) → 잠금 → 등록 확인·내원 수 → 입력 기록 열기 → 달 파일 검사·쓰다 멈춘 사람 검사 → 빼기(InputBatch)
/// → InputRunner(지문 → PC 확인 창 → [확인] 뒤 차례는 InputRunner.RunConfirmed) → 결과 기록 → 조각으로 답. 남는 사람도 풀 사람도 없으면 창 없이 finished다(AC-035.8).
/// 묻지 않기(AC-037.4)는 services.NoAsk에 있고 웹 메시지에서 읽지 않는다. 끝 JSON에 상태를 싣는다.
/// 진행은 progress 숫자만. 결과는 끝에 JSON 하나를 조각으로(AC-017.6). 보낼 곳이 닫혔으면 보내기 실패는 무시하고 멈춤으로 다룬다(AC-017.9).
/// 칸 ID 목록은 error 봉투에 실을 수 없어(번호만, AC-001.6) E-BIT-UI-CHANGED도 stopped 조각으로 답한다.
/// </summary>
public static class InputCommands
{
    public const string Name = "bit.input";

    public static void Register(Dispatcher dispatcher, InputServices services)
    {
        if (dispatcher == null) throw new ArgumentNullException(nameof(dispatcher));
        if (services == null) throw new ArgumentNullException(nameof(services));
        dispatcher.Register(Name, (request, sink) => Handle(request, sink, services));
    }

    private static void Handle(Request request, IReplySink sink, InputServices services)
    {
        var items = ReadItems(request);
        var code = ReadCode(request);

        // 받은 그대로 먼저 검사한다: 뺀 뒤에 하면 다 빠진 묶음을 틀린 묶음으로 본다(AC-035.8)
        BatchCheck.Validate(items);
        BatchCheck.ValidateCode(code);

        // 다른 프로세스가 쥐고 있으면 확인 창도 비트도 건드리지 않는다(AC-017.10)
        using var workLock = services.TryLock() ?? throw new HelperException(InputErrors.Busy);

        // 입력하는 동안 DB 세션(되돌리는 트랜잭션)을 붙잡지 않는다
        HospitalRegistration registration;
        IReadOnlyDictionary<string, long> visits;
        using (var hospital = HospitalGate.Open(services.Bit))
        {
            registration = hospital.Registration;
            visits = InputBatch.ReadVisits(hospital.Db, items);
        }

        var journal = services.OpenJournal(registration);
        var batch = InputBatch.Prepare(items, visits, journal, code);
        var outcome = batch.Stop ?? RunPrepared(batch, registration, journal, request.Id, sink, services);

        if (outcome.Results.Count > 0)
        {
            try
            {
                journal.SaveResults(outcome);
            }
            catch (HelperException e)
            {
                outcome = outcome.WithCode(e.Code);
            }
        }
        if (outcome.Code != null) services.Log?.Invoke(Name, outcome.Code);

        try
        {
            Chunker.Send(sink, request.Id, outcome.ToJson(services.NoAsk.IsOn));
        }
        catch (Exception e) when (IsClosedOutput(e))
        {
            // 보낼 곳이 닫혔다. 결과는 이미 작업 저장에 있다
        }
    }

    private static InputOutcome RunPrepared(InputBatch batch, HospitalRegistration registration, IInputJournal journal, string requestId, IReplySink sink, InputServices services)
    {
        if (batch.Remaining.Count == 0 && batch.Released.Count == 0)
        {
            return batch.WithExcluded(new InputOutcome(InputStatus.Finished, null, null, null, null));
        }

        using var reply = new ProgressReply(sink, requestId, services.OpenProgress);
        using var ui = services.OpenUi(registration.InstallPath);
        var runner = new InputRunner(ui, services.Confirm, reply, journal, services.Matcher,
            () => services.Signal.StdinClosed || reply.StopPressed || reply.OutputClosed);
        return runner.Run(batch, registration, services.NoAsk);
    }

    private static List<InputItem> ReadItems(Request request)
    {
        if (request.Args.ValueKind != JsonValueKind.Object
            || !request.Args.TryGetProperty("items", out var array)
            || array.ValueKind != JsonValueKind.Array)
        {
            throw new ProtocolException(ErrorCodes.BadMessage, request.Id);
        }
        var items = new List<InputItem>(array.GetArrayLength());
        foreach (var element in array.EnumerateArray())
        {
            var checkedByHand = element.TryGetProperty("checkedByHand", out var hand) && hand.ValueKind == JsonValueKind.True;
            var replaces = element.TryGetProperty("replaces", out _) ? Text(element, "replaces", request) : null;
            // 뒤에 붙이기(AC-6611.2). replaces와 함께 오면 BatchCheck가 거절한다
            var appends = element.TryGetProperty("appends", out _) ? Text(element, "appends", request) : null;
            items.Add(new InputItem(Text(element, "visitKey", request), Text(element, "chart", request), Text(element, "name", request), Text(element, "date", request), Text(element, "memo", request), checkedByHand, replaces, appends));
        }
        return items;
    }

    /// <summary>고른 처방코드. 칸이 없으면 null이다. 있는데 글자가 아니면 null로 보지 않고 틀린 메시지다(AC-036.1).</summary>
    private static string? ReadCode(Request request) =>
        request.Args.TryGetProperty("code", out _) ? Text(request.Args, "code", request) : null;

    private static string Text(JsonElement element, string name, Request request)
    {
        if (element.ValueKind != JsonValueKind.Object
            || !element.TryGetProperty(name, out var value)
            || !Envelope.TryGetString(value, out var text))
        {
            throw new ProtocolException(ErrorCodes.BadMessage, request.Id);
        }
        return text;
    }

    private static bool IsClosedOutput(Exception e) => e is IOException || e is ObjectDisposedException;

    /// <summary>진행 숫자를 진행 창과 웹에 보낸다. 창은 첫 알림(= [확인] 뒤)에 띄운다. 숫자만 받는다.</summary>
    private sealed class ProgressReply : IInputProgress, IDisposable
    {
        private readonly IReplySink sink;
        private readonly string requestId;
        private readonly Func<int, IProgressWindow> openWindow;
        private IProgressWindow? window;

        public ProgressReply(IReplySink sink, string requestId, Func<int, IProgressWindow> openWindow)
        {
            this.sink = sink;
            this.requestId = requestId;
            this.openWindow = openWindow;
        }

        public bool StopPressed => window != null && window.StopPressed;

        public bool OutputClosed { get; private set; }

        public void Report(int done, int total)
        {
            window ??= openWindow(total);
            window.Update(done, total);
            if (OutputClosed) return;
            try
            {
                sink.Send(Envelope.Progress(requestId, done, total));
            }
            catch (Exception e) when (IsClosedOutput(e))
            {
                OutputClosed = true;
            }
        }

        public void Dispose() => window?.Dispose();
    }
}
