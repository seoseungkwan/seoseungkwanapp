using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.ExceptionServices;
using System.Threading;
using System.Windows.Forms;
using Precheck.Core.Bit;

namespace Precheck.Windows;

/// <summary>
/// 비트 통계 화면 읽기(원본 NativeReportAdapter.Extract·SetDates·SetReportOptions·GuardNativeQuery). 설치 폴더 EXE의 통계 화면 DLL
/// (83·83D BITSSElectricData, 47 BITSDepOdrPatList)을 불러 화면을 숨긴 채(Show 하지 않음) 만들고, 불러오기 처리기 → 날짜 → 종류(83 증상·83D 상병내역)
/// → 조회 처리기를 부른 뒤 표(_cfgMain)를 Core GridReader로 읽는다. 비트 DLL은 함께 싣지 않고 의원 PC의 C:\DrBIT50\EXE에서 불러온다.
/// 화면 하나는 STA 스레드에서 돌고, 시간 제한을 넘기면 기다리지 않고 E-BIT-READ-FAILED. 조회 중 DB 오류가 보이면 E-BIT-READ-FAILED,
/// 화면·DLL·표 구성이 다르면 E-BIT-EXPORT-FAILED. 비트 안 예외의 글은 어디에도 남기지 않는다(환자 값이 섞일 수 있다).
/// </summary>
public sealed class VendorGridExport : IStatsScreens
{
    private const BindingFlags Members = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance;
    private const string StatisticsNamespace = "BIT.DrBIT.Statistics";

    public byte[] ReadMenu(string installPath)
    {
        try
        {
            var path = Path.Combine(installPath ?? throw Export(), StatsScreens.MenuFile);
            if (!File.Exists(path)) throw Export();
            return File.ReadAllBytes(path);
        }
        catch (Exception e) when (e is IOException || e is UnauthorizedAccessException || e is ArgumentException || e is NotSupportedException)
        {
            throw Export();
        }
    }

    public IReadOnlyList<IReadOnlyList<string>> Read(string installPath, VendorUser user, StatsScreen screen, DateTime from, DateTime to, TimeSpan timeout)
    {
        if (installPath == null || user == null || screen == null) throw Export();
        // 원본: 설치본에 통계 화면 DLL이 없으면 '필요한 DrBIT 통계 모듈 파일이 없습니다'(불러오기 전에 멈춘다)
        bool present;
        try
        {
            present = File.Exists(Path.Combine(installPath, "EXE", screen.Assembly));
        }
        catch (ArgumentException)
        {
            present = false;
        }
        if (!present) throw Export();
        return RunOnSta(() => Extract(installPath, user, screen, from.Date, to.Date), timeout);
    }

    /// <summary>
    /// work를 STA 스레드(ko-KR, 원본 통계 스레드와 같음)에서 돌린다. timeout 안에 끝나지 않으면 기다리지 않고 E-BIT-READ-FAILED
    /// (비트 화면 스레드는 뒤에서 끝난다). BitException은 그 번호로, 다른 예외는 글을 버리고 E-BIT-EXPORT-FAILED.
    /// </summary>
    public static T RunOnSta<T>(Func<T> work, TimeSpan timeout)
    {
        if (work == null) throw new ArgumentNullException(nameof(work));
        T result = default!;
        string? code = null;
        var thread = new Thread(() =>
        {
            Thread.CurrentThread.CurrentCulture = CultureInfo.GetCultureInfo("ko-KR");
            Thread.CurrentThread.CurrentUICulture = CultureInfo.GetCultureInfo("ko-KR");
            try
            {
                result = work();
            }
            catch (BitException e)
            {
                code = e.Code;
            }
            catch (Exception)
            {
                code = BitErrors.ExportFailed;
            }
        })
        {
            IsBackground = true,
            Name = "Precheck statistics screen",
        };
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        if (!thread.Join(timeout)) throw new BitException(BitErrors.ReadFailed);
        if (code != null) throw new BitException(code);
        return result;
    }

    private static IReadOnlyList<IReadOnlyList<string>> Extract(string root, VendorUser user, StatsScreen screen, DateTime from, DateTime to)
    {
        object? module = null;
        Form? form = null;
        try
        {
            var assembly = VendorRuntime.Load(root, screen.Assembly);
            var moduleType = assembly.GetType(screen.Module, true)!;
            module = Activator.CreateInstance(moduleType, new object[] { user.WorkDate, user.UserId });
            var formType = assembly.GetType(screen.Form, true)!;
            var constructor = formType.GetConstructors(Members).FirstOrDefault(x =>
            {
                var p = x.GetParameters();
                return (p.Length == 3 || p.Length == 4) && p[0].ParameterType == typeof(string) && p[1].ParameterType == typeof(string) &&
                    (p[2].ParameterType.IsByRef ? p[2].ParameterType.GetElementType() : p[2].ParameterType) == moduleType;
            }) ?? throw Export();
            var args = new List<object?> { user.WorkDate, user.UserId, module };
            if (constructor.GetParameters().Length == 4)
            {
                var commonType = constructor.GetParameters()[3].ParameterType;
                var commonField = moduleType.GetFields(Members).FirstOrDefault(x => x.FieldType == commonType);
                args.Add(commonField == null ? Activator.CreateInstance(commonType) : commonField.GetValue(module));
            }
            form = (Form)constructor.Invoke(args.ToArray());
            // 원본: bitDisplayDialog가 하던 대입만 따라 하고 Show()는 하지 않는다
            foreach (var field in moduleType.GetFields(Members).Where(x => x.FieldType == formType)) field.SetValue(module, form);
            form.ShowInTaskbar = false;
            form.CreateControl();
            if (!string.IsNullOrEmpty(screen.Load)) Invoke(form, screen.Load, form, EventArgs.Empty);
            SetDates(form, screen, from, to);
            SetKind(form, screen);
            var shown = form;
            GuardNativeQuery(() =>
            {
                if (screen.Query.EndsWith("_Click", StringComparison.Ordinal)) Invoke(shown, screen.Query, shown, EventArgs.Empty);
                else Invoke(shown, screen.Query);
            });
            var hasData = form.GetType().GetMethods(Members).FirstOrDefault(x => x.Name == "bitHasData" && x.ReturnType == typeof(bool) && x.GetParameters().Length == 0);
            // 원본은 '조회된 데이터가 없습니다'로 멈췄다. 우리는 빈 표를 넘기고 모양 만들기(Worker)가 판단한다(83D는 원본처럼 없어도 된다, AC-009.4)
            if (hasData != null && !(bool)hasData.Invoke(form, null)!) return new List<IReadOnlyList<string>>();
            var grid = Field(form, screen.Grid) ?? throw Export();
            return GridReader.Read(grid, Thread.CurrentThread.CurrentCulture);
        }
        finally
        {
            form?.Dispose();
            (module as IDisposable)?.Dispose();
        }
    }

    private static void SetDates(Form form, StatsScreen screen, DateTime from, DateTime to)
    {
        var first = Field(form, screen.Start) as DateTimePicker ?? throw Export();
        first.Value = from;
        var last = Field(form, screen.End) as DateTimePicker ?? throw Export();
        last.Value = to.AddHours(23).AddMinutes(59);
    }

    /// <summary>원본 SetReportOptions: 전산자료 추출통계의 종류 칸에서 보이는 글이 '증상'·'상병내역'인 항목을 고른다(번호를 넘겨짚지 않음).</summary>
    private static void SetKind(Form form, StatsScreen screen)
    {
        if (screen.Kind == null) return;
        var kind = Field(form, StatsScreens.KindField) as ComboBox ?? throw Export();
        for (var index = 0; index < kind.Items.Count; index++)
        {
            if (!string.Equals(kind.GetItemText(kind.Items[index]).Trim(), screen.Kind, StringComparison.Ordinal)) continue;
            kind.SelectedIndex = index;
            if (kind.SelectedIndex == index && string.Equals(kind.Text.Trim(), screen.Kind, StringComparison.Ordinal)) return;
            break;
        }
        throw Export();
    }

    /// <summary>
    /// 원본 GuardNativeQuery: 조회하는 동안 이 스레드에서 DB 오류(SqlException·DataException)나 통계 코드 안의 실행 오류가 한 번이라도 나면
    /// 비트가 잡아 넘겼어도 불완전한 결과로 보고 E-BIT-READ-FAILED.
    /// </summary>
    private static void GuardNativeQuery(Action query)
    {
        var threadId = Thread.CurrentThread.ManagedThreadId;
        var dataError = false;
        EventHandler<FirstChanceExceptionEventArgs> handler = (sender, e) =>
        {
            if (Thread.CurrentThread.ManagedThreadId != threadId) return;
            var error = e.Exception;
            var origin = error.TargetSite?.DeclaringType;
            var reportOrigin = origin != null && origin.Namespace == StatisticsNamespace;
            if (error is SqlException || error is DataException || (reportOrigin &&
                (error is NullReferenceException || error is IndexOutOfRangeException || error is InvalidOperationException || error is ArithmeticException)))
            {
                dataError = true;
            }
        };
        AppDomain.CurrentDomain.FirstChanceException += handler;
        try
        {
            query();
        }
        finally
        {
            AppDomain.CurrentDomain.FirstChanceException -= handler;
        }
        if (dataError) throw new BitException(BitErrors.ReadFailed);
    }

    private static object? Field(object target, string name)
    {
        if (string.IsNullOrEmpty(name)) return null;
        return target.GetType().GetField(name, Members)?.GetValue(target);
    }

    private static object? Invoke(object target, string methodName, params object[] args)
    {
        var method = target.GetType().GetMethods(Members).FirstOrDefault(x => x.Name == methodName && x.GetParameters().Length == args.Length) ?? throw Export();
        return method.Invoke(target, args);
    }

    private static BitException Export() => new BitException(BitErrors.ExportFailed);
}
