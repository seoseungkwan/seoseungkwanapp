using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Precheck.Core.Registration;
using Precheck.Windows;
using Xunit;

namespace Precheck.Windows.Tests.Connect;

/// <summary>AC-005.5 registration.dat는 DPAPI(CurrentUser + 고정 entropy)로 암호화한다. 윈도우에서만 돈다.</summary>
public class DpapiProtectorTests
{
    private static HospitalRegistration Synthetic() =>
        new HospitalRegistration("SYNTHETIC", "12345678", "SYNTHETIC", @"C:\DrBIT50", @".\SQLEXPRESS", "DRBIT", "0123456789abcdef0123456789abcdef");

    [Fact(DisplayName = "AC-005.5 DPAPI 왕복: 같은 entropy로만 풀리고, 다른 entropy·깨진 글자는 CryptographicException")]
    public void RoundTrip()
    {
        var plain = Encoding.UTF8.GetBytes("가상의원 SYNTHETIC 12345678");
        var protector = new DpapiProtector();
        var cipher = protector.Protect(plain);

        Assert.False(cipher.SequenceEqual(plain));
        Assert.Equal(plain, protector.Unprotect(cipher));
        Assert.Throws<CryptographicException>(() => new DpapiProtector(Encoding.UTF8.GetBytes("other")).Unprotect(cipher));

        var broken = (byte[])cipher.Clone();
        broken[broken.Length / 2] ^= 0xFF;
        Assert.Throws<CryptographicException>(() => protector.Unprotect(broken));
    }

    [Fact(DisplayName = "AC-005.5 등록 파일을 DPAPI로 저장하고 다시 읽는다(머리 PRECHECK-STORE-1, 평문 없음)")]
    public void RegistrationStoreWithDpapi()
    {
        var folder = Path.Combine(Path.GetTempPath(), "precheck-dpapi-" + Guid.NewGuid().ToString("N"));
        try
        {
            var store = new RegistrationStore(folder, new DpapiProtector());
            store.Save(Synthetic());

            var raw = File.ReadAllBytes(Path.Combine(folder, "registration.dat"));
            Assert.Equal(Encoding.ASCII.GetBytes("PRECHECK-STORE-1\n"), raw.Take(17).ToArray());
            Assert.DoesNotContain("12345678", Encoding.UTF8.GetString(raw));

            var read = store.Load();
            Assert.NotNull(read);
            Assert.Equal("12345678", read!.InstitutionCode);

            // 다른 entropy(다른 프로그램)로는 풀리지 않아 등록 없음
            Assert.Null(new RegistrationStore(folder, new DpapiProtector(Encoding.UTF8.GetBytes("other"))).Load());
        }
        finally
        {
            if (Directory.Exists(folder)) Directory.Delete(folder, true);
        }
    }
}
