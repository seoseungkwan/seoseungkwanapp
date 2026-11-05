using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.Reception.Check;
using Precheck.Core.Tests.Protocol;
using Xunit;
using static Precheck.Core.Tests.Reception.Check.CheckFakes;

namespace Precheck.Core.Tests.Reception.Check;

/// <summary>
/// 확인 고침 2(TASK-33): 증상 글 세기 틀(ProbeSql.TextCount, AC-1401.17·AC-1401.9). 칸 값은 DB 안에서 세기만 하고 친 글은 @text 매개변수로만 간다.
/// 칸 이름(EmrInf·EmrCCVal 등)은 의원 PC 1회차 보고서의 후보 이름이고, 시험의 칸 모양(형식·길이)은 지은 것이다.
/// </summary>
public class CheckSymptomSqlTests
{
    private static ProbeSchema EmrSchema => ProbeSchema.From(new IReadOnlyList<object?>[]
    {
        new object?[] { "EmrInf", "EmrOcmNum", "varchar" },
        new object?[] { "EmrInf", "EmrCCVal", "text" },
        new object?[] { "EmrInf", "EmrSeq", "int" },
    });

    [Fact(DisplayName = "AC-1401.17 증상 글 세기 틀은 이름표에 있는 표·칸을 [ ]로 감싸 SELECT 하나로 줄 수·빈 글 아닌 줄·친 글을 품은 줄·최소·최대 길이만 센다")]
    public void TextCountShape()
    {
        var sql = ProbeSql.TextCount(EmrSchema, "EmrInf", "EmrOcmNum", "EmrCCVal");

        Assert.StartsWith("SELECT COUNT_BIG(*) ", sql, StringComparison.Ordinal);
        Assert.Contains("FROM dbo.[EmrInf] t", sql);
        Assert.Contains("CAST(t.[EmrCCVal] AS nvarchar(max))", sql);
        Assert.Contains("CHARINDEX(@text,", sql);
        Assert.Contains("WHERE t.[EmrOcmNum] IN (SELECT c.OcmNum FROM dbo.OcmInf c", sql);
        // 그날 범위 + 등록 병원 범위(CheckSql.TodayScope와 같은 글)
        Assert.Contains("c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O'", sql);
        Assert.Contains("d.DepHspNum=@hospital", sql);
        Assert.Contains("MIN(", sql);
        Assert.Contains("MAX(", sql);
        // 칸 값을 돌려주지 않는다: 집계만
        Assert.DoesNotContain("SELECT t.", sql);
        Assert.DoesNotContain("TOP ", sql);
        // 읽기만
        foreach (var word in new[] { "INSERT", "UPDATE", "DELETE", "EXEC", "MERGE", "DROP", "ALTER", "INTO", ";" }) Assert.DoesNotContain(word, sql.ToUpperInvariant());
    }

    [Fact(DisplayName = "AC-1401.17 매개변수는 @from·@to Char(12), @hospital VarChar(32), 친 글 @text VarChar(200) 넷뿐이다")]
    public void TextCountParameters()
    {
        var parameters = ProbeSql.TextCountParameters;

        Assert.Equal(new[] { "@from", "@to", "@hospital", "@text" }, parameters.Select(p => p.Name));
        Assert.Equal(SqlParamKind.Char, parameters[0].Kind);
        Assert.Equal(12, parameters[0].Size);
        Assert.Equal(SqlParamKind.VarChar, parameters[2].Kind);
        Assert.Equal(SqlParamKind.VarChar, parameters[3].Kind);
        Assert.Equal(200, parameters[3].Size);
    }

    [Fact(DisplayName = "AC-1401.9 IsTextCount는 TextCount로 만든 글만 받고, 고친 글·다른 틀·도우미 문장은 받지 않으며 IsProbe·Sql.IsAllowed·CheckSql은 이 틀을 받지 않는다")]
    public void OnlyBuiltTextIsAccepted()
    {
        var sql = ProbeSql.TextCount(EmrSchema, "EmrInf", "EmrOcmNum", "EmrCCVal");

        Assert.True(ProbeSql.IsTextCount(sql));
        Assert.False(ProbeSql.IsProbe(sql));
        Assert.False(Sql.IsAllowed(sql));
        Assert.False(CheckSql.IsAllowed(sql));

        Assert.False(ProbeSql.IsTextCount(null));
        Assert.False(ProbeSql.IsTextCount(""));
        Assert.False(ProbeSql.IsTextCount(sql + " "));
        Assert.False(ProbeSql.IsTextCount(sql + ";DELETE FROM dbo.OcmInf"));
        Assert.False(ProbeSql.IsTextCount(sql.Replace("[EmrCCVal]", "[EmrCCVal];DROP TABLE x--")));
        Assert.False(ProbeSql.IsTextCount(sql.Replace("@text", "'a'")));
        Assert.False(ProbeSql.IsTextCount(sql.Replace("dbo.[EmrInf]", "dbo.[Emr Inf]")));
        Assert.False(ProbeSql.IsTextCount(ProbeSql.VisitLinked(EmrSchema, "EmrInf", "EmrOcmNum", "EmrCCVal")));
        Assert.False(ProbeSql.IsTextCount(CheckSql.StatusPairs));
    }

    [Theory(DisplayName = "AC-1401.9 이름표에 없거나 모양이 틀린 표·칸 이름이면 DB에 닿기 전에 E-BIT-READ-FAILED")]
    [InlineData("EmrInf", "EmrOcmNum", "EmrPIVal")]
    [InlineData("ShtInf", "EmrOcmNum", "EmrCCVal")]
    [InlineData("EmrInf", "EmrNum", "EmrCCVal")]
    [InlineData("EmrInf]", "EmrOcmNum", "EmrCCVal")]
    [InlineData("EmrInf", "EmrOcmNum", "EmrCCVal]")]
    public void UnknownNamesBlocked(string table, string visit, string text)
    {
        var error = Assert.Throws<BitException>(() => ProbeSql.TextCount(EmrSchema, table, visit, text));
        Assert.Equal(BitErrors.ReadFailed, error.Code);
    }

    [Fact(DisplayName = "AC-1401.9 CheckBitDb는 실행 전에 ProbeSql.IsTextCount와 그 매개변수 표(TextCountParameters)로 증상 글 세기 틀을 받는다")]
    public void BitDbAcceptsTextCount()
    {
        var source = File.ReadAllText(Repo.PathOf("helper", "src", "Precheck.Windows", "CheckBitDb.cs"));
        var code = Regex.Replace(source, @"//.*$", "", RegexOptions.Multiline);

        Assert.Contains("ProbeSql.IsTextCount(sql)", code);
        Assert.Contains("declared = ProbeSql.TextCountParameters;", code);
    }
}

/// <summary>
/// 증상 글 찾기 단계(6/8, AC-1401.17): 사람이 친 지난 진료의 증상 글 조각으로 후보 칸마다 지난 14일 줄을 DB 안에서 센다.
/// 친 글은 @text 매개변수로만 가고 보고서·콘솔 기록·필드에 없다.
/// </summary>
public class CheckSymptomRunnerTests
{
    private const string Prompt = "비트에서 지난 진료 한 건의 증상 글을 보고, 두 글자 이상 그대로 쳐 주세요. 모르면 엔터만 누르세요.";
    private const string Typed = " 허리  통증\t3일 ";

    /// <summary>후보 표(가짜 모양): EmrInf(내원번호 EmrOcmNum, EmrCCVal text, EmrPIVal varchar, EmrShtVal 없음), EmrETCInf, OcmInf.OcmDtrCmt는 int, ShtInf는 내원번호 칸 없음(답에 없음).</summary>
    private static readonly object?[][] Candidates =
    {
        Col("EmrInf", "EmrOcmNum", "varchar", 12),
        Col("EmrInf", "EmrCCVal", "text", 2147483647),
        Col("EmrInf", "EmrPIVal", "varchar", 4000),
        Col("EmrETCInf", "EmrETCOcmNum", "varchar", 12),
        Col("EmrETCInf", "EmrETCShtVal", "ntext", 1073741823),
        Col("OcmInf", "OcmDtrCmt", "int", null),
    };

    private static ProbeSchema FullSchema => ProbeSchema.From(MainColumns.Concat(LinkedColumns).Concat(Candidates));

    private static Harness WithCandidates()
    {
        var h = new Harness();
        h.Db.Answer(CheckSql.LinkedColumns, LinkedColumns.Concat(Candidates).ToArray());
        var schema = FullSchema;
        h.Db.Answer(ProbeSql.TextCount(schema, "EmrInf", "EmrOcmNum", "EmrCCVal"), new object?[] { 5L, 4L, 2L, 3L, 40L });
        h.Db.Answer(ProbeSql.TextCount(schema, "EmrInf", "EmrOcmNum", "EmrPIVal"), new object?[] { 5L, 0L, 0L, null, null });
        h.Db.Answer(ProbeSql.TextCount(schema, "EmrETCInf", "EmrETCOcmNum", "EmrETCShtVal"), new object?[] { 0L, 0L, 0L, null, null });
        return h;
    }

    private static List<Call> Counts(Harness h) => h.Db.Calls.Where(c => ProbeSql.IsTextCount(c.Sql)).ToList();

    [Fact(DisplayName = "AC-1401.17 친 증상 글(공백 뺌)로 지난 14일 외래 접수에 붙은 후보 칸마다 줄 수·빈 글 아닌 줄·품은 줄·최소·최대 길이를 적고, 없는 칸·내원번호 없는 표·글자 아닌 칸은 문장 없이 적는다")]
    public void CountsCandidateColumns()
    {
        using var h = WithCandidates();
        h.Console.Answer = last => last == LoginQuestion ? "" : last.Contains("증상 글(") ? Typed : "";

        var lines = Harness.Lines(h.Run());

        Assert.Contains(Prompt, h.Console.Written);
        Assert.Contains("symptomSearch days=14", lines);
        Assert.Contains("symptom col=EmrInf.EmrCCVal rows=5 nonEmpty=4 containing=2 minLength=3 maxLength=40", lines);
        Assert.Contains("symptom col=EmrInf.EmrPIVal rows=5 nonEmpty=0 containing=0 minLength=? maxLength=?", lines);
        Assert.Contains("symptom col=EmrInf.EmrShtVal result=missing", lines);
        Assert.Contains("symptom col=ShtInf.EmrChtVal result=noVisitLink", lines);
        Assert.Contains("symptom col=EmrETCInf.EmrETCShtVal rows=0 nonEmpty=0 containing=0 minLength=? maxLength=?", lines);
        Assert.Contains("symptom col=OcmInf.OcmDtrCmt result=notText", lines);
        Assert.Contains("symptom col=OcmInf.OcmCstCmt result=missing", lines);

        // 후보 칸 차례대로 한 줄씩, 문장은 있는 글자 칸 셋만
        var order = lines.Where(l => l.StartsWith("symptom col=", StringComparison.Ordinal)).Select(l => l.Split(' ')[1]).ToArray();
        Assert.Equal(new[]
        {
            "col=EmrInf.EmrCCVal", "col=EmrInf.EmrPIVal", "col=EmrInf.EmrShtVal", "col=ShtInf.EmrChtVal", "col=EmrETCInf.EmrETCShtVal", "col=OcmInf.OcmDtrCmt", "col=OcmInf.OcmCstCmt",
        }, order);
        var counts = Counts(h);
        Assert.Equal(3, counts.Count);

        // 지난 14일(오늘 포함) + 등록 병원, 친 글은 공백·탭을 뺀 글로 @text에만
        Assert.All(counts, c => Assert.Equal(Stamp(Today.AddDays(-14)), c.From));
        Assert.All(counts, c => Assert.Equal(Stamp(Today.AddDays(1)), c.Args["@to"]));
        Assert.All(counts, c => Assert.Equal(Hospital, c.Args["@hospital"]));
        Assert.All(counts, c => Assert.Equal("허리통증3일", c.Args["@text"]));
        Assert.DoesNotContain(h.Db.Calls, c => c.Sql.Contains("허리"));
        Assert.DoesNotContain(h.Db.Calls, c => !ProbeSql.IsTextCount(c.Sql) && c.Args.Values.Any(v => v is string text && text.Contains("허리")));
    }

    [Fact(DisplayName = "AC-1401.17 친 증상 글은 보고서·콘솔 기록에 없고, 끝난 뒤 확인 차례의 필드에도 없다")]
    public void TypedTextNotKept()
    {
        using var h = WithCandidates();
        h.Console.Answer = last => last.Contains("증상 글(") ? Typed : "";

        CheckRunner runner;
        string path;
        using (var report = CheckReport.Create(Path.Combine(h.Folder, "app"), Path.Combine(h.Folder, "temp"), h.Clock.Now))
        {
            path = report.FilePath;
            runner = NewRunner(h.Console, h.Db.Open, () => null, h.Screen.Read, report, h.Clock.Read);
            runner.Run();
        }
        var text = File.ReadAllText(path);

        Assert.NotEmpty(Counts(h));
        Assert.Contains("symptom col=EmrInf.EmrCCVal rows=5 ", text);
        Assert.DoesNotContain("허리", text);
        Assert.DoesNotContain("통증", text);
        Assert.DoesNotContain("허리", h.Console.Text);
        Assert.DoesNotContain("통증", h.Console.Text);
        foreach (var field in typeof(CheckRunner).GetFields(BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public))
        {
            var value = field.GetValue(runner);
            if (value is string kept) Assert.DoesNotContain("허리", kept);
            Assert.False(value is IEnumerable<string> texts && texts.Any(t => t != null && t.Contains("허리")), field.Name);
        }
    }

    [Theory(DisplayName = "AC-1401.17 엔터만·공백만·한 글자·입력 끝이면 symptomSearch 건너뜀이고 세기 문장을 돌리지 않는다")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(" 허 ")]
    [InlineData(null)]
    public void SkipsShortInput(string? typed)
    {
        using var h = WithCandidates();
        h.Console.Answer = last => last.Contains("증상 글(") ? typed : "";

        var lines = Harness.Lines(h.Run());

        Assert.Contains("symptomSearch 건너뜀", lines);
        Assert.DoesNotContain(lines, l => l.StartsWith("symptom col=", StringComparison.Ordinal) && !l.Contains(" compared="));
        Assert.Empty(Counts(h));
    }

    [Fact(DisplayName = "AC-1401.17 친 글이 100글자보다 길면 앞 100글자만 @text로 보낸다")]
    public void LongInputCut()
    {
        using var h = WithCandidates();
        var longText = new string('가', 150);
        h.Console.Answer = last => last.Contains("증상 글(") ? longText : "";

        h.Run();

        var counts = Counts(h);
        Assert.NotEmpty(counts);
        Assert.All(counts, c => Assert.Equal(new string('가', 100), c.Args["@text"]));
    }

    [Fact(DisplayName = "AC-1401.17 세기 문장이 실패하면 그 칸만 실패(번호)로 적고 다음 칸·다음 단계로 간다")]
    public void FailedCountContinues()
    {
        using var h = WithCandidates();
        h.Console.Answer = last => last.Contains("증상 글(") ? Typed : "";
        h.Db.OnQuery = call =>
        {
            if (ProbeSql.IsTextCount(call.Sql) && call.Sql.Contains("[EmrCCVal]")) throw new SqlException(207);
        };

        var lines = Harness.Lines(h.Run());

        Assert.Contains("symptom col=EmrInf.EmrCCVal result=실패(SqlException 207)", lines);
        Assert.Contains("symptom col=EmrInf.EmrPIVal rows=5 nonEmpty=0 containing=0 minLength=? maxLength=?", lines);
        Assert.Contains(lines, l => l.StartsWith("speed name=TodayVisits ", StringComparison.Ordinal));
    }

    [Fact(DisplayName = "AC-1401.17 콘솔 단계 표시는 1/8~8/8이고 증상 글 찾기는 6/8(접수 메모 5/8 다음, 모양 7/8 앞)이다")]
    public void StepNumbers()
    {
        using var h = WithCandidates();

        h.Run();

        var steps = h.Console.Written.Where(l => Regex.IsMatch(l, @"^\d/\d ")).Select(l => l.Substring(0, 3)).ToArray();
        Assert.Equal(new[] { "1/8", "2/8", "3/8", "4/8", "5/8", "6/8", "7/8", "8/8" }, steps);
        var six = h.Console.Written.FindIndex(l => l.StartsWith("6/8 ", StringComparison.Ordinal));
        var prompt = h.Console.Written.IndexOf(Prompt);
        Assert.True(six >= 0 && prompt > six, "6/8 안내 뒤에 증상 글을 묻는다");
        Assert.True(prompt < h.Console.Written.FindIndex(l => l.StartsWith("7/8 ", StringComparison.Ordinal)));
    }
}
