namespace CaseManagement.Api.Services;

using CaseManagement.Api.Data;
using CaseManagement.Api.DTOs;
using CaseManagement.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

public class SlaRoutingService : ISlaRoutingService
{
    private readonly AppDbContext _context;
    private readonly ILogger<SlaRoutingService> _logger;

    public SlaRoutingService(AppDbContext context, ILogger<SlaRoutingService> logger)
    {
        _context = context;
        _logger = logger;
    }

    public async Task<SlaRoutingConfigResponseDto> GetFullConfigurationAsync(CancellationToken ct = default)
    {
        // 1. Priority SLA Rules & Mappings (ordered by the administrator-defined display order)
        var rules = await _context.PrioritySlaRules
            .Include(r => r.CategoryMappings)
            .AsNoTracking()
            .OrderBy(r => r.DisplayOrder).ThenBy(r => r.Priority)
            .ToListAsync(ct);

        var ruleDtos = rules.Select(r => new PrioritySlaRuleDto
        {
            Id = r.Id,
            Priority = r.Priority,
            DisplayOrder = r.DisplayOrder,
            IsActive = r.IsActive,
            FirstResponseValue = r.FirstResponseValue,
            FirstResponseUnit = r.FirstResponseUnit,
            FirstResponseMinutes = r.FirstResponseMinutes,
            InternalResolutionValue = r.InternalResolutionValue,
            InternalResolutionUnit = r.InternalResolutionUnit,
            InternalResolutionMinutes = r.InternalResolutionMinutes,
            ExternalResolutionValue = r.ExternalResolutionValue,
            ExternalResolutionUnit = r.ExternalResolutionUnit,
            ExternalResolutionMinutes = r.ExternalResolutionMinutes,
            AppliedSubCategoryIds = r.CategoryMappings.Select(m => m.DepartmentSubCategoryId).ToList()
        }).ToList();

        // 2. Sub-categories a priority can be applied to: every active one, plus any that is already
        //    mapped (so a mapping never silently disappears from the screen).
        var mappedIds = rules.SelectMany(r => r.CategoryMappings).Select(m => m.DepartmentSubCategoryId).ToHashSet();
        var categories = await _context.DepartmentSubCategories
            .AsNoTracking()
            .Where(s => s.IsActive || mappedIds.Contains(s.Id))
            .OrderBy(s => s.Department.Name)
            .ThenBy(s => s.Name)
            .Select(s => new CategoryOptionDto
            {
                Id = s.Id,
                Name = s.Name,
                DepartmentId = s.DepartmentId,
                DepartmentName = s.Department.Name,
                IsActive = s.IsActive
            })
            .ToListAsync(ct);

        // 3. Business Hours (7 Days)
        var businessHoursRaw = await _context.BusinessHours
            .AsNoTracking()
            .ToListAsync(ct);

        var businessHours = businessHoursRaw
            .OrderBy(b => b.DayOfWeek == DayOfWeek.Sunday ? 7 : (int)b.DayOfWeek) // Monday first, Sunday last
            .Select(b => new BusinessHourDto
            {
                Id = b.Id,
                DayOfWeek = (int)b.DayOfWeek,
                DayName = b.DayName,
                IsEnabled = b.IsEnabled,
                StartTime = b.StartTime.ToString(@"hh\:mm"),
                EndTime = b.EndTime.ToString(@"hh\:mm")
            })
            .ToList();

        // 4. Public Holidays
        var holidays = await _context.PublicHolidays
            .AsNoTracking()
            .OrderBy(h => h.HolidayDate)
            .Select(h => new PublicHolidayDto
            {
                Id = h.Id,
                HolidayDate = h.HolidayDate,
                Name = h.Name,
                IsActive = h.IsActive
            })
            .ToListAsync(ct);

        // 5. Escalation Levels
        var levels = await _context.EscalationLevelConfigs
            .Include(l => l.TargetUser)
            .AsNoTracking()
            .OrderBy(l => l.LevelNumber)
            .Select(l => new EscalationLevelConfigDto
            {
                Id = l.Id,
                LevelNumber = l.LevelNumber,
                Name = l.Name,
                AssignmentType = l.AssignmentType,
                TargetRole = l.TargetRole,
                TargetUserId = l.TargetUserId,
                TargetUserName = l.TargetUser != null ? l.TargetUser.Name : null,
                TriggerType = l.TriggerType,
                TriggerValue = l.TriggerValue,
                TriggerDescription = l.TriggerDescription,
                ActionDescription = l.ActionDescription,
                ReassignOwner = l.ReassignOwner,
                IsActive = l.IsActive
            })
            .ToListAsync(ct);

        // 6. Available Users and Roles for UI assignment selector
        var users = await _context.Users
            .AsNoTracking()
            .OrderBy(u => u.Name)
            .Select(u => new UserOptionDto
            {
                Id = u.Id,
                Name = u.Name,
                Role = u.Role,
                Team = u.Team
            })
            .ToListAsync(ct);

        var roles = users
            .Select(u => u.Role)
            .Where(r => !string.IsNullOrWhiteSpace(r))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(r => r)
            .ToList();

        // Standard corporate roles if not in user records
        var standardRoles = new[] { "Assigned Agent", "Team Lead", "CX Supervisor", "Head of Customer Experience" };
        foreach (var sr in standardRoles)
        {
            if (!roles.Contains(sr, StringComparer.OrdinalIgnoreCase)) roles.Add(sr);
        }

        return new SlaRoutingConfigResponseDto
        {
            PriorityRules = ruleDtos,
            AvailableCategories = categories,
            BusinessHours = businessHours,
            PublicHolidays = holidays,
            EscalationLevels = levels,
            AvailableRoles = roles,
            AvailableUsers = users
        };
    }

    public async Task<bool> UpdateConfigurationAsync(UpdateSlaRoutingConfigRequestDto request, Guid actingUserId, CancellationToken ct = default)
    {
        var strategy = _context.Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync(async () =>
        {
            using var transaction = await _context.Database.BeginTransactionAsync(ct);
            try
            {
                var now = DateTime.UtcNow;

                // 1. Update Priority SLA Rules & sub-category mappings
                var existingRules = await _context.PrioritySlaRules.ToListAsync(ct);
                var validUnits = new[] { "Minutes", "Hours" };

                foreach (var input in request.PriorityRules)
                {
                    if (string.IsNullOrWhiteSpace(input.Priority))
                        throw new InvalidOperationException("Every priority needs a name.");
                    foreach (var (label, value, unit) in new[]
                    {
                        ("First response", input.FirstResponseValue, input.FirstResponseUnit),
                        ("Internal resolution", input.InternalResolutionValue, input.InternalResolutionUnit),
                        ("External resolution", input.ExternalResolutionValue, input.ExternalResolutionUnit),
                    })
                    {
                        if (value < 1)
                            throw new InvalidOperationException($"{label} for '{input.Priority}' must be at least 1.");
                        if (!validUnits.Contains(unit, StringComparer.OrdinalIgnoreCase))
                            throw new InvalidOperationException($"{label} unit for '{input.Priority}' must be Minutes or Hours.");
                    }
                }

                // One priority per sub-category, and every referenced sub-category must exist.
                var allIds = request.PriorityRules.SelectMany(r => r.AppliedSubCategoryIds ?? new()).ToList();
                var duplicated = allIds.GroupBy(id => id).Where(g => g.Count() > 1).Select(g => g.Key).ToList();
                if (duplicated.Count > 0)
                {
                    var names = await _context.DepartmentSubCategories
                        .Where(s => duplicated.Contains(s.Id))
                        .Select(s => s.Department.Name + " / " + s.Name)
                        .ToListAsync(ct);
                    throw new InvalidOperationException($"A sub-category can have only one priority. Assigned more than once: {string.Join(", ", names)}.");
                }
                var knownIds = (await _context.DepartmentSubCategories
                    .Where(s => allIds.Contains(s.Id)).Select(s => s.Id).ToListAsync(ct)).ToHashSet();
                var unknown = allIds.Where(id => !knownIds.Contains(id)).ToList();
                if (unknown.Count > 0)
                    throw new InvalidOperationException("One or more sub-categories no longer exist. Reload the page and try again.");

                // Rebuild the mappings cleanly.
                var allMappings = await _context.PriorityCategoryMappings.ToListAsync(ct);
                _context.PriorityCategoryMappings.RemoveRange(allMappings);
                await _context.SaveChangesAsync(ct);

                foreach (var inputRule in request.PriorityRules)
                {
                    var rule = (inputRule.Id != Guid.Empty ? existingRules.FirstOrDefault(r => r.Id == inputRule.Id) : null)
                               ?? existingRules.FirstOrDefault(r => r.Priority.Equals(inputRule.Priority, StringComparison.OrdinalIgnoreCase));

                    int Minutes(int value, string unit) => unit.Equals("Hours", StringComparison.OrdinalIgnoreCase) ? value * 60 : value;
                    int frMinutes = Minutes(inputRule.FirstResponseValue, inputRule.FirstResponseUnit);
                    int intMinutes = Minutes(inputRule.InternalResolutionValue, inputRule.InternalResolutionUnit);
                    int extMinutes = Minutes(inputRule.ExternalResolutionValue, inputRule.ExternalResolutionUnit);

                    if (rule == null)
                    {
                        rule = new PrioritySlaRule
                        {
                            Id = Guid.NewGuid(),
                            Priority = inputRule.Priority.Trim(),
                            DisplayOrder = existingRules.Count == 0 ? 1 : existingRules.Max(r => r.DisplayOrder) + 1,
                            IsActive = true,
                            Version = 1,
                            CreatedAt = now
                        };
                        existingRules.Add(rule);
                        _context.PrioritySlaRules.Add(rule);
                    }
                    else
                    {
                        // The SLA version is what cases snapshot, so it only moves when a target really changed.
                        var changed = rule.FirstResponseMinutes != frMinutes
                                      || rule.InternalResolutionMinutes != intMinutes
                                      || rule.ExternalResolutionMinutes != extMinutes;
                        if (changed) { rule.Version += 1; rule.UpdatedAt = now; }
                    }

                    rule.FirstResponseValue = inputRule.FirstResponseValue;
                    rule.FirstResponseUnit = inputRule.FirstResponseUnit;
                    rule.FirstResponseMinutes = frMinutes;
                    rule.InternalResolutionValue = inputRule.InternalResolutionValue;
                    rule.InternalResolutionUnit = inputRule.InternalResolutionUnit;
                    rule.InternalResolutionMinutes = intMinutes;
                    rule.ExternalResolutionValue = inputRule.ExternalResolutionValue;
                    rule.ExternalResolutionUnit = inputRule.ExternalResolutionUnit;
                    rule.ExternalResolutionMinutes = extMinutes;

                    foreach (var subCategoryId in (inputRule.AppliedSubCategoryIds ?? new()).Distinct())
                    {
                        _context.PriorityCategoryMappings.Add(new PriorityCategoryMapping
                        {
                            Id = Guid.NewGuid(),
                            PrioritySlaRuleId = rule.Id,
                            DepartmentSubCategoryId = subCategoryId,
                            CreatedAt = now
                        });
                    }
                }

                // 2. Update Business Hours
                var existingHours = await _context.BusinessHours.ToListAsync(ct);
                foreach (var inputBh in request.BusinessHours)
                {
                    var bh = existingHours.FirstOrDefault(b => (int)b.DayOfWeek == inputBh.DayOfWeek);
                    TimeSpan.TryParse(inputBh.StartTime, out var sTime);
                    TimeSpan.TryParse(inputBh.EndTime, out var eTime);

                    if (inputBh.IsEnabled && sTime > eTime)
                    {
                        throw new InvalidOperationException($"Invalid business hours for {inputBh.DayName}: opening time ({inputBh.StartTime}) cannot be after closing time ({inputBh.EndTime}).");
                    }

                    if (bh == null)
                    {
                        _context.BusinessHours.Add(new BusinessHour
                        {
                            Id = Guid.NewGuid(),
                            DayOfWeek = (DayOfWeek)inputBh.DayOfWeek,
                            DayName = ((DayOfWeek)inputBh.DayOfWeek).ToString(),
                            IsEnabled = inputBh.IsEnabled,
                            StartTime = sTime,
                            EndTime = eTime,
                            CreatedAt = now
                        });
                    }
                    else
                    {
                        bh.IsEnabled = inputBh.IsEnabled;
                        bh.StartTime = sTime;
                        bh.EndTime = eTime;
                        bh.UpdatedAt = now;
                    }
                }

                // 3. Update Escalation Level Configs
                var existingLevels = await _context.EscalationLevelConfigs.ToListAsync(ct);
                _context.EscalationLevelConfigs.RemoveRange(existingLevels);
                await _context.SaveChangesAsync(ct);

                foreach (var inputLvl in request.EscalationLevels.OrderBy(l => l.LevelNumber))
                {
                    _context.EscalationLevelConfigs.Add(new EscalationLevelConfig
                    {
                        Id = Guid.NewGuid(),
                        LevelNumber = inputLvl.LevelNumber,
                        Name = string.IsNullOrWhiteSpace(inputLvl.Name) ? $"Level {inputLvl.LevelNumber}" : inputLvl.Name,
                        AssignmentType = inputLvl.AssignmentType ?? "Role",
                        TargetRole = inputLvl.TargetRole ?? "Team Lead",
                        TargetUserId = inputLvl.TargetUserId,
                        TriggerType = inputLvl.TriggerType ?? "SlaPercentage",
                        TriggerValue = inputLvl.TriggerValue,
                        TriggerDescription = inputLvl.TriggerDescription ?? string.Empty,
                        ActionDescription = inputLvl.ActionDescription ?? string.Empty,
                        ReassignOwner = inputLvl.ReassignOwner,
                        DisplayOrder = inputLvl.LevelNumber,
                        IsActive = true,
                        CreatedAt = now
                    });
                }

                // 4. Record Audit Log in CaseEvents
                _context.CaseEvents.Add(new CaseEvent
                {
                    Id = Guid.NewGuid(),
                    CaseId = null,
                    EventType = EventType.Other,
                    Module = "SlaEscalation",
                    EntityName = "Cases SLA & Routing Configuration",
                    ActionType = "UPDATE_CONFIG",
                    Message = "Administrator saved updated Cases SLA Matrix, Business Hours, and Escalation Matrix.",
                    UserId = actingUserId,
                    CreatedAt = now,
                    IsInternal = true
                });

                await _context.SaveChangesAsync(ct);
                await transaction.CommitAsync(ct);
                return true;
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync(ct);
                _logger.LogError(ex, "Failed to save Cases SLA & Routing configuration atomically.");
                throw;
            }
        });
    }

    public async Task<PublicHolidayDto> AddPublicHolidayAsync(CreatePublicHolidayDto dto, Guid actingUserId, CancellationToken ct = default)
    {
        var dateUtc = DateTime.SpecifyKind(dto.HolidayDate.Date, DateTimeKind.Utc);
        var existing = await _context.PublicHolidays.FirstOrDefaultAsync(h => h.HolidayDate == dateUtc, ct);
        if (existing != null)
        {
            throw new InvalidOperationException($"A public holiday is already configured for {dateUtc:yyyy-MM-dd}.");
        }

        var holiday = new PublicHoliday
        {
            Id = Guid.NewGuid(),
            HolidayDate = dateUtc,
            Name = dto.Name.Trim(),
            IsActive = dto.IsActive,
            CreatedAt = DateTime.UtcNow
        };

        _context.PublicHolidays.Add(holiday);
        _context.CaseEvents.Add(new CaseEvent
        {
            Id = Guid.NewGuid(),
            CaseId = null,
            EventType = EventType.Other,
            Module = "SlaEscalation",
            EntityName = "Public Holiday",
            ActionType = "CREATE",
            Message = $"Added public holiday '{holiday.Name}' ({dateUtc:yyyy-MM-dd}).",
            UserId = actingUserId,
            CreatedAt = DateTime.UtcNow,
            IsInternal = true
        });

        await _context.SaveChangesAsync(ct);

        return new PublicHolidayDto
        {
            Id = holiday.Id,
            HolidayDate = holiday.HolidayDate,
            Name = holiday.Name,
            IsActive = holiday.IsActive
        };
    }

    public async Task<PublicHolidayDto?> UpdatePublicHolidayAsync(Guid id, UpdatePublicHolidayDto dto, Guid actingUserId, CancellationToken ct = default)
    {
        var holiday = await _context.PublicHolidays.FindAsync(new object[] { id }, ct);
        if (holiday == null) return null;

        var dateUtc = DateTime.SpecifyKind(dto.HolidayDate.Date, DateTimeKind.Utc);
        var conflict = await _context.PublicHolidays.FirstOrDefaultAsync(h => h.Id != id && h.HolidayDate == dateUtc, ct);
        if (conflict != null)
        {
            throw new InvalidOperationException($"Another public holiday is already configured for {dateUtc:yyyy-MM-dd}.");
        }

        holiday.HolidayDate = dateUtc;
        holiday.Name = dto.Name.Trim();
        holiday.IsActive = dto.IsActive;
        holiday.UpdatedAt = DateTime.UtcNow;

        _context.CaseEvents.Add(new CaseEvent
        {
            Id = Guid.NewGuid(),
            CaseId = null,
            EventType = EventType.Other,
            Module = "SlaEscalation",
            EntityName = "Public Holiday",
            ActionType = "UPDATE",
            Message = $"Updated public holiday '{holiday.Name}' ({dateUtc:yyyy-MM-dd}).",
            UserId = actingUserId,
            CreatedAt = DateTime.UtcNow,
            IsInternal = true
        });

        await _context.SaveChangesAsync(ct);

        return new PublicHolidayDto
        {
            Id = holiday.Id,
            HolidayDate = holiday.HolidayDate,
            Name = holiday.Name,
            IsActive = holiday.IsActive
        };
    }

    public async Task<bool> DeletePublicHolidayAsync(Guid id, Guid actingUserId, CancellationToken ct = default)
    {
        var holiday = await _context.PublicHolidays.FindAsync(new object[] { id }, ct);
        if (holiday == null) return false;

        _context.PublicHolidays.Remove(holiday);
        _context.CaseEvents.Add(new CaseEvent
        {
            Id = Guid.NewGuid(),
            CaseId = null,
            EventType = EventType.Other,
            Module = "SlaEscalation",
            EntityName = "Public Holiday",
            ActionType = "DELETE",
            Message = $"Deleted public holiday '{holiday.Name}' ({holiday.HolidayDate:yyyy-MM-dd}).",
            UserId = actingUserId,
            CreatedAt = DateTime.UtcNow,
            IsInternal = true
        });

        await _context.SaveChangesAsync(ct);
        return true;
    }

    public async Task<EscalationLevelConfigDto> AddEscalationLevelAsync(CreateEscalationLevelDto dto, Guid actingUserId, CancellationToken ct = default)
    {
        var existing = await _context.EscalationLevelConfigs.OrderBy(l => l.LevelNumber).ToListAsync(ct);
        int nextLevelNumber = dto.LevelNumber.HasValue && dto.LevelNumber.Value > 0
            ? dto.LevelNumber.Value
            : (existing.Count > 0 ? existing.Max(l => l.LevelNumber) + 1 : 1);

        string levelName = string.IsNullOrWhiteSpace(dto.Name) ? $"Level {nextLevelNumber}" : dto.Name.Trim();
        string targetRole = string.IsNullOrWhiteSpace(dto.TargetRole) ? "Team Lead" : dto.TargetRole.Trim();
        string triggerCondition = string.IsNullOrWhiteSpace(dto.TriggerCondition) ? "SLA Consumption Breached" : dto.TriggerCondition.Trim();
        string actionDescription = string.IsNullOrWhiteSpace(dto.ActionDescription) ? $"Send notification to {targetRole}" : dto.ActionDescription.Trim();

        var newLevel = new EscalationLevelConfig
        {
            Id = Guid.NewGuid(),
            LevelNumber = nextLevelNumber,
            Name = levelName,
            AssignmentType = "Role",
            TargetRole = targetRole,
            TriggerType = "SlaPercentage",
            TriggerDescription = triggerCondition,
            ActionDescription = actionDescription,
            ReassignOwner = true,
            DisplayOrder = nextLevelNumber,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };

        _context.EscalationLevelConfigs.Add(newLevel);

        _context.CaseEvents.Add(new CaseEvent
        {
            Id = Guid.NewGuid(),
            CaseId = null,
            EventType = EventType.Other,
            Module = "SlaEscalation",
            EntityName = "Escalation Level",
            ActionType = "CREATE",
            Message = $"Created escalation level '{newLevel.Name}' (Target Role: {newLevel.TargetRole}, Trigger: {newLevel.TriggerDescription}).",
            UserId = actingUserId,
            CreatedAt = DateTime.UtcNow,
            IsInternal = true
        });

        await _context.SaveChangesAsync(ct);

        return new EscalationLevelConfigDto
        {
            Id = newLevel.Id,
            LevelNumber = newLevel.LevelNumber,
            Name = newLevel.Name,
            AssignmentType = newLevel.AssignmentType,
            TargetRole = newLevel.TargetRole,
            TargetUserId = newLevel.TargetUserId,
            TargetUserName = null,
            TriggerType = newLevel.TriggerType,
            TriggerValue = newLevel.TriggerValue,
            TriggerDescription = newLevel.TriggerDescription,
            ActionDescription = newLevel.ActionDescription,
            ReassignOwner = newLevel.ReassignOwner,
            IsActive = newLevel.IsActive
        };
    }

    public async Task<EscalationLevelConfigDto?> UpdateEscalationLevelAsync(Guid id, UpdateEscalationLevelDto dto, Guid actingUserId, CancellationToken ct = default)
    {
        var level = await _context.EscalationLevelConfigs.FirstOrDefaultAsync(l => l.Id == id, ct);
        if (level == null) return null;

        if (!string.IsNullOrWhiteSpace(dto.Name)) level.Name = dto.Name.Trim();
        if (!string.IsNullOrWhiteSpace(dto.TargetRole)) level.TargetRole = dto.TargetRole.Trim();
        if (!string.IsNullOrWhiteSpace(dto.TriggerCondition)) level.TriggerDescription = dto.TriggerCondition.Trim();
        if (!string.IsNullOrWhiteSpace(dto.ActionDescription)) level.ActionDescription = dto.ActionDescription.Trim();
        level.UpdatedAt = DateTime.UtcNow;

        _context.CaseEvents.Add(new CaseEvent
        {
            Id = Guid.NewGuid(),
            CaseId = null,
            EventType = EventType.Other,
            Module = "SlaEscalation",
            EntityName = "Escalation Level",
            ActionType = "UPDATE",
            Message = $"Updated escalation level '{level.Name}' (Target Role: {level.TargetRole}, Trigger: {level.TriggerDescription}).",
            UserId = actingUserId,
            CreatedAt = DateTime.UtcNow,
            IsInternal = true
        });

        await _context.SaveChangesAsync(ct);

        return new EscalationLevelConfigDto
        {
            Id = level.Id,
            LevelNumber = level.LevelNumber,
            Name = level.Name,
            AssignmentType = level.AssignmentType,
            TargetRole = level.TargetRole,
            TargetUserId = level.TargetUserId,
            TriggerType = level.TriggerType,
            TriggerValue = level.TriggerValue,
            TriggerDescription = level.TriggerDescription,
            ActionDescription = level.ActionDescription,
            ReassignOwner = level.ReassignOwner,
            IsActive = level.IsActive
        };
    }

    public async Task<bool> DeleteEscalationLevelAsync(Guid id, Guid actingUserId, CancellationToken ct = default)
    {
        var level = await _context.EscalationLevelConfigs.FirstOrDefaultAsync(l => l.Id == id, ct);
        if (level == null) return false;

        _context.EscalationLevelConfigs.Remove(level);
        await _context.SaveChangesAsync(ct);

        // Re-sequence remaining levels to maintain a continuous valid sequence 1, 2, 3...
        var remaining = await _context.EscalationLevelConfigs.OrderBy(l => l.LevelNumber).ToListAsync(ct);
        for (int i = 0; i < remaining.Count; i++)
        {
            remaining[i].LevelNumber = -(i + 1);
        }
        await _context.SaveChangesAsync(ct);

        for (int i = 0; i < remaining.Count; i++)
        {
            int newNum = i + 1;
            remaining[i].LevelNumber = newNum;
            remaining[i].DisplayOrder = newNum;
            if (remaining[i].Name.StartsWith("Level "))
            {
                remaining[i].Name = $"Level {newNum}";
            }
            remaining[i].UpdatedAt = DateTime.UtcNow;
        }

        _context.CaseEvents.Add(new CaseEvent
        {
            Id = Guid.NewGuid(),
            CaseId = null,
            EventType = EventType.Other,
            Module = "SlaEscalation",
            EntityName = "Escalation Level",
            ActionType = "DELETE",
            Message = $"Deleted escalation level '{level.Name}' and re-sequenced remaining levels.",
            UserId = actingUserId,
            CreatedAt = DateTime.UtcNow,
            IsInternal = true
        });

        await _context.SaveChangesAsync(ct);
        return true;
    }

    /// <summary>
    /// Finds the active sub-category (and the priority configured for it) a new case would belong to.
    /// Both the match and the mapping are by ID — names only locate the sub-category within its department.
    /// </summary>
    private async Task<(Guid SubCategoryId, PrioritySlaRule? Rule)?> FindMappedRuleAsync(Guid? departmentId, string? subCategoryName, CancellationToken ct)
    {
        if (!departmentId.HasValue || string.IsNullOrWhiteSpace(subCategoryName)) return null;

        var lowered = subCategoryName.Trim().ToLower();
        var subCategoryId = await _context.DepartmentSubCategories
            .AsNoTracking()
            .Where(s => s.DepartmentId == departmentId.Value && s.IsActive && s.Name.ToLower() == lowered)
            .Select(s => (Guid?)s.Id)
            .FirstOrDefaultAsync(ct);
        if (subCategoryId == null) return null;

        var rule = await _context.PriorityCategoryMappings
            .AsNoTracking()
            .Where(m => m.DepartmentSubCategoryId == subCategoryId.Value)
            .Select(m => m.PrioritySlaRule)
            .FirstOrDefaultAsync(ct);

        return (subCategoryId.Value, rule);
    }

    public async Task<PriorityResolution> ResolveEffectivePriorityAsync(
        Guid? departmentId, string? subCategoryName, string? requestedPriority, CancellationToken ct = default)
    {
        // 1. The sub-category's configured priority is authoritative.
        var mapped = await FindMappedRuleAsync(departmentId, subCategoryName, ct);
        if (mapped?.Rule is { IsActive: true } mappedRule)
            return new PriorityResolution(mappedRule.Priority, "SubCategoryMapping", mapped.Value.SubCategoryId);

        // 2. Otherwise the requested priority, which must be one of the configured, active ones.
        if (!string.IsNullOrWhiteSpace(requestedPriority))
        {
            var lowered = requestedPriority.Trim().ToLower();
            var rule = await _context.PrioritySlaRules.AsNoTracking()
                .Where(r => r.IsActive && r.Priority.ToLower() == lowered)
                .FirstOrDefaultAsync(ct);
            if (rule != null)
                return new PriorityResolution(rule.Priority, "Requested", mapped?.SubCategoryId);

            var available = await _context.PrioritySlaRules.AsNoTracking()
                .Where(r => r.IsActive).OrderBy(r => r.DisplayOrder).Select(r => r.Priority).ToListAsync(ct);
            throw new InvalidOperationException(
                $"'{requestedPriority.Trim()}' is not a configured priority. Configured priorities: {string.Join(", ", available)}.");
        }

        // 3. Never guess a default: an unmapped sub-category with no choice made is an input error.
        throw new InvalidOperationException(
            "A priority is required: this sub-category has no configured priority, so one must be selected.");
    }

    public async Task<PriorityResolutionDto> PreviewPriorityAsync(Guid? departmentId, string? subCategoryName, CancellationToken ct = default)
    {
        var mapped = await FindMappedRuleAsync(departmentId, subCategoryName, ct);
        if (mapped?.Rule is not { IsActive: true } rule)
            return new PriorityResolutionDto { IsMapped = false, SubCategoryId = mapped?.SubCategoryId };

        return new PriorityResolutionDto
        {
            IsMapped = true,
            Priority = rule.Priority,
            SubCategoryId = mapped!.Value.SubCategoryId,
            InternalHours = (int)Math.Ceiling(rule.InternalResolutionMinutes / 60.0),
            ExternalHours = (int)Math.Ceiling(rule.ExternalResolutionMinutes / 60.0),
            FirstResponseMinutes = rule.FirstResponseMinutes
        };
    }

    public async Task<PrioritySlaRule> GetActivePrioritySlaRuleAsync(string priority, CancellationToken ct = default)
    {
        var lowered = priority.Trim().ToLower();
        var rule = await _context.PrioritySlaRules
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.Priority.ToLower() == lowered, ct);

        // No built-in numbers to fall back on: a missing rule is a configuration error and must be loud.
        return rule ?? throw new InvalidOperationException(
            $"No SLA rule is configured for priority '{priority}'. Configure it under Cases SLA & Routing.");
    }

    public async Task<CaseEscalationStatusDto?> GetCaseEscalationStatusAsync(Guid caseId, CancellationToken ct = default)
    {
        var c = await _context.Cases
            .Include(x => x.Department)
            .Include(x => x.Owner)
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == caseId, ct);

        if (c == null) return null;

        var levels = await _context.EscalationLevelConfigs
            .Include(l => l.TargetUser)
            .AsNoTracking()
            .OrderBy(l => l.LevelNumber)
            .ToListAsync(ct);

        int maxLevel = levels.Count > 0 ? levels.Max(l => l.LevelNumber) : 4;
        int currentLevel = c.EscalationLevel > 0 ? c.EscalationLevel : 1;
        bool isMax = currentLevel >= maxLevel;
        int? nextLevel = isMax ? null : currentLevel + 1;

        var currentConfig = levels.FirstOrDefault(l => l.LevelNumber == currentLevel);
        var nextConfig = nextLevel.HasValue ? levels.FirstOrDefault(l => l.LevelNumber == nextLevel.Value) : null;

        User? nextUser = null;
        if (nextLevel.HasValue)
        {
            nextUser = await ResolveNextEscalationTargetAsync(c, nextLevel.Value, ct);
        }

        return new CaseEscalationStatusDto
        {
            CaseId = c.Id,
            CaseNumber = c.CaseNumber,
            CurrentLevel = currentLevel,
            CurrentLevelName = currentConfig?.Name ?? $"Level {currentLevel}",
            NextLevel = nextLevel,
            NextLevelName = nextConfig?.Name ?? (nextLevel.HasValue ? $"Level {nextLevel.Value}" : null),
            NextTargetRole = nextConfig?.TargetRole,
            NextTargetUserName = nextUser?.Name,
            NextTargetUserId = nextUser?.Id,
            IsMaxLevel = isMax,
            MaxLevelNotice = isMax ? $"This case has reached the maximum configured escalation level ({currentConfig?.Name ?? $"Level {currentLevel}"}). Further escalation is not allowed." : null,
            TriggerDescription = nextConfig?.TriggerDescription ?? string.Empty,
            ActionDescription = nextConfig?.ActionDescription ?? string.Empty
        };
    }

    public async Task<User?> ResolveNextEscalationTargetAsync(Case c, int targetLevel, CancellationToken ct = default)
    {
        var levelConfig = await _context.EscalationLevelConfigs
            .Include(l => l.TargetUser)
            .AsNoTracking()
            .FirstOrDefaultAsync(l => l.LevelNumber == targetLevel, ct);

        // 1. Direct user configured on the level
        if (levelConfig?.TargetUserId.HasValue == true)
        {
            var directUser = await _context.Users.FirstOrDefaultAsync(u => u.Id == levelConfig.TargetUserId.Value, ct);
            if (directUser != null) return directUser;
        }

        var allUsers = await _context.Users.AsNoTracking().ToListAsync(ct);

        string targetRole = levelConfig?.TargetRole ?? (targetLevel switch
        {
            2 => "Team Lead",
            3 => "CX Supervisor",
            4 => "Head of Customer Experience",
            _ => "Senior Specialist"
        });

        // 2. Department-scoped match for target role
        var deptMatch = allUsers.FirstOrDefault(u =>
            u.DepartmentId == c.DepartmentId &&
            u.Role.Contains(targetRole, StringComparison.OrdinalIgnoreCase) &&
            u.Id != c.OwnerId);

        if (deptMatch != null) return deptMatch;

        // 3. Fallback: Any active user with target role
        var globalMatch = allUsers.FirstOrDefault(u =>
            u.Role.Contains(targetRole, StringComparison.OrdinalIgnoreCase) &&
            u.Id != c.OwnerId);

        if (globalMatch != null) return globalMatch;

        // 4. Role fuzzy fallback for standard roles
        if (targetLevel == 2)
        {
            return allUsers.FirstOrDefault(u => u.Role.Contains("Lead", StringComparison.OrdinalIgnoreCase) && u.Id != c.OwnerId)
                ?? allUsers.FirstOrDefault(u => u.Role.Contains("Lead", StringComparison.OrdinalIgnoreCase));
        }
        if (targetLevel == 3)
        {
            return allUsers.FirstOrDefault(u => u.Role.Contains("Supervisor", StringComparison.OrdinalIgnoreCase) && u.Id != c.OwnerId)
                ?? allUsers.FirstOrDefault(u => u.Role.Contains("Supervisor", StringComparison.OrdinalIgnoreCase));
        }
        if (targetLevel == 4)
        {
            return allUsers.FirstOrDefault(u => u.Role.Contains("Head", StringComparison.OrdinalIgnoreCase) && u.Id != c.OwnerId)
                ?? allUsers.FirstOrDefault(u => u.Role.Contains("Head", StringComparison.OrdinalIgnoreCase));
        }

        // 5. General fallback: Department owner or any active user
        var dept = await _context.Departments.FirstOrDefaultAsync(d => d.Id == c.DepartmentId, ct);
        if (dept?.OwnerId != null && dept.OwnerId != c.OwnerId)
        {
            var deptOwner = allUsers.FirstOrDefault(u => u.Id == dept.OwnerId);
            if (deptOwner != null) return deptOwner;
        }

        return allUsers.FirstOrDefault(u => u.Id != c.OwnerId) ?? allUsers.FirstOrDefault();
    }
}
