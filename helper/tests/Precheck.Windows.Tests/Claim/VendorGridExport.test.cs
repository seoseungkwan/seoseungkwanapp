using System;
using System.IO;
using System.Threading;
using Precheck.Core.Bit;
using Precheck.Windows;
using Xunit;

namespace Precheck.Windows.Tests.Claim;

/// <summary>
/// 비트 통계 화면 읽기(VendorGridExport, 원본 NativeReportAdapter)의 윈도우 부분. Actions 윈도우에서만 돈다.
/// 실제 비트 통계 화면 DLL(BITSSElectricData·BITSDepOdrPatList)로 표를 읽는 것은 의원 PC 시험으로 남긴다.
/// </summary>
public class VendorGridExportTests : IDisposable
{
    private readonly string root = Path.Combine(Path.GetTempPath(), "precheck-grid-" + Guid.NewGuid().ToString("N"));

    public VendorGridExportTests()
    {
        Directory.CreateDirectory(root);
    }

    public void Dispose()
    {
        if (Directory.Exists(root)) Directory.Delete(root, true);
    }

    private static readonly VendorUser User = new VendorUser("SYNUSER", "20261030");

    [Fact(DisplayName = "AC-008.3 통계 메뉴 파일(ini\\BITSTATISTICS.Xml)은 바이트 그대로 읽고, 없으면 E-BIT-EXPORT-FAILED")]
    public void ReadsMenuFile()
    {
        var export = new VendorGridExport();
        Assert.Equal("E-BIT-EXPORT-FAILED", Assert.Throws<BitException>(() => export.ReadMenu(root)).Code);

        Directory.CreateDirectory(Path.Combine(root, "ini"));
        var bytes = new byte[] { 0x3C, 0x72, 0x6F, 0x6F, 0x74, 0x2F, 0x3E };
        File.WriteAllBytes(Path.Combine(root, "ini", "BITSTATISTICS.Xml"), bytes);
        Assert.Equal(bytes, export.ReadMenu(root));
    }

    [Theory(DisplayName = "AC-008.3 설치 폴더 EXE에 통계 화면 DLL이 없으면 불러오기 전에 E-BIT-EXPORT-FAILED(원본 '필요한 DrBIT 통계 모듈 파일이 없습니다')")]
    [InlineData("83")]
    [InlineData("83D")]
    [InlineData("47")]
    public void MissingScreenDll(string key)
    {
        var export = new VendorGridExport();
        var error = Assert.Throws<BitException>(() => export.Read(root, User, StatsScreens.Of(key), new DateTime(2026, 10, 1), new DateTime(2026, 10, 31), StatsScreens.ReadTimeout));
        Assert.Equal("E-BIT-EXPORT-FAILED", error.Code);
    }

    [Fact(DisplayName = "AC-008.4 표 읽기가 시간 제한을 넘으면 기다리지 않고 E-BIT-READ-FAILED, 화면 안 예외는 E-BIT-EXPORT-FAILED(글은 버림), 오류 번호는 그대로")]
    public void TimedStaRun()
    {
        Assert.Equal(ApartmentState.STA, VendorGridExport.RunOnSta(() => Thread.CurrentThread.GetApartmentState(), TimeSpan.FromSeconds(10)));
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => VendorGridExport.RunOnSta(() => { Thread.Sleep(5000); return 1; }, TimeSpan.FromMilliseconds(200))).Code);
        Assert.Equal("E-BIT-EXPORT-FAILED", Assert.Throws<BitException>(() => VendorGridExport.RunOnSta<int>(() => throw new InvalidOperationException("가상환자01"), TimeSpan.FromSeconds(10))).Code);
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => VendorGridExport.RunOnSta<int>(() => throw new BitException("E-BIT-READ-FAILED"), TimeSpan.FromSeconds(10))).Code);
    }
}
