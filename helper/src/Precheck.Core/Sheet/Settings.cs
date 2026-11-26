// 비트시트 app/src/Core/Settings.cs(작업 트리 파일, 판 7)을 옮김(spec google-link TASK-9, design.md 9-1). 규칙은 그대로, 바뀐 것은 이름공간·nullable 표시.
using System;
using System.Collections.Generic;
using System.Linq;

namespace Precheck.Core.Sheet;

/// <summary>FREE(기호 6)로 볼 때. 비트에서 실제로 찾은 모양만 둔다(notes/bit-facts.md 6절, DESIGN 3절).</summary>
public enum FreeRule
{
    /// <summary>본인부담이 있는데 받은 돈 0원이고 미수·건강생활유지비도 없을 때(설정 판 1의 기본).</summary>
    OwedNotPaid = 0,
    /// <summary>건강보험(정한 보험 코드) 환자인데 본인부담이 0원일 때.</summary>
    OwnZeroInsured = 1,
    /// <summary>본인부담이 0원일 때(자보·의료급여 포함).</summary>
    OwnZeroAny = 2,
    /// <summary>총진료비가 0원일 때.</summary>
    TotalZero = 3,
    /// <summary>
    /// 그 내원에 비트 할인 기록 '사용자할인(FREE)'가 있을 때(기본, DESIGN 3절). 받은 돈과 상관없이 그 내원의 진료수납 돈 줄을
    /// 모두 빼고 FREE 한 줄(기호 6, 0원)만 넣는다. 같은 날 미수입금 줄은 따로 넣는다.
    /// </summary>
    DiscountFree = 4,
    /// <summary>FREE를 쓰지 않음.</summary>
    None = 9,
}

/// <summary>시트 칸 글자.</summary>
public sealed class ColumnSettings
{
    public string Key { get; set; } = "B";
    public string Name { get; set; } = "C";
    public string Sign { get; set; } = "D";
    public string Amount { get; set; } = "F";
    public string Room { get; set; } = "I";
    public string First { get; set; } = "J";
    public string Day90 { get; set; } = "K";
    public string Block { get; set; } = "L";
    public string Therapy { get; set; } = "M";
    /// <summary>
    /// 비고 칸(기본 G). 프로그램은 빈 칸일 때만 '자동차보험'·'건강생활잔액'을 넣는다(직원 글은 안 바꿈). ""이면 넣지 않는다.
    /// 비트가 채우는 칸(Owned)이 아니다.
    /// </summary>
    public string Note { get; set; } = "G";

    public IEnumerable<string> Owned()
    {
        return new[] { Key, Name, Sign, Amount, Room, First, Day90, Block, Therapy }
            .Select(Norm).Where(c => c.Length > 0).Distinct().ToList();
    }

    public static string Norm(string col) => (col ?? "").Trim().ToUpperInvariant();

    /// <summary>칸 글자가 모두 A~ZZ이고 겹치지 않는가. 비고 칸은 비워도 된다(끔).</summary>
    public bool IsValid(out string problem)
    {
        var all = new[] { Key, Name, Sign, Amount, Room, First, Day90, Block, Therapy }.Select(Norm).ToList();
        foreach (var c in all)
        {
            if (!IsLetters(c))
            {
                problem = "칸 글자는 A~Z 글자로 넣어 주세요.";
                return false;
            }
        }
        var note = Norm(Note);
        if (note.Length > 0)
        {
            if (!IsLetters(note))
            {
                problem = "비고 칸 글자는 A~Z 글자로 넣어 주세요(비우면 비고를 넣지 않아요).";
                return false;
            }
            all.Add(note);
        }
        if (all.Distinct().Count() != all.Count)
        {
            problem = "같은 칸 글자를 두 번 쓸 수 없어요.";
            return false;
        }
        problem = "";
        return true;
    }

    private static bool IsLetters(string c) => c.Length > 0 && c.Length <= 2 && c.All(ch => ch >= 'A' && ch <= 'Z');
}

/// <summary>기호 번호.</summary>
public sealed class SignSettings
{
    public int Cash { get; set; } = 1;
    public int Card { get; set; } = 2;
    public int ReceivableCash { get; set; } = 3;
    public int ReceivableCard { get; set; } = 4;
    public int Transfer { get; set; } = 5;
    /// <summary>미수입금을 계좌로 낸 것. 화면에는 없고 settings.json에서만 바꾼다(기본 = 계좌이체와 같은 5).</summary>
    public int ReceivableTransfer { get; set; } = 5;
    public int Free { get; set; } = 6;
}

/// <summary>
/// 병원마다 다른 설정 전부(비트시트 %APPDATA%\BitSheet\settings.json과 같은 칸). 도우미에서는 웹 설정 JSON(SheetSettingsJson)에서 만들고,
/// 비트시트 파일은 가져오기(BitSheetImport)로 읽기만 한다. 비트 폴더(BitRoot)·윈도 시작(StartWithWindows)은 도우미가 따로 알므로 옮기지 않았다.
/// 주소(WebAppUrl)·잠근 비밀 글자(TokenProtected)·함께 쓸 메일(ShareWith)은 가져오기에서만 채우고 웹 설정 JSON에는 없다.
/// </summary>
public sealed class Settings
{
    /// <summary>지금 설정 판. 2 = FREE 기본이 '비트 할인 기록 FREE'로 바뀐 판.</summary>
    public const int CurrentVersion = 2;

    /// <summary>파일의 설정 판. 판 1 파일에는 이 칸이 없어서 0으로 읽힌다(그래서 처음 값은 0, 새 파일은 저장소가 CurrentVersion을 넣는다).</summary>
    public int Version { get; set; }

    // ── 구글 연결
    public string WebAppUrl { get; set; } = "";
    /// <summary>DPAPI(이 PC 이 사용자)로 잠근 비밀 글자(base64). 화면·기록에 내지 않는다.</summary>
    public string TokenProtected { get; set; } = "";

    // ── 시트
    /// <summary>원본 시트 주소. 병원마다 그 병원 계정의 원본을 넣는다(기본값 없음).</summary>
    public string TemplateUrl { get; set; } = "";
    public string FileNamePattern { get; set; } = "{병원} 일일수납일지 {yyyy}년 {m}월";
    /// <summary>{병원}에 넣을 이름. 비면 비트 HspMst.HspNam.</summary>
    public string HospitalName { get; set; } = "";
    public string FolderUrl { get; set; } = "";
    public List<string> ShareWith { get; set; } = new List<string>();
    public int FirstRow { get; set; } = 17;
    public int LastRow { get; set; } = 302;
    public ColumnSettings Columns { get; set; } = new ColumnSettings();
    /// <summary>표시 값. 숫자면 숫자로, TRUE/FALSE면 참거짓으로 보낸다(기본 숫자 0).</summary>
    public string MarkValue { get; set; } = "0";

    // ── 비트 맞춤
    /// <summary>비트 병원 범위(DepMst.DepHspNum). 비면 DB에 하나뿐인 것을 쓴다.</summary>
    public string HospitalCode { get; set; } = "";
    /// <summary>
    /// 진료과 코드 → 진료실 번호(1~10). 없는 코드는 빈칸. 처음에는 비어 있고, 그 병원 진료과에 저절로 번호를 붙인다(RoomPlan).
    /// </summary>
    public Dictionary<string, int> DeptRooms { get; set; } = new Dictionary<string, int>();
    /// <summary>DeptRooms를 맞춘(저절로 붙였거나 사람이 저장한) 비트 병원 코드. 이 병원과 다르면 아직 맞추지 않은 것으로 본다.</summary>
    public string DeptRoomsHospital { get; set; } = "";
    public List<string> FirstVisitKinds { get; set; } = new List<string> { "1" };
    public List<string> Day90Kinds { get; set; } = new List<string> { "3" };
    public List<string> BlockCodes { get; set; } = new List<string>();
    public List<string> TherapyCodes { get; set; } = new List<string>();
    public FreeRule Free { get; set; } = FreeRule.DiscountFree;
    /// <summary>FreeRule.OwnZeroInsured에서 볼 보험 코드(기본 31 국민건강보험).</summary>
    public List<int> FreeInsurance { get; set; } = new List<int> { 31 };
    /// <summary>비고 '자동차보험'을 넣을 보험 코드(비트 InsMst 21 자보-청구분 · 22 자보-100%). 화면에는 없고 settings.json에서만 바꾼다.</summary>
    public List<int> CarInsurance { get; set; } = new List<int> { 21, 22 };
    /// <summary>비고 '건강생활잔액'을 볼 의료급여 보험 코드(비트 InsMst 51 보호1종 · 52 보호2종). settings.json에서만 바꾼다.</summary>
    public List<int> AidInsurance { get; set; } = new List<int> { 51, 52 };
    public SignSettings Signs { get; set; } = new SignSettings();
    /// <summary>
    /// 직원이 적는 칸(기본 G 비고 · O 예약관리). 취소된 접수 줄은 이 칸이 비어 있을 때만 지운다(DESIGN 4절).
    /// 화면에는 없고 settings.json에서만 바꾼다.
    /// </summary>
    public List<string> StaffCols { get; set; } = new List<string> { "G", "O" };
    /// <summary>
    /// 늦게 낸 돈을 환자 바로 아래에 끼울 때 아래로 밀 칸(기본 "A:P", 지출 R:T·옆 표는 그대로). ""이면 끼우지 않는다(DESIGN 4절).
    /// 비트가 채우는 칸·이름 칸·직원 칸을 모두 품어야 한다.
    /// </summary>
    public string ShiftCols { get; set; } = "A:P";

    // ── 저절로 넣기
    public bool IntervalEnabled { get; set; } = true;
    public int IntervalMinutes { get; set; } = 5;
    public string HoursStart { get; set; } = "08:00";
    public string HoursEnd { get; set; } = "20:00";
    public bool EveningEnabled { get; set; } = true;
    public string EveningTime { get; set; } = "19:30";

    /// <summary>
    /// 옛 판 파일을 지금 판으로 한 번 바꾼다(저장소가 읽은 직후에 부른다). 판 1의 FREE 기본값(OwedNotPaid)은
    /// 새 기본(DiscountFree)으로 바꾼다. 판 2부터 사용자가 고른 값은 그대로 둔다. 바꿨으면 true.
    /// </summary>
    public bool Migrate()
    {
        if (Version >= CurrentVersion) return false;
        if (Free == FreeRule.OwedNotPaid) Free = FreeRule.DiscountFree;
        Version = CurrentVersion;
        return true;
    }

    /// <summary>밀어 낼 칸 글("A:P")이 맞는가: 모양, 앞 칸 ≤ 뒤 칸, 비트가 채우는 칸·직원 칸을 모두 품음. ""(끄기)도 맞음.</summary>
    public bool IsShiftValid(string text, out string problem)
    {
        problem = "";
        var t = (text ?? "").Replace(" ", "").ToUpperInvariant();
        if (t.Length == 0) return true;
        var parts = t.Split(':');
        if (parts.Length != 2 || !IsLetters(parts[0]) || !IsLetters(parts[1]))
        {
            problem = "밀어 내릴 칸은 A:P처럼 넣어 주세요(비우면 줄을 끼우지 않아요).";
            return false;
        }
        int first = ColumnNumber(parts[0]), last = ColumnNumber(parts[1]);
        if (first > last)
        {
            problem = "밀어 내릴 칸은 앞 칸을 먼저 적어 주세요(예: A:P).";
            return false;
        }
        var need = Columns.Owned().Concat(StaffCols ?? new List<string>()).Concat(new[] { Columns.Note }).Select(ColumnSettings.Norm).Where(c => c.Length > 0);
        if (need.Any(c => !IsLetters(c) || ColumnNumber(c) < first || ColumnNumber(c) > last))
        {
            problem = "밀어 내릴 칸은 비트가 채우는 칸과 비고·예약 칸을 모두 품어야 해요(예: A:P).";
            return false;
        }
        return true;
    }

    private static bool IsLetters(string s) => s.Length > 0 && s.Length <= 3 && s.All(ch => ch >= 'A' && ch <= 'Z');

    private static int ColumnNumber(string s)
    {
        var n = 0;
        foreach (var ch in s.ToUpperInvariant()) n = n * 26 + (ch - 'A' + 1);
        return n;
    }

    /// <summary>빠진 칸·틀린 값을 기본값으로 메운다(옛 파일·손으로 고친 파일).</summary>
    public void Normalize()
    {
        if (FileNamePattern == null || FileNamePattern.Trim().Length == 0) FileNamePattern = "{병원} 일일수납일지 {yyyy}년 {m}월";
        WebAppUrl = (WebAppUrl ?? "").Trim();
        TokenProtected = TokenProtected ?? "";
        TemplateUrl = (TemplateUrl ?? "").Trim();
        HospitalName = (HospitalName ?? "").Trim();
        FolderUrl = (FolderUrl ?? "").Trim();
        ShareWith = (ShareWith ?? new List<string>()).Select(s => (s ?? "").Trim()).Where(s => s.Length > 0).Distinct().ToList();
        if (FirstRow < 1) FirstRow = 17;
        if (LastRow < FirstRow) LastRow = Math.Max(FirstRow, 302);
        Columns = Columns ?? new ColumnSettings();
        MarkValue = MarkValue ?? "0";
        HospitalCode = (HospitalCode ?? "").Trim();
        DeptRooms = (DeptRooms ?? new Dictionary<string, int>())
            .Where(p => !string.IsNullOrWhiteSpace(p.Key) && RoomPlan.IsRoom(p.Value))
            .GroupBy(p => p.Key.Trim(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First().Value, StringComparer.OrdinalIgnoreCase);
        DeptRoomsHospital = (DeptRoomsHospital ?? "").Trim();
        Columns.Note = ColumnSettings.Norm(Columns.Note);
        CarInsurance = CarInsurance ?? new List<int> { 21, 22 };
        AidInsurance = AidInsurance ?? new List<int> { 51, 52 };
        FirstVisitKinds = Clean(FirstVisitKinds);
        Day90Kinds = Clean(Day90Kinds);
        BlockCodes = Clean(BlockCodes).Select(c => c.ToUpperInvariant()).Distinct().ToList();
        TherapyCodes = Clean(TherapyCodes).Select(c => c.ToUpperInvariant()).Distinct().ToList();
        FreeInsurance = FreeInsurance ?? new List<int> { 31 };
        if (!Enum.IsDefined(typeof(FreeRule), Free)) Free = FreeRule.DiscountFree;
        Signs = Signs ?? new SignSettings();
        var owned = new HashSet<string>(Columns.Owned(), StringComparer.Ordinal);
        // 비고 칸이 비트가 채우는 칸과 겹치거나 깨진 글이면 끈다(구글 쪽이 요청을 거절하지 않게)
        if (Columns.Note.Length > 0 && (owned.Contains(Columns.Note) || Columns.Note.Length > 2 || !Columns.Note.All(ch => ch >= 'A' && ch <= 'Z'))) Columns.Note = "";
        StaffCols = (StaffCols ?? new List<string> { "G", "O" }).Select(ColumnSettings.Norm)
            .Where(c => c.Length > 0 && c.Length <= 2 && c.All(ch => ch >= 'A' && ch <= 'Z') && !owned.Contains(c)).Distinct().ToList();
        ShiftCols = ShiftCols == null ? "A:P" : ShiftCols.Replace(" ", "").ToUpperInvariant();
        // 깨진 글이면 기본값, 기본값도 칸을 다 품지 못하는 시트 모양이면 끄기(구글 쪽이 요청을 거절하지 않게)
        if (ShiftCols.Length > 0 && !IsShiftValid(ShiftCols, out _)) ShiftCols = IsShiftValid("A:P", out _) ? "A:P" : "";
        if (IntervalMinutes < 1) IntervalMinutes = 5;
        if (IntervalMinutes > 240) IntervalMinutes = 240;
        if (!Clock.TryParse(HoursStart, out _)) HoursStart = "08:00";
        if (!Clock.TryParse(HoursEnd, out _)) HoursEnd = "20:00";
        if (!Clock.TryParse(EveningTime, out _)) EveningTime = "19:30";
    }

    private static List<string> Clean(List<string> list) =>
        (list ?? new List<string>()).Select(s => (s ?? "").Trim()).Where(s => s.Length > 0).Distinct().ToList();
}

/// <summary>"HH:mm" 시각.</summary>
public static class Clock
{
    public static bool TryParse(string text, out TimeSpan time)
    {
        time = TimeSpan.Zero;
        var t = (text ?? "").Trim();
        var parts = t.Split(':');
        if (parts.Length != 2) return false;
        if (!int.TryParse(parts[0], out var h) || !int.TryParse(parts[1], out var m)) return false;
        if (h < 0 || h > 24 || m < 0 || m > 59 || (h == 24 && m != 0)) return false;
        time = new TimeSpan(h, m, 0);
        return true;
    }

    public static TimeSpan Parse(string text, TimeSpan fallback) => TryParse(text, out var t) ? t : fallback;
}
