#nullable disable
// 비트시트 app/tests/Fix7Tests.cs(작업 트리 파일, 2026-11-25 판 7 고침)를 도우미 Core 시험으로 옮김(spec google-link TASK-9, REQ-8510 AC-8510.1).
// 시험 몸통과 기대값은 그대로다. 바뀐 것: [T] → xunit [Fact], 이름공간, 비트 읽기 허용 목록 BitSql·BitDb.Require → SheetSql·SheetSql.Require(도우미는 BitDb가 없고 IBitDb로 읽는다),
// 비율 식 답의 판 글자 "7" → WebAppClient.CodeVersion(도우미와 맞는 구글 코드는 8판이다. 시험 뜻 '같은 판이면 경고 그림이 아님'은 그대로). 자료는 모두 가짜다.
using System;
using System.Collections.Generic;
using System.Linq;
using Precheck.Core.Sheet;
using Xunit;

namespace Precheck.Core.Tests.Sheet
{
    public class Fix7Tests
    {
        private static Dictionary<string, object> D(object o) => (Dictionary<string, object>)o;

        // ── 1·7 미수만 낸 환자 줄 ───────────────────────────────────
        [Fact(DisplayName = "AC-8510.1 비트시트 Fix7Tests.DayWithOnlyReceivablePayersIsNotSkippedWhenResending")]
        public static void DayWithOnlyReceivablePayersIsNotSkippedWhenResending()
        {
            var d = new Day();
            d.Pay(null, PaymentType.ReceivablePaid, cash: 3000, time: "1000", key: "999").Name = "가짜미수";
            var rows = d.Build();
            A.Eq(0, rows.Patients.Count); A.Eq(0, rows.Cancelled.Count); A.Eq(1, rows.PaidOnly.Count);
            A.True(!rows.NothingToSend, "a day with only receivable-only payers is still sent (past-day re-send)");
            A.True(new Day().Build().NothingToSend, "an empty day is skipped");
        }

        [Fact(DisplayName = "AC-8510.1 비트시트 Fix7Tests.ReceivableOnlyPayerWithNameGetsNameRowInTimeOrder")]
        public static void ReceivableOnlyPayerWithNameGetsNameRowInTimeOrder()
        {
            var d = new Day();
            d.Visit("300", "0900");
            d.Visit("301", "1100");
            d.Pay(null, PaymentType.ReceivablePaid, cash: 3000, time: "1000", key: "999").Name = "가짜미수";
            d.Pay(null, PaymentType.ReceivablePaid, card: 2000, transfer: 500, time: "1005", key: "999").Name = "가짜미수";
            var rows = d.Build();
            A.Eq(2, rows.Patients.Count, "visit patients unchanged");
            A.Eq(0, rows.ReceivableOnly, "nothing dropped");
            var po = rows.PaidOnly.Single();
            A.Eq("3:3000,4:2000,5:500", string.Join(",", po.Money.Select(m => m.Sign + ":" + m.Amount)), "time order, 3 미수현금 · 4 미수카드 · 5 미수계좌");
            A.Eq(1, po.Before, "between the 09:00 and 11:00 patients");

            var req = SheetPayload.Write(rows, new Settings(), "tok", SheetPayload.FillEmpty, "가짜의원");
            var item = D(((List<object>)req["paidOnly"]).Single());
            var cells = D(item["cells"]);
            A.Eq("C,D,F", string.Join(",", cells.Keys), "name + money only, no chart number");
            A.Eq<object>("가짜미수", cells["C"]); A.Eq<object>(3, cells["D"]); A.Eq<object>(3000L, cells["F"]);
            var more = (List<object>)item["more"];
            A.Eq(2, more.Count);
            A.Eq<object>("가짜미수", D(more[0])["C"], "continuation lines carry the name");
            A.True(!D(more[0]).ContainsKey("B"), "no B on continuation lines");
            A.Eq<object>(1, item["before"]);
            A.True(!SheetPayload.ToJson(req).Contains("999"), "chart number of a receivable-only payer is never sent");

            var st = DayStats.Of(rows);
            A.Eq(1, st.PaidOnly); A.Eq(3, st.PaidOnlyLines);
            A.NotContains(st.ToText(d.Data.Day), "가짜"); A.NotContains(st.ToLogText(), "가짜");
        }

        [Fact(DisplayName = "AC-8510.1 비트시트 Fix7Tests.ReceivablePaidBeforeEveryVisitGoesFirstAndAfterGoesLast")]
        public static void ReceivablePaidBeforeEveryVisitGoesFirstAndAfterGoesLast()
        {
            var d = new Day();
            d.Visit("300", "0900");
            d.Pay(null, PaymentType.ReceivablePaid, cash: 1000, time: "0830", key: "41").Name = "가짜일찍";
            d.Pay(null, PaymentType.ReceivablePaid, cash: 1000, time: "1830", key: "42").Name = "가짜늦게";
            var rows = d.Build();
            A.Eq("가짜일찍:0,가짜늦게:1", string.Join(",", rows.PaidOnly.Select(p => p.Name + ":" + p.Before)));
        }

        // ── 2 같은 환자 맞춤(차트번호 모양) ──────────────────────────
        [Fact(DisplayName = "AC-8510.1 비트시트 Fix7Tests.ReceivablePaidMatchesVisitEvenWithLeadingZeros")]
        public static void ReceivablePaidMatchesVisitEvenWithLeadingZeros()
        {
            var d = new Day();
            var v = d.Visit("12345", "0900");
            d.Pay(v, PaymentType.Receipt, cash: 5000, time: "0910");
            d.Pay(null, PaymentType.ReceivablePaid, cash: 2000, time: "0911", key: "0012345").Name = "가짜12345";
            var rows = d.Build();
            A.Eq(1, rows.Patients.Count, "one patient, not a second name row");
            A.Eq(0, rows.PaidOnly.Count, "not a receivable-only row");
            A.Eq("1:5000,3:2000", string.Join(",", rows.Patients[0].Money.Select(m => m.Sign + ":" + m.Amount)));
            A.Eq<object>(12345L, D(SheetPayload.Patient(rows.Patients[0], new Settings())["cells"])["B"], "chart number from the visit");
            A.Eq("12345", RowBuilder.KeyOf(" 0012345 "));
            A.Eq("0", RowBuilder.KeyOf("000"));
            A.Eq("A0012", RowBuilder.KeyOf("A0012"), "letters keep their zeros");
        }

        // ── 3 비고 G ───────────────────────────────────────────────
        [Fact(DisplayName = "AC-8510.1 비트시트 Fix7Tests.NoteForCarInsuranceAndHealthFund")]
        public static void NoteForCarInsuranceAndHealthFund()
        {
            var d = new Day();
            var car = d.Visit("1", "0900");
            d.Bill(car, 0, 20000, insurance: 21);
            var carNoBill = d.Visit("2", "0901");
            carNoBill.Insurance = 22;
            var aid = d.Visit("3", "0902");
            d.Bill(aid, 1000, 20000, insurance: 51);
            d.Pay(aid, PaymentType.HealthFund, cash: 1000);
            var aidNoFund = d.Visit("4", "0903");
            d.Bill(aidNoFund, 0, 20000, insurance: 52);
            var plain = d.Visit("5", "0904");
            d.Bill(plain, 3000, 20000, insurance: 31);
            d.Pay(plain, PaymentType.HealthFund, cash: 1000);
            var rows = d.Build();
            A.Eq("자동차보험,자동차보험,건강생활잔액,,", string.Join(",", rows.Patients.Select(p => p.Note)));
            var req = SheetPayload.Patient(rows.Patients[0], new Settings());
            A.Eq<object>("자동차보험", req["note"]);
            A.True(!D(req["cells"]).ContainsKey("G"), "note is not an owned cell");
            var off = new Settings();
            off.Columns.Note = "";
            A.True(!SheetPayload.Patient(rows.Patients[0], off).ContainsKey("note"), "no note when the note column is off");
            var st = DayStats.Of(rows);
            A.Eq(2, st.CarNote); A.Eq(1, st.HealthFundNote);
        }

        [Fact(DisplayName = "AC-8510.1 비트시트 Fix7Tests.NoteColumnSettings")]
        public static void NoteColumnSettings()
        {
            var s = new Settings();
            s.Columns.Note = "b";
            s.Normalize();
            A.Eq("", s.Columns.Note, "clashing note column is turned off");
            var q = new Settings();
            q.Columns.Note = "Q";
            A.True(!q.IsShiftValid("A:P", out _), "shift must cover the note column");
            A.True(new Settings().IsShiftValid("A:P", out _), "default G inside A:P");
            A.Eq("21,22", string.Join(",", new Settings().CarInsurance));
            A.Eq("51,52", string.Join(",", new Settings().AidInsurance));
        }

        // ── 5 주사·물리치료 기본 ─────────────────────────────────────
        [Fact(DisplayName = "AC-8510.1 비트시트 Fix7Tests.DefaultBlockAndTherapyFromBitClasses")]
        public static void DefaultBlockAndTherapyFromBitClasses()
        {
            var d = new Day();
            var inj = d.Visit("1", "0900", "4", "OS", "LA221");
            inj.Injection = true;
            var pt = d.Visit("2", "0901", "4", "OS", "MM001");
            pt.Therapy = true;
            d.Visit("3", "0902", "4", "OS", "AA154");
            string Flags(PatientRow p) => (p.Block ? "L" : "") + (p.Therapy ? "M" : "");
            A.Eq("L,M,", string.Join(",", d.Build().Patients.Select(Flags)), "no codes chosen → any injection / any physical therapy");
            var chosen = new Settings { BlockCodes = { "KK010" }, TherapyCodes = { "MM999" } };
            A.Eq(",,", string.Join(",", d.Build(chosen).Patients.Select(Flags)), "chosen codes replace the default");
            var blank = new Settings { BlockCodes = { " " } };
            A.Eq("L,M,", string.Join(",", d.Build(blank).Patients.Select(Flags)), "blank entries do not count as chosen");
        }

        [Fact(DisplayName = "AC-8510.1 비트시트 Fix7Tests.OrderKindFromBitClassAndCodeDivision")]
        public static void OrderKindFromBitClassAndCodeDivision()
        {
            A.Eq(OrderKind.Injection, OrderKind.Of("04", "3"), "주사료 약");
            A.Eq(OrderKind.Injection, OrderKind.Of("0401", "1"), "주사료 행위");
            A.Eq(OrderKind.Injection, OrderKind.Of("05", ""), "마취료(신경차단술)");
            A.Eq("", OrderKind.Of("04", "8"), "재료(붕대) 뺌");
            A.Eq(OrderKind.Therapy, OrderKind.Of("06", "1"), "이학요법료");
            A.Eq("", OrderKind.Of("01", "1"));
            A.Eq("", OrderKind.Of(null, null));
            A.Eq("고른 처방 없음 → 주사 처방 전부 셈", OrderKind.RuleText(OrderKind.Injection, 0));
            A.Eq("고른 처방 없음 → 물리치료 처방 전부 셈", OrderKind.RuleText(OrderKind.Therapy, 0));
            A.Eq("고른 처방 3개만 셈", OrderKind.RuleText(OrderKind.Therapy, 3));
        }

        // ── 4 진료실 1~10, 저절로 번호 ──────────────────────────────
        private static DeptInfo Dept(string code, int visits, bool current = true) => new DeptInfo { Code = code, Name = "과" + code, Visits90 = visits, Current = current };

        [Fact(DisplayName = "AC-8510.1 비트시트 Fix7Tests.RoomPlanNumbersDepartmentsWithVisitsInCodeOrder")]
        public static void RoomPlanNumbersDepartmentsWithVisitsInCodeOrder()
        {
            var depts = new List<DeptInfo> { Dept("PT", 0), Dept("OS10", 3), Dept("OS2", 0, current: false), Dept("os", 50), Dept("IM", 7) };
            var plan = RoomPlan.Plan(depts, new Dictionary<string, int>(), confirmed: false);
            A.Eq("IM:1,OS10:3,os:2", string.Join(",", plan.OrderBy(p => p.Key, StringComparer.Ordinal).Select(p => p.Key + ":" + p.Value)), "IM, os, OS10 in natural order");
            A.Eq(null, RoomPlan.Plan(depts, new Dictionary<string, int>(), confirmed: true), "confirmed → keep");
            A.Eq(null, RoomPlan.Plan(depts, new Dictionary<string, int> { { "PT", 4 } }, confirmed: false), "a person's mapping is kept");
            var old = RoomPlan.Plan(depts, new Dictionary<string, int> { { "OS", 1 }, { "OS2", 2 } }, confirmed: false);
            A.True(old != null && old.Count == 3, "old factory default OS→1, OS2→2 is renumbered");
            var none = RoomPlan.Plan(new List<DeptInfo> { Dept("B", 0), Dept("A", 0), Dept("Z", 0, current: false) }, null, confirmed: false);
            A.Eq("A:1,B:2", string.Join(",", none.OrderBy(p => p.Key).Select(p => p.Key + ":" + p.Value)), "no visits → today's departments");
            var many = Enumerable.Range(1, 12).Select(i => Dept("D" + i, i)).ToList();
            var cap = RoomPlan.Plan(many, null, confirmed: false);
            A.Eq(10, cap.Count, "at most 10 rooms");
            A.Eq(10, cap["D10"]); A.True(!cap.ContainsKey("D11"), "11th left blank");
            A.Eq(null, RoomPlan.Plan(new List<DeptInfo>(), null, confirmed: false), "no departments → nothing");
            A.Eq("IM,os,OS10,PT,OS2", string.Join(",", RoomPlan.DisplayOrder(depts).Select(x => x.Code)), "display: with visits, today's, not used");
        }

        [Fact(DisplayName = "AC-8510.1 비트시트 Fix7Tests.AutoRoomsSavesOncePerHospital")]
        public static void AutoRoomsSavesOncePerHospital()
        {
            var s = new Settings();
            var depts = new List<DeptInfo> { Dept("GS", 20), Dept("OS", 10) };
            A.True(BitCatalog.AutoRooms(s, "H1", depts), "first time → numbered");
            A.Eq("GS:1,OS:2", string.Join(",", s.DeptRooms.OrderBy(p => p.Key).Select(p => p.Key + ":" + p.Value)));
            A.Eq("H1", s.DeptRoomsHospital);
            A.True(!BitCatalog.AutoRooms(s, "H1", depts), "same hospital → nothing");
            s.DeptRooms["GS"] = 7;
            A.True(BitCatalog.AutoRooms(s, "H2", depts), "other hospital → confirm");
            A.Eq(7, s.DeptRooms["GS"], "a person's numbers are kept when another hospital is chosen");
            A.True(!BitCatalog.AutoRooms(new Settings(), "H1", new List<DeptInfo>()), "no departments read → not confirmed");
        }

        [Fact(DisplayName = "AC-8510.1 비트시트 Fix7Tests.RoomNumbersOutsideOneToTenAreDroppedOnLoad")]
        public static void RoomNumbersOutsideOneToTenAreDroppedOnLoad()
        {
            var s = new Settings { DeptRooms = new Dictionary<string, int> { { "OS", 10 }, { "PT", 11 }, { "GS", 0 } } };
            s.Normalize();
            A.Eq("OS:10", string.Join(",", s.DeptRooms.Select(p => p.Key + ":" + p.Value)));
            A.Eq(0, new Settings().DeptRooms.Count, "no factory mapping");
        }

        // ── 6 처방 목록 불러오기 ────────────────────────────────────
        [Fact(DisplayName = "AC-8510.1 비트시트 Fix7Tests.CodeListNeverShowsASilentEmptyBox")]
        public static void CodeListNeverShowsASilentEmptyBox()
        {
            var st = new CodeListState();
            var changes = 0;
            st.Changed += () => changes++;
            A.True(st.NeedsLoad("C|"), "idle → load");
            A.Contains(st.Message, "불러오는 중");
            st.Start("C|");
            A.True(!st.NeedsLoad("C|"), "loading → do not start twice");
            A.Contains(st.Message, "불러오는 중");
            A.True(st.Fail("C|", "비트에서 읽다가 멈췄어요."), "fail");
            A.Contains(st.Message, "처방 목록을 불러오지 못했어요. 비트에서 읽다가 멈췄어요.");
            A.Contains(st.Message, "[다시 불러오기]");
            A.True(st.NeedsLoad("C|"), "failed → can load again");
            st.Start("C|");
            A.True(st.Done("C|", new List<CodeUsage>()), "empty result");
            A.Contains(st.Message, "최근 90일에 쓴 처방이 비트에 없어요");
            st.Start("C|");
            st.Done("C|", new List<CodeUsage> { new CodeUsage { Code = "LA221", Visits = 3, Kind = OrderKind.Injection } });
            A.Eq("", st.Message, "list shown");
            A.True(!st.NeedsLoad("c|"), "same hospital (case) → keep");
            A.True(st.NeedsLoad("C|H2"), "other hospital → load again");
            st.Start("C|H2");
            A.True(!st.Done("C|", new List<CodeUsage>()), "late result for the old hospital is thrown away");
            A.Eq(CodeListState.Phase.Loading, st.Now);
            A.Eq(7, changes, "every change is announced to open windows");
        }

        // ── 비율 식(J9:M9) 고치기 답 ────────────────────────────────
        [Fact(DisplayName = "AC-8510.1 비트시트 Fix7Tests.RatioFormulaReplyIsReadAndShownInPlainKorean")]
        public static void RatioFormulaReplyIsReadAndShownInPlainKorean()
        {
            var r = WebAppClient.Parse("{\"ok\":true,\"version\":\"" + WebAppClient.CodeVersion + "\",\"ratioFormulas\":{\"fixed\":128,\"skipped\":[\"23!J9\",\"23!K9\"],\"skippedCount\":2,\"failed\":false}}");
            A.Eq(128, r.RatioFixed); A.Eq(2, r.RatioSkipped); A.Eq("23!J9,23!K9", string.Join(",", r.RatioSkippedCells)); A.True(!r.RatioFailed, "not failed");
            var line = RunNotes.RatioLine(r);
            A.Contains(line, "비율 식(초진·90일초진·Block·물리치료 %) 128칸을 차트번호로 세게 고쳤어요");
            A.Contains(line, "이 칸들은 식 모양이 달라 그대로 두었어요: 23!J9, 23!K9 (2칸) — 비율이 조금 낮게 나올 수 있어요. 필요하면 원장님께 알려 주세요");
            A.NotContains(line, "COUNT");
            A.Eq("", RunNotes.RatioLine(WebAppClient.Parse("{\"ok\":true,\"version\":\"6\"}")), "old Code.gs → nothing");
            A.Contains(RunNotes.RatioLine(new WebAppReply { RatioFailed = true }), "다음 넣기 때 다시");
            A.True(RunNotes.Warnings(r).Count == 0, "not a warning icon");
        }

        // ── 비트 읽기 문장 ──────────────────────────────────────────
        [Fact(DisplayName = "AC-8510.1 비트시트 Fix7Tests.BitReadsStayAllowedAndCodeListLooksUpNamesByKey")]
        public static void BitReadsStayAllowedAndCodeListLooksUpNamesByKey()
        {
            foreach (var sql in SheetSql.All)
            {
                var args = SheetSql.ParametersOf(sql).ToDictionary(p => p.Name, p => (object)new string('2', Math.Min(p.Size, 8)));
                SheetSql.Require(sql, args); // 쓰기 낱말·매개변수 확인을 지나야 한다
            }
            A.NotContains(SheetSql.CodeUsageSql, "UPPER(RTRIM(s.SeeOdrCod))");
            A.Contains(SheetSql.CodeUsageSql, "OUTER APPLY (SELECT TOP 1 x.SeeKorNam,x.SeeCodDiv FROM dbo.SeeMst x WHERE x.SeeOdrCod=U.code");
            A.Contains(SheetSql.CodesSql, "LEFT(o.OdrItmCod,2)");
            A.Contains(SheetSql.CodesSql, "x.SeeOdrCod=o.OdrCod");
            A.Contains(SheetSql.VisitsSql, "c.OcmInsCod");
            A.Contains(SheetSql.PaymentsSql, "b.PbsChtNum=o.OrcChtNum");
        }
    }
}
