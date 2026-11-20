using System;
using System.Collections.Generic;
using System.Linq;

namespace Precheck.Core.InjectionMemo;

/// <summary>
/// 그 환자의 지난 내원 하나: 날짜, 증상 줄(EmrInf EmrShtTyp='S', EmrShtSeq 차례), 그때 접수 메모(OcmRefCmt).
/// null 줄·메모는 빈 글로 둔다. 환자 값이라 파일·로그에 남기지 않는다(ToString에도 글이 없다).
/// </summary>
public sealed class VisitNote
{
    public VisitNote(DateTime date, IReadOnlyList<string?>? symptomLines, string? receptionMemo)
    {
        Date = date.Date;
        SymptomLines = (symptomLines ?? Array.Empty<string?>()).Select(line => line ?? "").ToArray();
        ReceptionMemo = receptionMemo ?? "";
    }

    public DateTime Date { get; }

    public IReadOnlyList<string> SymptomLines { get; }

    public string ReceptionMemo { get; }

    /// <summary>줄 수만(증상 글·메모는 환자 값이라 빼고).</summary>
    public override string ToString() => "VisitNote(" + SymptomLines.Count + " lines)";
}
