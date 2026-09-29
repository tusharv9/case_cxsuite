namespace CaseManagement.Api.Services.Strategies;

using CaseManagement.Api.Models;

public interface IAssignmentStrategy
{
    string AlgorithmName { get; }
    Task<User?> SelectEligibleAgentAsync(Guid departmentId, Case newCase, Customer? customer, int maxCapacity, CancellationToken ct = default);
}
