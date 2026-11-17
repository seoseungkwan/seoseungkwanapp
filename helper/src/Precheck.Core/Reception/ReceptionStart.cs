using System;
using System.Globalization;
using Precheck.Core.Protocol;

namespace Precheck.Core.Reception;

/// <summary>
/// 늘 켜 두는 프로그램 PrecheckReception.exe의 켜는 차례(design.md 9절, REQ-1411). exe(Precheck.Reception/Program.cs)는 진짜 부품을 넣어 Run만 부른다.
/// 차례: 이 PC 사용자 세션의 뮤텍스를 잡는다 → 이미 돌고 있으면(못 잡으면) --link일 때만 브라우저로 /link를 열고 끝(AC-1411.1·AC-1411.3)
/// → 부품을 만들어 47200에서 듣기 시작 → --link면 이 PC 브라우저로 http://127.0.0.1:47200/link → 끝날 때까지 기다림 → 서버 → 뮤텍스 차례로 놓는다.
/// - 문이 쓰이고 있으면(E-RECEPTION-PORT-BUSY) 브라우저를 열지 않고 끝난다. 그 번호는 ReceptionServer.Start가 이미 기록에 쓴 것이라 다시 쓰지 않는다(AC-1411.5).
///   다른 문으로 바꾸지 않는다: 직원 휴대폰 홈 화면 주소가 47200에 묶여 있다.
/// - 그 밖에 켜지 못하면 그 오류 번호(모르면 E-RECEPTION-FAILED)만 기록한다. 예외 글은 남기지 않는다.
/// - 비트 DB·비트 프로그램 로그인은 여기서 보지 않는다. 서버는 요청이 올 때만 비트를 읽는다(AC-1411.2).
/// - 혼자 설치(spec reception-other-clinic design.md 6절, AC-5707.1): 인자가 정확히 --register 하나면 뮤텍스·서버 없이 등록 대리자만 부르고 끝난다.
///   저장했으면 ExitOk, 로그인 취소·[취소]·시간 지남이면 ExitCancelled, 던지면 ExitFailed(기록에는 그 오류 번호, 모르면 E-RECEPTION-FAILED). install-reception.ps1이 이 번호로 가른다.
/// Run은 던지지 않는다.
/// </summary>
public sealed class ReceptionStart
{
    /// <summary>이 PC 사용자 세션(Local\)마다 하나인 이름 붙은 뮤텍스(AC-1411.1).</summary>
    public const string MutexName = @"Local\Seoseungkwan.PrecheckReception";

    /// <summary>바탕 화면 "접수 현황 주소" 바로 가기의 인자(AC-1411.3). 정확히 이 하나일 때만 주소 화면을 연다.</summary>
    public const string LinkFlag = "--link";

    /// <summary>설치가 등록 없는 PC에서 부르는 인자(AC-5707.1). 정확히 이 하나일 때만 비트 로그인 → 이 병원 확인 창을 돈다.</summary>
    public const string RegisterFlag = "--register";

    /// <summary>바로 가기가 이 PC 브라우저로 여는 주소 보내기 화면(이 PC 자신만, AC-1411.3·AC-1406.8).</summary>
    public static readonly string LinkUrl = "http://127.0.0.1:" + ReceptionPorts.Http.ToString(CultureInfo.InvariantCulture) + "/link";

    public const int ExitOk = 0;

    public const int ExitFailed = 1;

    /// <summary>47200번 문을 다른 프로그램이 써서 켜지 못했다(AC-1411.5).</summary>
    public const int ExitPortBusy = 2;

    /// <summary>--register에서 비트 로그인 취소·확인 창 [취소]·시간 지남으로 저장하지 않았다(AC-5707.1).</summary>
    public const int ExitCancelled = 3;

    private readonly Func<IDisposable?> claimInstance;
    private readonly Func<IDisposable> startServer;
    private readonly Action<string> openBrowser;
    private readonly Action waitForExit;
    private readonly Action<string>? note;
    private readonly Func<bool>? register;

    /// <param name="claimInstance">이 사용자의 첫 실행이면 잡은 뮤텍스(끝날 때 Dispose로 놓는다), 이미 돌고 있으면 null.</param>
    /// <param name="startServer">부품을 만들고 47200에서 듣기 시작한 서버. 문이 쓰이고 있으면 HelperException(E-RECEPTION-PORT-BUSY).</param>
    /// <param name="openBrowser">이 PC 브라우저로 주소를 연다.</param>
    /// <param name="waitForExit">프로그램이 끝날 때까지 기다린다.</param>
    /// <param name="note">오류 번호 기록('E-…'만).</param>
    /// <param name="register">--register일 때 부르는 등록(저장했으면 true, 취소면 false). 없으면 --register은 ExitFailed.</param>
    public ReceptionStart(
        Func<IDisposable?> claimInstance,
        Func<IDisposable> startServer,
        Action<string> openBrowser,
        Action waitForExit,
        Action<string>? note = null,
        Func<bool>? register = null)
    {
        this.claimInstance = claimInstance ?? throw new ArgumentNullException(nameof(claimInstance));
        this.startServer = startServer ?? throw new ArgumentNullException(nameof(startServer));
        this.openBrowser = openBrowser ?? throw new ArgumentNullException(nameof(openBrowser));
        this.waitForExit = waitForExit ?? throw new ArgumentNullException(nameof(waitForExit));
        this.note = note;
        this.register = register;
    }

    /// <summary>인자가 정확히 --link 하나인가(대소문자·빈칸·둘째 인자는 아니다).</summary>
    public static bool WantsLink(string[]? args) =>
        args != null && args.Length == 1 && string.Equals(args[0], LinkFlag, StringComparison.Ordinal);

    /// <summary>인자가 정확히 --register 하나인가(대소문자·빈칸·둘째 인자는 아니다).</summary>
    public static bool WantsRegister(string[]? args) =>
        args != null && args.Length == 1 && string.Equals(args[0], RegisterFlag, StringComparison.Ordinal);

    /// <summary>켜는 차례를 끝까지 돈다. 끝 번호(ExitOk·ExitFailed·ExitPortBusy·ExitCancelled)를 돌려준다. 던지지 않는다.</summary>
    public int Run(string[]? args)
    {
        if (WantsRegister(args)) return Register();

        var link = WantsLink(args);

        IDisposable? instance;
        try
        {
            instance = claimInstance();
        }
        catch (Exception)
        {
            Note(ReceptionErrors.Failed);
            return ExitFailed;
        }

        if (instance == null)
        {
            // 이미 돌고 있다: 서버를 다시 켜지 않는다
            if (link) Open();
            return ExitOk;
        }

        try
        {
            return Serve(link);
        }
        finally
        {
            Release(instance);
        }
    }

    private int Serve(bool link)
    {
        IDisposable server;
        try
        {
            server = startServer() ?? throw new InvalidOperationException();
        }
        catch (HelperException e) when (e.Code == ReceptionErrors.PortBusy)
        {
            // 서버가 이미 기록했다. 다른 문으로 바꾸지 않고 끝난다
            return ExitPortBusy;
        }
        catch (HelperException e)
        {
            Note(e.Code);
            return ExitFailed;
        }
        catch (Exception)
        {
            Note(ReceptionErrors.Failed);
            return ExitFailed;
        }

        try
        {
            if (link) Open();
            waitForExit();
            return ExitOk;
        }
        catch (Exception)
        {
            Note(ReceptionErrors.Failed);
            return ExitFailed;
        }
        finally
        {
            Release(server);
        }
    }

    /// <summary>뮤텍스·서버 없이 등록만 한다(AC-5707.1). 예외 글은 남기지 않고 번호만 기록한다.</summary>
    private int Register()
    {
        if (register == null)
        {
            Note(ReceptionErrors.Failed);
            return ExitFailed;
        }
        try
        {
            return register() ? ExitOk : ExitCancelled;
        }
        catch (HelperException e)
        {
            Note(e.Code);
            return ExitFailed;
        }
        catch (Exception)
        {
            Note(ReceptionErrors.Failed);
            return ExitFailed;
        }
    }

    /// <summary>브라우저를 열지 못해도 서버는 그대로 둔다(기록에 번호만).</summary>
    private void Open()
    {
        try
        {
            openBrowser(LinkUrl);
        }
        catch (Exception)
        {
            Note(ReceptionErrors.Failed);
        }
    }

    private void Release(IDisposable part)
    {
        try
        {
            part.Dispose();
        }
        catch (Exception)
        {
            Note(ReceptionErrors.Failed);
        }
    }

    private void Note(string code)
    {
        try
        {
            note?.Invoke(code);
        }
        catch (Exception)
        {
            // 기록 실패로 켜는 차례를 멈추지 않는다
        }
    }
}
