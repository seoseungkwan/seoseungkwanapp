using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using Precheck.Core.Registration;

namespace Precheck.Core.Input;

/// <summary>
/// PC 확인 창 글(AC-017.2, 목업 화면 5). 묶음의 날짜·수와 등록한 기관기호(뒤 4자리 가림)로만 도우미가 만든다.
/// 웹이 보낸 글·이름·차트번호·메모를 넣지 않는다(고른 처방코드만 모양 검사를 지나 들어간다, AC-036.1·AC-036.3). 병원 이름은 도우미가 갖지 않는다(AC-005.9).
/// 주의 글은 원본 runAutoRange 확인 글에서 옮겼다: 내원내역을 묶음 기간으로 띄워 두기, 미저장 작업 먼저 마치기, 진료일이 맞을 때만 입력.
/// 확인할 수 없는 기록의 글(AC-035.9)은 맨 위에 더한다: 파일이 몇 개든, 직접 확인과 함께여도 창은 하나다. 아는 환자가 없어 이름·번호·파일 이름을 넣지 않는다.
/// </summary>
public static class InputPrompt
{
    private const string NewLine = "\r\n";

    /// <summary>체크 글(AC-037.8, 승인 목업). '기록에 남깁니다'는 그 PC의 달 파일(originals)에 저장한다는 뜻이고 보여 주는 화면을 약속하지 않는다.</summary>
    public const string NoAskLabel = "이제부터 묻지 않기 (비트에 다른 메모가 있어도 묻지 않고 우리 메모로 바꿉니다. 원래 메모는 기록에 남깁니다. 확인 표시가 남은 메모는 입력하지 않습니다. 청구 창을 닫으면 꺼집니다)";

    private const string OtherMemoNote = "비트에 다른 메모가 있으면 우리 메모로 바꿉니다. 원래 메모는 기록에 남깁니다. 다만 불러온 뒤 달라진 메모, 우리 메모에 확인 표시가 남은 환자, [직접 확인했어요]를 누른 환자는 건너뜁니다.";
    private const string NoAskOnNote = "묻지 않기가 켜져 있어 비트의 다른 메모를 바꿉니다. 다만 직접 확인한 환자는 바꾸지 않고 건너뜁니다";

    private const string RecordsNotice = "입력 기록의 일부를 확인할 수 없습니다. 먼저 비트에 열려 있는 환자의 메모 칸을 확인해 주세요. 저장하지 않은 글이 있으면 마무리한 뒤 [확인]을 눌러 주세요.";

    /// <param name="items">창 뒤에 열 사람. 비었으면 풀 사람만 있는 묶음이라 입력을 묻는 글과 주의 줄 대신 풀지 묻는다(AC-035.5).</param>
    /// <param name="excluded">'빼는 환자 N명'. 풀 사람은 세지 않는다.</param>
    /// <param name="released">풀 사람 수. '직접 확인한 환자 N명'에 함께 센다(AC-035.5).</param>
    /// <param name="recordsNotice">아직 확인하지 않은 '확인할 수 없는 기록'이 있다(AC-035.9).</param>
    /// <param name="code">고른 처방코드(AC-036.3). BatchCheck.ValidateCode를 지난 값이고, 환자 글자가 아니라 이것만 웹에서 온 값으로 창에 닿는다. 없으면 글이 그대로다.</param>
    /// <param name="noAskOn">묻지 않기가 이미 켜진 채 뜨는 창이다(AC-037.8): 주의 줄이 다르다.</param>
    public static string Build(IReadOnlyList<InputItem> items, HospitalRegistration registration, int excluded = 0, int released = 0, bool recordsNotice = false, string? code = null, bool noAskOn = false)
    {
        if (items == null) throw new ArgumentNullException(nameof(items));
        if (registration == null) throw new ArgumentNullException(nameof(registration));

        var text = new StringBuilder();
        if (recordsNotice) text.Append(RecordsNotice).Append(NewLine).Append(NewLine);
        if (items.Count == 0)
        {
            text.Append("직접 확인한 환자 ").Append(released).Append("명의 입력 멈춤을 풀까요? 메모는 넣지 않고 건너뜁니다").Append(NewLine);
            text.Append("기관기호 ").Append(RegisterPrompt.MaskInstitution(registration.InstitutionCode));
            if (code != null) text.Append(NewLine).Append("처방코드 ").Append(code);
            if (excluded > 0) text.Append(NewLine).Append("빼는 환자 ").Append(excluded).Append("명");
            return text.ToString();
        }

        var period = Period(items);
        text.Append("비트에 청구메모를 입력할까요?").Append(NewLine).Append(NewLine);
        text.Append(period).Append(", ").Append(items.Count).Append("명 입력할까요?").Append(NewLine);
        text.Append("기관기호 ").Append(RegisterPrompt.MaskInstitution(registration.InstitutionCode)).Append(NewLine);
        if (code != null) text.Append("처방코드 ").Append(code).Append(NewLine);
        if (excluded > 0) text.Append("빼는 환자 ").Append(excluded).Append("명").Append(NewLine);
        // 수만 센다(AC-037.3). 직접 확인으로 온 사람은 replaces가 함께 와도 바꾸지 않으므로 세지 않는다(AC-035.5)
        var replacing = items.Count(item => item.Replaces != null && !item.CheckedByHand);
        if (replacing > 0) text.Append("다른 메모를 바꾸는 환자 ").Append(replacing).Append("명").Append(NewLine);
        var byHand = items.Count(item => item.CheckedByHand) + released;
        if (byHand > 0) text.Append("직접 확인한 환자 ").Append(byHand).Append("명").Append(NewLine);
        if (released > 0) text.Append("이 가운데 ").Append(released).Append("명은 메모를 넣지 않고 입력 멈춤만 풉니다").Append(NewLine);
        text.Append(NewLine);
        text.Append("주의").Append(NewLine);
        text.Append("· 비트 내원내역 창을 ").Append(period).Append(" 기간이 모두 들어가게 띄워 두고, ");
        if (code == null) text.Append("처방코드·상병 검색칸은 비워 두세요.");
        else text.Append("처방코드 칸은 비우거나 ").Append(code).Append("로 맞추고, 상병 검색칸은 비워 두세요.");
        text.Append(NewLine);
        text.Append("· 먼저 비트의 저장 안 한 작업을 마치세요. 내원내역 목록이 다른 창에 가려지면 멈춥니다.").Append(NewLine);
        text.Append("· 환자마다 열린 내원의 진료일이 맞을 때만 입력합니다.").Append(NewLine);
        text.Append("· ").Append(noAskOn ? NoAskOnNote : OtherMemoNote).Append(NewLine);
        text.Append("· 입력하는 동안 마우스와 키보드를 쓰지 마세요.");
        return text.ToString();
    }

    /// <summary>창 맨 위 글(AC-035.9)을 나머지 글과 나눈다. 그 글이 없으면 null이고 rest는 글 그대로다. 창이 이 글만 노란 바탕으로 그린다(승인 목업).</summary>
    public static string? SplitNotice(string text, out string rest)
    {
        if (text == null) throw new ArgumentNullException(nameof(text));
        var top = RecordsNotice + NewLine + NewLine;
        if (!text.StartsWith(top, StringComparison.Ordinal))
        {
            rest = text;
            return null;
        }
        rest = text.Substring(top.Length);
        return RecordsNotice;
    }

    private static string Period(IReadOnlyList<InputItem> items)
    {
        var dates = items.Select(item => item.Date).OrderBy(date => date, StringComparer.Ordinal).ToArray();
        var first = dates.First();
        var last = dates.Last();
        if (string.Equals(first, last, StringComparison.Ordinal)) return Short(first);
        return string.Equals(first.Substring(0, 4), last.Substring(0, 4), StringComparison.Ordinal)
            ? Short(first) + "~" + Short(last)
            : first.Replace('-', '/') + "~" + last.Replace('-', '/');
    }

    private static string Short(string date) => date.Substring(5).Replace('-', '/');
}
