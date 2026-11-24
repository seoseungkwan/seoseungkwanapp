using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Erp.Core.Uisarang;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Windows;

namespace Erp.Helper;

/// <summary>
/// 의사랑 PC 부품(spec erp-uisarang design.md 4-3, AC-4201.2). 비트·비트 로그인 창·PC 확인 창·네트워크에 닿지 않는다.
/// - Create: 크롬이 켤 때(자료원 파일이 의사랑일 때만) 의사랑 처리기 부품. 엑셀 폴더 자리는 그때 다시 고른다(등록 뒤 OneDrive가 켜졌으면
///   사용자 폴더로 옮겨 감 — 안전 쪽). 폴더는 처리기가 날짜·묶음 검사를 지난 뒤 부를 때 연다(없으면 만들고 연결 폴더면 E-UIS-FOLDER)
/// - Register: 등록 모드에서 비트를 못 찾았을 때(E-BIT-NOT-FOUND)만 부른다. 의사랑이 없으면 null(지금처럼 E-BIT-NOT-FOUND로 끝난다)
/// - ForgetUisarang: 비트 등록을 저장한 뒤 자료원 파일을 지운다(남으면 다음에 도우미가 의사랑으로 켜진다)
/// 자료원 파일을 쓰거나 지우지 못하면(IOException·UnauthorizedAccessException) E-STORE-FAILED, 폴더를 못 만들면 E-UIS-FOLDER(둘 다 단계 UIS).
/// 오류에는 번호만 싣는다(폴더 경로에 사용자 이름이 든다).
/// </summary>
internal static class UisHelperServices
{
    /// <summary>바탕화면이 이 클라우드 폴더(환경 값) 안이면 엑셀 폴더를 사용자 폴더에 둔다(AC-4202.1).</summary>
    private static readonly string[] CloudRoots = { "OneDrive", "OneDriveCommercial", "OneDriveConsumer" };

    public static UisServices Create(Action<string?, string?> log)
    {
        var place = Place();
        var cache = new UisCache(ErpServices.DataDirectory(), new DpapiProtector(), () => DateTime.Now);
        return new UisServices(() => OpenFolder(place.Path), place.Kind, cache, () => DateTime.Today, log);
    }

    /// <summary>의사랑 PC로 등록한다: 엑셀 폴더를 만들고 자료원 파일을 쓴다.</summary>
    /// <returns>엑셀 폴더 종류. 이 PC에 의사랑이 없으면 null.</returns>
    public static UisFolderKind? Register()
    {
        if (UisRules.FindUisarang(FixedDriveRoots(), File.Exists) == null) return null;
        ErpStage.Set(ErpStage.Uis);
        var place = Place();
        OpenFolder(place.Path);
        ChangeSourceFile(() => UisSource.WriteUisarang(ErpServices.DataDirectory(), place.Kind));
        return place.Kind;
    }

    /// <summary>비트 등록 저장 뒤: 자료원 파일이 있으면 지운다.</summary>
    public static void ForgetUisarang()
    {
        ErpStage.Set(ErpStage.Uis);
        ChangeSourceFile(() => UisSource.Delete(ErpServices.DataDirectory()));
    }

    /// <summary>엑셀 폴더(없으면 만든다). 자리를 정하지 못했거나(바탕화면·사용자 폴더 값 없음) 못 만들면 E-UIS-FOLDER.</summary>
    private static IUisFolder OpenFolder(string? path)
    {
        if (path == null) throw new HelperException(UisDiskFolder.FolderFailed);
        return new UisDiskFolder(path);
    }

    /// <summary>자료원 파일 쓰기·지우기. 파일 오류는 등록 실패 번호 E-STORE-FAILED로 바꾼다(예외로 끝나지 않게).</summary>
    private static void ChangeSourceFile(Action change)
    {
        try
        {
            change();
        }
        catch (IOException)
        {
            throw new HelperException(BitErrors.StoreFailed);
        }
        catch (UnauthorizedAccessException)
        {
            throw new HelperException(BitErrors.StoreFailed);
        }
    }

    /// <summary>엑셀 폴더 종류와 경로(바탕화면 또는 %USERPROFILE% 아래 ERP마감). 그 자리 값이 비었으면 경로는 null.</summary>
    private static UisPlace Place()
    {
        var desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        var profile = Environment.GetEnvironmentVariable("USERPROFILE") ?? "";
        if (string.IsNullOrWhiteSpace(profile)) profile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        var kind = UisRules.ChooseFolder(desktop, profile, CloudRoots.Select(Environment.GetEnvironmentVariable));
        var root = kind == UisFolderKind.Desktop ? desktop : profile;
        return new UisPlace(kind, string.IsNullOrWhiteSpace(root) ? null : Path.Combine(root, UisRules.FolderName));
    }

    /// <summary>로컬 고정 드라이브 뿌리만(네트워크·이동식·CD 드라이브는 보지 않는다, AC-4201.1). 못 읽는 드라이브는 건너뛴다.</summary>
    private static IEnumerable<string> FixedDriveRoots()
    {
        var roots = new List<string>();
        DriveInfo[] drives;
        try
        {
            drives = DriveInfo.GetDrives();
        }
        catch (Exception e) when (e is IOException || e is UnauthorizedAccessException)
        {
            return roots;
        }
        foreach (var drive in drives)
        {
            try
            {
                if (drive.DriveType == DriveType.Fixed) roots.Add(drive.RootDirectory.FullName);
            }
            catch (Exception e) when (e is IOException || e is UnauthorizedAccessException)
            {
                // 그 드라이브만 건너뛴다
            }
        }
        return roots;
    }

    private sealed class UisPlace
    {
        public UisPlace(UisFolderKind kind, string? path)
        {
            Kind = kind;
            Path = path;
        }

        public UisFolderKind Kind { get; }

        public string? Path { get; }
    }
}
