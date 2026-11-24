# ERP 마감일지 도우미 설치 (specs/erp-closing-fill/design.md 3-5, AC-3611.5)
# - 관리자 권한이 필요 없다. 이 윈도우 사용자의 폴더(%LOCALAPPDATA%\Seoseungkwan\ErpHelper)와 사용자 레지스트리(HKCU)의 ERP 도우미 열쇠 하나만 쓴다
# - 프로그램은 ErpHelper\app에 둔다. 돌던 ERP 도우미를 먼저 끝내고 덮어쓴다. data\(이 PC 등록)와 logs\(진단 기록)는 건드리지 않는다
# - 다른 도우미의 폴더·크롬 등록은 읽지도 쓰지도 않는다
# - 끝에 이 PC 등록(비트 로그인 창 → 병원 확인 → PC 확인 창, 의사랑 PC는 창 없이)을 띄우고, 끝날 때까지 기다려 결과를 알린다
# - 윈도우 PowerShell 5.1(윈도우 10·11 기본)에서 돈다. 한글 문구가 깨지지 않게 이 파일은 UTF-8 BOM으로 저장한다
# - 부르는 법: zip을 모두 푼 폴더에서 install.cmd를 누른다
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 3.0

$hostName = 'com.seoseungkwan.erp_helper'
$helperName = 'SeoseungkwanErpHelper'
$regKey = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.seoseungkwan.erp_helper'
$appSource = Join-Path $PSScriptRoot 'app'
$template = Join-Path $PSScriptRoot 'host-manifest.json'

$exitCode = 0
$installed = $false
try {
    if (-not $env:LOCALAPPDATA) { throw '이 윈도우 사용자의 LOCALAPPDATA 폴더를 찾지 못했어요.' }
    $installDir = Join-Path $env:LOCALAPPDATA 'Seoseungkwan\ErpHelper\app'
    if (-not (Test-Path -LiteralPath (Join-Path $appSource "$helperName.exe")) -or -not (Test-Path -LiteralPath $template)) {
        throw "설치할 파일이 없어요. 받은 zip을 오른쪽 클릭 → '모두 압축 풀기'를 한 뒤, 푼 폴더에서 install.cmd를 누르세요."
    }

    # 1. 돌던 ERP 도우미를 끝낸다(켜져 있으면 파일을 덮어쓸 수 없다). 이 윈도우 로그인의 것만 끈다
    $session = [System.Diagnostics.Process]::GetCurrentProcess().SessionId
    $running = @(Get-Process -Name $helperName -ErrorAction SilentlyContinue | Where-Object { $_.SessionId -eq $session })
    if ($running.Count -gt 0) {
        Write-Host '켜져 있던 ERP 도우미를 끕니다.'
        $running | Stop-Process -Force
        $running | Wait-Process -Timeout 15 -ErrorAction SilentlyContinue
    }

    # 2. 프로그램 파일을 app\에 덮어쓴다. zip의 app\ 안 파일만 옮긴다
    New-Item -ItemType Directory -Force -Path $installDir | Out-Null
    Get-ChildItem -LiteralPath $appSource -File | Copy-Item -Destination $installDir -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'uninstall.ps1') -Destination $installDir -Force
    # 인터넷에서 받은 파일 표시를 지워, 크롬이 도우미를 켤 때 윈도우가 막지 않게 한다
    Get-ChildItem -LiteralPath $installDir -File | Unblock-File

    # 3. 등록 파일: 틀(host-manifest.json)의 path를 실제 exe 경로로 채워 프로그램 폴더에 쓴다(UTF-8, BOM 없음)
    $exePath = Join-Path $installDir "$helperName.exe"
    $manifestPath = Join-Path $installDir "$hostName.json"
    $json = [System.IO.File]::ReadAllText($template, [System.Text.Encoding]::UTF8)
    if (-not $json.Contains('"__HELPER_EXE__"')) { throw '등록 파일 틀(host-manifest.json)이 틀렸어요.' }
    $json = $json.Replace('"__HELPER_EXE__"', '"' + $exePath.Replace('\', '\\') + '"')
    [System.IO.File]::WriteAllText($manifestPath, $json, (New-Object System.Text.UTF8Encoding($false)))

    # 4. 크롬이 ERP 도우미를 찾는 자리(사용자 레지스트리)의 기본값에 등록 파일 경로를 쓴다
    if (-not (Test-Path -LiteralPath $regKey)) { New-Item -Path $regKey -Force | Out-Null }
    Set-ItemProperty -LiteralPath $regKey -Name '(default)' -Value $manifestPath

    $installed = $true
    Write-Host ''
    Write-Host 'ERP 도우미를 설치했어요.' -ForegroundColor Green
    Write-Host "설치한 곳: $installDir"
}
catch {
    $exitCode = 1
    Write-Host ''
    Write-Host '설치하지 못했어요.' -ForegroundColor Red
    Write-Host $_.Exception.Message
    Write-Host '크롬의 ERP 화면을 닫고 다시 해 보세요. 그래도 안 되면 이 창을 사진으로 찍어 보내 주세요.'
}

# 5. 이 PC 등록: 설치가 끝났을 때만. 등록 모드(--register)로 켜고 끝날 때까지 기다린다(PC 확인 창은 5분 뒤 저절로 닫힌다).
#    종료 번호: 0 저장 · 1 취소 · 2 오류(그 밖 번호도 오류로 본다)
#    오류면 도우미가 표준 출력에 오류 번호(E-…)와 멈춘 단계(STEP-…)를 한 줄씩 쓴다. 그것과 까닭을 창에 보여 사진으로 알 수 있게 한다(spec erp-bit-anywhere AC-3806.3)
#    비트가 없고 의사랑이 있는 PC는 창 없이 의사랑 PC로 등록하고 0과 함께 SOURCE-UISARANG·FOLDER-DESKTOP|FOLDER-PROFILE을 한 줄씩 쓴다(spec erp-uisarang AC-4201.2·AC-4201.4)
if ($installed) {
    Write-Host ''
    Write-Host '이 PC를 등록합니다. 비트 PC면 비트 로그인 창이 뜨니 로그인하고, 병원을 확인한 뒤 [확인]을 누르세요. 의사랑 PC면 창 없이 끝나요.'
    $registerCode = 2
    $registerOutput = @()
    $launchError = $null
    try {
        $registerOutput = @(& $exePath '--register')
        $registerCode = $LASTEXITCODE
    }
    catch {
        $registerCode = 2
        $launchError = $_.Exception.Message
    }
    $registerLines = @($registerOutput | ForEach-Object { "$_".Trim() })
    $errorNumber = @($registerLines | Where-Object { $_ -cmatch '^E-[A-Z0-9-]+$' }) | Select-Object -Last 1
    $stepLine = @($registerLines | Where-Object { $_ -cmatch '^STEP-[A-Z]+$' }) | Select-Object -Last 1
    $uisarang = @($registerLines | Where-Object { $_ -ceq 'SOURCE-UISARANG' }).Count -gt 0
    $uisFolderProfile = @($registerLines | Where-Object { $_ -ceq 'FOLDER-PROFILE' }).Count -gt 0
    Write-Host ''
    switch ($registerCode) {
        # 의사랑 PC로 등록함(0 + SOURCE-UISARANG): 의사랑 글(엑셀 폴더 자리 두 갈래)만 보이고 아래 0 글은 건너뛴다
        { $_ -eq 0 -and $uisarang } {
            if ($uisFolderProfile) {
                $profileDir = $env:USERPROFILE
                if (-not $profileDir) { $profileDir = [Environment]::GetFolderPath('UserProfile') }
                $uisFolder = Join-Path $profileDir 'ERP마감'
                Write-Host ('의사랑 PC로 등록했어요. 바탕화면이 OneDrive와 이어져 있어, 환자 엑셀이 인터넷으로 올라가지 않게 엑셀 폴더를 ' + $uisFolder + '에 만들었어요. 의사랑 통계 엑셀은 이 폴더에 저장해 주세요.') -ForegroundColor Green
            }
            else {
                Write-Host '의사랑 PC로 등록했어요. 의사랑 통계 엑셀은 바탕화면 › ERP마감 폴더에 저장해 주세요.' -ForegroundColor Green
            }
            break
        }
        0 { Write-Host '이 PC를 등록했어요.' -ForegroundColor Green }
        1 {
            Write-Host '등록을 취소했어요. 다시 하려면 install.cmd를 다시 실행하세요.' -ForegroundColor Yellow
            Write-Host '직접 취소하지 않았는데 이 글이 나왔다면 이 창을 사진으로 찍어 보내 주세요.'
        }
        default {
            Write-Host '등록하지 못했어요.' -ForegroundColor Red
            if ($null -ne $launchError) {
                Write-Host '도우미 프로그램을 켜지 못했어요. 백신이나 윈도우 보안(스마트 앱 컨트롤 등)이 막았을 수 있어요.'
                Write-Host ('윈도우가 알린 내용: ' + $launchError)
            }
            elseif ($null -eq $errorNumber) {
                Write-Host ('도우미가 오류 번호 없이 끝났어요(끝 번호 ' + $registerCode + '). 백신이 도우미를 멈췄을 수 있어요.')
            }
            elseif ($errorNumber -ceq 'E-BIT-NOT-FOUND') {
                Write-Host '이 PC에서 비트를 찾지 못했어요. 이 PC에서 비트가 켜지는지 확인하세요. 다른 컴퓨터에 깔린 비트를 네트워크로 여는 PC는 안전 때문에 쓸 수 없어요.'
            }
            elseif ($errorNumber -ceq 'E-BIT-DB-FAILED') {
                Write-Host '비트 자료(DB)에 연결하지 못했어요. 이 PC에서 비트가 켜지는지, 자료 서버 컴퓨터가 켜져 있는지 확인하세요. 병원 밖 인터넷 주소의 자료 서버는 안전 때문에 쓸 수 없어요.'
            }
            elseif ($errorNumber -ceq 'E-UIS-FOLDER') {
                Write-Host 'ERP마감 엑셀 폴더를 만들지 못했어요. 같은 이름의 파일이 있거나 폴더 만들기가 막혔는지 확인하세요.'
            }
            elseif ($errorNumber -ceq 'E-STORE-FAILED' -and $stepLine -ceq 'STEP-UIS') {
                Write-Host '도우미 설정 파일(의사랑 표시)을 쓰거나 지우지 못했어요. 크롬을 모두 닫고, 백신이 막지 않는지 확인한 뒤 install.cmd를 다시 실행하세요.'
            }
            else {
                Write-Host '비트를 확인하다가 문제가 생겼어요.'
            }
            if ($null -ne $stepLine) {
                $step = $stepLine.Substring(5)
                $stepName = switch -CaseSensitive ($step) {
                    'FIND' { '비트 찾기' }
                    'LOAD' { '비트 파일 불러오기' }
                    'SERVER' { '자료 서버 주소 확인' }
                    'CONNECT' { '자료 서버 연결' }
                    'LOGIN' { '비트 로그인·병원 확인' }
                    'UIS' { '의사랑 등록(엑셀 폴더·자료원 파일)' }
                    default { $step }
                }
                Write-Host ('멈춘 단계: ' + $stepName + ' (' + $step + ')')
            }
            if ($null -ne $errorNumber) { Write-Host ('오류 번호: ' + $errorNumber) }
            Write-Host '이 창을 사진으로 찍어 보내 주세요.'
        }
    }
    if ($registerCode -eq 0) {
        Write-Host '열어 둔 ERP 마감일지 화면이 있으면 새로고침(F5)하세요.'
    }
    elseif ($registerCode -eq 1) {
        $exitCode = 1
    }
    else {
        $exitCode = 2
    }
}

Write-Host ''
[void](Read-Host '엔터를 누르면 이 창이 닫힙니다')
exit $exitCode
