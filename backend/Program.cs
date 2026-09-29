using CaseManagement.Api.Data;
using CaseManagement.Api.Extensions;
using CaseManagement.Api.Middleware;
using CaseManagement.Api.Repositories;
using CaseManagement.Api.Services;
using FluentValidation;
using FluentValidation.AspNetCore;
using Microsoft.EntityFrameworkCore;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        // Global string sanitization (trimming) for incoming JSON requests
        options.JsonSerializerOptions.Converters.Add(new TrimStringConverter());
        // Enums as strings
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
        // Ignore circular references
        options.JsonSerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
    });

// CORS allow-list is driven by configuration so production can restrict origins
// without code changes. The development config includes localhost ports.
var allowedOriginsRaw = builder.Configuration["AllowedOrigins"] ?? "http://localhost:3000,http://localhost:5173";
var allowedOrigins = allowedOriginsRaw
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
    .ToArray();

builder.Services.AddCors(options =>
{
    options.AddPolicy("ReactPolicy", policy =>
    {
        policy
            .WithOrigins(allowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Configure PostgreSQL
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");

builder.Services.AddDbContextPool<AppDbContext>(options =>
    options.UseNpgsql(connectionString, npgsqlOptions => 
    {
        npgsqlOptions.CommandTimeout(90);
        npgsqlOptions.EnableRetryOnFailure(maxRetryCount: 5, maxRetryDelay: TimeSpan.FromSeconds(10), errorCodesToAdd: null);
    }));

// Register Repositories
builder.Services.AddScoped<ICaseRepository, CaseRepository>();
builder.Services.AddScoped<ICustomerRepository, CustomerRepository>();
builder.Services.AddScoped<IDepartmentRepository, DepartmentRepository>();
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<IConfigurableSettingsRepository, ConfigurableSettingsRepository>();

// Register Services
builder.Services.AddScoped<ICaseService, CaseService>();
builder.Services.AddScoped<ICustomerService, CustomerService>();
builder.Services.AddScoped<IDepartmentService, DepartmentService>();
builder.Services.AddScoped<INotificationService, NotificationService>();
builder.Services.AddScoped<IConfigurableSettingsService, ConfigurableSettingsService>();
builder.Services.AddScoped<IPiiMaskingService, PiiMaskingService>();
builder.Services.AddScoped<IBusinessTimeService, BusinessTimeService>();
builder.Services.AddScoped<ISlaRoutingService, SlaRoutingService>();

// Register SLA Escalation Background Worker
builder.Services.AddHostedService<SlaEscalationBackgroundService>();

// In-process cache used by the authorization middleware and lookup caching
builder.Services.AddMemoryCache();

// Lets services read the acting user (for audit records) set by UserAuthorizationMiddleware
builder.Services.AddHttpContextAccessor();

// Bind tunables so they are configurable per environment rather than compiled in
builder.Services.Configure<CaseManagement.Api.Configuration.SearchOptions>(
    builder.Configuration.GetSection(CaseManagement.Api.Configuration.SearchOptions.SectionName));
builder.Services.Configure<CaseManagement.Api.Configuration.UserAuthorizationOptions>(
    builder.Configuration.GetSection(CaseManagement.Api.Configuration.UserAuthorizationOptions.SectionName));
builder.Services.Configure<CaseManagement.Api.Configuration.LookupCacheOptions>(
    builder.Configuration.GetSection(CaseManagement.Api.Configuration.LookupCacheOptions.SectionName));
builder.Services.Configure<CaseManagement.Api.Configuration.AttachmentOptions>(
    builder.Configuration.GetSection(CaseManagement.Api.Configuration.AttachmentOptions.SectionName));

// Register FluentValidation
builder.Services.AddFluentValidationAutoValidation();
builder.Services.AddValidatorsFromAssemblyContaining<Program>();

var app = builder.Build();

app.UseMiddleware<ExceptionMiddleware>();

// Correlation ID: if the host app sends one, use it; otherwise create one.
app.Use(async (context, next) =>
{
    if (!context.Request.Headers.ContainsKey("X-Correlation-Id"))
    {
        context.Request.Headers["X-Correlation-Id"] = Guid.NewGuid().ToString("N");
    }
    context.Response.Headers["X-Correlation-Id"] = context.Request.Headers["X-Correlation-Id"].ToString();
    using (app.Logger.BeginScope(new Dictionary<string, object> { ["CorrelationId"] = context.Request.Headers["X-Correlation-Id"].ToString() }))
    {
        await next();
    }
});

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Auto-migrate database on startup (for both dev and prod in this project)
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();
    
    // Automatically append PreferredLanguage column if missing from existing PostgreSQL database
    try
    {
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Customers"" ADD COLUMN IF NOT EXISTS ""PreferredLanguage"" text DEFAULT 'Bahasa Malaysia';");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Customers"" ADD COLUMN IF NOT EXISTS ""DateOfBirth"" timestamp with time zone NULL;");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Cases"" ADD COLUMN IF NOT EXISTS ""CaseType"" text DEFAULT 'Complaint';");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Cases"" ADD COLUMN IF NOT EXISTS ""ParentCaseId"" uuid NULL;");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Cases"" ADD COLUMN IF NOT EXISTS ""LinkedSourceCaseId"" uuid NULL;");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Cases"" ADD COLUMN IF NOT EXISTS ""SubcaseType"" text DEFAULT 'Original';");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Cases"" ADD COLUMN IF NOT EXISTS ""CommunicationChannel"" text DEFAULT 'Voice';");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Cases"" ADD COLUMN IF NOT EXISTS ""SourceChannel"" text DEFAULT 'Voice';");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Cases"" ADD COLUMN IF NOT EXISTS ""PreferredCommunicationChannel"" text DEFAULT 'Phone';");
        db.Database.ExecuteSqlRaw(@"UPDATE ""Cases"" SET ""SourceChannel"" = ""CommunicationChannel"" WHERE ""SourceChannel"" IS NULL OR ""SourceChannel"" = '';");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Cases"" ADD COLUMN IF NOT EXISTS ""Subcategory"" text DEFAULT 'General Inquiry';");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Cases"" ADD COLUMN IF NOT EXISTS ""SlaPausedAt"" timestamp with time zone NULL;");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Cases"" ADD COLUMN IF NOT EXISTS ""SlaTotalPausedMinutes"" integer DEFAULT 0;");
        
        // Priority First Response SLA & Escalation Matrix Columns
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Cases"" ADD COLUMN IF NOT EXISTS ""FirstResponseTargetMinutes"" integer DEFAULT 240;");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Cases"" ADD COLUMN IF NOT EXISTS ""FirstResponseDueAt"" timestamp with time zone NULL;");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Cases"" ADD COLUMN IF NOT EXISTS ""FirstResponseActualAt"" timestamp with time zone NULL;");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Cases"" ADD COLUMN IF NOT EXISTS ""FirstResponseStatus"" text DEFAULT 'Pending';");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Cases"" ADD COLUMN IF NOT EXISTS ""EscalationLevel"" integer DEFAULT 1;");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Cases"" ADD COLUMN IF NOT EXISTS ""Sla70ReminderSent"" boolean DEFAULT false;");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Cases"" ADD COLUMN IF NOT EXISTS ""Sla90Escalated"" boolean DEFAULT false;");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Cases"" ADD COLUMN IF NOT EXISTS ""SlaBreachedEscalated"" boolean DEFAULT false;");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Cases"" ADD COLUMN IF NOT EXISTS ""Sla12hBreachedEscalated"" boolean DEFAULT false;");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Cases"" ADD COLUMN IF NOT EXISTS ""SlaBreachedAt"" timestamp with time zone NULL;");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""SlaConfigurations"" ADD COLUMN IF NOT EXISTS ""FirstResponseMinutes"" integer DEFAULT 240;");

        // SLA Snapshot & Routing Columns
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Cases"" ADD COLUMN IF NOT EXISTS ""InternalResolutionTargetMinutes"" integer DEFAULT 120;");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Cases"" ADD COLUMN IF NOT EXISTS ""ExternalResolutionTargetMinutes"" integer DEFAULT 240;");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Cases"" ADD COLUMN IF NOT EXISTS ""InternalResolutionDueAt"" timestamp with time zone NULL;");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Cases"" ADD COLUMN IF NOT EXISTS ""ExternalResolutionDueAt"" timestamp with time zone NULL;");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Cases"" ADD COLUMN IF NOT EXISTS ""SlaConfigVersion"" integer DEFAULT 1;");

        // Cases SLA & Routing Tables
        db.Database.ExecuteSqlRaw(@"
            CREATE TABLE IF NOT EXISTS ""PrioritySlaRules"" (
                ""Id"" uuid NOT NULL CONSTRAINT ""PK_PrioritySlaRules"" PRIMARY KEY,
                ""Priority"" text NOT NULL,
                ""FirstResponseValue"" integer NOT NULL DEFAULT 30,
                ""FirstResponseUnit"" text NOT NULL DEFAULT 'Minutes',
                ""FirstResponseMinutes"" integer NOT NULL DEFAULT 30,
                ""InternalResolutionValue"" integer NOT NULL DEFAULT 2,
                ""InternalResolutionUnit"" text NOT NULL DEFAULT 'Hours',
                ""InternalResolutionMinutes"" integer NOT NULL DEFAULT 120,
                ""ExternalResolutionValue"" integer NOT NULL DEFAULT 4,
                ""ExternalResolutionUnit"" text NOT NULL DEFAULT 'Hours',
                ""ExternalResolutionMinutes"" integer NOT NULL DEFAULT 240,
                ""Version"" integer NOT NULL DEFAULT 1,
                ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT NOW(),
                ""UpdatedAt"" timestamp with time zone NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS ""IX_PrioritySlaRules_Priority"" ON ""PrioritySlaRules"" (""Priority"");

            CREATE TABLE IF NOT EXISTS ""PriorityCategoryMappings"" (
                ""Id"" uuid NOT NULL CONSTRAINT ""PK_PriorityCategoryMappings"" PRIMARY KEY,
                ""PrioritySlaRuleId"" uuid NOT NULL CONSTRAINT ""FK_PriorityCategoryMappings_PrioritySlaRules"" REFERENCES ""PrioritySlaRules"" (""Id"") ON DELETE CASCADE,
                ""Priority"" text NOT NULL DEFAULT 'Medium',
                ""CategoryName"" text NOT NULL,
                ""DepartmentSubCategoryId"" uuid NULL,
                ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT NOW(),
                ""UpdatedAt"" timestamp with time zone NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS ""IX_PriorityCategoryMappings_CategoryName"" ON ""PriorityCategoryMappings"" (""CategoryName"");
            CREATE INDEX IF NOT EXISTS ""IX_PriorityCategoryMappings_PrioritySlaRuleId"" ON ""PriorityCategoryMappings"" (""PrioritySlaRuleId"");

            CREATE TABLE IF NOT EXISTS ""BusinessHours"" (
                ""Id"" uuid NOT NULL CONSTRAINT ""PK_BusinessHours"" PRIMARY KEY,
                ""DayOfWeek"" integer NOT NULL,
                ""DayName"" text NOT NULL,
                ""IsEnabled"" boolean NOT NULL DEFAULT true,
                ""StartTime"" interval NOT NULL DEFAULT '09:00:00',
                ""EndTime"" interval NOT NULL DEFAULT '17:00:00',
                ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT NOW(),
                ""UpdatedAt"" timestamp with time zone NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS ""IX_BusinessHours_DayOfWeek"" ON ""BusinessHours"" (""DayOfWeek"");

            CREATE TABLE IF NOT EXISTS ""PublicHolidays"" (
                ""Id"" uuid NOT NULL CONSTRAINT ""PK_PublicHolidays"" PRIMARY KEY,
                ""HolidayDate"" timestamp with time zone NOT NULL,
                ""Name"" text NOT NULL,
                ""IsActive"" boolean NOT NULL DEFAULT true,
                ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT NOW(),
                ""UpdatedAt"" timestamp with time zone NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS ""IX_PublicHolidays_HolidayDate"" ON ""PublicHolidays"" (""HolidayDate"");

            CREATE TABLE IF NOT EXISTS ""EscalationLevelConfigs"" (
                ""Id"" uuid NOT NULL CONSTRAINT ""PK_EscalationLevelConfigs"" PRIMARY KEY,
                ""LevelNumber"" integer NOT NULL,
                ""Name"" text NOT NULL,
                ""AssignmentType"" text NOT NULL DEFAULT 'Role',
                ""TargetRole"" text NOT NULL DEFAULT 'Team Lead',
                ""TargetUserId"" uuid NULL CONSTRAINT ""FK_EscalationLevelConfigs_Users"" REFERENCES ""Users"" (""Id"") ON DELETE SET NULL,
                ""TriggerType"" text NOT NULL DEFAULT 'SlaPercentage',
                ""TriggerValue"" numeric NULL,
                ""TriggerDescription"" text NOT NULL DEFAULT '',
                ""ActionDescription"" text NOT NULL DEFAULT '',
                ""ReassignOwner"" boolean NOT NULL DEFAULT false,
                ""DisplayOrder"" integer NOT NULL DEFAULT 1,
                ""IsActive"" boolean NOT NULL DEFAULT true,
                ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT NOW(),
                ""UpdatedAt"" timestamp with time zone NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS ""IX_EscalationLevelConfigs_LevelNumber"" ON ""EscalationLevelConfigs"" (""LevelNumber"");
        ");
        
        db.Database.ExecuteSqlRaw(@"
            CREATE TABLE IF NOT EXISTS ""CaseChildRelations"" (
                ""Id"" uuid NOT NULL CONSTRAINT ""PK_CaseChildRelations"" PRIMARY KEY,
                ""ChildId"" text NOT NULL,
                ""ParentCaseId"" uuid NOT NULL CONSTRAINT ""FK_CaseChildRelations_Cases_ParentCaseId"" REFERENCES ""Cases"" (""Id"") ON DELETE CASCADE,
                ""RelationType"" text NOT NULL,
                ""LinkedCaseId"" uuid NULL CONSTRAINT ""FK_CaseChildRelations_Cases_LinkedCaseId"" REFERENCES ""Cases"" (""Id"") ON DELETE RESTRICT,
                ""Reason"" text NOT NULL DEFAULT '',
                ""CreatedByUserId"" uuid NOT NULL CONSTRAINT ""FK_CaseChildRelations_Users_CreatedByUserId"" REFERENCES ""Users"" (""Id"") ON DELETE RESTRICT,
                ""CreatedAt"" timestamp with time zone NOT NULL,
                ""UpdatedAt"" timestamp with time zone NULL
            );

            CREATE UNIQUE INDEX IF NOT EXISTS ""IX_CaseChildRelations_ChildId"" ON ""CaseChildRelations"" (""ChildId"");
            CREATE INDEX IF NOT EXISTS ""IX_CaseChildRelations_ParentCaseId"" ON ""CaseChildRelations"" (""ParentCaseId"");
            CREATE INDEX IF NOT EXISTS ""IX_CaseChildRelations_LinkedCaseId"" ON ""CaseChildRelations"" (""LinkedCaseId"");
            CREATE INDEX IF NOT EXISTS ""IX_CaseChildRelations_CreatedByUserId"" ON ""CaseChildRelations"" (""CreatedByUserId"");
        ");

        db.Database.ExecuteSqlRaw(@"
            CREATE TABLE IF NOT EXISTS ""Notifications"" (
                ""Id"" uuid NOT NULL CONSTRAINT ""PK_Notifications"" PRIMARY KEY
            );
        ");

        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Notifications"" ADD COLUMN IF NOT EXISTS ""RecipientUserId"" uuid;");
        db.Database.ExecuteSqlRaw(@"DO $$ BEGIN ALTER TABLE ""Notifications"" ALTER COLUMN ""UserId"" DROP NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END $$;");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Notifications"" ADD COLUMN IF NOT EXISTS ""Type"" text DEFAULT '';");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Notifications"" ADD COLUMN IF NOT EXISTS ""Title"" text DEFAULT '';");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Notifications"" ADD COLUMN IF NOT EXISTS ""Message"" text DEFAULT '';");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Notifications"" ADD COLUMN IF NOT EXISTS ""CaseId"" uuid NULL;");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Notifications"" ADD COLUMN IF NOT EXISTS ""CaseNumber"" text NULL;");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Notifications"" ADD COLUMN IF NOT EXISTS ""IsRead"" boolean DEFAULT false;");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Notifications"" ADD COLUMN IF NOT EXISTS ""CreatedAt"" timestamp with time zone DEFAULT NOW();");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Notifications"" ADD COLUMN IF NOT EXISTS ""ReadAt"" timestamp with time zone NULL;");
        
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Notifications"" ADD COLUMN IF NOT EXISTS ""Priority"" text DEFAULT 'High';");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Notifications"" ADD COLUMN IF NOT EXISTS ""ReminderCount"" integer DEFAULT 0;");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Notifications"" ADD COLUMN IF NOT EXISTS ""LastReminderAt"" timestamp with time zone NULL;");
        
        db.Database.ExecuteSqlRaw(@"DO $$ BEGIN ALTER TABLE ""CaseEvents"" ALTER COLUMN ""CaseId"" DROP NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END $$;");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""CaseEvents"" ADD COLUMN IF NOT EXISTS ""Module"" text NULL;");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""CaseEvents"" ADD COLUMN IF NOT EXISTS ""EntityName"" text NULL;");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""CaseEvents"" ADD COLUMN IF NOT EXISTS ""OldValue"" text NULL;");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""CaseEvents"" ADD COLUMN IF NOT EXISTS ""IsInternal"" boolean DEFAULT true;");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""CaseEvents"" ADD COLUMN IF NOT EXISTS ""Channel"" text NULL;");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Users"" ADD COLUMN IF NOT EXISTS ""Team"" text NULL;");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""Users"" ADD COLUMN IF NOT EXISTS ""Queue"" text NULL;");

        db.Database.ExecuteSqlRaw(@"
            CREATE TABLE IF NOT EXISTS ""CaseAttachments"" (
                ""Id"" uuid NOT NULL CONSTRAINT ""PK_CaseAttachments"" PRIMARY KEY,
                ""CaseId"" uuid NOT NULL CONSTRAINT ""FK_CaseAttachments_Cases_CaseId"" REFERENCES ""Cases"" (""Id"") ON DELETE CASCADE,
                ""FileName"" text NOT NULL,
                ""FileType"" text NOT NULL,
                ""FileSizeBytes"" bigint NOT NULL DEFAULT 0,
                ""StoragePath"" text NOT NULL,
                ""Note"" text NULL,
                ""UploadedByUserId"" uuid NOT NULL CONSTRAINT ""FK_CaseAttachments_Users_UploadedByUserId"" REFERENCES ""Users"" (""Id"") ON DELETE RESTRICT,
                ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT NOW(),
                ""UpdatedAt"" timestamp with time zone NULL
            );
            ALTER TABLE ""CaseAttachments"" ADD COLUMN IF NOT EXISTS ""FileType"" text DEFAULT '';
            ALTER TABLE ""CaseAttachments"" ADD COLUMN IF NOT EXISTS ""ContentType"" text DEFAULT 'application/octet-stream';
            DO $$ BEGIN ALTER TABLE ""CaseAttachments"" ALTER COLUMN ""ContentType"" DROP NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END $$;
            ALTER TABLE ""CaseAttachments"" ADD COLUMN IF NOT EXISTS ""FileSizeBytes"" bigint DEFAULT 0;
            ALTER TABLE ""CaseAttachments"" ADD COLUMN IF NOT EXISTS ""FileSize"" bigint DEFAULT 0;
            DO $$ BEGIN ALTER TABLE ""CaseAttachments"" ALTER COLUMN ""FileSize"" DROP NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END $$;
            ALTER TABLE ""CaseAttachments"" ADD COLUMN IF NOT EXISTS ""StoragePath"" text DEFAULT '';

            ALTER TABLE ""CaseAttachments"" ADD COLUMN IF NOT EXISTS ""Note"" text NULL;
            ALTER TABLE ""CaseAttachments"" ADD COLUMN IF NOT EXISTS ""UploadedByUserId"" uuid;
            CREATE INDEX IF NOT EXISTS ""IX_CaseAttachments_CaseId"" ON ""CaseAttachments"" (""CaseId"");
            CREATE INDEX IF NOT EXISTS ""IX_CaseAttachments_UploadedByUserId"" ON ""CaseAttachments"" (""UploadedByUserId"");
        ");



        db.Database.ExecuteSqlRaw(@"
            CREATE INDEX IF NOT EXISTS ""IX_Notifications_RecipientUserId"" ON ""Notifications"" (""RecipientUserId"");
            CREATE INDEX IF NOT EXISTS ""IX_Notifications_IsRead"" ON ""Notifications"" (""IsRead"");
            CREATE INDEX IF NOT EXISTS ""IX_Notifications_CreatedAt"" ON ""Notifications"" (""CreatedAt"");
        ");

        db.Database.ExecuteSqlRaw(@"
            CREATE TABLE IF NOT EXISTS ""FieldConfigurations"" (
                ""Id"" uuid NOT NULL CONSTRAINT ""PK_FieldConfigurations"" PRIMARY KEY,
                ""ModuleKey"" text NOT NULL,
                ""SectionKey"" text NOT NULL,
                ""ApiField"" text NOT NULL,
                ""DisplayLabel"" text NOT NULL,
                ""IsVisible"" boolean NOT NULL DEFAULT true,
                ""IsRequired"" boolean NOT NULL DEFAULT false,
                ""IsEditable"" boolean NOT NULL DEFAULT true,
                ""IsSensitive"" boolean NOT NULL DEFAULT false,
                ""MaskingRule"" text NOT NULL DEFAULT 'None',
                ""VisibleChars"" integer NOT NULL DEFAULT 4,
                ""DisplayOrder"" integer NOT NULL DEFAULT 0,
                ""FieldType"" text NOT NULL DEFAULT 'Text',
                ""ValidationRegex"" text NULL,
                ""MinLength"" integer NULL,
                ""MaxLength"" integer NULL,
                ""LookupTypeCode"" text NULL,
                ""IsCustomField"" boolean NOT NULL DEFAULT false,
                ""CreatedAt"" timestamp with time zone NOT NULL,
                ""UpdatedAt"" timestamp with time zone NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS ""IX_FieldConfigurations_ModuleKey_SectionKey_ApiField""
                ON ""FieldConfigurations"" (""ModuleKey"", ""SectionKey"", ""ApiField"");

            CREATE TABLE IF NOT EXISTS ""LookupTypes"" (
                ""Id"" uuid NOT NULL CONSTRAINT ""PK_LookupTypes"" PRIMARY KEY,
                ""Code"" text NOT NULL,
                ""Name"" text NOT NULL,
                ""Description"" text NOT NULL,
                ""CreatedAt"" timestamp with time zone NOT NULL,
                ""UpdatedAt"" timestamp with time zone NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS ""IX_LookupTypes_Code"" ON ""LookupTypes"" (""Code"");

            CREATE TABLE IF NOT EXISTS ""LookupValues"" (
                ""Id"" uuid NOT NULL CONSTRAINT ""PK_LookupValues"" PRIMARY KEY,
                ""LookupTypeId"" uuid NOT NULL CONSTRAINT ""FK_LookupValues_LookupTypes_LookupTypeId"" REFERENCES ""LookupTypes"" (""Id"") ON DELETE CASCADE,
                ""TypeCode"" text NOT NULL,
                ""Value"" text NOT NULL,
                ""Label"" text NOT NULL,
                ""DisplayOrder"" integer NOT NULL DEFAULT 0,
                ""IsActive"" boolean NOT NULL DEFAULT true,
                ""CreatedAt"" timestamp with time zone NOT NULL,
                ""UpdatedAt"" timestamp with time zone NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS ""IX_LookupValues_LookupTypeId_Value"" ON ""LookupValues"" (""LookupTypeId"", ""Value"");
            CREATE INDEX IF NOT EXISTS ""IX_LookupValues_TypeCode"" ON ""LookupValues"" (""TypeCode"");

            CREATE TABLE IF NOT EXISTS ""CustomerCustomAttributes"" (
                ""Id"" uuid NOT NULL CONSTRAINT ""PK_CustomerCustomAttributes"" PRIMARY KEY,
                ""CustomerId"" uuid NOT NULL CONSTRAINT ""FK_CustomerCustomAttributes_Customers_CustomerId"" REFERENCES ""Customers"" (""Id"") ON DELETE CASCADE,
                ""FieldKey"" text NOT NULL,
                ""FieldValue"" text NOT NULL,
                ""CreatedAt"" timestamp with time zone NOT NULL,
                ""UpdatedAt"" timestamp with time zone NULL
            );
            CREATE INDEX IF NOT EXISTS ""IX_CustomerCustomAttributes_CustomerId"" ON ""CustomerCustomAttributes"" (""CustomerId"");

            CREATE TABLE IF NOT EXISTS ""CaseTypeConfigs"" (
                ""Id"" uuid NOT NULL CONSTRAINT ""PK_CaseTypeConfigs"" PRIMARY KEY,
                ""Code"" text NOT NULL,
                ""Name"" text NOT NULL,
                ""Prefix"" text NOT NULL,
                ""DisplayOrder"" integer NOT NULL DEFAULT 0,
                ""IsActive"" boolean NOT NULL DEFAULT true,
                ""CreatedAt"" timestamp with time zone NOT NULL,
                ""UpdatedAt"" timestamp with time zone NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS ""IX_CaseTypeConfigs_Code"" ON ""CaseTypeConfigs"" (""Code"");

            CREATE TABLE IF NOT EXISTS ""DepartmentSubCategories"" (
                ""Id"" uuid NOT NULL CONSTRAINT ""PK_DepartmentSubCategories"" PRIMARY KEY,
                ""DepartmentId"" uuid NOT NULL CONSTRAINT ""FK_DepartmentSubCategories_Departments_DepartmentId"" REFERENCES ""Departments"" (""Id"") ON DELETE CASCADE,
                ""Name"" text NOT NULL,
                ""Code"" text NOT NULL,
                ""DisplayOrder"" integer NOT NULL DEFAULT 0,
                ""IsActive"" boolean NOT NULL DEFAULT true,
                ""CreatedAt"" timestamp with time zone NOT NULL,
                ""UpdatedAt"" timestamp with time zone NULL
            );
            CREATE INDEX IF NOT EXISTS ""IX_DepartmentSubCategories_DepartmentId"" ON ""DepartmentSubCategories"" (""DepartmentId"");

            CREATE TABLE IF NOT EXISTS ""SlaConfigurations"" (
                ""Id"" uuid NOT NULL CONSTRAINT ""PK_SlaConfigurations"" PRIMARY KEY,
                ""Severity"" text NOT NULL,
                ""InternalHours"" integer NOT NULL DEFAULT 0,
                ""ExternalHours"" integer NOT NULL DEFAULT 0,
                ""IsActive"" boolean NOT NULL DEFAULT true,
                ""CreatedAt"" timestamp with time zone NOT NULL,
                ""UpdatedAt"" timestamp with time zone NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS ""IX_SlaConfigurations_Severity"" ON ""SlaConfigurations"" (""Severity"");

            -- Clean up retired tables from removed features
            DROP TABLE IF EXISTS ""DepartmentEscalationTemplates"" CASCADE;
            DROP TABLE IF EXISTS ""NotificationRules"" CASCADE;
        ");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[DB Auto-Migration] Note: {ex.Message}");
    }

    // --- Performance indexes -----------------------------------------------------------
    // These mirror the HasIndex declarations in AppDbContext.OnModelCreating so that
    // databases created by EnsureCreated() and databases grown by the ALTERs above end up
    // with the same physical schema. Every statement is IF NOT EXISTS, so this block is safe
    // to re-run on every startup. It is isolated in its own try/catch so a failure here
    // cannot prevent the case-number sequence below from being created.
    try
    {
        db.Database.ExecuteSqlRaw(@"
            -- Board listing: ORDER BY ""CreatedAt"" DESC, optionally filtered by department.
            CREATE INDEX IF NOT EXISTS ""IX_Cases_CreatedAt"" ON ""Cases"" (""CreatedAt"" DESC);
            CREATE INDEX IF NOT EXISTS ""IX_Cases_DepartmentId_CreatedAt"" ON ""Cases"" (""DepartmentId"", ""CreatedAt"" DESC);

            -- Sub-case hierarchy: columns were added by ALTER above, so EF never indexed them.
            CREATE INDEX IF NOT EXISTS ""IX_Cases_ParentCaseId"" ON ""Cases"" (""ParentCaseId"");
            CREATE INDEX IF NOT EXISTS ""IX_Cases_LinkedSourceCaseId"" ON ""Cases"" (""LinkedSourceCaseId"");

            -- Audit trail: global ORDER BY ""CreatedAt"" DESC with keyset/offset paging,
            -- and per-case timelines on the case detail screen.
            CREATE INDEX IF NOT EXISTS ""IX_CaseEvents_CreatedAt"" ON ""CaseEvents"" (""CreatedAt"" DESC);
            CREATE INDEX IF NOT EXISTS ""IX_CaseEvents_CaseId_CreatedAt"" ON ""CaseEvents"" (""CaseId"", ""CreatedAt"" DESC);

            -- Notification list is always scoped to one recipient, newest first.
            CREATE INDEX IF NOT EXISTS ""IX_Notifications_RecipientUserId_CreatedAt"" ON ""Notifications"" (""RecipientUserId"", ""CreatedAt"" DESC);
            -- Unread badge polls this constantly; a partial index keeps it tiny.
            CREATE INDEX IF NOT EXISTS ""IX_Notifications_Unread"" ON ""Notifications"" (""RecipientUserId"") WHERE ""IsRead"" = false;

            -- Customer lookup normalises the NRIC before comparing (REPLACE(""NRIC"", '-', '')),
            -- which the plain unique index on ""NRIC"" cannot serve. A matching expression index
            -- makes that branch an index lookup instead of a sequential scan. Expressed as raw
            -- SQL because EF Core cannot model an expression index.
            CREATE INDEX IF NOT EXISTS ""IX_Customers_NRIC_Normalized""
                ON ""Customers"" (replace(""NRIC"", '-', ''));

            -- Case List View paging and Board columns: WHERE Status = ? ORDER BY CreatedAt DESC.
            CREATE INDEX IF NOT EXISTS ""IX_Cases_Status_CreatedAt"" ON ""Cases"" (""Status"", ""CreatedAt"" DESC);
            -- Priority filter and severity usage counts.
            CREATE INDEX IF NOT EXISTS ""IX_Cases_Severity"" ON ""Cases"" (""Severity"");
            -- Duplicate-notification check performed before every notification insert.
            CREATE INDEX IF NOT EXISTS ""IX_Notifications_Dedup""
                ON ""Notifications"" (""RecipientUserId"", ""Type"", ""CaseId"", ""CreatedAt"" DESC);
        ");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[DB Index Bootstrap] Note: {ex.Message}");
    }

    // --- Case collaboration feed ------------------------------------------------------
    // Collaboration activity is stored apart from the case workflow timeline (CaseEvents).
    try
    {
        db.Database.ExecuteSqlRaw(@"
            CREATE TABLE IF NOT EXISTS ""CaseCollaborationActivities"" (
                ""Id"" uuid NOT NULL CONSTRAINT ""PK_CaseCollaborationActivities"" PRIMARY KEY,
                ""CaseId"" uuid NOT NULL CONSTRAINT ""FK_CaseCollaborationActivities_Cases_CaseId"" REFERENCES ""Cases"" (""Id"") ON DELETE CASCADE,
                ""ActivityType"" text NOT NULL,
                ""ActorUserId"" uuid NOT NULL CONSTRAINT ""FK_CaseCollaborationActivities_Users_ActorUserId"" REFERENCES ""Users"" (""Id"") ON DELETE RESTRICT,
                ""TargetUserId"" uuid NULL CONSTRAINT ""FK_CaseCollaborationActivities_Users_TargetUserId"" REFERENCES ""Users"" (""Id"") ON DELETE RESTRICT,
                ""Content"" text NULL,
                ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS ""IX_CaseCollaborationActivities_CaseId_CreatedAt""
                ON ""CaseCollaborationActivities"" (""CaseId"", ""CreatedAt"" DESC);
            CREATE INDEX IF NOT EXISTS ""IX_CaseCollaborationActivities_ActorUserId"" ON ""CaseCollaborationActivities"" (""ActorUserId"");
            CREATE INDEX IF NOT EXISTS ""IX_CaseCollaborationActivities_TargetUserId"" ON ""CaseCollaborationActivities"" (""TargetUserId"");
        ");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[DB Collaboration Bootstrap] Note: {ex.Message}");
    }

    // --- Trigram search indexes ---------------------------------------------------------
    // Case and customer search use ILIKE '%term%', which a B-tree index cannot serve. pg_trgm
    // GIN indexes make those searches index scans. Isolated so a database without permission
    // to create the extension still starts normally (search just stays unindexed).
    try
    {
        db.Database.ExecuteSqlRaw(@"
            CREATE EXTENSION IF NOT EXISTS pg_trgm;
            CREATE INDEX IF NOT EXISTS ""IX_Cases_CaseNumber_Trgm"" ON ""Cases"" USING gin (""CaseNumber"" gin_trgm_ops);
            CREATE INDEX IF NOT EXISTS ""IX_Cases_Title_Trgm"" ON ""Cases"" USING gin (""Title"" gin_trgm_ops);
            CREATE INDEX IF NOT EXISTS ""IX_Customers_FullName_Trgm"" ON ""Customers"" USING gin (""FullName"" gin_trgm_ops);
            CREATE INDEX IF NOT EXISTS ""IX_Users_Name_Trgm"" ON ""Users"" USING gin (""Name"" gin_trgm_ops);
        ");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[DB Trigram Index Bootstrap] Note: {ex.Message}");
    }

    // --- Case number sequence ----------------------------------------------------------
    // Atomic allocation for the numeric part of Cases.CaseNumber. The starting point is
    // derived from the data already present (never a hardcoded constant) and is only ever
    // moved forward, so restarts and pre-existing rows are both handled. If this fails the
    // repository falls back to a database-side MAX, so case creation keeps working.
    try
    {
        db.Database.ExecuteSqlRaw($@"
            DO $$
            DECLARE
                data_max    bigint;
                current_val bigint;
                target      bigint;
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_class c
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE c.relkind = 'S' AND c.relname = '{SchemaConstants.CaseNumberSequence}'
                ) THEN
                    CREATE SEQUENCE {SchemaConstants.CaseNumberSequence};
                END IF;

                SELECT COALESCE(MAX(split_part(""CaseNumber"", '-', 2)::bigint), 0)
                  INTO data_max
                  FROM ""Cases""
                 WHERE split_part(""CaseNumber"", '-', 2) ~ '^[0-9]+$';

                SELECT CASE WHEN is_called THEN last_value ELSE 0 END
                  INTO current_val
                  FROM {SchemaConstants.CaseNumberSequence};

                target := GREATEST(data_max, current_val);
                PERFORM setval('{SchemaConstants.CaseNumberSequence}', GREATEST(target, 1), target > 0);
            END $$;
        ");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[DB Case Sequence Bootstrap] Note: {ex.Message}");
    }

    DbSeeder.Seed(db);
}

app.UseHttpsRedirection();

app.UseCors("ReactPolicy");

app.UseMiddleware<UserAuthorizationMiddleware>();
app.UseAuthorization();

app.MapControllers();

app.Run();
