using System;
using System.Linq;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.DocPrint;
using Precheck.Core.DocPrint.Docs.Receipt;
using Xunit;
using static Precheck.Core.Tests.DocPrint.Receipt.ReceiptFixture;

namespace Precheck.Core.Tests.DocPrint.Receipt;

/// <summary>
/// spec doc-print AC-7405.1(진료비 영수증 자료): 허용 목록 문장 둘(ReceiptsSql·ItemsSql)을 @cht·@from·@to로 한 번씩만 읽고,
/// 고른 날의 내원만 메모리에서 거르며, 금액은 비트에 저장된 값 그대로(long) 쓴다. 값은 모두 지어낸 것이다.
/// </summary>
public class ReceiptDataTests
{
    private static string Squash(string sql) => Regex.Replace(sql, @"\s+", " ").Trim();

    private static string Shape(string sql) => string.Join(" ", Sql.ParametersOf(sql).Select(p => p.Name + ":" + p.Kind + "(" + p.Size + ")"));

    // ── SQL 글자·매개변수 ─────────────────────────────

    [Fact(DisplayName = "AC-7405.1 영수증 SQL 둘은 허용 목록(ReceiptSql.Allowed → DocSql)에 있고 @cht VarChar(14)·@from·@to Char(12)만 받는 읽기 전용 SELECT다")]
    public void SqlIsAllowedSelect()
    {
        Assert.Equal(new[] { ReceiptSql.ItemsSql, ReceiptSql.ReceiptsSql }.OrderBy(s => s, StringComparer.Ordinal), ReceiptSql.Allowed.Keys.OrderBy(s => s, StringComparer.Ordinal));
        foreach (var sql in ReceiptSql.Allowed.Keys)
        {
            Assert.StartsWith("SELECT ", sql, StringComparison.Ordinal);
            Assert.DoesNotContain(";", sql);
            Assert.DoesNotContain("\r", sql);
            Assert.True(DocSql.IsAllowed(sql));
            Assert.True(Sql.IsAllowed(sql));
            Assert.Equal("@cht:VarChar(14) @from:Char(12) @to:Char(12)", Shape(sql));
            var squashed = Squash(sql);
            Assert.Contains("FROM dbo.PbsInf b JOIN dbo.OcmInf c ON c.OcmChtNum=b.PbsChtNum", squashed);
            Assert.Contains("WHERE LTRIM(RTRIM(b.PbsChtNum))=@cht AND c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O' AND c.OcmRsuYon<>'O' AND ISNULL(c.OcmComStt,'') NOT IN ('CN','CR')", squashed);
        }
    }

    [Fact(DisplayName = "AC-7405.1 합계는 OrpInf의 내원마다 MAX(OrpRcpSeq)·OrpRcpStt<>'C' 줄, 받은 돈은 OrcInf RCV(현금·카드·계좌)와 QCV, 현금영수증은 CashInf(보낸·취소 안 된 줄), 항목은 OdlInf 저장 칸")]
    public void SqlReadsBitColumns()
    {
        var receipts = Squash(ReceiptSql.ReceiptsSql);
        Assert.Contains("JOIN dbo.OrpInf p ON p.OrpOcmNum=c.OcmNum AND ISNULL(p.OrpRcpStt,'')<>'C' AND p.OrpRcpSeq=(SELECT MAX(q.OrpRcpSeq) FROM dbo.OrpInf q WHERE q.OrpOcmNum=c.OcmNum AND ISNULL(q.OrpRcpStt,'')<>'C')", receipts);
        foreach (var column in new[] { "p.OrpRcpNum", "p.OrpAccDte", "c.OcmDgsDnh", "DepKorNam", "InsCodNam", "c.OcmInsCod", "p.OrpTotAmt", "p.OrpCorAmt", "p.OrpTotOwn", "p.OrpInsOwn", "p.OrpNonAmt", "p.OrpRcvBil", "p.OrpSupBil", "CashSupAmt", "CashAuthNum" })
        {
            Assert.Contains(column, receipts);
        }
        Assert.Contains("o.OrcCod='RCV'", receipts);
        Assert.Contains("o.OrcCod='QCV'", receipts);
        Assert.Contains("h.CashSndStt='0' AND h.CashTrdYon='0'", receipts);
        Assert.Contains("ORDER BY c.OcmAcpDtm,c.OcmNum", receipts);

        var items = Squash(ReceiptSql.ItemsSql);
        Assert.Contains("JOIN dbo.OdlInf o ON o.OdlOcmNum=c.OcmNum", items);
        foreach (var column in new[] { "o.OdlRcpNum", "o.OdlIncCod", "o.OdlInsOwn", "o.OdlInsCor", "o.OdlHunAmt", "o.OdlNonAmt", "o.OdlNinAct", "o.OdlNinMat", "o.OdlNinNat", "o.OdlH50Amt", "o.OdlH80Amt", "o.OdlH30Amt", "o.OdlH90Amt", "o.OdlH95Amt" })
        {
            Assert.Contains(column, items);
        }
    }

    [Fact(DisplayName = "AC-7405.1 영수증 SQL은 환자 이름·주민번호·전화·주소·현금영수증 신분확인번호를 읽지 않는다(차트번호로 잇기만)")]
    public void SqlSkipsPersonalColumns()
    {
        foreach (var sql in ReceiptSql.Allowed.Keys)
        {
            var pbs = Regex.Matches(sql, @"\bPbs[A-Z][A-Za-z]*").Cast<Match>().Select(m => m.Value).Distinct();
            Assert.Empty(pbs.Except(new[] { "PbsInf", "PbsChtNum" }));
            foreach (var dropped in new[] { "ResNum", "PatNam", "ChkNum", "Phn", "Tel", "Adr", "Cmt", "Emr" })
            {
                Assert.True(sql.IndexOf(dropped, StringComparison.OrdinalIgnoreCase) < 0, dropped);
            }
        }
    }

    // ── 한 번 읽고 메모리에서 거르기 ─────────────────────────────

    [Fact(DisplayName = "AC-7405.1 고른 날이 여러 날이어도 문장마다 한 번씩만 @cht·@from(첫 날 0시)·@to(끝 날 다음 날 0시)로 읽는다")]
    public void ReadsOnceForAllDays()
    {
        var db = Db(new[] { Orp("V1", "20261103", "    00101", 10000, 7000, 3000, 3000, 0) }, Array.Empty<object?[]>());
        var ctx = Context(new[] { Day(11, 3, "V1"), Day(11, 10, "V3"), Day(11, 17, "V5") });

        ReceiptData.Read(db, ctx);

        Assert.Equal(new[] { ReceiptSql.ReceiptsSql, ReceiptSql.ItemsSql }.OrderBy(s => s, StringComparer.Ordinal), db.Calls.Select(c => c.Sql).OrderBy(s => s, StringComparer.Ordinal));
        foreach (var call in db.Calls)
        {
            Assert.Equal(new[] { "@cht", "@from", "@to" }, call.Args.Keys.OrderBy(k => k, StringComparer.Ordinal).ToArray());
            Assert.Equal("90001", call.Args["@cht"]);
            Assert.Equal("202611030000", call.Args["@from"]);
            Assert.Equal("202611180000", call.Args["@to"]);
            Assert.Equal(DocSql.ReadTimeout, call.Timeout);
        }
    }

    [Fact(DisplayName = "AC-7405.1 고른 날이 없으면 DB에 묻지 않고 빈 목록, 읽기 실패는 BitException 그대로")]
    public void EmptyAndFailure()
    {
        var db = Db(Array.Empty<object?[]>(), Array.Empty<object?[]>());
        Assert.Empty(ReceiptData.Read(db, Context(Array.Empty<VisitDay>())));
        Assert.Empty(db.Calls);
        Assert.Empty(new ReceiptSource().Pages(db, Context(Array.Empty<VisitDay>())));

        var failing = new Precheck.Core.Tests.Bit.FakeDb().Fail(ReceiptSql.ReceiptsSql, BitErrors.ReadFailed).Answer(ReceiptSql.ItemsSql, _ => Array.Empty<object?[]>());
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReceiptData.Read(failing, Context(new[] { Day(11, 3, "V1") }))).Code);
    }

    [Fact(DisplayName = "AC-7405.1 고른 날의 내원 번호만 남기고(기간 안 다른 내원은 버림), 날짜순·같은 날은 접수 차례, 영수증 줄이 없는 내원(수납 전)은 건너뛴다")]
    public void FiltersChosenVisits()
    {
        var db = Db(
            new[]
            {
                Orp("V1", "20261103", "    00101", 10000, 7000, 3000, 3000, 0),
                Orp("V2", "20261103", "    00102", 20000, 14000, 6000, 6000, 0),
                Orp("V4", "20261105", "    00104", 30000, 21000, 9000, 9000, 0),
                Orp("V9", "20261107", "    00109", 40000, 28000, 12000, 12000, 0),
            },
            Array.Empty<object?[]>());
        // V3(11-05)은 영수증 줄 없음 = 수납 전, V9(11-07)는 사용자가 고르지 않은 날
        var ctx = Context(new[] { Day(11, 5, "V3", "V4"), Day(11, 3, "V1", "V2") });

        var visits = ReceiptData.Read(db, ctx);

        Assert.Equal(new[] { "V1", "V2", "V4" }, visits.Select(v => v.VisitNum).ToArray());
        Assert.Equal(new[] { new DateTime(2026, 11, 3), new DateTime(2026, 11, 3), new DateTime(2026, 11, 5) }, visits.Select(v => v.Date).ToArray());
        Assert.Equal(new[] { "00101", "00102", "00104" }, visits.Select(v => v.ReceiptNum).ToArray());
    }

    // ── 금액 그대로 ─────────────────────────────

    [Fact(DisplayName = "AC-7405.1 금액은 비트 저장 값 그대로 long(numeric·int·NULL), 합계와 항목 합이 달라도 다시 셈하지 않는다")]
    public void AmountsAsStored()
    {
        var db = Db(
            new[]
            {
                Orp("V1", "20261103", "    00101", 33330, 23330, 9900, 9900, 1200, accDay: "20261104", dnh: "N", disabled: 500, support: 300,
                    cash: 2000, card: 7000, account: 900, health: 100, cashReceipt: 1500, approval: "123456789"),
            },
            Array.Empty<object?[]>());
        db.Answer(ReceiptSql.ItemsSql, _ => new[]
        {
            Odl("V1", "    00101", 1, 3561, 8309),
            Odl("V1", "    00101", 6, 4447, 10377, full: 250, nonPay: 1200),
            Odl("V1", "    00999", 9, 7777, 7777),
            new object?[] { "V1", "    00101", (short)31, null, DBNull.Value, 0, 12L, 0m, 0m, 0m, 0m, 0m },
        });

        var visit = Assert.Single(ReceiptData.Read(db, Context(new[] { Day(11, 3, "V1") })));

        Assert.Equal(33330L, visit.Total);
        Assert.Equal(23330L, visit.Corp);
        Assert.Equal(9900L, visit.PatientTotal);
        Assert.Equal(9900L, visit.InsOwn);
        Assert.Equal(1200L, visit.NonPay);
        Assert.Equal(500L, visit.DisabledFund);
        Assert.Equal(300L, visit.Support);
        Assert.Equal(2000L, visit.Cash);
        Assert.Equal(7000L, visit.Card);
        Assert.Equal(900L, visit.Account);
        Assert.Equal(100L, visit.HealthAllowance);
        Assert.Equal(1500L, visit.CashReceipt);
        Assert.Equal("123456789", visit.CashApproval);
        Assert.Equal(new DateTime(2026, 11, 4), visit.PaidDay);
        Assert.Equal("N", visit.DayNight);
        Assert.Equal("1진료실", visit.Department);
        Assert.Equal("국민건강보험", visit.PatientClass);
        Assert.Equal(31, visit.InsuranceCode);

        // 같은 영수증 번호(앞 빈칸 무시)의 항목만, 저장 값 그대로. 다른 영수증 번호(00999) 줄은 버린다
        Assert.Equal(new[] { 1, 6, 31 }, visit.Items.Select(i => i.Code).ToArray());
        var consult = visit.Items[0];
        Assert.Equal((3561L, 8309L, 0L, 0L), (consult.Own, consult.Corp, consult.Full, consult.NonPay));
        var physio = visit.Items[1];
        Assert.Equal((4447L, 10377L, 250L, 1200L), (physio.Own, physio.Corp, physio.Full, physio.NonPay));
        var blank = visit.Items[2];
        Assert.Equal((0L, 0L, 0L, 12L), (blank.Own, blank.Corp, blank.Full, blank.NonPay));
    }

    [Fact(DisplayName = "AC-7405.1 int 범위를 넘는 금액도 long 그대로, 영수증 번호와 맞는 항목이 없고 영수증 번호가 하나뿐이면 그 항목을 쓴다")]
    public void LargeAmountsAndSingleReceiptFallback()
    {
        var db = Db(
            new[] { Orp("V1", "20261103", "    00101", 9_876_543_210, 9_000_000_000, 876_543_210, 876_543_210, 0) },
            new[] { Odl("V1", "    00777", 8, 3_000_000_000, 4_000_000_000) });

        var visit = Assert.Single(ReceiptData.Read(db, Context(new[] { Day(11, 3, "V1") })));

        Assert.Equal(9_876_543_210L, visit.Total);
        var item = Assert.Single(visit.Items);
        Assert.Equal(8, item.Code);
        Assert.Equal(3_000_000_000L, item.Own);
        Assert.Equal(4_000_000_000L, item.Corp);
    }

    [Fact(DisplayName = "AC-7405.1 영수증 번호: '수납 연월-OrpRcpNum'(앞 빈칸 뺌), 수납일이 없으면 내원 연월, 번호가 비면 빈 글. 야간 N·T, 공휴일 H")]
    public void ReceiptNumberAndNight()
    {
        var db = Db(
            new[]
            {
                Orp("V1", "20261130", "    00101", 1, 0, 1, 1, 0, accDay: "20261201", dnh: "N"),
                Orp("V2", "20261130", "    00102", 1, 0, 1, 1, 0, accDay: " ", dnh: "LH"),
                Orp("V3", "20261130", "          ", 1, 0, 1, 1, 0, dnh: "T"),
                Orp("V4", "20261130", "00104", 1, 0, 1, 1, 0, dnh: "D"),
            },
            Array.Empty<object?[]>());

        var visits = ReceiptData.Read(db, Context(new[] { Day(11, 30, "V1", "V2", "V3", "V4") }));

        Assert.Equal(new[] { "202612-00101", "202611-00102", "", "202611-00104" }, visits.Select(v => v.ReceiptNoText).ToArray());
        Assert.Equal(new[] { true, false, true, false }, visits.Select(v => v.Night).ToArray());
        Assert.Equal(new[] { false, true, false, false }, visits.Select(v => v.Holiday).ToArray());
        Assert.Null(visits[1].PaidDay);
    }

    [Fact(DisplayName = "AC-7405.1 선별급여 줄: 비트 영수증 식 그대로(본인 = (50%·80%·30%·90%·95% 몫 합)을 10원 아래 버림, 공단 = 선별 금액 합을 10원 아래 버린 것 - 본인), 건강보험·의료급여(31·51·52)만")]
    public void SelectiveBenefitLikeBit()
    {
        var db = Db(
            new[]
            {
                Orp("V1", "20261103", "00101", 1, 0, 1, 1, 0, insCode: 31),
                Orp("V2", "20261103", "00102", 1, 0, 1, 1, 0, insCode: 51),
                Orp("V3", "20261103", "00103", 1, 0, 1, 1, 0, insCode: 21),
                Orp("V4", "20261103", "00104", 1, 0, 1, 1, 0, insCode: 31),
            },
            new[]
            {
                Odl("V1", "00101", 6, 1000, 2000, h95: 50000),
                Odl("V2", "00102", 15, 0, 0, h80: 12345),
                Odl("V2", "00102", 6, 0, 0, h50: 1001),
                Odl("V3", "00103", 6, 0, 0, h95: 50000),
                Odl("V4", "00104", 1, 3000, 7000),
            });

        var visits = ReceiptData.Read(db, Context(new[] { Day(11, 3, "V1", "V2", "V3", "V4") }));

        Assert.Equal((47500L, 2500L), visits[0].Selective);
        // 12345×0.8 + 1001×0.5 = 10376.5 → 10370, 13346 → 13340, 공단 2970
        Assert.Equal((10370L, 2970L), visits[1].Selective);
        Assert.Equal((0L, 0L), visits[2].Selective);
        Assert.Equal((0L, 0L), visits[3].Selective);
    }
}
