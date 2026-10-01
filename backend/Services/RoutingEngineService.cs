namespace CaseManagement.Api.Services;

using CaseManagement.Api.Data;
using CaseManagement.Api.DTOs;
using CaseManagement.Api.Models;
using CaseManagement.Api.Services.Strategies;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

public class RoutingEngineService : IRoutingEngineService
{
    private readonly AppDbContext _context;
    private readonly IEnumerable<IAssignmentStrategy> _strategies;

    public RoutingEngineService(AppDbContext context, IEnumerable<IAssignmentStrategy> strategies)
    {
        _context = context;
        _strategies = strategies;
    }

    public async Task<IEnumerable<RoutingRuleDto>> GetRulesAsync(CancellationToken ct = default)
    {
        var rules = await _context.RoutingRules
            .AsNoTracking()
            .Include(r => r.TargetDepartment)
            .OrderBy(r => r.EvaluationOrder)
            .ToListAsync(ct);

        return rules.Select(r =>
        {
            RuleConditionsDto conds;
            try
            {
                conds = JsonSerializer.Deserialize<RuleConditionsDto>(r.ConditionsJson, new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new RuleConditionsDto();
            }
            catch
            {
                conds = new RuleConditionsDto();
            }

            return new RoutingRuleDto
            {
                Id = r.Id,
                Name = r.Name,
                Description = r.Description,
                EvaluationOrder = r.EvaluationOrder,
                IsActive = r.IsActive,
                ConditionsJson = r.ConditionsJson,
                Conditions = conds,
                TargetDepartmentId = r.TargetDepartmentId,
                TargetDepartmentName = r.TargetDepartment?.Name ?? "Unassigned Team",
                TargetQueueName = r.TargetQueueName,
                ActionDescription = r.ActionDescription,
                CreatedAt = r.CreatedAt
            };
        });
    }

    public async Task<RoutingRuleDto?> GetRuleByIdAsync(Guid id, CancellationToken ct = default)
    {
        var rules = await GetRulesAsync(ct);
        return rules.FirstOrDefault(r => r.Id == id);
    }

    public async Task<RoutingRuleDto> CreateRuleAsync(CreateRoutingRuleDto dto, Guid actingUserId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(dto.Name))
            throw new InvalidOperationException("Rule name is required.");

        var count = await _context.RoutingRules.CountAsync(ct);
        var order = dto.EvaluationOrder.HasValue && dto.EvaluationOrder.Value > 0 ? dto.EvaluationOrder.Value : count + 1;

        var condsJson = dto.Conditions != null ? JsonSerializer.Serialize(dto.Conditions) : "{}";

        var rule = new RoutingRule
        {
            Id = Guid.NewGuid(),
            Name = dto.Name.Trim(),
            Description = dto.Description?.Trim() ?? "",
            EvaluationOrder = order,
            IsActive = dto.IsActive,
            ConditionsJson = condsJson,
            TargetDepartmentId = dto.TargetDepartmentId,
            TargetQueueName = dto.TargetQueueName,
            ActionDescription = dto.ActionDescription?.Trim() ?? $"Route to team",
            CreatedAt = DateTime.UtcNow
        };

        _context.RoutingRules.Add(rule);
        await RecordAuditLogAsync("RULE_CREATED", rule.Name, $"Created routing rule '{rule.Name}'", null, condsJson, actingUserId);

        await _context.SaveChangesAsync(ct);
        return (await GetRuleByIdAsync(rule.Id, ct))!;
    }

    public async Task<RoutingRuleDto> UpdateRuleAsync(Guid id, UpdateRoutingRuleDto dto, Guid actingUserId, CancellationToken ct = default)
    {
        var rule = await _context.RoutingRules.FirstOrDefaultAsync(r => r.Id == id, ct);
        if (rule == null) throw new KeyNotFoundException("Routing rule not found.");

        var oldState = JsonSerializer.Serialize(new { rule.Name, rule.IsActive, rule.EvaluationOrder, rule.ConditionsJson });

        if (!string.IsNullOrWhiteSpace(dto.Name)) rule.Name = dto.Name.Trim();
        if (dto.Description != null) rule.Description = dto.Description.Trim();
        if (dto.EvaluationOrder.HasValue) rule.EvaluationOrder = dto.EvaluationOrder.Value;
        if (dto.IsActive.HasValue) rule.IsActive = dto.IsActive.Value;
        if (dto.TargetDepartmentId.HasValue) rule.TargetDepartmentId = dto.TargetDepartmentId.Value;
        if (dto.TargetQueueName != null) rule.TargetQueueName = dto.TargetQueueName.Trim();
        if (dto.ActionDescription != null) rule.ActionDescription = dto.ActionDescription.Trim();
        if (dto.Conditions != null) rule.ConditionsJson = JsonSerializer.Serialize(dto.Conditions);

        rule.UpdatedAt = DateTime.UtcNow;

        await RecordAuditLogAsync("RULE_UPDATED", rule.Name, $"Updated routing rule '{rule.Name}'", oldState, rule.ConditionsJson, actingUserId);
        await _context.SaveChangesAsync(ct);

        return (await GetRuleByIdAsync(rule.Id, ct))!;
    }

    public async Task<RoutingRuleDto> ToggleRuleAsync(Guid id, Guid actingUserId, CancellationToken ct = default)
    {
        var rule = await _context.RoutingRules.FirstOrDefaultAsync(r => r.Id == id, ct);
        if (rule == null) throw new KeyNotFoundException("Routing rule not found.");

        rule.IsActive = !rule.IsActive;
        rule.UpdatedAt = DateTime.UtcNow;

        await RecordAuditLogAsync("RULE_TOGGLED", rule.Name, $"Toggled routing rule '{rule.Name}' to {(rule.IsActive ? "ACTIVE" : "INACTIVE")}", (!rule.IsActive).ToString(), rule.IsActive.ToString(), actingUserId);
        await _context.SaveChangesAsync(ct);

        return (await GetRuleByIdAsync(rule.Id, ct))!;
    }

    public async Task DeleteRuleAsync(Guid id, Guid actingUserId, CancellationToken ct = default)
    {
        var rule = await _context.RoutingRules.FirstOrDefaultAsync(r => r.Id == id, ct);
        if (rule == null) throw new KeyNotFoundException("Routing rule not found.");

        rule.IsActive = false;
        rule.UpdatedAt = DateTime.UtcNow;

        await RecordAuditLogAsync("RULE_DEACTIVATED", rule.Name, $"Deactivated routing rule '{rule.Name}' (soft-delete to preserve history)", "Active", "Inactive", actingUserId);
        await _context.SaveChangesAsync(ct);
    }

    public async Task ReorderRulesAsync(ReorderRulesDto dto, Guid actingUserId, CancellationToken ct = default)
    {
        if (dto.RuleIds == null || !dto.RuleIds.Any()) return;

        var allRules = await _context.RoutingRules.ToListAsync(ct);
        int currentOrder = 1;

        foreach (var ruleId in dto.RuleIds)
        {
            var match = allRules.FirstOrDefault(r => r.Id == ruleId);
            if (match != null)
            {
                match.EvaluationOrder = currentOrder++;
                match.UpdatedAt = DateTime.UtcNow;
            }
        }

        await RecordAuditLogAsync("RULES_REORDERED", "RoutingRules", "Reordered top-down evaluation sequence", null, null, actingUserId);
        await _context.SaveChangesAsync(ct);
    }

    public async Task<AssignmentConfigDto> GetAssignmentConfigAsync(CancellationToken ct = default)
    {
        var config = await _context.AssignmentConfigurations
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.DepartmentId == null && c.IsActive, ct);

        if (config == null)
        {
            return new AssignmentConfigDto
            {
                Algorithm = "RoundRobin",
                MaxConcurrentCapacity = 5,
                UpdatedAt = DateTime.UtcNow
            };
        }

        return new AssignmentConfigDto
        {
            Algorithm = config.Algorithm,
            MaxConcurrentCapacity = config.MaxConcurrentCapacity,
            UpdatedAt = config.UpdatedAt ?? config.CreatedAt
        };
    }

    public async Task<AssignmentConfigDto> UpdateAssignmentConfigAsync(UpdateAssignmentConfigDto dto, Guid actingUserId, CancellationToken ct = default)
    {
        var allowedAlgorithms = new[] { "RoundRobin", "SkillBased", "LeastOccupancy" };
        var algo = allowedAlgorithms.FirstOrDefault(a => string.Equals(a, dto.Algorithm, StringComparison.OrdinalIgnoreCase)) ?? "RoundRobin";

        var config = await _context.AssignmentConfigurations
            .FirstOrDefaultAsync(c => c.DepartmentId == null, ct);

        if (config == null)
        {
            config = new AssignmentConfiguration
            {
                Id = Guid.NewGuid(),
                DepartmentId = null,
                Algorithm = algo,
                MaxConcurrentCapacity = dto.MaxConcurrentCapacity ?? 5,
                IsActive = true,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            _context.AssignmentConfigurations.Add(config);
        }
        else
        {
            config.Algorithm = algo;
            if (dto.MaxConcurrentCapacity.HasValue && dto.MaxConcurrentCapacity.Value > 0)
            {
                config.MaxConcurrentCapacity = dto.MaxConcurrentCapacity.Value;
            }
            config.UpdatedAt = DateTime.UtcNow;
        }

        await RecordAuditLogAsync("CONFIG_UPDATED", "AssignmentConfiguration", $"Changed assignment algorithm to '{algo}'", null, algo, actingUserId);
        await _context.SaveChangesAsync(ct);

        return await GetAssignmentConfigAsync(ct);
    }

    public async Task<RoutingDecisionResult> RouteAndAssignCaseAsync(Case newCase, Customer? customer, CancellationToken ct = default)
    {
        var result = new RoutingDecisionResult();

        // 1. STAGE 1: Top-down Routing Rule Evaluation
        var activeRules = await _context.RoutingRules
            .AsNoTracking()
            .Include(r => r.TargetDepartment)
            .Where(r => r.IsActive)
            .OrderBy(r => r.EvaluationOrder)
            .ToListAsync(ct);

        RoutingRule? matchedRule = null;

        foreach (var rule in activeRules)
        {
            if (EvaluateRuleMatches(rule, newCase, customer))
            {
                matchedRule = rule;
                break;
            }
        }

        Department? targetDepartment = null;

        if (matchedRule != null && matchedRule.TargetDepartment != null && matchedRule.TargetDepartment.IsActive)
        {
            targetDepartment = matchedRule.TargetDepartment;
            result.MatchedRuleId = matchedRule.Id;
            result.MatchedRuleName = matchedRule.Name;
            result.TargetDepartmentId = matchedRule.TargetDepartmentId;
            result.TargetDepartmentName = matchedRule.TargetDepartment.Name;
        }
        else
        {
            // Fallback: If newCase has an explicitly selected valid active department, keep it
            targetDepartment = await _context.Departments.FirstOrDefaultAsync(d => d.Id == newCase.DepartmentId && d.IsActive, ct)
                               ?? await _context.Departments.FirstOrDefaultAsync(d => d.Code == "CC" && d.IsActive, ct)
                               ?? await _context.Departments.Where(d => d.IsActive).OrderBy(d => d.Id).FirstOrDefaultAsync(ct);

            result.TargetDepartmentId = targetDepartment?.Id ?? newCase.DepartmentId;
            result.TargetDepartmentName = targetDepartment?.Name ?? "Contact Center";
            result.MatchedRuleName = "Default Active Fallback";
        }

        // Apply team to case
        newCase.DepartmentId = result.TargetDepartmentId;

        // 2. STAGE 2: Automatic Agent Assignment
        var config = await GetAssignmentConfigAsync(ct);
        result.AlgorithmUsed = config.Algorithm;

        var strategy = _strategies.FirstOrDefault(s => string.Equals(s.AlgorithmName, config.Algorithm, StringComparison.OrdinalIgnoreCase))
                       ?? _strategies.First(s => s.AlgorithmName == "RoundRobin");

        var assignedAgent = await strategy.SelectEligibleAgentAsync(result.TargetDepartmentId, newCase, customer, config.MaxConcurrentCapacity, ct);

        if (assignedAgent != null)
        {
            newCase.OwnerId = assignedAgent.Id;
            result.AssignedUserId = assignedAgent.Id;
            result.AssignedUserName = assignedAgent.Name;
            result.RoutingLogMessage = $"Case routed to '{result.TargetDepartmentName}' via rule '{(matchedRule?.Name ?? "Fallback")}' and assigned to '{assignedAgent.Name}' via {config.Algorithm}.";
        }
        else
        {
            // If no agent eligible, assign to team lead or keep in queue
            if (targetDepartment?.OwnerId.HasValue == true)
            {
                newCase.OwnerId = targetDepartment.OwnerId.Value;
                result.AssignedUserId = targetDepartment.OwnerId.Value;
                result.AssignedUserName = "Team Lead";
            }
            result.RoutingLogMessage = $"Case routed to '{result.TargetDepartmentName}' queue. Pending agent assignment.";
        }

        return result;
    }

    private bool EvaluateRuleMatches(RoutingRule rule, Case c, Customer? cust)
    {
        RuleConditionsDto conds;
        try
        {
            conds = JsonSerializer.Deserialize<RuleConditionsDto>(rule.ConditionsJson, new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new RuleConditionsDto();
        }
        catch
        {
            return false;
        }

        var matches = new List<bool>();

        // 1. Department (Structured Criterion)
        if (!string.IsNullOrWhiteSpace(conds.Department))
        {
            var dept = _context.Departments.AsNoTracking().FirstOrDefault(d => d.Id == c.DepartmentId);
            var deptName = dept?.Name ?? "";
            var deptCode = dept?.Code ?? "";
            bool deptMatch = string.Equals(deptName, conds.Department.Trim(), StringComparison.OrdinalIgnoreCase) ||
                             string.Equals(deptCode, conds.Department.Trim(), StringComparison.OrdinalIgnoreCase) ||
                             deptName.Contains(conds.Department.Trim(), StringComparison.OrdinalIgnoreCase);
            matches.Add(deptMatch);
        }

        // 2. Case Category / Sub-Category (Structured Criterion)
        if (!string.IsNullOrWhiteSpace(conds.Category))
        {
            var subcat = (c.Subcategory ?? "").ToLowerInvariant();
            matches.Add(subcat.Contains(conds.Category.Trim().ToLowerInvariant()));
        }

        // 3. Case Type (Structured Criterion)
        if (!string.IsNullOrWhiteSpace(conds.CaseType))
        {
            matches.Add(string.Equals(c.CaseType, conds.CaseType.Trim(), StringComparison.OrdinalIgnoreCase));
        }

        // 4. Severity / Priority (Structured Criterion)
        if (!string.IsNullOrWhiteSpace(conds.Priority))
        {
            matches.Add(string.Equals(c.Severity, conds.Priority.Trim(), StringComparison.OrdinalIgnoreCase));
        }

        // 5. Customer Type / Customer Segment (Structured Criterion)
        if (!string.IsNullOrWhiteSpace(conds.CustomerSegment))
        {
            var custSeg = (cust?.CustomerSegment ?? "").ToLowerInvariant();
            matches.Add(custSeg.Contains(conds.CustomerSegment.Trim().ToLowerInvariant()));
        }

        // 6. Source / Communication Channel (Structured Criterion)
        if (!string.IsNullOrWhiteSpace(conds.Channel))
        {
            var raw = conds.Channel.ToLowerInvariant();
            var caseCh = (c.SourceChannel ?? c.CommunicationChannel ?? "").ToLowerInvariant();
            var isChannelMatch = raw.Contains(caseCh) || caseCh.Contains(raw);
            matches.Add(isChannelMatch);
        }

        if (!matches.Any()) return true; // Rule with no conditions matches everything

        if (string.Equals(conds.MatchType, "ANY", StringComparison.OrdinalIgnoreCase))
        {
            return matches.Any(m => m);
        }

        return matches.All(m => m); // Default ALL
    }

    private async Task RecordAuditLogAsync(string actionType, string entityName, string description, string? oldValue, string? newValue, Guid userId)
    {
        try
        {
            var audit = new CaseEvent
            {
                Id = Guid.NewGuid(),
                CaseId = null,
                EventType = EventType.Other,
                Message = description,
                CreatedAt = DateTime.UtcNow,
                UserId = userId != Guid.Empty ? userId : Guid.Empty,
                Module = "RoutingEngine",
                EntityName = entityName,
                ActionType = actionType,
                OldValue = oldValue,
                NewValue = newValue
            };

            _context.CaseEvents.Add(audit);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[RoutingEngineAuditLog Error] {ex.Message}");
        }
    }
}
