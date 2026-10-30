namespace Precheck.Core.Protocol;

/// <summary>hello → result {helperVersion, protocol} (AC-001.4). 웹이 청구 화면을 열 때마다 버전을 맞춘다(design.md 4-4).</summary>
public static class Hello
{
    public const string Name = "hello";

    public static void Register(Dispatcher dispatcher, CommandTable table)
    {
        var protocol = table.Protocol;
        dispatcher.Register(Name, (request, sink) =>
            sink.Send(Envelope.Result(request.Id, new { helperVersion = HelperVersion.Value, protocol })));
    }
}
