using ExcelArchive.Application.DTOs.GroupDto;

namespace ExcelArchive.Application.DTOs.DashboardDto;

/// <summary>Scoped dashboard read model replacing the V1 server-component
/// Prisma reads (docs/05: GET dashboard).</summary>
public record DashboardDto(
    long GroupCount,
    long FileCount,
    long RecordCount,
    IReadOnlyList<GroupFileDto> RecentFiles);
