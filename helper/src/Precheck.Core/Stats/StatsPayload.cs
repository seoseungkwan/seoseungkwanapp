using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.Json;
using Precheck.Core.Protocol;

namespace Precheck.Core.Stats;

/// <summary>
/// stats.rows 답 JSON(design.md '도우미 → Worker JSON'). 정해 둔 열쇠만, 이 차례로 쓴다:
/// { v, from, to, summary{visits, patients, newPatients, noChart, duplicate, noFirst},
///   days[[날짜, 내원, 실환자, 신환]], codes[[코드, 이름]], rows[[차트번호, 진료일, 처방코드, 첫 내원일|null]],
///   report{daily[], monthly[]} }. 보고 한 벌은 { ok:true, period, totalVisits, newPatients, returnPatients, totalAmount,
///   insurerAmount, noncoveredAmount, cashAmount, cardAmount, transferAmount, treatments{manual, eswt, carm, sono, cryo},
///   laCodes[{code, count}], financeUnconfirmed, financeUnconfirmedReason(확인 필요일 때만), notes[] } 또는 { ok:false, period, reason }.
/// 줄은 객체보다 작은 배열이다. 다 만든 글자를 Chunker가 나눠 보낸다.
/// </summary>
public static class StatsPayload
{
    public const int Version = 1;

    public static string Build(string from, string to, StatsRowsResult rows, StatsReportResult report)
    {
        if (from == null) throw new ArgumentNullException(nameof(from));
        if (to == null) throw new ArgumentNullException(nameof(to));
        if (rows == null) throw new ArgumentNullException(nameof(rows));
        if (report == null) throw new ArgumentNullException(nameof(report));

        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer, Envelope.WriterOptions))
        {
            writer.WriteStartObject();
            writer.WriteNumber("v", Version);
            writer.WriteString("from", from);
            writer.WriteString("to", to);

            var summary = rows.Summary;
            writer.WriteStartObject("summary");
            writer.WriteNumber("visits", summary.Visits);
            writer.WriteNumber("patients", summary.Patients);
            writer.WriteNumber("newPatients", summary.NewPatients);
            writer.WriteNumber("noChart", summary.NoChart);
            writer.WriteNumber("duplicate", summary.Duplicate);
            writer.WriteNumber("noFirst", summary.NoFirst);
            writer.WriteEndObject();

            writer.WriteStartArray("days");
            foreach (var day in rows.Days)
            {
                writer.WriteStartArray();
                writer.WriteStringValue(day.Day);
                writer.WriteNumberValue(day.Visits);
                writer.WriteNumberValue(day.Patients);
                writer.WriteNumberValue(day.NewPatients);
                writer.WriteEndArray();
            }
            writer.WriteEndArray();

            writer.WriteStartArray("codes");
            foreach (var code in rows.Codes)
            {
                writer.WriteStartArray();
                writer.WriteStringValue(code.Code);
                writer.WriteStringValue(code.Name);
                writer.WriteEndArray();
            }
            writer.WriteEndArray();

            writer.WriteStartArray("rows");
            foreach (var row in rows.Rows)
            {
                writer.WriteStartArray();
                WriteText(writer, row.Chart);
                WriteText(writer, row.Day);
                WriteText(writer, row.Code);
                WriteText(writer, row.FirstDay);
                writer.WriteEndArray();
            }
            writer.WriteEndArray();

            writer.WriteStartObject("report");
            WriteSets(writer, "daily", report.Daily);
            WriteSets(writer, "monthly", report.Monthly);
            writer.WriteEndObject();

            writer.WriteEndObject();
        }
        return Encoding.UTF8.GetString(buffer.ToArray());
    }

    private static void WriteSets(Utf8JsonWriter writer, string name, IReadOnlyList<StatsReportSet> sets)
    {
        writer.WriteStartArray(name);
        foreach (var set in sets) WriteSet(writer, set);
        writer.WriteEndArray();
    }

    private static void WriteSet(Utf8JsonWriter writer, StatsReportSet set)
    {
        writer.WriteStartObject();
        writer.WriteBoolean("ok", set.Ok);
        writer.WriteString("period", set.Period);
        if (!set.Ok)
        {
            writer.WriteString("reason", set.Reason);
            writer.WriteEndObject();
            return;
        }

        writer.WriteNumber("totalVisits", set.TotalVisits);
        writer.WriteNumber("newPatients", set.NewPatients);
        writer.WriteNumber("returnPatients", set.ReturnPatients);
        writer.WriteNumber("totalAmount", set.TotalAmount);
        writer.WriteNumber("insurerAmount", set.InsurerAmount);
        writer.WriteNumber("noncoveredAmount", set.NoncoveredAmount);
        writer.WriteNumber("cashAmount", set.CashAmount);
        writer.WriteNumber("cardAmount", set.CardAmount);
        writer.WriteNumber("transferAmount", set.TransferAmount);

        writer.WriteStartObject("treatments");
        writer.WriteNumber("manual", set.Treatments.Manual);
        writer.WriteNumber("eswt", set.Treatments.Eswt);
        writer.WriteNumber("carm", set.Treatments.Carm);
        writer.WriteNumber("sono", set.Treatments.Sono);
        writer.WriteNumber("cryo", set.Treatments.Cryo);
        writer.WriteEndObject();

        writer.WriteStartArray("laCodes");
        foreach (var code in set.LaCodes)
        {
            writer.WriteStartObject();
            writer.WriteString("code", code.Code);
            writer.WriteNumber("count", code.Count);
            writer.WriteEndObject();
        }
        writer.WriteEndArray();

        writer.WriteBoolean("financeUnconfirmed", set.FinanceUnconfirmed);
        if (set.FinanceUnconfirmed) writer.WriteString("financeUnconfirmedReason", set.FinanceUnconfirmedReason);

        writer.WriteStartArray("notes");
        foreach (var note in set.Notes) writer.WriteStringValue(note);
        writer.WriteEndArray();

        writer.WriteEndObject();
    }

    private static void WriteText(Utf8JsonWriter writer, string? text)
    {
        if (text == null) writer.WriteNullValue();
        else writer.WriteStringValue(text);
    }
}
