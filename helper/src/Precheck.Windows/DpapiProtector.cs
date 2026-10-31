using System;
using System.Security.Cryptography;
using System.Text;
using Precheck.Core.Store;

namespace Precheck.Windows;

/// <summary>
/// 이 PC·이 윈도우 사용자만 풀 수 있는 암호화(DPAPI CurrentUser + 고정 entropy, design.md 9-3).
/// registration.dat·작업 저장 파일이 같이 쓴다. 풀 수 없으면 CryptographicException.
/// </summary>
public sealed class DpapiProtector : IProtector
{
    /// <summary>도우미 저장 파일의 고정 entropy(비밀이 아니다: 다른 프로그램의 DPAPI 값과 섞이지 않게 하는 구분자).</summary>
    public static readonly byte[] StoreEntropy = Encoding.UTF8.GetBytes("Seoseungkwan PrecheckHelper store v1");

    private readonly byte[] entropy;

    public DpapiProtector() : this(StoreEntropy) { }

    public DpapiProtector(byte[] entropy)
    {
        if (entropy == null || entropy.Length == 0) throw new ArgumentException("entropy가 비었다", nameof(entropy));
        this.entropy = (byte[])entropy.Clone();
    }

    public byte[] Protect(byte[] plain) => ProtectedData.Protect(plain, entropy, DataProtectionScope.CurrentUser);

    public byte[] Unprotect(byte[] cipher) => ProtectedData.Unprotect(cipher, entropy, DataProtectionScope.CurrentUser);
}
