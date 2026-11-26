// 비트시트 app/src/Core/SheetPayload.cs(작업 트리 파일, 판 7)을 옮김(spec google-link TASK-9, design.md 9-1). 규칙은 그대로,
// 바뀐 것은 이름공간·nullable 표시·ToJson(JavaScriptSerializer → Utf8JsonWriter, netstandard2.0에 없어서).
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Precheck.Core.Protocol;

namespace Precheck.Core.Sheet;

/// <summary>
/// DESIGN 4절의 JSON(프로그램 → 구글 웹 앱). 값의 형(사용자·시트 식 약속, DESIGN 2절):
/// D·F·I·J~M은 JSON 숫자(표시 값을 글자로 바꾼 경우만 예외), B는 0으로 시작하지 않는 숫자뿐이면 숫자·아니면 글자, key는 늘 글자. 빈 칸은 "".
/// </summary>
public static class SheetPayload
{
    public const string FillEmpty = "fillEmpty";
    public const string Overwrite = "overwrite";

    public static Dictionary<string, object> Write(DayRows rows, Settings settings, string token, string mode, string hospitalName)
    {
        var request = new Dictionary<string, object>
        {
            ["token"] = token ?? "",
            ["action"] = "write",
            ["month"] = Month(settings, hospitalName, rows.Day),
            ["sheetName"] = SheetName(rows.Day),
            ["layout"] = Layout(settings),
            ["mode"] = mode,
            ["patients"] = rows.Patients.Select(p => (object)Patient(p, settings)).ToList(),
            ["cancelled"] = rows.Cancelled.Select(c => (object)Cancelled(c, settings)).ToList(),
            ["paidOnly"] = rows.PaidOnly.Select(p => (object)PaidOnly(p, settings)).ToList(),
        };
        return request;
    }

    /// <summary>
    /// 내원 없이 예전 미수만 낸 환자 한 명(판 7): 이름·기호·금액만, 차트번호는 보내지 않는다(총내원 COUNT(B)가 늘지 않게).
    /// 이어지는 돈 줄도 이름을 단다. before = 환자 목록에서 이 자리 앞(시각 차례).
    /// </summary>
    public static Dictionary<string, object> PaidOnly(PaidOnlyRow p, Settings settings)
    {
        var c = settings.Columns;
        var name = ColumnSettings.Norm(c.Name);
        var sign = ColumnSettings.Norm(c.Sign);
        var amount = ColumnSettings.Norm(c.Amount);
        var cells = new Dictionary<string, object>
        {
            [name] = p.Name ?? "",
            [sign] = p.Money.Count > 0 ? (object)p.Money[0].Sign : "",
            [amount] = p.Money.Count > 0 ? (object)p.Money[0].Amount : "",
        };
        var more = p.Money.Skip(1).Select(m => (object)new Dictionary<string, object>
        {
            [name] = p.Name ?? "",
            [sign] = m.Sign,
            [amount] = m.Amount,
        }).ToList();
        return new Dictionary<string, object>
        {
            ["cells"] = cells,
            ["more"] = more,
            ["before"] = p.Before,
        };
    }

    /// <summary>취소된 접수 한 명: 차트번호·이름만(구글은 이 둘이 같은 본 줄만 지운다).</summary>
    public static Dictionary<string, object> Cancelled(CancelledRow c, Settings settings)
    {
        var cols = settings.Columns;
        return new Dictionary<string, object>
        {
            ["key"] = c.Key ?? "",
            ["cells"] = new Dictionary<string, object>
            {
                [ColumnSettings.Norm(cols.Key)] = KeyCell(c.Key),
                [ColumnSettings.Norm(cols.Name)] = c.Name ?? "",
            },
        };
    }

    public static Dictionary<string, object> Ping(Settings settings, string token, string hospitalName, DateTime today)
    {
        return new Dictionary<string, object>
        {
            ["token"] = token ?? "",
            ["action"] = "ping",
            ["month"] = Month(settings, hospitalName, today),
        };
    }

    public static string SheetName(DateTime day) => day.Day.ToString(CultureInfo.InvariantCulture);

    public static Dictionary<string, object> Month(Settings settings, string hospitalName, DateTime day)
    {
        return new Dictionary<string, object>
        {
            ["templateId"] = GoogleIds.Spreadsheet(settings.TemplateUrl),
            ["fileName"] = FileName(settings.FileNamePattern, hospitalName, day),
            ["folderId"] = GoogleIds.Folder(settings.FolderUrl),
            ["shareWith"] = (settings.ShareWith ?? new List<string>()).Cast<object>().ToList(),
        };
    }

    public static Dictionary<string, object> Layout(Settings settings)
    {
        var c = settings.Columns;
        return new Dictionary<string, object>
        {
            ["firstRow"] = settings.FirstRow,
            ["lastRow"] = settings.LastRow,
            ["keyCol"] = ColumnSettings.Norm(c.Key),
            ["nameCol"] = ColumnSettings.Norm(c.Name),
            ["ownedCols"] = c.Owned().Cast<object>().ToList(),
            ["moneyCols"] = new List<object> { ColumnSettings.Norm(c.Sign), ColumnSettings.Norm(c.Amount) },
            ["staffCols"] = (settings.StaffCols ?? new List<string>()).Select(ColumnSettings.Norm).Cast<object>().ToList(),
            ["shiftCols"] = settings.ShiftCols ?? "",
            // 판 7: 이어지는 돈 줄에도 이름(C), 비고 칸과 프로그램이 넣는 비고 글(이 글만 바꾸거나 지울 수 있다)
            ["nameOnMore"] = true,
            ["noteCol"] = ColumnSettings.Norm(c.Note),
            ["noteTexts"] = NoteTexts.All.Cast<object>().ToList(),
        };
    }

    public static Dictionary<string, object> Patient(PatientRow p, Settings settings)
    {
        var c = settings.Columns;
        var mark = MarkValue(settings.MarkValue);
        var cells = new Dictionary<string, object>
        {
            [ColumnSettings.Norm(c.Key)] = KeyCell(p.Key),
            [ColumnSettings.Norm(c.Name)] = p.Name ?? "",
            [ColumnSettings.Norm(c.Sign)] = p.Money.Count > 0 ? (object)p.Money[0].Sign : "",
            [ColumnSettings.Norm(c.Amount)] = p.Money.Count > 0 ? (object)p.Money[0].Amount : "",
            [ColumnSettings.Norm(c.Room)] = p.Room.HasValue ? (object)p.Room.Value : "",
            [ColumnSettings.Norm(c.First)] = p.First ? mark : "",
            [ColumnSettings.Norm(c.Day90)] = p.Day90 ? mark : "",
            [ColumnSettings.Norm(c.Block)] = p.Block ? mark : "",
            [ColumnSettings.Norm(c.Therapy)] = p.Therapy ? mark : "",
        };
        // 이어지는 돈 줄: 이름(C)·기호·금액. 차트번호(B)는 첫 줄에만(총내원 COUNT(B)가 늘지 않게)
        var more = p.Money.Skip(1).Select(m => (object)new Dictionary<string, object>
        {
            [ColumnSettings.Norm(c.Name)] = p.Name ?? "",
            [ColumnSettings.Norm(c.Sign)] = m.Sign,
            [ColumnSettings.Norm(c.Amount)] = m.Amount,
        }).ToList();
        var request = new Dictionary<string, object>
        {
            ["key"] = p.Key ?? "",
            ["cells"] = cells,
            ["more"] = more,
        };
        if (ColumnSettings.Norm(c.Note).Length > 0) request["note"] = p.Note ?? "";
        // 늦게 붙은 FREE: FREE 짝과, FREE 때문에 뺀 진료수납 짝(구글 쪽이 시트에 똑같이 남은 줄만 FREE로 바꾼다)
        var freeLine = p.Money.FirstOrDefault(m => m.IsFree);
        if (freeLine != null && p.FreeDropped.Count > 0)
        {
            request["free"] = new Dictionary<string, object>
            {
                ["cells"] = new Dictionary<string, object>
                {
                    [ColumnSettings.Norm(c.Sign)] = freeLine.Sign,
                    [ColumnSettings.Norm(c.Amount)] = freeLine.Amount,
                },
                ["dropped"] = p.FreeDropped.Select(m => (object)new Dictionary<string, object>
                {
                    [ColumnSettings.Norm(c.Sign)] = m.Sign,
                    [ColumnSettings.Norm(c.Amount)] = m.Amount,
                }).ToList(),
            };
        }
        return request;
    }

    /// <summary>차트번호 칸: 0으로 시작하지 않는 숫자뿐(15자리까지)이면 숫자, 아니면 글자.</summary>
    public static object KeyCell(string? key)
    {
        var k = (key ?? "").Trim();
        if (k.Length > 0 && k.Length <= 15 && k.All(ch => ch >= '0' && ch <= '9') && (k.Length == 1 || k[0] != '0'))
        {
            return long.Parse(k, CultureInfo.InvariantCulture);
        }
        return k;
    }

    /// <summary>표시 값: 숫자면 숫자, TRUE/FALSE면 참거짓, 비면 0, 그 밖은 글자.</summary>
    public static object MarkValue(string text)
    {
        var t = (text ?? "").Trim();
        if (t.Length == 0) return 0L;
        if (long.TryParse(t, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out var l)) return l;
        if (decimal.TryParse(t, NumberStyles.Number, CultureInfo.InvariantCulture, out var d)) return d;
        if (string.Equals(t, "TRUE", StringComparison.OrdinalIgnoreCase)) return true;
        if (string.Equals(t, "FALSE", StringComparison.OrdinalIgnoreCase)) return false;
        return t;
    }

    /// <summary>새 달 파일 이름: {병원} {yyyy} {yy} {m} {mm}.</summary>
    public static string FileName(string pattern, string hospitalName, DateTime day)
    {
        var p = string.IsNullOrWhiteSpace(pattern) ? "{병원} 일일수납일지 {yyyy}년 {m}월" : pattern;
        return p.Replace("{병원}", (hospitalName ?? "").Trim())
            .Replace("{yyyy}", day.Year.ToString("0000", CultureInfo.InvariantCulture))
            .Replace("{yy}", (day.Year % 100).ToString("00", CultureInfo.InvariantCulture))
            .Replace("{mm}", day.Month.ToString("00", CultureInfo.InvariantCulture))
            .Replace("{m}", day.Month.ToString(CultureInfo.InvariantCulture))
            .Trim();
    }

    /// <summary>
    /// 요청 JSON(빈칸 없이, 한글은 글자 그대로). 비트시트는 JavaScriptSerializer였다: 칸 차례·값의 형은 같고,
    /// 다른 것은 &lt; &gt; &amp; ' 를 \u 꼴로 바꾸지 않는 것뿐이다(같은 JSON 값). 받는 값: 사전·목록·글·참거짓·정수·decimal.
    /// </summary>
    public static string ToJson(object? value)
    {
        var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer, Envelope.WriterOptions))
        {
            WriteValue(writer, value, 0);
        }
        return Encoding.UTF8.GetString(buffer.ToArray());
    }

    private const int MaxDepth = 64;

    private static void WriteValue(Utf8JsonWriter writer, object? value, int depth)
    {
        if (depth > MaxDepth) throw new InvalidOperationException("요청이 너무 깊다");
        switch (value)
        {
            case null:
                writer.WriteNullValue();
                break;
            case string text:
                writer.WriteStringValue(text);
                break;
            case bool flag:
                writer.WriteBooleanValue(flag);
                break;
            case int number:
                writer.WriteNumberValue(number);
                break;
            case long number:
                writer.WriteNumberValue(number);
                break;
            case decimal number:
                writer.WriteNumberValue(number);
                break;
            case IEnumerable<KeyValuePair<string, object>> map:
                writer.WriteStartObject();
                foreach (var pair in map)
                {
                    writer.WritePropertyName(pair.Key);
                    WriteValue(writer, pair.Value, depth + 1);
                }
                writer.WriteEndObject();
                break;
            case IEnumerable list:
                writer.WriteStartArray();
                foreach (var item in list) WriteValue(writer, item, depth + 1);
                writer.WriteEndArray();
                break;
            default:
                throw new InvalidOperationException("요청에 쓸 수 없는 값의 형");
        }
    }

    /// <summary>
    /// 줄 내용의 지문(저절로 넣기에서 지난번과 같은지 보려고, 메모리에만 둔다): 비밀 글자·모드를 뺀 요청 전체의 SHA-256.
    /// </summary>
    public static string Fingerprint(Dictionary<string, object> request)
    {
        var copy = new Dictionary<string, object>(request);
        copy.Remove("token");
        copy.Remove("mode");
        using (var sha = SHA256.Create())
        {
            var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(ToJson(copy)));
            return string.Concat(bytes.Select(b => b.ToString("x2", CultureInfo.InvariantCulture)));
        }
    }
}

/// <summary>구글 주소에서 ID 뽑기.</summary>
public static class GoogleIds
{
    private static readonly Regex SheetRx = new Regex(@"/spreadsheets/d/([A-Za-z0-9_-]+)", RegexOptions.Compiled);
    private static readonly Regex FolderRx = new Regex(@"/folders/([A-Za-z0-9_-]+)", RegexOptions.Compiled);
    private static readonly Regex IdParamRx = new Regex(@"[?&]id=([A-Za-z0-9_-]+)", RegexOptions.Compiled);

    public static string Spreadsheet(string urlOrId) => Extract(urlOrId, SheetRx);

    public static string Folder(string urlOrId) => Extract(urlOrId, FolderRx);

    private static string Extract(string urlOrId, Regex rx)
    {
        var t = (urlOrId ?? "").Trim();
        if (t.Length == 0) return "";
        var m = rx.Match(t);
        if (m.Success) return m.Groups[1].Value;
        m = IdParamRx.Match(t);
        if (m.Success) return m.Groups[1].Value;
        // 모르는 모양이면 그대로 보낸다(웹 앱도 주소를 받아 ID를 뽑는다)
        return t;
    }
}

/// <summary>개수만(이름·차트번호 없음). /dry 출력과 화면 안내 줄에 쓴다.</summary>
public sealed class DayStats
{
    public int Visits { get; set; }
    public int Patients { get; set; }
    public int MoneyLines { get; set; }
    public int SplitPatients { get; set; }
    public int Free { get; set; }
    public int NoMoney { get; set; }
    public int First { get; set; }
    public int Day90 { get; set; }
    public int Block { get; set; }
    public int Therapy { get; set; }
    public SortedDictionary<string, int> Rooms { get; } = new SortedDictionary<string, int>(StringComparer.Ordinal);
    public int NoKeyVisits { get; set; }
    public int ReceivableOnly { get; set; }
    public int UnlinkedReceipts { get; set; }
    public int IgnoredNegative { get; set; }
    /// <summary>그날 접수를 취소했고 같은 날 센 내원이 없는 환자.</summary>
    public int Cancelled { get; set; }
    /// <summary>내원 없이 미수만 내서 이름 줄로 넣는 환자와 그 돈 줄.</summary>
    public int PaidOnly { get; set; }
    public int PaidOnlyLines { get; set; }
    /// <summary>비고에 넣을 글: 자동차보험 · 건강생활잔액 환자 수.</summary>
    public int CarNote { get; set; }
    public int HealthFundNote { get; set; }

    public static DayStats Of(DayRows rows)
    {
        var s = new DayStats
        {
            Visits = rows.Visits,
            Patients = rows.Patients.Count,
            MoneyLines = rows.Patients.Sum(p => p.Money.Count(m => !m.IsFree)),
            SplitPatients = rows.Patients.Count(p => p.Money.Count(m => !m.IsFree) >= 2),
            Free = rows.Patients.Count(p => p.IsFree),
            NoMoney = rows.Patients.Count(p => p.Money.Count == 0),
            First = rows.Patients.Count(p => p.First),
            Day90 = rows.Patients.Count(p => p.Day90),
            Block = rows.Patients.Count(p => p.Block),
            Therapy = rows.Patients.Count(p => p.Therapy),
            NoKeyVisits = rows.NoKeyVisits,
            ReceivableOnly = rows.ReceivableOnly,
            UnlinkedReceipts = rows.UnlinkedReceipts,
            IgnoredNegative = rows.IgnoredNegative,
            Cancelled = rows.Cancelled.Count,
            PaidOnly = rows.PaidOnly.Count,
            PaidOnlyLines = rows.PaidOnly.Sum(p => p.Money.Count),
            CarNote = rows.Patients.Count(p => p.Note == NoteTexts.CarInsurance),
            HealthFundNote = rows.Patients.Count(p => p.Note == NoteTexts.HealthFund),
        };
        foreach (var p in rows.Patients)
        {
            var k = p.Room.HasValue ? p.Room.Value.ToString(CultureInfo.InvariantCulture) : "빈칸";
            s.Rooms[k] = s.Rooms.TryGetValue(k, out var n) ? n + 1 : 1;
        }
        return s;
    }

    /// <summary>/dry 출력(개수만).</summary>
    public string ToText(DateTime day)
    {
        var sb = new StringBuilder();
        sb.AppendLine("날짜 " + day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) + " (구글에 보내지 않음)");
        sb.AppendLine("센 내원 " + Visits);
        sb.AppendLine("환자 " + Patients);
        sb.AppendLine("돈 줄 " + MoneyLines);
        sb.AppendLine("나눠 낸 환자 " + SplitPatients);
        sb.AppendLine("FREE " + Free);
        sb.AppendLine("돈 칸 비움 " + NoMoney);
        sb.AppendLine("초진 표시 " + First);
        sb.AppendLine("90일초진 표시 " + Day90);
        sb.AppendLine("Block(주사) 표시 " + Block);
        sb.AppendLine("물리치료 표시 " + Therapy);
        sb.AppendLine("진료실별 " + string.Join(", ", Rooms.Select(r => r.Key + ":" + r.Value)));
        sb.AppendLine("비고: 자동차보험 " + CarNote + ", 건강생활잔액 " + HealthFundNote);
        sb.AppendLine("내원 없이 미수만 낸 환자(이름 줄) " + PaidOnly + ", 그 돈 줄 " + PaidOnlyLines);
        sb.AppendLine("취소된 접수(그날 센 내원 없음) " + Cancelled);
        sb.AppendLine("넣지 않음: 차트번호 없는 내원 " + NoKeyVisits + ", 이름을 몰라 못 넣은 미수만 낸 환자 " + ReceivableOnly
            + ", 센 내원에 안 붙은 수납 줄 " + UnlinkedReceipts + ", 0보다 작은 돈 " + IgnoredNegative);
        return sb.ToString();
    }

    /// <summary>주 창 결과용 '넣지 않은 것' 한 줄(개수만). 하나도 없으면 "".</summary>
    public string UncountedText()
    {
        var parts = new List<string>();
        if (ReceivableOnly > 0) parts.Add("이름을 모르는 미수만 낸 환자 " + ReceivableOnly + "명");
        if (UnlinkedReceipts > 0) parts.Add("내원에 안 붙은 수납 " + UnlinkedReceipts + "줄");
        if (IgnoredNegative > 0) parts.Add("0보다 작은 돈 " + IgnoredNegative + "개");
        if (NoKeyVisits > 0) parts.Add("차트번호 없는 내원 " + NoKeyVisits + "건");
        return parts.Count == 0 ? "" : "넣지 않음: " + string.Join(" · ", parts);
    }

    /// <summary>기록 파일 한 줄용(개수만).</summary>
    public string ToLogText() =>
        "patients=" + Patients + " money=" + MoneyLines + " split=" + SplitPatients + " free=" + Free
        + " J=" + First + " K=" + Day90 + " L=" + Block + " M=" + Therapy
        + " car=" + CarNote + " fund=" + HealthFundNote + " paidOnly=" + PaidOnly + "/" + PaidOnlyLines
        + " cancelled=" + Cancelled + " rcvOnly=" + ReceivableOnly + " unlinked=" + UnlinkedReceipts + " negative=" + IgnoredNegative + " noKey=" + NoKeyVisits;
}

/// <summary>넣기는 됐지만 사람이 시트를 봐야 하는 것(개수만). 주 창 결과와 알림 영역 그림이 같이 쓴다.</summary>
public static class RunNotes
{
    public static List<string> Warnings(WebAppReply reply)
    {
        var list = new List<string>();
        if (reply == null) return list;
        if (reply.CancelKept > 0) list.Add("취소된 접수 " + reply.CancelKept + "명 — 시트에서 확인해 주세요");
        if (reply.Skipped > 0) list.Add("건너뛴 줄 " + reply.Skipped + "개 — 시트에서 확인해 주세요");
        if (reply.Full) list.Add("빈 줄이 모자라 다 넣지 못했어요");
        if (reply.Version != WebAppClient.CodeVersion) list.Add("구글 코드가 옛 판이에요 — [구글에 붙일 코드 복사]로 새로 붙여 주세요");
        return list;
    }

    /// <summary>
    /// 오늘 시트 것 + 지난 날 다시 넣기 것. 지난 날 것은 'M월 d일 시트: '를 붙여 따로 보이고, 오늘 것과 같은 글(옛 판 등)은 한 번만.
    /// </summary>
    public static List<string> Combine(List<string> today, List<string> earlier, DateTime earlierDay)
    {
        var all = new List<string>(today ?? new List<string>());
        foreach (var n in earlier ?? new List<string>())
        {
            if (!all.Contains(n)) all.Add(earlierDay.Month + "월 " + earlierDay.Day + "일 시트: " + n);
        }
        return all;
    }

    private const string CheckTail = " — 시트에서 확인해 주세요";

    /// <summary>
    /// 비율 식 고치기 한 줄(판 7, 칸 수와 '시트!칸'만, 값 없음). 없으면 "". 기록 파일과 주 창 결과에 보인다(경고 그림은 아님).
    /// </summary>
    public static string RatioLine(WebAppReply reply)
    {
        if (reply == null) return "";
        var parts = new List<string>();
        if (reply.RatioFixed > 0) parts.Add("비율 식(초진·90일초진·Block·물리치료 %) " + reply.RatioFixed + "칸을 차트번호로 세게 고쳤어요");
        if (reply.RatioSkipped > 0)
        {
            var some = (reply.RatioSkippedCells ?? new List<string>()).Take(4).ToList();
            parts.Add("이 칸들은 식 모양이 달라 그대로 두었어요" + (some.Count > 0 ? ": " + string.Join(", ", some) + (reply.RatioSkipped > some.Count ? " 등" : "") : "")
                + " (" + reply.RatioSkipped + "칸) — 비율이 조금 낮게 나올 수 있어요. 필요하면 원장님께 알려 주세요");
        }
        if (reply.RatioFailed) parts.Add("비율 식을 고치지 못했어요(다음 넣기 때 다시 해요)");
        return string.Join(" · ", parts);
    }

    /// <summary>기록에 남길 새 달 파일 정리 한 줄(칸 수만, 값 없음). 지운 칸이 없으면 "".</summary>
    public static string CleanedLine(WebAppReply reply)
    {
        if (reply == null || reply.Cleaned <= 0) return "";
        return "새 달 파일 날짜 시트에 남아 있던 글자 " + reply.Cleaned + "칸을 지웠어요 (원본은 그대로)";
    }

    /// <summary>한 줄로(주 창 결과): 같은 끝말 '— 시트에서 확인해 주세요'는 한 번만. 예: "취소된 접수 1명 · 건너뛴 줄 1개 — 시트에서 확인해 주세요".</summary>
    public static string OneLine(List<string> notes)
    {
        if (notes == null || notes.Count == 0) return "";
        var check = notes.Where(n => n.EndsWith(CheckTail, StringComparison.Ordinal)).Select(n => n.Substring(0, n.Length - CheckTail.Length)).ToList();
        var parts = new List<string>();
        if (check.Count > 0) parts.Add(string.Join(" · ", check) + CheckTail);
        parts.AddRange(notes.Where(n => !n.EndsWith(CheckTail, StringComparison.Ordinal)));
        return string.Join(" · ", parts);
    }
}
