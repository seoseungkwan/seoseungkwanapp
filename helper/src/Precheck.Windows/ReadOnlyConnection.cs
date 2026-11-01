using System;
using System.Collections.Generic;
using System.Data.SqlClient;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Reflection.Emit;
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

/// <summary>
/// 원본 ReadOnlyConnection.Provider를 실행할 때 만든다: `private sealed class Provider : BITDataBaseCommon { public Provider() : base(null) { } }`.
/// 원본은 빌드 때 비트 DLL을 참조해 물려받았고, 도우미는 비트 DLL 없이 빌드하므로 같은 물려받은 형을 System.Reflection.Emit으로 만든다.
/// 비트 형이 추상(abstract)이어도 된다(추상 형은 바로 만들 수 없지만 물려받은 형은 만들 수 있다. 0.1.0은 바로 만들어 E-BIT-DB-FAILED였다).
/// 만든 형은 비트 형마다 한 번만 만든다(동적 어셈블리는 내려놓지 못한다).
/// </summary>
public static class VendorProvider
{
    private static readonly object Sync = new object();
    /// <summary>비트 형 → 만든 형. 만들다 실패했으면 null(다시 부를 때마다 동적 어셈블리가 늘지 않게)</summary>
    private static readonly Dictionary<Type, Type?> Made = new Dictionary<Type, Type?>();

    /// <summary>vendorType을 물려받고 생성자에서 base(null)을 부르는 형의 새 개체. 물려받을 수 없으면 E-BIT-DB-FAILED.</summary>
    public static object Create(Type vendorType)
    {
        if (vendorType == null) throw new ArgumentNullException(nameof(vendorType));
        try
        {
            return Activator.CreateInstance(SubclassOf(vendorType))!;
        }
        catch (Exception e) when (!(e is BitException))
        {
            // 비트 생성자 안의 예외 글은 버린다(접속 정보가 섞일 수 있다)
            throw new BitException(BitErrors.DbFailed);
        }
    }

    private static Type SubclassOf(Type vendorType)
    {
        lock (Sync)
        {
            if (Made.TryGetValue(vendorType, out var made)) return made ?? throw new BitException(BitErrors.DbFailed);
            if (vendorType.IsSealed || vendorType.IsInterface || vendorType.IsGenericTypeDefinition) throw new BitException(BitErrors.DbFailed);
            var baseConstructor = NullOwnerConstructor(vendorType) ?? throw new BitException(BitErrors.DbFailed);

            var assembly = AssemblyBuilder.DefineDynamicAssembly(new AssemblyName("Precheck.VendorProvider"), AssemblyBuilderAccess.Run);
            var module = assembly.DefineDynamicModule("Precheck.VendorProvider");
            var builder = module.DefineType("Precheck.VendorProvider.Provider", TypeAttributes.Public | TypeAttributes.Sealed | TypeAttributes.Class, vendorType);
            var constructor = builder.DefineConstructor(
                MethodAttributes.Public | MethodAttributes.HideBySig | MethodAttributes.SpecialName | MethodAttributes.RTSpecialName,
                CallingConventions.Standard,
                Type.EmptyTypes);
            var il = constructor.GetILGenerator();
            il.Emit(OpCodes.Ldarg_0);
            il.Emit(OpCodes.Ldnull);
            il.Emit(OpCodes.Call, baseConstructor);
            il.Emit(OpCodes.Ret);

            try
            {
                made = builder.CreateType();
            }
            finally
            {
                Made[vendorType] = made;
            }
            return made ?? throw new BitException(BitErrors.DbFailed);
        }
    }

    /// <summary>
    /// 원본 `base(null)`이 고르는 생성자: 물려받은 형이 부를 수 있고(public·protected) 인자 하나가 null을 받는 것.
    /// 여럿이면 C#처럼 가장 좁은 인자 형(다른 모든 후보의 인자 형으로 바꿀 수 있는 것) 하나. 없거나 하나로 못 고르면 null.
    /// </summary>
    private static ConstructorInfo? NullOwnerConstructor(Type vendorType)
    {
        var candidates = vendorType.GetConstructors(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)
            .Where(c => c.IsPublic || c.IsFamily || c.IsFamilyOrAssembly)
            .Where(c =>
            {
                var parameters = c.GetParameters();
                if (parameters.Length != 1) return false;
                var type = parameters[0].ParameterType;
                return !type.IsValueType && !type.IsByRef && !type.IsPointer;
            })
            .ToList();
        var best = candidates
            .Where(c => candidates.All(other => other.GetParameters()[0].ParameterType.IsAssignableFrom(c.GetParameters()[0].ParameterType)))
            .ToList();
        return best.Count == 1 ? best[0] : null;
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

    /// <summary>설치 폴더 EXE의 비트 DLL에서 BITDataBaseCommon을 찾아 접속 글자를 읽는다.</summary>
    private static string VendorConnectionString(string installRoot)
    {
        Type type;
        try
        {
            type = VendorRuntime.Load(installRoot, VendorAssembly).GetType(VendorType, true)!;
        }
        catch (Exception e) when (!(e is BitException))
        {
            // 비트 DLL 안의 예외 글은 버린다(접속 정보가 섞일 수 있다)
            throw new BitException(BitErrors.DbFailed);
        }
        return VendorConnectionString(type);
    }

    /// <summary>
    /// 원본 Provider처럼 비트 형을 물려받은 개체(VendorProvider)로 protected bitGetConnection()을 불러 접속 글자를 받는다.
    /// 접속 글자(비밀번호 포함)는 돌려줄 뿐 어디에도 쓰지 않는다. 못 하면 E-BIT-DB-FAILED(비트 예외 글은 버린다).
    /// </summary>
    public static string VendorConnectionString(Type vendorType)
    {
        if (vendorType == null) throw new ArgumentNullException(nameof(vendorType));
        object? provider = null;
        try
        {
            provider = VendorProvider.Create(vendorType);
            const BindingFlags members = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;
            var method = vendorType.GetMethod("bitGetConnection", members, null, Type.EmptyTypes, null) ?? throw new BitException(BitErrors.DbFailed);
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
