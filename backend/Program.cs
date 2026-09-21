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

var frontendUrl = builder.Configuration["FrontendUrl"] ?? "https://csm-livid.vercel.app";

builder.Services.AddCors(options =>
{
    options.AddPolicy("ReactPolicy", policy =>
    {
        policy
            .SetIsOriginAllowed(_ => true)
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

// In-process cache used by the authorization middleware and lookup caching
builder.Services.AddMemoryCache();

// Bind tunables so they are configurable per environment rather than compiled in
builder.Services.Configure<CaseManagement.Api.Configuration.SearchOptions>(
    builder.Configuration.GetSection(CaseManagement.Api.Configuration.SearchOptions.SectionName));
builder.Services.Configure<CaseManagement.Api.Configuration.UserAuthorizationOptions>(
    builder.Configuration.GetSection(CaseManagement.Api.Configuration.UserAuthorizationOptions.SectionName));
builder.Services.Configure<CaseManagement.Api.Configuration.LookupCacheOptions>(
    builder.Configuration.GetSection(CaseManagement.Api.Configuration.LookupCacheOptions.SectionName));

// Register FluentValidation
builder.Services.AddFluentValidationAutoValidation();
builder.Services.AddValidatorsFromAssemblyContaining<Program>();

var app = builder.Build();

app.UseMiddleware<ExceptionMiddleware>();

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
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""CaseEvents"" ADD COLUMN IF NOT EXISTS ""NewValue"" text NULL;");
        db.Database.ExecuteSqlRaw(@"ALTER TABLE ""CaseEvents"" ADD COLUMN IF NOT EXISTS ""ActionType"" text NULL;");

        db.Database.ExecuteSqlRaw(@"
            CREATE TABLE IF NOT EXISTS ""NotificationRules"" (
                ""Id"" uuid NOT NULL CONSTRAINT ""PK_NotificationRules"" PRIMARY KEY,
                ""EventType"" text NOT NULL,
                ""Name"" text NOT NULL,
                ""IsEnabled"" boolean NOT NULL DEFAULT true,
                ""Priority"" text NOT NULL DEFAULT 'High',
                ""CooldownMinutes"" integer NOT NULL DEFAULT 60,
                ""MaxReminders"" integer NOT NULL DEFAULT 3,
                ""EnableAggregation"" boolean NOT NULL DEFAULT true,
                ""AggregationThreshold"" integer NOT NULL DEFAULT 3,
                ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT NOW(),
                ""UpdatedAt"" timestamp with time zone NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS ""IX_NotificationRules_EventType"" ON ""NotificationRules"" (""EventType"");
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

            CREATE TABLE IF NOT EXISTS ""DepartmentEscalationTemplates"" (
                ""Id"" uuid NOT NULL CONSTRAINT ""PK_DepartmentEscalationTemplates"" PRIMARY KEY,
                ""DepartmentId"" uuid NOT NULL CONSTRAINT ""FK_DepartmentEscalationTemplates_Departments_DepartmentId"" REFERENCES ""Departments"" (""Id"") ON DELETE CASCADE,
                ""EscalationReason"" text NOT NULL,
                ""SubjectTemplate"" text NOT NULL,
                ""BodyTemplate"" text NOT NULL,
                ""IsActive"" boolean NOT NULL DEFAULT true,
                ""CreatedAt"" timestamp with time zone NOT NULL,
                ""UpdatedAt"" timestamp with time zone NULL
            );
            CREATE INDEX IF NOT EXISTS ""IX_DepartmentEscalationTemplates_DepartmentId"" ON ""DepartmentEscalationTemplates"" (""DepartmentId"");
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
        ");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[DB Index Bootstrap] Note: {ex.Message}");
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
