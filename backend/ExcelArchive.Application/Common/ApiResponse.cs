namespace ExcelArchive.Application.Common;

public record ApiResponse(bool Ok, string? Message = null, object? Data = null)
{
    public static ApiResponse Success(object? data = null, string? message = null) => new(true, message, data);
    public static ApiResponse Failure(string message) => new(false, message);
}

public class PageResult<T>
{
    public IReadOnlyList<T> Items { get; init; } = [];
    public int Page { get; init; }
    public int PageSize { get; init; }
    public int Total { get; init; }
    public int TotalPages => PageSize <= 0 ? 0 : (int)Math.Ceiling(Total / (double)PageSize);
}
