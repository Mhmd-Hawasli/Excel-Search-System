using System.Text.Json;

namespace ExcelArchive.Domain.Entities;

public class Record
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid FileId { get; set; }
    public int RowIndex { get; set; }
    public JsonDocument Data { get; set; } = null!;

    // Standard field shadow values (search-friendly normalized columns).
    public string? SfFirstName { get; set; }
    public string? SfFatherName { get; set; }
    public string? SfLastName { get; set; }
    public string? SfFullName { get; set; }
    public long? SfNationalId { get; set; }
    public long? SfShamCash { get; set; }
    public string? SfPersonalNo { get; set; }
    public string? SfMotherName { get; set; }
    public string? SfPhone { get; set; }
    public string? SfContractCode { get; set; }
    public string? SfSecondaryContractCode { get; set; }
    public string? SfJobTitle { get; set; }
    public int? SfFunctionalCategory { get; set; }
    public string? SfOrganizationalLevel { get; set; }

    public string? NFirstName { get; set; }
    public string? NFatherName { get; set; }
    public string? NLastName { get; set; }
    public string? NFullName { get; set; }
    public string? NMotherName { get; set; }
    public string? NContractCode { get; set; }
    public string? NSecondaryContractCode { get; set; }
    public string? NJobTitle { get; set; }
    public string? NOrganizationalLevel { get; set; }

    public string? DNationalId { get; set; }
    public string? DPersonalNo { get; set; }
    public string? DPhone { get; set; }
    public JsonDocument? FmtFills { get; set; }
    public JsonDocument? FmtFontColors { get; set; }
    public long? NationalIdNum { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public File File { get; set; } = null!;
    public ICollection<RecordEdit> Edits { get; set; } = new List<RecordEdit>();
    public ICollection<IgnoredConflict> Ignores { get; set; } = new List<IgnoredConflict>();
}
