using System;
using System.IO;
using System.Text;
using Erp.Core;
using Erp.Core.Closing;
using Precheck.Core.Input;
using Precheck.Core.Protocol;
using Precheck.Core.Registration;

namespace Erp.Helper;

/// <summary>
/// ERP 마감일지 도우미 입구(spec erp-closing-fill design.md 3-4, AC-3611.3). 두 가지로 켜진다.
/// - 등록 모드: 인자가 정확히 [--register] 하나(설치 파일 install.ps1이 부른다). 기존 등록 흐름(RegisterFlow: 비트 로그인 창 → 병원 확인 →
///   PC 확인 창 5분)으로 ERP 도우미 자기 등록 파일을 쓰고 끝난다. 종료 번호 0 = 저장, 1 = 취소, 2 = 오류. 기록엔 register와 오류 번호만.
/// - 그 밖: 크롬이 켠다(첫 인자가 호출 origin이라 등록 창은 뜨지 않는다). 기존 도우미 Program과 같은 차례로 ERP 명령 표·마감일지 두 명령만 붙여
///   표준 입력·출력으로 메시지 틀을 주고받는다(MessageLoop). hello·다른 명령은 붙이지 않는다(표에 없는 명령은 E-HELPER-UNKNOWN-COMMAND).
/// 표준 출력에는 메시지 틀만 나간다.
/// </summary>
internal static class Program
{
    /// <summary>등록 모드 인자. 이것 하나만 있을 때만 등록 창을 띄운다.</summary>
    public const string RegisterArgument = "--register";

    public const int RegisterSaved = 0;
    public const int RegisterCancelled = 1;
    public const int RegisterFailed = 2;

    private static int Main(string[] args)
    {
        // 표준 출력은 크롬과의 메시지 통로다. 어디서든 Console 글쓰기가 섞여 통로를 깨지 않게 버린다
        Console.SetOut(TextWriter.Null);
        Console.SetError(TextWriter.Null);

        var log = new ErpLog();
        if (IsRegister(args)) return Register(log);

        AppDomain.CurrentDomain.UnhandledException += (sender, e) => log.Write(null, ErrorCodes.Disconnected);

        try
        {
            var table = ErpCommandTable.Load();
            var dispatcher = new Dispatcher(table, log.Write);
            ClosingCommands.Register(dispatcher, ErpServices.Create());

            // 표준 입력은 따로 읽는다(기존 도우미와 같다): 긴 명령 중에도 닫힘을 알아챈다. 메시지는 하나씩 처리한다
            var signal = new HostSignal();
            using var stdin = Console.OpenStandardInput();
            using var input = new StdinPump(stdin, signal);
            using var output = Console.OpenStandardOutput();
            // 목록 확장('ERP 마감일지 입력 목록')이 켜면 첫 인자만 명령 표 확장 origin으로 바꿔 넘긴다. 그 밖은 그대로(spec erp-copy-list AC-3902.4)
            return MessageLoop.Run(ErpCallers.ForMessageLoop(args, table), input, output, table, dispatcher, log.Write);
        }
        catch (Exception)
        {
            log.Write(null, ErrorCodes.Disconnected);
            return MessageLoop.ExitCrashed;
        }
    }

    /// <summary>크롬은 첫 인자로 origin(과 창 번호)을 넘긴다. 정확히 [--register] 하나일 때만 등록 모드다.</summary>
    private static bool IsRegister(string[] args) => args != null && args.Length == 1 && string.Equals(args[0], RegisterArgument, StringComparison.Ordinal);

    /// <summary>등록 모드. 창은 기존 부품이 STA 스레드에서 띄운다.</summary>
    private static int Register(ErpLog log)
    {
        try
        {
            var saved = RegisterFlow.Run(ErpServices.Create());
            log.WriteRegister(null);
            return saved ? RegisterSaved : RegisterCancelled;
        }
        catch (HelperException e)
        {
            log.WriteRegister(e.Code);
            WriteRegisterError(e.Code);
            return RegisterFailed;
        }
        catch (Exception)
        {
            log.WriteRegister(ErrorCodes.Disconnected);
            WriteRegisterError(ErrorCodes.Disconnected);
            return RegisterFailed;
        }
    }

    /// <summary>
    /// 등록 오류를 설치 창에 알린다(spec erp-bit-anywhere AC-3806.2): 표준 출력에 오류 번호 한 줄, 단계가 있으면 'STEP-단계' 한 줄(ASCII).
    /// 등록 모드는 설치 파일(install.ps1)이 켜므로 표준 출력이 크롬 통로가 아니다. 쓰지 못해도 등록 결과(2)는 그대로 낸다.
    /// </summary>
    private static void WriteRegisterError(string code)
    {
        try
        {
            var text = code + "\r\n";
            var stage = ErpStage.Current;
            if (stage != null) text += "STEP-" + stage + "\r\n";
            var bytes = Encoding.ASCII.GetBytes(text);
            using var output = Console.OpenStandardOutput();
            output.Write(bytes, 0, bytes.Length);
            output.Flush();
        }
        catch (Exception)
        {
            // 창에 못 써도 등록 결과는 그대로
        }
    }
}
