using ExcelArchive.Api.Data;
using ExcelArchive.Api.Models.Entities;

namespace ExcelArchive.Api.Repositories;

public interface IUserRepository : IRepository<User>
{
}

public class UserRepository(AppDbContext db) : RepositoryBase<User>(db), IUserRepository
{
}
