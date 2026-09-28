using System;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using CaseManagement.Api.Configuration;
using CaseManagement.Api.Data;
using CaseManagement.Api.DTOs;
using CaseManagement.Api.Models;
using CaseManagement.Api.Repositories;
using CaseManagement.Api.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace CaseManagement.Tests;

public class AttachmentValidationTests
{
    private AppDbContext CreateInMemoryDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        return new AppDbContext(options);
    }

    private IFormFile CreateFormFile(string fileName, byte[] content, string contentType = "application/pdf")
    {
        var stream = new MemoryStream(content);
        return new FormFile(stream, 0, content.Length, "file", fileName)
        {
            Headers = new HeaderDictionary(),
            ContentType = contentType
        };
    }

    private async Task<Case> CreateSeededTestCaseAsync(AppDbContext db)
    {
        var dept = new Department { Id = Guid.NewGuid(), Name = "Support", Code = "SUP" };
        var user = new User { Id = Guid.NewGuid(), Name = "Agent 1", Email = "agent1@bank.com", Role = "Agent", DepartmentId = dept.Id };
        var customer = new Customer { Id = Guid.NewGuid(), FullName = "Customer 1", NRIC = "900101-14-1111", PhoneNumber = "+60123456789" };

        db.Departments.Add(dept);
        db.Users.Add(user);
        db.Customers.Add(customer);

        var testCase = new Case
        {
            Id = Guid.NewGuid(),
            CaseNumber = $"C-{Random.Shared.Next(1000, 9999)}",
            Title = "Test Case",
            CustomerId = customer.Id,
            Customer = customer,
            DepartmentId = dept.Id,
            Department = dept,
            OwnerId = user.Id,
            Owner = user,
            Status = CaseStatus.Open,
            CreatedAt = DateTime.UtcNow
        };
        db.Cases.Add(testCase);
        await db.SaveChangesAsync();
        return testCase;
    }

    [Fact]
    public async Task UploadAttachment_EmptyFile_ThrowsArgumentException()
    {
        using var db = CreateInMemoryDbContext();
        var mockEnv = new Mock<IWebHostEnvironment>();
        mockEnv.Setup(e => e.ContentRootPath).Returns(Path.GetTempPath());

        var service = new CaseService(
            new CaseRepository(db),
            new Mock<INotificationService>().Object,
            new Mock<IConfigurableSettingsService>().Object,
            db,
            mockEnv.Object
        );

        var emptyFile = CreateFormFile("test.pdf", Array.Empty<byte>());

        await Assert.ThrowsAsync<ArgumentException>(() =>
            service.UploadAttachmentAsync(Guid.NewGuid(), emptyFile, "note", Guid.NewGuid()));
    }

    [Fact]
    public async Task UploadAttachment_DangerousExtension_ThrowsArgumentException()
    {
        using var db = CreateInMemoryDbContext();
        var testCase = await CreateSeededTestCaseAsync(db);

        var mockEnv = new Mock<IWebHostEnvironment>();
        mockEnv.Setup(e => e.ContentRootPath).Returns(Path.GetTempPath());

        var service = new CaseService(
            new CaseRepository(db),
            new Mock<INotificationService>().Object,
            new Mock<IConfigurableSettingsService>().Object,
            db,
            mockEnv.Object
        );

        var exeFile = CreateFormFile("malware.exe", Encoding.UTF8.GetBytes("fake-executable"), "application/x-msdownload");

        var ex = await Assert.ThrowsAsync<ArgumentException>(() =>
            service.UploadAttachmentAsync(testCase.Id, exeFile, "malicious", Guid.NewGuid()));

        Assert.Contains("forbidden", ex.Message);
    }

    [Fact]
    public async Task UploadAttachment_DisallowedExtension_ThrowsArgumentException()
    {
        using var db = CreateInMemoryDbContext();
        var testCase = await CreateSeededTestCaseAsync(db);

        var mockEnv = new Mock<IWebHostEnvironment>();
        mockEnv.Setup(e => e.ContentRootPath).Returns(Path.GetTempPath());

        var options = Options.Create(new AttachmentOptions
        {
            AllowedExtensions = ".pdf,.docx,.png"
        });

        var service = new CaseService(
            new CaseRepository(db),
            new Mock<INotificationService>().Object,
            new Mock<IConfigurableSettingsService>().Object,
            db,
            mockEnv.Object,
            options
        );

        var mp3File = CreateFormFile("song.mp3", Encoding.UTF8.GetBytes("sound-data"), "audio/mpeg");

        var ex = await Assert.ThrowsAsync<ArgumentException>(() =>
            service.UploadAttachmentAsync(testCase.Id, mp3File, "song", Guid.NewGuid()));

        Assert.Contains("not permitted", ex.Message);
    }

    [Fact]
    public async Task UploadAttachment_ExceedsMaxFileSize_ThrowsArgumentException()
    {
        using var db = CreateInMemoryDbContext();
        var testCase = await CreateSeededTestCaseAsync(db);

        var mockEnv = new Mock<IWebHostEnvironment>();
        mockEnv.Setup(e => e.ContentRootPath).Returns(Path.GetTempPath());

        var options = Options.Create(new AttachmentOptions
        {
            MaxFileSizeBytes = 100 // 100 bytes max
        });

        var service = new CaseService(
            new CaseRepository(db),
            new Mock<INotificationService>().Object,
            new Mock<IConfigurableSettingsService>().Object,
            db,
            mockEnv.Object,
            options
        );

        var largeContent = new byte[200];
        var largeFile = CreateFormFile("large.pdf", largeContent, "application/pdf");

        var ex = await Assert.ThrowsAsync<ArgumentException>(() =>
            service.UploadAttachmentAsync(testCase.Id, largeFile, "too large", Guid.NewGuid()));

        Assert.Contains("exceeds", ex.Message);
    }
}
