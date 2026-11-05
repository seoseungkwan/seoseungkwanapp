using System;
using System.Collections.Generic;
using System.Security.Cryptography;

namespace Precheck.Core.Reception;

/// <summary>화면용 열쇠가 가리키는 그날 내원 하나(날짜 글 + 내원번호).</summary>
public sealed class VisitRef
{
    public VisitRef(string day, string visitId)
    {
        Day = day ?? throw new ArgumentNullException(nameof(day));
        VisitId = visitId ?? throw new ArgumentNullException(nameof(visitId));
    }

    public string Day { get; }
    public string VisitId { get; }
}

/// <summary>
/// 화면용 열쇠(design.md 4절, AC-1402.9·AC-1403.6). 휴대폰에는 내원번호 대신 이 열쇠만 간다.
/// 열쇠는 내원마다 그날 무작위 8바이트(RandomNumberGenerator)를 16자리 소문자 16진수로 쓴 것이라
/// 내원번호·차트번호를 드러내지 않는다. 같은 내원은 그날 같은 열쇠이고, 다른 날을 받으면 열쇠표를 비우고 새로 만든다.
/// 여러 작업(접수 현황 읽기·상세·엑스레이 요청)이 한꺼번에 불러도 안전하다.
/// </summary>
public sealed class VisitKeys
{
    private const int KeyBytes = 8;

    private readonly object _gate = new object();
    private readonly RandomNumberGenerator _random = RandomNumberGenerator.Create();
    private readonly Dictionary<string, string> _keyOfVisit = new Dictionary<string, string>(StringComparer.Ordinal);
    private readonly Dictionary<string, string> _visitOfKey = new Dictionary<string, string>(StringComparer.Ordinal);
    private string? _day;

    /// <summary>그날 그 내원의 열쇠. 처음이면 새로 만들고, 날이 바뀌었으면 앞 날 열쇠표를 버린 뒤 만든다.</summary>
    public string KeyOf(string day, string visitId)
    {
        if (string.IsNullOrEmpty(day)) throw new ArgumentException("날짜가 비었다", nameof(day));
        if (string.IsNullOrEmpty(visitId)) throw new ArgumentException("내원번호가 비었다", nameof(visitId));
        lock (_gate)
        {
            if (!string.Equals(_day, day, StringComparison.Ordinal))
            {
                _keyOfVisit.Clear();
                _visitOfKey.Clear();
                _day = day;
            }
            if (_keyOfVisit.TryGetValue(visitId, out var known)) return known;
            string key;
            do key = NewKey(); while (_visitOfKey.ContainsKey(key));
            _keyOfVisit.Add(visitId, key);
            _visitOfKey.Add(key, visitId);
            return key;
        }
    }

    /// <summary>그날 열쇠표에 있는 열쇠면 그 내원, 모양이 틀렸거나 없거나 다른 날이면 null(열쇠표는 바꾸지 않는다).</summary>
    public VisitRef? Find(string day, string? key)
    {
        if (string.IsNullOrEmpty(day) || !IsKeyShape(key)) return null;
        lock (_gate)
        {
            if (!string.Equals(_day, day, StringComparison.Ordinal)) return null;
            return _visitOfKey.TryGetValue(key!, out var visitId) ? new VisitRef(day, visitId) : null;
        }
    }

    private string NewKey()
    {
        var bytes = new byte[KeyBytes];
        _random.GetBytes(bytes);
        var chars = new char[KeyBytes * 2];
        for (var i = 0; i < KeyBytes; i++)
        {
            chars[2 * i] = Hex(bytes[i] >> 4);
            chars[2 * i + 1] = Hex(bytes[i] & 0xF);
        }
        return new string(chars);
    }

    private static char Hex(int nibble) => (char)(nibble < 10 ? '0' + nibble : 'a' + nibble - 10);

    private static bool IsKeyShape(string? key)
    {
        if (key == null || key.Length != KeyBytes * 2) return false;
        foreach (var c in key)
            if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'))) return false;
        return true;
    }
}
