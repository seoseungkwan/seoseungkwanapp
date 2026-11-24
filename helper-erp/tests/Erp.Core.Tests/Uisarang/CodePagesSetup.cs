using System;
using System.Collections.Generic;
using System.IO;
#if NET
using System.Runtime.CompilerServices;
using System.Text;
#endif
using Erp.Core.Uisarang;

namespace Erp.Core.Tests.Uisarang;

/// <summary>
/// 의사랑 시험 시작 준비(spec erp-uisarang TASK-1, ADR-050·design.md 5-6).
/// net10.0 시험은 시험 어셈블리를 처음 쓸 때 코드 페이지 제공자를 한 번 등록한다(ExcelDataReader가 .xls 안 코드 페이지를 쓰려면 필요).
/// 도우미(.NET Framework 4.8)와 net48 시험은 코드 페이지가 기본으로 있어 등록하지 않는다 — Erp.Core 코드는 등록하지 않는다.
/// </summary>
internal static class CodePagesSetup
{
#if NET
#pragma warning disable CA2255 // 시험 어셈블리 시작에서 한 번만 — 도우미 코드가 아니다
    [ModuleInitializer]
#pragma warning restore CA2255
    internal static void Register() => Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
#endif
}

/// <summary>
/// 가짜 의사랑 엑셀(fixtures/fake-uisarang/*.xls, design.md 12-1). Erp.Core.Tests.csproj가 시험 출력 uisarang/ 아래로 복사한다.
/// 실제 의원 파일·숫자는 없다. 환자별 엑셀의 글자 칸은 design.md 12-2 표시 글자뿐이다. TASK-3·7·8·9·13 시험도 이것으로 읽는다.
/// </summary>
internal static class FakeUisFiles
{
    public const string Folder = "uisarang";

    /// <summary>가짜 엑셀의 마감 일자(시안 예시 2026-11-23).</summary>
    public static readonly DateTime Day = new DateTime(2026, 11, 23);

    /// <summary>fixtures/make-fake-uisarang.ts가 만드는 파일(design.md 12-1 차례).</summary>
    public static readonly IReadOnlyList<string> Names = new[]
    {
        "income.xls", "income-no-sum.xls", "income-outpatient.xls", "income-other-date.xls",
        "rx.xls", "rx-3months.xls", "visits.xls", "visit-patients.xls", "visit-patients-no-date.xls",
        "rsv.xls", "rsv-patients.xls", "rsv-patients-other-day.xls", "other-report.xls",
        "broken.xls", "real-xlsx.xls", "html.xls",
    };

    public static string PathOf(string name) => Path.Combine(AppContext.BaseDirectory, Folder, name);

    public static byte[] Bytes(string name)
    {
        var path = PathOf(name);
        if (!File.Exists(path)) throw new FileNotFoundException("가짜 의사랑 엑셀이 시험 출력에 없다(npm run fixtures:uis, csproj None 복사 줄 확인)", name);
        return File.ReadAllBytes(path);
    }

    public static IReadOnlyList<IReadOnlyList<XlsCell>> Rows(string name) => XlsRows.Read(Bytes(name));
}
