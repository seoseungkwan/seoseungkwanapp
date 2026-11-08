using System;
using System.Collections.Generic;
using Precheck.Core.Bit;
using Precheck.Core.Claim;
using Precheck.Core.Protocol;
using Precheck.Core.Registration;

namespace Precheck.Core.Contact;

/// <summary>
/// contact.targets {kind:'lapsed', from, to}(spec patients-bit-lists AC-2801.3·2801.4). from~to는 마지막 내원일 기간이다(웹은 24달 전 다음 날 ~ 1달 전).
/// 차례: 기간 검사(비트를 건드리지 않음) → 등록 병원 확인(HospitalGate) → 장기 미방문 SQL 하나(ListSql.LapsedSql) → 환자마다 한 줄로 모음 → JSON 하나.
/// 답 {v:1, kind, from, to, today, rows}, 줄 = [차트번호, 이름|null, 전화, 마지막 내원일 YYYYMMDD, 진료 받은 날 수, 예약 있음 0|1, 마지막 진료 처방 [[코드, 이름|null], …]].
/// 처방은 처음 나온 차례로 겹침 없이 20개까지다.
/// </summary>
public static class LapsedTargets
{
    public const string Kind = "lapsed";

    /// <summary>마지막 내원 기간 날 수 한도(시작·끝 포함, 명령 표 1,100일과 같다).</summary>
    public const int MaxDays = 1100;

    /// <summary>한 환자의 마지막 진료 처방 수 한도.</summary>
    public const int MaxRx = 20;

    private const int Cells = 9;

    public static string Build(BitServices services, DateTime from, DateTime to)
    {
        if (services == null) throw new ArgumentNullException(nameof(services));
        from = from.Date;
        to = to.Date;
        var today = services.Today().Date;
        // 오늘은 아직 끝나지 않아 마지막 내원으로 보지 않는다
        if (from > to || to >= today || (to - from).Days + 1 > MaxDays) throw new ProtocolException(ErrorCodes.BadMessage);

        IReadOnlyList<IReadOnlyList<object?>> rows;
        using (var hospital = HospitalGate.Open(services))
        {
            var args = new Dictionary<string, object?>(StringComparer.Ordinal)
            {
                ["@from"] = ClaimText.Day(from),
                ["@to"] = ClaimText.Day(to),
                ["@today"] = ClaimText.Stamp(today),
                ["@hospital"] = hospital.Registration.Scope,
            };
            rows = ListSql.Read(hospital.Db, ListSql.LapsedSql, args, Cells);
        }

        // SQL은 처방 하나에 한 줄이다. 차트번호로 모으고 환자는 처음 나온 차례로 둔다
        var patients = new List<Patient>();
        var byChart = new Dictionary<string, Patient>(StringComparer.Ordinal);
        foreach (var row in rows)
        {
            var chart = ClaimText.Cell(row, 0);
            if (chart.Length == 0) throw new BitException(BitErrors.ReadFailed);
            if (!byChart.TryGetValue(chart, out var patient))
            {
                patient = new Patient(chart, row);
                byChart[chart] = patient;
                patients.Add(patient);
            }
            patient.AddRx(row);
        }

        return ListSql.Payload(Kind, from, to, today, writer =>
        {
            foreach (var patient in patients)
            {
                writer.WriteStartArray();
                ListSql.Text(writer, patient.Chart);
                ListSql.Text(writer, patient.Name);
                ListSql.Text(writer, patient.Phone);
                ListSql.Text(writer, patient.LastDay);
                writer.WriteNumberValue(patient.Days);
                writer.WriteNumberValue(patient.Reserved);
                writer.WriteStartArray();
                foreach (var (code, name) in patient.Rx)
                {
                    writer.WriteStartArray();
                    ListSql.Text(writer, code);
                    ListSql.Text(writer, name);
                    writer.WriteEndArray();
                }
                writer.WriteEndArray();
                writer.WriteEndArray();
            }
        });
    }

    /// <summary>환자 한 줄. 환자 칸은 그 환자의 첫 SQL 줄에서 읽는다(줄마다 같다).</summary>
    private sealed class Patient
    {
        private readonly HashSet<string> seen = new HashSet<string>(StringComparer.Ordinal);

        public Patient(string chart, IReadOnlyList<object?> row)
        {
            Chart = chart;
            Name = ListSql.Optional(row, 1);
            Phone = ListSql.Phone(row, 2, 3);
            LastDay = ClaimText.Cell(row, 4);
            Days = ClaimText.Long(row, 5);
            Reserved = ListSql.Flag(row, 6);
        }

        public string Chart { get; }

        public string? Name { get; }

        public string Phone { get; }

        public string LastDay { get; }

        public long Days { get; }

        public int Reserved { get; }

        public List<(string Code, string? Name)> Rx { get; } = new List<(string Code, string? Name)>();

        /// <summary>처방 칸이 비면(처방 없는 환자) 넘긴다. 같은 코드는 처음 한 번, 20개까지.</summary>
        public void AddRx(IReadOnlyList<object?> row)
        {
            var code = ClaimText.Cell(row, 7).ToUpperInvariant();
            if (code.Length == 0 || Rx.Count >= MaxRx || !seen.Add(code)) return;
            Rx.Add((code, ListSql.Optional(row, 8)));
        }
    }
}
