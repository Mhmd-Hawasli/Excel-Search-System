using ExcelArchive.Api.Data;
using ExcelArchive.Api.Models.Entities;

namespace ExcelArchive.Api.Repositories;

public interface IFileRepository : IRepository<File>
{
}

public class FileRepository(AppDbContext db) : RepositoryBase<File>(db), IFileRepository
{
}
