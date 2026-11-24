using System;

namespace Erp.Core.Uisarang;

/// <summary>
/// 의사랑 처리기(UisCommands)가 쓰는 것(spec erp-uisarang design.md 4-1·4-3). 도우미 입구(Erp.Helper UisHelperServices, TASK-15)가 만든다:
/// - Folder: 부를 때 엑셀 폴더를 연다(실제 = UisDiskFolder — 없으면 만들고 연결 폴더면 E-UIS-FOLDER). 날짜·인자 검사를 지난 뒤에만 부른다
/// - FolderKind: 답 uis.folder(바탕화면 · 사용자 폴더)
/// - Cache: 모아 둔 값(data\uis-cache.bin, 도우미는 DPAPI 보호)
/// - Today: 도우미 PC 오늘(날짜만 본다)
/// - Log: 진단 기록(명령 이름, 오류 번호) — 모아 둔 값을 못 썼을 때 번호 하나만 남긴다(design.md 3-5·4-5). 도우미는 ErpLog.Write
/// 비트·등록 확인·네트워크에 닿는 것은 없다(AC-4210.2·AC-4210.5).
/// </summary>
public sealed class UisServices
{
    public UisServices(Func<IUisFolder> folder, UisFolderKind folderKind, UisCache cache, Func<DateTime> today, Action<string?, string?>? log = null)
    {
        Folder = folder ?? throw new ArgumentNullException(nameof(folder));
        FolderKind = folderKind;
        Cache = cache ?? throw new ArgumentNullException(nameof(cache));
        Today = today ?? throw new ArgumentNullException(nameof(today));
        Log = log;
    }

    public Func<IUisFolder> Folder { get; }

    public UisFolderKind FolderKind { get; }

    public UisCache Cache { get; }

    public Func<DateTime> Today { get; }

    public Action<string?, string?>? Log { get; }
}
