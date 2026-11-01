using System;
using System.Collections.Generic;
using System.Linq;
using Precheck.Core.Bit;
using Xunit;

namespace Precheck.Core.Tests.Bit;

/// <summary>
/// AC-008.3 비트 통계 화면 표(가짜 표 값) → 줄. 키(83 증상·83D 상병내역·47 처방내역)마다 원본이 읽는 칸만 남긴다
/// (83: mx999 build, 83D: new-medicore-diagnoses parse, 47: parseRx). 칸을 찾는 법도 원본 그대로다.
/// 필요한 칸이 없으면 E-BIT-EXPORT-FAILED. 줄 값은 모두 지어낸 것이다(가상환자NN·9로 시작하는 차트번호).
/// </summary>
public class GridRowsTests
{
    private static IReadOnlyList<IReadOnlyList<string>> Rows(params string[][] rows) => rows;

    private static string ExportCode(Action action) => Assert.Throws<BitException>(action).Code;

    [Fact(DisplayName = "AC-008.3 83(증상): 내원번호·차트번호·환자명·증상·기록날짜만 남기고 주민번호·주소·전화 같은 칸은 버린다")]
    public void SymptomsKeepOnlyReadColumns()
    {
        var columns = new[] { "No", "내원번호", "차트번호", "주민번호", "환자명", "전화번호", "주소", "증상", "기록날짜", "진료의" };
        var rows = GridRows.From("83", columns, Rows(
            new[] { "1", "V0001", "900001", "000000-0000000", "가상환자01", "010-0000-0001", "가상시 가상동", "L-spine pain", "2026-10-01", "의사" },
            new[] { "2", "V0001", "900001", "000000-0000000", "가상환자01", "010-0000-0001", "가상시 가상동", "MBB Lt L4-5", "2026-10-01", "의사" }));

        Assert.Equal(new[] { "내원번호", "차트번호", "환자명", "증상", "기록날짜" }, GridRows.Columns("83"));
        Assert.Equal(2, rows.Count);
        Assert.Equal(new[] { "기록날짜", "내원번호", "증상", "차트번호", "환자명" }.OrderBy(k => k, StringComparer.Ordinal), rows[0].Keys.OrderBy(k => k, StringComparer.Ordinal));
        Assert.Equal("V0001", rows[0]["내원번호"]);
        Assert.Equal("900001", rows[0]["차트번호"]);
        Assert.Equal("가상환자01", rows[0]["환자명"]);
        Assert.Equal("L-spine pain", rows[0]["증상"]);
        Assert.Equal("MBB Lt L4-5", rows[1]["증상"]);
        Assert.Equal("2026-10-01", rows[1]["기록날짜"]);
        foreach (var row in rows)
        {
            Assert.DoesNotContain(row.Values, v => v.Contains("000000-0000000") || v.Contains("010-0000") || v.Contains("가상동"));
        }
    }

    [Fact(DisplayName = "AC-008.3 83: 칸 이름은 원본 ci처럼 공백을 지워 같은 것 먼저, 없으면 그 이름을 품은 첫 칸(환자차트번호·기록 날짜)")]
    public void SymptomsMatchLikeOriginal()
    {
        var columns = new[] { "내원 번호", "환자차트번호", "환자명", "증상", "기록 날짜" };
        var row = Assert.Single(GridRows.From("83", columns, Rows(new[] { "V0002", "900002", "가상환자02", "knee", "20261002" })));
        Assert.Equal("V0002", row["내원번호"]);
        Assert.Equal("900002", row["차트번호"]);
        Assert.Equal("20261002", row["기록날짜"]);

        // 같은 이름이 있으면 품은 칸보다 먼저(원본 findIndex 순서)
        columns = new[] { "내원번호", "보호자차트번호", "차트번호", "환자명", "증상", "기록날짜" };
        row = Assert.Single(GridRows.From("83", columns, Rows(new[] { "V0003", "999999", "900003", "가상환자03", "hip", "2026-10-03" })));
        Assert.Equal("900003", row["차트번호"]);
    }

    [Theory(DisplayName = "AC-008.3 83: 필요한 칸(내원번호·차트번호·환자명·증상·기록날짜) 하나라도 없으면 E-BIT-EXPORT-FAILED")]
    [InlineData("내원번호")]
    [InlineData("차트번호")]
    [InlineData("환자명")]
    [InlineData("증상")]
    [InlineData("기록날짜")]
    public void SymptomsNeedEveryColumn(string missing)
    {
        var columns = GridRows.Columns("83").Where(c => c != missing).ToArray();
        Assert.Equal("E-BIT-EXPORT-FAILED", ExportCode(() => GridRows.From("83", columns, Rows(columns.Select(_ => "x").ToArray()))));
    }

    [Fact(DisplayName = "AC-008.3 83D(상병내역): 내원번호·차트번호·상병청구코드 + 원본이 읽는 상병명칭·주상병여부·산정특례기호·과목코드·진단일자만")]
    public void DiagnosesKeepOnlyReadColumns()
    {
        var columns = new[] { "내원번호", "차트번호", "환자명", "주민번호", "상병청구코드", "상병명칭", "주상병여부", "산정특례기호", "과목코드", "진단일자", "비고" };
        var row = Assert.Single(GridRows.From("83D", columns, Rows(
            new[] { "V0001", "900001", "가상환자01", "000000-0000000", "M5456", "요통, 요추부(가짜)", "주상병", "", "01", "2026-10-01", "메모" })));

        Assert.Equal(new[] { "내원번호", "차트번호", "상병청구코드", "상병명칭", "주상병여부", "산정특례기호", "과목코드", "진단일자" }, GridRows.Columns("83D"));
        Assert.Equal(8, row.Count);
        Assert.False(row.ContainsKey("환자명"));
        Assert.False(row.ContainsKey("주민번호"));
        Assert.Equal("M5456", row["상병청구코드"]);
        Assert.Equal("주상병", row["주상병여부"]);
    }

    [Fact(DisplayName = "AC-008.3 83D: 원본처럼 칸 이름은 공백만 지우고 똑같아야 찾고, 없는 선택 칸은 줄에 넣지 않으며, 세 필수 칸이 없으면 E-BIT-EXPORT-FAILED")]
    public void DiagnosesColumnRules()
    {
        var row = Assert.Single(GridRows.From("83D", new[] { "내원 번호", "차트번호", "상병청구코드" }, Rows(new[] { "V0004", "900004", "S8350" })));
        Assert.Equal(new[] { "내원번호", "상병청구코드", "차트번호" }, row.Keys.OrderBy(k => k, StringComparer.Ordinal));

        // 품은 이름(원본은 indexOf로 똑같은 것만 찾는다)은 필수 칸이 아니다
        Assert.Equal("E-BIT-EXPORT-FAILED", ExportCode(() => GridRows.From("83D", new[] { "내원번호", "환자차트번호", "상병청구코드" }, Rows(new[] { "V", "900005", "S8350" }))));
        Assert.Equal("E-BIT-EXPORT-FAILED", ExportCode(() => GridRows.From("83D", new[] { "내원번호", "차트번호", "상병명칭" }, Rows(new[] { "V", "900005", "x" }))));
    }

    [Fact(DisplayName = "AC-008.3 47(처방내역): 원본 parseRx 정규식(처방코드|^코드·처방명칭|명칭·차트|등록번호·처방일자|일자|날짜·급.?비|급여구분)과 수량 칸(총투여량→투여량→수량)만")]
    public void PrescriptionsKeepOnlyReadColumns()
    {
        var columns = new[] { "No", "차트번호", "환자명", "주민번호", "처방일자", "처방코드", "처방명칭", "급여구분", "투여량", "일수", "총투여량", "금액" };
        var row = Assert.Single(GridRows.From("47", columns, Rows(
            new[] { "1", "900001", "가상환자01", "000000-0000000", "2026-10-01", "LA221", "신경차단술(가짜)", "급여", "1", "1", "2", "12,340" })));

        Assert.Equal(new[] { "처방코드", "처방명칭", "차트번호", "처방일자", "급여구분", "수량" }, GridRows.Columns("47"));
        Assert.Equal("LA221", row["처방코드"]);
        Assert.Equal("신경차단술(가짜)", row["처방명칭"]);
        Assert.Equal("900001", row["차트번호"]);
        Assert.Equal("2026-10-01", row["처방일자"]);
        Assert.Equal("급여", row["급여구분"]);
        Assert.Equal("2", row["수량"]);                       // 총투여량이 투여량보다 먼저(원본 quantityColumn)
        Assert.False(row.ContainsKey("환자명"));
        Assert.DoesNotContain(row.Values, v => v.Contains("000000-0000000") || v == "12,340");
    }

    [Fact(DisplayName = "AC-008.3 47: 원본 findIndex처럼 정규식에 맞는 첫 칸을 쓴다(진료일자가 처방일자보다 앞이면 진료일자, 등록번호도 차트로 봄)")]
    public void PrescriptionsMatchFirstLikeOriginal()
    {
        var columns = new[] { "등록번호", "진료일자", "처방일자", "코드", "명칭", "급비", "수량(개)" };
        var row = Assert.Single(GridRows.From("47", columns, Rows(new[] { "900006", "2026-10-06", "2026-10-07", "KK010", "가짜 주사", "비급여", "3" })));
        Assert.Equal("900006", row["차트번호"]);
        Assert.Equal("2026-10-06", row["처방일자"]);
        Assert.Equal("KK010", row["처방코드"]);
        Assert.Equal("가짜 주사", row["처방명칭"]);
        Assert.Equal("비급여", row["급여구분"]);
        Assert.Equal("3", row["수량"]);
    }

    [Fact(DisplayName = "AC-008.3 47: 선택 칸(명칭·급여구분·수량)은 없어도 되고 수량 칸이 둘이면 원본처럼 수량 없음, 처방코드·차트번호·처방일자가 없으면 E-BIT-EXPORT-FAILED")]
    public void PrescriptionsColumnRules()
    {
        var row = Assert.Single(GridRows.From("47", new[] { "처방코드", "차트번호", "처방일자", "수량", "수량" }, Rows(new[] { "LA221", "900007", "20261007", "1", "2" })));
        Assert.Equal(new[] { "처방코드", "차트번호", "처방일자" }.OrderBy(k => k, StringComparer.Ordinal), row.Keys.OrderBy(k => k, StringComparer.Ordinal));

        Assert.Equal("E-BIT-EXPORT-FAILED", ExportCode(() => GridRows.From("47", new[] { "차트번호", "처방일자" }, Rows(new[] { "900007", "20261007" }))));
        Assert.Equal("E-BIT-EXPORT-FAILED", ExportCode(() => GridRows.From("47", new[] { "처방코드", "처방일자" }, Rows(new[] { "LA221", "20261007" }))));
        Assert.Equal("E-BIT-EXPORT-FAILED", ExportCode(() => GridRows.From("47", new[] { "처방코드", "차트번호" }, Rows(new[] { "LA221", "900007" }))));
    }

    [Fact(DisplayName = "AC-008.3 줄은 표 순서 그대로 모두 두고(원본 쪽이 거른다), 칸보다 짧은 줄의 빈 칸은 빈 글자")]
    public void KeepsRowOrderAndPadsShortRows()
    {
        var rows = GridRows.From("83", GridRows.Columns("83").ToArray(), Rows(
            new[] { "V1", "900001", "가상환자01", "", "2026-10-01" },
            new[] { "V2", "900002" },
            new[] { "합계", "", "", "", "" }));
        Assert.Equal(new[] { "V1", "V2", "합계" }, rows.Select(r => r["내원번호"]));
        Assert.Equal("", rows[1]["증상"]);
        Assert.Equal("", rows[0]["증상"]);
    }

    [Fact(DisplayName = "AC-008.3 화면 표 전체(FromSheet): 원본처럼 앞 줄들에서 머리 줄을 찾아 그 뒤 줄만, 머리 줄이 없으면 E-BIT-EXPORT-FAILED, 빈 표는 줄 0개")]
    public void FromSheetFindsHeaderLikeOriginal()
    {
        var sheet = Rows(
            new[] { "", "", "" },
            new[] { "내원번호", "차트번호", "환자명", "증상", "기록날짜" },
            new[] { "V1", "900001", "가상환자01", "neck", "2026-10-01" });
        var row = Assert.Single(GridRows.FromSheet("83", sheet));
        Assert.Equal("neck", row["증상"]);

        // 83 머리 줄은 '증상'(그대로)과 '차트번호'를 품은 칸이 함께 있는 줄
        Assert.Equal("E-BIT-EXPORT-FAILED", ExportCode(() => GridRows.FromSheet("83", Rows(new[] { "내원번호", "차트번호", "환자명", "증상내용", "기록날짜" }, new[] { "V1", "900001", "가상환자01", "neck", "2026-10-01" }))));

        // 47 머리 줄은 /처방코드|코드/와 /차트|등록번호/가 함께 있는 줄
        var rx = Assert.Single(GridRows.FromSheet("47", Rows(new[] { "처방 목록" }, new[] { "처방코드", "차트번호", "처방일자" }, new[] { "LA221", "900001", "2026-10-01" })));
        Assert.Equal("LA221", rx["처방코드"]);

        // 83D 머리 줄은 내원번호·차트번호·상병청구코드가 함께 있는 줄
        var dx = Assert.Single(GridRows.FromSheet("83D", Rows(new[] { "내원번호", "차트번호", "상병청구코드" }, new[] { "V1", "900001", "M5456" })));
        Assert.Equal("M5456", dx["상병청구코드"]);

        // 원본 엑셀은 위에 3줄(제목·조회 기간·빈 줄)이 더 있었다: 83은 화면 표의 첫 12줄, 47·83D는 첫 17줄 안에서 찾는다
        var late = Enumerable.Range(0, 12).Select(_ => new[] { "-" }).Concat(new[] { new[] { "내원번호", "차트번호", "환자명", "증상", "기록날짜" }, new[] { "V1", "900001", "가상환자01", "neck", "2026-10-01" } }).ToArray();
        Assert.Equal("E-BIT-EXPORT-FAILED", ExportCode(() => GridRows.FromSheet("83", late)));
        Assert.Single(GridRows.FromSheet("83", late.Skip(1).ToArray()));
        var lateRx = Enumerable.Range(0, 17).Select(_ => new[] { "-" }).Concat(new[] { new[] { "처방코드", "차트번호", "처방일자" }, new[] { "LA221", "900001", "2026-10-01" } }).ToArray();
        Assert.Equal("E-BIT-EXPORT-FAILED", ExportCode(() => GridRows.FromSheet("47", lateRx)));
        Assert.Single(GridRows.FromSheet("47", lateRx.Skip(1).ToArray()));

        // 조회된 줄이 없는 화면(머리 줄만, 또는 아무것도 없음)은 줄 0개. 상병(83D)은 원본처럼 없어도 된다(AC-009.4)
        Assert.Empty(GridRows.FromSheet("83D", Rows(new[] { "내원번호", "차트번호", "상병청구코드" })));
        Assert.Empty(GridRows.FromSheet("83D", Rows()));
        Assert.Empty(GridRows.FromSheet("47", Rows(new[] { "", "" })));
    }

    [Fact(DisplayName = "AC-008.3 모르는 키는 E-BIT-EXPORT-FAILED")]
    public void UnknownKey()
    {
        Assert.Equal("E-BIT-EXPORT-FAILED", ExportCode(() => GridRows.From("99", new[] { "a" }, Rows(new[] { "b" }))));
        Assert.Equal("E-BIT-EXPORT-FAILED", ExportCode(() => GridRows.Columns("99")));
    }
}
