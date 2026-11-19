<#
.SYNOPSIS
  EMR(의사랑·이지스 등) 폴더를 읽기만 하고, 파일 이름·환자 값 없이 "모양"만 적은 보고서를 만든다.

.DESCRIPTION
  윈도우 PowerShell 5.1만 쓴다(설치할 것 없음). 폴더 안에는 아무것도 쓰거나 고치거나 지우지 않는다.
  파일은 다른 프로그램과 함께 열기로 열고 앞부분만 읽는다. 보고서에는 다음만 적는다.
  - 폴더 전체 숫자, 확장자별 묶음, 앞 바이트로 알아본 파일 종류, 이름 모양(숫자 9·한글 가·영문 a)
  - 표 모양 파일(DBF·CSV/TXT·XLSX·SQLite·Access)의 칸 이름(첫 줄이 값처럼 보이면 칸 수와 모양만)
  - 이 PC에 설치된 SQL Server 서비스 이름과 상태(연결하지 않음)
  요구사항: specs/emr-choice/requirements.md REQ-7105, 설계: design.md 7절.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File emr-survey.ps1 -Path "C:\EMR"
#>
param(
  [Parameter(Mandatory = $true)][string]$Path,
  [string]$Out
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

# 다른 프로그램이 결과를 받아 갈 때(화면이 아닐 때)는 한글이 깨지지 않게 UTF-8로 내보낸다
if ([Console]::IsOutputRedirected) {
  try { [Console]::OutputEncoding = New-Object Text.UTF8Encoding($false) } catch { }
}

$Inv = [Globalization.CultureInfo]::InvariantCulture
$Utf8Strict = New-Object Text.UTF8Encoding($false, $true)
$Cp949 = [Text.Encoding]::GetEncoding(949)
$Latin1 = [Text.Encoding]::GetEncoding(28591)

$MaxFiles = 200000
$HeadBytes = 4096
$TableBytes = 65536
$SqliteBytes = 2MB
$XlsxMax = 20MB
$AccessMax = 200MB
$PerKind = 5
$MaxColumns = 100

# AC-7105.2: 그대로 적어도 되는 확장자
$KnownExt = @('dbf', 'mdb', 'accdb', 'db', 'sqlite', 'db3', 'mdf', 'ldf', 'ndf', 'csv', 'txt', 'tsv',
  'xls', 'xlsx', 'xml', 'json', 'dat', 'ini', 'cfg', 'log', 'bak', 'exe', 'dll', 'jpg', 'jpeg', 'png',
  'bmp', 'gif', 'tif', 'tiff', 'pdf', 'zip', 'hwp', 'doc', 'docx')
$OtherExt = '(그 밖 확장자)'
$NoExt = '(확장자 없음)'

# AC-7105.4 (나): 칸 이름 낱말(두 글자 이상)과 꼬리말
$Words = @('환자', '성명', '이름', '차트', '주민', '생년', '성별', '나이', '전화', '휴대', '주소', '접수',
  '진료', '처방', '코드', '금액', '수납', '현금', '카드', '계좌', '미수', '날짜', '일자', '시간', '시각',
  '의사', '보험', '구분', '내원', '상병', '진단', '청구', '본인', '부담', '총액', '예약', '메모', '번호',
  '명칭', '수량', '단가', '종류', '상태', '등록', '수정', '여부', '기관', '요양', '초진', '재진', '신환')
$Tails = @('명', '일', '액', '수', '자', '호')

$KindNames = @('SQLite', 'Access/Jet', 'DBF', 'ZIP(xlsx 등)', 'OLE2(xls 등)', 'SQL Server 데이터 파일', '글자 파일', '모름')
$DbfFirst = [byte[]](0x02, 0x03, 0x30, 0x31, 0x43, 0x63, 0x83, 0x8B, 0xCB, 0xF5)

function Stop-Survey([string]$Message) {
  Write-Host $Message
  exit 1
}

function Get-FullPath([string]$p) {
  $full = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($p)
  return [IO.Path]::GetFullPath($full)
}

function Test-InsideRoot([string]$full) {
  $f = $full.TrimEnd('\')
  return ($f.Equals($script:RootTrim, [StringComparison]::OrdinalIgnoreCase) -or
    $f.StartsWith($script:RootTrim + '\', [StringComparison]::OrdinalIgnoreCase))
}

# ---------- 시작 검사 (아무것도 쓰기 전에) ----------
$Path = $Path.Trim().Trim('"')
$root = $null
try { $root = Get-FullPath $Path } catch { $root = $null }
if (-not $root -or -not [IO.Directory]::Exists($root)) {
  Stop-Survey '폴더를 찾지 못했어요. -Path에 준 폴더가 이 PC에 있는지 확인해 주세요.'
}
$RootTrim = $root.TrimEnd('\')

if ([string]::IsNullOrWhiteSpace($Out)) {
  $desk = [Environment]::GetFolderPath('Desktop')
  $Out = Join-Path $desk ('emr-survey-' + (Get-Date).ToString('yyyyMMdd-HHmm', $Inv) + '.txt')
}
$Out = $Out.Trim().Trim('"')
$outFull = $null
try { $outFull = Get-FullPath $Out } catch { $outFull = $null }
if (-not $outFull) { Stop-Survey '보고서 자리를 알아보지 못했어요. -Out으로 다른 곳을 주세요' }
if (Test-InsideRoot $outFull) {
  Stop-Survey '보고서를 조사하는 폴더 안에 쓸 수 없어요. -Out으로 다른 곳을 주세요'
}
if ([IO.Directory]::Exists($outFull)) {
  Stop-Survey '-Out이 폴더예요. 파일 이름까지 주세요(예: -Out "D:\emr-survey.txt")'
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.Data

# ---------- 작은 도구 ----------
function Open-Shared([string]$file) {
  return [IO.File]::Open($file, [IO.FileMode]::Open, [IO.FileAccess]::Read,
    ([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
}

function Read-Head([string]$file, [int]$max) {
  $fs = Open-Shared $file
  try {
    $len = [int][Math]::Min([int64]$max, $fs.Length)
    $buf = New-Object byte[] $len
    $got = 0
    while ($got -lt $len) {
      $n = $fs.Read($buf, $got, $len - $got)
      if ($n -le 0) { break }
      $got += $n
    }
    if ($got -lt $len) { [Array]::Resize([ref]$buf, $got) }
    return , $buf
  } finally { $fs.Dispose() }
}

# 글자 풀기: UTF-8로 엄격히, 안 되면 CP949
function ConvertFrom-Bytes([byte[]]$b, [int]$start, [int]$count) {
  if ($count -le 0) { return '' }
  if ($count -ge 3 -and $b[$start] -eq 0xEF -and $b[$start + 1] -eq 0xBB -and $b[$start + 2] -eq 0xBF) {
    $start += 3; $count -= 3
  }
  try { return $Utf8Strict.GetString($b, $start, $count) } catch { return $Cp949.GetString($b, $start, $count) }
}

# 이름 모양: 숫자 9, 한글 가, 영문 a, 빈칸 . _ - 괄호는 그대로, 그 밖 x
$ReDigit = New-Object regex '[0-9]'
$ReLatin = New-Object regex '[A-Za-z]'
$ReHangul = New-Object regex '[가-힣]'
$ReOther = New-Object regex '[^9a가 ._\-()\[\]{}]'   # 위 셋을 바꾼 뒤 남은 그 밖 글자
function Get-Shape([string]$s) {
  if ($null -eq $s) { return '' }
  $t = $ReDigit.Replace($s, '9')
  $t = $ReLatin.Replace($t, 'a')
  $t = $ReHangul.Replace($t, [string][char]0xAC00)
  return $ReOther.Replace($t, 'x')
}

# AC-7105.4 (나): 한글 낱말·꼬리말로 왼쪽부터 남김없이 나뉘고 낱말이 하나 이상, 숫자·빈칸 없이 12자 이하
function Test-KoreanName([string]$s) {
  if ([string]::IsNullOrEmpty($s) -or $s.Length -gt 12) { return $false }
  foreach ($c in $s.ToCharArray()) {
    $k = [int]$c
    if ($k -lt 0xAC00 -or $k -gt 0xD7A3) { return $false }
  }
  $n = $s.Length
  $reach = New-Object int[] ($n + 1)   # 1 = 낱말 없이 닿음, 2 = 낱말 하나 이상으로 닿음
  $reach[0] = 1
  for ($i = 0; $i -lt $n; $i++) {
    $here = $reach[$i]
    if ($here -eq 0) { continue }
    foreach ($w in $Words) {
      if ($i + $w.Length -le $n -and [string]::CompareOrdinal($s, $i, $w, 0, $w.Length) -eq 0) {
        $reach[$i + $w.Length] = $reach[$i + $w.Length] -bor 2
      }
    }
    $one = $s.Substring($i, 1)
    foreach ($t in $Tails) {
      if ([string]::Equals($one, $t, [StringComparison]::Ordinal)) {
        $reach[$i + 1] = $reach[$i + 1] -bor $here
      }
    }
  }
  return (($reach[$n] -band 2) -ne 0)
}

# AC-7105.4: 칸 이름은 (가)·(나)일 때만 그대로, 아니면 모양
function Get-SafeName([string]$s) {
  if ($null -eq $s) { return '(빈 칸)' }
  $t = $s.Trim([char[]]@([char]0, ' ', "`t"))
  if ($t.Length -eq 0) { return '(빈 칸)' }
  if ($t -cmatch '^[A-Za-z][A-Za-z0-9_]{0,29}$' -and $t -cnotmatch '^[A-Za-z]{0,3}[0-9]{3,}$') { return $t }
  if (Test-KoreanName $t) { return $t }
  return (Get-Shape $t)
}

# CSV·XLSX 첫 줄: 칸 이름 줄인지 값 줄인지 보고 글로 만든다
function Format-FirstRow([string[]]$cells) {
  $looksValue = $false
  foreach ($c in $cells) {
    $t = $c.Trim()
    if ($t -match '[0-9]{3}') { $looksValue = $true; break }
    if ($t -match '[\uAC00-\uD7A3]' -and -not (Test-KoreanName $t)) { $looksValue = $true; break }
  }
  $shown = New-Object Collections.Generic.List[string]
  $i = 0
  foreach ($c in $cells) {
    if ($i -ge $MaxColumns) { break }
    if ($looksValue) {
      $sh = Get-Shape $c.Trim()
      if ($sh.Length -eq 0) { $sh = '(빈 칸)' }
      $shown.Add($sh)
    } else { $shown.Add((Get-SafeName $c)) }
    $i++
  }
  $more = ''
  if ($cells.Count -gt $MaxColumns) { $more = ', … 외 ' + ($cells.Count - $MaxColumns) + '개' }
  if ($looksValue) {
    return '첫 줄이 값처럼 보여요 · 칸 ' + $cells.Count + '개 · 모양: ' + ($shown -join ', ') + $more
  }
  return '칸 ' + $cells.Count + '개: ' + ($shown -join ', ') + $more
}

function Format-Size([int64]$n) {
  if ($n -ge 1GB) { return [string]::Format($Inv, '{0:0.0}GB', $n / 1GB) }
  if ($n -ge 1MB) { return [string]::Format($Inv, '{0:0.0}MB', $n / 1MB) }
  if ($n -ge 1KB) { return [string]::Format($Inv, '{0:0.0}KB', $n / 1KB) }
  return "${n}B"
}

function Format-Time([datetime]$d) { return $d.ToString('yyyy-MM-dd HH:mm', $Inv) }

function Get-ExtRaw([string]$name) {
  $i = $name.LastIndexOf('.')
  if ($i -lt 0 -or $i -eq $name.Length - 1) { return '' }
  return $name.Substring($i + 1).ToLowerInvariant()
}

# 그대로 적을 확장자면 그 확장자, 확장자가 없으면 '', 아니면 $null('(그 밖 확장자)')
function Get-Ext([string]$raw) {
  if ($raw -eq '') { return '' }
  if ($KnownExt -contains $raw) { return $raw }
  if ([int]$script:ExtCount[$raw] -ge 10 -and $raw -cmatch '^[a-z0-9]{1,10}$') { return $raw }
  return $null
}

function Get-NameShape([string]$name, $ext) {
  if ($ext) { return (Get-Shape $name.Substring(0, $name.Length - $ext.Length - 1)) + '.' + $ext }
  return (Get-Shape $name)
}

function Test-Dbf([byte[]]$h) {
  if ($h.Length -lt 65) { return $false }
  if ([Array]::IndexOf($DbfFirst, $h[0]) -lt 0) { return $false }
  if ($h[2] -lt 1 -or $h[2] -gt 12 -or $h[3] -lt 1 -or $h[3] -gt 31) { return $false }
  $hlen = [int][BitConverter]::ToUInt16($h, 8)
  $rlen = [int][BitConverter]::ToUInt16($h, 10)
  if ($hlen -lt 65 -or $rlen -lt 1) { return $false }
  $p = 32
  while ($p -lt $hlen) {
    if ($p -ge $h.Length) { return $true }        # 읽은 앞부분 밖까지 칸이 이어짐
    if ($h[$p] -eq 0x0D) { return ($p -gt 32) }
    if ($p + 11 -ge $h.Length) { return $true }
    $type = [int]$h[$p + 11]
    if (-not (($type -ge 65 -and $type -le 90) -or $type -eq 64 -or $type -eq 43 -or $type -eq 48)) { return $false }
    $p += 32
  }
  return $false
}

function Get-Kind([string]$raw, [byte[]]$h) {
  $n = $h.Length
  if ($n -ge 16 -and $Latin1.GetString($h, 0, 16) -ceq "SQLite format 3`0") { return 'SQLite' }
  if ($n -ge 19) {
    $s = $Latin1.GetString($h, 4, 15)
    if ($s -ceq 'Standard Jet DB' -or $s -ceq 'Standard ACE DB') { return 'Access/Jet' }
  }
  if ($n -ge 4 -and $h[0] -eq 0x50 -and $h[1] -eq 0x4B -and $h[2] -eq 3 -and $h[3] -eq 4) { return 'ZIP(xlsx 등)' }
  if ($n -ge 4 -and $h[0] -eq 0xD0 -and $h[1] -eq 0xCF -and $h[2] -eq 0x11 -and $h[3] -eq 0xE0) { return 'OLE2(xls 등)' }
  if (Test-Dbf $h) { return 'DBF' }
  if ($n -gt 0 -and [Array]::IndexOf($h, [byte]0) -lt 0) { return '글자 파일' }
  return '모름'
}

# ---------- 표 모양 파일 읽기 (칸 이름만) ----------
function Read-DbfColumns([string]$file) {
  $h = Read-Head $file $TableBytes
  $hlen = [int][BitConverter]::ToUInt16($h, 8)
  $cols = New-Object Collections.Generic.List[string]
  $p = 32
  while ($p + 32 -le $h.Length -and $p -lt $hlen -and $h[$p] -ne 0x0D) {
    $end = [Array]::IndexOf($h, [byte]0, $p, 11)
    if ($end -lt 0) { $end = $p + 11 }
    $name = Get-SafeName (ConvertFrom-Bytes $h $p ($end - $p))
    $t = [int]$h[$p + 11]
    if (($t -ge 65 -and $t -le 90) -or $t -eq 64 -or $t -eq 43 -or $t -eq 48) { $type = [string][char]$t } else { $type = 'x' }
    $cols.Add($name + '(' + $type + ',' + [int]$h[$p + 16] + ')')
    $p += 32
  }
  if ($cols.Count -eq 0) { return @('칸을 찾지 못함') }
  $shown = @($cols | Select-Object -First $MaxColumns)
  $more = ''
  if ($cols.Count -gt $MaxColumns) { $more = ', … 외 ' + ($cols.Count - $MaxColumns) + '개' }
  return @('칸 ' + $cols.Count + '개: ' + ($shown -join ', ') + $more)
}

function Split-Line([string]$line, [char]$sep) {
  $cells = New-Object Collections.Generic.List[string]
  $sb = New-Object Text.StringBuilder
  $inQ = $false
  for ($i = 0; $i -lt $line.Length; $i++) {
    $c = $line[$i]
    if ($inQ) {
      if ($c -eq [char]'"') {
        if ($i + 1 -lt $line.Length -and $line[$i + 1] -eq [char]'"') { [void]$sb.Append('"'); $i++ }
        else { $inQ = $false }
      } else { [void]$sb.Append($c) }
    } elseif ($c -eq [char]'"') { $inQ = $true }
    elseif ($c -eq $sep) { $cells.Add($sb.ToString()); [void]$sb.Clear() }
    else { [void]$sb.Append($c) }
  }
  $cells.Add($sb.ToString())
  return , $cells.ToArray()
}

function Read-CsvColumns([string]$file) {
  $b = Read-Head $file $TableBytes
  $end = $b.Length
  $lf = [Array]::IndexOf($b, [byte]10)
  $cr = [Array]::IndexOf($b, [byte]13)
  if ($lf -ge 0) { $end = $lf }
  if ($cr -ge 0 -and $cr -lt $end) { $end = $cr }
  $line = ConvertFrom-Bytes $b 0 $end
  if ($line.Trim().Length -eq 0) { return @('첫 줄이 비어 있음') }
  $seps = @(@(',', '쉼표'), @(';', '세미콜론'), @("`t", '탭'), @('|', '세로 막대'))
  $best = $null; $bestCount = 0
  foreach ($s in $seps) {
    $cnt = $line.Split([char]$s[0]).Count - 1
    if ($cnt -gt $bestCount) { $best = $s; $bestCount = $cnt }
  }
  if ($null -eq $best) {
    return @('구분자 없음 · ' + (Format-FirstRow @($line)))
  }
  $cells = Split-Line $line ([char]$best[0])
  return @('구분자 ' + $best[1] + ' · ' + (Format-FirstRow $cells))
}

function New-XmlSettings {
  $st = New-Object Xml.XmlReaderSettings
  $st.DtdProcessing = [Xml.DtdProcessing]::Prohibit
  $st.XmlResolver = $null
  $st.IgnoreWhitespace = $true
  return $st
}

function Get-XmlDoc([string]$xml) {
  $d = New-Object Xml.XmlDocument
  $d.XmlResolver = $null
  $d.LoadXml($xml)
  return $d
}

function Get-TextOf($node) {
  # 셀·공유 문자열 안의 <t> 글을 잇는다(읽는 소리 <rPh>는 뺀다)
  $sb = New-Object Text.StringBuilder
  foreach ($t in $node.SelectNodes(".//*[local-name()='t'][not(ancestor::*[local-name()='rPh'])]")) {
    [void]$sb.Append($t.InnerText)
  }
  return $sb.ToString()
}

function Read-XlsxColumns([string]$file, [int64]$size) {
  if ($size -gt $XlsxMax) { return @('20MB보다 큼 — 건너뜀') }
  $fs = Open-Shared $file
  try {
    $zip = New-Object IO.Compression.ZipArchive($fs, [IO.Compression.ZipArchiveMode]::Read, $false)
    try {
      $wb = $zip.GetEntry('xl/workbook.xml')
      if ($null -eq $wb) { return @('시트 목록을 찾지 못함') }
      $sheets = New-Object Collections.Generic.List[object]
      $rd = [Xml.XmlReader]::Create($wb.Open(), (New-XmlSettings))
      try {
        while ($rd.Read()) {
          if ($rd.NodeType -eq [Xml.XmlNodeType]::Element -and $rd.LocalName -eq 'sheet') {
            $rid = $rd.GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
            if ($null -eq $rid) { $rid = $rd.GetAttribute('id', 'http://purl.oclc.org/ooxml/officeDocument/relationships') }
            $sheets.Add(@{ Name = $rd.GetAttribute('name'); Rid = $rid })
          }
        }
      } finally { $rd.Dispose() }
      $lines = New-Object Collections.Generic.List[string]
      $names = @($sheets | Select-Object -First $MaxColumns | ForEach-Object { Get-SafeName $_.Name })
      $lines.Add('시트 ' + $sheets.Count + '개: ' + ($names -join ', '))
      if ($sheets.Count -eq 0) { return $lines.ToArray() }

      # 첫 시트 파일 자리와 공유 문자열 자리
      $target = $null; $sstPath = 'xl/sharedStrings.xml'
      $relEntry = $zip.GetEntry('xl/_rels/workbook.xml.rels')
      if ($null -ne $relEntry) {
        $rr = [Xml.XmlReader]::Create($relEntry.Open(), (New-XmlSettings))
        try {
          while ($rr.Read()) {
            if ($rr.NodeType -eq [Xml.XmlNodeType]::Element -and $rr.LocalName -eq 'Relationship') {
              $tg = $rr.GetAttribute('Target')
              if ($null -eq $tg) { continue }
              if ($tg.StartsWith('/')) { $tg = $tg.Substring(1) } else { $tg = 'xl/' + $tg }
              if ($rr.GetAttribute('Id') -eq $sheets[0].Rid) { $target = $tg }
              $ty = $rr.GetAttribute('Type')
              if ($null -ne $ty -and $ty.EndsWith('/sharedStrings')) { $sstPath = $tg }
            }
          }
        } finally { $rr.Dispose() }
      }
      if ($null -eq $target) { $target = 'xl/worksheets/sheet1.xml' }
      $sheetEntry = $zip.GetEntry($target)
      if ($null -eq $sheetEntry) { $lines.Add('첫 시트를 찾지 못함'); return $lines.ToArray() }

      # 첫 시트의 첫 줄(<row>) 하나만 읽는다
      $rowXml = $null
      $sr = [Xml.XmlReader]::Create($sheetEntry.Open(), (New-XmlSettings))
      try {
        while ($sr.Read()) {
          if ($sr.NodeType -eq [Xml.XmlNodeType]::Element -and $sr.LocalName -eq 'row') { $rowXml = $sr.ReadOuterXml(); break }
        }
      } finally { $sr.Dispose() }
      if ($null -eq $rowXml) { $lines.Add('첫 시트가 비어 있음'); return $lines.ToArray() }
      $row = (Get-XmlDoc $rowXml).DocumentElement
      $cellNodes = @($row.ChildNodes | Where-Object { $_.LocalName -eq 'c' })
      $values = New-Object 'object[]' $cellNodes.Count
      $need = @{}
      for ($i = 0; $i -lt $cellNodes.Count; $i++) {
        $c = $cellNodes[$i]
        $t = $c.GetAttribute('t')
        $v = @($c.ChildNodes | Where-Object { $_.LocalName -eq 'v' })
        if ($t -eq 'inlineStr') { $values[$i] = Get-TextOf $c }
        elseif ($t -eq 's' -and $v.Count -gt 0) {
          $idx = [int]$v[0].InnerText
          $need[$idx] = $true
          $values[$i] = $idx
        } elseif ($v.Count -gt 0) { $values[$i] = [string]$v[0].InnerText }
        else { $values[$i] = '' }
      }
      $sst = @{}
      if ($need.Count -gt 0) {
        $max = ($need.Keys | Measure-Object -Maximum).Maximum
        $sstEntry = $zip.GetEntry($sstPath)
        if ($null -ne $sstEntry) {
          $xr = [Xml.XmlReader]::Create($sstEntry.Open(), (New-XmlSettings))
          try {
            $k = -1
            [void]$xr.Read()
            while (-not $xr.EOF) {
              if ($xr.NodeType -eq [Xml.XmlNodeType]::Element -and $xr.LocalName -eq 'si') {
                $k++
                if ($k -gt $max) { break }
                if ($need.ContainsKey($k)) { $sst[$k] = Get-TextOf (Get-XmlDoc $xr.ReadOuterXml()).DocumentElement }
                else { $xr.Skip() }
                continue
              }
              [void]$xr.Read()
            }
          } finally { $xr.Dispose() }
        }
      }
      $cells = New-Object Collections.Generic.List[string]
      for ($i = 0; $i -lt $values.Count; $i++) {
        $val = $values[$i]
        if ($val -is [int]) { if ($sst.ContainsKey($val)) { $val = $sst[$val] } else { $val = '' } }
        $cells.Add([string]$val)
      }
      if ($cells.Count -eq 0) { $lines.Add('첫 시트 첫 줄이 비어 있음') }
      else { $lines.Add('첫 시트 첫 줄 · ' + (Format-FirstRow $cells.ToArray())) }
      return $lines.ToArray()
    } finally { $zip.Dispose() }
  } finally { $fs.Dispose() }
}

function Find-Close([string]$text, [int]$open) {
  $depth = 0; $q = [char]0
  for ($i = $open; $i -lt $text.Length; $i++) {
    $c = $text[$i]
    if ($q -ne [char]0) { if ($c -eq $q) { $q = [char]0 }; continue }
    if ($c -eq [char]"'" -or $c -eq [char]'"' -or $c -eq [char]'`') { $q = $c; continue }
    if ($c -eq [char]'[') { $q = [char]']'; continue }
    if ($c -eq [char]'(') { $depth++ }
    elseif ($c -eq [char]')') { $depth--; if ($depth -eq 0) { return $i } }
  }
  return -1
}

function Get-FirstWord([string]$s) {
  $t = $s.Trim()
  if ($t.Length -eq 0) { return '' }
  $pairs = @{ '"' = '"'; '`' = '`'; '[' = ']'; "'" = "'" }
  $first = $t.Substring(0, 1)
  if ($pairs.ContainsKey($first)) {
    $close = $t.IndexOf($pairs[$first], 1)
    if ($close -gt 0) { return $t.Substring(1, $close - 1) }
    return $t.Substring(1)
  }
  $m = [regex]::Match($t, '^[^\s(,]+')
  return $m.Value
}

function Read-SqliteTables([string]$file) {
  $b = Read-Head $file $SqliteBytes
  if ($b.Length -lt 100) { return @('못 읽음') }
  $ps = [int]$b[16] * 256 + [int]$b[17]
  if ($ps -eq 1) { $ps = 65536 }
  if ($ps -lt 512 -or $ps -gt 65536 -or ($ps -band ($ps - 1)) -ne 0) { $ps = 4096 }
  $found = New-Object Collections.Generic.List[string]
  $seen = @{}
  for ($off = 0; $off -lt $b.Length; $off += $ps) {
    $n = [Math]::Min($ps, $b.Length - $off)
    $text = $Latin1.GetString($b, $off, $n)   # 바이트 1개 = 글자 1개라 자리가 그대로 맞다
    foreach ($m in [regex]::Matches($text, 'CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?', 'IgnoreCase')) {
      $nameStart = $m.Index + $m.Length
      $open = $text.IndexOf('(', $nameStart)
      if ($open -lt 0 -or $open - $nameStart -gt 200) { continue }
      $close = Find-Close $text $open
      if ($close -lt 0) { continue }          # 이 쪽 안에서 괄호가 닫히지 않으면 건너뜀
      $rawName = (ConvertFrom-Bytes $b ($off + $nameStart) ($open - $nameStart)).Trim()
      $tname = Get-FirstWord ($rawName.Split('.')[-1])
      $body = ConvertFrom-Bytes $b ($off + $open + 1) ($close - $open - 1)
      # 맨 바깥 쉼표로 칸을 나눈다
      $parts = New-Object Collections.Generic.List[string]
      $depth = 0; $last = 0
      for ($i = 0; $i -lt $body.Length; $i++) {
        $c = $body[$i]
        if ($c -eq [char]'(') { $depth++ }
        elseif ($c -eq [char]')') { $depth-- }
        elseif ($c -eq [char]',' -and $depth -eq 0) { $parts.Add($body.Substring($last, $i - $last)); $last = $i + 1 }
      }
      $parts.Add($body.Substring($last))
      $cols = New-Object Collections.Generic.List[string]
      foreach ($p in $parts) {
        $w = Get-FirstWord $p
        if ($w.Length -eq 0) { continue }
        if ($w -match '^(CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN)$' -and $p.Trim().Substring(0, 1) -notmatch '["`\[]') { continue }
        $cols.Add((Get-SafeName $w))
      }
      $line = (Get-SafeName $tname) + ': ' + ((@($cols | Select-Object -First $MaxColumns)) -join ', ')
      if (-not $seen.ContainsKey($line)) { $seen[$line] = $true; $found.Add($line) }
      if ($found.Count -ge 100) { break }
    }
    if ($found.Count -ge 100) { break }
  }
  if ($found.Count -eq 0) { return @('못 읽음') }
  return @(@('표 ' + $found.Count + '개') + $found.ToArray())
}

function Test-NotRegistered($err) {
  $e = $err.Exception
  while ($null -ne $e) {
    if ($e -is [InvalidOperationException]) { return $true }
    $e = $e.InnerException
  }
  return $false
}

function Read-AccessTables([string]$file, [int64]$size) {
  if ($size -gt $AccessMax) { return @('200MB보다 큼 — 건너뜀') }
  $tmp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  if (Test-InsideRoot $tmp) { return @('임시 폴더가 조사 폴더 안 — 건너뜀') }
  $ext = [IO.Path]::GetExtension($file)
  if ($ext -notmatch '^\.(mdb|accdb)$') { $ext = '.mdb' }
  $copy = Join-Path $tmp ('emr-survey-' + [guid]::NewGuid().ToString('N') + $ext)
  $stem = $copy.Substring(0, $copy.Length - $ext.Length)
  try {
    # 원본은 같이 열기로 읽기만 하고, 잠금 파일(.ldb)이 원본 옆에 생기지 않게 임시 복사본을 연다
    $src = Open-Shared $file
    try {
      $dst = [IO.File]::Open($copy, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
      try { $src.CopyTo($dst) } finally { $dst.Dispose() }
    } finally { $src.Dispose() }
    $missing = 0
    foreach ($prov in @('Microsoft.ACE.OLEDB.12.0', 'Microsoft.Jet.OLEDB.4.0')) {
      $conn = New-Object Data.OleDb.OleDbConnection("Provider=$prov;Data Source=$copy;Mode=Read;")
      try {
        try { $conn.Open() } catch {
          if (Test-NotRegistered $_) { $missing++; continue }
          return @('열 수 없음(망가졌거나 암호가 걸린 파일일 수 있음)')
        }
        $tables = $conn.GetSchema('Tables')
        $columns = $conn.GetSchema('Columns')
        $lines = New-Object Collections.Generic.List[string]
        foreach ($t in $tables.Rows) {
          if ([string]$t['TABLE_TYPE'] -ne 'TABLE') { continue }
          $tn = [string]$t['TABLE_NAME']
          $cols = @($columns.Rows | Where-Object { [string]$_['TABLE_NAME'] -eq $tn } |
              Sort-Object { [int]$_['ORDINAL_POSITION'] } | Select-Object -First $MaxColumns |
              ForEach-Object { Get-SafeName ([string]$_['COLUMN_NAME']) })
          $lines.Add((Get-SafeName $tn) + ': ' + ($cols -join ', '))
          if ($lines.Count -ge 100) { break }
        }
        if ($lines.Count -eq 0) { return @('표 없음') }
        return @(@('표 ' + $lines.Count + '개') + $lines.ToArray())
      } finally { $conn.Dispose() }
    }
    return @('드라이버 없음(Access 드라이버가 이 PC에 없어요)')
  } catch {
    return @('열 수 없음')
  } finally {
    foreach ($p in @($copy, ($stem + '.ldb'), ($stem + '.laccdb'))) {
      try { if ([IO.File]::Exists($p)) { [IO.File]::Delete($p) } } catch { }
    }
  }
}

# ---------- 걷기 ----------
Write-Host '폴더를 살펴보는 중이에요… (읽기만 해요. 파일이 많으면 몇 분 걸릴 수 있어요)'
$walkErrors = @()
$files = @(Get-ChildItem -LiteralPath $root -Recurse -Depth 8 -File -Force -ErrorAction SilentlyContinue -ErrorVariable +walkErrors |
    Select-Object -First ($MaxFiles + 1))
$capped = $files.Count -gt $MaxFiles
if ($capped) { $files = @($files[0..($MaxFiles - 1)]) }
$dirCount = @(Get-ChildItem -LiteralPath $root -Recurse -Depth 8 -Directory -Force -ErrorAction SilentlyContinue -ErrorVariable +walkErrors).Count

$ExtCount = @{}
foreach ($f in $files) { $r = Get-ExtRaw $f.Name; $ExtCount[$r] = 1 + [int]$ExtCount[$r] }

$totalSize = [int64]0
$latest = $null
$extStats = @{}
$shapeCount = @{}
$kindCount = @{}
foreach ($k in $KindNames) { $kindCount[$k] = 0 }
$unopened = 0
$cand = @{}
foreach ($k in @('DBF', 'CSV·TXT', 'XLSX', 'SQLite', 'Access')) { $cand[$k] = New-Object Collections.Generic.List[object] }

foreach ($f in $files) {
  $raw = Get-ExtRaw $f.Name
  $ext = Get-Ext $raw
  if ($null -eq $ext) { $label = $OtherExt } elseif ($ext -eq '') { $label = $NoExt } else { $label = $ext }
  $totalSize += $f.Length
  if ($null -eq $latest -or $f.LastWriteTime -gt $latest) { $latest = $f.LastWriteTime }
  if (-not $extStats.ContainsKey($label)) { $extStats[$label] = @{ Files = 0; Bytes = [int64]0; Latest = $f.LastWriteTime } }
  $st = $extStats[$label]
  $st.Files++; $st.Bytes += $f.Length
  if ($f.LastWriteTime -gt $st.Latest) { $st.Latest = $f.LastWriteTime }
  $shape = Get-NameShape $f.Name $ext
  $shapeCount[$shape] = 1 + [int]$shapeCount[$shape]

  if ($raw -eq 'mdf' -or $raw -eq 'ndf' -or $raw -eq 'ldf') { $kind = 'SQL Server 데이터 파일' }
  else {
    try { $kind = Get-Kind $raw (Read-Head $f.FullName $HeadBytes) } catch { $kind = $null }
  }
  if ($null -eq $kind) { $unopened++; continue }
  $kindCount[$kind]++
  $item = @{ File = $f; Shape = $shape }
  switch ($kind) {
    'DBF' { $cand['DBF'].Add($item) }
    '글자 파일' { if ($raw -eq 'csv' -or $raw -eq 'txt' -or $raw -eq 'tsv') { $cand['CSV·TXT'].Add($item) } }
    'ZIP(xlsx 등)' { if ($raw -eq 'xlsx' -or $raw -eq 'xlsm') { $cand['XLSX'].Add($item) } }
    'SQLite' { $cand['SQLite'].Add($item) }
    'Access/Jet' { $cand['Access'].Add($item) }
  }
}

# ---------- 보고서 ----------
$L = New-Object Collections.Generic.List[string]
$L.Add('EMR 폴더 조사 보고서')
$L.Add('만든 때: ' + (Format-Time (Get-Date)))
$L.Add('조사한 폴더: ' + $root)
$L.Add('이 보고서에는 실제 파일 이름과 환자 값이 없어요. 파일 이름은 모양(숫자→9, 한글→가, 영문→a, 그 밖 글자→x)으로만, 표는 칸 이름만 적었어요.')
$L.Add('보내기 전에 한 번 훑어보고, 사람 이름처럼 보이는 칸(특히 영문)이 있으면 그 줄을 지우고 보내 주세요.')
$L.Add('')
$L.Add('[1] 폴더 전체')
$L.Add('  파일 수: ' + $files.Count + '개')
$L.Add('  크기 합: ' + (Format-Size $totalSize) + ' (' + $totalSize.ToString('N0', $Inv) + '바이트)')
$L.Add('  하위 폴더 수: ' + $dirCount + '개')
if ($null -ne $latest) { $L.Add('  가장 최근 고친 시각: ' + (Format-Time $latest)) } else { $L.Add('  가장 최근 고친 시각: 없음') }
if ($capped) { $L.Add('  파일이 ' + $MaxFiles.ToString('N0', $Inv) + '개가 넘어 거기까지만 봤어요.') }
if ($walkErrors.Count -gt 0) { $L.Add('  들어가지 못한 곳(권한 없음 등): ' + $walkErrors.Count + '곳') }
$L.Add('')
$L.Add('[2] 확장자별 묶음 (많은 차례) — 확장자 · 개수 · 크기 합 · 가장 최근 고친 시각')
if ($extStats.Count -eq 0) { $L.Add('  없음') }
foreach ($e in ($extStats.GetEnumerator() | Sort-Object @{ Expression = { $_.Value.Files }; Descending = $true }, @{ Expression = { $_.Key } })) {
  $L.Add('  ' + $e.Key + ' · ' + $e.Value.Files + '개 · ' + (Format-Size $e.Value.Bytes) + ' · ' + (Format-Time $e.Value.Latest))
}
$L.Add('')
$L.Add('[3] 파일 종류 (앞 바이트로 알아봄)')
foreach ($k in $KindNames) { $L.Add('  ' + $k + ': ' + $kindCount[$k] + '개') }
if ($unopened -gt 0) { $L.Add('  열지 못함(다른 프로그램이 잠금 등): ' + $unopened + '개') }
$L.Add('')
$L.Add('[4] 이름 모양 (많은 차례 30개까지)')
if ($shapeCount.Count -eq 0) { $L.Add('  없음') }
foreach ($s in ($shapeCount.GetEnumerator() | Sort-Object @{ Expression = { $_.Value }; Descending = $true }, @{ Expression = { $_.Key } } | Select-Object -First 30)) {
  $L.Add('  ' + $s.Key + ' · ' + $s.Value + '개')
}
$L.Add('')
$L.Add('[5] 표 모양 파일의 칸 이름 (종류마다 가장 최근 5개까지, 둘째 줄부터의 값은 읽지 않음)')
foreach ($kind in @('DBF', 'CSV·TXT', 'XLSX', 'SQLite', 'Access')) {
  $L.Add('  ■ ' + $kind)
  $list = @($cand[$kind] | Sort-Object { $_.File.LastWriteTime } -Descending | Select-Object -First $PerKind)
  if ($list.Count -eq 0) { $L.Add('    없음'); continue }
  $no = 0
  foreach ($it in $list) {
    $no++
    $f = $it.File
    $L.Add('    ' + $no + ') ' + $it.Shape + ' · ' + (Format-Size $f.Length) + ' · ' + (Format-Time $f.LastWriteTime))
    try {
      switch ($kind) {
        'DBF' { $detail = Read-DbfColumns $f.FullName }
        'CSV·TXT' { $detail = Read-CsvColumns $f.FullName }
        'XLSX' { $detail = Read-XlsxColumns $f.FullName $f.Length }
        'SQLite' { $detail = Read-SqliteTables $f.FullName }
        'Access' { $detail = Read-AccessTables $f.FullName $f.Length }
      }
    } catch { $detail = @('못 읽음') }
    foreach ($d in @($detail)) { $L.Add('       ' + $d) }
  }
}
$L.Add('')
$L.Add('[6] SQL Server 서비스 (이름·상태만, 연결하지 않음)')
$svcs = @()
try { $svcs = @(Get-Service -Name 'MSSQL*', 'SQLAgent*' -ErrorAction SilentlyContinue | Sort-Object Name) } catch { }
if ($svcs.Count -eq 0) { $L.Add('  없음') }
foreach ($s in $svcs) {
  switch ([string]$s.Status) {
    'Running' { $state = '켜져 있음' }
    'Stopped' { $state = '꺼져 있음' }
    default { $state = [string]$s.Status }
  }
  $L.Add('  ' + $s.Name + ' · ' + $state)
}
$L.Add('')
$L.Add('끝. 다음에 할 일은 scripts/emr-survey/README.md를 보세요.')

$text = ($L -join "`r`n") + "`r`n"
$outDir = [IO.Path]::GetDirectoryName($outFull)
if ($outDir -and -not [IO.Directory]::Exists($outDir)) { [void][IO.Directory]::CreateDirectory($outDir) }
[IO.File]::WriteAllText($outFull, $text, (New-Object Text.UTF8Encoding($true)))
Write-Host $text
Write-Host ('보고서를 저장했어요: ' + $outFull)
exit 0
