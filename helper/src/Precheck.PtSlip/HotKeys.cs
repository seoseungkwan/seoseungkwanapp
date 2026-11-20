using System;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

namespace Precheck.PtSlip;

/// <summary>
/// 주사 차수 단축키 하나(AC-7503.2·AC-7504.1의 윈도우 쪽). RegisterHotKey/UnregisterHotKey를 감싸고, 눌리면 숨은 메시지 창이 받아
/// Pressed를 일으킨다(만든 스레드 = 창 스레드에서). 키는 F4·F8·F10·F11 하나(비트가 쓰는 F1·F2·F3·F5·F6·F7·F9·F12 안 됨).
/// 잡혀 있는 동안 그 키는 다른 프로그램에 가지 않으므로, 비트 접수 화면이 맨 앞일 때만 잡고 아니면 놓는다(Follow).
/// 꾹 누르고 있어도 한 번만(MOD_NOREPEAT). 만든 스레드에서만 부른다.
/// </summary>
public sealed class HotKeys : IDisposable
{
    private const int WmHotKey = 0x0312;
    private const uint ModNoRepeat = 0x4000;
    /// <summary>앱이 쓰는 단축키 번호 범위 0x0000~0xBFFF 안</summary>
    private const int FirstId = 0x7A00;

    /// <summary>고를 수 있는 키(설정 창 차례)</summary>
    public static readonly Keys[] Allowed = { Keys.F4, Keys.F8, Keys.F10, Keys.F11 };

    private static int nextId = FirstId;

    private readonly int id;
    private readonly Sink sink;
    private Keys key;
    private bool grabbed;
    private bool disposed;

    /// <param name="key">F4·F8·F10·F11 하나</param>
    public HotKeys(Keys key)
    {
        if (!IsAllowed(key)) throw new ArgumentOutOfRangeException(nameof(key));
        this.key = key;
        id = Interlocked.Increment(ref nextId);
        sink = new Sink(this);
    }

    /// <summary>단축키가 눌렸다(잡혀 있을 때만, 만든 스레드에서)</summary>
    public event EventHandler? Pressed;

    /// <summary>지금 키</summary>
    public Keys Key => key;

    /// <summary>지금 잡고 있나</summary>
    public bool IsGrabbed => grabbed;

    /// <summary>고를 수 있는 키인가(F4·F8·F10·F11)</summary>
    public static bool IsAllowed(Keys key) => Allowed.Contains(key);

    /// <summary>설정 글의 키 이름('F8' 등, 대소문자 무시) → 키. 고를 수 없는 키·모르는 이름이면 null</summary>
    public static Keys? KeyOf(string? name)
    {
        if (string.IsNullOrWhiteSpace(name)) return null;
        var trimmed = name!.Trim();
        foreach (var allowed in Allowed)
        {
            if (string.Equals(allowed.ToString(), trimmed, StringComparison.OrdinalIgnoreCase)) return allowed;
        }
        return null;
    }

    /// <summary>키를 잡는다. 이미 잡았으면 true. 다른 프로그램이 그 키를 잡고 있으면 false(다음에 다시 불러도 된다)</summary>
    public bool Grab()
    {
        if (disposed) throw new ObjectDisposedException(nameof(HotKeys));
        if (grabbed) return true;
        grabbed = RegisterHotKey(sink.Handle, id, ModNoRepeat, (uint)key);
        return grabbed;
    }

    /// <summary>키를 놓는다(그 키가 다시 다른 프로그램으로 간다). 안 잡았으면 아무것도 안 한다</summary>
    public void Release()
    {
        if (!grabbed) return;
        UnregisterHotKey(sink.Handle, id);
        grabbed = false;
    }

    /// <summary>
    /// 0.25초마다 부른다: 비트 접수 화면이 맨 앞이면 잡고(잡혔으면 true), 아니면 놓는다(false).
    /// </summary>
    public bool Follow(bool receptionFront)
    {
        if (receptionFront) return Grab();
        Release();
        return false;
    }

    /// <summary>키를 바꾼다(설정 저장 뒤). 잡고 있었으면 새 키로 다시 잡고 그 결과를, 아니었으면 true</summary>
    public bool ChangeKey(Keys newKey)
    {
        if (disposed) throw new ObjectDisposedException(nameof(HotKeys));
        if (!IsAllowed(newKey)) throw new ArgumentOutOfRangeException(nameof(newKey));
        if (newKey == key) return !grabbed || Grab();
        var was = grabbed;
        Release();
        key = newKey;
        return !was || Grab();
    }

    public void Dispose()
    {
        if (disposed) return;
        Release();
        disposed = true;
        sink.DestroyHandle();
    }

    private void OnHotKey()
    {
        if (grabbed) Pressed?.Invoke(this, EventArgs.Empty);
    }

    /// <summary>WM_HOTKEY만 받는 메시지 전용 창(HWND_MESSAGE: 보이지 않고 작업 표시줄·Alt+Tab에 안 나온다)</summary>
    private sealed class Sink : NativeWindow
    {
        private static readonly IntPtr MessageOnly = new IntPtr(-3);
        private readonly HotKeys owner;

        public Sink(HotKeys owner)
        {
            this.owner = owner;
            CreateHandle(new CreateParams { Parent = MessageOnly });
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == WmHotKey && m.WParam.ToInt64() == owner.id)
            {
                owner.OnHotKey();
                return;
            }
            base.WndProc(ref m);
        }
    }

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool RegisterHotKey(IntPtr hwnd, int id, uint modifiers, uint virtualKey);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UnregisterHotKey(IntPtr hwnd, int id);
}
