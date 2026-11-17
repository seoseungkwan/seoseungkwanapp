using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Precheck.Core.Bit;
using Precheck.Core.Registration;
using Precheck.Core.Store;

namespace Precheck.Core.Reception.Settings;

/// <summary>저장된 로고 그림 하나.</summary>
public sealed class LogoPicture
{
    public LogoPicture(LogoKind kind, byte[] bytes)
    {
        Kind = kind;
        Bytes = bytes ?? throw new ArgumentNullException(nameof(bytes));
    }

    public LogoKind Kind { get; }

    public byte[] Bytes { get; }

    /// <summary>GET /api/logo 답의 Content-Type(image/png·image/jpeg).</summary>
    public string ContentType => LogoImage.ContentTypeOf(Kind);
}

/// <summary>
/// 병원 로고 그림 저장(spec reception-other-clinic design.md 4절, AC-5706.1). 비트에는 쓰지 않고 총괄 PC의 저장 폴더 파일 하나에만 둔다(그림은 하나만).
/// 파일 `reception-logo.dat` = 머리 `PRECHECK-STORE-1\n` + IProtector(윈도우 DPAPI CurrentUser)로 감싼 [형식 한 바이트(1 = PNG · 2 = JPEG) + 그림]. 날짜와 상관없다.
/// 쓰기는 ReceptionLists와 같다: 잠금 하나로 한 번에 하나, 임시 파일 → 바꾸기. 그림 검사(LogoImage)는 부르는 쪽(POST /api/logo)이 먼저 한다.
/// 기록(report)에는 오류 번호만 간다(그림 바이트·경로 없음).
/// </summary>
public sealed class LogoStore
{
    public const string FileName = "reception-logo.dat";

    /// <summary>그림 한도 + 머리·암호화 덧붙임. 이보다 크면 읽어 들이지 않고 깨진 파일로 본다.</summary>
    private const int MaxFileBytes = LogoImage.MaxBytes + 64 * 1024;

    private static readonly byte[] HeaderBytes = Encoding.ASCII.GetBytes(RegistrationFile.Header);

    private readonly IStoreFolder folder;
    private readonly IProtector protector;
    private readonly Action<string>? report;
    private readonly object gate = new object();

    /// <summary>이 파일이 깨졌다고 이미 기록했나(다음 저장 전까지 한 번만).</summary>
    private bool brokenReported;

    /// <param name="folder">접수 현황 저장 폴더(`data\`).</param>
    /// <param name="protector">이 PC 윈도우 계정 암호화.</param>
    /// <param name="report">기록에 남길 오류 번호를 받는다('E-…'만).</param>
    public LogoStore(IStoreFolder folder, IProtector protector, Action<string>? report = null)
    {
        this.folder = folder ?? throw new ArgumentNullException(nameof(folder));
        this.protector = protector ?? throw new ArgumentNullException(nameof(protector));
        this.report = report;
    }

    private string FilePath => Path.Combine(folder.Path, FileName);

    /// <summary>로고 파일이 있나(풀어 보지 않는다).</summary>
    public bool Exists() => File.Exists(FilePath);

    /// <summary>
    /// 저장된 로고 그림. 파일이 없으면 null, 깨졌으면(크기·머리·풀기·형식 바이트) null + 기록 E-STORE-BROKEN(다음 저장 전까지 한 번).
    /// 읽지 못하면(잠김·권한) BitException(E-STORE-FAILED).
    /// </summary>
    public LogoPicture? Read()
    {
        lock (gate)
        {
            try
            {
                if (!File.Exists(FilePath)) return null;
                var picture = ReadFile();
                if (picture == null && !brokenReported)
                {
                    brokenReported = true;
                    report?.Invoke(BitErrors.StoreBroken);
                }
                return picture;
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

    /// <summary>
    /// 로고 그림을 바꾼다(앞 그림은 남기지 않는다). 빈 그림·2097152바이트를 넘는 그림·모르는 형식은 ArgumentException.
    /// 쓰지 못하면 BitException(E-STORE-FAILED)이고 앞 파일은 그대로다.
    /// </summary>
    public void Save(LogoKind kind, byte[] image)
    {
        if (image == null) throw new ArgumentNullException(nameof(image));
        if (image.Length == 0 || image.Length > LogoImage.MaxBytes) throw new ArgumentException("로고 그림 크기가 한도 밖이다", nameof(image));
        if (kind != LogoKind.Png && kind != LogoKind.Jpeg) throw new ArgumentOutOfRangeException(nameof(kind));
        lock (gate)
        {
            Write(kind, image);
            brokenReported = false;
        }
    }

    private LogoPicture? ReadFile()
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
        if (clear.Length < 2 || clear.Length > LogoImage.MaxBytes + 1) return null;
        var kind = (LogoKind)clear[0];
        if (kind != LogoKind.Png && kind != LogoKind.Jpeg) return null;
        var image = new byte[clear.Length - 1];
        Buffer.BlockCopy(clear, 1, image, 0, image.Length);
        return new LogoPicture(kind, image);
    }

    /// <summary>임시 파일에 다 쓰고 디스크까지 내린 뒤 바꾼다. 실패하면 전 파일은 그대로이고 임시 파일은 지운다.</summary>
    private void Write(LogoKind kind, byte[] image)
    {
        try
        {
            var data = Seal(kind, image);
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

    /// <summary>File.Replace. 전 파일을 옮긴 뒤 멈춰 파일이 없어졌으면 임시 파일을 그 자리로 옮긴다(ReceptionLists와 같다).</summary>
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

    /// <summary>머리 + 암호화한 [형식 바이트 + 그림].</summary>
    private byte[] Seal(LogoKind kind, byte[] image)
    {
        var clear = new byte[image.Length + 1];
        clear[0] = (byte)kind;
        Buffer.BlockCopy(image, 0, clear, 1, image.Length);
        var cipher = protector.Protect(clear);
        var output = new byte[HeaderBytes.Length + cipher.Length];
        Buffer.BlockCopy(HeaderBytes, 0, output, 0, HeaderBytes.Length);
        Buffer.BlockCopy(cipher, 0, output, HeaderBytes.Length, cipher.Length);
        return output;
    }
}
