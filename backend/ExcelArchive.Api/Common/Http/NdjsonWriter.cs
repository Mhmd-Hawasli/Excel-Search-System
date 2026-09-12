using System.Text;
using System.Text.Json;

namespace ExcelArchive.Api.Common.Http;

/// <summary>
/// NDJSON streaming helper (P5.4). Ports the V1 merge/sheet-merge route
/// pattern: newline-delimited JSON events ({type:progress|result|ready|error})
/// with content-type application/x-ndjson and no-store. Each line is flushed
/// so browsers render progress incrementally; split UTF-8/line boundaries
/// are the reader's contract (frontend apiFetchNDJSON).
/// </summary>
public static class NdjsonWriter
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static string Serialize(object message)
        => JsonSerializer.Serialize(message, JsonOptions);

    /// <summary>
    /// Streams events to the response body, flushing after every line.
    /// The producer reports progress/result/ready and throws domain errors,
    /// which the caller maps to a terminal {type:error} event.
    /// </summary>
    public static async Task StreamAsync(
        Stream body, Func<Func<object, Task>, Task> produce, CancellationToken ct = default)
    {
        async Task Emit(object message)
        {
            var line = Serialize(message) + "\n";
            var bytes = Encoding.UTF8.GetBytes(line);
            await body.WriteAsync(bytes, ct);
            await body.FlushAsync(ct);
        }
        await produce(Emit);
    }

    /// <summary>
    /// Synchronous bridge for engine progress callbacks (V1 onRuleDone style).
    /// Safe in ASP.NET Core: no SynchronizationContext, so blocking on the
    /// socket write cannot deadlock; it only yields the worker briefly.
    /// </summary>
    public static void EmitSync(Func<object, Task> emit, object message)
        => emit(message).GetAwaiter().GetResult();

    public static object Progress(int percent, string? detail)
        => new { type = "progress", percent, detail };

    public static object Result(object payload)
        => new { type = "result", payload };

    public static object Ready(object payload)
        => new { type = "ready", payload };

    public static object Error(string message)
        => new { type = "error", error = message };
}
