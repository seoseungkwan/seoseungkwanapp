using System;
using System.IO;
using System.Reflection;
using Erp.Core;
using Precheck.Core.Bit;
using Precheck.Windows;

namespace Erp.Helper;

/// <summary>
/// 비트 DLL 미리 불러오기(spec erp-bit-anywhere REQ-3805, AC-3805.1). 비트를 받은 zip을 풀어 깐 병원은 비트 파일에 윈도우 '인터넷에서 받은 파일'
/// 표시가 남아 있을 수 있고, .NET Framework는 그런 DLL의 LoadFrom을 거절한다(0x80131515). 그래서 고른 로컬 설치 폴더의 ERP DLL 둘
/// (ErpInstallRules.RequiredFiles)만 UnsafeLoadFrom으로 먼저 불러 둔다. 뒤의 기존 VendorRuntime.Load·VendorLogin(LoadFrom)은 그것을 그대로 받고,
/// 같은 폴더 의존 DLL은 불러온 DLL 자리에서 찾는다(2026-11-23 시험). 실행 설정의 프로세스 전체 스위치(원격 위치 불러오기 허용)는 쓰지 않는다:
/// 다른 길(네트워크 위치 등)의 LoadFrom 거절은 .NET 기본 그대로다. 비트 폴더 파일은 고치지 않는다(표시를 지우지 않는다).
/// </summary>
public static class ErpVendorPreload
{
    /// <summary>installRoot는 ErpInstallRules.Choose가 고른 로컬 설치 폴더다. 못 불러오면 E-BIT-DB-FAILED(예외 글은 버린다).</summary>
    public static void Load(string installRoot)
    {
        if (installRoot == null) throw new ArgumentNullException(nameof(installRoot));
        try
        {
            VendorRuntime.Prepare(installRoot);
            foreach (var file in ErpInstallRules.RequiredFiles)
            {
                Assembly.UnsafeLoadFrom(Path.Combine(installRoot, file));
            }
        }
        catch (Exception e) when (!(e is BitException))
        {
            // 비트 DLL 안의 예외 글은 버린다(접속 정보가 섞일 수 있다)
            throw new BitException(BitErrors.DbFailed);
        }
    }
}
