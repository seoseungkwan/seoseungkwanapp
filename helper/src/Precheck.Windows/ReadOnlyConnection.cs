using System;
using System.Collections.Generic;
using System.Data.SqlClient;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using Precheck.Core.Bit;

namespace Precheck.Windows;

/// <summary>
/// 비트 DLL을 불러 쓸 준비(원본 Program.InstallResolver + SetDllDirectory + 현재 폴더 = EXE).
/// 비트 DLL은 도우미와 함께 싣지 않고 의원 PC의 설치 폴더에서 실행할 때 불러온다(design.md 14절).
/// 한 프로세스에서는 처음 고른 설치 하나만 쓴다.
/// </summary>
public static class VendorRuntime
{
    private static readonly object Sync = new object();
    private static string? preparedExe;

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetDllDirectory(string path);

    /// <summary>설치 폴더의 EXE에서 비트 어셈블리를 찾게 한다. 이미 다른 설치로 준비했으면 E-BIT-NOT-FOUND.</summary>
    public static void Prepare(string installRoot)
    {
        var exe = Path.Combine(installRoot, "EXE");
        lock (Sync)
        {
            if (preparedExe != null)
            {
                if (!string.Equals(preparedExe, exe, StringComparison.OrdinalIgnoreCase)) throw new BitException(BitErrors.NotFound);
                return;
            }
            AppDomain.CurrentDomain.AssemblyResolve += (sender, e) => Resolve(exe, e);
            if (!SetDllDirectory(exe)) throw new BitException(BitErrors.NotFound);
            Directory.SetCurrentDirectory(exe);
            preparedExe = exe;
        }
    }

    /// <summary>설치 폴더 EXE의 비트 어셈블리 하나를 불러온다.</summary>
    public static Assembly Load(string installRoot, string fileName)
    {
        Prepare(installRoot);
        return Assembly.LoadFrom(Path.Combine(installRoot, "EXE", fileName));
    }

    private static Assembly? Resolve(string exe, ResolveEventArgs e)
    {
        var name = new AssemblyName(e.Name).Name ?? "";
        if (name.EndsWith(".resources", StringComparison.OrdinalIgnoreCase)) return null;
        foreach (var extension in new[] { ".dll", ".exe" })
        {
            var candidate = Path.Combine(exe, name + extension);
            if (File.Exists(candidate)) return Assembly.LoadFrom(candidate);
        }
        return null;
    }
}

/// <summary>굳힌 접속 글자와 붙을 대상. 접속 글자(비밀번호 포함)는 메모리에만 있고 어디에도 쓰지 않는다.</summary>
public sealed class ReadOnlyConnectionInfo
{
    public ReadOnlyConnectionInfo(string connectionString, BitTarget target)
    {
        ConnectionString = connectionString;
        Target = target;
    }

    public string ConnectionString { get; }

    public BitTarget Target { get; }
}

/// <summary>
/// 원본 ReadOnlyConnection: 설치된 비트의 접속 설정(BITDataBaseCommon.bitGetConnection)만 다시 쓴다.
/// ConnectTimeout=10·PersistSecurityInfo=false로 굳히고, 서버가 이 PC·사설 IP가 아니면 붙기 전에 막는다(AC-005.2).
/// 읽기 전용은 앱의 약속이다(SQL 계정 권한이 아니다): 읽기는 SqlBitDb가 ReadOnlyGuard → 매개변수 → 되돌리는 트랜잭션으로만 한다.
/// </summary>
public static class ReadOnlyConnection
{
    public const string VendorAssembly = "BITDataBaseCommon.dll";
    public const string VendorType = "BIT.DrBIT.Library.BITDataBaseCommon";
    public const string ApplicationName = "Seoseungkwan PrecheckHelper";

    /// <summary>비트 DLL의 접속 정보로 굳힌 접속을 만든다. 비트 DLL을 못 쓰거나 서버가 막히면 E-BIT-DB-FAILED.</summary>
    public static ReadOnlyConnectionInfo Create(string installRoot) =>
        Harden(VendorConnectionString(installRoot), installRoot, Environment.MachineName);

    /// <summary>접속 글자를 굳힌다(시험이 부르는 순수 부분).</summary>
    public static ReadOnlyConnectionInfo Harden(string sourceConnectionString, string installRoot, string machineName)
    {
        SqlConnectionStringBuilder options;
        try
        {
            options = new SqlConnectionStringBuilder(sourceConnectionString);
        }
        catch (Exception e) when (e is ArgumentException || e is KeyNotFoundException || e is FormatException || e is InvalidOperationException)
        {
            throw new BitException(BitErrors.DbFailed);
        }
        options.ConnectTimeout = Sql.ConnectTimeoutSeconds;
        options.ApplicationName = ApplicationName;
        options.PersistSecurityInfo = false;
        PrivateServer.Require(options.DataSource, machineName);
        if (string.IsNullOrWhiteSpace(options.InitialCatalog)) throw new BitException(BitErrors.DbFailed);
        return new ReadOnlyConnectionInfo(options.ConnectionString, new BitTarget(installRoot, options.DataSource, options.InitialCatalog));
    }

    /// <summary>
    /// 원본은 BITDataBaseCommon을 물려받아 protected bitGetConnection()을 불렀다(빌드 때 비트 DLL 참조).
    /// 도우미는 비트 DLL 없이 빌드하므로 실행할 때 리플렉션으로 같은 것을 부른다: 생성자(인자 하나, null) → bitGetConnection().
    /// </summary>
    private static string VendorConnectionString(string installRoot)
    {
        object? provider = null;
        try
        {
            var type = VendorRuntime.Load(installRoot, VendorAssembly).GetType(VendorType, true)!;
            const BindingFlags members = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;
            var constructor = type.GetConstructors(members)
                .FirstOrDefault(c => c.GetParameters().Length == 1 && !c.GetParameters()[0].ParameterType.IsValueType)
                ?? throw new BitException(BitErrors.DbFailed);
            provider = constructor.Invoke(new object?[] { null });
            var method = type.GetMethod("bitGetConnection", members, null, Type.EmptyTypes, null) ?? throw new BitException(BitErrors.DbFailed);
            using var source = method.Invoke(provider, null) as SqlConnection ?? throw new BitException(BitErrors.DbFailed);
            return source.ConnectionString;
        }
        catch (Exception e) when (!(e is BitException))
        {
            // 비트 DLL 안의 예외 글은 버린다(접속 정보가 섞일 수 있다)
            throw new BitException(BitErrors.DbFailed);
        }
        finally
        {
            (provider as IDisposable)?.Dispose();
        }
    }

    internal static int Seconds(TimeSpan timeout) =>
        (int)Math.Max(1, Math.Min(int.MaxValue, Math.Ceiling(timeout.TotalSeconds)));

    internal static string Invariant(object value) => Convert.ToString(value, CultureInfo.InvariantCulture) ?? "";
}
