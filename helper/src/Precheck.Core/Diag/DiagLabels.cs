using System;
using System.Collections.Generic;
using Precheck.Core.Bit;
using Precheck.Core.Revenue;
using Precheck.Core.Stats;

namespace Precheck.Core.Diag;

/// <summary>
/// 보고서에 적는 문장 이름 표. 이름은 상수 이름에서만 나온다: 매개변수 값이나 SQL 글자로 이름을 만들지 않는다.
/// StatsSql과 RevenueSql에 글자가 같은 문장은 먼저 넣은 이름 하나로 합친다.
/// </summary>
public static class DiagLabels
{
    public const string Unknown = "?";

    private static readonly Dictionary<string, string> Names = Build();

    public static string Of(string? sql) => sql != null && Names.TryGetValue(sql, out var name) ? name : Unknown;

    private static Dictionary<string, string> Build()
    {
        var names = new Dictionary<string, string>(StringComparer.Ordinal);
        void Add(string sql, string name)
        {
            if (!names.ContainsKey(sql)) names.Add(sql, name);
        }

        Add(Sql.UserScopeSql, "Sql.UserScopeSql");
        Add(Sql.ScopesSql, "Sql.ScopesSql");
        Add(Sql.InstitutionSql, "Sql.InstitutionSql");
        Add(Sql.SnapshotStateSql, "Sql.SnapshotStateSql");

        Add(StatsSql.HistoryGuardSql, "StatsSql.HistoryGuardSql");
        Add(StatsSql.VisitRowsSql, "StatsSql.VisitRowsSql");
        Add(StatsSql.PatientDaysSql, "StatsSql.PatientDaysSql");
        Add(StatsSql.VisitSummarySql, "StatsSql.VisitSummarySql");
        Add(StatsSql.VisitDaysSql, "StatsSql.VisitDaysSql");
        Add(StatsSql.CodeNamesSql, "StatsSql.CodeNamesSql");
        Add(StatsSql.UnsupportedFinanceSql, "StatsSql.UnsupportedFinanceSql");
        Add(StatsSql.PatientsSql, "StatsSql.PatientsSql");
        Add(StatsSql.TreatmentsSql, "StatsSql.TreatmentsSql");
        Add(StatsSql.LaCodesSql, "StatsSql.LaCodesSql");
        Add(StatsSql.FinanceNormalSql, "StatsSql.FinanceNormalSql");
        Add(StatsSql.FinanceReceivableSql, "StatsSql.FinanceReceivableSql");
        Add(StatsSql.FinanceMultiplicitySql, "StatsSql.FinanceMultiplicitySql");
        Add(StatsSql.ReceivableMultiplicitySql, "StatsSql.ReceivableMultiplicitySql");

        Add(RevenueSql.HistoryGuard, "RevenueSql.HistoryGuard");
        Add(RevenueSql.UnsupportedFinance, "RevenueSql.UnsupportedFinance");
        Add(RevenueSql.FinanceMultiplicity, "RevenueSql.FinanceMultiplicity");
        Add(RevenueSql.ReceivableMultiplicity, "RevenueSql.ReceivableMultiplicity");
        Add(RevenueSql.FinanceNormal, "RevenueSql.FinanceNormal");
        Add(RevenueSql.FinanceReceivable, "RevenueSql.FinanceReceivable");
        Add(RevenueSql.Patients, "RevenueSql.Patients");
        Add(RevenueSql.CodeAmounts, "RevenueSql.CodeAmounts");
        Add(RevenueSql.FinanceNormalExtra, "RevenueSql.FinanceNormalExtra");
        Add(RevenueSql.FinanceReceivableExtra, "RevenueSql.FinanceReceivableExtra");

        Add(DiagSql.ServerInfo, "Diag.ServerInfo");
        Add(DiagSql.DatabaseInfo, "Diag.DatabaseInfo");
        Add(DiagSql.SessionIsolation, "Diag.SessionIsolation");
        Add(DiagSql.Permissions, "Diag.Permissions");
        Add(DiagSql.Cpu, "Diag.Cpu");
        Add(DiagSql.Memory, "Diag.Memory");
        Add(DiagSql.Configurations, "Diag.Configurations");
        Add(DiagSql.TableRows, "Diag.TableRows");
        Add(DiagSql.ColumnTypes, "Diag.ColumnTypes");
        Add(DiagSql.Indexes, "Diag.Indexes");
        Add(DiagSql.Blocking, "Diag.Blocking");
        Add(DiagSql.SessionCost, "Diag.SessionCost");
        Add(DiagSql.SessionWaits, "Diag.SessionWaits");
        Add(DiagSql.PeriodVisitsCount, "PeriodVisits");
        Add(DiagSql.FirstVisitsAsWritten, "FirstVisits-as-written");
        Add(DiagSql.FirstVisitsPlainJoin, "FirstVisits-plain-join");
        Add(DiagSql.OrdersCount, "Orders");
        return names;
    }
}
