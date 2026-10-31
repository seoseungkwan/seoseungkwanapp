namespace Precheck.Core.Store;

/// <summary>
/// 이 PC에 두는 파일(registration.dat·work-YYYY-MM.dat 등)의 암호화. 윈도우에서는 DPAPI CurrentUser + 고정 entropy
/// (Precheck.Windows.DpapiProtector, design.md 9-3). 풀 수 없으면 System.Security.Cryptography.CryptographicException을 던진다.
/// </summary>
public interface IProtector
{
    byte[] Protect(byte[] plain);

    byte[] Unprotect(byte[] cipher);
}
