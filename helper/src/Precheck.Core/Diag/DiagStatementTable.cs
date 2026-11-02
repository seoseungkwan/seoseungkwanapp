using System;
using System.Collections.Generic;
using System.Linq;

namespace Precheck.Core.Diag;

/// <summary>제품 읽기의 문장 이름별 합계(횟수·시간·줄 수·오류). 값은 받지 않는다: 줄 수만 센다.</summary>
public sealed class DiagStatementTable
{
    private readonly List<Entry> entries = new List<Entry>();

    public void Add(string label, DiagOutcome outcome)
    {
        if (outcome == null) throw new ArgumentNullException(nameof(outcome));
        var entry = entries.FirstOrDefault(item => string.Equals(item.Label, label, StringComparison.Ordinal));
        if (entry == null)
        {
            entry = new Entry(label);
            entries.Add(entry);
        }

        entry.Count++;
        entry.TotalMs += outcome.TotalMs;
        entry.MaxMs = Math.Max(entry.MaxMs, outcome.TotalMs);
        if (outcome.FirstRowMs.HasValue) entry.FirstRowMs = Math.Max(entry.FirstRowMs ?? 0, outcome.FirstRowMs.Value);
        entry.Rows += outcome.Rows.Count;
        if (!outcome.Ok)
        {
            entry.Failures++;
            entry.LastError = DiagFormat.Failure(outcome.SqlNumber, outcome.ErrorKind);
        }
    }

    public IReadOnlyList<string> Lines() =>
        entries.Select(item => DiagFormat.Statement(item.Label, item.Count, item.TotalMs, item.MaxMs, item.FirstRowMs, item.Rows, item.Failures, item.LastError)).ToList();

    private sealed class Entry
    {
        public Entry(string label)
        {
            Label = label;
        }

        public string Label { get; }

        public long Count { get; set; }

        public long TotalMs { get; set; }

        public long MaxMs { get; set; }

        public long? FirstRowMs { get; set; }

        public long Rows { get; set; }

        public long Failures { get; set; }

        public string? LastError { get; set; }
    }
}
