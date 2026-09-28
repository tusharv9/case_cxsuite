using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using CaseManagement.Api.Data;
using CaseManagement.Api.DTOs;
using CaseManagement.Api.Models;
using CaseManagement.Api.Services;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace CaseManagement.Tests;

public class PiiMaskingTests
{
    private AppDbContext CreateInMemoryDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        return new AppDbContext(options);
    }

    [Fact]
    public void Mask_FullMask_ReturnsAllAsterisks()
    {
        using var db = CreateInMemoryDbContext();
        var service = new PiiMaskingService(db);

        var result = service.Mask("900101-14-5555", "FullMask");

        Assert.Equal("**************", result);
    }

    [Fact]
    public void Mask_HideMiddle_PreservesPrefixAndSuffix()
    {
        using var db = CreateInMemoryDbContext();
        var service = new PiiMaskingService(db);

        // "0123456789", visibleChars = 2 -> prefix "01", middle "***", suffix "89"
        var result = service.Mask("0123456789", "HideMiddle", 2);

        Assert.Equal("01******89", result);
    }

    [Fact]
    public void Mask_HideFirstShowLast_HidesPrefixShowsSuffix()
    {
        using var db = CreateInMemoryDbContext();
        var service = new PiiMaskingService(db);

        var result = service.Mask("+60123456789", "HideFirstShowLast", 4);

        Assert.Equal("********6789", result);
    }

    [Fact]
    public void Mask_None_ReturnsOriginalValue()
    {
        using var db = CreateInMemoryDbContext();
        var service = new PiiMaskingService(db);

        var result = service.Mask("normal text", "None");

        Assert.Equal("normal text", result);
    }

    [Fact]
    public async Task MaskCustomerSummaryAsync_AppliesConfiguredRules()
    {
        using var db = CreateInMemoryDbContext();

        db.FieldConfigurations.AddRange(
            new FieldConfiguration
            {
                Id = Guid.NewGuid(),
                ModuleKey = "CustomerManagement",
                SectionKey = "Profile",
                ApiField = "nric",
                DisplayLabel = "NRIC",
                IsSensitive = true,
                MaskingRule = "HideMiddle",
                VisibleChars = 3,
                CreatedAt = DateTime.UtcNow
            },
            new FieldConfiguration
            {
                Id = Guid.NewGuid(),
                ModuleKey = "CustomerManagement",
                SectionKey = "Profile",
                ApiField = "phoneNumber",
                DisplayLabel = "Phone Number",
                IsSensitive = true,
                MaskingRule = "HideFirstShowLast",
                VisibleChars = 4,
                CreatedAt = DateTime.UtcNow
            },
            new FieldConfiguration
            {
                Id = Guid.NewGuid(),
                ModuleKey = "CustomerManagement",
                SectionKey = "Profile",
                ApiField = "dateOfBirth",
                DisplayLabel = "Date of Birth",
                IsSensitive = true,
                MaskingRule = "FullMask",
                VisibleChars = 0,
                CreatedAt = DateTime.UtcNow
            }
        );
        await db.SaveChangesAsync();

        var service = new PiiMaskingService(db);

        var summary = new CustomerSummaryDto
        {
            Id = Guid.NewGuid(),
            FullName = "Ahmad Razak",
            NRIC = "900101-14-5555",
            PhoneNumber = "+60123456789",
            DateOfBirth = new DateTime(1990, 1, 1)
        };

        await service.MaskCustomerSummaryAsync(summary);

        Assert.Equal("Ahmad Razak", summary.FullName);
        Assert.StartsWith("900", summary.NRIC);
        Assert.EndsWith("555", summary.NRIC);
        Assert.Contains("*", summary.NRIC);
        Assert.EndsWith("6789", summary.PhoneNumber);
        Assert.Null(summary.DateOfBirth);
    }
}
