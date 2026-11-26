using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Precheck.Core.Sheet;
using Xunit;

namespace Precheck.Core.Tests.Sheet;

/// <summary>
/// 웹 설정 JSON(design.md 10-2 GsheetSettings) ↔ 비트시트 Settings(spec google-link TASK-9, AC-8510.2).
/// 주소·비밀 글자는 지어낸 것이다(FAKE…). 이름 '가짜…'도 지어낸 것이다.
/// </summary>
public class SheetSettingsJsonTests
{
    private const string Template = "https://docs.google.com/spreadsheets/d/FAKEtemplate_0123456789/edit";
    private const string Script = "https://script.google.com/macros/s/AKfycFAKE0123456789/exec";
    private const string Secret = "FAKEsecretFAKEsecretFAKEsecret0123456789abc";

    /// <summary>design.md 10-2 기본값(비트시트 7판)과 같은 웹 설정 + 원본 주소·진료실 맞춤.</summary>
    private const string WebDefaults =
        "{\"templateUrl\":\"" + Template + "\",\"namePattern\":\"{병원} 일일수납일지 {yyyy}년 {m}월\",\"hospitalLabel\":\"\",\"folderUrl\":\"\","
        + "\"firstRow\":17,\"lastRow\":302,"
        + "\"cols\":{\"key\":\"B\",\"name\":\"C\",\"sign\":\"D\",\"amount\":\"F\",\"room\":\"I\",\"first\":\"J\",\"day90\":\"K\",\"block\":\"L\",\"therapy\":\"M\",\"note\":\"G\"},"
        + "\"markValue\":\"0\",\"signs\":{\"cash\":1,\"card\":2,\"recvCash\":3,\"recvCard\":4,\"transfer\":5,\"recvTransfer\":5,\"free\":6},"
        + "\"shiftCols\":\"A:P\",\"staffCols\":[\"G\",\"O\"],\"bitHospital\":\"\",\"deptRooms\":{\"OS\":1},\"deptRoomsHospital\":\"H1\","
        + "\"firstKinds\":[\"1\"],\"day90Kinds\":[\"3\"],\"blockCodes\":[],\"therapyCodes\":[],\"free\":\"discount\",\"freeInsurance\":[31],"
        + "\"carInsurance\":[21,22],\"aidInsurance\":[51,52],\"noteCar\":true,\"noteAid\":true,"
        + "\"autoOn\":true,\"everyMin\":5,\"from\":\"08:00\",\"to\":\"20:00\",\"eveningOn\":true,\"evening\":\"19:30\"}";

    private static Day SplitDay()
    {
        var d = new Day();
        var v = d.Visit("12345", "0900", "1", "OS");
        d.Pay(v, PaymentType.Receipt, cash: 5000, card: 10000, time: "0910");
        return d;
    }

    private static string Request(Settings s, Day d) => SheetPayload.ToJson(SheetPayload.Write(RowBuilder.Build(d.Data, s), s, "tok", SheetPayload.FillEmpty, "가짜의원"));

    private static string Code(Action act) => Assert.Throws<SheetException>(act).Code;

    [Fact(DisplayName = "AC-8510.2 웹 기본 설정 JSON → 요청: 비트시트 7판 SheetPayload와 글자까지 같은 JSON")]
    public void DefaultsGiveTheBitSheetRequest()
    {
        var fromWeb = SheetSettingsJson.Parse(WebDefaults);
        const string expected =
            "{\"token\":\"tok\",\"action\":\"write\","
            + "\"month\":{\"templateId\":\"FAKEtemplate_0123456789\",\"fileName\":\"가짜의원 일일수납일지 2026년 11월\",\"folderId\":\"\",\"shareWith\":[]},"
            + "\"sheetName\":\"23\","
            + "\"layout\":{\"firstRow\":17,\"lastRow\":302,\"keyCol\":\"B\",\"nameCol\":\"C\",\"ownedCols\":[\"B\",\"C\",\"D\",\"F\",\"I\",\"J\",\"K\",\"L\",\"M\"],"
            + "\"moneyCols\":[\"D\",\"F\"],\"staffCols\":[\"G\",\"O\"],\"shiftCols\":\"A:P\",\"nameOnMore\":true,\"noteCol\":\"G\",\"noteTexts\":[\"자동차보험\",\"건강생활잔액\"]},"
            + "\"mode\":\"fillEmpty\","
            + "\"patients\":[{\"key\":\"12345\",\"cells\":{\"B\":12345,\"C\":\"가짜12345\",\"D\":1,\"F\":5000,\"I\":1,\"J\":0,\"K\":\"\",\"L\":\"\",\"M\":\"\"},"
            + "\"more\":[{\"C\":\"가짜12345\",\"D\":2,\"F\":10000}],\"note\":\"\"}],"
            + "\"cancelled\":[],\"paidOnly\":[]}";
        Assert.Equal(expected, Request(fromWeb, SplitDay()));

        // 비트시트 기본 Settings(같은 원본 주소·진료실 맞춤)와 같다
        var bitsheet = new Settings { TemplateUrl = Template, DeptRooms = new Dictionary<string, int> { { "OS", 1 } }, DeptRoomsHospital = "H1" };
        bitsheet.Normalize();
        Assert.Equal(Request(bitsheet, SplitDay()), Request(fromWeb, SplitDay()));
    }

    [Fact(DisplayName = "AC-8510.2 여러 경우(할인 FREE·늦게 붙은 FREE·처방 Block·물리치료·진료실·표시 값 TRUE·비고 둘·취소된 접수·미수만 낸 환자·칸 E·폴더·이름 꼴·ping): 비트시트 7판 프로그램이 낸 JSON과 글자까지 같다")]
    public void ManyCasesMatchBitSheetProgramOutput()
    {
        // 기대값은 비트시트 app/src/Core(작업 트리 파일)를 그대로 컴파일해 같은 하루·같은 설정으로 돌린 SheetPayload.ToJson(JavaScriptSerializer) 출력이다.
        const string write7 =
            "{\"token\":\"tok\",\"action\":\"write\",\"month\":{\"templateId\":\"FAKEtemplate_0123456789\",\"fileName\":\"무시-2611\",\"folderId\":\"FAKEfolder-9\",\"shareWith\":[\"desk@fake"
            + ".test\"]},\"sheetName\":\"23\",\"layout\":{\"firstRow\":17,\"lastRow\":302,\"keyCol\":\"B\",\"nameCol\":\"C\",\"ownedCols\":[\"B\",\"C\",\"D\",\"E\",\"I\",\"J\",\"K\",\"L\",\"M\"],\"moneyCol"
            + "s\":[\"D\",\"E\"],\"staffCols\":[\"G\",\"O\"],\"shiftCols\":\"A:Q\",\"nameOnMore\":true,\"noteCol\":\"G\",\"noteTexts\":[\"자동차보험\",\"건강생활잔액\"]},\"mode\":\"overwrite\",\"patients\":[{\""
            + "key\":\"011\",\"cells\":{\"B\":\"011\",\"C\":\"가짜011\",\"D\":6,\"E\":0,\"I\":1,\"J\":true,\"K\":\"\",\"L\":true,\"M\":\"\"},\"more\":[],\"note\":\"\",\"free\":{\"cells\":{\"D\":6,\"E\":0},\"droppe"
            + "d\":[{\"D\":1,\"E\":3000}]}},{\"key\":\"22\",\"cells\":{\"B\":22,\"C\":\"가짜22\",\"D\":\"\",\"E\":\"\",\"I\":2,\"J\":\"\",\"K\":true,\"L\":\"\",\"M\":true},\"more\":[],\"note\":\"자동차보험\"},{\"key\":\""
            + "33\",\"cells\":{\"B\":33,\"C\":\"가짜33\",\"D\":5,\"E\":7000,\"I\":\"\",\"J\":\"\",\"K\":\"\",\"L\":\"\",\"M\":\"\"},\"more\":[],\"note\":\"건강생활잔액\"}],\"cancelled\":[{\"key\":\"44\",\"cells\":{\"B\":44"
            + ",\"C\":\"가짜취소\"}}],\"paidOnly\":[{\"cells\":{\"C\":\"가짜미수\",\"D\":3,\"E\":2000},\"more\":[{\"C\":\"가짜미수\",\"D\":4,\"E\":1000}],\"before\":3}]}";
        const string ping7 =
            "{\"token\":\"tok\",\"action\":\"ping\",\"month\":{\"templateId\":\"FAKEtemplate_0123456789\",\"fileName\":\"가짜의원-2611\",\"folderId\":\"FAKEfolder-9\",\"shareWith\":[\"desk@fak"
            + "e.test\"]}}";
        var json = "{\"templateUrl\":\"" + Template + "\",\"folderUrl\":\"https://drive.google.com/drive/folders/FAKEfolder-9\",\"hospitalLabel\":\"가짜이름\","
            + "\"markValue\":\"TRUE\",\"deptRooms\":{\"OS\":1,\"OS2\":2},\"blockCodes\":[\"LA221\"],\"shiftCols\":\"A:Q\",\"namePattern\":\"{병원}-{yy}{mm}\",\"cols\":{\"amount\":\"E\"}}";
        var s = SheetSettingsJson.Parse(json);
        s.ShareWith = new List<string> { "desk@fake.test" }; // 함께 쓸 메일은 sheet.dat에서 온다

        var d = new Day();
        var b = d.Visit("011", "0900", "1", "OS");
        b.Codes.Add("LA221");
        d.Pay(b, PaymentType.Receipt, cash: 3000, time: "0905");
        d.Bill(b, 3000, 20000, 31, true);
        var c = d.Visit("22", "0930", "3", "OS2");
        c.Codes.Add("MM001");
        c.Therapy = true;
        c.Injection = true;
        d.Bill(c, 0, 20000, 21);
        var e = d.Visit("33", "1000", "4", "PT");
        d.Pay(e, PaymentType.Receipt, transfer: 7000, time: "1005");
        d.Pay(e, PaymentType.HealthFund, cash: 1000, time: "1006");
        d.Bill(e, 8000, 20000, 51);
        d.Data.Cancelled.Add(new DayVisit { Key = "44", Name = "가짜취소" });
        d.Pay(null, PaymentType.ReceivablePaid, cash: 2000, card: 1000, time: "1100", key: "0555").Name = "가짜미수";

        Assert.Equal(write7, SheetPayload.ToJson(SheetPayload.Write(RowBuilder.Build(d.Data, s), s, "tok", SheetPayload.Overwrite, "무시")));
        Assert.Equal(ping7, SheetPayload.ToJson(SheetPayload.Ping(s, "tok", "가짜의원", new DateTime(2026, 11, 24))));
    }

    [Fact(DisplayName = "AC-8510.2 웹 설정 칸마다 비트시트 Settings 칸으로(칸 글자·기호·FREE 규칙·진찰구분·처방·진료실·직원 칸·밀어 낼 칸·표시 값·이름 꼴·저절로 넣기)")]
    public void EveryWebFieldMapsToSettings()
    {
        var json =
            "{\"templateUrl\":\" " + Template + " \",\"namePattern\":\"{병원}-{mm}\",\"hospitalLabel\":\" 가짜의원 \",\"folderUrl\":\"https://drive.google.com/drive/folders/FAKEfolder-9\","
            + "\"firstRow\":20,\"lastRow\":250,"
            + "\"cols\":{\"key\":\"b\",\"name\":\"C\",\"sign\":\"D\",\"amount\":\"E\",\"room\":\"H\",\"first\":\"J\",\"day90\":\"K\",\"block\":\"L\",\"therapy\":\"M\",\"note\":\"N\"},"
            + "\"markValue\":\"TRUE\",\"signs\":{\"cash\":11,\"card\":12,\"recvCash\":13,\"recvCard\":14,\"transfer\":15,\"recvTransfer\":16,\"free\":17},"
            + "\"shiftCols\":\"a:q\",\"staffCols\":[\"G\",\"P\"],\"bitHospital\":\"H2\",\"deptRooms\":{\"OS\":2,\"PT\":11},\"deptRoomsHospital\":\"H2\","
            + "\"firstKinds\":[\"1\",\"2\"],\"day90Kinds\":[\"3\"],\"blockCodes\":[\"la221\"],\"therapyCodes\":[\"MM001\"],\"free\":\"total-zero\",\"freeInsurance\":[31,32],"
            + "\"carInsurance\":[21],\"aidInsurance\":[51],\"noteCar\":true,\"noteAid\":false,"
            + "\"autoOn\":false,\"everyMin\":10,\"from\":\"09:00\",\"to\":\"18:00\",\"eveningOn\":false,\"evening\":\"18:30\",\"futureKey\":{\"x\":1}}";
        var s = SheetSettingsJson.Parse(json);
        Assert.Equal(Template, s.TemplateUrl);
        Assert.Equal("{병원}-{mm}", s.FileNamePattern);
        Assert.Equal("가짜의원", s.HospitalName);
        Assert.Equal("https://drive.google.com/drive/folders/FAKEfolder-9", s.FolderUrl);
        Assert.Equal(20, s.FirstRow);
        Assert.Equal(250, s.LastRow);
        Assert.Equal("B,C,D,E,H,J,K,L,M", string.Join(",", s.Columns.Owned()));
        Assert.Equal("N", s.Columns.Note);
        Assert.Equal("TRUE", s.MarkValue);
        Assert.Equal("11,12,13,14,15,16,17",
            string.Join(",", new[] { s.Signs.Cash, s.Signs.Card, s.Signs.ReceivableCash, s.Signs.ReceivableCard, s.Signs.Transfer, s.Signs.ReceivableTransfer, s.Signs.Free }));
        Assert.Equal("A:Q", s.ShiftCols);
        Assert.Equal("G,P", string.Join(",", s.StaffCols));
        Assert.Equal("H2", s.HospitalCode);
        Assert.Equal("OS:2", string.Join(",", s.DeptRooms.Select(p => p.Key + ":" + p.Value)));
        Assert.Equal("H2", s.DeptRoomsHospital);
        Assert.Equal("1,2", string.Join(",", s.FirstVisitKinds));
        Assert.Equal("LA221", string.Join(",", s.BlockCodes));
        Assert.Equal("MM001", string.Join(",", s.TherapyCodes));
        Assert.Equal(FreeRule.TotalZero, s.Free);
        Assert.Equal("31,32", string.Join(",", s.FreeInsurance));
        Assert.Equal("21", string.Join(",", s.CarInsurance));
        Assert.Empty(s.AidInsurance); // 건강생활잔액 끔 = 의료급여 보험 코드 없음
        Assert.False(s.IntervalEnabled);
        Assert.Equal(10, s.IntervalMinutes);
        Assert.Equal("09:00", s.HoursStart);
        Assert.Equal("18:00", s.HoursEnd);
        Assert.False(s.EveningEnabled);
        Assert.Equal("18:30", s.EveningTime);
        Assert.Equal(Settings.CurrentVersion, s.Version);
        // 주소·메일·비밀 글자는 웹 설정에서 오지 않는다(도우미 sheet.dat에만)
        Assert.Equal("", s.WebAppUrl);
        Assert.Empty(s.ShareWith);
        Assert.Equal("", s.TokenProtected);

        foreach (var (text, rule) in new[]
        {
            ("discount", FreeRule.DiscountFree), ("paid-zero", FreeRule.OwedNotPaid), ("nhis-zero", FreeRule.OwnZeroInsured),
            ("own-zero", FreeRule.OwnZeroAny), ("total-zero", FreeRule.TotalZero), ("none", FreeRule.None),
        })
        {
            Assert.Equal(rule, SheetSettingsJson.Parse("{\"free\":\"" + text + "\"}").Free);
        }
    }

    [Fact(DisplayName = "AC-8510.2 비고 두 글 켜기·끄기: 끄면 그 글을 넣지 않는다(자동차보험·건강생활잔액)")]
    public void NoteSwitches()
    {
        var d = new Day();
        var car = d.Visit("1", "0900");
        d.Bill(car, 0, 20000, insurance: 21);
        var aid = d.Visit("2", "0901");
        d.Bill(aid, 1000, 20000, insurance: 51);
        d.Pay(aid, PaymentType.HealthFund, cash: 1000);
        string Notes(string json) => string.Join(",", RowBuilder.Build(d.Data, SheetSettingsJson.Parse(json)).Patients.Select(p => p.Note));
        Assert.Equal("자동차보험,건강생활잔액", Notes("{}"));
        Assert.Equal(",건강생활잔액", Notes("{\"noteCar\":false}"));
        Assert.Equal("자동차보험,", Notes("{\"noteAid\":false}"));
        Assert.Equal(",", Notes("{\"noteCar\":false,\"noteAid\":false}"));
    }

    [Fact(DisplayName = "AC-8510.2 없는 칸은 비트시트 기본값, 깨진 값은 비트시트 Normalize와 같게 고친다(밀어 낼 칸·겹친 비고 칸·진료실 11)")]
    public void MissingAndOddValuesFollowBitSheet()
    {
        var empty = SheetSettingsJson.Parse("{}");
        var bitsheet = new Settings();
        bitsheet.Normalize();
        Assert.Equal(Request(bitsheet, SplitDay()), Request(empty, SplitDay()));

        var odd = SheetSettingsJson.Parse("{\"shiftCols\":\"zz\",\"cols\":{\"note\":\"b\"},\"deptRooms\":{\"OS\":11},\"everyMin\":0,\"from\":\"8시\"}");
        var expected = new Settings { ShiftCols = "zz", DeptRooms = new Dictionary<string, int> { { "OS", 11 } }, IntervalMinutes = 0, HoursStart = "8시" };
        expected.Columns.Note = "b";
        expected.Normalize();
        Assert.Equal("A:P", odd.ShiftCols);
        Assert.Equal("", odd.Columns.Note);
        Assert.Empty(odd.DeptRooms);
        Assert.Equal(5, odd.IntervalMinutes);
        Assert.Equal("08:00", odd.HoursStart);
        Assert.Equal(Request(expected, SplitDay()), Request(odd, SplitDay()));
    }

    [Theory(DisplayName = "AC-8510.2 주소·메일 열쇠(url·shareWith·scriptUrl)가 있거나 모양이 틀린 설정은 E-HELPER-BAD-MESSAGE")]
    [InlineData("{\"url\":\"" + Script + "\"}")]
    [InlineData("{\"shareWith\":[\"desk@fake.test\"]}")]
    [InlineData("{\"scriptUrl\":\"" + Script + "\"}")]
    [InlineData("[]")]
    [InlineData("\"x\"")]
    [InlineData("not json")]
    [InlineData("")]
    [InlineData("{\"firstRow\":\"17\"}")]
    [InlineData("{\"firstRow\":17.5}")]
    [InlineData("{\"templateUrl\":null}")]
    [InlineData("{\"cols\":\"B\"}")]
    [InlineData("{\"cols\":{\"key\":2}}")]
    [InlineData("{\"signs\":{\"cash\":\"1\"}}")]
    [InlineData("{\"free\":\"zzz\"}")]
    [InlineData("{\"deptRooms\":{\"OS\":\"1\"}}")]
    [InlineData("{\"staffCols\":[1]}")]
    [InlineData("{\"freeInsurance\":[\"31\"]}")]
    [InlineData("{\"noteCar\":\"yes\"}")]
    public void BadSettingsAreRejected(string json)
    {
        Assert.Equal("E-HELPER-BAD-MESSAGE", Code(() => SheetSettingsJson.Parse(json)));
    }

    [Fact(DisplayName = "AC-8510.2 16KB를 넘는 설정은 E-HELPER-BAD-MESSAGE")]
    public void TooBigIsRejected()
    {
        var big = "{\"blockCodes\":[" + string.Join(",", Enumerable.Range(0, 3000).Select(i => "\"C" + i + "\"")) + "]}";
        Assert.True(big.Length > SheetSettingsJson.MaxBytes);
        Assert.Equal("E-HELPER-BAD-MESSAGE", Code(() => SheetSettingsJson.Parse(big)));
        using var doc = JsonDocument.Parse(big);
        Assert.Equal("E-HELPER-BAD-MESSAGE", Code(() => SheetSettingsJson.FromElement(doc.RootElement)));
    }

    [Fact(DisplayName = "AC-8510.2 Settings → 웹 설정 JSON(가져오기 답): design.md 10-2 열쇠만, 주소·메일·비밀 글자 없음, 다시 읽으면 같은 요청")]
    public void SettingsToWebJson()
    {
        const string defaults =
            "{\"templateUrl\":\"\",\"namePattern\":\"{병원} 일일수납일지 {yyyy}년 {m}월\",\"hospitalLabel\":\"\",\"folderUrl\":\"\",\"firstRow\":17,\"lastRow\":302,"
            + "\"cols\":{\"key\":\"B\",\"name\":\"C\",\"sign\":\"D\",\"amount\":\"F\",\"room\":\"I\",\"first\":\"J\",\"day90\":\"K\",\"block\":\"L\",\"therapy\":\"M\",\"note\":\"G\"},"
            + "\"markValue\":\"0\",\"signs\":{\"cash\":1,\"card\":2,\"recvCash\":3,\"recvCard\":4,\"transfer\":5,\"recvTransfer\":5,\"free\":6},"
            + "\"shiftCols\":\"A:P\",\"staffCols\":[\"G\",\"O\"],\"bitHospital\":\"\",\"deptRooms\":{},\"deptRoomsHospital\":\"\","
            + "\"firstKinds\":[\"1\"],\"day90Kinds\":[\"3\"],\"blockCodes\":[],\"therapyCodes\":[],\"free\":\"discount\",\"freeInsurance\":[31],"
            + "\"carInsurance\":[21,22],\"aidInsurance\":[51,52],\"noteCar\":true,\"noteAid\":true,"
            + "\"autoOn\":true,\"everyMin\":5,\"from\":\"08:00\",\"to\":\"20:00\",\"eveningOn\":true,\"evening\":\"19:30\"}";
        var plain = new Settings();
        plain.Normalize();
        Assert.Equal(defaults, SheetSettingsJson.ToJson(plain));

        var s = new Settings
        {
            WebAppUrl = Script,
            TokenProtected = "RkFLRS1QUk9URUNURUQ=",
            ShareWith = { "desk@fake.test" },
            TemplateUrl = Template,
            HospitalCode = "H2",
            DeptRooms = new Dictionary<string, int> { { "OS2", 2 }, { "OS", 1 } },
            DeptRoomsHospital = "H2",
            BlockCodes = { "LA221" },
            Free = FreeRule.OwnZeroAny,
            CarInsurance = new List<int>(),
        };
        s.Normalize();
        var json = SheetSettingsJson.ToJson(s);
        Assert.DoesNotContain("script.google.com", json, StringComparison.Ordinal);
        Assert.DoesNotContain("desk@fake.test", json, StringComparison.Ordinal);
        Assert.DoesNotContain("RkFLRS1QUk9URUNURUQ=", json, StringComparison.Ordinal);
        using (var doc = JsonDocument.Parse(json))
        {
            Assert.Equal(
                "templateUrl,namePattern,hospitalLabel,folderUrl,firstRow,lastRow,cols,markValue,signs,shiftCols,staffCols,bitHospital,deptRooms,deptRoomsHospital,"
                + "firstKinds,day90Kinds,blockCodes,therapyCodes,free,freeInsurance,carInsurance,aidInsurance,noteCar,noteAid,autoOn,everyMin,from,to,eveningOn,evening",
                string.Join(",", doc.RootElement.EnumerateObject().Select(p => p.Name)));
            Assert.Equal("own-zero", doc.RootElement.GetProperty("free").GetString());
            // 비트시트에서 자동차보험 보험 코드를 비웠으면 = 그 비고를 끈 것(켜면 기본 코드로)
            Assert.False(doc.RootElement.GetProperty("noteCar").GetBoolean());
            Assert.Equal("[21,22]", doc.RootElement.GetProperty("carInsurance").GetRawText());
            Assert.Equal("{\"OS\":1,\"OS2\":2}", doc.RootElement.GetProperty("deptRooms").GetRawText());
        }
        var again = SheetSettingsJson.Parse(json);
        Assert.Empty(again.ShareWith);
        again.ShareWith = new List<string>(s.ShareWith); // 함께 쓸 메일은 sheet.dat에서 따로 온다
        Assert.Equal(Request(s, SplitDay()), Request(again, SplitDay()));
    }

    [Fact(DisplayName = "AC-8510.2 막는 까닭 번호(비트시트 넣기 차례): 주소 없음 E-GSHEET-NOURL → 주소 꼴 E-GSHEET-URL → 원본 없음 E-GSHEET-NOTEMPLATE → 비밀 글자 E-GSHEET-SECRET → 칸 글자 E-GSHEET-LAYOUT")]
    public void BlockersInBitSheetOrder()
    {
        var ok = SheetSettingsJson.Parse(WebDefaults);
        Assert.Null(SheetSettingsJson.Blocker(ok, Script, Secret));
        Assert.Null(SheetSettingsJson.Blocker(ok, "https://script.google.com/a/macros/fake-clinic.test/s/AKfycFAKE0123456789/exec", "Abcdefghijklmnop0123456789ABCDEF"));

        var nothing = SheetSettingsJson.Parse("{\"cols\":{\"name\":\"B\"}}");
        Assert.Equal("E-GSHEET-NOURL", SheetSettingsJson.Blocker(nothing, null, null));
        Assert.Equal("E-GSHEET-NOURL", SheetSettingsJson.Blocker(nothing, "  ", null));
        Assert.Equal("E-GSHEET-URL", SheetSettingsJson.Blocker(nothing, "https://script.google.com/macros/s/AKfycFAKE0123456789/dev", null));
        Assert.Equal("E-GSHEET-NOTEMPLATE", SheetSettingsJson.Blocker(nothing, Script, null));
        var template = SheetSettingsJson.Parse("{\"templateUrl\":\"" + Template + "\",\"cols\":{\"name\":\"B\"}}");
        Assert.Equal("E-GSHEET-SECRET", SheetSettingsJson.Blocker(template, Script, null));
        Assert.Equal("E-GSHEET-SECRET", SheetSettingsJson.Blocker(template, Script, "short"));
        Assert.Equal("E-GSHEET-SECRET", SheetSettingsJson.Blocker(template, Script, "Abcdefghijklmnop'0123456789"));
        Assert.Equal("E-GSHEET-LAYOUT", SheetSettingsJson.Blocker(template, Script, Secret));
        var letters = SheetSettingsJson.Parse("{\"templateUrl\":\"" + Template + "\",\"cols\":{\"room\":\"1\"}}");
        Assert.Equal("E-GSHEET-LAYOUT", SheetSettingsJson.Blocker(letters, Script, Secret));
    }
}
