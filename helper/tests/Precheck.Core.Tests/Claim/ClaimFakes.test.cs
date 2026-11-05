using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Claim;

/// <summary>
/// TASK-8 시험이 같이 쓰는 가짜 한 달 자료. 모두 지어낸 것이다: 이름 '가상환자NN', 차트번호 9로 시작하는 6자리,
/// 코드·상병은 모양만 맞춘 값. 실제 비트 내보내기·환자 자료가 아니다(design.md 10절).
/// </summary>
internal static class ClaimData
{
    public static readonly string[] SymptomHeader = { "No", "내원번호", "차트번호", "주민번호", "환자명", "전화번호", "증상", "기록날짜", "진료의" };
    public static readonly string[] DiagnosisHeader = { "내원번호", "차트번호", "환자명", "상병청구코드", "상병명칭", "주상병여부", "산정특례기호", "과목코드", "진단일자", "주소" };
    public static readonly string[] PrescriptionHeader = { "차트번호", "환자명", "주민번호", "처방일자", "처방코드", "처방명칭", "급여구분", "총투여량", "금액" };

    public static string Name(int n) => "가상환자" + n.ToString("00", System.Globalization.CultureInfo.InvariantCulture);

    public static string Chart(int n) => (900000 + n).ToString(System.Globalization.CultureInfo.InvariantCulture);

    public static List<string[]> Symptoms(int visits = 3) =>
        new[] { SymptomHeader }.Concat(Enumerable.Range(1, visits).Select(n => new[]
        {
            n.ToString(System.Globalization.CultureInfo.InvariantCulture), "V" + n, Chart(n), "000000-0000000", Name(n), "010-0000-" + n.ToString("0000", System.Globalization.CultureInfo.InvariantCulture),
            "L-spine pain, MBB Lt L4-5", "2026-10-0" + ((n % 9) + 1), "의사",
        })).ToList();

    public static List<string[]> Diagnoses(int visits = 3) =>
        new[] { DiagnosisHeader }.Concat(Enumerable.Range(1, visits).Select(n => new[]
        {
            "V" + n, Chart(n), Name(n), "M5456", "요통, 요추부(가짜)", "주상병", "", "01", "2026-10-0" + ((n % 9) + 1), "가상시 가상동",
        })).ToList();

    public static List<string[]> Prescriptions(int visits = 3) =>
        new[] { PrescriptionHeader }.Concat(Enumerable.Range(1, visits).Select(n => new[]
        {
            Chart(n), Name(n), "000000-0000000", "2026-10-0" + ((n % 9) + 1), "LA221", "신경차단술(가짜)", "급여", "1", "12,340",
        })).ToList();
}

/// <summary>가짜 한 달 자료를 가진 도우미 부품 한 벌(Rig + 등록 + 모든 SQL 답 + 세 표).</summary>
internal sealed class ClaimRig : IDisposable
{
    public ClaimRig(int visits = 3, bool registered = true)
    {
        Rig = registered ? new Rig().Registered() : new Rig();
        var db = Rig.Session;
        db.Answer(Sql.PeriodIdentitySql, _ => new[] { new object?[] { 1L, 0L } });
        db.Answer(Sql.UserPermissionsSql, _ => new[] { new object?[] { "전산자료 추출통계", "A" }, new object?[] { "처방별 환자 목록", "A" } });
        db.Answer(Sql.HistoryVisitSql, _ => Enumerable.Range(1, visits).Select(n => new object?[] { "H" + n, ClaimData.Chart(n) + " ", "20260915", "지난 메모(가짜)\r\n둘째 줄" }).ToArray());
        db.Answer(Sql.HistoryCodeSql, _ => Enumerable.Range(1, visits).Select(n => new object?[] { "H" + n, "LA221" }).ToArray());
        db.Answer(Sql.TrendCountSql, _ => new[] { new object?[] { 10L } });
        db.Answer(Sql.TrendTotalsSql, _ => new[] { new object?[] { "LA221", 8L } });
        db.Answer(Sql.TrendPairsSql, _ => new[] { new object?[] { "LA221", "M5456", "요통(가짜)", 6L, 2L, 0L } });
        db.Answer(Sql.TrendVisitRxSql, _ => new[] { new object?[] { "T1", "LA221" } });
        db.Answer(Sql.TrendVisitDxSql, _ => new[] { new object?[] { "T1", "M5456", 1, "요통(가짜)" } });
        db.Answer(Sql.PrescriptionCatalogSql, _ => new[] { new object?[] { "LA221", "신경차단술(가짜)", "LA221", "P", "1", "040001" } });
        db.Answer(Sql.LaCatalogSql, _ => new[] { new object?[] { "LA221", "요추 신경 차단술(가짜)", true } });
        Rig.Screens.Sheets["83"] = ClaimData.Symptoms(visits);
        Rig.Screens.Sheets["83D"] = ClaimData.Diagnoses(visits);
        Rig.Screens.Sheets["47"] = ClaimData.Prescriptions(visits);
    }

    public Rig Rig { get; }

    public FakeSession Db => Rig.Session;

    public FakeScreens Screens => Rig.Screens;

    public void Dispose() => Rig.Dispose();
}

/// <summary>Dispatcher로 명령 하나를 돌리고 답을 모은다.</summary>
internal static class Dispatch
{
    private static readonly CommandTable Table = CommandTable.LoadEmbedded();

    public static Dispatcher For(BitServices services)
    {
        var dispatcher = new Dispatcher(Table);
        BitCommands.Register(dispatcher, services);
        return dispatcher;
    }

    public static List<JsonElement> Run(Dispatcher dispatcher, string cmd, string from, string to, string id = "c-1")
    {
        var sink = new ListSink();
        dispatcher.Handle(Encoding.UTF8.GetBytes(Requests.Envelope(cmd, "{\"from\":\"" + from + "\",\"to\":\"" + to + "\"}", id)), sink);
        foreach (var message in sink.Messages) Assert.True(4 + message.Length <= Framing.MaxOutgoing, "메시지 하나가 1,000,000바이트(머리 포함)를 넘는다");
        return sink.Replies;
    }

    public static List<JsonElement> Run(BitServices services, string cmd, string from, string to, string id = "c-1") =>
        Run(For(services), cmd, from, to, id);

    /// <summary>chunk … end를 잇고 end의 count·bytes·sha256이 맞는지 본 뒤 JSON으로 푼다.</summary>
    public static JsonElement Join(List<JsonElement> replies, string id = "c-1")
    {
        Assert.True(replies.Count >= 2, "chunk와 end가 와야 한다");
        var end = replies[replies.Count - 1];
        Assert.Equal("end", end.GetProperty("type").GetString());
        var chunks = replies.Take(replies.Count - 1).ToList();
        var text = new StringBuilder();
        for (var i = 0; i < chunks.Count; i++)
        {
            Assert.Equal("chunk", chunks[i].GetProperty("type").GetString());
            Assert.Equal(id, chunks[i].GetProperty("id").GetString());
            Assert.Equal(i, chunks[i].GetProperty("seq").GetInt32());
            text.Append(chunks[i].GetProperty("data").GetString());
        }
        var bytes = Encoding.UTF8.GetBytes(text.ToString());
        Assert.Equal(chunks.Count, end.GetProperty("count").GetInt32());
        Assert.Equal(bytes.LongLength, end.GetProperty("bytes").GetInt64());
        using (var sha = SHA256.Create())
        {
            Assert.Equal(string.Concat(sha.ComputeHash(bytes).Select(b => b.ToString("x2", System.Globalization.CultureInfo.InvariantCulture))), end.GetProperty("sha256").GetString());
        }
        return Json.Parse(text.ToString());
    }

    public static string OnlyError(List<JsonElement> replies)
    {
        var reply = Assert.Single(replies);
        Assert.Equal("error", reply.GetProperty("type").GetString());
        return reply.GetProperty("code").GetString()!;
    }
}
