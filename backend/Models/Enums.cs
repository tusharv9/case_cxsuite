namespace CaseManagement.Api.Models;

public enum CaseStatus
{
    Open,
    InProgress,
    WaitingOnCustomer,
    Escalated,
    Resolved,
    Accepted,
    Rejected,
    Closed,
    Pending,
    Cancelled
}

// Case severity is no longer a compiled-in enum: it is administrator-configurable master data
// (LookupValues with TypeCode CASE_SEVERITY, paired with a row in SlaConfigurations), so
// Case.Severity is stored as the configured name.

public enum EventType
{
    Create,
    Assign,
    Note,
    Cowork,
    Transfer,
    Escalate,
    Resolve,
    Accept,
    Reject,
    Comment,
    View,
    Update,
    Close,
    Other
}

public enum ParticipantRole
{
    CoWorker,
    Watcher
}
