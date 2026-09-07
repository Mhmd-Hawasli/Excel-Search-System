using ExcelArchive.Api.Data;
using ExcelArchive.Api.Models.Entities;

namespace ExcelArchive.Api.Repositories;

public interface IGroupRepository : IRepository<Group>
{
}

public class GroupRepository(AppDbContext db) : RepositoryBase<Group>(db), IGroupRepository
{
}
