using System;
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

namespace Precheck.Core.Reception;

/// <summary>
/// SONO·C-ARM 고르기 목록 저장(spec reception-pick-lists design.md 1절, AC-3501.1·AC-3501.3). 비트에는 쓰지 않고 총괄 PC의 저장 폴더 파일 하나에만 둔다.
/// 파일 `reception-lists.dat` = 머리 `PRECHECK-STORE-1\n` + IProtector(윈도우 DPAPI CurrentUser)로 감싼 목록 JSON `{ carm, sono, pt, ds, eswt, trac }`(PickLists.Write). 날짜와 상관없다.
/// 새 무리 넷이 모두 없는 옛 파일 `{ carm, sono }`는 그 넷만 기본값으로 읽고, 일부만 있으면 깨진 파일이다(spec reception-arrange-tune AC-3603.1).
/// 규칙은 XrayMarks·ArrangeMarks와 같다: 잠금 하나로 한 번에 하나, 임시 파일 → 바꾸기, 처음 한 번 읽어 메모리에.
/// 파일이 없으면 기본값(PickLists.Defaults), 64KB를 넘거나 머리·풀기·모양이 틀리면 기본값 + 기록 E-STORE-BROKEN 한 번. 기록(report)에는 오류 번호만 간다.
/// </summary>
public sealed class ReceptionLists
{
    public const string FileName = "reception-lists.dat";

    /// <summary>가장 큰 목록도 수 KB다. 이보다 크면 읽어 들이지 않고 깨진 파일로 본다.</summary>
    private const int MaxFileBytes = 64 * 1024;

    private static readonly byte[] HeaderBytes = Encoding.ASCII.GetBytes(RegistrationFile.Header);
    private static readonly JsonWriterOptions WriterOptions = new JsonWriterOptions { Encoder = JavaScriptEncoder.Create(UnicodeRanges.All) };

    private readonly IStoreFolder folder;
    private readonly IProtector protector;
    private readonly Action<string>? report;
    private readonly object gate = new object();

    /// <summary>읽은(또는 저장한) 목록. 아직 읽지 않았으면 null.</summary>
    private PickLists? current;

    /// <param name="folder">도우미 저장 폴더(`data\`).</param>
    /// <param name="protector">이 PC 윈도우 계정 암호화.</param>
    /// <param name="report">기록에 남길 오류 번호를 받는다('E-…'만).</param>
    public ReceptionLists(IStoreFolder folder, IProtector protector, Action<string>? report = null)
    {
        this.folder = folder ?? throw new ArgumentNullException(nameof(folder));
        this.protector = protector ?? throw new ArgumentNullException(nameof(protector));
        this.report = report;
    }

    private string FilePath => Path.Combine(folder.Path, FileName);

    /// <summary>
    /// 지금 목록. 파일이 없으면 기본값, 깨졌으면 기본값 + E-STORE-BROKEN(한 번). 파일을 읽지 못하면(잠김·권한) 기록에 E-STORE-FAILED를 남기고
    /// 이번에는 기본값으로 답한 뒤 다음 읽기에서 다시 읽는다. 던지지 않는다.
    /// </summary>
    public PickLists Current()
    {
        lock (gate)
        {
            if (current != null) return current;
            try
            {
                var read = File.Exists(FilePath) ? ReadFile() : PickLists.Defaults;
                if (read == null)
                {
                    report?.Invoke(BitErrors.StoreBroken);
                    read = PickLists.Defaults;
                }
                current = read;
                return read;
            }
            catch (IOException)
            {
                report?.Invoke(BitErrors.StoreFailed);
                return PickLists.Defaults;
            }
            catch (UnauthorizedAccessException)
            {
                report?.Invoke(BitErrors.StoreFailed);
                return PickLists.Defaults;
            }
        }
    }

    /// <summary>목록 전체를 바꾼다. 쓰지 못하면 BitException(E-STORE-FAILED)이고 파일·목록은 그대로다.</summary>
    public void Save(PickLists lists)
    {
        if (lists == null) throw new ArgumentNullException(nameof(lists));
        lock (gate)
        {
            Write(lists);
            current = lists;
        }
    }

    /// <summary>크기·머리·풀기·목록 규칙으로 읽는다. 깨졌으면 null. 읽지 못하면 IOException 그대로.</summary>
    private PickLists? ReadFile()
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
            return PickLists.TryParseStored(clear, out var lists) ? lists : null;
        }
        finally
        {
            Array.Clear(clear, 0, clear.Length);
        }
    }

    /// <summary>임시 파일에 다 쓰고 디스크까지 내린 뒤 바꾼다. 실패하면 전 파일은 그대로이고 임시 파일은 지운다.</summary>
    private void Write(PickLists lists)
    {
        try
        {
            var data = Seal(lists);
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

    /// <summary>File.Replace. 전 파일을 옮긴 뒤 멈춰 파일이 없어졌으면 임시 파일을 그 자리로 옮긴다(XrayMarks와 같다).</summary>
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

    /// <summary>머리 + 암호화한 목록 JSON. 평문은 암호화한 뒤 지운다.</summary>
    private byte[] Seal(PickLists lists)
    {
        byte[] clear;
        using (var buffer = new MemoryStream())
        {
            using (var writer = new Utf8JsonWriter(buffer, WriterOptions)) lists.Write(writer);
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
}
