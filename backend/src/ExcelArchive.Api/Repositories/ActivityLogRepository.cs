using ExcelArchive.Api.Data;
using ExcelArchive.Api.Models.Entities;

namespace ExcelArchive.Api.Repositories;

public interface IActivityLogRepository : IRepository<ActivityLog>
{
}

public class ActivityLogRepository(AppDbContext db) : RepositoryBase<ActivityLog>(db), IActivityLogRepository
{
}
