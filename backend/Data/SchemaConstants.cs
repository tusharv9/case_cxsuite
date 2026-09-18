namespace CaseManagement.Api.Data;

/// <summary>
/// Names of database objects that are created by the startup bootstrap in
/// <see cref="Program"/> and referenced from repository code. Kept in one place so the
/// bootstrap DDL and the queries that depend on it can never drift apart.
/// </summary>
public static class SchemaConstants
{
    /// <summary>
    /// PostgreSQL sequence backing the numeric part of <c>Cases.CaseNumber</c>.
    /// Seeded at startup from the highest sequence already present in the data, so it
    /// carries no hardcoded starting value.
    /// </summary>
    public const string CaseNumberSequence = "case_number_seq";
}
