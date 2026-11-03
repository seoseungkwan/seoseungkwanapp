using System;

namespace Precheck.Core.Store;

/// <summary>작업 저장 폴더. 도우미는 %LOCALAPPDATA%\Seoseungkwan\PrecheckHelper\data\(design.md 9-3), 시험은 임시 폴더.</summary>
public interface IStoreFolder
{
    string Path { get; }
}

/// <summary>정해 둔 경로 하나를 그대로 돌려주는 폴더.</summary>
public sealed class StoreFolder : IStoreFolder
{
    public StoreFolder(string path)
    {
        if (string.IsNullOrWhiteSpace(path)) throw new ArgumentException("저장 폴더가 비었다", nameof(path));
        Path = path;
    }

    public string Path { get; }
}
