using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Precheck.Core.Bit;
using Precheck.Core.Registration;
using Precheck.Core.Store;

namespace Precheck.Core.Reception;

/// <summary>
/// 엑스레이 '찍음 표시'(design.md 6절, REQ-1405). 비트에는 쓰지 않고 총괄 PC의 저장 폴더 파일 하나에만 둔다(AC-1405.4).
/// 파일 `reception-marks.dat` = 머리 `PRECHECK-STORE-1\n` + IProtector(윈도우 DPAPI CurrentUser)로 감싼
/// JSON `{ "day": "yyyyMMdd", "marks": { "<내원번호>": "HH:MM" } }`.
/// - 내원번호로 묶으므로 새 접수(다른 내원)에는 표시가 없고, 날이 다른 표시는 읽을 때 버린다(AC-1405.3).
/// - 쓰기는 잠금 하나로 한 번에 하나씩, 임시 파일 → 바꾸기로 한다. 나중에 잠금을 잡은 요청이 이기고 파일이 반쯤 쓰이지 않는다(AC-1405.6).
/// - 처음 쓸 때 한 번 파일을 읽어 메모리에 두고 그 뒤로는 메모리에서 답한다(이 PC에서 이 파일을 쓰는 것은 접수 현황 도우미 하나뿐이다).
/// - 깨진 파일(머리·풀기·모양이 틀림, 너무 큼)은 빈 표시로 시작하고 기록에 E-STORE-BROKEN을 한 번 남긴다. 다음 누름이 새 파일로 덮는다.
/// 기록(report)에는 오류 번호만 간다. 예외 메시지에도 번호만 들어간다.
/// </summary>
public sealed class XrayMarks
{
    public const string FileName = "reception-marks.dat";

    /// <summary>하루 표시는 많아야 수백 줄(수십 KB)이다. 이보다 크면 읽어 들이지 않고 깨진 파일로 본다.</summary>
    private const int MaxFileBytes = 1024 * 1024;

    private const string DayField = "day";
    private const string MarksField = "marks";

    private static readonly byte[] HeaderBytes = Encoding.ASCII.GetBytes(RegistrationFile.Header);
    private static readonly UTF8Encoding StrictUtf8 = new UTF8Encoding(false, true);
    private static readonly JsonDocumentOptions ReadOptions = new JsonDocumentOptions { MaxDepth = 4 };
    private static readonly IReadOnlyDictionary<string, string> None =
        new ReadOnlyDictionary<string, string>(new Dictionary<string, string>(StringComparer.Ordinal));

    private readonly IStoreFolder folder;
    private readonly IProtector protector;
    private readonly Func<DateTime> now;
    private readonly Action<string>? report;
    private readonly object gate = new object();

    private bool loaded;
    private string? day;
    private Dictionary<string, string> marks = new Dictionary<string, string>(StringComparer.Ordinal);

    /// <param name="folder">도우미 저장 폴더(`data\`).</param>
    /// <param name="protector">이 PC 윈도우 계정 암호화.</param>
    /// <param name="now">지금 시각(이 PC의 시계). 날짜 `yyyyMMdd`와 시:분을 여기서 잡는다.</param>
    /// <param name="report">기록에 남길 오류 번호를 받는다('E-…'만).</param>
    public XrayMarks(IStoreFolder folder, IProtector protector, Func<DateTime> now, Action<string>? report = null)
    {
        this.folder = folder ?? throw new ArgumentNullException(nameof(folder));
        this.protector = protector ?? throw new ArgumentNullException(nameof(protector));
        this.now = now ?? throw new ArgumentNullException(nameof(now));
        this.report = report;
    }

    private string FilePath => Path.Combine(folder.Path, FileName);

    /// <summary>
    /// 오늘 표시(내원번호 → "HH:MM")의 사본. 지난 날 표시는 비운다. 파일을 읽지 못하면(잠김·권한) 기록에 E-STORE-FAILED를 남기고
    /// 이번에는 빈 표시로 답한 뒤 다음 읽기에서 다시 읽는다. 던지지 않는다(접수 현황은 표시 없이도 그린다).
    /// </summary>
    public IReadOnlyDictionary<string, string> Today()
    {
        lock (gate)
        {
            if (!TryLoad())
            {
                report?.Invoke(BitErrors.StoreFailed);
                return None;
            }
            if (!string.Equals(day, DayOf(now()), StringComparison.Ordinal) || marks.Count == 0) return None;
            return new ReadOnlyDictionary<string, string>(new Dictionary<string, string>(marks, StringComparer.Ordinal));
        }
    }

    /// <summary>
    /// on이면 그 내원에 지금 시:분을 남기고(이미 있으면 나중 시각), 아니면 지운다. 날이 바뀌었으면 지난 날 표시를 버린 새 날 파일을 쓴다.
    /// 바뀔 것이 없으면(없는 표시 취소) 쓰지 않는다. 읽거나 쓰지 못하면 BitException(E-STORE-FAILED)이고 표시는 그대로다.
    /// </summary>
    public void Set(string visitId, bool on)
    {
        if (string.IsNullOrEmpty(visitId)) throw new ArgumentException("내원번호가 비었다", nameof(visitId));
        lock (gate)
        {
            if (!TryLoad()) throw new BitException(BitErrors.StoreFailed);
            var at = now();
            var today = DayOf(at);
            var next = string.Equals(day, today, StringComparison.Ordinal)
                ? new Dictionary<string, string>(marks, StringComparer.Ordinal)
                : new Dictionary<string, string>(StringComparer.Ordinal);
            if (on) next[visitId] = TimeOf(at);
            else if (!next.Remove(visitId)) return;

            Write(today, next);
            day = today;
            marks = next;
        }
    }

    private static string DayOf(DateTime at) => at.ToString("yyyyMMdd", CultureInfo.InvariantCulture);

    private static string TimeOf(DateTime at) => at.ToString("HH':'mm", CultureInfo.InvariantCulture);

    /// <summary>아직이면 파일을 한 번 읽는다. 없으면 빈 표시, 깨졌으면 빈 표시 + 기록 E-STORE-BROKEN. 읽지 못하면 false(다음에 다시).</summary>
    private bool TryLoad()
    {
        if (loaded) return true;
        try
        {
            var stored = File.Exists(FilePath) ? ReadFile() : new Stored(null, new Dictionary<string, string>(StringComparer.Ordinal));
            if (stored == null)
            {
                report?.Invoke(BitErrors.StoreBroken);
                stored = new Stored(null, new Dictionary<string, string>(StringComparer.Ordinal));
            }
            day = stored.Day;
            marks = stored.Marks;
            loaded = true;
            return true;
        }
        catch (IOException)
        {
            return false;
        }
        catch (UnauthorizedAccessException)
        {
            return false;
        }
    }

    /// <summary>파일 하나를 크기·머리·풀기·JSON·칸 검사로 읽는다. 깨졌으면 null. 읽지 못하면 IOException 그대로(깨진 것이 아니다).</summary>
    private Stored? ReadFile()
    {
        if (new FileInfo(FilePath).Length > MaxFileBytes) return null;
        var data = File.ReadAllBytes(FilePath);
        if (data.Length <= HeaderBytes.Length || !data.Take(HeaderBytes.Length).SequenceEqual(HeaderBytes)) return null;

        var cipher = new byte[data.Length - HeaderBytes.Length];
        Buffer.BlockCopy(data, HeaderBytes.Length, cipher, 0, cipher.Length);
        byte[] clear;
        try
        {
            clear = protector.Unprotect(cipher);
        }
        catch (CryptographicException)
        {
            return null;
        }
        try
        {
            return Parse(clear);
        }
        finally
        {
            Array.Clear(clear, 0, clear.Length);
        }
    }

    private static Stored? Parse(byte[] clear)
    {
        try
        {
            StrictUtf8.GetCharCount(clear);
            using var document = JsonDocument.Parse(clear, ReadOptions);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return null;
            var names = root.EnumerateObject().Select(property => property.Name).ToList();
            if (names.Count != 2 || !names.Contains(DayField, StringComparer.Ordinal) || !names.Contains(MarksField, StringComparer.Ordinal)) return null;

            var dayValue = root.GetProperty(DayField);
            if (dayValue.ValueKind != JsonValueKind.String || !IsDay(dayValue.GetString())) return null;
            var marksValue = root.GetProperty(MarksField);
            if (marksValue.ValueKind != JsonValueKind.Object) return null;

            var read = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var mark in marksValue.EnumerateObject())
            {
                if (mark.Name.Length == 0 || mark.Value.ValueKind != JsonValueKind.String || !IsTime(mark.Value.GetString())) return null;
                read[mark.Name] = mark.Value.GetString()!;
            }
            return new Stored(dayValue.GetString(), read);
        }
        catch (JsonException)
        {
            return null;
        }
        catch (InvalidOperationException)
        {
            // 짝 없는 대리쌍 이스케이프 등 글자로 풀 수 없는 칸 이름
            return null;
        }
        catch (ArgumentException)
        {
            // 잘못된 UTF-8(DecoderFallbackException은 ArgumentException)
            return null;
        }
    }

    private static bool IsDay(string? text) =>
        text != null && text.Length == 8 && text.All(c => c >= '0' && c <= '9');

    private static bool IsTime(string? text) =>
        text != null && text.Length == 5 && text[2] == ':'
        && DateTime.TryParseExact(text, "HH':'mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out _);

    /// <summary>임시 파일에 다 쓰고 디스크까지 내린 뒤 바꾼다. 실패하면 전 파일은 그대로이고 임시 파일은 지운다.</summary>
    private void Write(string today, Dictionary<string, string> next)
    {
        try
        {
            var data = Seal(today, next);
            Directory.CreateDirectory(folder.Path);
            var temporary = FilePath + "." + Guid.NewGuid().ToString("N") + ".tmp";
            try
            {
                using (var output = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                {
                    output.Write(data, 0, data.Length);
                    output.Flush(true);
                }
                if (File.Exists(FilePath)) ReplaceFile(temporary);
                else File.Move(temporary, FilePath);
            }
            finally
            {
                if (File.Exists(temporary)) File.Delete(temporary);
            }
        }
        catch (IOException)
        {
            throw new BitException(BitErrors.StoreFailed);
        }
        catch (UnauthorizedAccessException)
        {
            throw new BitException(BitErrors.StoreFailed);
        }
        catch (CryptographicException)
        {
            throw new BitException(BitErrors.StoreFailed);
        }
    }

    /// <summary>
    /// File.Replace. 윈도우 ReplaceFile이 전 파일을 옮긴 뒤 멈추면 파일이 없어질 수 있어 그때는 임시 파일을 그 자리로 옮긴다(WorkStore와 같다).
    /// </summary>
    private void ReplaceFile(string temporary)
    {
        try
        {
            File.Replace(temporary, FilePath, null);
        }
        catch (IOException) when (!File.Exists(FilePath) && File.Exists(temporary))
        {
            File.Move(temporary, FilePath);
        }
    }

    /// <summary>머리 + 암호화한 { day, marks }. 내원번호 차례로 쓴다. 평문은 암호화한 뒤 지운다.</summary>
    private byte[] Seal(string today, Dictionary<string, string> next)
    {
        byte[] clear;
        using (var buffer = new MemoryStream())
        {
            using (var writer = new Utf8JsonWriter(buffer))
            {
                writer.WriteStartObject();
                writer.WriteString(DayField, today);
                writer.WriteStartObject(MarksField);
                foreach (var mark in next.OrderBy(pair => pair.Key, StringComparer.Ordinal)) writer.WriteString(mark.Key, mark.Value);
                writer.WriteEndObject();
                writer.WriteEndObject();
            }
            clear = buffer.ToArray();
        }
        byte[] cipher;
        try
        {
            cipher = protector.Protect(clear);
        }
        finally
        {
            Array.Clear(clear, 0, clear.Length);
        }
        var output = new byte[HeaderBytes.Length + cipher.Length];
        Buffer.BlockCopy(HeaderBytes, 0, output, 0, HeaderBytes.Length);
        Buffer.BlockCopy(cipher, 0, output, HeaderBytes.Length, cipher.Length);
        return output;
    }

    private sealed class Stored
    {
        public Stored(string? day, Dictionary<string, string> marks)
        {
            Day = day;
            Marks = marks;
        }

        public string? Day { get; }

        public Dictionary<string, string> Marks { get; }
    }
}
