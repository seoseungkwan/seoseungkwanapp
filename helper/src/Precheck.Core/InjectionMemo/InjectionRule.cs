using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;

namespace Precheck.Core.InjectionMemo;

/// <summary>
/// 주사 차수 → 접수메모(당일) 글 규칙(spec injection-memo REQ-7501). 순수 함수: DB·화면 없음.
/// 조사 초안(scratchpad injmemo-eval/Rule.cs, 지난 30일 314건 대조, notes/eval-30days.md)을 옮겼다. 낱말장·영어 부위 말·간격 말·요일 처리는 초안 그대로이고,
/// 명세에 맞춰 바꾼 것: 번호가 둘이면 앞 번호(초안은 '그날 한 것'을 먼저 골랐다), 간격 말('1개월 뒤'·'1달 후'·'1주일 뒤')은 다음 계획이고 앞말에서 지운다,
/// 'injection'을 'inj'보다 먼저 지운다, 앞말의 요일 한 글자(월·화·수·금·토)는 부위가 아니다, 요일 사이 '/'('월/목')는 조각을 나누지 않는다,
/// 'N차까지'의 지난 메모는 30일 안 메모 중 마지막. 같은 30일 자료로 다시 세면 초안 완전 일치 124·번호 일치 255 → 이 판 124·257(314건, 여유 3일).
/// </summary>
public static class InjectionRule
{
    /// <summary>오늘 앞 며칠의 내원을 보나(오늘 내원은 안 봄).</summary>
    public const int WindowDays = 30;

    /// <summary>계획 날짜보다 이만큼 일찍 와도 넣는다(사용자 고름, 지난 30일 기준 놓침 0).</summary>
    public const int DefaultGraceDays = 3;

    private enum Mode
    {
        /// <summary>그날 한 것: +1.</summary>
        Today,

        /// <summary>다음 계획: 번호 그대로.</summary>
        Plan,

        /// <summary>'N차까지': 지난 메모 번호 +1.</summary>
        Until,
    }

    private sealed class Mention
    {
        public int Line;
        public int Number;
        public Mode Mode;
        public string Prefix = "";
        public string Clause = "";
    }

    // 간격 말(AC-7501.4): 숫자 + 주·주일·일·개월·달·wk·week + 뒤·후·간격·마다. 'N주째'(지난 기간)는 아니다
    private const string GapPattern = @"(\d{1,2})\s*(주일|주|일|개월|달|wk|week)s?\s*(뒤|후|간격|마다)";
    private static readonly Regex Gap = new Regex(GapPattern, RegexOptions.Compiled);

    // 주사 아닌 차수
    private static readonly Regex NonInjection = new Regex(@"ESWT|eswt|Eswt|충격파|체외|도수|manual|MT\b|운동", RegexOptions.Compiled);

    // N차 (차트·차이·차량 등 빼기)
    private static readonly Regex Count = new Regex(@"(\d{1,2})\s*차(?![트이량례단선적])", RegexOptions.Compiled);
    private static readonly Regex MemoCount = new Regex(@"(\d{1,2})\s*차", RegexOptions.Compiled);
    private static readonly Regex Until = new Regex(@"^\s*(주사\s*)?까지", RegexOptions.Compiled);

    // 차수 앞·뒤의 다음 계획 말
    private static readonly Regex PlanBefore = new Regex(
        GapPattern + @"|\d+\s*(주|일|wk|week)\s*(뒤|후|간격|째)?|다음\s*주?|이번\s*주|[월화수목금토일]\s*요일|(?<![가-힣])[월화수금토](?![가-힣])|예정|f/u|F/U|내원\s*시|다음번|오면",
        RegexOptions.Compiled);
    private static readonly Regex PlanAfter = new Regex(
        @"^\s*(주사\s*)?(예정|하기로|할\s*것|할게|하자|진행|예약|합니다|합시다|하겠|할\s*예정|드립니다|해\s*드림)",
        RegexOptions.Compiled);

    // 차수 앞말에서 지울 때 말·주사 말
    private static readonly Regex TimeWords = new Regex(
        GapPattern + @"|\d+\s*(주|일|wk|week)\s*(뒤|후|간격|째)?|다음\s*주|이번\s*주|다음번|다음|[월화수목금토일]\s*요일|예정|f/u|F/U|내원\s*시|간격|매주|1주일|주일",
        RegexOptions.Compiled);
    private static readonly Regex WeekdayList = new Regex(@"(?<![가-힣])[월화수목금토일](\s*/\s*[월화수목금토일])+(?![가-힣])", RegexOptions.Compiled);
    private static readonly Regex Weekday = new Regex(@"(?<![가-힣])[월화수목금토일](?![가-힣])", RegexOptions.Compiled);
    private static readonly Regex WeekdayContext = new Regex(@"다음\s*주|이번\s*주|요일", RegexOptions.Compiled);
    private static readonly Regex Filler = new Regex(@"주사|injection|inj\.?|시행|했음|함|하고|합니다|\+|&|,|:|\(|\)|-", RegexOptions.Compiled);
    private static readonly Regex Spaces = new Regex(@"\s+", RegexOptions.Compiled);
    private static readonly Regex NerveBlock = new Regex(@"^(FNB|fnb|NB|TPI|tpi|SNB|snb|MBB|mbb|SSNB|ssnb|ANB|anb)$", RegexOptions.Compiled);
    private static readonly Regex PainWord = new Regex(@"^(pain|통증|pt|PT|inj)$", RegexOptions.Compiled);
    // 약 이름: 한 줄에 부위와 같이 있으면 부위 뒤에 띄어 쓴다('왼)무릎 DNA 2차', 2026-11-20 사용자)
    private static readonly Regex DrugWord = new Regex(@"^(DNA|PDRN|아라간|프롤로)$", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    // 점이 조각 끝이 아니라 줄임말 점인 낱말('Rt.'·'Lt.'·'Bil.'·'inj.')
    private static readonly HashSet<string> DotAbbreviations = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "rt", "lt", "bil", "both", "inj" };
    private static readonly Regex InjectionWord = new Regex(@"주사|\binj|SNB|MBB|SSNB|ANB|FNB|TPI|DNA|PDRN|아라간|프롤로|block|블록|차단", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex NeckAsWeekday = new Regex(@"다음\s*주\s*목|목\s*요일|[월화수금]\s*/\s*목|목\s*/\s*[월화수금]", RegexOptions.Compiled);

    // 좌우 말 → 오·왼·양
    private static readonly Regex SideWord = new Regex(
        @"(?<![가-힣A-Za-z])(양측|양쪽|양|both|bil|Bil|BIL|오른쪽|오른|우측|우|오|왼쪽|왼|좌측|좌|Rt|RT|rt|Lt|LT|lt)(?=[\s\)\.,:]|$|[가-힣])",
        RegexOptions.Compiled);

    private static readonly string[] Parts =
    {
        "경추", "목", "어깨", "견관절", "견갑", "날개뼈", "승모근", "팔꿈치", "주관절", "엘보", "손목", "수근관", "손가락", "수지", "엄지", "손바닥", "손등", "손",
        "허리", "요추", "흉추", "등", "골반", "천장관절", "엉덩이", "둔부", "고관절", "사타구니", "무릎", "슬관절", "종아리", "발목", "족관절", "발바닥", "족저", "아킬레스", "뒤꿈치", "발등", "발가락", "발",
        "꼬리뼈", "미추", "팔", "다리", "허벅지", "회전근개", "방아쇠",
    };

    private static readonly string[] PartsLongestFirst = Parts.OrderByDescending(part => part.Length).ToArray();

    // 목·허리처럼 가운데 부위(좌우를 안 붙임)
    private static readonly HashSet<string> Axial = new HashSet<string>(StringComparer.Ordinal) { "목", "경추", "허리", "요추", "흉추", "등", "골반", "꼬리뼈", "미추", "천장관절" };

    // 영어로 적힌 부위 → 우리말(메모에 쓰는 말), 차례대로 처음 맞는 것
    private static readonly KeyValuePair<Regex, string>[] EnglishParts =
    {
        English(@"\b(neck|c-?spine|cervical|PCS)\b|\bC\s*[1-7](?!\d)", "목", true),
        English(@"\b(shoulder|shd|sh|frozen|RCT|SAB|GHJ|SSNB|ANB|impingement|adhesive|capsulitis)\b", "어깨", true),
        English(@"\b(stenosis|spinal)\b|\bL\s*[1-5](?!\d)|\bS\s*1\b", "허리", false),
        English(@"\b(KLG)\b", "무릎", false),
        English(@"\b(elbow|tennis|golfer|epicondyl\w*)\b", "팔꿈치", true),
        English(@"\b(wrist|CTS|dequervain\w*)\b", "손목", true),
        English(@"\b(finger|thumb|trigger)\b", "손가락", true),
        English(@"\b(back|LBP|l-?spine|lumbar|HIVD|LSS)\b", "허리", true),
        English(@"\b(hip)\b", "고관절", true),
        English(@"\b(knee|OA)\b", "무릎", true),
        English(@"\b(ankle)\b", "발목", true),
        English(@"\b(foot|heel|plantar)\b", "발", true),
    };

    private static KeyValuePair<Regex, string> English(string pattern, string part, bool ignoreCase) =>
        new KeyValuePair<Regex, string>(new Regex(pattern, RegexOptions.Compiled | (ignoreCase ? RegexOptions.IgnoreCase : RegexOptions.None)), part);

    /// <summary>
    /// 오늘 앞 30일 내원들(날짜순이 아니어도 된다)에서 주사 차수(ESWT·도수·충격파 빼고)가 적힌 마지막 내원 하나로 메모 글을 정한다.
    /// 없으면 NoRecord, 'N차까지'가 끝났으면 Finished, 간격이 있고 (그 내원 날 + 간격) − graceDays보다 일찍이면 TooEarly.
    /// </summary>
    public static MemoResult Decide(IReadOnlyList<VisitNote> last30Days, DateTime today, int graceDays = DefaultGraceDays)
    {
        if (last30Days == null) throw new ArgumentNullException(nameof(last30Days));
        var day = today.Date;
        var inWindow = last30Days.Where(v => v != null && v.Date < day && v.Date >= day.AddDays(-WindowDays)).OrderBy(v => v.Date).ToList();
        for (var i = inWindow.Count - 1; i >= 0; i--)
        {
            var mentions = Mentions(inWindow[i].SymptomLines);
            if (mentions.Count > 0) return FromVisit(inWindow[i], mentions, inWindow, day, graceDays);
        }
        return new MemoResult(MemoResultKind.NoRecord);
    }

    /// <summary>메모 글의 첫 주사 차수 번호('/'로 나눈 조각 중 ESWT·도수 아닌 것). 없으면 null.</summary>
    internal static int? MemoNumber(string? memo)
    {
        foreach (var segment in (memo ?? "").Split('/'))
        {
            if (NonInjection.IsMatch(segment)) continue;
            var match = MemoCount.Match(segment);
            if (match.Success) return int.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture);
        }
        return null;
    }

    private static List<Mention> Mentions(IReadOnlyList<string> lines)
    {
        var list = new List<Mention>();
        for (var li = 0; li < lines.Count; li++)
        {
            var line = lines[li] ?? "";
            foreach (Match m in Count.Matches(line))
            {
                var start = ClauseStart(line, m.Index);
                var end = ClauseEnd(line, m.Index + m.Length);
                var before = line.Substring(start, m.Index - start);
                var after = line.Substring(m.Index + m.Length, end - (m.Index + m.Length));
                // 같은 조각에 주사 아닌 말(ESWT·도수)이 차수 앞이나 바로 뒤에 있으면 뺀다
                if (NonInjection.IsMatch(before) || NonInjection.IsMatch(Head(after, 6))) continue;
                var mode = Until.IsMatch(after) ? Mode.Until
                    : (PlanBefore.IsMatch(before) || PlanAfter.IsMatch(after) || WeekdayList.IsMatch(before)) ? Mode.Plan : Mode.Today;
                list.Add(new Mention
                {
                    Line = li,
                    Number = int.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture),
                    Mode = mode,
                    Prefix = before,
                    Clause = line.Substring(start, end - start),
                });
            }
        }
        return list;
    }

    private static string Head(string s, int n) => s.Length <= n ? s : s.Substring(0, n);

    // 조각 나눔: '/'·'.'·';'(앞쪽은 '>'도). 요일 사이 '/'('월/목')는 요일 묶음이라, 줄임말 점('Rt.'·'inj.')은 낱말 끝이라 나누지 않는다
    private static int ClauseStart(string line, int pos)
    {
        for (var i = pos - 1; i >= 0; i--)
        {
            if ((line[i] == '/' && !IsWeekdaySlash(line, i)) || (line[i] == '.' && !IsAbbreviationDot(line, i)) || line[i] == ';' || line[i] == '>') return i + 1;
        }
        return 0;
    }

    private static bool IsAbbreviationDot(string line, int dot)
    {
        var start = dot;
        while (start > 0 && IsAsciiLetter(line[start - 1])) start--;
        return start < dot && DotAbbreviations.Contains(line.Substring(start, dot - start));
    }

    private static bool IsAsciiLetter(char c) => (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');

    private static int ClauseEnd(string line, int pos)
    {
        for (var i = pos; i < line.Length; i++)
        {
            if ((line[i] == '/' && !IsWeekdaySlash(line, i)) || (line[i] == '.' && !IsAbbreviationDot(line, i)) || line[i] == ';') return i;
        }
        return line.Length;
    }

    private static bool IsWeekdaySlash(string line, int slash)
    {
        var p = slash - 1;
        while (p >= 0 && char.IsWhiteSpace(line[p])) p--;
        var n = slash + 1;
        while (n < line.Length && char.IsWhiteSpace(line[n])) n++;
        return p >= 0 && n < line.Length && IsLoneWeekday(line, p) && IsLoneWeekday(line, n);
    }

    private static bool IsLoneWeekday(string line, int i) =>
        "월화수목금토일".IndexOf(line[i]) >= 0 && (i == 0 || !IsHangul(line[i - 1])) && (i + 1 >= line.Length || !IsHangul(line[i + 1]));

    private static MemoResult FromVisit(VisitNote visit, List<Mention> mentions, List<VisitNote> inWindow, DateTime today, int graceDays)
    {
        // 번호가 둘 이상이면 앞 번호(줄 차례 → 줄 안 자리). 'N차까지'는 다른 차수가 없을 때만
        var pick = mentions.FirstOrDefault(m => m.Mode != Mode.Until) ?? mentions[0];
        int number;
        if (pick.Mode == Mode.Today) number = pick.Number + 1;
        else if (pick.Mode == Mode.Plan) number = pick.Number;
        else
        {
            var last = LastMemoNumber(inWindow);
            if (last == null) return new MemoResult(MemoResultKind.NoRecord);
            number = last.Value + 1;
            if (number > pick.Number) return new MemoResult(MemoResultKind.Finished, untilNumber: pick.Number);
        }

        // 기록에 간격이 있는데 (그 날 − 여유)보다 일찍 온 내원이면 넣지 않는다. 간격은 차수 조각에서 먼저, 없으면 그 증상 줄 전체에서
        var gapSource = Gap.IsMatch(pick.Clause) ? pick.Clause : visit.SymptomLines[pick.Line];
        var gap = GapDays(gapSource);
        if (gap != null)
        {
            var planned = visit.Date.AddDays(gap.Value);
            if (today < planned.AddDays(-graceDays)) return new MemoResult(MemoResultKind.TooEarly, plannedDate: planned);
        }

        var (side, part) = PartOf(pick, visit.SymptomLines);
        var text = (side.Length > 0 ? side + ")" : "") + part + (part.Length > 0 ? " " : "") + number.ToString(CultureInfo.InvariantCulture) + "차";
        return new MemoResult(MemoResultKind.Insert, text);
    }

    private static int? GapDays(string text)
    {
        var m = Gap.Match(text ?? "");
        if (!m.Success) return null;
        var n = int.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture);
        switch (m.Groups[2].Value)
        {
            case "일": return n;
            case "개월":
            case "달": return n * 30;
            default: return n * 7;
        }
    }

    /// <summary>30일 안 내원 메모를 늦은 것부터 보아 첫 주사 차수 번호.</summary>
    private static int? LastMemoNumber(List<VisitNote> inWindow)
    {
        for (var i = inWindow.Count - 1; i >= 0; i--)
        {
            var number = MemoNumber(inWindow[i].ReceptionMemo);
            if (number != null) return number;
        }
        return null;
    }

    private static string SideOf(string word)
    {
        switch (word)
        {
            case "양측":
            case "양쪽":
            case "양":
            case "both":
            case "bil":
            case "Bil":
            case "BIL":
                return "양";
            case "오른쪽":
            case "오른":
            case "우측":
            case "우":
            case "오":
            case "Rt":
            case "RT":
            case "rt":
                return "오";
            default:
                return "왼";
        }
    }

    /// <summary>좌우·부위: 차수 앞말 → 없으면 같은 내원의 주사 말이 든 줄 → 그래도 없으면 모든 줄(여러 개면 쉼표로).</summary>
    private static (string Side, string Part) PartOf(Mention pick, IReadOnlyList<string> lines)
    {
        var weekdayContext = WeekdayContext.IsMatch(pick.Clause) || WeekdayList.IsMatch(pick.Clause);
        var pre = pick.Prefix;
        pre = WeekdayList.Replace(pre, " ");
        pre = TimeWords.Replace(pre, " ");
        pre = Filler.Replace(pre, " ");
        // 요일 한 글자: 월·화·수·금·토는 늘 지우고, 목(부위)·일은 요일 말이 함께 있을 때만
        pre = Weekday.Replace(pre, m => (m.Value != "목" && m.Value != "일") || weekdayContext ? " " : m.Value);
        pre = Spaces.Replace(pre, " ").Trim();

        var side = "";
        var sm = SideWord.Match(pre);
        if (sm.Success && sm.Index == 0)
        {
            side = SideOf(sm.Groups[1].Value);
            pre = pre.Substring(sm.Length).TrimStart('.', ' ').Trim();
        }
        if (pre.Length > 0)
        {
            var words = new List<string>();
            var drugs = new List<string>();
            foreach (var w0 in pre.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries))
            {
                if (NerveBlock.IsMatch(w0)) continue;   // 신경차단 이름(덧붙이·차단술)은 빼고 부위는 다른 줄에서
                if (PainWord.IsMatch(w0)) continue;
                if (DrugWord.IsMatch(w0))
                {
                    if (!drugs.Contains(w0)) drugs.Add(w0);
                    continue;
                }
                var w = w0;
                foreach (var pair in EnglishParts)
                {
                    if (pair.Key.IsMatch(w0))
                    {
                        w = pair.Value;
                        break;
                    }
                }
                if (!words.Contains(w)) words.Add(w);
            }
            if (words.Count + drugs.Count > 0)
            {
                // 부위끼리는 쉼표, 약 이름은 그 뒤에 띄어 씀. 약 이름만이면 약 이름만('양)아라간 2차')
                var text = string.Join(" ", new[] { string.Join(",", words), string.Join(" ", drugs) }.Where(t => t.Length > 0));
                return (words.Count > 0 && drugs.Count == 0 && words.All(Axial.Contains) ? "" : side, text);
            }
        }

        var injectionLines = lines.Where(line => InjectionWord.IsMatch(line ?? "")).ToList();
        var (lineSide, found) = PartsOfLines(injectionLines, side);
        if (found.Count == 0) (lineSide, found) = PartsOfLines(lines, side);
        if (found.All(Axial.Contains)) lineSide = "";
        return (lineSide, string.Join(",", found));
    }

    private static (string Side, List<string> Found) PartsOfLines(IEnumerable<string> lines, string side)
    {
        var found = new List<string>();
        var lineSide = side;
        foreach (var line in lines)
        {
            var parts = PartsIn(line ?? "");
            foreach (var part in parts)
            {
                if (!found.Contains(part)) found.Add(part);
            }
            if (lineSide.Length == 0 && parts.Count > 0)
            {
                var m = SideWord.Match(line ?? "");
                if (m.Success) lineSide = SideOf(m.Groups[1].Value);
            }
        }
        return (lineSide, found);
    }

    private static List<string> PartsIn(string line)
    {
        var result = new List<string>();
        foreach (var hit in PartHits(line))
        {
            if (!result.Contains(hit.Part)) result.Add(hit.Part);
        }
        return result;
    }

    // 한 글자 부위: 부위가 아닌 말의 첫 글자면 뺀다('발생'·'손상'·'목요일'·'등록', AC-7505.1). 붙여 쓴 '팔저림'·'목통증'은 부위
    private static readonly HashSet<string> OneLetterParts = new HashSet<string>(StringComparer.Ordinal) { "발", "손", "목", "등", "팔" };
    private static readonly string[] NotPartWords =
    {
        "발생", "발병", "발현", "발작", "발급", "발견", "발적", "발열", "발기", "발전", "손상", "손해", "손톱",
        "등산", "등록", "등급", "등등", "목욕", "목발", "목적", "목표", "목요일",
    };

    // 부위 말 바로 앞에 붙여 쓰는 좌우 말(긴 것 먼저): '양무릎'·'우측어깨'·'오른쪽무릎'
    private static readonly string[] SideHeads = { "오른쪽", "왼쪽", "양측", "양쪽", "우측", "좌측", "오른", "양", "왼", "우", "좌", "오" };

    /// <summary>
    /// 한 줄의 부위 말과 그 자리: 영어 부위(EnglishParts 차례, 처음 맞는 자리) 다음에 우리말 부위(나온 차례). 영어는 우리말로 바꿔 둔다.
    /// 주사 차수 부위(PartsIn)와 엑스레이 경과 부위(XrayParts·MemoCompose)가 같이 쓴다.
    /// 우리말 부위는 앞 글자가 한글이면 안 잡는데, loose(엑스레이 경과)면 앞이 좌우 말('양무릎')이거나 바로 앞 부위 말에 붙은 것('발뒤꿈치')도 잡는다.
    /// </summary>
    internal static List<(int Index, string Part)> PartHits(string line, bool loose = false)
    {
        var result = new List<(int Index, string Part)>();
        line = line ?? "";
        foreach (var pair in EnglishParts)
        {
            var m = pair.Key.Match(line);
            if (m.Success) result.Add((m.Index, pair.Value));
        }
        var i = 0;
        var lastPartEnd = -1;
        while (i < line.Length)
        {
            string? hit = null;
            var boundary = i == 0 || !IsHangul(line[i - 1]) || (loose && (i == lastPartEnd || AfterSide(line, i)));
            foreach (var part in PartsLongestFirst)
            {
                if (boundary && string.CompareOrdinal(line, i, part, 0, part.Length) == 0)
                {
                    hit = part;
                    break;
                }
            }
            if (hit != null)
            {
                // '목'이 요일로 쓰인 경우는 뺀다
                var weekday = hit == "목" && NeckAsWeekday.IsMatch(line);
                // 부위가 아닌 말('목발'·'등등')은 통째로 건너뛰고 뒤 글자를 붙은 부위로 보지 않는다
                var notPart = OneLetterParts.Contains(hit) ? NotPartWords.FirstOrDefault(word => string.CompareOrdinal(line, i, word, 0, word.Length) == 0) : null;
                if (notPart != null)
                {
                    i += notPart.Length;
                    lastPartEnd = -1;
                    continue;
                }
                if (!weekday) result.Add((i, hit));
                i += hit.Length;
                lastPartEnd = i;
            }
            else
            {
                i++;
            }
        }
        return result;
    }

    private static bool AfterSide(string line, int i)
    {
        foreach (var side in SideHeads)
        {
            var start = i - side.Length;
            if (start >= 0 && string.CompareOrdinal(line, start, side, 0, side.Length) == 0 && (start == 0 || !IsHangul(line[start - 1]))) return true;
        }
        return false;
    }

    private static bool IsHangul(char c) => c >= '가' && c <= '힣';
}
