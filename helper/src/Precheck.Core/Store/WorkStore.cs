using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Precheck.Core.Bit;
using Precheck.Core.Protocol;
using Precheck.Core.Registration;

namespace Precheck.Core.Store;

/// <summary>
/// 도우미 작업 저장(REQ-015, design.md 9-3). 파일은 머리 PRECHECK-STORE-1\n + IProtector로 암호화한 JSON이고,
/// JSON 뿌리는 {profileId, 칸…}이다. work-YYYY-MM.dat {drafts, done, journal, journalDates?, originals?, sunap?} · contact.dat {contact} · settings.dat {settings}.
/// sunap(수납일지 고친 칸·마감 표시, spec sunap-ilji AC-4902.5)은 웹이 그 달 전체를 보내 칸째 바꾸고, store.load로 나간다(없으면 {}).
/// journalDates(진료 → 내원일)는 입력 기록과 함께 도우미만 쓰고 store.load로 나가지 않는다: 달 파일 이름에는 달뿐이라 쓰다 멈춘 진료의 날짜(AC-035.4)를 여기서 안다.
/// originals(진료 → 바꾸기 전에 칸에 있던 글 목록, AC-037.1)도 도우미만 쓰고 store.load로 나가지 않는다. store.save가 지우지 못하게 그대로 옮겨 쓴다.
/// bit.input 앞의 검사와 input-acks.dat는 WorkStoreRecords.cs에 있다(AC-035.9).
/// 쓰기: 합친 내용을 암호화한 뒤에야 임시 파일에 쓰고 바꿔치기해 전 파일을 .bak 하나로 남긴다. 평문은 디스크에 닿지 않는다(AC-015.6).
/// 깨짐(AC-015.3): 맞는 .bak이 있으면 그것으로 되살리고, 없으면 E-STORE-BROKEN. 깨진 파일은 지우지 않고 *.broken-시각으로 이름을 바꾼다.
/// 본 파일 없이 .bak만 있어도(바꿔치기 중 멈춤) 같은 규칙이다. 둘 다 없을 때만 빈 내용이다(AC-015.2).
/// 다른 병원(AC-015.4): 프로필 ID가 등록과 다르면 E-BIT-HOSPITAL-MISMATCH이고 어떤 파일도 건드리지 않는다.
/// 오류는 번호만 싣는다(AC-001.6). 여러 프로세스 사이의 순서는 부르는 쪽이 맞춘다(TASK-17 WorkLock, AC-017.10).
/// </summary>
public sealed partial class WorkStore
{
    public const string ContactFile = "contact.dat";
    public const string SettingsFile = "settings.dat";

    /// <summary>이 달 수까지는 남긴다. 오늘이 속한 달과의 차이가 이보다 크면 지운다(AC-015.5).</summary>
    public const int KeepMonths = 13;

    private const string BackupSuffix = ".bak";
    private const string ProfileField = "profileId";
    private const string DraftsField = "drafts";
    private const string DoneField = "done";
    private const string JournalField = "journal";
    private const string JournalDatesField = "journalDates";
    private const string OriginalsField = "originals";
    private const string ContactField = "contact";
    private const string SettingsField = "settings";
    private const string SunapField = "sunap";

    private static readonly string[] ObjectFields = { DraftsField, DoneField, JournalField, JournalDatesField, OriginalsField, ContactField, SettingsField, SunapField };
    private static readonly byte[] HeaderBytes = Encoding.ASCII.GetBytes(RegistrationFile.Header);
    private static readonly UTF8Encoding StrictUtf8 = new UTF8Encoding(false, true);
    private static readonly Regex MonthShape = new Regex(@"^[0-9]{4}-(?:0[1-9]|1[0-2])\z", RegexOptions.CultureInvariant);
    private static readonly Regex MonthFileShape = new Regex(@"^work-([0-9]{4})-(0[1-9]|1[0-2])\.dat(?:\.bak)?\z", RegexOptions.CultureInvariant);

    private readonly IStoreFolder folder;
    private readonly IProtector protector;
    private readonly HospitalRegistration current;
    private readonly Func<DateTime> today;

    public WorkStore(IStoreFolder folder, IProtector protector, HospitalRegistration current, Func<DateTime> today)
    {
        this.folder = folder ?? throw new ArgumentNullException(nameof(folder));
        this.protector = protector ?? throw new ArgumentNullException(nameof(protector));
        this.current = current ?? throw new ArgumentNullException(nameof(current));
        this.today = today ?? throw new ArgumentNullException(nameof(today));
    }

    /// <summary>잠금 없는 읽기(LoadWithoutRepair)가 파일을 고쳐야 하는 자리에 닿았다.</summary>
    private sealed class RepairNeededException : Exception
    {
    }

    private enum FileState
    {
        Good,
        Broken,
        OtherHospital,
    }

    /// <summary>등록을 읽어 이 병원의 저장소를 연다. 등록이 없으면 E-BIT-NOT-REGISTERED, 등록 파일이 깨졌으면 E-STORE-BROKEN.</summary>
    public static WorkStore ForRegistered(IStoreFolder folder, IProtector protector, RegistrationStore registrations, Func<DateTime> today)
    {
        if (registrations == null) throw new ArgumentNullException(nameof(registrations));
        var registration = registrations.Load() ?? throw new BitException(BitErrors.NotRegistered);
        return new WorkStore(folder, protector, registration, today);
    }

    /// <summary>
    /// 달 파일 저장. null인 칸은 보내지 않은 것이라 저장해 둔 값을 그대로 둔다(파일 전체를 덮어쓰지 않는다).
    /// drafts·done은 보낸 값으로 칸 전체를 바꾼다. journal·journalDates는 도우미가 가진 기록이라 진료(visitKey)마다 합친다: 보낸 진료만 바꾸고 다른 기록은 남는다.
    /// originals도 진료마다 합치고(보낸 진료는 목록째 바꾼다), 값이 없으면 칸을 쓰지 않는다. 웹이 보낸 값은 여기로 오지 않는다(StoreCommands·명령 표).
    /// journalDates는 값이 없으면 칸을 쓰지 않는다. sunap은 drafts처럼 보낸 값으로 칸 전체를 바꾸고, 보낸 적도 저장된 적도 없으면 칸을 쓰지 않는다.
    /// </summary>
    public void SaveMonth(string month, JsonElement? drafts, JsonElement? done, JsonElement? journal, JsonElement? journalDates = null, JsonElement? originals = null, JsonElement? sunap = null)
    {
        var path = MonthPath(month);
        RequireObject(drafts);
        RequireObject(done);
        RequireObject(journal);
        RequireObject(journalDates);
        RequireObject(originals);
        RequireObject(sunap);
        Guarded(() =>
        {
            var stored = ReadStored(path);
            Write(path, writer =>
            {
                WriteField(writer, DraftsField, drafts ?? Field(stored, DraftsField));
                WriteField(writer, DoneField, done ?? Field(stored, DoneField));
                writer.WriteStartObject(JournalField);
                WriteJournalEntries(writer, Field(stored, JournalField), journal);
                writer.WriteEndObject();
                var dates = Field(stored, JournalDatesField);
                if (dates.HasValue || journalDates.HasValue)
                {
                    writer.WriteStartObject(JournalDatesField);
                    WriteJournalEntries(writer, dates, journalDates);
                    writer.WriteEndObject();
                }
                var kept = Field(stored, OriginalsField);
                if (kept.HasValue || originals.HasValue)
                {
                    writer.WriteStartObject(OriginalsField);
                    WriteJournalEntries(writer, kept, originals);
                    writer.WriteEndObject();
                }
                var ledger = sunap ?? Field(stored, SunapField);
                if (ledger.HasValue) WriteField(writer, SunapField, ledger);
            });
        });
    }

    /// <summary>연락 표시(contact.dat)를 보낸 값으로 바꾼다.</summary>
    public void SaveContact(JsonElement contact) => SaveWhole(ContactFile, ContactField, contact);

    /// <summary>서버 설정 사본(settings.dat)을 보낸 값으로 바꾼다(AC-015.7).</summary>
    public void SaveSettings(JsonElement settings) => SaveWhole(SettingsFile, SettingsField, settings);

    /// <summary>
    /// 물은 것만 담은 JSON 글자. {months?: {"YYYY-MM": {drafts, done, journal, sunap}}, contact?: {…}, settings?: {…}|null}.
    /// 본 파일도 .bak도 없으면 달은 네 칸 모두 {}, contact는 {}, settings는 null(사본 없음, AC-013.9). 프로필 ID는 싣지 않는다.
    /// 하나라도 막히면 그 오류만 던진다(반쪽 내용을 돌려주지 않는다). 조각으로 보내는 일은 부르는 쪽이 한다.
    /// </summary>
    public string Load(IReadOnlyList<string> months, bool settings, bool contact) => Load(months, settings, contact, mayRepair: true);

    /// <summary>
    /// Load와 같지만 파일을 전혀 쓰지 않는다. .bak으로 되살리거나 깨진 파일 이름을 바꿔야 하면 null: 부르는 쪽이 작업 잠금을 잡고 Load를 부른다(AC-035.6).
    /// 잠금 없이 되살리면 다른 프로세스가 바꿔치기하는 순간의 '본 파일 없음'을 깨짐으로 보고 그 저장을 덮을 수 있다.
    /// </summary>
    public string? LoadWithoutRepair(IReadOnlyList<string> months, bool settings, bool contact)
    {
        try
        {
            return Load(months, settings, contact, mayRepair: false);
        }
        catch (RepairNeededException)
        {
            return null;
        }
    }

    /// <summary>달 파일의 입력 기록과 진료일 칸(AC-035.2). 파일이 없거나 칸이 없으면 null. 읽기 규칙은 Load와 같다: 잠금을 쥔 쪽(bit.input)만 부른다.</summary>
    public (JsonElement? Journal, JsonElement? Dates) ReadJournal(string month)
    {
        var path = MonthPath(month);
        return Guarded(() =>
        {
            var stored = ReadStored(path);
            return (Field(stored, JournalField), Field(stored, JournalDatesField));
        });
    }

    /// <summary>달 파일의 원래 메모 칸(AC-037.1). 파일이 없거나 칸이 없으면 null. 도우미 안에서만 읽고 store.load 답에 없다.</summary>
    public JsonElement? ReadOriginals(string month)
    {
        var path = MonthPath(month);
        return Guarded(() => Field(ReadStored(path), OriginalsField));
    }

    private string Load(IReadOnlyList<string> months, bool settings, bool contact, bool mayRepair)
    {
        if (months == null) throw new ArgumentNullException(nameof(months));
        var asked = months.Distinct(StringComparer.Ordinal).Select(month => (Month: month, Path: MonthPath(month))).ToList();
        return Guarded(() =>
        {
            var monthValues = asked.Select(item => (item.Month, Stored: ReadStored(item.Path, mayRepair))).ToList();
            var contactValue = contact ? ReadStored(FilePath(ContactFile), mayRepair) : null;
            var settingsValue = settings ? ReadStored(FilePath(SettingsFile), mayRepair) : null;

            var clear = Serialize(writer =>
            {
                writer.WriteStartObject();
                if (monthValues.Count > 0)
                {
                    writer.WriteStartObject("months");
                    foreach (var (month, stored) in monthValues)
                    {
                        writer.WriteStartObject(month);
                        WriteField(writer, DraftsField, Field(stored, DraftsField));
                        WriteField(writer, DoneField, Field(stored, DoneField));
                        WriteField(writer, JournalField, Field(stored, JournalField));
                        WriteField(writer, SunapField, Field(stored, SunapField));
                        writer.WriteEndObject();
                    }
                    writer.WriteEndObject();
                }
                if (contact) WriteField(writer, ContactField, Field(contactValue, ContactField));
                if (settings)
                {
                    var value = Field(settingsValue, SettingsField);
                    writer.WritePropertyName(SettingsField);
                    if (value.HasValue) value.Value.WriteTo(writer);
                    else writer.WriteNullValue();
                }
                writer.WriteEndObject();
            });
            try
            {
                return Encoding.UTF8.GetString(clear);
            }
            finally
            {
                Array.Clear(clear, 0, clear.Length);
            }
        });
    }

    /// <summary>
    /// 오늘이 속한 달에서 13개월보다 오래된 work-YYYY-MM.dat와 그 .bak을 이름만 보고 지운다(AC-015.5). 내용을 읽지 않으므로
    /// 다른 병원 파일도 지워진다. 깨진 파일(*.broken-*)과 다른 파일은 두고, 지우지 못한 파일은 다음 저장 때 다시 해 본다.
    /// </summary>
    public void Prune()
    {
        var now = today();
        var thisMonth = (now.Year * 12) + now.Month;
        string[] files;
        try
        {
            if (!Directory.Exists(folder.Path)) return;
            files = Directory.GetFiles(folder.Path, "work-*");
        }
        catch (IOException)
        {
            return;
        }
        catch (UnauthorizedAccessException)
        {
            return;
        }

        foreach (var file in files)
        {
            var match = MonthFileShape.Match(Path.GetFileName(file));
            if (!match.Success) continue;
            var month = (int.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture) * 12) + int.Parse(match.Groups[2].Value, CultureInfo.InvariantCulture);
            if (thisMonth - month <= KeepMonths) continue;
            try
            {
                File.Delete(file);
            }
            catch (IOException)
            {
                // 잠긴 파일: 저장은 이미 끝났다. 다음 저장 때 다시 지운다
            }
            catch (UnauthorizedAccessException)
            {
                // 위와 같다
            }
        }
    }

    private void SaveWhole(string fileName, string field, JsonElement value)
    {
        RequireObject(value);
        var path = FilePath(fileName);
        Guarded(() =>
        {
            ReadStored(path);
            Write(path, writer => WriteField(writer, field, value));
        });
    }

    private string FilePath(string name) => Path.Combine(folder.Path, name);

    private string MonthPath(string month)
    {
        if (month == null || !MonthShape.IsMatch(month)) throw new HelperException(ErrorCodes.BadMessage);
        return FilePath("work-" + month + ".dat");
    }

    private static void RequireObject(JsonElement? value)
    {
        if (value.HasValue && value.Value.ValueKind != JsonValueKind.Object) throw new HelperException(ErrorCodes.BadMessage);
    }

    private static JsonElement? Field(JsonElement? stored, string name) =>
        stored.HasValue && stored.Value.TryGetProperty(name, out var value) ? value : (JsonElement?)null;

    private static void WriteField(Utf8JsonWriter writer, string name, JsonElement? value)
    {
        writer.WritePropertyName(name);
        if (value.HasValue)
        {
            value.Value.WriteTo(writer);
            return;
        }
        writer.WriteStartObject();
        writer.WriteEndObject();
    }

    /// <summary>저장해 둔 기록 가운데 보내지 않은 진료를 먼저, 그 뒤에 보낸 진료를 쓴다.</summary>
    private static void WriteJournalEntries(Utf8JsonWriter writer, JsonElement? stored, JsonElement? sent)
    {
        if (stored.HasValue)
        {
            foreach (var entry in stored.Value.EnumerateObject())
            {
                if (sent.HasValue && sent.Value.TryGetProperty(entry.Name, out _)) continue;
                entry.WriteTo(writer);
            }
        }
        if (sent.HasValue)
        {
            foreach (var entry in sent.Value.EnumerateObject()) entry.WriteTo(writer);
        }
    }

    /// <summary>
    /// 파일 하나를 읽는다. 본 파일도 .bak도 없으면 null(빈 내용). 본 파일 없이 .bak만 있으면 바꿔치기 중에 멈춘 것이라 깨진 본 파일처럼 다룬다:
    /// 빈 내용으로 보면 다음 저장 두 번이 done·journal과 .bak의 전 내용을 지운다. 나머지 규칙은 맨 위 설명대로다.
    /// </summary>
    private JsonElement? ReadStored(string path, bool mayRepair = true)
    {
        var backup = path + BackupSuffix;
        var hasMain = File.Exists(path);
        var hasBackup = File.Exists(backup);
        if (!hasMain && !hasBackup) return null;

        if (hasMain)
        {
            var mainState = Inspect(path, out var main);
            if (mainState == FileState.Good) return main;
            if (mainState == FileState.OtherHospital) throw new BitException(BitErrors.HospitalMismatch);
        }
        if (!mayRepair) throw new RepairNeededException();
        if (hasMain && !hasBackup)
        {
            SetAside(path);
            throw new BitException(BitErrors.StoreBroken);
        }

        var state = Inspect(backup, out var root);
        if (state == FileState.OtherHospital) throw new BitException(BitErrors.HospitalMismatch);
        if (state == FileState.Broken)
        {
            if (hasMain) SetAside(path);
            SetAside(backup);
            throw new BitException(BitErrors.StoreBroken);
        }
        RestoreFromBackup(path, backup);
        return root;
    }

    /// <summary>파일 하나의 머리·암호·JSON·병원을 본다. 병원이 다르면 칸은 들여다보지 않는다.</summary>
    private FileState Inspect(string path, out JsonElement root)
    {
        root = default;
        var data = File.ReadAllBytes(path);
        if (data.Length <= HeaderBytes.Length || !data.Take(HeaderBytes.Length).SequenceEqual(HeaderBytes)) return FileState.Broken;

        var cipher = new byte[data.Length - HeaderBytes.Length];
        Buffer.BlockCopy(data, HeaderBytes.Length, cipher, 0, cipher.Length);
        byte[] clear;
        try
        {
            clear = protector.Unprotect(cipher);
        }
        catch (CryptographicException)
        {
            return FileState.Broken;
        }

        try
        {
            StrictUtf8.GetCharCount(clear);
            using var document = JsonDocument.Parse(clear, Envelope.DocumentOptions);
            var parsed = document.RootElement;
            if (parsed.ValueKind != JsonValueKind.Object
                || !parsed.TryGetProperty(ProfileField, out var profile) || profile.ValueKind != JsonValueKind.String)
            {
                return FileState.Broken;
            }
            if (!string.Equals(profile.GetString(), current.ProfileId, StringComparison.Ordinal)) return FileState.OtherHospital;
            foreach (var name in ObjectFields)
            {
                if (parsed.TryGetProperty(name, out var value) && value.ValueKind != JsonValueKind.Object) return FileState.Broken;
            }

            // 짝 없는 대리쌍 이스케이프처럼 글자로 풀 수 없는 값이 있으면 깨진 파일이다: 여기서 걸러야 Load가 답을 만들다 멈추지 않는다
            using (var probe = new Utf8JsonWriter(Stream.Null, Envelope.WriterOptions)) parsed.WriteTo(probe);

            root = parsed.Clone();
            return FileState.Good;
        }
        catch (JsonException)
        {
            return FileState.Broken;
        }
        catch (InvalidOperationException)
        {
            return FileState.Broken;
        }
        catch (ArgumentException)
        {
            return FileState.Broken;
        }
        finally
        {
            Array.Clear(clear, 0, clear.Length);
        }
    }

    /// <summary>안쪽 칸을 써서 암호화한 뒤 임시 파일 → 바꿔치기. 암호화가 끝나기 전에는 디스크에 아무것도 쓰지 않는다.</summary>
    private void Write(string path, Action<Utf8JsonWriter> writeFields)
    {
        var clear = Serialize(writer =>
        {
            writer.WriteStartObject();
            writer.WriteString(ProfileField, current.ProfileId);
            writeFields(writer);
            writer.WriteEndObject();
        });
        var cipher = Encrypt(clear);

        Directory.CreateDirectory(folder.Path);
        GuardBackup(path);
        var temporary = TemporaryPath(path);
        try
        {
            WriteTemporary(temporary, cipher);
            if (File.Exists(path)) ReplaceFile(temporary, path, path + BackupSuffix);
            else File.Move(temporary, path);
        }
        finally
        {
            if (File.Exists(temporary)) File.Delete(temporary);
        }
    }

    /// <summary>평문을 암호화한다. 평문은 지운다. 못 하면 E-STORE-FAILED.</summary>
    private byte[] Encrypt(byte[] clear)
    {
        try
        {
            return protector.Protect(clear);
        }
        catch (CryptographicException)
        {
            throw new BitException(BitErrors.StoreFailed);
        }
        finally
        {
            Array.Clear(clear, 0, clear.Length);
        }
    }

    /// <summary>머리와 암호문만 임시 파일에 쓴다.</summary>
    private static void WriteTemporary(string temporary, byte[] cipher)
    {
        using var output = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None);
        output.Write(HeaderBytes, 0, HeaderBytes.Length);
        output.Write(cipher, 0, cipher.Length);
        output.Flush(true);
    }

    /// <summary>JSON을 바이트로 쓴다. 글자로 풀 수 없는 값(이모지 중간에서 잘린 메모 등)이면 어떤 파일도 건드리기 전에 E-HELPER-BAD-MESSAGE.</summary>
    private static byte[] Serialize(Action<Utf8JsonWriter> write)
    {
        using var buffer = new MemoryStream();
        try
        {
            using (var writer = new Utf8JsonWriter(buffer, Envelope.WriterOptions)) write(writer);
        }
        catch (InvalidOperationException)
        {
            throw new HelperException(ErrorCodes.BadMessage);
        }
        catch (ArgumentException)
        {
            throw new HelperException(ErrorCodes.BadMessage);
        }
        return buffer.ToArray();
    }

    /// <summary>바꿔치기가 곧 덮을 .bak을 지킨다: 깨졌으면 이름을 바꿔 두고, 다른 병원 것이면 쓰지 않는다.</summary>
    private void GuardBackup(string path)
    {
        var backup = path + BackupSuffix;
        if (!File.Exists(backup)) return;
        var state = Inspect(backup, out _);
        if (state == FileState.OtherHospital) throw new BitException(BitErrors.HospitalMismatch);
        if (state == FileState.Broken) SetAside(backup);
    }

    /// <summary>.bak을 임시 파일로 베껴 본 파일 자리에 넣는다. 깨진 본 파일이 있으면 새 이름으로 남고, .bak은 그대로 있다.</summary>
    private static void RestoreFromBackup(string path, string backup)
    {
        var temporary = TemporaryPath(path);
        try
        {
            File.Copy(backup, temporary);
            if (File.Exists(path)) ReplaceFile(temporary, path, BrokenName(path));
            else File.Move(temporary, path);
        }
        finally
        {
            if (File.Exists(temporary)) File.Delete(temporary);
        }
    }

    /// <summary>
    /// File.Replace. 윈도우 ReplaceFile이 전 파일을 옮긴 뒤 멈추면(ERROR_UNABLE_TO_MOVE_REPLACEMENT_2 등) path가 없어질 수 있어
    /// 그때는 임시 파일을 그 자리로 옮긴다(RegistrationStore와 같다).
    /// </summary>
    private static void ReplaceFile(string temporary, string path, string? kept)
    {
        try
        {
            File.Replace(temporary, path, kept);
        }
        catch (IOException) when (!File.Exists(path) && File.Exists(temporary))
        {
            File.Move(temporary, path);
        }
    }

    private static void SetAside(string path) => File.Move(path, BrokenName(path));

    private static string TemporaryPath(string path) => path + "." + Guid.NewGuid().ToString("N") + ".tmp";

    /// <summary>깨진 파일의 새 이름: 원래 이름 + .broken-UTC 시각(밀리초까지). 이미 있으면 -2, -3…을 붙여 덮지 않는다.</summary>
    private static string BrokenName(string path)
    {
        var stem = path + RegistrationStore.BrokenMark + DateTime.UtcNow.ToString("yyyyMMdd'T'HHmmssfff'Z'", CultureInfo.InvariantCulture);
        var name = stem;
        for (var n = 2; File.Exists(name); n++) name = stem + "-" + n.ToString(CultureInfo.InvariantCulture);
        return name;
    }

    private static void Guarded(Action action) => Guarded<object?>(() =>
    {
        action();
        return null;
    });

    /// <summary>폴더에 읽고 쓰지 못하면 E-STORE-FAILED. 파일 경로가 실린 예외 글은 밖으로 나가지 않는다(AC-001.6).</summary>
    private static T Guarded<T>(Func<T> action)
    {
        try
        {
            return action();
        }
        catch (IOException)
        {
            throw new BitException(BitErrors.StoreFailed);
        }
        catch (UnauthorizedAccessException)
        {
            throw new BitException(BitErrors.StoreFailed);
        }
    }
}
