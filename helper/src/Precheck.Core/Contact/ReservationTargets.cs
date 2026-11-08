using System;
using System.Collections.Generic;
using System.Globalization;
using Precheck.Core.Bit;
using Precheck.Core.Claim;
using Precheck.Core.Protocol;
using Precheck.Core.Registration;

namespace Precheck.Core.Contact;

/// <summary>
/// contact.targets {kind:'reservation', from, to}(spec patients-bit-lists AC-2801.1·2801.2·2801.4). 차례: 기간 검사(비트를 건드리지 않음)
/// → 등록 병원 확인(HospitalGate) → 예약 SQL 하나(ListSql.ReservationsSql) → JSON 하나. F/U와 달리 통계 화면·비트 로그인 창은 쓰지 않는다.
/// 나누기(chunk … end)는 다 만든 뒤 ContactCommands가 한다. 실패는 오류 번호 하나뿐이다.
/// 답 {v:1, kind, from, to, today, rows}, 줄 = [차트번호|null, 이름|null, 전화, 예약 시각 yyyyMMddHHmm, 상태, 예약 표시|null, 그날 옴 0|1, 그 뒤 처음 온 날 YYYYMMDD|null].
/// </summary>
public static class ReservationTargets
{
    public const string Kind = "reservation";

    /// <summary>한 번에 읽는 날 수 한도(시작·끝 포함). 웹은 오늘−30일 ~ 오늘+14일(45일)을 부른다.</summary>
    public const int MaxDays = 46;

    /// <summary>시작은 오늘−31일보다 앞일 수 없다.</summary>
    public const int BackDays = 31;

    /// <summary>끝은 오늘+14일보다 뒤일 수 없다.</summary>
    public const int AheadDays = 14;

    private const int Cells = 9;

    public static string Build(BitServices services, DateTime from, DateTime to)
    {
        if (services == null) throw new ArgumentNullException(nameof(services));
        from = from.Date;
        to = to.Date;
        var today = services.Today().Date;
        if (from > to || (to - from).Days + 1 > MaxDays || from < today.AddDays(-BackDays) || to > today.AddDays(AheadDays))
        {
            throw new ProtocolException(ErrorCodes.BadMessage);
        }

        IReadOnlyList<IReadOnlyList<object?>> rows;
        using (var hospital = HospitalGate.Open(services))
        {
            var args = new Dictionary<string, object?>(StringComparer.Ordinal)
            {
                ["@from"] = ClaimText.Stamp(from),
                ["@to"] = ClaimText.Stamp(to.AddDays(1)),
                ["@until"] = ClaimText.Stamp(today.AddDays(1)),
                ["@hospital"] = hospital.Registration.Scope,
            };
            rows = ListSql.Read(hospital.Db, ListSql.ReservationsSql, args, Cells);
        }

        return ListSql.Payload(Kind, from, to, today, writer =>
        {
            foreach (var row in rows)
            {
                // 예약 시각·그 뒤 처음 온 날이 이상한 줄 하나 때문에 명단 전체가 막히지 않게 그 줄만 건너뛴다(AC-2801.2)
                if (!IsCalendar(ClaimText.Cell(row, 4), "yyyyMMddHHmm")) continue;
                var cameAfter = ListSql.Optional(row, 8);
                if (cameAfter != null && !IsCalendar(cameAfter, "yyyyMMdd")) continue;
                writer.WriteStartArray();
                ListSql.Text(writer, ListSql.Optional(row, 0));   // 차트번호(없으면 null)
                ListSql.Text(writer, ListSql.Optional(row, 1));   // 이름 PbsPatNam
                ListSql.Text(writer, ListSql.Phone(row, 2, 3));   // 휴대전화 → 집 전화
                ListSql.Text(writer, ClaimText.Cell(row, 4));     // 예약 시각 OcmAcpDtm
                ListSql.Text(writer, ClaimText.Cell(row, 5));     // 상태 OcmComStt
                ListSql.Text(writer, ListSql.Optional(row, 6));   // 예약 표시 RsvSts
                writer.WriteNumberValue(ListSql.Flag(row, 7));    // 그날 옴
                ListSql.Text(writer, cameAfter);                  // 그 뒤 처음 온 날
                writer.WriteEndArray();
            }
        });
    }

    /// <summary>
    /// format 길이의 ASCII 숫자이고 달력에 있는 날(시 0~23·분 0~59)일 때만 참. 웹(reservations.ts의 compactToYmd·시각 검사)이 막는 값을 미리 거른다.
    /// </summary>
    private static bool IsCalendar(string text, string format)
    {
        if (text.Length != format.Length) return false;
        foreach (var ch in text)
        {
            if (ch < '0' || ch > '9') return false;
        }
        return DateTime.TryParseExact(text, format, CultureInfo.InvariantCulture, DateTimeStyles.None, out _);
    }
}
