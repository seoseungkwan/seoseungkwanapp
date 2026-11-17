using System;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Unicode;
using Precheck.Core.Bit;
using Precheck.Core.Registration;
using Precheck.Core.Store;

namespace Precheck.Core.Reception.Settings;

/// <summary>설정 저장 결과(POST /api/settings: Saved 204 · Conflict 409 · Invalid 400, AC-5704.2).</summary>
public enum SaveResult
{
    Saved,

    /// <summary>받은 문서의 rev가 저장된 rev와 다르다(다른 기기가 먼저 바꿨다).</summary>
    Conflict,

    /// <summary>바꿀 수 없는 것을 바꿨다(ReceptionSettings.ChangeProblem·로고 파일 없이 pic).</summary>
    Invalid,
}

/// <summary>
/// 접수 현황 설정 저장(spec reception-other-clinic design.md 1절, AC-5701.5~5701.9). 비트에는 쓰지 않고 총괄 PC의 저장 폴더 파일 하나에만 둔다.
/// 파일 `reception-settings.dat` = 머리 `PRECHECK-STORE-1\n` + IProtector(윈도우 DPAPI CurrentUser)로 감싼 설정 문서 JSON(ReceptionSettings.Write). 날짜와 상관없고 64KB까지다.
/// 규칙은 ReceptionLists와 같다: 잠금 하나로 한 번에 하나, 임시 파일 → 바꾸기, 처음 한 번 읽어 메모리에(이 프로그램만 쓴다).
/// 처음 켜기(설정 파일도 표지도 없음)는 처음 값을 정해 바로 저장한다: 그 PC에 접수 현황을 쓴 흔적(reception-lists.dat·reception-arrange.dat·reception-marks.dat)이 있으면
/// 우리 의원(Ours, 품은 로고 그림을 로고 파일로 옮기고 옛 목록을 picks로), 없으면 새 병원(Fresh). 기관기호·병원 이름은 보지 않는다.
/// 그때 고른 처음 값을 같은 폴더의 표지 `reception-origin.dat`(같은 머리 + IProtector, 낱말 ours·fresh)에 적어 두고(AC-5701.9), 설정 파일이 없어지거나 깨져 다시 만들 때는
/// 표지를 따른다. 설정 파일이 깨졌는데 읽히는 표지가 없으면 새 병원 처음 값이다(표시 파일은 새 병원에도 쌓여 우리 의원의 증거가 되지 못한다).
/// 깨진 설정 파일은 이름을 *.broken-시각으로 바꿔 두고(지우지 않음) 기록에 E-STORE-BROKEN만 남긴다.
/// setup.done은 한 번 참이 되면 참으로 지킨다(AC-5701.8). 기록(report)에는 오류 번호만 간다.
/// </summary>
public sealed class SettingsStore
{
    public const string FileName = "reception-settings.dat";

    /// <summary>가장 큰 문서도 몸 한도(32KB) 안이다. 이보다 크면 읽어 들이지 않고 깨진 파일로 본다.</summary>
    private const int MaxFileBytes = 64 * 1024;

    /// <summary>처음 값 표지(AC-5701.9): 이 PC의 처음 값이 우리 의원(ours)인지 새 병원(fresh)인지. 처음 값을 만들 때 읽히는 표지가 없으면 쓴다.</summary>
    private const string OriginFileName = "reception-origin.dat";

    /// <summary>표지는 낱말 하나다. 이보다 크면 읽어 들이지 않고 깨진 표지로 본다.</summary>
    private const int MaxOriginBytes = 4 * 1024;

    private const string OursOrigin = "ours";
    private const string FreshOrigin = "fresh";

    /// <summary>지금까지 접수 현황을 쓴 PC에만 있는 파일(우리 의원, AC-5701.5).</summary>
    private static readonly string[] TraceFiles = { ReceptionLists.FileName, ArrangeMarks.FileName, XrayMarks.FileName };

    private static readonly byte[] HeaderBytes = Encoding.ASCII.GetBytes(RegistrationFile.Header);
    private static readonly JsonWriterOptions WriterOptions = new JsonWriterOptions { Encoder = JavaScriptEncoder.Create(UnicodeRanges.All) };

    private readonly IStoreFolder folder;
    private readonly IProtector protector;
    private readonly Func<byte[]?> embeddedWordmark;
    private readonly LogoStore logo;
    private readonly Action<string>? report;
    private readonly object gate = new object();

    /// <summary>읽은(또는 저장한) 문서. 아직 읽지 않았거나 읽기·처음 저장이 실패했으면 null.</summary>
    private ReceptionSettings? current;

    /// <summary>
    /// 처음 켜기의 흔적 파일 판단(AC-5701.5·6). 처음 필요할 때(쓰기 전) 한 번만 보고, 쓰기가 실패해 다시 해 볼 때·저장하지 않은 처음 값으로 답할 때도 이 값을 쓴다.
    /// 그 사이 이 프로그램이 만든 표시 파일(reception-marks.dat·reception-arrange.dat)로 새 병원을 우리 의원으로 바꾸지 않게(AC-5701.9). 아직 보지 않았으면 null.
    /// </summary>
    private bool? firstRunOurs;

    /// <summary>표지 파일을 읽은 결과(AC-5701.9).</summary>
    private enum Origin
    {
        Missing,
        Broken,
        Ours,
        Fresh,
    }

    /// <param name="folder">접수 현황 저장 폴더(`data\`).</param>
    /// <param name="protector">이 PC 윈도우 계정 암호화.</param>
    /// <param name="embeddedWordmark">프로그램에 품은 우리 의원 로고 그림(PNG). 우리 의원 처음 값을 만들 때만 부른다.</param>
    /// <param name="logo">로고 그림 저장(옮긴 그림을 쓴다, 로고 파일 없이 pic 막기).</param>
    /// <param name="report">기록에 남길 오류 번호를 받는다('E-…'만).</param>
    public SettingsStore(IStoreFolder folder, IProtector protector, Func<byte[]?> embeddedWordmark, LogoStore logo, Action<string>? report = null)
    {
        this.folder = folder ?? throw new ArgumentNullException(nameof(folder));
        this.protector = protector ?? throw new ArgumentNullException(nameof(protector));
        this.embeddedWordmark = embeddedWordmark ?? throw new ArgumentNullException(nameof(embeddedWordmark));
        this.logo = logo ?? throw new ArgumentNullException(nameof(logo));
        this.report = report;
    }

    private string FilePath => Path.Combine(folder.Path, FileName);

    private string OriginPath => Path.Combine(folder.Path, OriginFileName);

    /// <summary>
    /// 지금 설정. 파일이 없으면 처음 값을 정해 바로 저장하고(AC-5701.5·6), 깨졌으면 이름을 바꿔 두고 다시 만든다(AC-5701.7). 어느 처음 값인지는 표지를 따른다(AC-5701.9).
    /// 읽거나 쓰지 못하면(잠김·권한) 기록에 E-STORE-FAILED를 남기고 이번에는 같은 규칙의 처음 값(저장하지 않음)으로 답한 뒤 다음 읽기에서 다시 해 본다. 던지지 않는다.
    /// </summary>
    public ReceptionSettings Current()
    {
        lock (gate)
        {
            try
            {
                return Loaded();
            }
            catch (BitException error) when (error.Code == BitErrors.StoreFailed)
            {
                report?.Invoke(BitErrors.StoreFailed);
                return FallbackIsOurs() ? ReceptionSettings.Ours(PickLists.Defaults) : ReceptionSettings.Fresh();
            }
        }
    }

    /// <summary>
    /// 받은 문서로 바꾼다(POST /api/settings, AC-5704.2): rev가 저장된 rev와 다르면 Conflict, 바꿀 수 없는 것을 바꿨거나 로고 파일 없이 pic으로 바꾸면 Invalid,
    /// 아니면 setup.done 참을 지키고(AC-5701.8) rev +1로 저장한다(AC-5701.7). 쓰지 못하면 BitException(E-STORE-FAILED)이고 파일·문서는 그대로다.
    /// </summary>
    public SaveResult Save(ReceptionSettings next)
    {
        if (next == null) throw new ArgumentNullException(nameof(next));
        lock (gate)
        {
            var stored = Loaded();
            if (next.Rev != stored.Rev) return SaveResult.Conflict;
            if (stored.ChangeProblem(next) != null) return SaveResult.Invalid;
            if (next.Logo.Mode == LogoModes.Pic && stored.Logo.Mode != LogoModes.Pic && !logo.Exists()) return SaveResult.Invalid;
            Store(stored, next);
            return SaveResult.Saved;
        }
    }

    /// <summary>
    /// 서버가 바꾼다(로고 올리기처럼, rev 검사·바꿀 수 없는 것 검사 없음): change가 만든 문서를 setup.done 참을 지켜 rev +1로 저장하고 그 문서를 돌려준다.
    /// 쓰지 못하면 BitException(E-STORE-FAILED)이고 파일·문서는 그대로다.
    /// </summary>
    public ReceptionSettings Update(Func<ReceptionSettings, ReceptionSettings> change)
    {
        if (change == null) throw new ArgumentNullException(nameof(change));
        lock (gate)
        {
            var stored = Loaded();
            var next = change(stored) ?? throw new InvalidOperationException("바꾼 설정이 없다");
            return Store(stored, next);
        }
    }

    /// <summary>setup.done 참 지키기 + rev +1로 쓰고 메모리에 둔다.</summary>
    private ReceptionSettings Store(ReceptionSettings stored, ReceptionSettings next)
    {
        if (stored.Setup.Done && !next.Setup.Done) next = next.WithSetup(new SetupState(next.Setup.Logo, next.Setup.Tab, true));
        next = next.WithRev(stored.Rev + 1);
        Write(next);
        current = next;
        return next;
    }

    /// <summary>메모리의 문서, 없으면 파일에서(없거나 깨졌으면 만들어 저장). 읽거나 쓰지 못하면 BitException(E-STORE-FAILED). gate 안에서만 부른다.</summary>
    private ReceptionSettings Loaded()
    {
        if (current != null) return current;
        try
        {
            current = Load();
            return current;
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

    /// <summary>
    /// 파일을 읽는다. 없거나 깨졌으면 처음 값을 정해(ChooseOurs) 바로 저장한다. 읽히는 표지가 없으면 고른 표지를 먼저 쓰고 그다음 깨진 파일 이름을 바꾼다:
    /// 도중에 멈춰도(쓰지 못함) 다음 읽기가 같은 처음 값을 고른다. 깨진 설정 파일·표지는 합쳐 E-STORE-BROKEN 한 번.
    /// </summary>
    private ReceptionSettings Load()
    {
        var exists = File.Exists(FilePath);
        if (exists)
        {
            var read = ReadFile();
            if (read != null) return read;
        }
        var origin = ReadOrigin();
        if (exists || origin == Origin.Broken) report?.Invoke(BitErrors.StoreBroken);
        var ours = ChooseOurs(origin, exists);
        if (origin != Origin.Ours && origin != Origin.Fresh) WriteOrigin(ours);
        if (exists) File.Move(FilePath, BrokenName(FilePath));
        var made = Make(ours);
        Write(made);
        return made;
    }

    /// <summary>
    /// 어느 처음 값인가(AC-5701.9). 읽히는 표지가 있으면 그 표지. 표지도 설정 파일도 없으면(처음 켜기) 흔적 파일 규칙(AC-5701.5·6) — 이 판단은 한 번만 하고 기억한다(firstRunOurs).
    /// 그 밖(설정 파일이 깨졌는데 표지가 없음·표지가 깨짐)은 새 병원: 처음 켜기가 아니고, 표시 파일은 새 병원에도 쌓여 우리 의원의 증거가 되지 못한다.
    /// </summary>
    private bool ChooseOurs(Origin origin, bool settingsExists)
    {
        if (origin == Origin.Ours) return true;
        if (origin == Origin.Fresh) return false;
        return origin == Origin.Missing && !settingsExists && (firstRunOurs ??= IsOurs());
    }

    /// <summary>쓰지 못해 저장하지 않은 처음 값으로 답할 때도 같은 규칙이다. 표지마저 읽지 못하면(잠김) 새 병원(우리 의원 로고·코드가 다른 병원에 나오지 않게).</summary>
    private bool FallbackIsOurs()
    {
        try
        {
            return ChooseOurs(ReadOrigin(), File.Exists(FilePath));
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

    private bool IsOurs() => TraceFiles.Any(name => File.Exists(Path.Combine(folder.Path, name)));

    /// <summary>표지 파일. 없으면 Missing, 깨졌으면(크기·머리·풀기·모르는 낱말) Broken. 읽지 못하면 IOException 그대로.</summary>
    private Origin ReadOrigin()
    {
        if (!File.Exists(OriginPath)) return Origin.Missing;
        var clear = Unseal(OriginPath, MaxOriginBytes);
        if (clear == null) return Origin.Broken;
        var word = Encoding.ASCII.GetString(clear);
        if (word == OursOrigin) return Origin.Ours;
        return word == FreshOrigin ? Origin.Fresh : Origin.Broken;
    }

    /// <summary>표지를 쓴다(임시 파일 → 바꾸기). 쓰지 못하면 BitException(E-STORE-FAILED).</summary>
    private void WriteOrigin(bool ours) => WriteSealed(OriginPath, Encoding.ASCII.GetBytes(ours ? OursOrigin : FreshOrigin));

    /// <summary>
    /// 처음 값(AC-5701.5·6, 어느 쪽인지는 ChooseOurs). 우리 의원이면 옛 목록 파일을 picks로 읽고(없거나 깨졌으면 기본 목록, 지우지 않음) 로고 그림을 옮긴다:
    /// 이미 읽히는 로고 파일이 있으면(깨진 설정을 다시 만드는 때) 그 그림을 두고, 없으면 품은 그림을 쓴다. 품은 그림이 없거나 PNG가 아니면 로고 none·ver 0.
    /// 옛 목록을 읽지 못하면(잠김) IOException — 기본 목록으로 굳히지 않고 다음에 다시 해 본다.
    /// </summary>
    private ReceptionSettings Make(bool ours)
    {
        if (!ours) return ReceptionSettings.Fresh();
        var listsFailed = false;
        var lists = new ReceptionLists(folder, protector, code =>
        {
            if (code == BitErrors.StoreFailed) listsFailed = true;
            else report?.Invoke(code);
        }).Current();
        if (listsFailed) throw new IOException("옛 목록 파일을 읽지 못했다");

        var settings = ReceptionSettings.Ours(lists);
        if (logo.Read() != null) return settings;
        var wordmark = embeddedWordmark();
        if (wordmark == null || !LogoImage.TryRead(wordmark, LogoImage.PngType, out var kind, out _, out _))
            return settings.WithLogo(new LogoSetting(LogoModes.None, null, 0));
        logo.Save(kind, wordmark);
        return settings;
    }

    /// <summary>크기·머리·풀기·모양으로 읽는다. 깨졌으면 null. 읽지 못하면 IOException 그대로.</summary>
    private ReceptionSettings? ReadFile()
    {
        var clear = Unseal(FilePath, MaxFileBytes);
        if (clear == null) return null;
        try
        {
            return ReceptionSettings.TryParse(clear, out var settings) ? settings : null;
        }
        finally
        {
            Array.Clear(clear, 0, clear.Length);
        }
    }

    /// <summary>크기·머리·풀기로 읽은 평문(다 쓰면 부르는 쪽이 지운다). 깨졌으면 null. 읽지 못하면 IOException 그대로.</summary>
    private byte[]? Unseal(string path, int maxBytes)
    {
        if (new FileInfo(path).Length > maxBytes) return null;
        var data = File.ReadAllBytes(path);
        if (data.Length <= HeaderBytes.Length || !data.Take(HeaderBytes.Length).SequenceEqual(HeaderBytes)) return null;

        var cipher = new byte[data.Length - HeaderBytes.Length];
        Buffer.BlockCopy(data, HeaderBytes.Length, cipher, 0, cipher.Length);
        try
        {
            return protector.Unprotect(cipher);
        }
        catch (CryptographicException)
        {
            return null;
        }
    }

    private void Write(ReceptionSettings settings) => WriteSealed(FilePath, Plain(settings));

    /// <summary>머리 + 암호문을 임시 파일에 다 쓰고 디스크까지 내린 뒤 path와 바꾼다. 실패하면 전 파일은 그대로이고 임시 파일은 지운다.</summary>
    private void WriteSealed(string path, byte[] clear)
    {
        try
        {
            var data = Seal(clear);
            Directory.CreateDirectory(folder.Path);
            var temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
            try
            {
                using (var output = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                {
                    output.Write(data, 0, data.Length);
                    output.Flush(true);
                }
                if (File.Exists(path)) ReplaceFile(temporary, path);
                else File.Move(temporary, path);
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

    /// <summary>File.Replace. 전 파일을 옮긴 뒤 멈춰 파일이 없어졌으면 임시 파일을 그 자리로 옮긴다(ReceptionLists와 같다).</summary>
    private static void ReplaceFile(string temporary, string path)
    {
        try
        {
            File.Replace(temporary, path, null);
        }
        catch (IOException) when (!File.Exists(path) && File.Exists(temporary))
        {
            File.Move(temporary, path);
        }
    }

    /// <summary>깨진 파일의 새 이름: 원래 이름 + .broken-UTC 시각(밀리초까지). 이미 있으면 -2, -3…을 붙여 덮지 않는다(WorkStore와 같다).</summary>
    private static string BrokenName(string path)
    {
        var stem = path + RegistrationStore.BrokenMark + DateTime.UtcNow.ToString("yyyyMMdd'T'HHmmssfff'Z'", CultureInfo.InvariantCulture);
        var name = stem;
        for (var n = 2; File.Exists(name); n++) name = stem + "-" + n.ToString(CultureInfo.InvariantCulture);
        return name;
    }

    /// <summary>설정 문서 JSON 평문.</summary>
    private static byte[] Plain(ReceptionSettings settings)
    {
        using (var buffer = new MemoryStream())
        {
            using (var writer = new Utf8JsonWriter(buffer, WriterOptions)) settings.Write(writer);
            return buffer.ToArray();
        }
    }

    /// <summary>머리 + 암호화한 평문. 평문은 암호화한 뒤 지운다.</summary>
    private byte[] Seal(byte[] clear)
    {
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
}
