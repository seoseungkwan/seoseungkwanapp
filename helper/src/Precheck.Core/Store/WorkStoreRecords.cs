using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text.Json;
using Precheck.Core.Protocol;
using Precheck.Core.Registration;

namespace Precheck.Core.Store;

/// <summary>
/// bit.input 앞의 달 파일 검사와 확인 표시(AC-035.4·AC-035.9). 검사는 고치지 않는다: 달마다 본 파일을, 본 파일이 없으면 .bak을 보고, work-*.broken-*를 모두 본다.
/// 본 파일을 읽을 수 없으면 맞는 .bak이 있어도 확인할 수 없는 기록이고 되살리지 않는다(.bak은 쓰다 멈춘 기록보다 오래됐을 수 있다).
/// 예외는 본 파일 없이 맞는 .bak만 있는 달이다: 바꿔치기 중 멈춘 것이라 되살려 그 기록을 본다.
/// 다른 프로필 ID 파일은 Inspect로 profileId만 본다(AC-015.4). work-*.broken-*는 풀지 않고 바이트의 해시만 본다.
/// input-acks.dat는 달 파일 읽기(ReadStored)를 쓰지 않는다: 그 읽기는 profileId가 없는 파일을 깨진 것으로 보아 저장이 계속 실패한다. 환자 자료 없이 해시만 둔다.
/// </summary>
public sealed partial class WorkStore
{
    public const string AcksFile = "input-acks.dat";

    private const string AckHashesField = "hashes";

    /// <summary>읽을 수 있는 이 병원 달 파일의 입력 기록 칸. 칸이 없으면 null.</summary>
    internal sealed class MonthRecord
    {
        public MonthRecord(string month, JsonElement? journal, JsonElement? dates)
        {
            Month = month;
            Journal = journal;
            Dates = dates;
        }

        public string Month { get; }
        public JsonElement? Journal { get; }
        public JsonElement? Dates { get; }
    }

    /// <summary>검사 결과: 볼 수 있는 달과, 지금 폴더에 있는 확인할 수 없는 파일들의 SHA-256(소문자 16진수, 겹치지 않음).</summary>
    internal sealed class StoredRecords
    {
        public StoredRecords(IReadOnlyList<MonthRecord> months, IReadOnlyList<string> unreadable)
        {
            Months = months;
            Unreadable = unreadable;
        }

        public IReadOnlyList<MonthRecord> Months { get; }
        public IReadOnlyList<string> Unreadable { get; }
    }

    /// <summary>달 파일 전부를 본다. 폴더나 파일을 읽지 못하면(잠김 등) E-STORE-FAILED. 폴더가 없으면 빈 결과이고 만들지 않는다.</summary>
    internal StoredRecords ScanRecords() => Guarded(() =>
    {
        var months = new List<MonthRecord>();
        var unreadable = new List<string>();
        if (!Directory.Exists(folder.Path)) return new StoredRecords(months, unreadable);

        var names = Directory.GetFiles(folder.Path, "work-*").Select(file => Path.GetFileName(file)).ToList();
        var stored = names
            .Select(name => MonthFileShape.Match(name))
            .Where(match => match.Success)
            .Select(match => match.Groups[1].Value + "-" + match.Groups[2].Value)
            .Distinct(StringComparer.Ordinal)
            .OrderBy(month => month, StringComparer.Ordinal);
        foreach (var month in stored)
        {
            var main = MonthPath(month);
            var source = File.Exists(main) ? main : main + BackupSuffix;
            if (Inspect(source, out var root) != FileState.Good)
            {
                unreadable.Add(HashOf(source));
                continue;
            }
            if (!string.Equals(source, main, StringComparison.Ordinal)) RestoreFromBackup(main, source);
            months.Add(new MonthRecord(month, Field(root, JournalField), Field(root, JournalDatesField)));
        }
        foreach (var name in names.Where(name => name.IndexOf(RegistrationStore.BrokenMark, StringComparison.Ordinal) >= 0))
        {
            unreadable.Add(HashOf(FilePath(name)));
        }
        return new StoredRecords(months, unreadable.Distinct(StringComparer.Ordinal).ToList());
    });

    /// <summary>확인한 해시들. 파일이 없거나 못 읽거나 깨졌으면 확인한 것이 없는 것으로 친다(다시 묻는다).</summary>
    internal HashSet<string> ReadAcks()
    {
        var acks = new HashSet<string>(StringComparer.Ordinal);
        try
        {
            var path = FilePath(AcksFile);
            if (!File.Exists(path)) return acks;
            var data = File.ReadAllBytes(path);
            if (data.Length <= HeaderBytes.Length || !data.Take(HeaderBytes.Length).SequenceEqual(HeaderBytes)) return acks;

            var cipher = new byte[data.Length - HeaderBytes.Length];
            Buffer.BlockCopy(data, HeaderBytes.Length, cipher, 0, cipher.Length);
            using var document = JsonDocument.Parse(protector.Unprotect(cipher), Envelope.DocumentOptions);
            foreach (var hash in document.RootElement.GetProperty(AckHashesField).EnumerateArray())
            {
                acks.Add(hash.GetString() ?? throw new JsonException());
            }
            return acks;
        }
        catch (Exception e) when (e is not OutOfMemoryException)
        {
            return new HashSet<string>(StringComparer.Ordinal);
        }
    }

    /// <summary>input-acks.dat를 이 해시들로 새로 쓴다(그 전 내용을 읽지 않으므로 못 읽던 파일도 덮이고, .bak을 두지 않는다). 못 쓰면 E-STORE-FAILED.</summary>
    internal void SaveAcks(IReadOnlyList<string> hashes)
    {
        if (hashes == null) throw new ArgumentNullException(nameof(hashes));
        Guarded(() =>
        {
            var cipher = Encrypt(Serialize(writer =>
            {
                writer.WriteStartObject();
                writer.WriteStartArray(AckHashesField);
                foreach (var hash in hashes) writer.WriteStringValue(hash);
                writer.WriteEndArray();
                writer.WriteEndObject();
            }));

            Directory.CreateDirectory(folder.Path);
            var path = FilePath(AcksFile);
            var temporary = TemporaryPath(path);
            try
            {
                WriteTemporary(temporary, cipher);
                if (File.Exists(path)) ReplaceFile(temporary, path, null);
                else File.Move(temporary, path);
            }
            finally
            {
                if (File.Exists(temporary)) File.Delete(temporary);
            }
        });
    }

    private static string HashOf(string path)
    {
        using var sha = SHA256.Create();
        return BitConverter.ToString(sha.ComputeHash(File.ReadAllBytes(path))).Replace("-", "").ToLowerInvariant();
    }
}
