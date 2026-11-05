using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Contact;
using Precheck.Core.Protocol;
using Precheck.Core.Tests.Bit;
using Precheck.Core.Tests.Protocol;
using Xunit;

namespace Precheck.Core.Tests.Contact.Read;

/// <summary>
/// contact.targets 시험의 가짜 비트 통계 표(83·47). 모두 지어낸 것이다: 이름 '가상환자NN', 차트번호 9로 시작하는 6자리,
/// 전화 010-0000-NNNN, 내원번호 V+숫자. 버리는 칸(주민번호·주소·금액·진료의·팩스 등)에는 시험이 찾는 표시 글자를 넣는다.
/// </summary>
internal static class ContactData
{
    public const string ResidentNumber = "000000-0000000";
    public const string Address = "가상시 가상동";
    public const string Amount = "12,340";
    public const string Doctor = "가상의사";
    public const string Fax = "02-0000-0000";
    public const string RxName = "가짜주사약";
    public const string CheckedDay = "2025-12-31";

    /// <summary>83 표: 남기는 다섯 칸 사이에 버리는 칸(No·주민번호·전화번호·주소·금액·진료의)이 섞여 있다.</summary>
    public static readonly string[] SymptomHeader = { "No", "내원번호", "차트번호", "주민번호", "환자명", "전화번호", "증상", "주소", "기록날짜", "금액", "진료의" };

    /// <summary>47 표: 처방 칸·전화 칸(휴대폰·보호자 연락처) 사이에 버리는 칸과 전화가 아닌 칸(팩스·전화번호 확인일)이 섞여 있다.</summary>
    public static readonly string[] PrescriptionHeader =
    {
        "차트번호", "환자명", "주민번호", "처방일자", "처방코드", "처방명칭", "급여구분", "총투여량", "금액", "휴대폰", "주소", "보호자 연락처", "팩스", "전화번호 확인일",
    };

    public static string Name(int n) => "가상환자" + n.ToString("00", CultureInfo.InvariantCulture);

    public static string Chart(int n) => (900000 + n).ToString(CultureInfo.InvariantCulture);

    public static string Phone(int n) => "010-0000-" + n.ToString("0000", CultureInfo.InvariantCulture);

    public static string GuardianPhone(int n) => "010-0000-" + (7000 + n).ToString(CultureInfo.InvariantCulture);

    public static string Day(int n) => "2026-10-" + (n % 28 + 1).ToString("00", CultureInfo.InvariantCulture);

    public static string Symptom(int n) => "가상 증상 " + n.ToString(CultureInfo.InvariantCulture) + " / 1주 뒤 f/u";

    public static List<string[]> Symptoms(int visits = 3) =>
        new[] { SymptomHeader }.Concat(Enumerable.Range(1, visits).Select(n => new[]
        {
            n.ToString(CultureInfo.InvariantCulture), "V" + n, Chart(n), ResidentNumber, Name(n), "010-0000-" + (8000 + n).ToString(CultureInfo.InvariantCulture),
            Symptom(n), Address, Day(n), Amount, Doctor,
        })).ToList();

    /// <summary>환자마다 처방 두 줄(처방코드 A49·B12, 같은 날). F/U로 고르면 남긴 칸이 같아 한 줄이 된다.</summary>
    public static List<string[]> Prescriptions(int patients = 3) =>
        new[] { PrescriptionHeader }.Concat(Enumerable.Range(1, patients).SelectMany(n => new[] { "A49", "B12" }.Select(code => new[]
        {
            Chart(n), Name(n), ResidentNumber, Day(n), code, RxName, "급여", "1", Amount, Phone(n), Address, GuardianPhone(n), Fax, CheckedDay,
        }))).ToList();

    /// <summary>JSON·기록 어디에도 나오면 안 되는 버리는 칸의 글자.</summary>
    public static readonly string[] DroppedValues = { ResidentNumber, Address, Amount, Doctor, Fax, RxName, CheckedDay, "010-0000-80", "주민번호", "주소", "금액", "진료의", "팩스", "확인일", "처방명칭", "급여구분", "총투여량" };
}

/// <summary>가짜 비트(Rig) + 등록 + 기간 기관기호·통계 권한 답 + 83·47 표 + contact.targets 처리기를 붙인 Dispatcher. 기록기는 (명령 이름, 오류 번호)를 모은다.</summary>
internal sealed class ContactRig : IDisposable
{
    public const string Id = "c-1";

    public ContactRig(bool registered = true)
    {
        Rig = registered ? new Rig().Registered() : new Rig();
        Db.Answer(Sql.PeriodIdentitySql, _ => new[] { new object?[] { 1L, 0L } });
        Db.Answer(Sql.UserPermissionsSql, _ => new[] { new object?[] { "전산자료 추출통계", "A" }, new object?[] { "처방별 환자 목록", "A" } });
        Screens.Sheets[StatsScreens.Symptoms] = ContactData.Symptoms();
        Screens.Sheets[StatsScreens.Prescriptions] = ContactData.Prescriptions();
        Dispatcher = new Dispatcher(CommandTable.LoadEmbedded(), (name, code) => Log.Add((name, code)));
        ContactCommands.RegisterTargets(Dispatcher, Rig.Services);
    }

    public Rig Rig { get; }

    public FakeSession Db => Rig.Session;

    public FakeScreens Screens => Rig.Screens;

    public Dispatcher Dispatcher { get; }

    public List<(string? Name, string? Code)> Log { get; } = new List<(string? Name, string? Code)>();

    public ListSink Sink { get; private set; } = new ListSink();

    /// <summary>비트(설치 위치·DB·통계 화면)를 건드렸나.</summary>
    public bool BitTouched => Rig.Locator.Calls > 0 || Rig.Connector.Opened.Count > 0 || Screens.Calls.Count > 0 || Screens.MenuReads.Count > 0;

    public List<JsonElement> Send(string kind, string from, string to) =>
        SendArgs("{\"kind\":\"" + kind + "\",\"from\":\"" + from + "\",\"to\":\"" + to + "\"}");

    public List<JsonElement> SendArgs(string argsJson)
    {
        Sink = new ListSink();
        Dispatcher.Handle(Encoding.UTF8.GetBytes(Requests.Envelope("contact.targets", argsJson, Id)), Sink);
        foreach (var message in Sink.Messages) Assert.True(4 + message.Length <= Framing.MaxOutgoing, "메시지 하나가 1,000,000바이트(머리 포함)를 넘는다");
        return Sink.Replies;
    }

    /// <summary>답 바이트를 모두 이은 글자(기록·답에 환자 값이 없는지 볼 때).</summary>
    public string RawReplies => string.Concat(Sink.Messages.Select(m => Encoding.UTF8.GetString(m)));

    public void Dispose() => Rig.Dispose();
}

internal static class Replies
{
    private static readonly JsonWriterOptions Canonical = new JsonWriterOptions { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

    /// <summary>chunk(seq 0부터) … end를 잇고 end의 count·bytes·sha256이 맞는지 본 뒤 이은 글자를 돌려준다.</summary>
    public static string Join(List<JsonElement> replies, string id = ContactRig.Id)
    {
        Assert.True(replies.Count >= 2, "chunk와 end가 와야 한다: " + string.Join(",", replies.Select(r => r.GetRawText())));
        var end = replies[replies.Count - 1];
        Assert.Equal("end", end.GetProperty("type").GetString());
        var text = new StringBuilder();
        for (var i = 0; i < replies.Count - 1; i++)
        {
            Assert.Equal("chunk", replies[i].GetProperty("type").GetString());
            Assert.Equal(id, replies[i].GetProperty("id").GetString());
            Assert.Equal(i, replies[i].GetProperty("seq").GetInt32());
            text.Append(replies[i].GetProperty("data").GetString());
        }
        var bytes = Encoding.UTF8.GetBytes(text.ToString());
        Assert.Equal(replies.Count - 1, end.GetProperty("count").GetInt32());
        Assert.Equal(bytes.LongLength, end.GetProperty("bytes").GetInt64());
        using (var sha = SHA256.Create())
        {
            Assert.Equal(string.Concat(sha.ComputeHash(bytes).Select(b => b.ToString("x2", CultureInfo.InvariantCulture))), end.GetProperty("sha256").GetString());
        }
        return text.ToString();
    }

    public static JsonElement JoinJson(List<JsonElement> replies) => Json.Parse(Join(replies));

    /// <summary>답이 error 하나뿐(chunk·end 없음)인지 보고 오류 번호를 돌려준다.</summary>
    public static string OnlyError(List<JsonElement> replies)
    {
        var reply = Assert.Single(replies);
        Assert.Equal("error", reply.GetProperty("type").GetString());
        Assert.Equal(ContactRig.Id, reply.GetProperty("id").GetString());
        return reply.GetProperty("code").GetString()!;
    }

    /// <summary>표(배열의 배열) → 글자 2차 배열.</summary>
    public static string[][] Table(JsonElement table) =>
        table.EnumerateArray().Select(row => row.EnumerateArray().Select(cell => cell.GetString()!).ToArray()).ToArray();

    /// <summary>JSON 글자를 같은 모양(칸 차례 그대로, 띄어쓰기 없음)으로 다시 쓴다. 둘이 같으면 같은 JSON이다.</summary>
    public static string Canon(string json)
    {
        using var doc = JsonDocument.Parse(json);
        return Canon(doc.RootElement);
    }

    public static string Canon(JsonElement element)
    {
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer, Canonical)) element.WriteTo(writer);
        return Encoding.UTF8.GetString(buffer.ToArray());
    }
}

/// <summary>저장소 뿌리(시험 실행 폴더에서 위로 올라가며 fixtures/patients가 있는 곳)의 파일.</summary>
internal static class RepoFiles
{
    public static string Path(params string[] parts)
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null && !Directory.Exists(System.IO.Path.Combine(dir.FullName, "fixtures", "patients"))) dir = dir.Parent;
        if (dir == null) throw new InvalidOperationException("저장소 뿌리(fixtures/patients)를 찾지 못했다");
        return System.IO.Path.Combine(new[] { dir.FullName }.Concat(parts).ToArray());
    }

    public static JsonElement Json(params string[] parts) => Protocol.Json.Parse(File.ReadAllText(Path(parts), Encoding.UTF8));
}
