using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Xml;
using System.Xml.Linq;

namespace Precheck.Core.Bit;

/// <summary>비트 통계 메뉴의 항목 하나: 메뉴 제목(권한표 UgaExeNam과 같은 글)과 보이는지.</summary>
public sealed class StatsMenuItem
{
    public StatsMenuItem(string title, bool visible)
    {
        Title = title;
        Visible = visible;
    }

    public string Title { get; }

    public bool Visible { get; }
}

/// <summary>
/// 비트 통계 메뉴 파일(ini\BITSTATISTICS.Xml) 읽기. 원본 Catalog.Read 그대로: id·href로 이어진 요소를 따라가
/// INCOME·PATIENT·CONSUME 묶음(PopupMenuTool)에 든 ButtonTool마다 키 → 제목(SharedProps.Caption)·숨김(SharedProps.Visible = false).
/// 파일 모양이 틀리면 E-BIT-EXPORT-FAILED.
/// </summary>
public static class StatsMenu
{
    private static readonly HashSet<string> Groups = new HashSet<string>(StringComparer.Ordinal) { "INCOME", "PATIENT", "CONSUME" };

    public static IReadOnlyDictionary<string, StatsMenuItem> Parse(byte[] xml)
    {
        try
        {
            return Read(Load(xml ?? throw new BitException(BitErrors.ExportFailed)));
        }
        catch (Exception e) when (e is XmlException || e is InvalidOperationException || e is ArgumentException || e is NullReferenceException)
        {
            // 파일 글자는 오류에 싣지 않는다
            throw new BitException(BitErrors.ExportFailed);
        }
    }

    private static XDocument Load(byte[] xml)
    {
        var settings = new XmlReaderSettings { DtdProcessing = DtdProcessing.Ignore, XmlResolver = null };
        using var stream = new MemoryStream(xml, false);
        using var reader = XmlReader.Create(stream, settings);
        return XDocument.Load(reader);
    }

    private static IReadOnlyDictionary<string, StatsMenuItem> Read(XDocument doc)
    {
        var nodes = doc.Descendants().Where(x => x.Attribute("id") != null).ToDictionary(x => (string)x.Attribute("id")!, StringComparer.Ordinal);
        XElement? Resolve(XElement? element)
        {
            if (element == null) return null;
            var href = (string?)element.Attribute("href");
            return href != null && nodes.TryGetValue(href.TrimStart('#'), out var target) ? target : element;
        }
        XElement? Child(XElement? element, string name) =>
            Resolve(element?.Elements().FirstOrDefault(x => x.Name.LocalName == name));
        string Text(XElement? element, string name) => Child(element, name)?.Value ?? "";

        var roots = doc.Descendants().First(x => x.Name.LocalName == "RootToolsCollection");
        var tools = roots.Elements().Where(x => x.Attribute("href") != null).Select(Resolve).Where(x => x != null).Select(x => x!).ToList();
        var categories = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var popup in tools.Where(x => x.Name.LocalName == "PopupMenuTool"))
        {
            var group = Text(popup, "Key");
            if (!Groups.Contains(group)) continue;
            var caption = Text(Child(popup, "SharedProps"), "Caption");
            var suffix = caption.IndexOf('(');
            if (suffix >= 0) caption = caption.Substring(0, suffix);
            var collection = Child(popup, "Tools");
            if (collection == null) continue;
            foreach (var item in collection.Elements().Where(x => x.Attribute("href") != null).Select(Resolve))
            {
                categories[Text(item, "Key")] = caption;
            }
        }

        var menu = new Dictionary<string, StatsMenuItem>(StringComparer.Ordinal);
        foreach (var tool in tools.Where(x => x.Name.LocalName == "ButtonTool"))
        {
            var key = Text(tool, "Key");
            if (!categories.ContainsKey(key) || menu.ContainsKey(key)) continue;
            var props = Child(tool, "SharedProps");
            var hidden = string.Equals(Text(props, "Visible"), "false", StringComparison.OrdinalIgnoreCase);
            menu[key] = new StatsMenuItem(Text(props, "Caption"), !hidden);
        }
        return menu;
    }
}

/// <summary>
/// 표를 읽기 전 확인(원본 NativeReportAdapter: HospitalSecurity.Authorize + CheckPermissions).
/// 비트 로그인 사용자의 병원 범위가 등록 범위와 같아야 하고(아니면 E-BIT-HOSPITAL-MISMATCH),
/// 읽을 화면마다 메뉴에 보이는 항목이 있고 그 제목에 권한(UgaExeLvl이 D가 아님)이 있어야 한다(아니면 E-BIT-EXPORT-FAILED).
/// </summary>
public static class StatsAccess
{
    public static void Check(IBitDb db, VendorUser user, string scope, IReadOnlyDictionary<string, StatsMenuItem> menu, IEnumerable<string> keys)
    {
        if (db == null) throw new ArgumentNullException(nameof(db));
        if (menu == null) throw new ArgumentNullException(nameof(menu));
        if (keys == null) throw new ArgumentNullException(nameof(keys));
        if (!string.Equals(HospitalCheck.ReadUserScope(db, user), scope, StringComparison.Ordinal)) throw new BitException(BitErrors.HospitalMismatch);

        var titles = new List<string>();
        foreach (var key in keys)
        {
            var permission = StatsScreens.Of(key).PermissionKey;
            if (!menu.TryGetValue(permission, out var item) || !item.Visible) throw new BitException(BitErrors.ExportFailed);
            titles.Add(item.Title);
        }

        var args = new Dictionary<string, object?>(StringComparer.Ordinal) { ["@user"] = user.UserId };
        var rows = ReadOnlyGuard.Query(db, Sql.UserPermissionsSql, args, Sql.MetaTimeout);
        foreach (var title in titles)
        {
            if (!rows.Any(row => Same(Cell(row, 0), title) && Cell(row, 1) != null && !Same(Cell(row, 1), "D"))) throw new BitException(BitErrors.ExportFailed);
        }
    }

    private static string? Cell(IReadOnlyList<object?> row, int index)
    {
        var value = row != null && row.Count > index ? row[index] : null;
        return value == null ? null : Convert.ToString(value, CultureInfo.InvariantCulture);
    }

    /// <summary>원본 DataTable.Select 글자 비교: 뒤 공백(반각·전각)을 빼고, 대소문자·가나·전각반각을 가리지 않는다. NULL은 어느 것과도 같지 않다.</summary>
    private static bool Same(string? left, string right) =>
        left != null && string.Compare(left.TrimEnd(' ', '　'), right.TrimEnd(' ', '　'), CultureInfo.InvariantCulture,
            CompareOptions.IgnoreCase | CompareOptions.IgnoreKanaType | CompareOptions.IgnoreWidth) == 0;
}
