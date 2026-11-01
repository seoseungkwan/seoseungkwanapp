using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using Precheck.Core.Registration;

namespace Precheck.Core.Input;

/// <summary>
/// PC 확인 창 글(AC-017.2, 목업 화면 5). 묶음의 날짜·수와 등록한 기관기호(뒤 4자리 가림)로만 도우미가 만든다.
/// 웹이 보낸 글·이름·차트번호·메모를 넣지 않는다. 병원 이름은 도우미가 갖지 않는다(AC-005.9).
/// 주의 글은 원본 runAutoRange 확인 글에서 옮겼다: 내원내역을 묶음 기간으로 띄워 두기, 미저장 작업 먼저 마치기, 진료일이 맞을 때만 입력.
/// </summary>
public static class InputPrompt
{
    private const string NewLine = "\r\n";

    public static string Build(IReadOnlyList<InputItem> items, HospitalRegistration registration, int excluded = 0)
    {
        if (items == null) throw new ArgumentNullException(nameof(items));
        if (registration == null) throw new ArgumentNullException(nameof(registration));

        var period = Period(items);
        var text = new StringBuilder();
        text.Append("비트에 청구메모를 입력할까요?").Append(NewLine).Append(NewLine);
        text.Append(period).Append(", ").Append(items.Count).Append("명 입력할까요?").Append(NewLine);
        text.Append("기관기호 ").Append(RegisterPrompt.MaskInstitution(registration.InstitutionCode)).Append(NewLine);
        if (excluded > 0) text.Append("빼는 환자 ").Append(excluded).Append("명").Append(NewLine);
        text.Append(NewLine);
        text.Append("주의").Append(NewLine);
        text.Append("· 비트 내원내역 창을 ").Append(period).Append(" 기간이 모두 들어가게 띄워 두고, 처방코드·상병 검색칸은 비워 두세요.").Append(NewLine);
        text.Append("· 먼저 비트의 저장 안 한 작업을 마치세요. 내원내역 목록이 다른 창에 가려지면 멈춥니다.").Append(NewLine);
        text.Append("· 환자마다 열린 내원의 진료일이 맞을 때만 입력합니다. 비트에 다른 메모가 있으면 건너뜁니다.").Append(NewLine);
        text.Append("· 입력하는 동안 마우스와 키보드를 쓰지 마세요.");
        return text.ToString();
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
