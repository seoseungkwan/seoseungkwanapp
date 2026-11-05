using System;
using System.Collections.Generic;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Claim;
using Precheck.Core.Protocol;
using Precheck.Core.Registration;

namespace Precheck.Core.Contact;

/// <summary>
/// contact.targets 한 조각(AC-605.1~605.3). 차례는 claim.month(ClaimMonthPayload.Build)와 같다: 기간 검사(비트를 건드리지 않음)
/// → 등록 병원 확인(HospitalGate) → 기간 기관기호 → 통계 메뉴·비트 로그인·사용자 범위·통계 권한(83·47) → 83 표 → 47 표 → JSON 하나.
/// 나누기(Chunker)는 다 만든 뒤에 한다: 도중에 실패하면 BitException·ProtocolException 번호 하나로 끝나 Dispatcher가 error만 보낸다
/// (반쪽 자료 없음). 예외 글은 오류 번호뿐이다(AC-605.4).
/// 답 모양(design.md '도우미 contact.targets 답 모양'): {v: 1, kind, from, to, chart, rx}, 표마다 첫 줄 = 칸 이름인 글자 2차 배열.
/// </summary>
public static class ContactTargets
{
    public const int Version = 1;

    /// <summary>한 조각의 날 수 한도(시작·끝 포함). 명령 표는 1,100일까지 받지만 웹은 31일 조각으로 나눠 부른다.</summary>
    public const int MaxPieceDays = 31;

    /// <summary>한 표의 자료 줄 한도(원본 TreatmentUsage.MaximumRows). 넘으면 자르지 않고 E-BIT-READ-FAILED.</summary>
    public const int MaxRows = 300_000;

    private static readonly string[] Screens = { StatsScreens.Symptoms, StatsScreens.Prescriptions };

    public static string Build(BitServices services, StatsLogin login, string kind, DateTime from, DateTime to)
    {
        if (services == null) throw new ArgumentNullException(nameof(services));
        if (login == null) throw new ArgumentNullException(nameof(login));
        from = from.Date;
        to = to.Date;
        _ = ContactColumns.RxNames(kind);   // 모르는 kind면 E-HELPER-BAD-MESSAGE(명령 표가 막지만 한 번 더)
        // 31일 이하·from ≤ to·오늘 이하만(AC-605.2). 명령 표 1,100일 안이어도 막는다
        if (from > to || (to - from).Days + 1 > MaxPieceDays || to > services.Today().Date) throw new ProtocolException(ErrorCodes.BadMessage);

        using var hospital = HospitalGate.Open(services);
        var registration = hospital.Registration;
        var db = hospital.Db;
        var install = db.Target.InstallPath;
        HospitalCheck.VerifyPeriod(db, registration, from, to);

        var screens = services.Screens ?? throw new BitException(BitErrors.ExportFailed);
        var menu = StatsMenu.Parse(screens.ReadMenu(install));
        var user = login.Ensure(services.Login, install);
        try
        {
            StatsAccess.Check(db, user, registration.Scope, menu, Screens);
        }
        catch (BitException)
        {
            login.Forget();
            throw;
        }

        var chart = ContactColumns.Chart(screens.Read(install, user, StatsScreens.Of(StatsScreens.Symptoms), from, to, StatsScreens.ReadTimeout));
        var rx = ContactColumns.Rx(kind, screens.Read(install, user, StatsScreens.Of(StatsScreens.Prescriptions), from, to, StatsScreens.ReadTimeout));

        return ClaimMonthPayload.Write(writer =>
        {
            writer.WriteNumber("v", Version);
            writer.WriteString("kind", kind);
            writer.WriteString("from", ClaimText.Iso(from));
            writer.WriteString("to", ClaimText.Iso(to));
            Table(writer, "chart", chart);
            Table(writer, "rx", rx);
        });
    }

    private static void Table(Utf8JsonWriter writer, string name, IEnumerable<string[]> table)
    {
        writer.WriteStartArray(name);
        foreach (var row in table)
        {
            writer.WriteStartArray();
            foreach (var cell in row) writer.WriteStringValue(ClaimText.Safe(cell));
            writer.WriteEndArray();
        }
        writer.WriteEndArray();
    }
}
