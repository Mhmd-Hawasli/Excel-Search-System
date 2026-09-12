using ExcelArchive.Application.Common;
using ExcelArchive.Application.Interfaces.Repositories;
using ExcelArchive.Domain.Entities;
using ExcelArchive.Domain.Repositories;
using ExcelArchive.Infrastructure.Implementations.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ExcelArchive.Infrastructure.Implementations.Repositories;

public class UserRepository(AppDbContext db) : RepositoryBase<User>(db), IUserRepository
{
    public Task<User?> FindByUsernameAsync(string username, CancellationToken ct = default)
        => Db.Users.FirstOrDefaultAsync(u => u.Username == username, ct);

    public Task<User?> FindWithPermissionsAsync(Guid id, CancellationToken ct = default)
        => Db.Users.Include(u => u.Permissions).FirstOrDefaultAsync(u => u.Id == id, ct);

    public async Task<IReadOnlyList<User>> ListWithPermissionsAsync(CancellationToken ct = default)
        => await Db.Users.AsNoTracking()
            .Include(u => u.Permissions)
            .OrderBy(u => u.CreatedAt)
            .ToListAsync(ct);

    public Task<bool> UsernameExistsAsync(string username, CancellationToken ct = default)
        => Db.Users.AnyAsync(u => u.Username == username, ct);

    public async Task<IReadOnlyList<UserPermission>> ListPermissionsAsync(Guid userId, CancellationToken ct = default)
        => await Db.UserPermissions.Where(p => p.UserId == userId).ToListAsync(ct);

    public async Task ReplacePermissionsAsync(Guid userId, IReadOnlyList<UserPermission> permissions, CancellationToken ct = default)
    {
        var existing = await Db.UserPermissions.Where(p => p.UserId == userId).ToListAsync(ct);
        Db.UserPermissions.RemoveRange(existing);
        Db.UserPermissions.AddRange(permissions);
    }

    public async Task AddUserAsync(User user, CancellationToken ct = default)
    {
        Db.Users.Add(user);
        try
        {
            await Db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            throw new ConflictException("يوجد مستخدم بهذا الاسم مسبقًا.");
        }
    }

    public async Task<IReadOnlyList<Guid>> AllIdsAsync(CancellationToken ct = default)
        => await Db.Users.AsNoTracking().Select(u => u.Id).ToListAsync(ct);

    public async Task<IReadOnlyList<string>> AllUsernamesAsync(CancellationToken ct = default)
        => await Db.Users.AsNoTracking().Select(u => u.Username).ToListAsync(ct);
}
