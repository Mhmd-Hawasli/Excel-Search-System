using ExcelArchive.Domain.Merge;

namespace ExcelArchive.Domain.Merge;

/// <summary>In-memory two-file merge session (isolated, no archive DB).</summary>
public sealed class MergeSessionData
{
    public Guid Id { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public bool IgnoreConfirmation { get; set; }
    public string LeftFilename { get; set; } = "";
    public string LeftSheetName { get; set; } = "";
    public List<string> LeftHeaders { get; set; } = [];
    public List<MergeRow> LeftRows { get; set; } = [];
    public string RightFilename { get; set; } = "";
    public string RightSheetName { get; set; } = "";
    public List<string> RightHeaders { get; set; } = [];
    public List<MergeRow> RightRows { get; set; } = [];
    public MergeMapping LeftMapping { get; set; } = MergeMapping.Empty;
    public MergeMapping RightMapping { get; set; } = MergeMapping.Empty;
}
