using ExcelArchive.Application.DTOs.ActivityDto;
using ExcelArchive.Application.Services;
using ExcelArchive.Domain.Enums;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using ExcelArchive.Infrastructure.Implementations.Repositories;

namespace ExcelArchive.Foundation.Tests;

/// <summary>P6.5: latest-500 newest-first ordering, known/unknown action
/// filter parity (unknown falls back to all rows, V1 ACTION_KEYS check) and
/// free-text search.</summary>
public sealed class ActivityPhase6Tests
{
    private static async Task<ActivityService> Setup()
    {
        var db = TestHelpers.InMemoryDb();
        var uow = TestHelpers.Uow(db);
        var svc = new ActivityService(uow);
        await svc.WriteAsync(ActivityAction.FileUploaded, "a");
        await svc.WriteAsync(ActivityAction.RecordVisited, "b");
        await svc.WriteAsync(ActivityAction.FileUploaded, "c");
        return svc;
    }

    [Fact]
    public async Task List_NewestFirst_DefaultPage()
    {
        var svc = await Setup();
        var result = await svc.ListAsync(new ActivityFilterRequest(1, 500, null, null));
        Assert.Equal(3, result.Total);
        Assert.Equal(["c", "b", "a"], result.Items.Select(i => i.TargetName).ToList());
    }

    [Fact]
    public async Task List_KnownAction_Filters()
    {
        var svc = await Setup();
        var result = await svc.ListAsync(new ActivityFilterRequest(1, 500, "RECORD_VISITED", null));
        var single = Assert.Single(result.Items);
        Assert.Equal("b", single.TargetName);
    }

    [Fact]
    public async Task List_UnknownAction_FallsBackToAll()
    {
        var svc = await Setup();
        var result = await svc.ListAsync(new ActivityFilterRequest(1, 500, "NO_SUCH_ACTION", null));
        Assert.Equal(3, result.Total);
    }

    [Fact]
    public async Task List_PageSize_CappedAt500()
    {
        var svc = await Setup();
        var result = await svc.ListAsync(new ActivityFilterRequest(1, 5000, null, null));
        Assert.Equal(500, result.PageSize);
        Assert.Equal(3, result.Total);
    }

    [Fact]
    public async Task List_Search_MatchesTarget()
    {
        var svc = await Setup();
        var result = await svc.ListAsync(new ActivityFilterRequest(1, 500, null, "b"));
        var single = Assert.Single(result.Items);
        Assert.Equal("b", single.TargetName);
    }
}
