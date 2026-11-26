#nullable disable
// 비트시트 app/tests/Tests.cs(작업 트리 파일, 2026-11-25 판 7)를 도우미 Core 시험으로 옮김(spec google-link TASK-9, REQ-8510 AC-8510.1).
// 시험 몸통과 기대값은 그대로다. 바뀐 것: 작은 시험기([T]·Runner) → xunit [Fact], 이름공간 BitSheet.Core → Precheck.Core.Sheet,
// 원본 시험이 nullable 없이 쓰였으므로 이 파일은 #nullable disable.
// 옮기지 않은 것(다른 곳으로 감): AutoTests(저절로 넣기 계획 → 웹 lib/gsheet/plan.ts, TASK-8), 설정 파일 만들기·읽기 시험(SettingsFile → 읽기만 하는
// BitSheetImport, BitSheetImport.test.cs), WebTests(HTTP·답 → ISheetTransport·SheetReply, 오류는 번호로, SheetReply.test.cs),
// TokenTests(32자 영문·숫자 → 32바이트 base64url SheetCode, SheetCode.test.cs). 자료는 모두 가짜다.
using System;
using System.Collections.Generic;
using System.Linq;
using Precheck.Core.Sheet;
using Xunit;

namespace Precheck.Core.Tests.Sheet
{
    internal static class A
    {
        public static void Eq<T>(T expected, T actual, string what = "")
        {
            if (!EqualityComparer<T>.Default.Equals(expected, actual)) throw new Exception(what + " expected <" + expected + "> but was <" + actual + ">");
        }

        public static void True(bool cond, string what) { if (!cond) throw new Exception("expected true: " + what); }

        public static void Contains(string hay, string needle) { if (hay.IndexOf(needle, StringComparison.Ordinal) < 0) throw new Exception("missing <" + needle + "> in " + hay); }

        public static void NotContains(string hay, string needle) { if (hay.IndexOf(needle, StringComparison.Ordinal) >= 0) throw new Exception("unexpected <" + needle + "> in " + hay); }

        public static T Throws<T>(Action a) where T : Exception
        {
            try { a(); }
            catch (T e) { return e; }
            throw new Exception("expected " + typeof(T).Name);
        }
    }

    /// <summary>가짜 하루 만들기.</summary>

    internal sealed class Day
    {
        public readonly DayData Data = new DayData { Day = new DateTime(2026, 11, 23) };
        private int seq;

        public DayVisit Visit(string key, string time, string kind = "4", string dept = "OS", params string[] codes)
        {
            var v = new DayVisit { VisitId = "V" + (++seq), Key = key, Name = "가짜" + key, AcceptedAt = "20261123" + time, Dept = dept, VisitKind = kind };
            foreach (var c in codes) v.Codes.Add(c);
            Data.Visits.Add(v);
            return v;
        }

        public DayPayment Pay(DayVisit v, PaymentType type, decimal cash = 0, decimal card = 0, decimal transfer = 0, string time = "1000", string key = null)
        {
            var p = new DayPayment { VisitId = v?.VisitId ?? "OLD", Key = key ?? v?.Key ?? "", Type = type, Cash = cash, Card = card, Transfer = transfer, At = "20261123" + time, Seq = ++seq };
            Data.Payments.Add(p);
            return p;
        }

        public void Bill(DayVisit v, decimal own, decimal total = 10000, int insurance = 31, bool discountFree = false)
        {
            Data.Bills[v.VisitId] = new DayBill { VisitId = v.VisitId, Own = own, Total = total, Insurance = insurance, DiscountFree = discountFree };
        }

        public DayRows Build(Settings s = null) => RowBuilder.Build(Data, s ?? new Settings());
    }

    public class RowTests
    {
        private static Dictionary<string, object> Cells(PatientRow p, Settings s = null) => (Dictionary<string, object>)SheetPayload.Patient(p, s ?? new Settings())["cells"];

        private static List<object> More(PatientRow p, Settings s = null) => (List<object>)SheetPayload.Patient(p, s ?? new Settings())["more"];

        [Fact(DisplayName = "AC-8510.1 비트시트 RowTests.SplitPaymentInOneReceiptGivesTwoLines")]
        public static void SplitPaymentInOneReceiptGivesTwoLines()
        {
            var d = new Day();
            var v = d.Visit("100", "0910");
            d.Pay(v, PaymentType.Receipt, cash: 5000, card: 10000);
            var p = d.Build().Patients.Single();
            A.Eq(2, p.Money.Count, "lines");
            A.Eq(1, p.Money[0].Sign); A.Eq(5000L, p.Money[0].Amount);
            A.Eq(2, p.Money[1].Sign); A.Eq(10000L, p.Money[1].Amount);
            var cells = Cells(p);
            A.Eq<object>(1, cells["D"]); A.Eq<object>(5000L, cells["F"]);
            var more = More(p);
            A.Eq(1, more.Count, "more");
            var m = (Dictionary<string, object>)more[0];
            A.Eq<object>(2, m["D"]); A.Eq<object>(10000L, m["F"]);
            A.Eq<object>("가짜100", m["C"], "continuation line carries the name (판 7)");
            A.True(!m.ContainsKey("B"), "no chart number on continuation lines (COUNT(B) stays right)");
            A.Eq(3, m.Count, "more has only C,D,F");
        }

        [Fact(DisplayName = "AC-8510.1 비트시트 RowTests.TwoCardReceiptsGiveTwoCardLinesInTimeOrder")]
        public static void TwoCardReceiptsGiveTwoCardLinesInTimeOrder()
        {
            var d = new Day();
            var v = d.Visit("100", "0910");
            d.Pay(v, PaymentType.Receipt, card: 7000, time: "1130");
            d.Pay(v, PaymentType.Receipt, card: 3000, time: "1015");
            var p = d.Build().Patients.Single();
            A.Eq(2, p.Money.Count);
            A.Eq(3000L, p.Money[0].Amount, "earlier first");
            A.Eq(7000L, p.Money[1].Amount);
            A.Eq(1, DayStats.Of(d.Build()).SplitPatients, "split count");
        }

        [Fact(DisplayName = "AC-8510.1 비트시트 RowTests.ReceivablePaidMapsToSigns3And4AndConfiguredTransfer")]
        public static void ReceivablePaidMapsToSigns3And4AndConfiguredTransfer()
        {
            var d = new Day();
            var v = d.Visit("200", "0900");
            d.Pay(v, PaymentType.Receipt, card: 12000);
            // 미수입금은 예전 내원 번호에 붙어 있다 → 차트번호로 붙인다
            d.Pay(null, PaymentType.ReceivablePaid, cash: 3000, card: 4000, transfer: 2000, key: "200");
            var s = new Settings();
            s.Signs.ReceivableTransfer = 7;
            var p = d.Build(s).Patients.Single();
            A.Eq("2,3,4,7", string.Join(",", p.Money.Select(m => m.Sign)), "signs");
            A.Eq("12000,3000,4000,2000", string.Join(",", p.Money.Select(m => m.Amount)), "amounts");
            A.Eq("2,3,4,5", string.Join(",", d.Build().Patients.Single().Money.Select(m => m.Sign)), "default receivable transfer = 5");
        }

        [Fact(DisplayName = "AC-8510.1 비트시트 RowTests.ReceivableOnlyPayerWithoutNameIsNotAdded")]
        public static void ReceivableOnlyPayerWithoutNameIsNotAdded()
        {
            var d = new Day();
            d.Visit("300", "0900");
            d.Pay(null, PaymentType.ReceivablePaid, cash: 5000, key: "999");
            var rows = d.Build();
            A.Eq(1, rows.Patients.Count);
            A.Eq(1, rows.ReceivableOnly, "name unknown → counted, not added");
            A.Eq(0, rows.PaidOnly.Count);
        }

        [Fact(DisplayName = "AC-8510.1 비트시트 RowTests.FreeWhenOwedButZeroReceivedAndNoReceivable")]
        public static void FreeWhenOwedButZeroReceivedAndNoReceivable()
        {
            var d = new Day();
            var v = d.Visit("400", "0900");
            d.Pay(v, PaymentType.Receipt);
            d.Bill(v, own: 1500, insurance: 51);
            var owed = new Settings { Free = FreeRule.OwedNotPaid };
            var p = d.Build(owed).Patients.Single();
            A.True(p.IsFree, "free");
            A.Eq(1, p.Money.Count);
            A.Eq(6, p.Money[0].Sign); A.Eq(0L, p.Money[0].Amount);
            var cells = Cells(p);
            A.Eq<object>(6, cells["D"]); A.Eq<object>(0L, cells["F"]);
            A.Eq(1, DayStats.Of(d.Build(owed)).Free);
            A.True(!d.Build().Patients.Single().IsFree, "default rule needs the discount record");
        }

        [Fact(DisplayName = "AC-8510.1 비트시트 RowTests.NotFreeWhenReceivableCreatedOrHealthFundOrNotYetPaid")]
        public static void NotFreeWhenReceivableCreatedOrHealthFundOrNotYetPaid()
        {
            var coo = new Day();
            var v1 = coo.Visit("401", "0900");
            coo.Pay(v1, PaymentType.Receipt);
            coo.Pay(v1, PaymentType.ReceivableCreated, cash: 1500);
            coo.Bill(v1, own: 1500);
            var owed = new Settings { Free = FreeRule.OwedNotPaid };
            var p1 = coo.Build(owed).Patients.Single();
            A.True(!p1.IsFree && p1.Money.Count == 0, "COO → empty D/F");
            A.Eq<object>("", Cells(p1)["D"]); A.Eq<object>("", Cells(p1)["F"]);

            var qcv = new Day();
            var v2 = qcv.Visit("402", "0900");
            qcv.Pay(v2, PaymentType.Receipt);
            qcv.Pay(v2, PaymentType.HealthFund, cash: 1000);
            qcv.Bill(v2, own: 1000, insurance: 51);
            A.True(!qcv.Build(owed).Patients.Single().IsFree, "QCV paid → not free");

            var notYet = new Day();
            var v3 = notYet.Visit("403", "0900");
            notYet.Bill(v3, own: 3000);
            A.True(!notYet.Build(owed).Patients.Single().IsFree, "no receipt row yet → not free");
        }

        [Fact(DisplayName = "AC-8510.1 비트시트 RowTests.FreeRuleOptions")]
        public static void FreeRuleOptions()
        {
            var d = new Day();
            var nhi = d.Visit("500", "0900");
            d.Pay(nhi, PaymentType.Receipt);
            d.Bill(nhi, own: 0, total: 50000, insurance: 31);
            var car = d.Visit("501", "0901");
            d.Pay(car, PaymentType.Receipt);
            d.Bill(car, own: 0, total: 50000, insurance: 21);
            var zero = d.Visit("502", "0902");
            d.Pay(zero, PaymentType.Receipt);
            d.Bill(zero, own: 0, total: 0, insurance: 31);
            var disc = d.Visit("503", "0903");
            d.Pay(disc, PaymentType.Receipt, card: 8000);
            d.Bill(disc, own: 8000, discountFree: true);
            var disc0 = d.Visit("504", "0904");
            d.Pay(disc0, PaymentType.Receipt);
            d.Bill(disc0, own: 8000, discountFree: true);

            string Free(FreeRule rule) => string.Join(",", d.Build(new Settings { Free = rule }).Patients.Where(p => p.IsFree).Select(p => p.Key));
            A.Eq("504", Free(FreeRule.OwedNotPaid), "owed not paid");
            A.Eq("500", Free(FreeRule.OwnZeroInsured), "NHI own 0");
            A.Eq("500,501,502", Free(FreeRule.OwnZeroAny), "own 0 any");
            A.Eq("502", Free(FreeRule.TotalZero), "total 0");
            A.Eq("503,504", Free(FreeRule.DiscountFree), "discount FREE → free whatever was paid");
            A.Eq(FreeRule.DiscountFree, new Settings().Free, "default rule");
            A.Eq("", Free(FreeRule.None), "none");
        }

        [Fact(DisplayName = "AC-8510.1 비트시트 RowTests.NoMoneyLeavesSignAndAmountEmpty")]
        public static void NoMoneyLeavesSignAndAmountEmpty()
        {
            var d = new Day();
            d.Visit("600", "0900");
            var p = d.Build().Patients.Single();
            A.Eq(0, p.Money.Count);
            var cells = Cells(p);
            A.Eq<object>("", cells["D"]); A.Eq<object>("", cells["F"]);
            A.Eq(0, More(p).Count);
            A.Eq(1, DayStats.Of(d.Build()).NoMoney);
        }

        [Fact(DisplayName = "AC-8510.1 비트시트 RowTests.SamePatientTwiceIsOneRowWithFlagsOredAndMoneyJoined")]
        public static void SamePatientTwiceIsOneRowWithFlagsOredAndMoneyJoined()
        {
            var d = new Day();
            var a = d.Visit("700", "1400", kind: "4", dept: "OS2", "LA358");
            var b = d.Visit("700", "0930", kind: "1", dept: "OS", "MM085");
            d.Pay(a, PaymentType.Receipt, card: 20000, time: "1420");
            d.Pay(b, PaymentType.Receipt, cash: 3000, time: "0950");
            var s = new Settings { BlockCodes = { "LA358" }, TherapyCodes = { "MM085" }, DeptRooms = new Dictionary<string, int> { { "OS", 1 }, { "OS2", 2 } } };
            var rows = d.Build(s);
            A.Eq(1, rows.Patients.Count, "one patient");
            var p = rows.Patients[0];
            A.Eq("202611230930", p.FirstAcceptedAt, "earliest visit");
            A.Eq<int?>(1, p.Room, "room from first visit (OS)");
            A.True(p.First && p.Block && p.Therapy && !p.Day90, "flags ORed");
            A.Eq("1:3000,2:20000", string.Join(",", p.Money.Select(m => m.Sign + ":" + m.Amount)), "money from both visits");
            A.Eq(2, rows.Visits);
        }

        [Fact(DisplayName = "AC-8510.1 비트시트 RowTests.FlagsFromCodesAndVisitKinds")]
        public static void FlagsFromCodesAndVisitKinds()
        {
            var d = new Day();
            d.Visit("801", "0900", kind: "1");
            d.Visit("802", "0901", kind: "3");
            d.Visit("803", "0902", kind: "4", "os", "la272");
            d.Visit("804", "0903", kind: "4", "OS", "MM015");
            d.Visit("805", "0904", kind: "2");
            var s = new Settings { BlockCodes = { "LA272" }, TherapyCodes = { "MM015" } };
            var rows = d.Build(s);
            string Flags(PatientRow p) => (p.First ? "J" : "") + (p.Day90 ? "K" : "") + (p.Block ? "L" : "") + (p.Therapy ? "M" : "");
            A.Eq("J,K,L,M,", string.Join(",", rows.Patients.Select(Flags)), "flags");
            s.FirstVisitKinds.Add("2");
            A.Eq("J", Flags(d.Build(s).Patients.Last()), "2 과초진 when chosen");
            var cells = Cells(rows.Patients[2], s);
            A.Eq<object>("", cells["J"]); A.Eq<object>("", cells["K"]); A.Eq<object>(0L, cells["L"]); A.Eq<object>("", cells["M"]);
        }

        [Fact(DisplayName = "AC-8510.1 비트시트 RowTests.DepartmentMapping")]
        public static void DepartmentMapping()
        {
            var d = new Day();
            d.Visit("901", "0900", dept: "OS");
            d.Visit("902", "0901", dept: "OS2");
            d.Visit("903", "0902", dept: "PT");
            A.Eq(",,", string.Join(",", d.Build().Patients.Select(p => p.Room?.ToString() ?? "")), "no factory mapping any more (auto-numbered per clinic)");
            var os = new Settings { DeptRooms = new Dictionary<string, int> { { "OS", 1 }, { "os2", 2 } } };
            var rows = d.Build(os);
            A.Eq("1,2,", string.Join(",", rows.Patients.Select(p => p.Room?.ToString() ?? "")), "OS→1, OS2→2 (case-insensitive), other blank");
            A.Eq<object>(2, Cells(rows.Patients[1])["I"]);
            A.Eq<object>("", Cells(rows.Patients[2])["I"]);
            var s = new Settings { DeptRooms = new Dictionary<string, int> { { "PT", 4 } } };
            A.Eq(",,4", string.Join(",", d.Build(s).Patients.Select(p => p.Room?.ToString() ?? "")), "custom mapping");
            var ten = new Settings { DeptRooms = new Dictionary<string, int> { { "OS", 10 }, { "PT", 11 } } };
            A.Eq("10,,", string.Join(",", d.Build(ten).Patients.Select(p => p.Room?.ToString() ?? "")), "rooms 1~10, 11 ignored");
        }

        [Fact(DisplayName = "AC-8510.1 비트시트 RowTests.MarkValue")]
        public static void MarkValue()
        {
            var d = new Day();
            d.Visit("1000", "0900", kind: "1");
            var p = d.Build().Patients.Single();
            A.Eq<object>(0L, Cells(p)["J"], "default mark is number 0");
            A.Eq<object>(true, Cells(p, new Settings { MarkValue = "TRUE" })["J"]);
            A.Eq<object>(1L, Cells(p, new Settings { MarkValue = "1" })["J"]);
            A.Eq<object>("O", Cells(p, new Settings { MarkValue = "O" })["J"]);
            A.Contains(SheetPayload.ToJson(Cells(p)), "\"J\":0");
        }

        [Fact(DisplayName = "AC-8510.1 비트시트 RowTests.PatientsInAcceptOrderAndMoneyInPaymentTimeOrder")]
        public static void PatientsInAcceptOrderAndMoneyInPaymentTimeOrder()
        {
            var d = new Day();
            var late = d.Visit("1102", "1530");
            var early = d.Visit("1101", "0815");
            d.Visit("1103", "1200");
            d.Pay(late, PaymentType.Receipt, card: 1000, transfer: 500, cash: 200, time: "1600");
            d.Pay(null, PaymentType.ReceivablePaid, card: 300, cash: 100, key: "1102", time: "1540");
            d.Pay(early, PaymentType.Receipt, cash: 1, time: "0820");
            var rows = d.Build();
            A.Eq("1101,1103,1102", string.Join(",", rows.Patients.Select(p => p.Key)), "accept order");
            A.Eq("3,4,1,2,5", string.Join(",", rows.Patients[2].Money.Select(m => m.Sign)), "time first, then kind inside one receipt");
        }

        [Fact(DisplayName = "AC-8510.1 비트시트 RowTests.LatePaymentAlwaysGoesLastEvenIfItsKindSortsFirst")]
        public static void LatePaymentAlwaysGoesLastEvenIfItsKindSortsFirst()
        {
            // 검토 1: 미수를 먼저 내고(09:30) 오늘 진료비 현금을 나중에(10:00) 내면 현금이 뒤에 온다
            var d = new Day();
            var v = d.Visit("1150", "0900");
            d.Pay(null, PaymentType.ReceivablePaid, cash: 30000, key: "1150", time: "0930");
            d.Pay(v, PaymentType.Receipt, cash: 15000, time: "1000");
            A.Eq("3:30000,1:15000", string.Join(",", d.Build().Patients.Single().Money.Select(m => m.Sign + ":" + m.Amount)), "time order");
            // 같은 분이면 순번 차례
            var e = new Day();
            var w = e.Visit("1151", "0900");
            e.Pay(w, PaymentType.Receipt, card: 7000, time: "1000");
            e.Pay(w, PaymentType.Receipt, cash: 2000, time: "1000");
            A.Eq("2:7000,1:2000", string.Join(",", e.Build().Patients.Single().Money.Select(m => m.Sign + ":" + m.Amount)), "seq order");
        }

        [Fact(DisplayName = "AC-8510.1 비트시트 RowTests.DiscountFreeDropsReceiptLinesButKeepsReceivablePaid")]
        public static void DiscountFreeDropsReceiptLinesButKeepsReceivablePaid()
        {
            var d = new Day();
            var v = d.Visit("1160", "0900");
            d.Pay(v, PaymentType.Receipt, cash: 8000, card: 2000, time: "0950");
            d.Pay(null, PaymentType.ReceivablePaid, cash: 3000, key: "1160", time: "0940");
            d.Bill(v, own: 10000, discountFree: true);
            var rows = d.Build();
            var p = rows.Patients.Single();
            A.True(p.IsFree, "free");
            A.Eq("3:3000,6:0", string.Join(",", p.Money.Select(m => m.Sign + ":" + m.Amount)), "COR stays, RCV → one FREE line at its time");
            var cells = Cells(p);
            A.Eq<object>(3, cells["D"]); A.Eq<object>(3000L, cells["F"]);
            var more = (Dictionary<string, object>)More(p).Single();
            A.Eq<object>(6, more["D"]); A.Eq<object>(0L, more["F"]);
            var st = DayStats.Of(rows);
            A.Eq(1, st.Free, "free count"); A.Eq(1, st.MoneyLines, "FREE line is not a money line"); A.Eq(0, st.SplitPatients, "not split");
            A.Eq("1:8000,2:2000", string.Join(",", p.FreeDropped.Select(m => m.Sign + ":" + m.Amount)), "dropped receipt pairs (COR not dropped)");
        }

        [Fact(DisplayName = "AC-8510.1 비트시트 RowTests.LateDiscountSendsDroppedPairsSoGoogleCanSwapThem")]
        public static void LateDiscountSendsDroppedPairsSoGoogleCanSwapThem()
        {
            // 5분마다 넣기: 할인 기록이 붙기 전에는 현금 줄, free 없음
            var d = new Day();
            var v = d.Visit("1190", "0900");
            d.Pay(v, PaymentType.Receipt, cash: 15000, time: "0910");
            d.Bill(v, own: 15000);
            var s = new Settings { TemplateUrl = "t" };
            var before = SheetPayload.Write(d.Build(s), s, "tok", SheetPayload.FillEmpty, "h");
            var p0 = (Dictionary<string, object>)((List<object>)before["patients"]).Single();
            A.True(!p0.ContainsKey("free"), "no free before the discount");
            A.Contains(SheetPayload.ToJson(before), "\"D\":1,\"F\":15000");

            // 몇 시간 뒤 할인 기록 FREE가 붙음: FREE 한 줄만, 뺀 현금 짝을 free.dropped로
            d.Bill(v, own: 15000, discountFree: true);
            var rows = d.Build(s);
            A.Eq("6:0", string.Join(",", rows.Patients.Single().Money.Select(m => m.Sign + ":" + m.Amount)), "one FREE line, no cash");
            var after = SheetPayload.Write(rows, s, "tok", SheetPayload.FillEmpty, "h");
            var json = SheetPayload.ToJson(after);
            A.Contains(json, "\"free\":{\"cells\":{\"D\":6,\"F\":0},\"dropped\":[{\"D\":1,\"F\":15000}]}");
            A.True(SheetPayload.Fingerprint(before) != SheetPayload.Fingerprint(after), "changed → sent again");
            // 다시 만들어도 같은 요청(같으면 저절로 넣기가 다시 보내지 않는다)
            A.Eq(json, SheetPayload.ToJson(SheetPayload.Write(d.Build(s), s, "tok", SheetPayload.FillEmpty, "h")), "stable");

            // 바꾼 기호 번호를 따른다
            var signs = new Settings { TemplateUrl = "t" };
            signs.Signs.Cash = 7; signs.Signs.Free = 9;
            A.Contains(SheetPayload.ToJson(SheetPayload.Write(d.Build(signs), signs, "tok", SheetPayload.FillEmpty, "h")),
                "\"free\":{\"cells\":{\"D\":9,\"F\":0},\"dropped\":[{\"D\":7,\"F\":15000}]}");
            // 다른 FREE 규칙이나 FREE 안 씀이면 free를 보내지 않는다
            foreach (var rule in new[] { FreeRule.None, FreeRule.OwedNotPaid })
            {
                var o = new Settings { TemplateUrl = "t", Free = rule };
                A.NotContains(SheetPayload.ToJson(SheetPayload.Write(d.Build(o), o, "tok", SheetPayload.FillEmpty, "h")), "\"free\"");
            }
        }

        [Fact(DisplayName = "AC-8510.1 비트시트 RowTests.DiscountFreeOnlyForThatVisitAndOnlyAfterReceipt")]
        public static void DiscountFreeOnlyForThatVisitAndOnlyAfterReceipt()
        {
            var d = new Day();
            var a = d.Visit("1170", "0900");
            var b = d.Visit("1170", "1400");
            d.Pay(a, PaymentType.Receipt, cash: 5000, time: "0910");
            d.Pay(b, PaymentType.Receipt, card: 9000, time: "1410");
            d.Bill(a, own: 5000, discountFree: true);
            d.Bill(b, own: 9000);
            A.Eq("6:0,2:9000", string.Join(",", d.Build().Patients.Single().Money.Select(m => m.Sign + ":" + m.Amount)), "other visit's money stays");

            var notYet = new Day();
            var c = notYet.Visit("1171", "0900");
            notYet.Bill(c, own: 5000, discountFree: true);
            var p = notYet.Build().Patients.Single();
            A.True(!p.IsFree && p.Money.Count == 0, "no receipt yet → not FREE yet");
            A.True(!RowBuilder.IsDiscountFreeVisit(c.VisitId, notYet.Data), "helper agrees");

            var other = new Day();
            var e = other.Visit("1172", "0900");
            other.Pay(e, PaymentType.Receipt, cash: 5000);
            other.Bill(e, own: 5000, discountFree: true);
            A.Eq("1:5000", string.Join(",", other.Build(new Settings { Free = FreeRule.None }).Patients.Single().Money.Select(m => m.Sign + ":" + m.Amount)), "rule off → money as is");
        }

        [Fact(DisplayName = "AC-8510.1 비트시트 RowTests.CancelledCheckInsWithoutLiveVisit")]
        public static void CancelledCheckInsWithoutLiveVisit()
        {
            var d = new Day();
            d.Visit("1180", "0900");
            d.Data.Cancelled.Add(new DayVisit { Key = "1180", Name = "가짜1180" }); // 같은 날 살아 있는 내원이 있음 → 뺌
            d.Data.Cancelled.Add(new DayVisit { Key = "1181", Name = "가짜1181" });
            d.Data.Cancelled.Add(new DayVisit { Key = " 1181 ", Name = "가짜1181" }); // 두 번 취소
            d.Data.Cancelled.Add(new DayVisit { Key = "", Name = "x" });
            d.Data.Cancelled.Add(new DayVisit { Key = "0099", Name = "가짜0099" });
            var rows = d.Build();
            A.Eq("0099,1181", string.Join(",", rows.Cancelled.Select(c => c.Key)), "cancelled keys");
            A.Eq(2, DayStats.Of(rows).Cancelled, "count");
            var req = SheetPayload.Write(rows, new Settings { TemplateUrl = "t" }, "tok", SheetPayload.FillEmpty, "h");
            var list = (List<object>)req["cancelled"];
            A.Eq(2, list.Count, "sent");
            var json = SheetPayload.ToJson(req);
            A.Contains(json, "\"cancelled\":[{\"key\":\"0099\",\"cells\":{\"B\":\"0099\",\"C\":\"가짜0099\"}},{\"key\":\"1181\",\"cells\":{\"B\":1181,\"C\":\"가짜1181\"}}]");
        }

        [Fact(DisplayName = "AC-8510.1 비트시트 RowTests.ZeroNegativeAndFractionsAndUnlinked")]
        public static void ZeroNegativeAndFractionsAndUnlinked()
        {
            var d = new Day();
            var v = d.Visit("1200", "0900");
            d.Pay(v, PaymentType.Receipt, cash: 0, card: 9999.9m, transfer: -100);
            d.Pay(new DayVisit { VisitId = "CANCELLED", Key = "1200" }, PaymentType.Receipt, cash: 5000);
            d.Pay(v, PaymentType.Other, cash: 777);
            var rows = d.Build();
            var p = rows.Patients.Single();
            A.Eq("2:9999", string.Join(",", p.Money.Select(m => m.Sign + ":" + m.Amount)), "zero skipped, won truncated, negative skipped");
            A.Eq(1, rows.IgnoredNegative);
            A.Eq(1, rows.UnlinkedReceipts);
        }

        [Fact(DisplayName = "AC-8510.1 비트시트 RowTests.EmptyKeyVisitIsSkipped")]
        public static void EmptyKeyVisitIsSkipped()
        {
            var d = new Day();
            d.Visit("", "0900");
            d.Visit("1300", "0901");
            var rows = d.Build();
            A.Eq(1, rows.Patients.Count);
            A.Eq(1, rows.NoKeyVisits);
        }
    }

    public class PayloadTests
    {
        [Fact(DisplayName = "AC-8510.1 비트시트 PayloadTests.JsonTyping")]
        public static void JsonTyping()
        {
            var d = new Day();
            var v = d.Visit("12345", "0900", kind: "1", "OS");
            d.Pay(v, PaymentType.Receipt, card: 15000);
            d.Visit("01234", "0901");
            d.Visit("A12", "0902");
            var js = new Settings { TemplateUrl = "x", DeptRooms = new Dictionary<string, int> { { "OS", 1 } } };
            var json = SheetPayload.ToJson(SheetPayload.Write(d.Build(js), js, "tok", SheetPayload.FillEmpty, "병원"));
            A.Contains(json, "\"key\":\"12345\"");
            A.Contains(json, "\"B\":12345,");
            A.Contains(json, "\"D\":2,");
            A.Contains(json, "\"F\":15000,");
            A.Contains(json, "\"I\":1,");
            A.Contains(json, "\"J\":0,");
            A.Contains(json, "\"key\":\"01234\"");
            A.Contains(json, "\"B\":\"01234\"");
            A.Contains(json, "\"B\":\"A12\"");
            A.Contains(json, "\"K\":\"\"");
            A.NotContains(json, "\"D\":\"2\"");
            A.NotContains(json, "\"key\":12345");
            A.Eq<object>(0L, SheetPayload.KeyCell("0"));
            A.Eq<object>("1234567890123456", SheetPayload.KeyCell("1234567890123456"));
        }

        [Fact(DisplayName = "AC-8510.1 비트시트 PayloadTests.RequestShape")]
        public static void RequestShape()
        {
            var d = new Day();
            d.Visit("1", "0900");
            var s = new Settings
            {
                TemplateUrl = "https://docs.google.com/spreadsheets/d/TEMPLATEid_123/edit#gid=0",
                FolderUrl = "https://drive.google.com/drive/folders/FOLDERid-9",
                ShareWith = { "a@example.com" },
            };
            var req = SheetPayload.Write(d.Build(), s, "tok", SheetPayload.Overwrite, "가짜의원");
            A.Eq<object>("write", req["action"]);
            A.Eq<object>("overwrite", req["mode"]);
            A.Eq<object>("23", req["sheetName"]);
            var month = (Dictionary<string, object>)req["month"];
            A.Eq<object>("TEMPLATEid_123", month["templateId"]);
            A.Eq<object>("FOLDERid-9", month["folderId"]);
            A.Eq<object>("가짜의원 일일수납일지 2026년 11월", month["fileName"]);
            var layout = (Dictionary<string, object>)req["layout"];
            A.Eq("B,C,D,F,I,J,K,L,M", string.Join(",", (List<object>)layout["ownedCols"]));
            A.Eq("D,F", string.Join(",", (List<object>)layout["moneyCols"]));
            A.Eq("G,O", string.Join(",", (List<object>)layout["staffCols"]), "staff columns");
            A.Eq<object>(true, layout["nameOnMore"], "판 7: names on continuation lines");
            A.Eq<object>("G", layout["noteCol"], "note column");
            A.Eq("자동차보험,건강생활잔액", string.Join(",", (List<object>)layout["noteTexts"]), "program note texts");
            A.Eq(0, ((List<object>)req["paidOnly"]).Count, "no receivable-only rows");
            A.True(!((List<object>)layout["ownedCols"]).Contains("G"), "note column is not owned");
            A.Eq<object>("A:P", layout["shiftCols"], "shift columns");
            A.Eq(0, ((List<object>)req["cancelled"]).Count, "no cancelled");
            A.Eq<object>(17, layout["firstRow"]); A.Eq<object>(302, layout["lastRow"]);
            A.Eq<object>("B", layout["keyCol"]); A.Eq<object>("C", layout["nameCol"]);
            A.Eq("H-01-26-1-2026", SheetPayload.FileName("{병원}-{mm}-{yy}-{m}-{yyyy}", "H", new DateTime(2026, 1, 5)), "pattern pieces");
            A.Eq("", GoogleIds.Folder(""));
            A.Eq("https://example.com/odd", GoogleIds.Spreadsheet("https://example.com/odd"), "unknown shape passes through");
        }

        [Fact(DisplayName = "AC-8510.1 비트시트 PayloadTests.FingerprintIgnoresTokenAndModeButNotContent")]
        public static void FingerprintIgnoresTokenAndModeButNotContent()
        {
            var d = new Day();
            var v = d.Visit("1", "0900");
            d.Pay(v, PaymentType.Receipt, cash: 1000);
            var s = new Settings { TemplateUrl = "t" };
            var h1 = SheetPayload.Fingerprint(SheetPayload.Write(d.Build(), s, "a", SheetPayload.FillEmpty, "h"));
            var h2 = SheetPayload.Fingerprint(SheetPayload.Write(d.Build(), s, "b", SheetPayload.Overwrite, "h"));
            A.Eq(h1, h2, "same content");
            d.Pay(v, PaymentType.Receipt, card: 1);
            var h3 = SheetPayload.Fingerprint(SheetPayload.Write(d.Build(), s, "a", SheetPayload.FillEmpty, "h"));
            A.True(h1 != h3, "changed content → new hash");
            A.Eq(64, h1.Length);
        }

        [Fact(DisplayName = "AC-8510.1 비트시트 PayloadTests.DryTextHasCountsOnly")]
        public static void DryTextHasCountsOnly()
        {
            var d = new Day();
            var v = d.Visit("55555", "0900", kind: "3");
            d.Pay(v, PaymentType.Receipt, cash: 1000, card: 2000);
            var text = DayStats.Of(d.Build()).ToText(d.Data.Day);
            A.Contains(text, "환자 1");
            A.Contains(text, "나눠 낸 환자 1");
            A.Contains(text, "90일초진 표시 1");
            A.Contains(text, "취소된 접수(그날 센 내원 없음) 0");
            A.Contains(text, "Block(주사) 표시 0");
            A.Contains(text, "비고: 자동차보험 0, 건강생활잔액 0");
            A.Contains(text, "내원 없이 미수만 낸 환자(이름 줄) 0");
            A.NotContains(text, "55555");
            A.NotContains(text, "가짜");
        }

        [Fact(DisplayName = "AC-8510.1 비트시트 PayloadTests.UncountedAndLogTextHaveCountsOnly")]
        public static void UncountedAndLogTextHaveCountsOnly()
        {
            var d = new Day();
            var v = d.Visit("56565", "0900");
            d.Pay(v, PaymentType.Receipt, cash: -100);
            d.Pay(new DayVisit { VisitId = "GONE", Key = "56565" }, PaymentType.Receipt, cash: 5000);
            d.Pay(null, PaymentType.ReceivablePaid, cash: 7000, key: "77777");
            var st = DayStats.Of(d.Build());
            A.Eq("넣지 않음: 이름을 모르는 미수만 낸 환자 1명 · 내원에 안 붙은 수납 1줄 · 0보다 작은 돈 1개", st.UncountedText());
            var log = st.ToLogText();
            A.Contains(log, "rcvOnly=1"); A.Contains(log, "unlinked=1"); A.Contains(log, "negative=1"); A.Contains(log, "cancelled=0");
            A.NotContains(log, "56565"); A.NotContains(log, "77777"); A.NotContains(log, "가짜");
            A.Eq("", new DayStats().UncountedText(), "nothing → empty");
        }

        [Fact(DisplayName = "AC-8510.1 비트시트 PayloadTests.WarningsFromReply")]
        public static void WarningsFromReply()
        {
            var ok = new WebAppReply { Version = WebAppClient.CodeVersion };
            A.Eq(0, RunNotes.Warnings(ok).Count, "clean");
            var w = RunNotes.Warnings(new WebAppReply { Version = WebAppClient.CodeVersion, CancelKept = 2, Skipped = 1, Full = true });
            A.Eq("취소된 접수 2명 — 시트에서 확인해 주세요", w[0]);
            A.Contains(w[1], "건너뛴 줄 1개");
            A.Contains(w[2], "빈 줄이 모자라");
            A.Contains(string.Join("|", RunNotes.Warnings(new WebAppReply())), "옛 판");
            A.Eq(0, RunNotes.Warnings(new WebAppReply { Version = WebAppClient.CodeVersion, FreeFixed = 2 }).Count, "FREE fixes are not a warning");
            // 지난 날 다시 넣기의 경고는 오늘 것을 지우지 않고 날짜를 붙여 따로
            var today = RunNotes.Warnings(new WebAppReply { Skipped = 1 });
            var earlier = RunNotes.Warnings(new WebAppReply { CancelKept = 3 });
            var both = RunNotes.Combine(today, earlier, new DateTime(2026, 11, 23));
            A.Eq(3, both.Count, "today 2 (skipped, old code) + earlier 1 (old code shown once)");
            A.Contains(both[0], "건너뛴 줄 1개");
            A.Eq("11월 23일 시트: 취소된 접수 3명 — 시트에서 확인해 주세요", both[2]);
            A.Eq(1, both.Count(x => x.Contains("옛 판")), "same text once");
            A.Eq(0, RunNotes.Combine(new List<string>(), null, DateTime.Today).Count, "nothing");
            A.Eq("취소된 접수 2명 · 건너뛴 줄 1개 — 시트에서 확인해 주세요 · 빈 줄이 모자라 다 넣지 못했어요", RunNotes.OneLine(w), "one line");
            A.Eq("취소된 접수 2명 — 시트에서 확인해 주세요", RunNotes.OneLine(new List<string> { w[0] }), "single kept as is");
        }

        [Fact(DisplayName = "AC-8510.1 비트시트 PayloadTests.ColumnValidation")]
        public static void ColumnValidation()
        {
            A.True(new ColumnSettings().IsValid(out _), "default valid");
            A.True(!new ColumnSettings { Name = "B" }.IsValid(out _), "duplicate");
            A.True(!new ColumnSettings { Name = "1" }.IsValid(out _), "not a letter");
            A.Eq("G", new ColumnSettings().Note, "note column default G");
            A.True(new ColumnSettings { Note = "" }.IsValid(out _), "note column may be off");
            A.True(!new ColumnSettings { Note = "D" }.IsValid(out _), "note column must not clash with an owned column");
            A.True(!new ColumnSettings { Note = "7" }.IsValid(out var why) && why.Contains("비고"), "note column letters");
        }
    }

    public class SettingsTests
    {
        [Fact(DisplayName = "AC-8510.1 비트시트 SettingsTests.MigrateSwitchesOldFreeDefaultOnce")]
        public static void MigrateSwitchesOldFreeDefaultOnce()
        {
            var old = new Settings { Version = 0, Free = FreeRule.OwedNotPaid };
            A.True(old.Migrate(), "migrated");
            A.Eq(FreeRule.DiscountFree, old.Free, "old default → new default");
            A.Eq(Settings.CurrentVersion, old.Version);
            var chosen = new Settings { Version = 0, Free = FreeRule.TotalZero };
            chosen.Migrate();
            A.Eq(FreeRule.TotalZero, chosen.Free, "other old choice kept");
            var now = new Settings { Version = Settings.CurrentVersion, Free = FreeRule.OwedNotPaid };
            A.True(!now.Migrate(), "no second switch");
            A.Eq(FreeRule.OwedNotPaid, now.Free, "user's choice in v2 kept");
        }

        [Fact(DisplayName = "AC-8510.1 비트시트 SettingsTests.ShiftColumnsDefaultOffAndValidation")]
        public static void ShiftColumnsDefaultOffAndValidation()
        {
            var s = new Settings();
            A.Eq("A:P", s.ShiftCols, "default");
            A.True(s.IsShiftValid("a : p", out _), "spaces and case");
            A.True(s.IsShiftValid("", out _), "empty = off");
            A.True(!s.IsShiftValid("A:F", out var p1) && p1.Contains("품어야"), "must cover owned and staff columns");
            A.True(!s.IsShiftValid("P:A", out _), "order");
            A.True(!s.IsShiftValid("A-P", out _), "shape");
            var off = new Settings { ShiftCols = "" };
            off.Normalize();
            A.Eq("", off.ShiftCols, "off stays off");
            var bad = new Settings { ShiftCols = "zz" };
            bad.Normalize();
            A.Eq("A:P", bad.ShiftCols, "broken → default");
            var low = new Settings { ShiftCols = " a:q " };
            low.Normalize();
            A.Eq("A:Q", low.ShiftCols, "normalized");
            var wide = new Settings { ShiftCols = "A:F" };
            wide.Columns.Therapy = "R";
            wide.Normalize();
            A.Eq("", wide.ShiftCols, "default cannot cover → off");
            var req = SheetPayload.Write(new DayRows(), off, "tok", SheetPayload.FillEmpty, "h");
            A.Eq<object>("", ((Dictionary<string, object>)req["layout"])["shiftCols"], "off sent as empty");
        }

        [Fact(DisplayName = "AC-8510.1 비트시트 SettingsTests.NormalizeFixesUnknownRuleAndStaffColumns")]
        public static void NormalizeFixesUnknownRuleAndStaffColumns()
        {
            var s = new Settings { Free = (FreeRule)7, StaffCols = new List<string> { " g ", "B", "O", "1", "G", "" } };
            s.Normalize();
            A.Eq(FreeRule.DiscountFree, s.Free, "unknown → default");
            A.Eq("G,O", string.Join(",", s.StaffCols), "cleaned, owned columns dropped");
        }
    }

    public class HospitalTests
    {
        private static HospitalOption H(string code, int visits, string name = "") => new HospitalOption { Code = code, Name = name, Visits = visits };

        [Fact(DisplayName = "AC-8510.1 비트시트 HospitalTests.OneHospitalIsPickedEvenWithoutVisits")]
        public static void OneHospitalIsPickedEvenWithoutVisits()
        {
            A.Eq("A", HospitalPick.Auto(new List<HospitalOption> { H("A", 0) })?.Code);
        }

        [Fact(DisplayName = "AC-8510.1 비트시트 HospitalTests.ManyHospitalsPickTheOnlyOneWithRecentVisits")]
        public static void ManyHospitalsPickTheOnlyOneWithRecentVisits()
        {
            A.Eq("B", HospitalPick.Auto(new List<HospitalOption> { H("A", 0), H("B", 812), H("C", 0) })?.Code);
        }

        [Fact(DisplayName = "AC-8510.1 비트시트 HospitalTests.ManyActiveOrNoneActiveAsksAPerson")]
        public static void ManyActiveOrNoneActiveAsksAPerson()
        {
            A.Eq(null, HospitalPick.Auto(new List<HospitalOption> { H("A", 5), H("B", 812) }));
            A.Eq(null, HospitalPick.Auto(new List<HospitalOption> { H("A", 0), H("B", 0) }));
            A.Eq(null, HospitalPick.Auto(new List<HospitalOption>()));
        }

        [Fact(DisplayName = "AC-8510.1 비트시트 HospitalTests.ChoicesShowBusiestFirstWithNameCountAndCode")]
        public static void ChoicesShowBusiestFirstWithNameCountAndCode()
        {
            var sorted = HospitalPick.Sorted(new[] { H("A", 3, "옛 병원"), H("B", 812, "우리 정형외과"), H("C", 0) });
            A.Eq("B", sorted[0].Code);
            A.Eq("우리 정형외과 · 최근 30일 환자 812명 (코드 B)", HospitalPick.Label(sorted[0]));
            A.Eq("이름 없는 병원 · 최근 30일 환자 0명 (코드 C)", HospitalPick.Label(sorted[2]));
        }
    }
}
