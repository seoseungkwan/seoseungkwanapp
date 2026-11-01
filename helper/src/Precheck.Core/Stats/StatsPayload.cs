using System;
using System.IO;
using System.Text;
using System.Text.Json;
using Precheck.Core.Protocol;

namespace Precheck.Core.Stats;

/// <summary>
/// 보고 숫자 네 벌(일일 to·to−1, 월말 to가 든 달·그 앞 달). 칸과 읽기는 TASK-4(REQ-504)가 채운다.
/// 그 전까지 StatsPayload는 report를 빈 배열 둘로 쓴다.
/// </summary>
public sealed class StatsReportResult
{
}

/// <summary>
/// stats.rows 답 JSON(design.md '도우미 → Worker JSON'). 정해 둔 열쇠만, 이 차례로 쓴다:
/// { v, from, to, summary{visits, patients, newPatients, noChart, duplicate, noFirst},
///   days[[날짜, 내원, 실환자, 신환]], codes[[코드, 이름]], rows[[차트번호, 진료일, 처방코드, 첫 내원일|null]],
///   report{daily[], monthly[]} }.
/// 줄은 객체보다 작은 배열이다. 다 만든 글자를 Chunker가 나눠 보낸다.
/// </summary>
public static class StatsPayload
{
    public const int Version = 1;

    public static string Build(string from, string to, StatsRowsResult rows, StatsReportResult? report)
    {
        if (from == null) throw new ArgumentNullException(nameof(from));
        if (to == null) throw new ArgumentNullException(nameof(to));
        if (rows == null) throw new ArgumentNullException(nameof(rows));

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

            // 보고 숫자 네 벌은 TASK-4가 report에서 쓴다
            writer.WriteStartObject("report");
            writer.WriteStartArray("daily");
            writer.WriteEndArray();
            writer.WriteStartArray("monthly");
            writer.WriteEndArray();
            writer.WriteEndObject();

            writer.WriteEndObject();
        }
        return Encoding.UTF8.GetString(buffer.ToArray());
    }

    private static void WriteText(Utf8JsonWriter writer, string? text)
    {
        if (text == null) writer.WriteNullValue();
        else writer.WriteStringValue(text);
    }
}
