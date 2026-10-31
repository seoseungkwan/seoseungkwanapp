using System;
using System.Net;

namespace Precheck.Core.Bit;

/// <summary>
/// 비트 DB 서버 이름 검사(AC-005.2). 원본 HospitalSecurity.CheckPrivateServer 그대로: 이 PC(`.`·`(local)`·`localhost`·PC 이름)나
/// 사설 IPv4(127·10·172.16~31·192.168)만 된다. `tcp:` 앞붙임은 되고 그 밖의 `xx:` 연결 방식(named pipe 등)은 막는다.
/// 이름을 찾아보지 않는다(DNS·네트워크 없이 글자만 본다).
/// </summary>
public static class PrivateServer
{
    public static bool IsAllowed(string? server, string machineName)
    {
        var value = (server ?? "").Trim();
        if (value.StartsWith("tcp:", StringComparison.OrdinalIgnoreCase)) value = value.Substring(4);
        else if (value.IndexOf(':') >= 0) return false;

        var host = value.Split('\\')[0].Split(',')[0].Trim();
        if (host == "." || host.Equals("(local)", StringComparison.OrdinalIgnoreCase) || host.Equals("localhost", StringComparison.OrdinalIgnoreCase)) return true;
        if (!string.IsNullOrWhiteSpace(machineName) && host.Equals(machineName.Trim(), StringComparison.OrdinalIgnoreCase)) return true;

        if (!IPAddress.TryParse(host, out var address)) return false;
        var bytes = address.GetAddressBytes();
        return bytes.Length == 4 &&
            (bytes[0] == 127 || bytes[0] == 10 || (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31) || (bytes[0] == 192 && bytes[1] == 168));
    }

    /// <summary>안 되는 서버면 BitException(E-BIT-DB-FAILED). 접속하기 전에 부른다.</summary>
    public static void Require(string? server, string machineName)
    {
        if (!IsAllowed(server, machineName)) throw new BitException(BitErrors.DbFailed);
    }
}
