using System;
using System.Linq;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.InjectionMemo;
using Precheck.Core.Tests.Bit;
using Xunit;
using static Precheck.Core.Tests.InjectionMemo.Notes;

namespace Precheck.Core.Tests.InjectionMemo;

/// <summary>
/// spec injection-memo REQ-7507 골절 fx(FractureRule·DiagnosisSql·InjectionMemoService.Compute). 코드·증상 글·메모·차트번호는 지어낸 것이고
/// 부위 표는 notes/fracture.md, 예는 시안 docs/mockups/injection-memo('골절 환자는 fx도 같이')를 따른다. 비트 DB는 가짜(FakeDb).
/// </summary>
public class FractureTests
{
    /// <summary>오늘에서 daysAgo날 앞 내원 하나: 주상병 코드와 증상 줄.</summary>
    private static VisitNote Dx(int daysAgo, string code, params string[] lines) => new VisitNote(Today.AddDays(-daysAgo), lines, "", code);

    private static FakeDb Db(object?[][] visits, object?[][] lines, object?[][] diagnoses) =>
        new FakeDb()
            .Answer(InjectionSql.VisitsSql, _ => visits)
            .Answer(InjectionSql.LinesSql, _ => lines)
            .Answer(InjectionSql.DiagnosisSql, _ => diagnoses)
            .Answer(InjectionSql.XraySql, _ => new object?[][] { })
            .Answer(InjectionSql.LastBeforeSql, _ => new object?[][] { });

    private static object?[] Visit1(string id, string stamp, string memo = "") => new object?[] { id, stamp, memo };

    private static object?[] Line(string id, int seq, string text) => new object?[] { id, seq, text };

    private static object?[] MainDx(string id, string code) => new object?[] { id, code };

    // ── AC-7507.1 골절 주상병 ─────────────────────────────

    [Fact(DisplayName = "AC-7507.1 골절 코드: 앞이 S?2(S02~S92)·T02·T08·T10·T12·T142·M80·M484·M84면 골절(빈칸·소문자 정리), 그 밖은 아님")]
    public void FractureCodes()
    {
        foreach (var code in new[] { "S9230", "S923", "S0220", "S1210", "S2230", "S3200", "S4200", "S5250", "S6260", "S7200", "S8250", "T020", "T08", "T102", "T12", "T142", "M800", "M4840", "M8430", " s9230 " })
            Assert.True(FractureRule.IsFracture(code), code);
        foreach (var code in new[] { "S9300", "S8301", "S934", "M4800", "T141", "M17", "M5456", "S93", "", "   " })
            Assert.False(FractureRule.IsFracture(code), code);
        Assert.False(FractureRule.IsFracture(null));
    }

    [Fact(DisplayName = "AC-7507.1 30일 안 내원 중 주상병이 골절인 마지막 내원 하나, 없으면 fx 없음(null)")]
    public void LastFractureVisit()
    {
        Assert.Equal("왼)늑골 fx", FractureRule.Text(new[] { Dx(20, "S9230", "Rt. 5th MT fx"), Dx(5, "S2230", "Lt rib fx") }));
        Assert.Equal("오)발 fx", FractureRule.Text(new[] { Dx(20, "S9230", "Rt. 5th MT fx"), Dx(5, "M1706", "Lt knee OA") }));
        Assert.Null(FractureRule.Text(new[] { Dx(20, "M1706", "Rt knee OA"), Dx(5, "", "Rt. 5th MT fx") }));
        Assert.Null(FractureRule.Text(Array.Empty<VisitNote>()));
        Assert.Null(FractureRule.Text(null));
    }

    // ── AC-7507.2 부위·좌우·글 ─────────────────────────────

    [Theory(DisplayName = "AC-7507.2 부위는 notes/fracture.md 표(코드 앞 3글자 + 넷째 글자 → 직원 말), 표에 없는 골절 코드는 부위 없음")]
    [InlineData("S1200", "목")]
    [InlineData("S2200", "등")]
    [InlineData("S2210", "등")]
    [InlineData("S2220", "흉골")]
    [InlineData("S2230", "늑골")]
    [InlineData("S2240", "늑골")]
    [InlineData("S2250", "늑골")]
    [InlineData("S3200", "허리")]
    [InlineData("S3210", "꼬리뼈")]
    [InlineData("S3220", "꼬리뼈")]
    [InlineData("S3230", "골반")]
    [InlineData("S3250", "골반")]
    [InlineData("S4200", "쇄골")]
    [InlineData("S4210", "어깨")]
    [InlineData("S4220", "어깨")]
    [InlineData("S4230", "어깨")]
    [InlineData("S4240", "팔꿈치")]
    [InlineData("S4270", "팔")]
    [InlineData("S5200", "팔꿈치")]
    [InlineData("S5210", "팔꿈치")]
    [InlineData("S5220", "팔")]
    [InlineData("S5250", "손목")]
    [InlineData("S5260", "손목")]
    [InlineData("S6200", "손목")]
    [InlineData("S6210", "손목")]
    [InlineData("S6220", "손목")]
    [InlineData("S6230", "수지")]
    [InlineData("S6250", "수지")]
    [InlineData("S6260", "수지")]
    [InlineData("S6270", "수지")]
    [InlineData("S6280", "손")]
    [InlineData("S7200", "고관절")]
    [InlineData("S7220", "고관절")]
    [InlineData("S7230", "허벅지")]
    [InlineData("S8200", "무릎")]
    [InlineData("S8210", "무릎")]
    [InlineData("S8220", "다리")]
    [InlineData("S8250", "발목")]
    [InlineData("S8260", "발목")]
    [InlineData("S8280", "발목")]
    [InlineData("S8290", "다리")]
    [InlineData("S9200", "발")]
    [InlineData("S9230", "발")]
    [InlineData("S9240", "족지")]
    [InlineData("S9250", "족지")]
    [InlineData("S9290", "발")]
    [InlineData("S923", "발")]
    [InlineData("S0220", "")]
    [InlineData("T08", "")]
    [InlineData("M800", "")]
    [InlineData("M1706", "")]
    public void PartTable(string code, string part)
    {
        Assert.Equal(part, FractureRule.PartOf(code));
    }

    [Fact(DisplayName = "AC-7507.2 좌우는 그 내원 fx·골절·fracture 줄(서류 말 뺌)의 첫 좌우 말, 가운데 부위·부위 없음은 좌우 없음: '<좌우>)<부위> fx'·'<부위> fx'·'fx'")]
    public void SideFromFxLine()
    {
        Assert.Equal("오)발 fx", FractureRule.Text(new[] { Dx(5, "S9230", "Lt knee OA", "Rt. 5th MT fx") }));
        Assert.Equal("오)족지 fx", FractureRule.Text(new[] { Dx(5, "S9250", "우측 4지 골절") }));
        Assert.Equal("왼)손목 fx", FractureRule.Text(new[] { Dx(5, "S5250", "Lt distal radius FX") }));
        Assert.Equal("양)발목 fx", FractureRule.Text(new[] { Dx(5, "S8250", "both ankle fracture") }));
        Assert.Equal("왼)수지 fx", FractureRule.Text(new[] { Dx(5, "S6260", "왼손 5지 Fx") }));
        Assert.Equal("발 fx", FractureRule.Text(new[] { Dx(5, "S9230", "Rt knee pain", "5th MT fx") }));
        Assert.Equal("발 fx", FractureRule.Text(new[] { Dx(5, "S9230", "Lt 골절진단서 요청", "발등 통증") }));
        Assert.Equal("허리 fx", FractureRule.Text(new[] { Dx(5, "S3200", "Rt L1 compression fx") }));
        Assert.Equal("늑골 fx", FractureRule.Text(new[] { Dx(5, "S2230", "rib fx 양호") }));
        Assert.Equal("fx", FractureRule.Text(new[] { Dx(5, "S0220", "Rt nasal bone fx") }));
    }

    // ── AC-7507.3 [주사 차수]에 같이 넣기 ─────────────────────────────

    [Fact(DisplayName = "AC-7507.3 칸에 fx가 있나: 'fx' 낱말(대소문자 무시)·서류 말이 아닌 '골절'")]
    public void MemoHasFx()
    {
        foreach (var memo in new[] { "오)발 fx", "FX", "왼)늑골Fx 3주", "오)무릎 3차/오)발fx", "골절", "발 골절 3주", "fracture" })
            Assert.True(FractureRule.HasFx(memo), memo);
        foreach (var memo in new[] { "", "오)무릎 3차", "골절진단서 원하심", "골절 소견서", "fix", "xr2년경과", "efx" })
            Assert.False(FractureRule.HasFx(memo), memo);
        Assert.False(FractureRule.HasFx(null));
    }

    [Fact(DisplayName = "AC-7507.3 서비스: fx 글을 앞에, 주사 차수 글을 '/' 뒤에 한 번에, 칸에 글이 있으면 '있던 글/…'")]
    public void ServiceInsertsFxFirst()
    {
        var db = Db(
            new[] { Visit1("V1", "202611131000") },
            new[] { Line("V1", 1, "Rt. 5th MT fx"), Line("V1", 2, "오른쪽 무릎 2차 주사 시행 + FNB") },
            new[] { MainDx("V1", "S9230") });
        var result = InjectionMemoService.Compute(db, Chart, "", Today);
        Assert.Equal(MemoResultKind.Insert, result.Kind);
        Assert.Equal("오)발 fx/오)무릎 3차", result.Text);
        Assert.Equal("오)발 fx/오)무릎 3차", result.Append);
        Assert.Equal("넣었어요: 오)발 fx/오)무릎 3차", MemoNotices.Of(result));

        var withText = InjectionMemoService.Compute(db, Chart, "물리치료만", Today);
        Assert.Equal("/오)발 fx/오)무릎 3차", withText.Append);
    }

    [Fact(DisplayName = "AC-7507.3 주사 차수가 기록 없음·일찍 옴·이미 있음이어도 fx가 있으면 fx만 넣고 초록 '넣었어요' 하나")]
    public void FxAloneWhenNoInjection()
    {
        var noRecord = Db(new[] { Visit1("V1", "202611131000") }, new[] { Line("V1", 1, "Lt rib fx") }, new[] { MainDx("V1", "S2230") });
        var result = InjectionMemoService.Compute(noRecord, Chart, "", Today);
        Assert.Equal(MemoResultKind.Insert, result.Kind);
        Assert.Equal("왼)늑골 fx", result.Text);
        Assert.Equal("넣었어요: 왼)늑골 fx", MemoNotices.Of(result));

        var early = Db(new[] { Visit1("V1", "202611180930") }, new[] { Line("V1", 1, "Rt. 5th MT fx"), Line("V1", 2, "1주뒤 2차 주사") }, new[] { MainDx("V1", "S9230") });
        Assert.Equal("오)발 fx", InjectionMemoService.Compute(early, Chart, "", Today).Text);

        var toe = Db(new[] { Visit1("V1", "202611131000") }, new[] { Line("V1", 1, "우측 4지 골절") }, new[] { MainDx("V1", "S9250") });
        var has = InjectionMemoService.Compute(toe, Chart, "오)무릎 3차", Today);
        Assert.Equal(MemoResultKind.Insert, has.Kind);
        Assert.Equal("오)족지 fx", has.Text);
        Assert.Equal("/오)족지 fx", has.Append);
    }

    [Fact(DisplayName = "AC-7507.3 칸에 fx가 있으면 fx는 안 넣고(주상병 안 읽음) 주사 차수만, 차수와 fx가 다 있으면 DB에 묻지 않고 이미 있음, 서류 말 '골절'은 fx 아님")]
    public void ExistingFxSkips()
    {
        var db = Db(
            new[] { Visit1("V1", "202611131000") },
            new[] { Line("V1", 1, "Rt. 5th MT fx"), Line("V1", 2, "오른쪽 무릎 2차 주사 시행") },
            new[] { MainDx("V1", "S9230") });
        var result = InjectionMemoService.Compute(db, Chart, "오)발 fx", Today);
        Assert.Equal("오)무릎 3차", result.Text);
        Assert.Equal("/오)무릎 3차", result.Append);
        Assert.DoesNotContain(InjectionSql.DiagnosisSql, db.Sqls);

        var none = new FakeDb();
        Assert.Equal(MemoResultKind.AlreadyHas, InjectionMemoService.Compute(none, Chart, "오)무릎 3차/오)발 fx", Today).Kind);
        Assert.Empty(none.Calls);

        var doc = InjectionMemoService.Compute(db, Chart, "골절진단서 원하심", Today);
        Assert.Equal("오)발 fx/오)무릎 3차", doc.Text);
        Assert.Equal("/오)발 fx/오)무릎 3차", doc.Append);
    }

    [Fact(DisplayName = "AC-7507.3 [엑스레이]는 fx를 보지 않는다(주상병 안 읽음)")]
    public void XrayIgnoresFx()
    {
        var db = Db(
            new[] { Visit1("V1", "202611131000") },
            new[] { Line("V1", 1, "Rt. 5th MT fx"), Line("V1", 2, "오른쪽 무릎 2차 주사 시행") },
            new[] { MainDx("V1", "S9230") });
        var result = InjectionMemoService.ComputeXray(db, Chart, "", Today, MemoSettings.Defaults.XrayParts.ToArray());
        Assert.DoesNotContain("fx", result.Text);
        Assert.DoesNotContain(InjectionSql.DiagnosisSql, db.Sqls);
    }

    // ── AC-7507.5 족지·수지 번호 ─────────────────────────────

    [Fact(DisplayName = "AC-7507.5 족지·수지는 몇 번째를 앞에: 엄지 코드(S92.4·S62.5)는 1, 그 밖은 30일 증상 줄의 '<1~5>st·nd·rd·th' + toe·finger·MT·MC …(골절 내원 줄 먼저, 다른 내원은 최근부터), thumb·great toe·hallux 1·little·small 5, 여럿이면 쉼표, 못 읽으면 번호 없이")]
    public void DigitNumber()
    {
        Assert.Equal("오)4족지 fx", FractureRule.Text(new[] { Dx(5, "S9250", "Rt 4th toe fx") }));
        Assert.Equal("왼)3,4수지 fx", FractureRule.Text(new[] { Dx(5, "S6260", "Lt 3rd, 4th finger fx") }));
        Assert.Equal("왼)3,4수지 fx", FractureRule.Text(new[] { Dx(5, "S6260", "Lt 4th, 3rd finger, 3rd finger fx") }));
        Assert.Equal("왼)1족지 fx", FractureRule.Text(new[] { Dx(5, "S9240", "Lt hallux fx") }));
        Assert.Equal("왼)1족지 fx", FractureRule.Text(new[] { Dx(5, "S9240", "Lt 3rd toe fx") }));
        Assert.Equal("오)1수지 fx", FractureRule.Text(new[] { Dx(5, "S6250", "Rt finger fx") }));
        Assert.Equal("오)1수지 fx", FractureRule.Text(new[] { Dx(5, "S6260", "Rt thumb fx") }));
        Assert.Equal("오)1족지 fx", FractureRule.Text(new[] { Dx(5, "S9250", "Rt great toe fx") }));
        Assert.Equal("오)5족지 fx", FractureRule.Text(new[] { Dx(5, "S9250", "Rt 5th MT base fx") }));
        Assert.Equal("오)2족지 fx", FractureRule.Text(new[] { Dx(5, "S9250", "Rt 2ND TOE fx") }));
        Assert.Equal("왼)5수지 fx", FractureRule.Text(new[] { Dx(5, "S6260", "Lt little finger fx") }));
        Assert.Equal("왼)5수지 fx", FractureRule.Text(new[] { Dx(5, "S6260", "Lt small finger FX") }));

        // 골절 내원 줄에 번호가 없으면 다른 내원(최근부터), 골절 내원 줄이 먼저
        Assert.Equal("오)4족지 fx", FractureRule.Text(new[] { Dx(20, "", "Rt 4th toe pain"), Dx(5, "S9250", "Rt toe fx") }));
        Assert.Equal("오)3족지 fx", FractureRule.Text(new[] { Dx(10, "", "Rt 4th toe"), Dx(5, "S9250", "Rt 3rd toe fx") }));
        Assert.Equal("오)2족지 fx", FractureRule.Text(new[] { Dx(25, "", "4th toe"), Dx(20, "", "2nd toe"), Dx(5, "S9250", "Rt toe fx") }));
        Assert.Equal("오)4족지 fx", FractureRule.Text(new[] { Dx(5, "S9250", "Rt toe fx", "4th toe swelling") }));

        // 못 읽으면 번호 없이: 우리말 꼴·6 이상·toe에서 10글자 넘게 떨어짐
        Assert.Equal("오)족지 fx", FractureRule.Text(new[] { Dx(5, "S9250", "우측 4지 골절") }));
        Assert.Equal("오)족지 fx", FractureRule.Text(new[] { Dx(5, "S9250", "Rt 6th toe fx") }));
        Assert.Equal("오)족지 fx", FractureRule.Text(new[] { Dx(5, "S9250", "Rt 4th week after injury, toe fx") }));

        // 족지·수지가 아니면 번호 안 붙임(중족골은 '발')
        Assert.Equal("오)발 fx", FractureRule.Text(new[] { Dx(5, "S9230", "Rt 5th MT fx") }));
    }

    // ── AC-7507.4 주상병 읽기 ─────────────────────────────

    [Fact(DisplayName = "AC-7507.4 문장: 읽기 전용 SELECT(그 30일 외래 내원들의 OicInf OicIcdPri='1'), 허용 목록·@cht·@from·@to")]
    public void DiagnosisSqlIsGuarded()
    {
        var sql = InjectionSql.DiagnosisSql;
        Assert.StartsWith("SELECT ", sql, StringComparison.Ordinal);
        foreach (var bad in new[] { ";", "--", "/*", "\r" })
            Assert.DoesNotContain(bad, sql);
        Assert.DoesNotMatch(new Regex(@"\b(INSERT|UPDATE|DELETE|MERGE|EXEC|DROP|ALTER|CREATE|INTO)\b|xp_|sp_", RegexOptions.IgnoreCase), sql);
        foreach (var part in new[] { "JOIN dbo.OicInf i ON i.OicOcmNum=c.OcmNum", "i.OicIcdPri='1'", "LTRIM(RTRIM(b.PbsChtNum))=@cht", "c.OcmAcpDtm>=@from", "c.OcmAcpDtm<@to", "c.OcmPatTyp='O'", "c.OcmRsuYon<>'O'" })
            Assert.Contains(part, sql);
        Assert.True(Sql.IsAllowed(sql));
        Assert.True(InjectionSql.IsAllowed(sql));
        Assert.DoesNotContain(sql, Sql.All);
        Assert.Equal("@cht:VarChar(14) @from:Char(12) @to:Char(12)", string.Join(" ", Sql.ParametersOf(sql).Select(p => p.Name + ":" + p.Kind + "(" + p.Size + ")")));
    }

    [Fact(DisplayName = "AC-7507.4 Read(withDiagnoses): 주상병 코드(빈칸 빼고 대문자)를 내원에 잇고, 모르는 내원은 버림, 안 물으면 주상병 문장을 안 돌림·빈 글")]
    public void ReadsDiagnoses()
    {
        var db = Db(
            new[] { Visit1("V1", "202611100900"), Visit1("V2", "202611130900") },
            new[] { Line("V1", 1, "Rt. 5th MT fx") },
            new[] { MainDx("V2", " s2230 "), MainDx("V9", "S9230") });
        var notes = InjectionReader.Read(db, Chart, Today, withDiagnoses: true);
        Assert.Equal(new[] { "", "S2230" }, notes.Select(n => n.MainDiagnosis).ToArray());
        var call = db.Calls.Single(c => c.Sql == InjectionSql.DiagnosisSql);
        Assert.Equal("90001", call.Args["@cht"]);
        Assert.Equal("202610210000", call.Args["@from"]);
        Assert.Equal("202611200000", call.Args["@to"]);
        Assert.Equal(TimeSpan.FromSeconds(5), call.Timeout);

        var plain = Db(new[] { Visit1("V1", "202611100900") }, new object?[][] { }, new[] { MainDx("V1", "S9230") });
        Assert.Equal("", InjectionReader.Read(plain, Chart, Today).Single().MainDiagnosis);
        Assert.DoesNotContain(InjectionSql.DiagnosisSql, plain.Sqls);
        Assert.Equal("", new VisitNote(Today, new string[0], "").MainDiagnosis);
    }

    [Fact(DisplayName = "AC-7507.4 주상병 읽기 실패·시간 지남은 읽기 실패(Failed)")]
    public void DiagnosisFailureIsFailed()
    {
        var db = new FakeDb()
            .Answer(InjectionSql.VisitsSql, _ => new[] { Visit1("V1", "202611131000") })
            .Answer(InjectionSql.LinesSql, _ => new[] { Line("V1", 1, "오른쪽 무릎 2차 주사 시행") })
            .Fail(InjectionSql.DiagnosisSql, BitErrors.ReadFailed);
        Assert.Equal(MemoResultKind.Failed, InjectionMemoService.Compute(db, Chart, "", Today).Kind);
        var slow = new FakeDb()
            .Answer(InjectionSql.VisitsSql, _ => new[] { Visit1("V1", "202611131000") })
            .Answer(InjectionSql.LinesSql, _ => new object?[][] { })
            .Answer(InjectionSql.DiagnosisSql, _ => throw new TimeoutException());
        Assert.Equal(MemoResultKind.Failed, InjectionMemoService.Compute(slow, Chart, "오)무릎 3차", Today).Kind);
    }
}
