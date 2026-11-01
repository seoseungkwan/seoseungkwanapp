using System;
using System.IO;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Helper.Commands;

namespace Precheck.Helper;

/// <summary>
/// 크롬이 켜는 네이티브 메시징 도우미 입구. 크롬이 넘긴 첫 인자(호출 origin)를 보고, 표준 입력·출력으로
/// 메시지 틀을 주고받는다(MessageLoop). 표준 출력에는 메시지 틀만 나간다 (AC-001.1·AC-001.3·AC-001.6).
/// 명령 처리기: hello, bit.check·bit.register(TASK-5). 다른 명령은 뒤 TASK가 붙인다
/// (비트를 읽는 명령은 처음에 Commands/RequireHospital로 등록 병원을 다시 확인한다).
/// </summary>
internal static class Program
{
    private static int Main(string[] args)
    {
        // 표준 출력은 크롬과의 메시지 통로다. 어디서든 Console 글쓰기가 섞여 통로를 깨지 않게 버린다
        Console.SetOut(TextWriter.Null);
        Console.SetError(TextWriter.Null);

        var log = new DiagnosticLog();
        AppDomain.CurrentDomain.UnhandledException += (sender, e) => log.Write(null, ErrorCodes.Disconnected);

        try
        {
            var table = CommandTable.LoadEmbedded();
            var dispatcher = new Dispatcher(table, log.Write);
            Hello.Register(dispatcher, table);
            BitCommands.Register(dispatcher, HelperServices.Create());
            HelperStore.Register(dispatcher);

            using var input = Console.OpenStandardInput();
            using var output = Console.OpenStandardOutput();
            return MessageLoop.Run(args, input, output, table, dispatcher, log.Write);
        }
        catch (Exception)
        {
            log.Write(null, ErrorCodes.Disconnected);
            return MessageLoop.ExitCrashed;
        }
    }
}
