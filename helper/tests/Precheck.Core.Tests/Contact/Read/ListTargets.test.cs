using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.Contact;
using Precheck.Core.Protocol;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Contact.Read;

/// <summary>
/// spec patients-bit-lists REQ-2801: contact.targets 새 종류 둘의 읽기(ReservationTargets·LapsedTargets.Build)와 SQL(ListSql).
/// 비트 DB는 가짜(FakeSession)라 SQL의 뜻은 문장 글자로 못 박는다. 가짜 오늘은 2026-10-30(Synthetic.Today).
/// 명령(contact.targets)에 붙여 chunk … end로 보내는 것은 ContactContract.test.cs가 본다.
/// </summary>
public class ListTargetsTests
{
    private static string Squash(string sql) => Regex.Replace(sql, @"\s+", " ").Trim();

    private static int Count(string text, string part)
    {
        var n = 0;
        for (var at = text.IndexOf(part, StringComparison.Ordinal); at >= 0; at = text.IndexOf(part, at + part.Length, StringComparison.Ordinal)) n++;
        return n;
    }

    private static string Shape(string sql) => string.Join(" ", Sql.ParametersOf(sql).Select(p => p.Name + ":" + p.Kind + "(" + p.Size + ")"));

    // 이 병원 진료실(DepMst 범위) 조건. 원본 RxVisitSplit·LapsedPatients와 같은 글
    private static string Hospital(string alias) =>
        "EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=" + alias + ".OcmDepCod AND d.DepHspNum=@hospital AND LEFT(" + alias + ".OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)";

    // 센 접수(외래 · WN·HN·TN·PN · OcmRsuYon ≠ 'O'). 원본 LapsedPatients.Visits와 같은 조건
    private static string Counted(string alias) =>
        alias + ".OcmPatTyp='O' AND " + alias + ".OcmComStt IN ('WN','HN','TN','PN') AND " + alias + ".OcmRsuYon<>'O'";

    // ── AC-2801.1 예약: 기간 검사 → 등록 확인 → SQL → {v, kind, from, to, today, rows} ─────────

    [Fact(DisplayName = "AC-2801.1 예약: 등록 병원 확인 뒤 예약 SQL 하나(기간·내일 0시·병원 범위, 150초), 답은 {v:1, kind:'reservation', from, to, today, rows}")]
    public void ReservationReadsAfterHospitalCheck()
    {
        using var rig = new ListRig();
        rig.Reservations(ListData.Reservation("900001", "가상환자01", "010-0000-0001", null, "202610311430", "WR", null, 0, null));
        var json = rig.Reservation("2026-09-30", "2026-11-13");

        Assert.Equal(new[] { "v", "kind", "from", "to", "today", "rows" }, Json.Keys(json));
        Assert.Equal(1, json.GetProperty("v").GetInt32());
        Assert.Equal("reservation", json.GetProperty("kind").GetString());
        Assert.Equal("2026-09-30", json.GetProperty("from").GetString());
        Assert.Equal("2026-11-13", json.GetProperty("to").GetString());
        Assert.Equal("2026-10-30", json.GetProperty("today").GetString());
        Assert.Single(ListRig.Rows(json));

        Assert.Equal(new[] { Sql.ScopesSql, Sql.InstitutionSql, ListSql.ReservationsSql }, rig.Db.Sqls);
        var call = rig.Db.Calls[2];
        Assert.Equal("202609300000", call.Args["@from"]);
        Assert.Equal("202611140000", call.Args["@to"]);       // 끝날 다음 날 0시
        Assert.Equal("202610310000", call.Args["@until"]);    // 내일 0시: 그 뒤 처음 온 날은 오늘까지
        Assert.Equal(Synthetic.Scope, call.Args["@hospital"]);
        Assert.Equal(4, call.Args.Count);
        Assert.Equal(TimeSpan.FromSeconds(150), call.Timeout);
        Assert.Equal(TimeSpan.FromSeconds(150), ListSql.ReadTimeout);
        Assert.Equal(1, rig.Db.Disposed);

        // F/U처럼 통계 화면·비트 로그인 창은 쓰지 않는다
        Assert.Empty(rig.Rig.Login.Calls);
        Assert.Empty(rig.Rig.Screens.Calls);
        Assert.Empty(rig.Rig.Screens.MenuReads);
    }

    [Theory(DisplayName = "AC-2801.1 예약: from > to·46일 넘음·from < 오늘−31일·to > 오늘+14일이면 비트를 건드리지 않고 E-HELPER-BAD-MESSAGE")]
    [InlineData("2026-10-02", "2026-10-01")]   // 거꾸로
    [InlineData("2026-09-29", "2026-11-14")]   // 47일(끝도 오늘+15일)
    [InlineData("2026-09-28", "2026-11-12")]   // 46일이지만 시작이 오늘−32일
    [InlineData("2026-09-28", "2026-09-28")]   // 하루지만 오늘−32일
    [InlineData("2026-10-31", "2026-11-14")]   // 끝이 오늘+15일
    [InlineData("2026-11-14", "2026-11-14")]
    public void ReservationRejectsBadPeriod(string from, string to)
    {
        using var rig = new ListRig();
        var error = Assert.Throws<ProtocolException>(() => ReservationTargets.Build(rig.Rig.Services, ListData.Day(from), ListData.Day(to)));
        Assert.Equal("E-HELPER-BAD-MESSAGE", error.Code);
        Assert.False(rig.BitTouched);
        Assert.Empty(rig.Db.Calls);
        Assert.Equal(46, ReservationTargets.MaxDays);
        Assert.Equal(31, ReservationTargets.BackDays);
        Assert.Equal(14, ReservationTargets.AheadDays);
    }

    [Theory(DisplayName = "AC-2801.1 예약: 46일(오늘−31일 ~ 오늘+14일)·하루·과거만·앞날만은 된다")]
    [InlineData("2026-09-29", "2026-11-13")]
    [InlineData("2026-09-29", "2026-09-29")]
    [InlineData("2026-11-13", "2026-11-13")]
    [InlineData("2026-09-30", "2026-10-29")]
    [InlineData("2026-10-31", "2026-11-13")]
    public void ReservationAcceptsPeriod(string from, string to)
    {
        using var rig = new ListRig();
        rig.Reservations();
        var json = rig.Reservation(from, to);
        Assert.Equal(from, json.GetProperty("from").GetString());
        Assert.Equal(to, json.GetProperty("to").GetString());
        Assert.Empty(ListRig.Rows(json));
    }

    [Fact(DisplayName = "AC-2801.1 예약·장기 미방문: 등록이 없으면 E-BIT-NOT-REGISTERED(비트를 건드리지 않음), 등록 병원과 다르면 E-BIT-HOSPITAL-MISMATCH(명단 SQL을 돌리지 않음)")]
    public void HospitalGateComesFirst()
    {
        using (var rig = new ListRig(registered: false))
        {
            Assert.Equal("E-BIT-NOT-REGISTERED", Assert.Throws<BitException>(() => ReservationTargets.Build(rig.Rig.Services, ListData.Day("2026-10-01"), ListData.Day("2026-10-31"))).Code);
            Assert.Equal("E-BIT-NOT-REGISTERED", Assert.Throws<BitException>(() => LapsedTargets.Build(rig.Rig.Services, ListData.Day("2025-10-01"), ListData.Day("2026-09-30"))).Code);
            Assert.False(rig.BitTouched);
        }
        using (var rig = new ListRig())
        {
            rig.Rig.Registered(Synthetic.Registration(institution: Synthetic.OtherInstitution));
            rig.Reservations().Lapsed();
            Assert.Equal("E-BIT-HOSPITAL-MISMATCH", Assert.Throws<BitException>(() => ReservationTargets.Build(rig.Rig.Services, ListData.Day("2026-10-01"), ListData.Day("2026-10-31"))).Code);
            Assert.Equal("E-BIT-HOSPITAL-MISMATCH", Assert.Throws<BitException>(() => LapsedTargets.Build(rig.Rig.Services, ListData.Day("2025-10-01"), ListData.Day("2026-09-30"))).Code);
            Assert.DoesNotContain(ListSql.ReservationsSql, rig.Db.Sqls);
            Assert.DoesNotContain(ListSql.LapsedSql, rig.Db.Sqls);
            Assert.Equal(2, rig.Db.Disposed);
        }
    }

    [Fact(DisplayName = "AC-2801.1 예약·장기 미방문: SQL 읽기 실패·300,000줄 넘음·칸 모자람이면 E-BIT-READ-FAILED(자르지 않음), 세션은 닫는다")]
    public void ReadFailuresAreReadFailed()
    {
        var reservation = ListData.Reservation("900001", "가상환자01", "010-0000-0001", null, "202610311430", "WR", null, 0, null);
        var lapsed = ListData.Lapsed("900001", "가상환자01", "010-0000-0001", null, "20260915", 3, 0, "A49", "가짜주사약");
        var cases = new List<Action<ListRig>>
        {
            rig => rig.Db.Fail(ListSql.ReservationsSql, "E-BIT-READ-FAILED").Fail(ListSql.LapsedSql, "E-BIT-READ-FAILED"),
            rig => rig.Reservations(Enumerable.Repeat(reservation, ContactTargets.MaxRows + 1).ToArray()).Lapsed(Enumerable.Repeat(lapsed, ContactTargets.MaxRows + 1).ToArray()),
            rig => rig.Reservations(reservation.Take(8).ToArray()).Lapsed(lapsed.Take(8).ToArray()),
            rig => rig.Reservations(ListData.Reservation("900001", "가상환자01", "010-0000-0001", null, "202610311430", "WR", null, "가상", null))
                      .Lapsed(ListData.Lapsed("900001", "가상환자01", "010-0000-0001", null, "20260915", "가상", 0, "A49", null)),
        };
        foreach (var setUp in cases)
        {
            using var rig = new ListRig();
            setUp(rig);
            Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReservationTargets.Build(rig.Rig.Services, ListData.Day("2026-10-01"), ListData.Day("2026-10-31"))).Code);
            Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => LapsedTargets.Build(rig.Rig.Services, ListData.Day("2025-10-01"), ListData.Day("2026-09-30"))).Code);
            Assert.Equal(2, rig.Db.Disposed);
        }
        Assert.Equal(300_000, ContactTargets.MaxRows);
        GC.Collect();
    }

    // ── AC-2801.2 예약 줄 ─────────────────────────────────────────────

    [Fact(DisplayName = "AC-2801.2 예약 줄: [차트번호|null, 이름|null, 전화, 예약 시각, 상태, 예약 표시|null, 그날 옴 0|1, 그 뒤 처음 온 날|null], SQL 차례 그대로·앞뒤 빈칸 뺌")]
    public void ReservationRows()
    {
        using var rig = new ListRig();
        rig.Reservations(
            ListData.Reservation("900001    ", " 가상환자01 ", "010-0000-0001 ", "02-0000-0001", "202610200900", "CR", "OC", 0, "20261022"),
            ListData.Reservation("900002", "가상환자02", null, null, "202610211030", "PN", "OS", 1, "20261027"),
            ListData.Reservation("900003", "가상환자03", "010-0000-0003", null, "202610311430", "WR", null, 0, null),
            ListData.Reservation("900004", "가상환자04", "010-0000-0004", null, "202611021200", "NR", "  ", 1L, null),
            ListData.Reservation(null, null, null, "02-0000-0005", "202611031500", "WR", null, 0, null),
            ListData.Reservation("   ", "  ", "", "", "202611041600", "WR ", "OS", 0, null));
        var json = rig.Reservation("2026-09-30", "2026-11-13");

        Assert.Equal(new[]
        {
            "[\"900001\",\"가상환자01\",\"010-0000-0001\",\"202610200900\",\"CR\",\"OC\",0,\"20261022\"]",
            "[\"900002\",\"가상환자02\",\"\",\"202610211030\",\"PN\",\"OS\",1,\"20261027\"]",
            "[\"900003\",\"가상환자03\",\"010-0000-0003\",\"202610311430\",\"WR\",null,0,null]",
            "[\"900004\",\"가상환자04\",\"010-0000-0004\",\"202611021200\",\"NR\",null,1,null]",
            "[null,null,\"02-0000-0005\",\"202611031500\",\"WR\",null,0,null]",
            "[null,null,\"\",\"202611041600\",\"WR\",\"OS\",0,null]",
        }, ListRig.Rows(json));
    }

    [Fact(DisplayName = "AC-2801.2 예약 SQL: 이 병원 외래 접수 중 RsvInf 예약 줄(RsvDivTyp 'R'·빈 값) 또는 WR·NR·CR, 그날 옴·그 뒤 처음 온 날(오늘까지)은 같은 차트번호의 센 접수")]
    public void ReservationSqlConditions()
    {
        var sql = Squash(ListSql.ReservationsSql);

        // 기간 안 이 병원 외래 접수, 이름·전화는 PbsInf, 예약 표시는 RsvInf(예약 종류만, 한 접수에 한 줄)
        Assert.Contains("FROM dbo.OcmInf c LEFT JOIN dbo.PbsInf b ON b.PbsChtNum=c.OcmChtNum", sql, StringComparison.Ordinal);
        Assert.Contains("WHERE c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O' AND " + Hospital("c"), sql, StringComparison.Ordinal);
        Assert.Contains("OUTER APPLY (SELECT TOP 1 1 Found,x.RsvSts FROM dbo.RsvInf x WHERE x.RsvOcmNum=c.OcmNum AND ISNULL(x.RsvDivTyp,'R') IN ('R','') ORDER BY x.RsvSts) r", sql, StringComparison.Ordinal);
        Assert.Contains("AND (r.Found=1 OR c.OcmComStt IN ('WR','NR','CR'))", sql, StringComparison.Ordinal);

        // 칸 차례: 차트번호·이름·휴대전화·집 전화·예약 시각·상태·예약 표시·그날 옴·그 뒤 처음 온 날
        Assert.StartsWith("SELECT c.OcmChtNum,b.PbsPatNam,b.PbsCelPhn,b.PbsPhnNum,c.OcmAcpDtm,c.OcmComStt,r.RsvSts, CASE WHEN ", sql, StringComparison.Ordinal);

        // 그날 옴: 그 접수가 센 접수이거나, 같은 차트번호(빈 차트번호는 견주지 않음)로 그날 센 접수가 있음
        Assert.Contains("CASE WHEN (c.OcmComStt IN ('WN','HN','TN','PN') AND c.OcmRsuYon<>'O') OR (RTRIM(ISNULL(c.OcmChtNum,''))<>'' AND EXISTS(SELECT 1 FROM dbo.OcmInf v WHERE v.OcmChtNum=c.OcmChtNum AND LEFT(v.OcmAcpDtm,8)=LEFT(c.OcmAcpDtm,8) AND "
            + Counted("v") + " AND " + Hospital("v") + ")) THEN 1 ELSE 0 END Came", sql, StringComparison.Ordinal);

        // 그 뒤 처음 온 날: 예약 날 다음 날부터 오늘(@until = 내일 0시 전)까지 센 접수 중 가장 이른 날
        Assert.Contains("(SELECT MIN(LEFT(v.OcmAcpDtm,8)) FROM dbo.OcmInf v WHERE RTRIM(ISNULL(c.OcmChtNum,''))<>'' AND v.OcmChtNum=c.OcmChtNum AND LEFT(v.OcmAcpDtm,8)>LEFT(c.OcmAcpDtm,8) AND v.OcmAcpDtm<@until AND "
            + Counted("v") + " AND " + Hospital("v") + ") CameAfter", sql, StringComparison.Ordinal);

        Assert.EndsWith("ORDER BY c.OcmAcpDtm,c.OcmNum", sql, StringComparison.Ordinal);
        Assert.Equal(3, Count(sql, "d.DepHspNum=@hospital"));
        // 접수 취소(CN)는 예약 표시가 있을 때만 나온다(상태 조건에 CN이 없다)
        Assert.DoesNotContain("'CN'", sql, StringComparison.Ordinal);
    }

    // ── AC-2801.3 장기 미방문 ─────────────────────────────────────────

    [Fact(DisplayName = "AC-2801.3 장기 미방문: 등록 병원 확인 뒤 SQL 하나(마지막 내원 from~to·오늘 0시·병원 범위, 150초), 답은 {v:1, kind:'lapsed', from, to, today, rows}")]
    public void LapsedReadsAfterHospitalCheck()
    {
        using var rig = new ListRig();
        rig.Lapsed(ListData.Lapsed("900001", "가상환자01", "010-0000-0001", null, "20260915", 3, 0, "A49", "가짜주사약"));
        var json = rig.LapsedList("2024-10-31", "2026-09-30");

        Assert.Equal(new[] { "v", "kind", "from", "to", "today", "rows" }, Json.Keys(json));
        Assert.Equal(1, json.GetProperty("v").GetInt32());
        Assert.Equal("lapsed", json.GetProperty("kind").GetString());
        Assert.Equal("2024-10-31", json.GetProperty("from").GetString());
        Assert.Equal("2026-09-30", json.GetProperty("to").GetString());
        Assert.Equal("2026-10-30", json.GetProperty("today").GetString());

        Assert.Equal(new[] { Sql.ScopesSql, Sql.InstitutionSql, ListSql.LapsedSql }, rig.Db.Sqls);
        var call = rig.Db.Calls[2];
        Assert.Equal("20241031", call.Args["@from"]);
        Assert.Equal("20260930", call.Args["@to"]);
        Assert.Equal("202610300000", call.Args["@today"]);   // 오늘 0시 전 접수만 센다, 예약 있음은 오늘 0시부터
        Assert.Equal(Synthetic.Scope, call.Args["@hospital"]);
        Assert.Equal(4, call.Args.Count);
        Assert.Equal(TimeSpan.FromSeconds(150), call.Timeout);
        Assert.Equal(1, rig.Db.Disposed);
        Assert.Empty(rig.Rig.Login.Calls);
        Assert.Empty(rig.Rig.Screens.Calls);
    }

    [Fact(DisplayName = "AC-2801.3 장기 미방문: to ≥ 오늘·from > to·1,100일 넘음이면 비트를 건드리지 않고 E-HELPER-BAD-MESSAGE, 어제까지 1,100일은 된다")]
    public void LapsedPeriod()
    {
        var yesterday = ListData.Day("2026-10-29");
        foreach (var (from, to) in new[]
        {
            (ListData.Day("2026-09-30"), ListData.Day("2026-10-30")),   // 끝이 오늘
            (ListData.Day("2026-10-31"), ListData.Day("2026-10-31")),   // 내일
            (ListData.Day("2026-09-30"), ListData.Day("2026-09-29")),   // 거꾸로
            (yesterday.AddDays(-1100), yesterday),                      // 1,101일
        })
        {
            using var rig = new ListRig();
            var error = Assert.Throws<ProtocolException>(() => LapsedTargets.Build(rig.Rig.Services, from, to));
            Assert.Equal("E-HELPER-BAD-MESSAGE", error.Code);
            Assert.False(rig.BitTouched);
            Assert.Empty(rig.Db.Calls);
        }
        Assert.Equal(1100, LapsedTargets.MaxDays);

        using (var rig = new ListRig())
        {
            rig.Lapsed();
            var json = Protocol.Json.Parse(LapsedTargets.Build(rig.Rig.Services, yesterday.AddDays(-1099), yesterday));
            Assert.Equal("2023-10-26", json.GetProperty("from").GetString());
            Assert.Equal("2026-10-29", json.GetProperty("to").GetString());
            Assert.Empty(ListRig.Rows(json));
        }
    }

    [Fact(DisplayName = "AC-2801.3 장기 미방문 줄: [차트번호, 이름|null, 전화, 마지막 내원일, 진료 받은 날 수, 예약 있음 0|1, 마지막 진료 처방 [[코드, 이름|null], …]], 처방은 처음 나온 차례로 겹침 없이")]
    public void LapsedRows()
    {
        using var rig = new ListRig();
        rig.Lapsed(
            ListData.Lapsed("900001    ", " 가상환자01 ", "010-0000-0001", null, "20260915", 5, 1, "A49", "가짜주사약 "),
            ListData.Lapsed("900001    ", " 가상환자01 ", "010-0000-0001", null, "20260915", 5, 1, "B12", null),
            ListData.Lapsed("900001    ", " 가상환자01 ", "010-0000-0001", null, "20260915", 5, 1, "A49", "가짜주사약"),   // 같은 날 두 번째 접수의 같은 처방
            ListData.Lapsed("900002", "가상환자02", " ", "02-0000-0002", "20250301", 2, 0, null, null),                     // 처방 없음
            ListData.Lapsed("900003", null, null, null, "20260101", 3L, 0L, " c01 ", "  "));
        var json = rig.LapsedList("2024-10-31", "2026-09-30");

        Assert.Equal(new[]
        {
            "[\"900001\",\"가상환자01\",\"010-0000-0001\",\"20260915\",5,1,[[\"A49\",\"가짜주사약\"],[\"B12\",null]]]",
            "[\"900002\",\"가상환자02\",\"02-0000-0002\",\"20250301\",2,0,[]]",
            "[\"900003\",null,\"\",\"20260101\",3,0,[[\"C01\",null]]]",
        }, ListRig.Rows(json));
    }

    [Fact(DisplayName = "AC-2801.3 장기 미방문: 마지막 진료 처방은 처음 나온 차례로 20개까지(코드 차례로 다시 늘어놓지 않음), 환자 줄이 떨어져 와도 한 줄")]
    public void LapsedKeepsTwentyCodes()
    {
        using var rig = new ListRig();
        var codes = Enumerable.Range(1, 25).Reverse().Select(n => "R" + n.ToString("00", System.Globalization.CultureInfo.InvariantCulture)).ToArray();
        var rows = codes.Select(code => ListData.Lapsed("900001", "가상환자01", "010-0000-0001", null, "20260915", 4, 0, code, "가짜약" + code)).ToList();
        rows.Insert(3, ListData.Lapsed("900002", "가상환자02", "010-0000-0002", null, "20260801", 2, 0, "A49", null));
        rig.Lapsed(rows.ToArray());
        var json = rig.LapsedList("2024-10-31", "2026-09-30");

        var lines = json.GetProperty("rows").EnumerateArray().ToList();
        Assert.Equal(2, lines.Count);
        var rx = lines[0][6].EnumerateArray().Select(cell => cell[0].GetString()).ToArray();
        Assert.Equal(codes.Take(20).ToArray(), rx);
        Assert.Equal("가짜약R25", lines[0][6][0][1].GetString());
        Assert.Equal("900002", lines[1][0].GetString());
        Assert.Equal(20, LapsedTargets.MaxRx);
    }

    [Fact(DisplayName = "AC-2801.3 장기 미방문 SQL: 오늘 전 센 접수(이 병원 진료실)로 환자마다 마지막 내원·진료 받은 날 수, 2일 이상·마지막 내원 from~to, 예약 있음(오늘부터 WR·NR), 마지막 내원일 처방(원래 도구 조건)·그날 처방 이름")]
    public void LapsedSqlConditions()
    {
        var sql = Squash(ListSql.LapsedSql);

        Assert.StartsWith("WITH AllVisits AS ( SELECT c.OcmNum VisitId,NULLIF(RTRIM(c.OcmChtNum),'') PatientId,LEFT(c.OcmAcpDtm,8) VisitDay,c.OcmAcpDtm VisitDtm FROM dbo.OcmInf c WHERE c.OcmAcpDtm<@today AND "
            + "c.OcmPatTyp='O' AND c.OcmComStt IN ('WN','HN','TN','PN') AND c.OcmRsuYon<>'O' AND " + Hospital("c") + " ), ", sql, StringComparison.Ordinal);
        Assert.Contains("Patients AS ( SELECT PatientId,MAX(VisitDay) LastDay,COUNT(DISTINCT VisitDay) Days FROM AllVisits WHERE PatientId IS NOT NULL GROUP BY PatientId )", sql, StringComparison.Ordinal);
        Assert.Contains("Lapsed AS ( SELECT PatientId,LastDay,Days FROM Patients WHERE Days>=2 AND LastDay BETWEEN @from AND @to )", sql, StringComparison.Ordinal);

        // 마지막 내원일의 센 접수에 붙은 처방(원래 도구 VisitHours.CodeRowsSql과 같은 조건)
        Assert.Contains("LastRx AS ( SELECT v.PatientId,o.OdrCod,v.VisitDtm,v.VisitId,o.OdrSeq FROM Lapsed l JOIN AllVisits v ON v.PatientId=l.PatientId AND v.VisitDay=l.LastDay JOIN dbo.OdrInf o ON o.OdrOcmNum=v.VisitId "
            + "WHERE o.OdrDelFlg='N' AND o.OdrCanYon='N' AND o.OdrOutCod<>'99' AND RTRIM(ISNULL(o.OdrCod,''))<>'' )", sql, StringComparison.Ordinal);

        // 칸 차례: 차트번호·이름·휴대전화·집 전화·마지막 내원일·날 수·예약 있음·처방코드·처방 이름
        Assert.Contains(") SELECT l.PatientId,b.PbsPatNam,b.PbsCelPhn,b.PbsPhnNum,l.LastDay,l.Days, CASE WHEN EXISTS(SELECT 1 FROM dbo.OcmInf w WHERE w.OcmChtNum=l.PatientId AND w.OcmAcpDtm>=@today AND w.OcmPatTyp='O' AND w.OcmComStt IN ('WR','NR') AND "
            + Hospital("w") + ") THEN 1 ELSE 0 END Reserved, UPPER(RTRIM(x.OdrCod)) RxCode, "
            + "(SELECT TOP 1 s.SeeKorNam FROM dbo.SeeMst s WHERE s.SeeOdrCod=x.OdrCod AND l.LastDay BETWEEN s.SeeAdpDte AND s.SeeExpDte ORDER BY s.SeeAdpDte DESC,s.SeeExpDte DESC) RxName "
            + "FROM Lapsed l LEFT JOIN dbo.PbsInf b ON b.PbsChtNum=l.PatientId LEFT JOIN LastRx x ON x.PatientId=l.PatientId", sql, StringComparison.Ordinal);
        Assert.EndsWith("ORDER BY l.PatientId,x.VisitDtm,x.VisitId,x.OdrSeq", sql, StringComparison.Ordinal);
        Assert.Equal(2, Count(sql, "d.DepHspNum=@hospital"));
    }

    // ── AC-2801.4 전화 고르기·읽지 않는 칸 ───────────────────────────────

    [Theory(DisplayName = "AC-2801.4 전화: 휴대전화(PbsCelPhn)가 비지 않으면 그것, 아니면 집 전화(PbsPhnNum), 둘 다 비면 빈 글(앞뒤 빈칸 뺌) — 예약·장기 미방문 같다")]
    [InlineData(" 010-0000-0001 ", "02-0000-0001", "010-0000-0001")]
    [InlineData("   ", " 02-0000-0002 ", "02-0000-0002")]
    [InlineData(null, "02-0000-0003", "02-0000-0003")]
    [InlineData("", null, "")]
    [InlineData(null, null, "")]
    [InlineData(" ", " ", "")]
    public void PhoneChoice(string? cell, string? home, string expected)
    {
        using var rig = new ListRig();
        rig.Reservations(ListData.Reservation("900001", "가상환자01", cell, home, "202610311430", "WR", null, 0, null))
           .Lapsed(ListData.Lapsed("900001", "가상환자01", cell, home, "20260915", 2, 0, null, null));
        Assert.Equal(expected, rig.Reservation("2026-10-01", "2026-10-31").GetProperty("rows")[0][2].GetString());
        Assert.Equal(expected, rig.LapsedList("2025-10-01", "2026-09-30").GetProperty("rows")[0][2].GetString());
    }

    [Fact(DisplayName = "AC-2801.4 두 SQL은 이름(PbsPatNam)·전화 둘만 읽고 주민번호·주소·메모(OcmRefCmt·RsvRefCmt)는 읽지 않는다. 예약은 처방도 읽지 않고, 장기 미방문은 처방 코드·이름만")]
    public void ReadsOnlyNeededColumns()
    {
        string[] Columns(string sql, string prefix) =>
            Regex.Matches(sql, @"\b" + prefix + @"[A-Z][A-Za-z]*").Cast<Match>().Select(m => m.Value).Distinct().OrderBy(n => n, StringComparer.Ordinal).ToArray();

        foreach (var sql in new[] { ListSql.ReservationsSql, ListSql.LapsedSql })
        {
            Assert.Equal(new[] { "PbsCelPhn", "PbsChtNum", "PbsInf", "PbsPatNam", "PbsPhnNum" }, Columns(sql, "Pbs"));
            Assert.Equal(new[] { "OcmAcpDtm", "OcmChtNum", "OcmComStt", "OcmDepCod", "OcmInf", "OcmNum", "OcmPatTyp", "OcmRsuYon" }, Columns(sql, "Ocm"));
            foreach (var dropped in new[] { "ResNum", "Adr", "Addr", "RefCmt", "RefMem", "BilCmt", "Emr", "Birth", "BirDte", "Memo" })
            {
                Assert.DoesNotContain(dropped, sql, StringComparison.OrdinalIgnoreCase);
            }
        }

        Assert.Equal(new[] { "RsvDivTyp", "RsvInf", "RsvOcmNum", "RsvSts" }, Columns(ListSql.ReservationsSql, "Rsv"));
        Assert.Empty(Columns(ListSql.ReservationsSql, "Odr"));
        Assert.Empty(Columns(ListSql.ReservationsSql, "See"));

        Assert.Empty(Columns(ListSql.LapsedSql, "Rsv"));
        Assert.Equal(new[] { "OdrCanYon", "OdrCod", "OdrDelFlg", "OdrInf", "OdrOcmNum", "OdrOutCod", "OdrSeq" }, Columns(ListSql.LapsedSql, "Odr"));
        Assert.Equal(new[] { "SeeAdpDte", "SeeExpDte", "SeeKorNam", "SeeMst", "SeeOdrCod" }, Columns(ListSql.LapsedSql, "See"));
    }

    // ── AC-2801.6 새 SQL은 매개변수를 받는 SELECT 하나, 읽기 전용 검사를 지난다 ─────────────

    [Fact(DisplayName = "AC-2801.6 새 SQL 둘은 매개변수를 받는 SELECT 하나(; · 주석 · 쓰기·실행 낱말 없음)이고 Sql.IsAllowed·ReadOnlyGuard를 정해 둔 매개변수와 함께만 지난다(청구 Sql.All 밖)")]
    public void NewSqlIsGuardedSelect()
    {
        var forbidden = new Regex(@"\b(INSERT|UPDATE|DELETE|MERGE|EXEC|EXECUTE|DROP|ALTER|CREATE|TRUNCATE|INTO|GRANT|REVOKE|DENY|OPENROWSET|OPENQUERY|BULK|SHUTDOWN|DBCC|BACKUP|RESTORE|WAITFOR)\b|xp_|sp_", RegexOptions.IgnoreCase);
        Assert.Equal(new[] { ListSql.LapsedSql, ListSql.ReservationsSql }.OrderBy(s => s, StringComparer.Ordinal), ListSql.All.OrderBy(s => s, StringComparer.Ordinal));

        foreach (var sql in ListSql.All)
        {
            Assert.True(sql.StartsWith("SELECT ", StringComparison.Ordinal) || sql.StartsWith("WITH ", StringComparison.Ordinal));
            if (sql.StartsWith("WITH ", StringComparison.Ordinal)) Assert.Contains(") SELECT ", Squash(sql), StringComparison.Ordinal);
            Assert.DoesNotContain(";", sql);
            Assert.DoesNotContain("--", sql);
            Assert.DoesNotContain("/*", sql);
            Assert.DoesNotMatch(forbidden, sql);
            Assert.True(Sql.IsAllowed(sql));
            Assert.True(ListSql.IsAllowed(sql));
            Assert.DoesNotContain(sql, Sql.All);

            // 문장에 나오는 @이름 = 매개변수 표의 이름
            var used = Regex.Matches(sql, @"@[A-Za-z][A-Za-z0-9]*").Cast<Match>().Select(m => m.Value).Distinct().OrderBy(n => n, StringComparer.Ordinal);
            Assert.Equal(Sql.ParametersOf(sql).Select(p => p.Name).OrderBy(n => n, StringComparer.Ordinal), used);

            // 고친 글은 막는다
            Assert.False(Sql.IsAllowed(sql + " "));
            Assert.False(ListSql.IsAllowed(sql.Replace("@hospital", "'X'")));
        }
        Assert.False(ListSql.IsAllowed(null));
        Assert.False(ListSql.IsAllowed(Sql.ScopesSql));
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ListSql.ParametersOf(Sql.ScopesSql)).Code);

        Assert.Equal("@from:Char(12) @to:Char(12) @until:Char(12) @hospital:VarChar(32)", Shape(ListSql.ReservationsSql));
        Assert.Equal("@from:Char(8) @to:Char(8) @today:Char(12) @hospital:VarChar(32)", Shape(ListSql.LapsedSql));

        var reservationArgs = new Dictionary<string, object?> { ["@from"] = "202609300000", ["@to"] = "202611140000", ["@until"] = "202610310000", ["@hospital"] = Synthetic.Scope };
        var lapsedArgs = new Dictionary<string, object?> { ["@from"] = "20241031", ["@to"] = "20260930", ["@today"] = "202610300000", ["@hospital"] = Synthetic.Scope };
        ReadOnlyGuard.Require(ListSql.ReservationsSql, reservationArgs);
        ReadOnlyGuard.Require(ListSql.LapsedSql, lapsedArgs);

        // 표에 없는 매개변수·긴 값·빠진 값은 막는다
        var extra = new Dictionary<string, object?>(lapsedArgs) { ["@c0"] = "A49" };
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(ListSql.LapsedSql, extra)).Code);
        var longer = new Dictionary<string, object?>(lapsedArgs) { ["@from"] = "202410310000" };
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(ListSql.LapsedSql, longer)).Code);
        var missing = new Dictionary<string, object?>(reservationArgs);
        missing.Remove("@until");
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => ReadOnlyGuard.Require(ListSql.ReservationsSql, missing)).Code);
    }
}
