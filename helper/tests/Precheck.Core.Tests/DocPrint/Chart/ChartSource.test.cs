using System;
using System.Collections.Generic;
using System.Linq;
using Precheck.Core.Bit;
using Precheck.Core.DocPrint;
using Precheck.Core.DocPrint.Docs.Chart;
using Xunit;

namespace Precheck.Core.Tests.DocPrint.Chart;

/// <summary>
/// spec doc-print AC-7405.1·AC-7406.1(진료기록부): 고른 날의 내원을 날짜순으로 이어 쓰는 외래진료기록부.
/// 쪽 머리 '외래진료기록부 ( Page - n )'·담당의/서명 칸·환자 칸, 내원마다 &lt;내원내역&gt;·&lt;경과기록&gt;·&lt;상병&gt;·&lt;처방&gt;·&lt;원외처방&gt;·&lt;수납내역&gt;,
/// 마지막 쪽 '의무기록지 사본 증명서'(날인 안내 글·출력담당자 자리). 도장은 직원이 손으로 찍는다 → 그림 없음(사용자 결정).
/// 값은 모두 지어낸 것이다.
/// </summary>
public class ChartSourceTests
{
    private const string Title = "외래진료기록부";
    private const string CertTitle = "의무기록지 사본 증명서";

    private static ChartDb TwoVisits()
    {
        var db = new ChartDb();
        db.Visits.Add(ChartDb.Visit("V1", "202611030930", "정형외과", "가상의사"));
        db.Visits.Add(ChartDb.Visit("V2", "202611051010"));
        db.Visits.Add(ChartDb.Visit("V3", "202611101425", "정형외과", "가상의사2"));
        db.Notes.Add(ChartDb.Note("V1", "가상 기록 첫 줄"));
        db.Notes.Add(ChartDb.Note("V1", "가상 기록 둘째 줄"));
        db.Notes.Add(ChartDb.Note("V2", "고르지 않은 날 기록"));
        db.Notes.Add(ChartDb.Note("V3", "가상 기록 셋째 날"));
        db.Diagnoses.Add(ChartDb.Dx("V1", "1", "M5456", "가상 요통"));
        db.Diagnoses.Add(ChartDb.Dx("V1", "2", "M4806", "가상 협착"));
        db.Diagnoses.Add(ChartDb.Dx("V3", "1", "M7501", "가상 어깨"));
        db.Orders.Add(ChartDb.Order("V1", "AA254", "가상 재진진찰료", 1m, 1, 1));
        db.Orders.Add(ChartDb.Order("V1", "", "가상 비급여 처치", 1m, 1, 1, userCode: "U77"));
        db.Orders.Add(ChartDb.Order("V1", "600000001", "가상약품정", 0.5m, 3, 5, outCode: "XX", slip: "2026110300001"));
        db.Orders.Add(ChartDb.Order("V2", "AA999", "고르지 않은 날 처방", 1m, 1, 1));
        db.Orders.Add(ChartDb.Order("V3", "MM101", "가상 물리치료", 1m, 1, 1));
        db.Payments.Add(ChartDb.Pay("V1", "20261103", 15300m, 4500m, 4000m, 300m));
        db.Payments.Add(ChartDb.Pay("V1", "20261103", 99999m, 88888m, 77777m, 66666m));
        db.Payments.Add(ChartDb.Pay("V2", "20261105", 12345m, 1234m, 1234m, 0m));
        db.Payments.Add(ChartDb.Pay("V3", "20261110", 21000m, 6300m, 6300m, 0m));
        return db;
    }

    private static VisitDay[] TwoDays() => new[] { ChartCase.Day(2026, 11, 10, "V3"), ChartCase.Day(2026, 11, 3, "V1") };

    // ── 자료 읽기 ─────────────────────────────

    [Fact(DisplayName = "AC-7405.1 고른 날의 첫날 0시~끝날 다음 날 0시와 차트번호로 허용 목록 문장만 읽고, 고른 날의 내원 번호만 메모리에서 거른다")]
    public void ReadsChosenRangeAndFiltersVisits()
    {
        var db = TwoVisits();

        var pages = ChartCase.Draw(db, TwoDays());

        Assert.Equal(6, db.Calls.Count);
        Assert.Equal(ChartSql.Allowed.Keys.OrderBy(s => s, StringComparer.Ordinal), db.Calls.Select(c => c.Sql).OrderBy(s => s, StringComparer.Ordinal));
        foreach (var call in db.Calls)
        {
            Assert.Equal("90001", call.Args["@cht"]);
            if (call.Args.Count == 1) continue;
            Assert.Equal("202611030000", call.Args["@from"]);
            Assert.Equal("202611110000", call.Args["@to"]);
        }

        var texts = ChartCase.AllTexts(pages);
        Assert.Contains(texts, t => t.Contains("2026-11-03"));
        Assert.Contains(texts, t => t.Contains("2026-11-10"));
        Assert.DoesNotContain(texts, t => t.Contains("2026-11-05") || t.Contains("고르지 않은") || t.Contains("AA999") || t.Contains("12,345"));
    }

    [Fact(DisplayName = "AC-7405.1 수납내역 금액은 비트 저장 값 그대로(총진료비·영수액·수납액·할인액, 다시 셈하지 않음, 천 단위 쉼표), 한 내원에 수납 줄이 여럿이면 맨 앞(최근) 줄만")]
    public void PaymentsAsStored()
    {
        var texts = ChartCase.AllTexts(ChartCase.Draw(TwoVisits(), TwoDays()));

        var row = texts.IndexOf("15,300");
        Assert.True(row > 0);
        Assert.Equal(new[] { "2026-11-03", "15,300", "4,500", "4,000", "300" }, texts.Skip(row - 1).Take(5).ToArray());
        Assert.Equal(new[] { "2026-11-10", "21,000", "6,300", "6,300", "0" }, texts.Skip(texts.IndexOf("21,000") - 1).Take(5).ToArray());
        Assert.DoesNotContain(texts, t => t.Contains("99,999") || t.Contains("88,888") || t.Contains("77,777") || t.Contains("66,666"));
    }

    [Fact(DisplayName = "AC-7405.1 수납 전 내원은 수납내역 줄만 비우고 경과기록·상병·처방은 찍는다")]
    public void UnpaidVisitKeepsRecords()
    {
        var db = TwoVisits();
        db.Payments.RemoveAll(p => (string?)p[0] == "V3");
        var days = new[] { ChartCase.Day(2026, 11, 3, "V1"), new VisitDay(new DateTime(2026, 11, 10), true, false, new[] { "V3" }) };

        var texts = ChartCase.AllTexts(ChartCase.Draw(db, days));

        Assert.Contains("가상 기록 셋째 날", texts);
        Assert.Contains("가상 어깨", texts);
        Assert.Contains("가상 물리치료", texts);
        Assert.Equal(2, texts.Count(t => t == "<수납내역>"));
        Assert.Equal(2, texts.Count(t => t == "총진료비"));
        Assert.DoesNotContain("2026-11-10", texts);
        Assert.DoesNotContain("21,000", texts);
    }

    [Fact(DisplayName = "AC-7405.1 고른 날이 없으면 DB에 묻지 않고 0쪽, 읽을 내원이 없으면 0쪽, 읽기 실패는 BitException 그대로")]
    public void EmptyAndFailures()
    {
        var db = TwoVisits();
        Assert.Empty(ChartCase.Draw(db));
        Assert.Empty(db.Calls);

        var none = new ChartDb();
        Assert.Empty(ChartCase.Draw(none, ChartCase.Day(2026, 11, 3, "V1")));

        foreach (var table in new[] { "dbo.EmrInf", "dbo.OicInf", "dbo.OdrInf", "dbo.OrpInf" })
        {
            var failing = TwoVisits();
            failing.FailTable = table;
            Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ChartCase.Draw(failing, TwoDays())).Code);
        }
        Assert.Equal(DocKind.Chart, new ChartSource().Kind);
    }

    // ── 그리기 ─────────────────────────────

    [Fact(DisplayName = "AC-7406.1 쪽마다 머리 '외래진료기록부      ( Page - n )'·담당의/서명 칸·환자 칸(차트번호·수진자명·성별/나이·주민등록 앞 7자리+******)과 쪽 아래 의료기관·전화·FAX·주소·발행일자")]
    public void HeaderAndFooterOnEveryPage()
    {
        var (db, days) = ChartCase.Many(12, 10);

        var pages = ChartCase.Draw(db, days);

        Assert.True(pages.Count >= 3, "쪽 수 " + pages.Count);
        for (var n = 0; n < pages.Count; n++)
        {
            var texts = ChartCase.Texts(pages[n]);
            Assert.Equal(Title + "      ( Page - " + (n + 1) + " )", texts[0]);
            Assert.Contains("담당의", texts);
            Assert.Contains("서  명", texts);
            Assert.Contains("차트번호 : 90001", texts);
            Assert.Contains("수진자명 : 가상환자01", texts);
            Assert.Contains("성별/나이 : 여/46", texts);
            Assert.Contains("주민등록 : 800302-2******", texts);
            Assert.Contains("의료기관: 가상의원   전화번호: 02-000-0000   FAX: 02-000-0001", texts);
            Assert.Contains("주소: 가상시 가상로 1", texts);
            Assert.Contains("발행일자 : 2026-11-20", texts);
            Assert.True(pages[n].Ops.Count(op => op.Kind == DocOpKind.Box) >= 1, "담당의/서명 칸");
        }

        db.Patient = new object?[] { "가림" };
        var odd = ChartCase.AllTexts(ChartCase.Draw(db, days.Take(1).ToArray()));
        Assert.Contains("주민등록 : ", odd);
    }

    [Fact(DisplayName = "AC-7406.1 내원마다 <내원내역>(내원일자·접수시간·진료과목·담당의) → <경과기록> 줄 차례 → <상병>(주상병/부상병) → <처방>(코드·명칭·용량·횟수·일수·용법) → <원외처방>(교부번호) → <수납내역>, 내원은 날짜순")]
    public void VisitBlocksInOrder()
    {
        var texts = ChartCase.AllTexts(ChartCase.Draw(TwoVisits(), TwoDays()));

        int At(string text)
        {
            var index = texts.IndexOf(text);
            Assert.True(index >= 0, "없는 글: " + text);
            return index;
        }

        var visit1 = texts.FindIndex(t => t.StartsWith("내원일자 : 2026-11-03 (화)", StringComparison.Ordinal));
        var visit3 = texts.FindIndex(t => t.StartsWith("내원일자 : 2026-11-10 (화)", StringComparison.Ordinal));
        Assert.True(visit1 > 0 && visit3 > visit1);
        Assert.Equal("내원일자 : 2026-11-03 (화)    접수시간 : 09:30    진료과목 : 정형외과    담당의 : 가상의사", texts[visit1]);
        Assert.Contains("담당의 : 가상의사2", texts[visit3]);
        Assert.Equal("<내원내역>", texts[visit1 - 1]);

        var order = new[]
        {
            visit1, At("<경과기록>"), At("가상 기록 첫 줄"), At("가상 기록 둘째 줄"), At("<상병>"), At("M5456"), At("M4806"),
            At("<처방>"), At("AA254"), At("U77"), At("<원외처방>"), At("600000001"), At("<수납내역>"), At("15,300"), visit3, At("가상 기록 셋째 날"),
        };
        Assert.Equal(order.OrderBy(i => i).ToArray(), order);

        Assert.Equal("(주상병)", texts[At("M5456") - 1]);
        Assert.Equal("가상 요통", texts[At("M5456") + 1]);
        Assert.Equal("(부상병)", texts[At("M4806") - 1]);
        Assert.Equal(new[] { "코드", "명칭", "용량", "횟수", "일수", "용법" }, texts.Skip(At("<처방>") + 1).Take(6).ToArray());
        Assert.Equal(new[] { "AA254", "가상 재진진찰료", "1", "1", "1" }, texts.Skip(At("AA254")).Take(5).ToArray());
        Assert.Equal("교부번호 : 2026110300001", texts[At("<원외처방>") + 1]);
        Assert.Equal(new[] { "600000001", "가상약품정", "0.5", "3", "5" }, texts.Skip(At("600000001")).Take(5).ToArray());
        Assert.Equal(new[] { "날짜", "총진료비", "영수액", "수납액", "할인액" }, texts.Skip(At("<수납내역>") + 1).Take(5).ToArray());
        Assert.DoesNotContain(texts, t => t.Contains("가상약품정") && texts.IndexOf(t) < At("<원외처방>"));
    }

    [Fact(DisplayName = "AC-7406.1 긴 글은 글자 폭을 재어 칸 폭 안에서 여러 줄로 나누고(빈칸에서, 빈칸이 없으면 글자에서, 글자를 잃지 않음) 글씨는 한 크기, 모든 글은 제 칸·A4 여백 안이고 겹치지 않는다")]
    public void WrapsLongTextAtOneSize()
    {
        var spaced = string.Join(" ", Enumerable.Range(1, 60).Select(i => "가상" + i.ToString("00", System.Globalization.CultureInfo.InvariantCulture)));
        var solid = new string('가', 150);
        var db = TwoVisits();
        db.Notes.Insert(1, ChartDb.Note("V1", spaced));
        db.Notes.Insert(2, ChartDb.Note("V1", solid));
        db.Orders.Insert(0, ChartDb.Order("V1", "BB100", "가상 아주 긴 처방 이름 " + new string('나', 60), 1m, 1, 1, usage: "가상 용법 " + new string('다', 20)));

        var pages = ChartCase.Draw(db, TwoDays());
        ChartCase.AssertTidy(pages);

        var texts = ChartCase.AllTexts(pages);
        var first = texts.FindIndex(t => t.StartsWith("가상01 ", StringComparison.Ordinal));
        Assert.True(first > 0);
        var pieces = texts.Skip(first).TakeWhile(t => t.StartsWith("가상", StringComparison.Ordinal) && !t.StartsWith("가상 ", StringComparison.Ordinal)).ToList();
        Assert.True(pieces.Count >= 2, "줄 나눔 없음");
        Assert.Equal(spaced, string.Join(" ", pieces));

        var solidStart = texts.FindIndex(t => t.Length > 0 && t.All(c => c == '가'));
        var solidPieces = texts.Skip(solidStart).TakeWhile(t => t.Length > 0 && t.All(c => c == '가')).ToList();
        Assert.True(solidPieces.Count >= 2);
        Assert.Equal(solid, string.Concat(solidPieces));

        var sizes = pages.SelectMany(p => p.Ops).Where(op => op.Kind == DocOpKind.Text && !op.Value.StartsWith(Title, StringComparison.Ordinal) && op.Value != CertTitle).Select(op => op.Pt).Distinct().ToArray();
        Assert.Single(sizes);
    }

    [Fact(DisplayName = "AC-7406.1 쪽이 차면 다음 쪽으로(머리 다시, 끝 쪽 빼고 '- Next Page -'), 내원은 날짜순 그대로 이어지고 어느 쪽도 글이 겹치거나 여백을 넘지 않는다")]
    public void PagesFlowInDateOrder()
    {
        var (db, days) = ChartCase.Many(12, 10);

        var pages = ChartCase.Draw(db, days);

        ChartCase.AssertTidy(pages);
        for (var n = 0; n < pages.Count; n++)
        {
            Assert.Equal(n < pages.Count - 1, ChartCase.Texts(pages[n]).Contains("- Next Page -"));
        }
        var texts = ChartCase.AllTexts(pages);
        var starts = Enumerable.Range(0, 12).Select(i => texts.FindIndex(t => t.StartsWith("내원일자 : " + new DateTime(2026, 10, 1).AddDays(i).ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture), StringComparison.Ordinal))).ToArray();
        Assert.DoesNotContain(-1, starts);
        Assert.Equal(starts.OrderBy(i => i).ToArray(), starts);
        for (var i = 0; i < 12; i++)
        {
            for (var k = 0; k < 10; k++) Assert.Single(texts, "가상 기록 " + i + "-" + k);
        }
        Assert.Equal(12, texts.Count(t => t == "<내원내역>"));
    }

    [Fact(DisplayName = "AC-7406.1 마지막 쪽에만 '의무기록지 사본 증명서'·사용 안내 글·'* 담당자 날인 없는 것은 사본으로 인정되지 않습니다.'·발행일(yyyy년MM월dd일)·'출력담당자 :' 빈자리·'(서명 또는 인)', 자리가 모자라면 새 쪽에")]
    public void CertificateOnLastPageOnly()
    {
        var pages = ChartCase.Draw(TwoVisits(), TwoDays());
        var last = ChartCase.Texts(pages.Last());
        Assert.Contains(CertTitle, last);
        Assert.Contains("* 상기용도 이외에는 이 사본을 사용할 수 없으며 사용용도 또는", last);
        Assert.Contains("사용기간이 완료된 후 즉시 파본, 폐기하여야 합니다.", last);
        Assert.Contains("* 담당자 날인 없는 것은 사본으로 인정되지 않습니다.", last);
        Assert.Contains("발행일 : 2026년11월20일", last);
        Assert.Contains("출력담당자 :", last);
        Assert.Contains("(서명 또는 인)", last);

        var movedToNewPage = false;
        for (var notes = 1; notes <= 70; notes++)
        {
            var (db, days) = ChartCase.Many(1, notes);
            var drawn = ChartCase.Draw(db, days);
            ChartCase.AssertTidy(drawn);
            Assert.Single(ChartCase.AllTexts(drawn), CertTitle);
            Assert.Contains(CertTitle, ChartCase.Texts(drawn.Last()));
            var lastTexts = ChartCase.Texts(drawn.Last());
            if (drawn.Count >= 2 && !lastTexts.Any(t => t.StartsWith("가상 기록", StringComparison.Ordinal) || t == "<수납내역>" || t == "15,300")) movedToNewPage = true;
        }
        Assert.True(movedToNewPage, "증명서가 새 쪽으로 넘어간 경우가 없음");
    }

    [Fact(DisplayName = "AC-7406.1 도장 그림 없음: 병원 직인이 있어도 어느 쪽에도 그림 글·그림 파일이 없다(담당자가 손으로 찍음)")]
    public void NoStampImage()
    {
        var (db, days) = ChartCase.Many(5, 10);
        var ctx = ChartCase.Context(days);
        Assert.NotNull(ctx.Seal);

        var pages = new ChartSource().Pages(db, ctx);

        Assert.NotEmpty(pages);
        foreach (var page in pages)
        {
            Assert.DoesNotContain(page.Ops, op => op.Kind == DocOpKind.Image);
            Assert.Empty(page.Images);
        }
    }
}
