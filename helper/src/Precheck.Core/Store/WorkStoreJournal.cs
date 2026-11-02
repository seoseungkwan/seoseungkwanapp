using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Input;
using Precheck.Core.Protocol;

namespace Precheck.Core.Store;

/// <summary>
/// 입력 기록의 진짜 구현(AC-035.2): 진료 달의 work-YYYY-MM.dat journal 칸에 상태 글자로 둔다. Mark는 돌아오기 전에 디스크에 남는다(WorkStore의 임시 파일 → 바꿔치기).
/// 무엇이든 못 읽거나 못 남기면 E-STORE-FAILED 하나로 던진다. 쓰는 일은 bit.input이 작업 잠금을 쥔 동안에만 한다. 묶음 하나에 하나씩 연다: 이번 묶음에서 Mark한 진료를 기억한다.
/// 웹이 보낸 journal은 여기로 오지 않는다(StoreCommands). 그래서 쓰다 멈춘 기록을 푸는 길은 bit.input의 저장 확인과 직접 확인(AC-035.5·AC-035.8)뿐이다.
/// Scan은 달 파일을 고치지 않고 본다(AC-035.9, WorkStoreRecords.cs). LastState·Mark·SaveResults는 그 달 파일을 AC-015.3·AC-015.4 그대로 읽고 쓴다.
/// 원래 메모(AC-037.1)는 journal이 아니라 originals 칸의 글 목록이다: journal 값은 상태 글자이고, store.save가 칸째 바꾸는 drafts·done에는 둘 수 없다.
/// </summary>
public sealed class WorkStoreJournal : IBatchJournal
{
    private static readonly Dictionary<JournalState, string> Letters = new Dictionary<JournalState, string>
    {
        [JournalState.Writing] = "writing",
        [JournalState.Done] = "done",
        [JournalState.Skipped] = "skipped",
        [JournalState.SkippedByHand] = "skippedByHand",
        [JournalState.Check] = "check",
        [JournalState.WriteUnconfirmed] = "writeUnconfirmed",
    };

    private readonly WorkStore store;
    private readonly HashSet<string> marked = new HashSet<string>(StringComparer.Ordinal);

    public WorkStoreJournal(WorkStore store)
    {
        this.store = store ?? throw new ArgumentNullException(nameof(store));
    }

    public void Mark(InputItem item, JournalState state)
    {
        Guarded(() =>
        {
            Write(MonthOf(item), new[] { item }, state);
            return true;
        });
        marked.Add(item.VisitKey);
    }

    public void SaveOriginal(InputItem item, string text)
    {
        if (text == null) throw new ArgumentNullException(nameof(text));
        Guarded(() =>
        {
            var month = MonthOf(item);
            var kept = OriginalsOf(month, item.VisitKey);
            if (kept.Count > 0 && string.Equals(kept[kept.Count - 1], text, StringComparison.Ordinal)) return true;

            kept.Add(text);
            var originals = Element(writer =>
            {
                writer.WriteStartArray(item.VisitKey);
                foreach (var original in kept) writer.WriteStringValue(original);
                writer.WriteEndArray();
            });

            // 글자로 풀 수 없는 글(짝 없는 대리쌍)은 JSON에 쓰면 다른 글자로 바뀐다: 바뀐 글을 남기면 원래 메모를 잃은 것이니 담지 못한 것으로 친다(AC-037.1)
            var written = originals.GetProperty(item.VisitKey);
            if (!string.Equals(written[written.GetArrayLength() - 1].GetString(), text, StringComparison.Ordinal)) throw new BitException(BitErrors.StoreFailed);

            store.SaveMonth(month, null, null, null, null, originals);
            return true;
        });
    }

    public string? LastOriginal(InputItem item) => Guarded(() =>
    {
        var kept = OriginalsOf(MonthOf(item), item.VisitKey);
        return kept.Count == 0 ? null : kept[kept.Count - 1];
    });

    public JournalState? LastState(InputItem item) => Guarded<JournalState?>(() =>
    {
        var journal = store.ReadJournal(MonthOf(item)).Journal;
        return journal.HasValue && journal.Value.TryGetProperty(item.VisitKey, out var value) ? StateOf(value) : (JournalState?)null;
    });

    public JournalScan Scan() => Guarded(() =>
    {
        var records = store.ScanRecords();
        var stuck = new List<UnconfirmedVisit>();
        foreach (var record in records.Months)
        {
            if (!record.Journal.HasValue) continue;
            foreach (var entry in record.Journal.Value.EnumerateObject())
            {
                var state = StateOf(entry.Value);
                if (state == JournalState.Writing || state == JournalState.WriteUnconfirmed) stuck.Add(new UnconfirmedVisit(entry.Name, DateOf(record, entry.Name)));
            }
        }

        // 그런 파일이 없으면 input-acks.dat를 읽지도 만들지도 않는다. 하나라도 확인하지 않았으면 지금 있는 해시를 다 넘긴다: 저장하면 사라진 파일의 해시가 빠진다
        var asks = records.Unreadable.Count > 0 && !store.ReadAcks().IsSupersetOf(records.Unreadable);
        return new JournalScan(stuck, asks ? records.Unreadable : new string[0]);
    });

    public void SaveAcks(IReadOnlyList<string> hashes)
    {
        Guarded(() =>
        {
            store.SaveAcks(hashes);
            return true;
        });
    }

    public void SaveResults(InputOutcome outcome)
    {
        if (outcome == null) throw new ArgumentNullException(nameof(outcome));
        Guarded(() =>
        {
            var skipped = new HashSet<string>(outcome.Results.Where(row => row.Result == InputResults.Skipped).Select(row => row.VisitKey), StringComparer.Ordinal);
            var targets = outcome.Excluded.Where(item => skipped.Contains(item.VisitKey) && !marked.Contains(item.VisitKey));
            foreach (var month in targets.GroupBy(MonthOf, StringComparer.Ordinal))
            {
                var journal = store.ReadJournal(month.Key).Journal;
                var writable = month.Where(item => !KeepsRecord(journal, item.VisitKey)).ToList();
                if (writable.Count > 0) Write(month.Key, writable, JournalState.Skipped);
            }
            return true;
        });
    }

    /// <summary>그 진료의 글 목록. 모양이 틀리면 예외다: 틀린 목록을 빈 것으로 보고 덮으면 전에 남긴 글을 잃는다.</summary>
    private List<string> OriginalsOf(string month, string visitKey)
    {
        var kept = new List<string>();
        var originals = store.ReadOriginals(month);
        if (!originals.HasValue || !originals.Value.TryGetProperty(visitKey, out var list)) return kept;
        foreach (var text in list.EnumerateArray()) kept.Add(text.GetString() ?? throw new BitException(BitErrors.StoreFailed));
        return kept;
    }

    private void Write(string month, IReadOnlyList<InputItem> items, JournalState state)
    {
        var letters = Letters[state];
        var journal = Element(writer =>
        {
            foreach (var item in items) writer.WriteString(item.VisitKey, letters);
        });
        var dates = Element(writer =>
        {
            foreach (var item in items) writer.WriteString(item.VisitKey, item.Date);
        });
        store.SaveMonth(month, null, null, journal, dates);
    }

    /// <summary>결과 줄이 덮으면 안 되는 앞선 기록인가: 쓰다 멈춘 기록·직접 확인 기록.</summary>
    private static bool KeepsRecord(JsonElement? journal, string visitKey)
    {
        if (!journal.HasValue || !journal.Value.TryGetProperty(visitKey, out var value)) return false;
        var state = StateOf(value);
        return state == JournalState.Writing || state == JournalState.WriteUnconfirmed || state == JournalState.SkippedByHand;
    }

    private static string MonthOf(InputItem item) => item.Date.Substring(0, 7);

    private static JournalState StateOf(JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.String)
        {
            var text = value.GetString();
            foreach (var pair in Letters)
            {
                if (string.Equals(pair.Value, text, StringComparison.Ordinal)) return pair.Key;
            }
        }
        throw new BitException(BitErrors.StoreFailed);
    }

    /// <summary>쓰다 멈춘 진료의 내원일(AC-035.4). 없거나, 내원일 모양이 아니거나, 그 파일의 달이 아니면 못 읽는 것이다.</summary>
    private static string DateOf(WorkStore.MonthRecord record, string visitKey)
    {
        var date = record.Dates.HasValue && record.Dates.Value.TryGetProperty(visitKey, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
        if (!FieldSpec.TryParseDate(date, out _) || !date!.StartsWith(record.Month + "-", StringComparison.Ordinal)) throw new BitException(BitErrors.StoreFailed);
        return date;
    }

    private static JsonElement Element(Action<Utf8JsonWriter> body)
    {
        using var document = JsonDocument.Parse(Envelope.Write(body), Envelope.DocumentOptions);
        return document.RootElement.Clone();
    }

    /// <summary>
    /// 못 읽거나 못 남기면 어떤 까닭이든 E-STORE-FAILED 하나다. 예외 글은 밖으로 나가지 않는다(AC-001.6).
    /// 깨진 파일의 이름만 바꾼 때(E-STORE-BROKEN)는 번호가 같고 그것만 알려 준다: 다시 누르면 이어진다(AC-035.9).
    /// </summary>
    private static T Guarded<T>(Func<T> action)
    {
        try
        {
            return action();
        }
        catch (BitException e) when (e.Code == BitErrors.StoreBroken)
        {
            throw new RecordSetAsideException();
        }
        catch (Exception e) when (e is not OutOfMemoryException)
        {
            throw new BitException(BitErrors.StoreFailed);
        }
    }
}
