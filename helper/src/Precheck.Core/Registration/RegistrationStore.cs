using System;
using System.IO;
using Precheck.Core.Bit;
using Precheck.Core.Store;

namespace Precheck.Core.Registration;

/// <summary>
/// 등록 파일 읽고 쓰기. 폴더는 도우미가 정한다(윈도우: %LOCALAPPDATA%\Seoseungkwan\PrecheckHelper\data\, design.md 9-3).
/// 쓰기는 임시 파일 → 바꿔치기(File.Replace, .bak 하나). 읽거나 쓰지 못하면 HelperException(E-STORE-FAILED).
/// </summary>
public sealed class RegistrationStore
{
    public const string FileName = "registration.dat";

    private readonly string directory;
    private readonly IProtector protector;

    public RegistrationStore(string directory, IProtector protector)
    {
        if (string.IsNullOrWhiteSpace(directory)) throw new ArgumentException("저장 폴더가 비었다", nameof(directory));
        this.directory = directory;
        this.protector = protector ?? throw new ArgumentNullException(nameof(protector));
    }

    public string FilePath => Path.Combine(directory, FileName);

    /// <summary>등록. 파일이 없거나 깨졌거나(다른 윈도우 사용자 것 등) 너무 크면 null.</summary>
    public HospitalRegistration? Load()
    {
        try
        {
            var file = new FileInfo(FilePath);
            if (!file.Exists || file.Length > RegistrationFile.MaxBytes) return null;
            return RegistrationFile.Read(File.ReadAllBytes(FilePath), protector);
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

    /// <summary>등록을 쓴다. 이미 있으면 바꿔 쓰고 전 파일을 registration.dat.bak으로 남긴다.</summary>
    public void Save(HospitalRegistration registration)
    {
        var data = RegistrationFile.Write(registration, protector);
        var temporary = FilePath + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            Directory.CreateDirectory(directory);
            try
            {
                using (var output = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                {
                    output.Write(data, 0, data.Length);
                    output.Flush(true);
                }
                if (File.Exists(FilePath)) File.Replace(temporary, FilePath, FilePath + ".bak");
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
    }
}
