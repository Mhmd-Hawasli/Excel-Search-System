using ExcelArchive.Api.Data;
using ExcelArchive.Api.Models.Entities;

namespace ExcelArchive.Api.Repositories;

public interface IUploadJobRepository : IRepository<UploadJob>
{
}

public class UploadJobRepository(AppDbContext db) : RepositoryBase<UploadJob>(db), IUploadJobRepository
{
}
