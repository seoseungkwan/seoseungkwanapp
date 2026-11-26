// 비트시트 app/src/Core/RowBuilder.cs(작업 트리 파일, 판 7)을 옮김(spec google-link TASK-9, design.md 9-1). 규칙은 그대로, 바뀐 것은 이름공간·nullable 표시.
using System;
using System.Collections.Generic;
using System.Linq;

namespace Precheck.Core.Sheet;

public sealed class MoneyLine
{
    public MoneyLine(int sign, long amount, bool isFree = false)
    {
        Sign = sign;
        Amount = amount;
        IsFree = isFree;
    }

    public int Sign { get; }
    public long Amount { get; }
    /// <summary>FREE 줄(기호 FREE, 0원). 개수 셀 때 돈 줄로 치지 않는다.</summary>
    public bool IsFree { get; }
}

/// <summary>그날 접수를 취소했고 같은 날 센 내원이 없는 환자(시트에서 지울 후보).</summary>
public sealed class CancelledRow
{
    public string Key { get; set; } = "";
    public string Name { get; set; } = "";
}

/// <summary>시트의 환자 한 명(본 줄 + 이어지는 돈 줄).</summary>
public sealed class PatientRow
{
    public string Key { get; set; } = "";
    public string Name { get; set; } = "";
    public string FirstAcceptedAt { get; set; } = "";
    /// <summary>진료실 번호. 맞춤이 없으면 null(빈칸).</summary>
    public int? Room { get; set; }
    public bool First { get; set; }
    public bool Day90 { get; set; }
    public bool Block { get; set; }
    public bool Therapy { get; set; }
    /// <summary>FREE 줄이 있음(같은 날 미수입금 줄은 따로 있을 수 있다).</summary>
    public bool IsFree { get; set; }
    /// <summary>비고 칸에 넣을 글(NoteTexts: 자동차보험 · 건강생활잔액, 없으면 ""). 구글 쪽이 빈 칸일 때만 넣는다.</summary>
    public string Note { get; set; } = "";
    /// <summary>첫째 = 본 줄의 D·F, 둘째부터 = 이어지는 줄. 돈이 들어온 시각 차례.</summary>
    public List<MoneyLine> Money { get; } = new List<MoneyLine>();
    /// <summary>
    /// 할인 기록 FREE 때문에 뺀 진료수납 돈 줄(시각 차례). 할인이 수납 뒤에 붙으면 시트에 이 줄들이 먼저 들어가 있을 수 있어,
    /// 구글 쪽이 똑같은 줄만 FREE 한 줄로 바꾼다(DESIGN 4장 '늦게 붙은 FREE').
    /// </summary>
    public List<MoneyLine> FreeDropped { get; } = new List<MoneyLine>();
}

/// <summary>
/// 그날 내원 없이 예전 미수만 낸 환자 한 명(DESIGN 3절): 시트에 이름(C)과 돈(D·F)만 넣는다. 차트번호(B)는 넣지 않는다
/// (총내원 COUNT(B)가 늘지 않게). 구글 쪽은 이름과 돈 짝으로 알아본다.
/// </summary>
public sealed class PaidOnlyRow
{
    /// <summary>차트번호(프로그램 안에서만 씀, 구글에 보내지 않음).</summary>
    public string Key { get; set; } = "";
    public string Name { get; set; } = "";
    /// <summary>첫 돈이 들어온 시각 yyyyMMddHHmm.</summary>
    public string FirstPaidAt { get; set; } = "";
    /// <summary>시각 차례. 첫째 = 첫 줄, 둘째부터 = 이어지는 줄(모두 이름을 단다).</summary>
    public List<MoneyLine> Money { get; } = new List<MoneyLine>();
    /// <summary>시트 차례: 환자 목록에서 이 자리(Patients[Before]) 앞에 넣는다(첫 접수 시각이 이 돈보다 늦은 첫 환자).</summary>
    public int Before { get; set; }
}

public sealed class DayRows
{
    public DateTime Day { get; set; }
    public List<PatientRow> Patients { get; } = new List<PatientRow>();
    public int Visits { get; set; }
    /// <summary>차트번호가 빈 내원(넣지 않음).</summary>
    public int NoKeyVisits { get; set; }
    /// <summary>그날 내원 없이 미수만 낸 환자 가운데 이름을 몰라 넣지 않은 수.</summary>
    public int ReceivableOnly { get; set; }
    /// <summary>그날 내원 없이 미수만 낸 환자(이름 줄로 넣음, 돈 시각 차례).</summary>
    public List<PaidOnlyRow> PaidOnly { get; } = new List<PaidOnlyRow>();
    /// <summary>센 내원에 붙지 않은 진료수납 줄(취소된 접수 등).</summary>
    public int UnlinkedReceipts { get; set; }
    /// <summary>0보다 작은 돈(넣지 않음).</summary>
    public int IgnoredNegative { get; set; }
    /// <summary>그날 접수를 취소했고 같은 날 센 내원이 없는 환자(차트번호 차례).</summary>
    public List<CancelledRow> Cancelled { get; } = new List<CancelledRow>();

    /// <summary>시트에 보낼 것이 하나도 없음(환자·취소된 접수·미수만 낸 환자 줄 모두 없음). 지난 날 다시 넣기에서 쉬는 날을 거른다.</summary>
    public bool NothingToSend => Patients.Count == 0 && Cancelled.Count == 0 && PaidOnly.Count == 0;
}

/// <summary>
/// DESIGN 3절: 하루 원자료 → 환자 줄. 비트·구글과 상관없는 순수한 계산이다.
/// - 같은 날 같은 차트번호는 한 환자(표시는 OR), 차례는 첫 접수 시각.
/// - 돈 줄 = 진료수납(그 환자 내원에 붙은 것)과 미수입금(그 차트, 그날)의 0원 아닌 돈 하나하나.
///   차례: 돈이 들어온 시각 → 순번 → 종류(현금·카드·계좌·미수현금·미수카드·미수계좌). 나중에 낸 돈이 늘 뒤에 붙는다(검토 1).
/// - FREE 기본 규칙(할인 기록 FREE): 그 내원의 진료수납 돈 줄을 모두 빼고 FREE 한 줄(그 내원 첫 수납 자리). 미수입금 줄은 그대로.
/// - 다른 FREE 규칙: 돈 줄이 하나도 없을 때만 본다. 맞으면 돈 줄 하나(FREE 기호, 0원). 아니면 D·F 비움.
/// </summary>
public static class RowBuilder
{
    private enum Kind { Cash = 0, Card = 1, Transfer = 2, RCash = 3, RCard = 4, RTransfer = 5, Free = 6 }

    public static DayRows Build(DayData data, Settings settings)
    {
        if (data == null) throw new ArgumentNullException(nameof(data));
        if (settings == null) throw new ArgumentNullException(nameof(settings));

        var rows = new DayRows { Day = data.Day.Date, Visits = data.Visits.Count };
        var firstKinds = new HashSet<string>(settings.FirstVisitKinds ?? new List<string>(), StringComparer.OrdinalIgnoreCase);
        var day90Kinds = new HashSet<string>(settings.Day90Kinds ?? new List<string>(), StringComparer.OrdinalIgnoreCase);
        var blockCodes = new HashSet<string>((settings.BlockCodes ?? new List<string>()).Select(c => c.Trim()).Where(c => c.Length > 0), StringComparer.OrdinalIgnoreCase);
        var therapyCodes = new HashSet<string>((settings.TherapyCodes ?? new List<string>()).Select(c => c.Trim()).Where(c => c.Length > 0), StringComparer.OrdinalIgnoreCase);
        var rooms = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var pair in settings.DeptRooms ?? new Dictionary<string, int>())
        {
            if (pair.Key != null && RoomPlan.IsRoom(pair.Value)) rooms[pair.Key.Trim()] = pair.Value;
        }
        var carIns = new HashSet<int>(settings.CarInsurance ?? new List<int>());
        var aidIns = new HashSet<int>(settings.AidInsurance ?? new List<int>());

        // 같은 차트번호 = 한 환자. 숫자뿐인 차트번호는 앞의 0을 빼고 견준다(미수입금 줄과 내원의 차트번호 모양이 달라도 한 환자로, 구글 쪽 맞춤과 같게).
        var groups = new Dictionary<string, List<DayVisit>>(StringComparer.Ordinal);
        foreach (var visit in data.Visits)
        {
            var key = KeyOf(visit.Key);
            if (key.Length == 0)
            {
                rows.NoKeyVisits++;
                continue;
            }
            if (!groups.TryGetValue(key, out var list)) groups[key] = list = new List<DayVisit>();
            list.Add(visit);
        }

        var visitOwner = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var g in groups)
        {
            foreach (var v in g.Value) visitOwner[v.VisitId ?? ""] = g.Key;
        }

        // FREE 기본 규칙: 할인 기록 FREE가 있고 수납 줄이 있는 내원(아직 수납 전이면 FREE로 넣지 않는다)
        var discountFree = new HashSet<string>(StringComparer.Ordinal);
        if (settings.Free == FreeRule.DiscountFree)
        {
            foreach (var v in data.Visits)
            {
                var id = v.VisitId ?? "";
                if (IsDiscountFreeVisit(id, data)) discountFree.Add(id);
            }
        }

        // 돈 줄 모으기
        var lines = new Dictionary<string, List<(Kind kind, string at, int seq, long amount)>>(StringComparer.Ordinal);
        var freeAt = new Dictionary<string, (string at, int seq)>(StringComparer.Ordinal);
        var freeDropped = new Dictionary<string, List<(Kind kind, string at, int seq, long amount)>>(StringComparer.Ordinal);
        var paidLines = new Dictionary<string, List<(Kind kind, string at, int seq, long amount)>>(StringComparer.Ordinal);
        var paidNames = new Dictionary<string, (string key, string name)>(StringComparer.Ordinal);
        foreach (var p in data.Payments)
        {
            string? owner = null;
            if (p.Type == PaymentType.Receipt)
            {
                if (!visitOwner.TryGetValue(p.VisitId ?? "", out owner))
                {
                    rows.UnlinkedReceipts++;
                    continue;
                }
                if (discountFree.Contains(p.VisitId ?? ""))
                {
                    // 받은 돈과 상관없이 이 내원의 진료수납은 FREE 한 줄로(그 내원 첫 수납 자리)
                    var here = (p.At ?? "", p.Seq);
                    if (!freeAt.TryGetValue(owner, out var was) || Earlier(here, was)) freeAt[owner] = here;
                    if (!freeDropped.TryGetValue(owner, out var gone)) freeDropped[owner] = gone = new List<(Kind, string, int, long)>();
                    Dropped(gone, Kind.Cash, p.Cash, p);
                    Dropped(gone, Kind.Card, p.Card, p);
                    Dropped(gone, Kind.Transfer, p.Transfer, p);
                    continue;
                }
            }
            else if (p.Type == PaymentType.ReceivablePaid)
            {
                var key = KeyOf(p.Key);
                if (key.Length == 0) continue;
                if (!groups.ContainsKey(key))
                {
                    // 그날 내원 없이 미수만 냄: 이름 줄로 넣는다(차트번호는 넣지 않음)
                    Add(rows, paidLines, key, Kind.RCash, p.Cash, p);
                    Add(rows, paidLines, key, Kind.RCard, p.Card, p);
                    Add(rows, paidLines, key, Kind.RTransfer, p.Transfer, p);
                    var name = (p.Name ?? "").Trim();
                    if (!paidNames.TryGetValue(key, out var had) || (had.name.Length == 0 && name.Length > 0)) paidNames[key] = ((p.Key ?? "").Trim(), name);
                    continue;
                }
                owner = key;
            }
            else
            {
                continue;
            }

            var receivable = p.Type == PaymentType.ReceivablePaid;
            Add(rows, lines, owner, receivable ? Kind.RCash : Kind.Cash, p.Cash, p);
            Add(rows, lines, owner, receivable ? Kind.RCard : Kind.Card, p.Card, p);
            Add(rows, lines, owner, receivable ? Kind.RTransfer : Kind.Transfer, p.Transfer, p);
        }

        foreach (var g in groups)
        {
            var visits = g.Value.OrderBy(v => v.AcceptedAt ?? "", StringComparer.Ordinal).ThenBy(v => v.VisitId ?? "", StringComparer.Ordinal).ToList();
            var row = new PatientRow
            {
                Key = (visits[0].Key ?? "").Trim(),
                Name = visits.Select(v => (v.Name ?? "").Trim()).FirstOrDefault(n => n.Length > 0) ?? "",
                FirstAcceptedAt = visits[0].AcceptedAt ?? "",
            };
            foreach (var v in visits)
            {
                if (row.Room == null && rooms.TryGetValue((v.Dept ?? "").Trim(), out var room)) row.Room = room;
                var kind = (v.VisitKind ?? "").Trim();
                if (firstKinds.Contains(kind)) row.First = true;
                if (day90Kinds.Contains(kind)) row.Day90 = true;
                // 고른 처방이 없으면 비트 분류로(주사 = 주사료·마취료, 물리치료 = 이학요법료)
                if (blockCodes.Count == 0 ? v.Injection : v.Codes.Any(c => blockCodes.Contains((c ?? "").Trim()))) row.Block = true;
                if (therapyCodes.Count == 0 ? v.Therapy : v.Codes.Any(c => therapyCodes.Contains((c ?? "").Trim()))) row.Therapy = true;
            }
            row.Note = NoteOf(visits, data, carIns, aidIns);

            if (!lines.TryGetValue(g.Key, out var mine)) mine = new List<(Kind kind, string at, int seq, long amount)>();
            if (freeAt.TryGetValue(g.Key, out var fa)) mine.Add((Kind.Free, fa.at, fa.seq, 0L));
            foreach (var l in mine.OrderBy(x => x.at, StringComparer.Ordinal).ThenBy(x => x.seq).ThenBy(x => (int)x.kind))
            {
                var free = l.kind == Kind.Free;
                row.Money.Add(new MoneyLine(free ? settings.Signs.Free : SignOf(settings.Signs, l.kind), l.amount, free));
                if (free) row.IsFree = true;
            }
            if (row.IsFree && freeDropped.TryGetValue(g.Key, out var gone))
            {
                foreach (var l in gone.OrderBy(x => x.at, StringComparer.Ordinal).ThenBy(x => x.seq).ThenBy(x => (int)x.kind))
                {
                    row.FreeDropped.Add(new MoneyLine(SignOf(settings.Signs, l.kind), l.amount));
                }
            }

            if (row.Money.Count == 0 && settings.Free != FreeRule.None && settings.Free != FreeRule.DiscountFree
                && visits.Any(v => IsFreeVisit(v, data, settings)))
            {
                row.IsFree = true;
                row.Money.Add(new MoneyLine(settings.Signs.Free, 0, true));
            }

            rows.Patients.Add(row);
        }

        // 취소된 접수: 같은 날 센 내원이 없는 차트만, 차트번호마다 한 번
        var seenCancel = new HashSet<string>(StringComparer.Ordinal);
        foreach (var c in data.Cancelled.OrderBy(c => (c.Key ?? "").Trim(), StringComparer.Ordinal))
        {
            var key = (c.Key ?? "").Trim();
            if (key.Length == 0 || groups.ContainsKey(KeyOf(key)) || !seenCancel.Add(KeyOf(key))) continue;
            rows.Cancelled.Add(new CancelledRow { Key = key, Name = (c.Name ?? "").Trim() });
        }

        var ordered = rows.Patients.OrderBy(r => r.FirstAcceptedAt, StringComparer.Ordinal).ThenBy(r => r.Key, StringComparer.Ordinal).ToList();
        rows.Patients.Clear();
        rows.Patients.AddRange(ordered);

        // 내원 없이 미수만 낸 환자: 이름을 알면 이름 줄(돈 시각 차례), 모르면 넣지 않고 센다
        var paid = new List<PaidOnlyRow>();
        foreach (var pl in paidLines)
        {
            if (pl.Value.Count == 0) continue;
            (string key, string name) who = paidNames.TryGetValue(pl.Key, out var w) ? w : (pl.Key, "");
            if (who.name.Length == 0)
            {
                rows.ReceivableOnly++;
                continue;
            }
            var po = new PaidOnlyRow { Key = who.key, Name = who.name };
            foreach (var l in pl.Value.OrderBy(x => x.at, StringComparer.Ordinal).ThenBy(x => x.seq).ThenBy(x => (int)x.kind))
            {
                po.Money.Add(new MoneyLine(SignOf(settings.Signs, l.kind), l.amount));
            }
            po.FirstPaidAt = pl.Value.Select(x => x.at).OrderBy(x => x, StringComparer.Ordinal).First();
            po.Before = rows.Patients.Count(r => string.CompareOrdinal(r.FirstAcceptedAt, po.FirstPaidAt) <= 0);
            paid.Add(po);
        }
        rows.PaidOnly.AddRange(paid.OrderBy(x => x.FirstPaidAt, StringComparer.Ordinal).ThenBy(x => x.Key, StringComparer.Ordinal));
        return rows;
    }

    /// <summary>
    /// 견주는 차트번호: 앞뒤 빈칸을 빼고, 숫자뿐이면 앞의 0을 뺀다("0012345" = "12345", 모두 0이면 "0").
    /// 구글 쪽 맞춤(Code.gs canon_)도 숫자처럼 생긴 차트번호를 같은 값으로 본다.
    /// </summary>
    public static string KeyOf(string? raw)
    {
        var k = (raw ?? "").Trim();
        if (k.Length > 1 && k.All(ch => ch >= '0' && ch <= '9'))
        {
            k = k.TrimStart('0');
            if (k.Length == 0) k = "0";
        }
        return k;
    }

    /// <summary>
    /// 비고(DESIGN 3절): 그날 내원 가운데 자동차보험이면 '자동차보험', 아니면 의료급여(보호)인데 건강생활유지비(비트 QCV)를 쓴 내원이 있으면
    /// '건강생활잔액'. 보험은 내원 계산(OrpInsCod)이 있으면 그것, 없으면 접수(OcmInsCod).
    /// </summary>
    public static string NoteOf(IEnumerable<DayVisit> visits, DayData data, ISet<int> carIns, ISet<int> aidIns)
    {
        var list = visits.ToList();
        int InsOf(DayVisit v) => data.Bills.TryGetValue(v.VisitId ?? "", out var b) && b != null && b.Insurance > 0 ? b.Insurance : v.Insurance;
        if (list.Any(v => carIns.Contains(InsOf(v)))) return NoteTexts.CarInsurance;
        foreach (var v in list)
        {
            if (!aidIns.Contains(InsOf(v))) continue;
            var id = v.VisitId ?? "";
            if (data.Payments.Any(p => p.Type == PaymentType.HealthFund && string.Equals(p.VisitId ?? "", id, StringComparison.Ordinal) && p.Cash + p.Card + p.Transfer > 0))
            {
                return NoteTexts.HealthFund;
            }
        }
        return "";
    }

    private static void Add(DayRows rows, Dictionary<string, List<(Kind, string, int, long)>> lines, string owner, Kind kind, decimal amount, DayPayment p)
    {
        if (amount < 0)
        {
            rows.IgnoredNegative++;
            return;
        }
        var won = (long)decimal.Truncate(amount);
        if (won <= 0) return;
        if (!lines.TryGetValue(owner, out var list)) lines[owner] = list = new List<(Kind, string, int, long)>();
        list.Add((kind, p.At ?? "", p.Seq, won));
    }

    /// <summary>FREE 때문에 뺀 돈(0원·음수는 시트에 들어간 적이 없으니 뺀다).</summary>
    private static void Dropped(List<(Kind, string, int, long)> list, Kind kind, decimal amount, DayPayment p)
    {
        if (amount <= 0) return;
        var won = (long)decimal.Truncate(amount);
        if (won > 0) list.Add((kind, p.At ?? "", p.Seq, won));
    }

    private static bool Earlier((string at, int seq) a, (string at, int seq) b)
    {
        var c = string.CompareOrdinal(a.at, b.at);
        return c < 0 || (c == 0 && a.seq < b.seq);
    }

    private static int SignOf(SignSettings s, Kind kind)
    {
        switch (kind)
        {
            case Kind.Cash: return s.Cash;
            case Kind.Card: return s.Card;
            case Kind.Transfer: return s.Transfer;
            case Kind.RCash: return s.ReceivableCash;
            case Kind.RCard: return s.ReceivableCard;
            default: return s.ReceivableTransfer;
        }
    }

    /// <summary>FREE 기본 규칙: 그 내원에 비트 할인 기록 FREE가 있고 진료수납 줄이 있다(받은 돈과 상관없음).</summary>
    public static bool IsDiscountFreeVisit(string visitId, DayData data)
    {
        var id = visitId ?? "";
        if (!data.Bills.TryGetValue(id, out var bill) || bill == null || !bill.DiscountFree) return false;
        return data.Payments.Any(p => p.Type == PaymentType.Receipt && string.Equals(p.VisitId ?? "", id, StringComparison.Ordinal));
    }

    /// <summary>
    /// 내원 하나가 (할인 기록 말고) 다른 FREE 규칙에 맞는가. 모든 규칙은 수납 줄(진료수납)이 있고, 미수 발생·건강생활유지비가 없을 때만 본다
    /// (아직 수납 전인 환자를 FREE로 넣지 않게). 받은 돈 0원은 부르는 쪽(돈 줄 없음)이 이미 확인했다.
    /// </summary>
    public static bool IsFreeVisit(DayVisit visit, DayData data, Settings settings)
    {
        var id = visit.VisitId ?? "";
        var mine = data.Payments.Where(p => string.Equals(p.VisitId ?? "", id, StringComparison.Ordinal)).ToList();
        if (!mine.Any(p => p.Type == PaymentType.Receipt)) return false;
        if (mine.Any(p => (p.Type == PaymentType.ReceivableCreated || p.Type == PaymentType.HealthFund) && p.Cash + p.Card + p.Transfer != 0)) return false;
        if (mine.Where(p => p.Type == PaymentType.Receipt).Sum(p => p.Cash + p.Card + p.Transfer) > 0) return false;
        if (!data.Bills.TryGetValue(id, out var bill) || bill == null) return false;

        switch (settings.Free)
        {
            case FreeRule.OwedNotPaid: return bill.Own > 0;
            case FreeRule.OwnZeroInsured: return bill.Own == 0 && bill.Total > 0 && (settings.FreeInsurance ?? new List<int>()).Contains(bill.Insurance);
            case FreeRule.OwnZeroAny: return bill.Own == 0;
            case FreeRule.TotalZero: return bill.Total == 0;
            case FreeRule.DiscountFree: return IsDiscountFreeVisit(id, data);
            default: return false;
        }
    }
}
