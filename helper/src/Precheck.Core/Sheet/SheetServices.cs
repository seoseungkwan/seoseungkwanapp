using System;
using System.Security.Cryptography;
using Precheck.Core.Bit;

namespace Precheck.Core.Sheet;

/// <summary>
/// 수납 명령(SheetCommands)이 쓰는 부품 한 벌(spec google-link TASK-10). 윈도 부품(진짜 HTTP·확인 창·클립보드·DPAPI)은 Precheck.Helper가 넣고,
/// 시험은 가짜를 넣는다. 만들기만 하고 비트·구글을 건드리지 않는다.
/// </summary>
public sealed class SheetServices
{
    /// <param name="bit">비트 부품(등록 확인 관문·오늘 날짜).</param>
    /// <param name="store">이 PC sheet.dat.</param>
    /// <param name="transport">구글 HTTP 만들기. 받는 함수는 '남은 시간'(HTTP 한 번의 시간 한도를 이것으로 줄인다).</param>
    /// <param name="confirm">주소·메일 바꾸기 확인 창.</param>
    /// <param name="clipboard">윈도 클립보드.</param>
    /// <param name="importBitSheet">비트시트 설정 가져오기(파일이 없으면 null).</param>
    /// <param name="hasBitSheet">비트시트 설정 파일이 있나.</param>
    /// <param name="clock">지난 시간(시간 한도용, 진짜는 Stopwatch).</param>
    /// <param name="code">실린 Code.gs 글(기본 SheetCode.Load).</param>
    /// <param name="secret">새 비밀 글자(기본 SheetCode.NewSecret).</param>
    /// <param name="nonce">hello nonce(기본 NewNonce).</param>
    public SheetServices(
        BitServices bit,
        SheetStore store,
        Func<Func<TimeSpan>, ISheetTransport> transport,
        ISheetConfirm confirm,
        IClipboard clipboard,
        Func<BitSheetImported?> importBitSheet,
        Func<bool> hasBitSheet,
        Func<TimeSpan> clock,
        Func<string?>? code = null,
        Func<string>? secret = null,
        Func<string>? nonce = null)
    {
        Bit = bit ?? throw new ArgumentNullException(nameof(bit));
        Store = store ?? throw new ArgumentNullException(nameof(store));
        Transport = transport ?? throw new ArgumentNullException(nameof(transport));
        Confirm = confirm ?? throw new ArgumentNullException(nameof(confirm));
        Clipboard = clipboard ?? throw new ArgumentNullException(nameof(clipboard));
        ImportBitSheet = importBitSheet ?? throw new ArgumentNullException(nameof(importBitSheet));
        HasBitSheet = hasBitSheet ?? throw new ArgumentNullException(nameof(hasBitSheet));
        Clock = clock ?? throw new ArgumentNullException(nameof(clock));
        Code = code ?? SheetCode.Load;
        Secret = secret ?? SheetCode.NewSecret;
        Nonce = nonce ?? NewNonce;
    }

    public BitServices Bit { get; }

    public SheetStore Store { get; }

    public Func<Func<TimeSpan>, ISheetTransport> Transport { get; }

    public ISheetConfirm Confirm { get; }

    public IClipboard Clipboard { get; }

    public Func<BitSheetImported?> ImportBitSheet { get; }

    public Func<bool> HasBitSheet { get; }

    public Func<TimeSpan> Clock { get; }

    public Func<string?> Code { get; }

    public Func<string> Secret { get; }

    public Func<string> Nonce { get; }

    /// <summary>hello nonce: 무작위 24바이트 → base64url 32자.</summary>
    public static string NewNonce()
    {
        var bytes = new byte[24];
        using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(bytes);
        return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }
}
