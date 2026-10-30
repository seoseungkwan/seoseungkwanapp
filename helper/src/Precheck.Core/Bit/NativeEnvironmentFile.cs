using System;
using System.IO;
using System.Xml;

namespace Precheck.Core.Bit;

/// <summary>비트 환경 파일(DrBIT50Environment.ini)의 첫 Setting 줄에 적힌 설치 경로 Path와 실행 폴더 Bin(글자 그대로).</summary>
public sealed class BitEnvironment
{
    public BitEnvironment(string? path, string? bin)
    {
        Path = path;
        Bin = bin;
    }

    public string? Path { get; }

    public string? Bin { get; }
}

/// <summary>
/// 원본 NativeEnvironmentGuard.TryReadConfiguration 읽기 규칙: DTD 금지, 맨 위 첫 Setting 줄의 바로 아래 Path·Bin만 읽고
/// (접속 정보는 읽지 않는다) 같은 이름이 두 번이면 깨진 것으로 본다. 파일을 고치거나 새로 만들지 않는다.
/// </summary>
public static class NativeEnvironmentFile
{
    /// <summary>읽은 Path·Bin(없는 칸은 null). 깨졌거나 Setting 줄이 없으면 null.</summary>
    public static BitEnvironment? Parse(Stream input)
    {
        if (input == null) throw new ArgumentNullException(nameof(input));
        try
        {
            string? rawRoot = null;
            string? rawBin = null;
            var foundSetting = false;
            var options = new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null, IgnoreComments = true };
            using (var reader = XmlReader.Create(input, options))
            {
                while (reader.Read())
                {
                    if (reader.NodeType != XmlNodeType.Element || reader.Depth != 1 ||
                        !reader.LocalName.Equals("Setting", StringComparison.OrdinalIgnoreCase)) continue;
                    foundSetting = true;
                    using (var row = reader.ReadSubtree())
                    {
                        while (row.Read())
                        {
                            if (row.NodeType != XmlNodeType.Element || row.Depth != 1) continue;
                            var isPath = row.LocalName.Equals("Path", StringComparison.OrdinalIgnoreCase);
                            var isBin = row.LocalName.Equals("Bin", StringComparison.OrdinalIgnoreCase);
                            if (!isPath && !isBin) continue;
                            // 안쪽 읽개를 따로 써야 붙어 있는 다음 형제를 건너뛰지 않는다(원본과 같음)
                            using (var property = row.ReadSubtree())
                            {
                                property.Read();
                                var value = property.ReadElementContentAsString();
                                if (isPath)
                                {
                                    if (rawRoot != null) return null;
                                    rawRoot = value;
                                }
                                else
                                {
                                    if (rawBin != null) return null;
                                    rawBin = value;
                                }
                            }
                        }
                    }
                    break;
                }
            }
            return foundSetting ? new BitEnvironment(rawRoot, rawBin) : null;
        }
        catch (XmlException)
        {
            return null;
        }
        catch (IOException)
        {
            return null;
        }
        catch (InvalidOperationException)
        {
            return null;
        }
    }
}
