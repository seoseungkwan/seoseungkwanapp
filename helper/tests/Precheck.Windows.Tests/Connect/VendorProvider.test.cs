using System;
using System.CodeDom.Compiler;
using System.Data.SqlClient;
using System.IO;
using System.Linq;
using System.Reflection;
using Microsoft.CSharp;
using Precheck.Core.Bit;
using Precheck.Windows;
using Xunit;

namespace Precheck.Windows.Tests.Connect;

/// <summary>
/// 가짜 비트 DLL(BITDataBaseCommon.dll)을 시험 때 임시 폴더에 만든다(진짜 비트 DLL·접속 정보는 쓰지 않는다).
/// BIT.DrBIT.Library.BITDataBaseCommon은 추상(abstract)이고 생성자(인자 하나)·bitGetConnection()은 protected다.
/// 도우미처럼 Assembly.LoadFrom으로 불러오고, VendorRuntime처럼 이름으로 이 DLL을 찾아 주는 AssemblyResolve를 둔다.
/// </summary>
public sealed class FakeVendorDll : IDisposable
{
    public const string Source = "Data Source=(local);Initial Catalog=DRBIT;User ID=synthetic;Password=synthetic";
    public const string WrongOwner = "Data Source=(local);Initial Catalog=OWNER-WAS-NOT-NULL;User ID=synthetic;Password=synthetic";
    public const string Secret = "synthetic-vendor-secret";

    // C# 5(.NET Framework csc)로 컴파일한다. 생성자가 받은 값이 null일 때만 맞는 접속 글자를 준다(base(null) 확인)
    private const string Code = @"
using System;
using System.Data.SqlClient;

namespace BIT.DrBIT.Library
{
    public abstract class BITDataBaseCommon
    {
        private readonly bool ownerWasNull;
        protected BITDataBaseCommon(object owner) { ownerWasNull = owner == null; }
        protected SqlConnection bitGetConnection() { return new SqlConnection(ownerWasNull ? """ + Source + @""" : """ + WrongOwner + @"""); }
    }
}

namespace Fake.Vendor
{
    public class ConcreteCommon
    {
        private readonly bool ownerWasNull;
        protected ConcreteCommon(string owner) { ownerWasNull = owner == null; }
        protected SqlConnection bitGetConnection() { return new SqlConnection(ownerWasNull ? """ + Source + @""" : """ + WrongOwner + @"""); }
    }

    public abstract class NoOwnerConstructor
    {
        protected NoOwnerConstructor(int value) { }
        protected SqlConnection bitGetConnection() { return new SqlConnection(""" + Source + @"""); }
    }

    public abstract class PrivateConstructor
    {
        private PrivateConstructor(object owner) { }
        protected SqlConnection bitGetConnection() { return new SqlConnection(""" + Source + @"""); }
    }

    public abstract class NoConnectionMethod
    {
        protected NoConnectionMethod(object owner) { }
    }

    public sealed class SealedCommon
    {
        public SealedCommon(object owner) { }
        private SqlConnection bitGetConnection() { return new SqlConnection(""" + Source + @"""); }
    }

    public abstract class ThrowingConstructor
    {
        protected ThrowingConstructor(object owner) { throw new InvalidOperationException(""" + Secret + @"""); }
        protected SqlConnection bitGetConnection() { return new SqlConnection(""" + Source + @"""); }
    }

    public abstract class ThrowingConnection
    {
        protected ThrowingConnection(object owner) { }
        protected SqlConnection bitGetConnection() { throw new InvalidOperationException(""" + Secret + @"""); }
    }
}
";

    private readonly string folder = Path.Combine(Path.GetTempPath(), "precheck-fake-bit-" + Guid.NewGuid().ToString("N"), "EXE");
    private readonly ResolveEventHandler resolve;

    public FakeVendorDll()
    {
        Directory.CreateDirectory(folder);
        var output = Path.Combine(folder, ReadOnlyConnection.VendorAssembly);
        using (var compiler = new CSharpCodeProvider())
        {
            var options = new CompilerParameters(new[] { "System.dll", "System.Data.dll" }, output)
            {
                GenerateExecutable = false,
                GenerateInMemory = false,
            };
            var results = compiler.CompileAssemblyFromSource(options, Code);
            Assert.False(results.Errors.HasErrors, string.Join("\n", results.Errors.Cast<CompilerError>().Select(e => e.ToString())));
        }
        Assembly = Assembly.LoadFrom(output);
        var name = Assembly.GetName().Name;
        resolve = (sender, e) => new AssemblyName(e.Name).Name == name ? Assembly : null;
        AppDomain.CurrentDomain.AssemblyResolve += resolve;
    }

    public Assembly Assembly { get; }

    public Type Get(string typeName) => Assembly.GetType(typeName, true)!;

    public void Dispose() => AppDomain.CurrentDomain.AssemblyResolve -= resolve;
}

/// <summary>
/// AC-005.2 비트 접속 정보 읽기. 원본 ReadOnlyConnection은 `Provider : BITDataBaseCommon { public Provider() : base(null) {} }`를
/// 만들어 protected bitGetConnection()을 불렀다. 도우미는 같은 물려받은 형을 실행할 때(System.Reflection.Emit) 만든다.
/// 예전 도우미(0.1.0)는 BITDataBaseCommon의 생성자를 바로 불러, 그 형이 추상이면 늘 E-BIT-DB-FAILED였다. 윈도우에서만 돈다.
/// </summary>
public sealed class VendorProviderTests : IClassFixture<FakeVendorDll>
{
    private const string Root = @"C:\DrBIT50";
    private readonly FakeVendorDll fake;

    public VendorProviderTests(FakeVendorDll fake) => this.fake = fake;

    [Fact(DisplayName = "AC-005.2 추상 BITDataBaseCommon(가짜 비트 DLL)도 원본 Provider처럼 물려받은 형으로 base(null) → protected bitGetConnection()의 접속 글자를 읽고 굳힌다")]
    public void ReadsFromAbstractVendorType()
    {
        var type = fake.Get(ReadOnlyConnection.VendorType);
        Assert.True(type.IsAbstract);

        var source = ReadOnlyConnection.VendorConnectionString(type);

        Assert.Equal(FakeVendorDll.Source, source);
        var info = ReadOnlyConnection.Harden(source, Root, "BITPC");
        var options = new SqlConnectionStringBuilder(info.ConnectionString);
        Assert.Equal(10, options.ConnectTimeout);
        Assert.False(options.PersistSecurityInfo);
        Assert.Equal("(local)", info.Target.Server);
        Assert.Equal("DRBIT", info.Target.Database);
    }

    [Fact(DisplayName = "AC-005.2 예전 길(추상 BITDataBaseCommon의 생성자를 바로 부르기)은 만들 수 없어 실패한다 — 0.1.0의 E-BIT-DB-FAILED")]
    public void OldDirectConstructionFailsOnAbstractType()
    {
        var type = fake.Get(ReadOnlyConnection.VendorType);
        var constructor = type.GetConstructors(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic).Single();

        Assert.ThrowsAny<MemberAccessException>(() => constructor.Invoke(new object?[] { null }));
    }

    [Fact(DisplayName = "AC-005.2 추상이 아닌 비트 형도 같은 길로 읽고, 물려받은 형은 비트 형마다 한 번만 만든다")]
    public void ReadsFromConcreteVendorTypeAndReusesSubclass()
    {
        var type = fake.Get("Fake.Vendor.ConcreteCommon");
        Assert.False(type.IsAbstract);

        Assert.Equal(FakeVendorDll.Source, ReadOnlyConnection.VendorConnectionString(type));

        var first = VendorProvider.Create(type);
        var second = VendorProvider.Create(type);
        Assert.NotSame(first, second);
        Assert.Same(first.GetType(), second.GetType());
        Assert.True(first.GetType().IsSubclassOf(type));
        Assert.Same(type, first.GetType().BaseType);
    }

    [Theory(DisplayName = "AC-005.2 물려받을 수 없거나(맞는 생성자 없음·private 생성자·sealed) bitGetConnection이 없거나 비트 코드가 던지면 E-BIT-DB-FAILED이고 비트 예외 글은 남기지 않는다")]
    [InlineData("Fake.Vendor.NoOwnerConstructor")]
    [InlineData("Fake.Vendor.PrivateConstructor")]
    [InlineData("Fake.Vendor.NoConnectionMethod")]
    [InlineData("Fake.Vendor.SealedCommon")]
    [InlineData("Fake.Vendor.ThrowingConstructor")]
    [InlineData("Fake.Vendor.ThrowingConnection")]
    public void RefusesUnusableVendorType(string typeName)
    {
        var type = fake.Get(typeName);

        var error = Assert.Throws<BitException>(() => ReadOnlyConnection.VendorConnectionString(type));

        Assert.Equal("E-BIT-DB-FAILED", error.Code);
        Assert.Null(error.InnerException);
        Assert.DoesNotContain(FakeVendorDll.Secret, error.ToString());
        Assert.DoesNotContain("synthetic", error.Message);
    }
}
