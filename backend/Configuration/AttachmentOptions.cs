namespace CaseManagement.Api.Configuration;

/// <summary>
/// Attachment upload constraints, configurable per-environment.
/// </summary>
public class AttachmentOptions
{
    public const string SectionName = "Attachments";

    /// <summary>Maximum file size in bytes. Default: 25 MB.</summary>
    public long MaxFileSizeBytes { get; set; } = 25 * 1024 * 1024;

    /// <summary>
    /// Comma-separated list of allowed file extensions (lower-case, with leading dot).
    /// Empty string means "allow all" (not recommended for production).
    /// </summary>
    public string AllowedExtensions { get; set; } =
        ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.gif,.bmp,.svg,.zip,.rar,.7z,.msg,.eml";

    public HashSet<string> GetAllowedExtensionSet()
    {
        if (string.IsNullOrWhiteSpace(AllowedExtensions)) return new HashSet<string>();
        return AllowedExtensions
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(e => e.StartsWith('.') ? e.ToLowerInvariant() : "." + e.ToLowerInvariant())
            .ToHashSet();
    }
}
