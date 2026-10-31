using System;
using System.Globalization;
using System.IO;
using Precheck.Core.Bit;
using Precheck.Core.Store;

namespace Precheck.Core.Registration;

/// <summary>
/// 등록 파일 읽고 쓰기. 폴더는 도우미가 정한다(윈도우: %LOCALAPPDATA%\Seoseungkwan\PrecheckHelper\data\, design.md 9-3).
/// 쓰기는 임시 파일 → 바꿔치기(File.Replace, .bak 하나). 읽거나 쓰지 못하면 HelperException(E-STORE-FAILED).
/// 깨진 파일 규칙(AC-005.12): 없으면 등록 없음(null). 깨졌으면 맞는 .bak으로 되살리고 깨진 파일은 이름을 바꿔 둔다.
/// .bak도 없거나 깨졌으면 E-STORE-BROKEN(파일은 그대로). 깨진 파일은 어디서도 지우거나 덮지 않는다.
/// </summary>
public sealed class RegistrationStore
{
    public const string FileName = "registration.dat";

    /// <summary>깨진 파일을 이름 바꿔 둘 때 붙이는 말: registration.dat.broken-20261031T091500123Z.</summary>
    public const string BrokenMark = ".broken-";

    private readonly string directory;
    private readonly IProtector protector;

    public RegistrationStore(string directory, IProtector protector)
    {
        if (string.IsNullOrWhiteSpace(directory)) throw new ArgumentException("저장 폴더가 비었다", nameof(directory));
        this.directory = directory;
        this.protector = protector ?? throw new ArgumentNullException(nameof(protector));
    }

    public string FilePath => Path.Combine(directory, FileName);

    public string BackupPath => FilePath + ".bak";

    /// <summary>
    /// 등록. registration.dat가 없으면 null(등록 없음). 깨졌으면 .bak이 같은 검사를 지날 때 그것으로 되살려 돌려주고
    /// 깨진 파일은 이름을 바꿔 남긴다. .bak도 없거나 깨졌으면 BitException(E-STORE-BROKEN).
    /// </summary>
    public HospitalRegistration? Load()
    {
        try
        {
            if (!File.Exists(FilePath)) return null;
            var current = ReadFile(FilePath);
            if (current != null) return current;

            var backup = File.Exists(BackupPath) ? ReadFile(BackupPath) : null;
            if (backup == null) throw new BitException(BitErrors.StoreBroken);
            RestoreFromBackup();
            return backup;
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
    /// 등록을 쓴다. 이미 있으면 바꿔 쓰고 전 파일을 registration.dat.bak으로 남긴다.
    /// 깨진 registration.dat·.bak은 먼저 이름을 바꿔 둔다: 깨진 파일이 새 .bak이 되거나 전 .bak이 덮여 사라지지 않게(AC-005.12).
    /// </summary>
    public void Save(HospitalRegistration registration)
    {
        var data = RegistrationFile.Write(registration, protector);
        try
        {
            Directory.CreateDirectory(directory);
            SetAsideIfBroken(FilePath);
            SetAsideIfBroken(BackupPath);
            WriteReplacing(data);
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

    /// <summary>파일 하나를 같은 검사(크기·머리·풀기·JSON·칸)로 읽는다. 깨졌으면 null.</summary>
    private HospitalRegistration? ReadFile(string path)
    {
        if (new FileInfo(path).Length > RegistrationFile.MaxBytes) return null;
        return RegistrationFile.Read(File.ReadAllBytes(path), protector);
    }

    /// <summary>
    /// .bak을 임시 파일로 베낀 뒤 File.Replace 한 번으로 registration.dat를 되살리고 깨진 파일은 새 이름으로 남긴다.
    /// 윈도우 ReplaceFile이 깨진 파일을 새 이름으로 옮긴 뒤 멈추면(ERROR_UNABLE_TO_MOVE_REPLACEMENT_2 등) registration.dat가
    /// 없어질 수 있다. 그때는 임시 파일(.bak 내용)을 그 자리로 옮긴다. 그것도 못 하면 E-STORE-FAILED이고 .bak은 남아 있다.
    /// </summary>
    private void RestoreFromBackup()
    {
        var temporary = TemporaryPath();
        try
        {
            File.Copy(BackupPath, temporary);
            try
            {
                File.Replace(temporary, FilePath, BrokenName(FilePath));
            }
            catch (IOException) when (!File.Exists(FilePath) && File.Exists(temporary))
            {
                File.Move(temporary, FilePath);
            }
        }
        finally
        {
            if (File.Exists(temporary)) File.Delete(temporary);
        }
    }

    private void SetAsideIfBroken(string path)
    {
        if (File.Exists(path) && ReadFile(path) == null) File.Move(path, BrokenName(path));
    }

    private void WriteReplacing(byte[] data)
    {
        var temporary = TemporaryPath();
        try
        {
            using (var output = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                output.Write(data, 0, data.Length);
                output.Flush(true);
            }
            if (File.Exists(FilePath)) File.Replace(temporary, FilePath, BackupPath);
            else File.Move(temporary, FilePath);
        }
        finally
        {
            if (File.Exists(temporary)) File.Delete(temporary);
        }
    }

    private string TemporaryPath() => FilePath + "." + Guid.NewGuid().ToString("N") + ".tmp";

    /// <summary>깨진 파일의 새 이름: 원래 이름 + .broken-UTC 시각(밀리초까지). 이미 있으면 -2, -3…을 붙여 덮지 않는다.</summary>
    private static string BrokenName(string path)
    {
        var stem = path + BrokenMark + DateTime.UtcNow.ToString("yyyyMMdd'T'HHmmssfff'Z'", CultureInfo.InvariantCulture);
        var name = stem;
        for (var n = 2; File.Exists(name); n++) name = stem + "-" + n.ToString(CultureInfo.InvariantCulture);
        return name;
    }
}
