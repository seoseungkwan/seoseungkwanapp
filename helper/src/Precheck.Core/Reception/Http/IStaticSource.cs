using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;

namespace Precheck.Core.Reception.Http;

/// <summary>
/// 휴대폰 화면 파일 원천(design.md 7절): 도우미에 품어 둔 파일 이름과 바이트. 디스크 경로를 받지 않는다.
/// 이름은 품은 그대로다(Core csproj의 reception/… 이름, 윈도우 빌드는 '\'가 섞인다). StaticFiles가 '/'로 맞춘다.
/// </summary>
public interface IStaticSource
{
    /// <summary>품어 둔 이름 전부</summary>
    IEnumerable<string> Names { get; }

    /// <summary>그 이름의 바이트. 없으면 null</summary>
    byte[]? Read(string name);
}

/// <summary>어셈블리에 품은 파일(EmbeddedResource)을 원천으로 쓴다. 보통 Core(<see cref="Core"/>)가 품은 reception/… 파일이다.</summary>
public sealed class EmbeddedStaticSource : IStaticSource
{
    private readonly Assembly assembly;

    public EmbeddedStaticSource(Assembly assembly)
    {
        this.assembly = assembly ?? throw new ArgumentNullException(nameof(assembly));
    }

    /// <summary>Precheck.Core가 품은 화면 파일(reception/www/** → reception/…)</summary>
    public static EmbeddedStaticSource Core() => new EmbeddedStaticSource(typeof(EmbeddedStaticSource).Assembly);

    public IEnumerable<string> Names => assembly.GetManifestResourceNames();

    public byte[]? Read(string name)
    {
        if (name == null) return null;
        using var stream = assembly.GetManifestResourceStream(name);
        if (stream == null) return null;
        using var copy = new MemoryStream();
        stream.CopyTo(copy);
        return copy.ToArray();
    }
}
