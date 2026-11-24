using System;
using System.IO;
using System.Text;
using Erp.Core;
using Erp.Core.Closing;
using Erp.Core.Uisarang;
using Precheck.Core.Bit;
using Precheck.Core.Input;
using Precheck.Core.Protocol;
using Precheck.Core.Registration;

namespace Erp.Helper;

/// <summary>
/// ERP 마감일지 도우미 입구(spec erp-closing-fill design.md 3-4, AC-3611.3). 두 가지로 켜진다.
/// - 등록 모드: 인자가 정확히 [--register] 하나(설치 파일 install.ps1이 부른다). 기존 등록 흐름(RegisterFlow: 비트 로그인 창 → 병원 확인 →
///   PC 확인 창 5분)으로 ERP 도우미 자기 등록 파일을 쓰고 끝난다. 종료 번호 0 = 저장, 1 = 취소, 2 = 오류. 기록엔 register와 오류 번호만.
///   비트를 못 찾았을 때(E-BIT-NOT-FOUND)만 의사랑을 찾아, 있으면 창 없이 의사랑 PC로 등록한다(spec erp-uisarang design.md 4-3, AC-4201.2).
///   비트 등록을 저장하면 의사랑 자료원 파일을 지운다.
/// - 그 밖: 크롬이 켠다(첫 인자가 호출 origin이라 등록 창은 뜨지 않는다). 기존 도우미 Program과 같은 차례로 ERP 명령 표·마감일지 두 명령만 붙여
///   표준 입력·출력으로 메시지 틀을 주고받는다(MessageLoop). hello·다른 명령은 붙이지 않는다(표에 없는 명령은 E-HELPER-UNKNOWN-COMMAND).
///   자료원 파일(data\source.json)이 의사랑이면 의사랑 처리기만, 아니면(비트 PC = 파일 없음) 지금 마감일지 처리기 줄 그대로 + 비트 덧 명령 한 줄(AC-4215.4).
/// 표준 출력에는 메시지 틀만 나간다.
/// </summary>
internal static class Program
{
    /// <summary>등록 모드 인자. 이것 하나만 있을 때만 등록 창을 띄운다.</summary>
    public const string RegisterArgument = "--register";

    public const int RegisterSaved = 0;
    public const int RegisterCancelled = 1;
    public const int RegisterFailed = 2;

    /// <summary>의사랑 등록 끝 알림 줄(spec erp-uisarang AC-4201.2, install.ps1이 고른다). ASCII.</summary>
    public const string SourceUisarangLine = "SOURCE-UISARANG";
    public const string FolderDesktopLine = "FOLDER-DESKTOP";
    public const string FolderProfileLine = "FOLDER-PROFILE";

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
            // spec erp-uisarang design.md 4-3: 자료원은 켤 때 한 번 정한다. 비트 갈래는 지금 줄 그대로에 비트 덧 명령(closing.source·closing.uisCodes) 한 줄
            if (UisSource.Read(ErpServices.DataDirectory()) != null)
            {
                UisCommands.RegisterUisarang(dispatcher, UisHelperServices.Create(log.Write));
            }
            else
            {
                ClosingCommands.Register(dispatcher, ErpServices.Create());
                UisCommands.RegisterBitExtras(dispatcher);
            }

            // 표준 입력은 따로 읽는다(기존 도우미와 같다): 긴 명령 중에도 닫힘을 알아챈다. 메시지는 하나씩 처리한다
            var signal = new HostSignal();
            using var stdin = Console.OpenStandardInput();
            using var input = new StdinPump(stdin, signal);
            using var output = Console.OpenStandardOutput();
            return MessageLoop.Run(args, input, output, table, dispatcher, log.Write);
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
            // spec erp-uisarang AC-4201.2: 비트로 저장했으면 의사랑 자료원 파일을 지운다(못 지우면 E-STORE-FAILED·단계 UIS로 2)
            if (saved) UisHelperServices.ForgetUisarang();
            log.WriteRegister(null);
            return saved ? RegisterSaved : RegisterCancelled;
        }
        catch (HelperException e) when (e.Code == BitErrors.NotFound)
        {
            return RegisterUisarang(log);
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
    /// 비트를 못 찾았을 때(E-BIT-NOT-FOUND)만(spec erp-uisarang design.md 4-3, AC-4201.2). 의사랑이 있으면 비트 로그인 창·PC 확인 창 없이
    /// 엑셀 폴더·자료원 파일을 만들고 표준 출력에 두 줄을 쓴 뒤 0. 의사랑도 없으면 지금처럼 E-BIT-NOT-FOUND(단계 FIND)로 2.
    /// 폴더를 못 만들면 E-UIS-FOLDER, 자료원 파일을 못 쓰면 E-STORE-FAILED(둘 다 단계 UIS), 그 밖 예외는 E-BRIDGE-DISCONNECTED로 2. 기록엔 register와 번호만.
    /// </summary>
    private static int RegisterUisarang(ErpLog log)
    {
        string code;
        try
        {
            var folder = UisHelperServices.Register();
            if (folder != null)
            {
                log.WriteRegister(null);
                WriteRegisterSource(folder.Value);
                return RegisterSaved;
            }
            code = BitErrors.NotFound;
        }
        catch (HelperException e)
        {
            code = e.Code;
        }
        catch (Exception)
        {
            code = ErrorCodes.Disconnected;
        }
        log.WriteRegister(code);
        WriteRegisterError(code);
        return RegisterFailed;
    }

    /// <summary>
    /// 의사랑 등록 끝을 설치 창에 알린다(spec erp-uisarang AC-4201.2): 표준 출력에 SOURCE-UISARANG과 FOLDER-DESKTOP 또는 FOLDER-PROFILE을 한 줄씩(ASCII).
    /// 쓰지 못해도 등록 결과(0)는 그대로 낸다(자료원 파일은 이미 썼다).
    /// </summary>
    private static void WriteRegisterSource(UisFolderKind folder)
    {
        try
        {
            var text = SourceUisarangLine + "\r\n" + (folder == UisFolderKind.Profile ? FolderProfileLine : FolderDesktopLine) + "\r\n";
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
