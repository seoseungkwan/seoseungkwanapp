using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using Xunit;

namespace Precheck.Core.Tests.Contact.Read;

/// <summary>
/// 웹 약속(끝에서 끝까지 1부): Worker 시험이 쓰는 가짜 도우미 답(fixtures/patients/fake/targets-followup.json·targets-injection.json)의
/// 조각마다, 그 조각의 표에 버리는 칸을 섞은 가짜 83·47 화면 표를 만들어 contact.targets로 돌리면 답 JSON이 그 조각과 같다.
/// 그래서 그 조각을 받는 웹 readTargets(src/workers/patients/jobs.ts)가 도우미의 진짜 답도 받는다.
/// </summary>
public class ContactContractTests
{
    // 83: 남기는 칸 사이에 끼우는 버리는 칸(이름, 값)
    private static readonly (string Name, string Value)[] SymptomNoise =
    {
        ("No", "1"), ("주민번호", ContactData.ResidentNumber), ("전화번호", "010-0000-8888"), ("주소", ContactData.Address), ("금액", ContactData.Amount), ("진료의", ContactData.Doctor),
    };

    // 47: F/U는 처방 칸(처방코드·처방일자·처방명칭·급여구분)도 버린다
    private static readonly (string Name, string Value)[] FollowupRxNoise =
    {
        ("처방코드", "Z0"), ("환자명", "가상환자99"), ("처방일자", "2026-01-0"), ("주민번호", ContactData.ResidentNumber), ("처방명칭", ContactData.RxName), ("급여구분", "급여"), ("금액", ContactData.Amount), ("주소", ContactData.Address),
    };

    private static readonly (string Name, string Value)[] InjectionRxNoise =
    {
        ("환자명", "가상환자99"), ("주민번호", ContactData.ResidentNumber), ("처방명칭", ContactData.RxName), ("급여구분", "급여"), ("금액", ContactData.Amount), ("주소", ContactData.Address),
    };

    private static string[][] Table(JsonElement table) => Replies.Table(table);

    /// <summary>
    /// 표의 칸을 거꾸로 놓고 그 사이사이에 버리는 칸을 끼운다. 자료 줄마다 copies 줄을 만들고 버리는 칸 값만 줄마다 다르게 한다
    /// (남긴 칸이 같은 줄은 한 번이 되어야 하므로 47은 2, 83은 1).
    /// </summary>
    private static List<string[]> Sheet(string[][] table, (string Name, string Value)[] noise, int copies)
    {
        var columns = Enumerable.Range(0, table[0].Length).Reverse().ToArray();
        var layout = new List<(int Column, int Noise)>();
        for (var i = 0; i < Math.Max(columns.Length, noise.Length); i++)
        {
            if (i < noise.Length) layout.Add((-1, i));
            if (i < columns.Length) layout.Add((columns[i], -1));
        }

        var sheet = new List<string[]> { layout.Select(p => p.Column >= 0 ? table[0][p.Column] : noise[p.Noise].Name).ToArray() };
        foreach (var row in table.Skip(1))
        {
            for (var copy = 1; copy <= copies; copy++)
            {
                sheet.Add(layout.Select(p => p.Column >= 0 ? row[p.Column] : noise[p.Noise].Value + (copies > 1 ? copy.ToString(CultureInfo.InvariantCulture) : "")).ToArray());
            }
        }
        return sheet;
    }

    [Theory(DisplayName = "AC-605.1 웹 약속: targets-followup·targets-injection.json의 조각마다 같은 표에서 만든 답이 그 조각 JSON과 같다")]
    [InlineData("targets-followup.json", "followup")]
    [InlineData("targets-injection.json", "injection")]
    public void MatchesFakeReplies(string file, string kind)
    {
        var fixture = RepoFiles.Json("fixtures", "patients", "fake", file);
        var today = DateTime.ParseExact(fixture.GetProperty("today").GetString()!, "yyyy-MM-dd", CultureInfo.InvariantCulture);
        var pieces = fixture.GetProperty("pieces").EnumerateArray().ToList();
        Assert.NotEmpty(pieces);

        foreach (var piece in pieces)
        {
            Assert.Equal(kind, piece.GetProperty("kind").GetString());
            using var rig = new ContactRig();
            rig.Rig.Today = today;
            rig.Screens.Sheets["83"] = Sheet(Table(piece.GetProperty("chart")), SymptomNoise, 1);
            rig.Screens.Sheets["47"] = Sheet(Table(piece.GetProperty("rx")), kind == "followup" ? FollowupRxNoise : InjectionRxNoise, 2);

            var from = piece.GetProperty("from").GetString()!;
            var to = piece.GetProperty("to").GetString()!;
            var json = Replies.Join(rig.Send(kind, from, to));

            Assert.Equal(Replies.Canon(piece), Replies.Canon(json));
        }
    }
}
