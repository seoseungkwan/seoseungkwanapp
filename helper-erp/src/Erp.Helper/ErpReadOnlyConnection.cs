using System;
using System.Collections.Generic;
using System.Data.SqlClient;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using Erp.Core;
using Precheck.Core.Bit;
using Precheck.Windows;

namespace Erp.Helper;

/// <summary>
/// ERP 도우미 비트 접속 굳히기(spec erp-bit-anywhere AC-3804.3). 기존 ReadOnlyConnection과 같은 길(비트 DLL 접속 정보 → 접속 10초·이름·
/// 비밀번호 안 남김·DB 이름 검사)이고, 다른 것은 셋이다: 서버 검사는 ErpServerRules(이름이 병원 안 주소로만 풀리면 받음),
/// 예비 서버(FailoverPartner)는 거절, 등록 단계(ErpStage)를 적는다. 접속 글자의 서버 값은 바꾸지 않는다(비트와 같은 이름으로 붙는다).
/// 접속 글자(비밀번호 포함)는 메모리에만 있고 어디에도 쓰지 않는다. 기존 ReadOnlyConnection은 고치지 않는다.
/// </summary>
public static class ErpReadOnlyConnection
{
    /// <summary>비트 DLL을 미리 불러 두고(AC-3805.1) 접속 정보를 읽어 굳힌다. 비트 DLL을 못 쓰거나 서버가 막히면 E-BIT-DB-FAILED.</summary>
    public static ReadOnlyConnectionInfo Create(string installRoot)
    {
        ErpStage.Set(ErpStage.Load);
        ErpVendorPreload.Load(installRoot);
        var source = VendorConnectionString(installRoot);
        return Harden(source, installRoot, Environment.MachineName, name => Dns.GetHostAddresses(name), LocalNetworks());
    }

    /// <summary>접속 글자를 굳힌다(기존 ReadOnlyConnection.Harden과 같은 차례, 서버 검사·예비 서버·단계만 다름).</summary>
    public static ReadOnlyConnectionInfo Harden(string sourceConnectionString, string installRoot, string machineName, Func<string, IReadOnlyList<IPAddress>> resolve, IReadOnlyList<ErpLocalNetwork> localNetworks)
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
        options.ApplicationName = ReadOnlyConnection.ApplicationName;
        options.PersistSecurityInfo = false;
        ErpStage.Set(ErpStage.Server);
        ErpServerRules.Require(options.DataSource, machineName, resolve, localNetworks);
        if (!string.IsNullOrEmpty(options.FailoverPartner)) throw new BitException(BitErrors.DbFailed);
        if (string.IsNullOrWhiteSpace(options.InitialCatalog)) throw new BitException(BitErrors.DbFailed);
        return new ReadOnlyConnectionInfo(options.ConnectionString, new BitTarget(installRoot, options.DataSource, options.InitialCatalog));
    }

    /// <summary>기존 private ReadOnlyConnection.VendorConnectionString(설치 폴더)과 같은 몸통: 설치 폴더 EXE의 비트 DLL에서 BITDataBaseCommon을 찾아 접속 글자를 읽는다.</summary>
    private static string VendorConnectionString(string installRoot)
    {
        Type type;
        try
        {
            type = VendorRuntime.Load(installRoot, ReadOnlyConnection.VendorAssembly).GetType(ReadOnlyConnection.VendorType, true)!;
        }
        catch (Exception e) when (!(e is BitException))
        {
            // 비트 DLL 안의 예외 글은 버린다(접속 정보가 섞일 수 있다)
            throw new BitException(BitErrors.DbFailed);
        }
        return ReadOnlyConnection.VendorConnectionString(type);
    }

    /// <summary>켜진 네트워크 카드의 IPv6 주소·접두 길이(AC-3804.1: 인터넷 IPv6가 이 PC와 같은 망인지). 읽지 못하면 빈 목록.</summary>
    private static IReadOnlyList<ErpLocalNetwork> LocalNetworks()
    {
        var networks = new List<ErpLocalNetwork>();
        try
        {
            foreach (var card in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (card.OperationalStatus != OperationalStatus.Up) continue;
                foreach (var unicast in card.GetIPProperties().UnicastAddresses)
                {
                    if (unicast.Address.AddressFamily != AddressFamily.InterNetworkV6) continue;
                    networks.Add(new ErpLocalNetwork(unicast.Address, unicast.PrefixLength));
                }
            }
        }
        catch (Exception e) when (e is NetworkInformationException || e is InvalidOperationException || e is PlatformNotSupportedException || e is NotImplementedException)
        {
            networks.Clear();
        }
        return networks;
    }
}
