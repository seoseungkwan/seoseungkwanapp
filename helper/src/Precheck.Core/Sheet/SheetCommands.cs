using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using Precheck.Core.Protocol;
using Precheck.Core.Registration;

namespace Precheck.Core.Sheet;

/// <summary>
/// 도우미 0.14.0 수납 명령 여덟(spec google-link TASK-10, design.md 9-2). 모두 환자 자료가 아닌 명령이라 답은 result 하나(숫자·표시만)다.
/// - 비밀 글자·코드 주소·함께 쓸 메일은 이 PC sheet.dat에만 둔다. 주소·메일은 이 PC 확인 창 [바꾸기]로만 바뀌고(sheet.link),
///   sheet.ping·months·fill은 늘 sheet.dat 주소·메일로만 보낸다(웹이 준 주소 열쇠는 설정 읽기에서 거절).
/// - 주소를 바꿨거나 비밀 글자를 새로 만든 뒤(verified 거짓)에는 hello mac이 맞아야 token·환자 줄을 보낸다.
/// - 비트는 읽기만(HospitalGate·SheetSql 허용 목록). 넣기 시간 한도: 비트 20초 · 구글 45초 · 전체 60초.
/// - 기록은 Dispatcher가 (명령 이름, 오류 번호)만 남긴다. 오류는 번호만(SheetException·BitException).
/// </summary>
public static class SheetCommands
{
    public const string Status = "sheet.status";
    public const string Code = "sheet.code";
    public const string Link = "sheet.link";
    public const string Import = "sheet.import";
    public const string Ping = "sheet.ping";
    public const string Catalog = "sheet.catalog";
    public const string Months = "sheet.months";
    public const string Fill = "sheet.fill";

    /// <summary>sheet.fill 날짜: 한국 오늘 − 62일 ~ 오늘.</summary>
    public const int FillBackDays = 62;

    public static void Register(Dispatcher dispatcher, SheetServices services)
    {
        if (dispatcher == null) throw new ArgumentNullException(nameof(dispatcher));
        if (services == null) throw new ArgumentNullException(nameof(services));
        dispatcher.Register(Status, (request, sink) => sink.Send(Envelope.Result(request.Id, StatusOf(services))));
        dispatcher.Register(Code, (request, sink) => sink.Send(Envelope.Result(request.Id, NewCode(services))));
        dispatcher.Register(Link, (request, sink) => sink.Send(Envelope.Result(request.Id, LinkTo(services, request.Args))));
        dispatcher.Register(Import, (request, sink) => sink.Send(Envelope.Result(request.Id, ImportBitSheet(services))));
        dispatcher.Register(Ping, (request, sink) => sink.Send(Envelope.Result(request.Id, PingOf(services, request.Args))));
        dispatcher.Register(Catalog, (request, sink) => sink.Send(Envelope.Result(request.Id, CatalogOf(services, request.Args))));
        dispatcher.Register(Months, (request, sink) => sink.Send(Envelope.Result(request.Id, MonthsOf(services, request.Args))));
        dispatcher.Register(Fill, (request, sink) => sink.Send(Envelope.Result(request.Id, FillDay(services, request.Args))));
    }

    // ── sheet.status ──────────────────────────────────────────

    private static object StatusOf(SheetServices s)
    {
        var state = s.Store.Load();
        var has = state.HasSecret;
        return new
        {
            v = 1,
            secretTag = has ? SheetCode.Tag(state.Secret!) : null,
            bitsheet = s.HasBitSheet(),
            codeVersion = WebAppClient.CodeVersion,
            url = has ? state.Url : null,
            shareWith = has ? state.ShareWith.ToArray() : new string[0],
            verified = has && state.Verified,
        };
    }

    // ── sheet.code ────────────────────────────────────────────

    private static object NewCode(SheetServices s)
    {
        var template = s.Code() ?? throw new SheetException(SheetErrors.Failed);
        var secret = s.Secret();
        var code = SheetCode.Inject(template, secret);
        var state = s.Store.Load();
        // 클립보드 먼저: 못 넣으면 쓰던 비밀 글자·주소·확인 표시를 그대로 둔다(새 코드를 붙여 넣을 수 없으니 바꾸지 않는다)
        s.Clipboard.SetText(code);
        state.Secret = secret;
        state.Verified = false;
        state.Print = null;
        s.Store.Save(state);
        return new { v = 1, secretTag = SheetCode.Tag(secret), codeVersion = WebAppClient.CodeVersion };
    }

    // ── sheet.link ────────────────────────────────────────────

    private static object LinkTo(SheetServices s, JsonElement args)
    {
        var url = args.GetProperty("url").GetString() ?? "";
        var mails = args.GetProperty("shareWith").EnumerateArray().Select(m => m.GetString() ?? "").ToList();
        if (!SheetUrls.IsScriptUrl(url)) throw new SheetException(SheetErrors.Url);
        var state = s.Store.Load();
        if (!state.HasSecret) throw new SheetException(SheetErrors.Secret);
        if (string.Equals(state.Url, url, StringComparison.Ordinal) && state.ShareWith.SequenceEqual(mails, StringComparer.Ordinal))
        {
            return new { v = 1, ok = true, same = true };
        }
        if (!s.Confirm.Show(SheetPrompt.Text(url, mails), SheetPrompt.Timeout)) throw new SheetException(SheetErrors.Declined);

        // 창이 떠 있는 동안 다른 도우미가 지문을 적었을 수 있어 다시 읽고 그 위에 적는다
        var fresh = s.Store.Load();
        if (!fresh.HasSecret) throw new SheetException(SheetErrors.Secret);
        var moved = !string.Equals(fresh.Url, url, StringComparison.Ordinal);
        if (moved || !fresh.Verified)
        {
            var google = new SheetDeadline(s.Clock, SheetDeadline.Google);
            SheetHello.Verify(Client(s, google), url, fresh.Secret!, s.Nonce());
        }
        fresh.Url = url;
        fresh.ShareWith = mails;
        fresh.Verified = true;
        if (moved) fresh.Print = null;
        s.Store.Save(fresh);
        return new { v = 1, ok = true };
    }

    // ── sheet.import ──────────────────────────────────────────

    private static object ImportBitSheet(SheetServices s)
    {
        var imported = s.ImportBitSheet() ?? throw new SheetException(SheetErrors.Secret);
        var state = s.Store.Load();
        state.Secret = imported.Secret;
        state.Url = imported.Url.Length > 0 ? imported.Url : null;
        state.ShareWith = imported.ShareWith.ToList();
        // 7판 코드는 hello를 몰라 확인할 수 없다 — 그 PC 자기 파일에서 옮긴 것이라 믿는다(design.md 9-2)
        state.Verified = true;
        state.Print = null;
        s.Store.Save(state);
        using var settings = JsonDocument.Parse(imported.SettingsJson);
        return new { v = 1, secretTag = imported.SecretTag, settings = settings.RootElement.Clone() };
    }

    // ── sheet.ping ────────────────────────────────────────────

    private static object PingOf(SheetServices s, JsonElement args)
    {
        var settings = SheetSettingsJson.FromElement(args.GetProperty("settings"));
        try
        {
            var state = Ready(s, settings);
            var google = new SheetDeadline(s.Clock, SheetDeadline.Google);
            var client = Client(s, google);
            state = Verified(s, client, state);
            var reply = client.Call(state.Url, SheetPayload.Ping(settings, state.Secret!, "", s.Bit.Today().Date));
            return new { v = 1, ok = true, templateTitle = reply.TemplateTitle, version = VersionOf(reply) };
        }
        catch (SheetException e)
        {
            return new { v = 1, ok = false, code = e.Code };
        }
    }

    // ── sheet.catalog ─────────────────────────────────────────

    private static object CatalogOf(SheetServices s, JsonElement args)
    {
        var pick = args.TryGetProperty("hospital", out var h) ? h.GetString() ?? "" : "";
        var today = s.Bit.Today().Date;
        using var hospital = HospitalGate.Open(s.Bit);
        var db = hospital.Db;
        var hospitals = BitCatalog.Hospitals(db, today);
        var settings = new Settings { HospitalCode = pick };
        var name = "";
        var depts = new List<DeptInfo>();
        var rx = new List<CodeUsage>();
        try
        {
            settings.HospitalCode = SheetBitSource.ResolveHospital(db, settings, today, out name);
            depts = BitCatalog.Departments(db, settings, today);
            rx = BitCatalog.RecentCodes(db, settings, today);
        }
        catch (ManyHospitalsException)
        {
            // 비트에 병원이 여럿이고 저절로 고를 수 없다 — 병원 목록만 주고 사람이 고른다(다시 부를 때 hospital)
        }
        return new
        {
            v = 1,
            hospitals = hospitals.Select(o => new { code = o.Code, name = o.Name, recent = o.Visits }).ToArray(),
            depts = depts.Select(d => new { code = d.Code, name = d.Name, n90 = d.Visits90, today = d.Current }).ToArray(),
            rx = rx.Select(c => new { code = c.Code, name = c.Name, cls = ClassOf(c.Kind), n90 = c.Visits }).ToArray(),
            hospitalName = name,
        };
    }

    /// <summary>처방 기본 분류 → 웹 설정 칸 이름(blockCodes·therapyCodes): 주사 → block, 물리치료 → therapy, 그 밖 "".</summary>
    private static string ClassOf(string kind) =>
        kind == OrderKind.Injection ? "block" : kind == OrderKind.Therapy ? "therapy" : "";

    // ── sheet.months ──────────────────────────────────────────

    private static object MonthsOf(SheetServices s, JsonElement args)
    {
        var settings = SheetSettingsJson.FromElement(args.GetProperty("settings"));
        var months = args.GetProperty("months").EnumerateArray().Select(m => m.GetString() ?? "").ToList();
        var state = Ready(s, settings);
        var name = settings.HospitalName.Length > 0 ? settings.HospitalName : BitHospitalName(s, settings);
        var names = months.Select(ym => (object)new Dictionary<string, object>
        {
            ["ym"] = ym,
            ["fileName"] = SheetPayload.FileName(settings.FileNamePattern, name, DateTime.ParseExact(ym + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture)),
        }).ToList();
        var request = new Dictionary<string, object>
        {
            ["token"] = state.Secret!,
            ["action"] = "months",
            ["month"] = new Dictionary<string, object>
            {
                ["templateId"] = GoogleIds.Spreadsheet(settings.TemplateUrl),
                ["folderId"] = GoogleIds.Folder(settings.FolderUrl),
            },
            ["names"] = names,
        };
        var google = new SheetDeadline(s.Clock, SheetDeadline.Google);
        var client = Client(s, google);
        state = Verified(s, client, state);
        var reply = client.Call(state.Url, request);
        return new
        {
            v = 1,
            version = VersionOf(reply),
            months = months.Select(ym =>
            {
                var hit = reply.Months.FirstOrDefault(m => m.Ym == ym);
                return new
                {
                    ym,
                    fileId = hit != null && hit.FileId.Length > 0 ? hit.FileId : null,
                    gids = hit == null ? new Dictionary<string, long>() : hit.Gids.ToDictionary(g => g.Key.ToString(CultureInfo.InvariantCulture), g => g.Value),
                };
            }).ToArray(),
        };
    }

    private static string BitHospitalName(SheetServices s, Settings settings)
    {
        using var hospital = HospitalGate.Open(s.Bit);
        return BitCatalog.HospitalName(hospital.Db, settings, s.Bit.Today().Date);
    }

    // ── sheet.fill ────────────────────────────────────────────

    private static object FillDay(SheetServices s, JsonElement args)
    {
        var start = s.Clock();
        var today = s.Bit.Today().Date;
        if (!FieldSpec.TryParseDate(args.GetProperty("day").GetString(), out var day)) throw Bad();
        var mode = args.GetProperty("mode").GetString() ?? "";
        var auto = args.GetProperty("auto").GetBoolean();
        if (auto && mode == SheetPayload.Overwrite) throw Bad(); // 덮어쓰기는 손으로만
        if (day < today.AddDays(-FillBackDays) || day > today) throw Bad();
        var settings = SheetSettingsJson.FromElement(args.GetProperty("settings"));
        var state = Ready(s, settings);

        // 비트 읽기(20초): 읽기만, 다 읽으면 구글에 보내기 전에 닫는다
        var bit = new SheetDeadline(s.Clock, SheetDeadline.Bit);
        DayRows rows;
        string hospitalName;
        try
        {
            using var hospital = HospitalGate.Open(s.Bit);
            bit.Check();
            var source = new SheetBitSource(new BudgetDb(hospital.Db, bit), settings, today);
            rows = RowBuilder.Build(source.Read(day), settings);
            hospitalName = source.HospitalName;
        }
        catch (HelperException e) when (!(e is SheetException) && bit.Left <= TimeSpan.Zero)
        {
            throw new SheetException(SheetErrors.Timeout);
        }

        var request = SheetPayload.Write(rows, settings, state.Secret!, mode, hospitalName);
        var print = RowsPrint.Of(rows, request);
        if (auto && print.Same(state.Print)) return new { v = 1, unchanged = true, rows = print.Rows };

        // 구글(45초, 전체 60초 안)
        var left = SheetDeadline.Total - (s.Clock() - start);
        var google = new SheetDeadline(s.Clock, left < SheetDeadline.Google ? left : SheetDeadline.Google);
        google.Check();
        var client = Client(s, google);
        state = Verified(s, client, state);
        var reply = client.Call(state.Url, request);

        if (day == today)
        {
            var after = s.Store.Load();
            after.Print = print;
            s.Store.Save(after);
        }
        var stats = DayStats.Of(rows);
        return new
        {
            v = 1,
            rows = print.Rows,
            patients = stats.Patients,
            added = reply.Added,
            filled = reply.Filled,
            overwritten = reply.Overwritten,
            skipped = reply.Skipped,
            cancelCleared = reply.CancelCleared,
            cancelKept = reply.CancelKept,
            freeFixed = reply.FreeFixed,
            inserted = reply.Inserted,
            cleaned = reply.Cleaned,
            shareFailed = reply.ShareFailed,
            ratioFixed = reply.RatioFixed,
            ratioSkippedCount = reply.RatioSkipped,
            split = stats.SplitPatients,
            free = stats.Free,
            paidOnly = stats.PaidOnly,
            notes = stats.CarNote + stats.HealthFundNote,
            full = reply.Full,
            created = reply.Created,
            ratioFailed = reply.RatioFailed,
            oldCode = !SheetReply.IsCurrent(reply.Version),
            ratioSkipped = reply.RatioSkippedCells.ToArray(),
            notPut = new { noName = stats.ReceivableOnly, unlinked = stats.UnlinkedReceipts, negative = stats.IgnoredNegative, noChart = stats.NoKeyVisits },
            fileId = reply.FileId.Length > 0 ? reply.FileId : null,
            sheetGid = reply.HasSheetGid ? (long?)reply.SheetGid : null,
            version = VersionOf(reply),
        };
    }

    // ── 같이 쓰는 것 ─────────────────────────────────────────

    /// <summary>
    /// 보내기 전 검사: 이 PC 비밀 글자가 있나(없으면 E-GSHEET-SECRET) → 비트시트와 같은 막는 까닭(주소 없음·주소 꼴·원본 시트·칸).
    /// 주소·메일은 sheet.dat 것을 설정에 넣는다(웹은 주지 않는다).
    /// </summary>
    private static SheetState Ready(SheetServices s, Settings settings)
    {
        var state = s.Store.Load();
        if (!state.HasSecret) throw new SheetException(SheetErrors.Secret);
        settings.WebAppUrl = state.Url ?? "";
        settings.ShareWith = state.ShareWith.ToList();
        var blocker = SheetSettingsJson.Blocker(settings, state.Url, state.Secret);
        if (blocker != null) throw new SheetException(blocker);
        return state;
    }

    /// <summary>확인 전(verified 거짓)이면 hello로 먼저 맞춰 보고 sheet.dat에 참으로 적는다. 틀리면 E-GSHEET-KEY(token·줄은 보내지 않음).</summary>
    private static SheetState Verified(SheetServices s, WebAppClient client, SheetState state)
    {
        if (state.Verified) return state;
        SheetHello.Verify(client, state.Url!, state.Secret!, s.Nonce());
        var fresh = s.Store.Load();
        if (!string.Equals(fresh.Url, state.Url, StringComparison.Ordinal) || !string.Equals(fresh.Secret, state.Secret, StringComparison.Ordinal))
        {
            throw new SheetException(SheetErrors.Key);
        }
        fresh.Verified = true;
        s.Store.Save(fresh);
        return fresh;
    }

    private static WebAppClient Client(SheetServices s, SheetDeadline deadline)
    {
        var http = s.Transport(() => deadline.Left);
        return new WebAppClient(new BudgetTransport(http, deadline));
    }

    /// <summary>구글 코드 판 글자(숫자). 답에 없으면 "0"(옛 판으로 본다).</summary>
    private static string VersionOf(WebAppReply reply) => reply.Version.Length > 0 ? reply.Version : "0";

    private static HelperException Bad() => new HelperException(ErrorCodes.BadMessage);
}
