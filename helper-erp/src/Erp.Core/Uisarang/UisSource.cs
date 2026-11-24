using System;
using System.IO;
using System.Text;
using System.Text.Json;

namespace Erp.Core.Uisarang;

/// <summary>
/// 자료원 파일 data\source.json(spec erp-uisarang design.md 4-1·4-3, AC-4201.3) = { "v": 1, "source": "uisarang", "folder": "desktop" | "profile" }.
/// 있으면 의사랑 PC, 없거나 모양이 틀리면 비트 PC(지금 그대로). 글자 그대로 둔다(보호 없음 — 환자·병원 정보 없음).
/// 도우미는 켤 때 한 번 Read 하고, 의사랑 등록에서 WriteUisarang, 비트 등록 저장 뒤 Delete 한다(TASK-15).
/// </summary>
public static class UisSource
{
    public const string FileName = "source.json";

    /// <summary>이보다 큰 파일은 모양이 틀린 것으로 본다(바른 파일은 50바이트쯤).</summary>
    public const int MaxBytes = 4096;

    private const string SourceValue = "uisarang";

    /// <summary>모양이 맞으면 의사랑(폴더 종류), 없거나·읽지 못하거나·모양이 틀리면 null(= 비트). 예외를 내지 않는다(빈 dataDir만 ArgumentException).</summary>
    public static UisSourceFile? Read(string dataDir)
    {
        var path = FilePath(dataDir);
        byte[] bytes;
        try
        {
            if (!File.Exists(path) || new FileInfo(path).Length > MaxBytes) return null;
            bytes = File.ReadAllBytes(path);
        }
        catch (IOException)
        {
            return null;
        }
        catch (UnauthorizedAccessException)
        {
            return null;
        }
        if (bytes.Length > MaxBytes) return null;
        return Parse(bytes);
    }

    /// <summary>
    /// 의사랑 자료원을 쓴다(data 폴더가 없으면 만든다). 같은 폴더 임시 파일에 다 쓴 뒤 바꿔 넣어 반쯤 쓴 파일이 남지 않는다.
    /// 쓰지 못하면 IOException·UnauthorizedAccessException 그대로(부르는 쪽이 등록 실패로 다룬다).
    /// </summary>
    public static void WriteUisarang(string dataDir, UisFolderKind folder)
    {
        var path = FilePath(dataDir);
        var text = "{\"v\":1,\"source\":\"" + SourceValue + "\",\"folder\":\"" + UisNames.Of(folder) + "\"}";
        var bytes = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false).GetBytes(text);
        Directory.CreateDirectory(dataDir);
        var temporary = Path.Combine(dataDir, FileName + "." + Guid.NewGuid().ToString("N") + ".tmp");
        try
        {
            using (var output = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                output.Write(bytes, 0, bytes.Length);
                output.Flush(true);
            }
            if (File.Exists(path)) File.Replace(temporary, path, null);
            else File.Move(temporary, path);
        }
        finally
        {
            if (File.Exists(temporary)) File.Delete(temporary);
        }
    }

    /// <summary>자료원 파일만 지운다(없으면 아무것도 안 함). 못 지우면 IOException·UnauthorizedAccessException 그대로.</summary>
    public static void Delete(string dataDir)
    {
        var path = FilePath(dataDir);
        if (File.Exists(path)) File.Delete(path);
    }

    private static string FilePath(string dataDir)
    {
        if (string.IsNullOrWhiteSpace(dataDir)) throw new ArgumentException("data 폴더가 비었다", nameof(dataDir));
        return Path.Combine(dataDir, FileName);
    }

    /// <summary>세 칸(v = 정수 1, source = 'uisarang', folder = 'desktop'|'profile')만 있는 객체 하나. 칸 차례·빈칸·BOM은 상관없다.</summary>
    private static UisSourceFile? Parse(byte[] bytes)
    {
        var start = bytes.Length >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF ? 3 : 0;
        try
        {
            using var json = JsonDocument.Parse(new ReadOnlyMemory<byte>(bytes, start, bytes.Length - start));
            var root = json.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return null;

            bool v = false, source = false;
            UisFolderKind? folder = null;
            var count = 0;
            foreach (var property in root.EnumerateObject())
            {
                count++;
                var value = property.Value;
                switch (property.Name)
                {
                    case "v":
                        if (v) return null;
                        v = value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number) && number == 1;
                        if (!v) return null;
                        break;
                    case "source":
                        if (source) return null;
                        source = value.ValueKind == JsonValueKind.String && value.GetString() == SourceValue;
                        if (!source) return null;
                        break;
                    case "folder":
                        if (folder != null) return null;
                        folder = value.ValueKind == JsonValueKind.String ? FolderOf(value.GetString()) : null;
                        if (folder == null) return null;
                        break;
                    default:
                        return null;
                }
            }
            return count == 3 && v && source && folder != null ? new UisSourceFile(folder.Value) : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static UisFolderKind? FolderOf(string? name)
    {
        if (name == UisNames.Of(UisFolderKind.Desktop)) return UisFolderKind.Desktop;
        if (name == UisNames.Of(UisFolderKind.Profile)) return UisFolderKind.Profile;
        return null;
    }
}
