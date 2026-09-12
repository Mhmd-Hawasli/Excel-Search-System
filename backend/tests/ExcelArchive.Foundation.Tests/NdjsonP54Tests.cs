using System.Text;
using ExcelArchive.Application.DTOs.MergeDto;
using System.Text.Json;
using ExcelArchive.Api.Common.Http;

namespace ExcelArchive.Foundation.Tests;

/// <summary>P5.4: NDJSON framing, split UTF-8/line boundaries, progress flow.</summary>
public sealed class NdjsonP54Tests
{
    [Fact]
    public async Task Stream_LinesFlushedIncrementally_ParseAsJson()
    {
        using var ms = new MemoryStream();
        await NdjsonWriter.StreamAsync(ms, async emit =>
        {
            await emit(NdjsonWriter.Progress(5, "قراءة الجدول الأول…"));
            await emit(NdjsonWriter.Result(new { sessionId = Guid.Empty }));
        });
        ms.Position = 0;
        var text = await new StreamReader(ms, Encoding.UTF8).ReadToEndAsync();
        var lines = text.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        Assert.Equal(2, lines.Length);
        using var d1 = JsonDocument.Parse(lines[0]);
        Assert.Equal("progress", d1.RootElement.GetProperty("type").GetString());
        Assert.Equal(5, d1.RootElement.GetProperty("percent").GetInt32());
        using var d2 = JsonDocument.Parse(lines[1]);
        Assert.Equal("result", d2.RootElement.GetProperty("type").GetString());
    }

    [Fact]
    public async Task Stream_SplitUtf8AcrossChunks_Reassembles()
    {
        using var ms = new MemoryStream();
        var arabic = "الرقم الوطني مرتبط بأكثر من شخص — مؤكد/غير مؤكد";
        await NdjsonWriter.StreamAsync(ms, async emit =>
        {
            await emit(NdjsonWriter.Error(arabic));
        });
        var bytes = ms.ToArray();
        // Feed bytes one at a time (guaranteed multibyte splits).
        var decoder = Encoding.UTF8.GetDecoder();
        var buffer = "";
        var events = new List<string>();
        var one = new byte[1];
        for (var i = 0; i < bytes.Length; i++)
        {
            one[0] = bytes[i];
            var chars = new char[4];
            var n = decoder.GetChars(one, 0, 1, chars, 0, false);
            buffer += new string(chars, 0, n);
            int index;
            while ((index = buffer.IndexOf('\n')) >= 0)
            {
                var line = buffer[..index].Trim();
                buffer = buffer[(index + 1)..];
                if (line.Length > 0) events.Add(line);
            }
        }
        decoder.GetChars([], 0, 0, new char[1], 0, true);
        Assert.Single(events);
        using var doc = JsonDocument.Parse(events[0]);
        Assert.Equal(arabic, doc.RootElement.GetProperty("error").GetString());
    }

    [Fact]
    public void Shapes_ReadyAndError()
    {
        using var ready = JsonDocument.Parse(NdjsonWriter.Serialize(NdjsonWriter.Ready(new { downloadId = "x" })));
        Assert.Equal("ready", ready.RootElement.GetProperty("type").GetString());
        using var err = JsonDocument.Parse(NdjsonWriter.Serialize(NdjsonWriter.Error("boom")));
        Assert.Equal("boom", err.RootElement.GetProperty("error").GetString());
    }

    [Fact]
    public void MergeRun_EmitsOrderedProgress()
    {
        var svc = MergeServiceFactory();
        try
        {
            var tokens = MergeWorkbooks(svc);
            var percents = new List<int>();
            svc.Run(MergeArgs(tokens), (p, d) => percents.Add(p));
            Assert.Contains(5, percents);
            Assert.Contains(20, percents);
            Assert.Contains(95, percents);
            Assert.True(percents.Exists(p => p is >= 30 and <= 90));
            Assert.Equal(percents.OrderBy(p => p).ToList(), percents);
        }
        finally
        {
            MergeServiceFactoryCleanup();
        }
    }

    // ---- minimal service harness (shares MergeP51 workbook builders) ----

    private static ExcelArchive.Application.Services.MergeService? _svc;
    private static Microsoft.Extensions.Caching.Memory.IMemoryCache? _cache;

    private static ExcelArchive.Application.Services.MergeService MergeServiceFactory()
    {
        _cache = new Microsoft.Extensions.Caching.Memory.MemoryCache(
            new Microsoft.Extensions.Caching.Memory.MemoryCacheOptions { SizeLimit = 2048 });
        _svc = new ExcelArchive.Application.Services.MergeService(
            new ExcelArchive.Infrastructure.Implementations.Storage.MergeFileStore(_cache),
            new ExcelArchive.Infrastructure.Implementations.Storage.MergeSessionStore(_cache),
            new ExcelArchive.Infrastructure.Implementations.Storage.MergeExportStore(_cache),
            new ExcelArchive.Infrastructure.Implementations.Excel.MergeWorkbookReader(),
            new ExcelArchive.Infrastructure.Implementations.Excel.MergeExportBuilderAdapter());
        return _svc;
    }

    private static void MergeServiceFactoryCleanup() => _cache?.Dispose();

    private static byte[] WorkbookBytes(string[] headers, params string[][] rows)
    {
        using var wb = new ClosedXML.Excel.XLWorkbook();
        var ws = wb.Worksheets.Add("S");
        for (var i = 0; i < headers.Length; i++) ws.Cell(1, i + 1).Value = headers[i];
        for (var r = 0; r < rows.Length; r++)
            for (var c = 0; c < headers.Length; c++)
                ws.Cell(r + 2, c + 1).Value = rows[r][c];
        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    private static (Guid L, string LS, Guid R, string RS) MergeWorkbooks(
        ExcelArchive.Application.Services.MergeService svc)
    {
        var headers = new[] { "الاسم الثلاثي", "اسم الأم" };
        var l = svc.Inspect(WorkbookBytes(headers, ["أ", "ب"]), "l.xlsx");
        var r = svc.Inspect(WorkbookBytes(headers, ["أ", "ب"]), "r.xlsx");
        return (l.Token, l.Selected.SheetName, r.Token, r.Selected.SheetName);
    }

    private static ExcelArchive.Application.DTOs.MergeDto.MergeRunArgs MergeArgs(
        (Guid L, string LS, Guid R, string RS) t) => new(
            t.L, t.LS, new Dictionary<string, int> { ["fullName"] = 0, ["motherName"] = 1 },
            t.R, t.RS, new Dictionary<string, int> { ["fullName"] = 0, ["motherName"] = 1 }, false);
}
