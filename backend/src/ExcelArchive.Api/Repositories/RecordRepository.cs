using ExcelArchive.Api.Data;
using ExcelArchive.Api.Models.Entities;

namespace ExcelArchive.Api.Repositories;

public interface IRecordRepository : IRepository<Record>
{
}

public class RecordRepository(AppDbContext db) : RepositoryBase<Record>(db), IRecordRepository
{
}
