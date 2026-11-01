using System;
using System.Collections.Generic;
using System.Globalization;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Registration;

namespace Precheck.Core.Claim;

/// <summary>비트 청구메모 줄 하나(원본 ClaimMemoRow {v, p, d, m}).</summary>
public sealed class MemoRow
{
    public MemoRow(string visit, string patient, string day, string memo)
    {
        Visit = visit;
        Patient = patient;
        Day = day;
        Memo = memo;
    }

    /// <summary>v: 내원번호.</summary>
    public string Visit { get; }

    /// <summary>p: 차트번호.</summary>
    public string Patient { get; }

    /// <summary>d: 접수일 YYYY-MM-DD.</summary>
    public string Day { get; }

    /// <summary>m: 비트 청구메모. CRLF→LF 말고 글자 그대로(비교가 MemoCompare와 같아지게), 4,000자까지.</summary>
    public string Memo { get; }
}

/// <summary>기간의 비트 청구메모(원본 ClaimMemoResult의 rows와 센 수).</summary>
public sealed class MemoRows
{
    public List<MemoRow> Rows { get; } = new List<MemoRow>();

    /// <summary>내원번호·차트번호·날짜 모양이 틀려 뺀 줄 수.</summary>
    public long InvalidRows { get; internal set; }

    /// <summary>줄 300,000이나 메모 4,000자를 넘어 잘렸다. 웹은 이 기간을 E-CLAIM-PARTIAL로 멈춘다(AC-016.1).</summary>
    public bool Truncated { get; internal set; }
}

/// <summary>
/// claim.memos(AC-016.1): 등록 병원 확인 → 기간 기관기호 → Sql.MemoRowsSql(원본 ClaimMemoHistory.RowsSql) 하나. 이름·연락처·금액은 읽지 않는다.
/// 원본과 다른 점 둘: 명세대로 줄 한도를 넘으면 오류 대신 truncated로 알리고, 비교(AC-016.2)가 글자 그대로이도록
/// 원본 Clean(앞뒤 공백·제어 문자 지움)을 메모 글자에 쓰지 않는다. Clean은 메모가 비었는지 볼 때만 쓴다.
/// </summary>
public static class MemoRowsRead
{
    public const int Version = 1;

    /// <summary>시작·끝 날을 함께 센 기간 한도(명령 표 maxDays와 같다).</summary>
    public const int MaximumDays = 400;

    public const int MaximumRows = 300_000;
    public const int MaximumMemo = 4_000;

    /// <summary>모두 읽은 뒤에 JSON 하나를 만든다. 조각 나누기는 그다음이라 실패하면 BitException 하나로 끝난다(반쪽 자료 없음).</summary>
    public static string Build(BitServices services, DateTime from, DateTime to)
    {
        if (services == null) throw new ArgumentNullException(nameof(services));
        from = from.Date;
        to = to.Date;
        if (from > to || (to - from).Days + 1 > MaximumDays) throw new ProtocolException(ErrorCodes.BadMessage);

        using var hospital = HospitalGate.Open(services);
        HospitalCheck.VerifyPeriod(hospital.Db, hospital.Registration, from, to);
        var memos = Read(hospital.Db, hospital.Registration.Scope, from, to);

        return ClaimMonthPayload.Write(writer =>
        {
            writer.WriteNumber("version", Version);
            ClaimMonthPayload.Range(writer, "period", from, to);
            writer.WriteBoolean("truncated", memos.Truncated);
            writer.WriteNumber("invalidRows", memos.InvalidRows);
            writer.WriteStartArray("rows");
            foreach (var row in memos.Rows)
            {
                writer.WriteStartObject();
                ClaimMonthPayload.Text(writer, "v", row.Visit);
                ClaimMonthPayload.Text(writer, "p", row.Patient);
                ClaimMonthPayload.Text(writer, "d", row.Day);
                ClaimMonthPayload.Text(writer, "m", row.Memo);
                writer.WriteEndObject();
            }
            writer.WriteEndArray();
        });
    }

    /// <summary>원본 ClaimMemoHistory.Query의 읽기와 거르기. 줄 300,000을 넘으면 거기서 멈추고 truncated로 둔다.</summary>
    public static MemoRows Read(IBitDb db, string scope, DateTime from, DateTime last)
    {
        if (db == null) throw new ArgumentNullException(nameof(db));
        var args = new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["@from"] = ClaimText.Stamp(from),
            ["@to"] = ClaimText.Stamp(last.AddDays(1)),
            ["@hospital"] = scope,
        };

        var result = new MemoRows();
        foreach (var row in ReadOnlyGuard.Query(db, Sql.MemoRowsSql, args, Sql.MemoTimeout))
        {
            var visit = ClaimText.Cell(row, 0);
            var patient = ClaimText.Cell(row, 1);
            var day = ClaimText.Cell(row, 2);
            var text = Convert.ToString(ClaimText.Raw(row, 3), CultureInfo.InvariantCulture) ?? "";
            if (ClaimText.CleanMemo(text).Length == 0) continue;
            if (!RxHistoryRead.VisitShape.IsMatch(visit) || !RxHistoryRead.PatientShape.IsMatch(patient) || !RxHistoryRead.DayShape.IsMatch(day))
            {
                result.InvalidRows++;
                continue;
            }
            if (result.Rows.Count >= MaximumRows)
            {
                result.Truncated = true;
                break;
            }
            var memo = MemoCompare.NormalizeNewlines(text);
            if (memo.Length > MaximumMemo)
            {
                memo = memo.Substring(0, MaximumMemo);
                result.Truncated = true;
            }
            result.Rows.Add(new MemoRow(visit, patient, day.Substring(0, 4) + "-" + day.Substring(4, 2) + "-" + day.Substring(6, 2), memo));
        }
        return result;
    }
}
