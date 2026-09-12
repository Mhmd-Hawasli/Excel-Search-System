namespace ExcelArchive.Application.Common;

/// <summary>Functional result type used by application services (SPC-style).</summary>
public sealed record Error(string Code, string Message)
{
    public static Error NotFound(string message) => new("not_found", message);
    public static Error Validation(string message) => new("validation", message);
    public static Error Forbidden(string message) => new("forbidden", message);
    public static Error Conflict(string message) => new("conflict", message);
    public static Error Failure(string message) => new("failure", message);
}

public class Result
{
    public bool IsSuccess { get; }
    public Error? Error { get; }

    protected Result(bool isSuccess, Error? error)
    {
        IsSuccess = isSuccess;
        Error = error;
    }

    public static Result Success() => new(true, null);
    public static Result Failure(Error error) => new(false, error);
    public static Result Failure(string message) => new(false, Error.Failure(message));
}

public sealed class Result<T> : Result
{
    public T? Value { get; }

    private Result(T? value, bool isSuccess, Error? error)
        : base(isSuccess, error)
    {
        Value = value;
    }

    public static Result<T> Success(T value) => new(value, true, null);
    public static new Result<T> Failure(Error error) => new(default, false, error);
    public static new Result<T> Failure(string message) => new(default, false, Error.Failure(message));
}
