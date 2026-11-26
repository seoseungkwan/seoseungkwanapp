using System;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Sheet;

namespace Precheck.Windows;

/// <summary>
/// 윈도 클립보드(sheet.code, spec google-link TASK-10): STA 스레드에서 Clipboard.SetText. 다른 프로그램이 잡고 있으면 조금씩 기다려 몇 번 더 해 본다.
/// 끝내 넣지 못하면 E-STORE-FAILED. 넣은 글(비밀 글자가 든 구글 코드)은 어디에도 적지 않는다.
/// </summary>
public sealed class SheetClipboard : IClipboard
{
    private const int Tries = 10;
    private const int WaitMs = 100;

    public void SetText(string text)
    {
        if (text == null) throw new ArgumentNullException(nameof(text));
        var done = Sta.Run(() =>
        {
            for (var i = 0; i < Tries; i++)
            {
                try
                {
                    Clipboard.SetText(text, TextDataFormat.UnicodeText);
                    return true;
                }
                catch (ExternalException)
                {
                    Thread.Sleep(WaitMs);
                }
            }
            return false;
        });
        if (!done) throw new HelperException(BitErrors.StoreFailed);
    }
}
