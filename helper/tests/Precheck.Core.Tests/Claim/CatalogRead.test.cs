using System;
using System.Linq;
using Precheck.Core.Bit;
using Precheck.Core.Claim;
using Precheck.Core.Tests.Bit;
using Xunit;

namespace Precheck.Core.Tests.Claim;

/// <summary>
/// AC-008.1 병원 처방 목록(원본 PrescriptionCatalog·LaCatalog): 오늘 유효한 병원 등록 처방코드와 비트 LA 신경차단술 코드.
/// 원본 검사·분류 규칙 그대로. 코드·이름은 가짜다.
/// </summary>
public class CatalogReadTests
{
    private static readonly DateTime Today = new DateTime(2026, 10, 30);

    [Theory(DisplayName = "AC-008.1 처방 분류(원본 Classify): S 묶음·약(3·4·5)·재료(8)·검사(09)·시술(04~08)·그 밖")]
    [InlineData("S", "1", "040001", "other")]
    [InlineData("X", "1", "040001", "unknown")]
    [InlineData("I", "3", "", "drug")]
    [InlineData("P", "5", "", "drug")]
    [InlineData("P", "8", "", "other")]
    [InlineData("P", "6", "040001", "unknown")]
    [InlineData("P", "1", "04001", "unknown")]
    [InlineData("P", "2", "090001", "lab")]
    [InlineData("I", "1", "080001", "procedure")]
    [InlineData("P", "1", "010001", "other")]
    public void Classify(string type, string division, string item, string kind)
    {
        Assert.Equal(kind, CatalogRead.Classify(type, division, item));
    }

    [Fact(DisplayName = "AC-008.1 병원 처방 목록: 같은 정의가 겹치면 한 번만, 빈 표준코드 허용, @today는 오늘 yyyyMMdd, 시간 제한 25초")]
    public void Prescriptions()
    {
        var db = new FakeDb().Answer(Sql.PrescriptionCatalogSql, _ => new[]
        {
            new object?[] { "LA221", "신경차단술(가짜)", "LA221", "P", "1", "040001" },
            new object?[] { "LA221", "신경차단술(가짜)", "LA221", "P", "1", "040001" },    // 같은 정의가 또(유효 기간이 겹침)
            new object?[] { "643301234", "가짜정", "", "I", "3", null },
        });

        var codes = CatalogRead.Prescriptions(db, Today);

        Assert.Equal(new[] { "LA221", "643301234" }, codes.Select(c => c.Code));
        Assert.Equal("procedure", codes[0].Kind);
        Assert.Equal("LA221", codes[0].StandardCode);
        Assert.Equal("drug", codes[1].Kind);
        Assert.Equal("", codes[1].StandardCode);
        var call = Assert.Single(db.Calls);
        Assert.Equal("20261030", call.Args["@today"]);
        Assert.Equal(TimeSpan.FromSeconds(25), call.Timeout);
    }

    public static System.Collections.Generic.IEnumerable<object?[]> BadPrescriptions()
    {
        yield return new object?[] { new[] { new object?[] { "LA221", "이름\u0001", "", "P", "1", "040001" } } };                        // 이름에 제어 문자
        yield return new object?[] { new[] { new object?[] { "LA 221!", "이름", "", "P", "1", "040001" } } };                           // 코드 글자
        yield return new object?[] { new[] { new object?[] { "__proto__", "이름", "", "P", "1", "040001" } } };                         // 막힌 이름
        yield return new object?[] { new[] { new object?[] { "LA221", "가", "", "P", "1", "040001" }, new object?[] { "LA221", "나", "", "P", "1", "040001" } } }; // 겹치는 다른 정의
        yield return new object?[] { new object?[0][] };                                                                                  // 빈 목록
    }

    [Theory(DisplayName = "AC-008.1 병원 처방 목록 모양이 틀리거나(원본 invalid·ambiguous) 비었으면 E-BIT-READ-FAILED")]
    [MemberData(nameof(BadPrescriptions))]
    public void BadPrescriptionCatalog(object?[][] rows)
    {
        var db = new FakeDb().Answer(Sql.PrescriptionCatalogSql, _ => rows);
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => CatalogRead.Prescriptions(db, Today)).Code);
    }

    [Fact(DisplayName = "AC-008.1 LA 코드 목록: @prefix LA[0-9]%, 코드마다 첫 줄(지금 유효한 것)만, 이름에 '신경'·'차단'이 함께 있는 것만, 시간 제한 20초")]
    public void La()
    {
        var db = new FakeDb().Answer(Sql.LaCatalogSql, _ => new[]
        {
            new object?[] { "la221 ", "요추 신경 차단술(가짜)", true },
            new object?[] { "LA221", "옛 이름 신경차단(가짜)", false },
            new object?[] { "LA300", "관절 주사(가짜)", true },
            new object?[] { "LA400", "경막외 신경차단술(가짜)", false },
        });

        var codes = CatalogRead.La(db, Today);

        Assert.Equal(new[] { "LA221", "LA400" }, codes.Select(c => c.Code));
        Assert.Equal("요추 신경 차단술(가짜)", codes[0].Name);
        Assert.True(codes[0].Active);
        Assert.False(codes[1].Active);
        var call = Assert.Single(db.Calls);
        Assert.Equal("20261030", call.Args["@today"]);
        Assert.Equal("LA[0-9]%", call.Args["@prefix"]);
        Assert.Equal(TimeSpan.FromSeconds(20), call.Timeout);

        var bad = new FakeDb().Answer(Sql.LaCatalogSql, _ => new[] { new object?[] { "LA221", "신경\u0001차단", true } });
        Assert.Equal("E-BIT-READ-FAILED", Assert.Throws<BitException>(() => CatalogRead.La(bad, Today)).Code);
    }
}
