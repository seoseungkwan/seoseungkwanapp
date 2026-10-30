using System;
using System.IO;
using Precheck.Core.Protocol;

namespace Precheck.Helper;

/// <summary>
/// 크롬이 켜는 네이티브 메시징 도우미 입구. 크롬이 넘긴 첫 인자(호출 origin)를 보고, 표준 입력·출력으로
/// 메시지 틀을 주고받는다(MessageLoop). 표준 출력에는 메시지 틀만 나간다 (AC-001.1·AC-001.3·AC-001.6).
/// 명령 처리기는 지금 hello 하나다. 다른 명령은 뒤 TASK가 붙인다.
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
