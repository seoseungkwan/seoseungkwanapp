using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Registration;
using Precheck.Core.Store;
using Precheck.Windows;
using Xunit;

namespace Precheck.Windows.Tests.Store;

/// <summary>REQ-015 작업 저장을 실제 DPAPI(CurrentUser + 고정 entropy)로 왕복한다. 윈도우에서만 돈다(Actions).</summary>
public class WorkStoreDpapiTests
{
    private const string Month = "2026-10";
    private const string MonthFile = "work-2026-10.dat";
    private const string Drafts = "{\"900001|2026-10-27\":{\"memo\":\"가상환자01 메모\\n둘째 줄\"}}";

    private static HospitalRegistration Synthetic() =>
        new HospitalRegistration("12345678", "SYNTHETIC", @"C:\DrBIT50", @".\SQLEXPRESS", "DRBIT", "0123456789abcdef0123456789abcdef");

    private static string TempFolder() => Path.Combine(Path.GetTempPath(), "precheck-store-" + Guid.NewGuid().ToString("N"));

    private static WorkStore Open(string folder, IProtector protector) =>
        new WorkStore(new StoreFolder(folder), protector, Synthetic(), () => new DateTime(2026, 10, 30));

    private static JsonElement El(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }

    [Fact(DisplayName = "AC-015.1 AC-015.6 실제 DPAPI로 저장하고 다시 읽으면 같은 내용이고, 파일에는 머리 PRECHECK-STORE-1만 보이고 평문이 없다")]
    public void RoundTrip()
    {
        var folder = TempFolder();
        try
        {
            var store = Open(folder, new DpapiProtector());
            store.SaveMonth(Month, El(Drafts), El("{\"v\":true}"), null);
            store.SaveMonth(Month, El(Drafts), null, null);

            Assert.True(File.Exists(Path.Combine(folder, MonthFile + ".bak")));
            foreach (var file in Directory.GetFiles(folder))
            {
                var raw = File.ReadAllBytes(file);
                Assert.Equal(Encoding.ASCII.GetBytes("PRECHECK-STORE-1\n"), raw.Take(17).ToArray());
                var text = Encoding.UTF8.GetString(raw);
                Assert.DoesNotContain("가상환자01", text);
                Assert.DoesNotContain("900001", text);
            }

            using var loaded = JsonDocument.Parse(store.Load(new[] { Month }, false, false));
            var month = loaded.RootElement.GetProperty("months").GetProperty(Month);
            Assert.Equal(El(Drafts).GetRawText(), month.GetProperty("drafts").GetRawText());
            Assert.Equal("{\"v\":true}", month.GetProperty("done").GetRawText());
        }
        finally
        {
            if (Directory.Exists(folder)) Directory.Delete(folder, true);
        }
    }

    [Fact(DisplayName = "AC-015.3 다른 entropy로는 풀지 못해 E-STORE-BROKEN이고, 파일은 지우지 않고 이름만 바꿔 둔다")]
    public void OtherEntropyCannotRead()
    {
        var folder = TempFolder();
        try
        {
            Open(folder, new DpapiProtector()).SaveMonth(Month, El(Drafts), null, null);
            var raw = File.ReadAllBytes(Path.Combine(folder, MonthFile));

            var other = Open(folder, new DpapiProtector(Encoding.UTF8.GetBytes("other")));
            var broken = Assert.Throws<BitException>(() => other.Load(new[] { Month }, false, false));

            Assert.Equal(BitErrors.StoreBroken, broken.Code);
            var kept = Assert.Single(Directory.GetFiles(folder));
            Assert.StartsWith(MonthFile + ".broken-", Path.GetFileName(kept), StringComparison.Ordinal);
            Assert.Equal(raw, File.ReadAllBytes(kept));
        }
        finally
        {
            if (Directory.Exists(folder)) Directory.Delete(folder, true);
        }
    }
}
