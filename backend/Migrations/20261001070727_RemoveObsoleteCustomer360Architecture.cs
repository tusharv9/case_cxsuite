using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CaseManagement.Api.Migrations
{
    /// <inheritdoc />
    public partial class RemoveObsoleteCustomer360Architecture : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CaseEvents_Cases_CaseId",
                table: "CaseEvents");

            migrationBuilder.DropIndex(
                name: "IX_Customers_NRIC",
                table: "Customers");

            migrationBuilder.DropIndex(
                name: "IX_Cases_DepartmentId",
                table: "Cases");

            migrationBuilder.DropIndex(
                name: "IX_CaseEvents_CaseId",
                table: "CaseEvents");

            migrationBuilder.DropColumn(
                name: "TenureMonths",
                table: "Customers");

            migrationBuilder.Sql(@"DROP TABLE IF EXISTS ""CustomerProducts"", ""CustomerTransactions"", ""CustomerReferrals"" CASCADE;");
            migrationBuilder.Sql(@"ALTER TABLE ""Customers"" DROP COLUMN IF EXISTS ""ReferralStatus"";");

            migrationBuilder.AddColumn<string>(
                name: "Queue",
                table: "Users",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Team",
                table: "Users",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Channels",
                table: "Departments",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Function",
                table: "Departments",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<bool>(
                name: "IsActive",
                table: "Departments",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AlterColumn<string>(
                name: "NRIC",
                table: "Customers",
                type: "text",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AddColumn<string>(
                name: "AccountNumber",
                table: "Customers",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "DateOfBirth",
                table: "Customers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "IdType",
                table: "Customers",
                type: "text",
                nullable: false,
                defaultValue: "NRIC Number");

            migrationBuilder.AddColumn<string>(
                name: "Passport",
                table: "Customers",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PreferredLanguage",
                table: "Customers",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "CaseType",
                table: "Cases",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "CommunicationChannel",
                table: "Cases",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "EscalationLevel",
                table: "Cases",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "ExternalResolutionDueAt",
                table: "Cases",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ExternalResolutionTargetMinutes",
                table: "Cases",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "FirstResponseActualAt",
                table: "Cases",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "FirstResponseDueAt",
                table: "Cases",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FirstResponseStatus",
                table: "Cases",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "FirstResponseTargetMinutes",
                table: "Cases",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "InternalResolutionDueAt",
                table: "Cases",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "InternalResolutionTargetMinutes",
                table: "Cases",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<Guid>(
                name: "LinkedSourceCaseId",
                table: "Cases",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ParentCaseId",
                table: "Cases",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PreferredCommunicationChannel",
                table: "Cases",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<bool>(
                name: "Sla12hBreachedEscalated",
                table: "Cases",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "Sla70ReminderSent",
                table: "Cases",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "Sla90Escalated",
                table: "Cases",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "SlaBreachedAt",
                table: "Cases",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "SlaBreachedEscalated",
                table: "Cases",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "SlaConfigVersion",
                table: "Cases",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "SlaPausedAt",
                table: "Cases",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SlaTotalPausedMinutes",
                table: "Cases",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "SourceChannel",
                table: "Cases",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "SubcaseType",
                table: "Cases",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Subcategory",
                table: "Cases",
                type: "text",
                nullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "CaseId",
                table: "CaseEvents",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddColumn<string>(
                name: "ActionType",
                table: "CaseEvents",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Channel",
                table: "CaseEvents",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EntityName",
                table: "CaseEvents",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsInternal",
                table: "CaseEvents",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "Module",
                table: "CaseEvents",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "NewValue",
                table: "CaseEvents",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "OldValue",
                table: "CaseEvents",
                type: "text",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "AgentSkills",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    SkillName = table.Column<string>(type: "text", nullable: false),
                    ProficiencyLevel = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AgentSkills", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AgentSkills_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "AssignmentConfigurations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DepartmentId = table.Column<Guid>(type: "uuid", nullable: true),
                    Algorithm = table.Column<string>(type: "text", nullable: false),
                    MaxConcurrentCapacity = table.Column<int>(type: "integer", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AssignmentConfigurations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AssignmentConfigurations_Departments_DepartmentId",
                        column: x => x.DepartmentId,
                        principalTable: "Departments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "BusinessHours",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DayOfWeek = table.Column<int>(type: "integer", nullable: false),
                    DayName = table.Column<string>(type: "text", nullable: false),
                    IsEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    StartTime = table.Column<TimeSpan>(type: "interval", nullable: false),
                    EndTime = table.Column<TimeSpan>(type: "interval", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BusinessHours", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "CaseAttachments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CaseId = table.Column<Guid>(type: "uuid", nullable: false),
                    FileName = table.Column<string>(type: "text", nullable: false),
                    FileType = table.Column<string>(type: "text", nullable: false),
                    ContentType = table.Column<string>(type: "text", nullable: true),
                    FileSizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    FileSize = table.Column<long>(type: "bigint", nullable: true),
                    StoragePath = table.Column<string>(type: "text", nullable: false),
                    Note = table.Column<string>(type: "text", nullable: true),
                    UploadedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CaseAttachments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CaseAttachments_Cases_CaseId",
                        column: x => x.CaseId,
                        principalTable: "Cases",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CaseAttachments_Users_UploadedByUserId",
                        column: x => x.UploadedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CaseChildRelations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ChildId = table.Column<string>(type: "text", nullable: false),
                    ParentCaseId = table.Column<Guid>(type: "uuid", nullable: false),
                    RelationType = table.Column<string>(type: "text", nullable: false),
                    LinkedCaseId = table.Column<Guid>(type: "uuid", nullable: true),
                    Reason = table.Column<string>(type: "text", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CaseChildRelations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CaseChildRelations_Cases_LinkedCaseId",
                        column: x => x.LinkedCaseId,
                        principalTable: "Cases",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CaseChildRelations_Cases_ParentCaseId",
                        column: x => x.ParentCaseId,
                        principalTable: "Cases",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CaseChildRelations_Users_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CaseCollaborationActivities",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CaseId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActivityType = table.Column<string>(type: "text", nullable: false),
                    ActorUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    TargetUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    Content = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CaseCollaborationActivities", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CaseCollaborationActivities_Cases_CaseId",
                        column: x => x.CaseId,
                        principalTable: "Cases",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CaseCollaborationActivities_Users_ActorUserId",
                        column: x => x.ActorUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CaseCollaborationActivities_Users_TargetUserId",
                        column: x => x.TargetUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CaseTypeConfigs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "text", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Prefix = table.Column<string>(type: "text", nullable: false),
                    DisplayOrder = table.Column<int>(type: "integer", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CaseTypeConfigs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "CustomerCustomAttributes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: false),
                    FieldKey = table.Column<string>(type: "text", nullable: false),
                    FieldValue = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomerCustomAttributes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CustomerCustomAttributes_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "DepartmentSubCategories",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DepartmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Code = table.Column<string>(type: "text", nullable: false),
                    DisplayOrder = table.Column<int>(type: "integer", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DepartmentSubCategories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DepartmentSubCategories_Departments_DepartmentId",
                        column: x => x.DepartmentId,
                        principalTable: "Departments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "EscalationLevelConfigs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    LevelNumber = table.Column<int>(type: "integer", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    AssignmentType = table.Column<string>(type: "text", nullable: false),
                    TargetRole = table.Column<string>(type: "text", nullable: false),
                    TargetUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    TriggerType = table.Column<string>(type: "text", nullable: false),
                    TriggerValue = table.Column<decimal>(type: "numeric", nullable: true),
                    TriggerDescription = table.Column<string>(type: "text", nullable: false),
                    ActionDescription = table.Column<string>(type: "text", nullable: false),
                    ReassignOwner = table.Column<bool>(type: "boolean", nullable: false),
                    DisplayOrder = table.Column<int>(type: "integer", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EscalationLevelConfigs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EscalationLevelConfigs_Users_TargetUserId",
                        column: x => x.TargetUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "FieldConfigurations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ModuleKey = table.Column<string>(type: "text", nullable: false),
                    SectionKey = table.Column<string>(type: "text", nullable: false),
                    ApiField = table.Column<string>(type: "text", nullable: false),
                    DisplayLabel = table.Column<string>(type: "text", nullable: false),
                    IsVisible = table.Column<bool>(type: "boolean", nullable: false),
                    IsRequired = table.Column<bool>(type: "boolean", nullable: false),
                    IsEditable = table.Column<bool>(type: "boolean", nullable: false),
                    IsSensitive = table.Column<bool>(type: "boolean", nullable: false),
                    MaskingRule = table.Column<string>(type: "text", nullable: false),
                    VisibleChars = table.Column<int>(type: "integer", nullable: false),
                    DisplayOrder = table.Column<int>(type: "integer", nullable: false),
                    FieldType = table.Column<string>(type: "text", nullable: false),
                    ValidationRegex = table.Column<string>(type: "text", nullable: true),
                    MinLength = table.Column<int>(type: "integer", nullable: true),
                    MaxLength = table.Column<int>(type: "integer", nullable: true),
                    LookupTypeCode = table.Column<string>(type: "text", nullable: true),
                    IsCustomField = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FieldConfigurations", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "LookupTypes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "text", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LookupTypes", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Notifications",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RecipientUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<string>(type: "text", nullable: false),
                    Title = table.Column<string>(type: "text", nullable: false),
                    Message = table.Column<string>(type: "text", nullable: false),
                    CaseId = table.Column<Guid>(type: "uuid", nullable: true),
                    CaseNumber = table.Column<string>(type: "text", nullable: true),
                    IsRead = table.Column<bool>(type: "boolean", nullable: false),
                    Priority = table.Column<string>(type: "text", nullable: false),
                    ReminderCount = table.Column<int>(type: "integer", nullable: false),
                    LastReminderAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ReadAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Notifications", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Notifications_Users_RecipientUserId",
                        column: x => x.RecipientUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PrioritySlaRules",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Priority = table.Column<string>(type: "text", nullable: false),
                    FirstResponseValue = table.Column<int>(type: "integer", nullable: false),
                    FirstResponseUnit = table.Column<string>(type: "text", nullable: false),
                    FirstResponseMinutes = table.Column<int>(type: "integer", nullable: false),
                    InternalResolutionValue = table.Column<int>(type: "integer", nullable: false),
                    InternalResolutionUnit = table.Column<string>(type: "text", nullable: false),
                    InternalResolutionMinutes = table.Column<int>(type: "integer", nullable: false),
                    ExternalResolutionValue = table.Column<int>(type: "integer", nullable: false),
                    ExternalResolutionUnit = table.Column<string>(type: "text", nullable: false),
                    ExternalResolutionMinutes = table.Column<int>(type: "integer", nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PrioritySlaRules", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PublicHolidays",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    HolidayDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PublicHolidays", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "RoutingRules",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: false),
                    EvaluationOrder = table.Column<int>(type: "integer", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    ConditionsJson = table.Column<string>(type: "text", nullable: false),
                    TargetDepartmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    TargetQueueName = table.Column<string>(type: "text", nullable: true),
                    ActionDescription = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RoutingRules", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RoutingRules_Departments_TargetDepartmentId",
                        column: x => x.TargetDepartmentId,
                        principalTable: "Departments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SlaConfigurations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Severity = table.Column<string>(type: "text", nullable: false),
                    InternalHours = table.Column<int>(type: "integer", nullable: false),
                    ExternalHours = table.Column<int>(type: "integer", nullable: false),
                    FirstResponseMinutes = table.Column<int>(type: "integer", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SlaConfigurations", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "TeamAssignmentPointers",
                columns: table => new
                {
                    DepartmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    LastAssignedUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    LastAssignedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeamAssignmentPointers", x => x.DepartmentId);
                    table.ForeignKey(
                        name: "FK_TeamAssignmentPointers_Departments_DepartmentId",
                        column: x => x.DepartmentId,
                        principalTable: "Departments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_TeamAssignmentPointers_Users_LastAssignedUserId",
                        column: x => x.LastAssignedUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TeamMembers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DepartmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    MemberRole = table.Column<string>(type: "text", nullable: false),
                    PrimaryChannel = table.Column<string>(type: "text", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    JoinedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeamMembers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TeamMembers_Departments_DepartmentId",
                        column: x => x.DepartmentId,
                        principalTable: "Departments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_TeamMembers_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "LookupValues",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    LookupTypeId = table.Column<Guid>(type: "uuid", nullable: false),
                    TypeCode = table.Column<string>(type: "text", nullable: false),
                    Value = table.Column<string>(type: "text", nullable: false),
                    Label = table.Column<string>(type: "text", nullable: false),
                    DisplayOrder = table.Column<int>(type: "integer", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LookupValues", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LookupValues_LookupTypes_LookupTypeId",
                        column: x => x.LookupTypeId,
                        principalTable: "LookupTypes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PriorityCategoryMappings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PrioritySlaRuleId = table.Column<Guid>(type: "uuid", nullable: false),
                    Priority = table.Column<string>(type: "text", nullable: false),
                    CategoryName = table.Column<string>(type: "text", nullable: false),
                    DepartmentSubCategoryId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PriorityCategoryMappings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PriorityCategoryMappings_DepartmentSubCategories_Department~",
                        column: x => x.DepartmentSubCategoryId,
                        principalTable: "DepartmentSubCategories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_PriorityCategoryMappings_PrioritySlaRules_PrioritySlaRuleId",
                        column: x => x.PrioritySlaRuleId,
                        principalTable: "PrioritySlaRules",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Customers_AccountNumber_Unique",
                table: "Customers",
                column: "AccountNumber",
                unique: true,
                filter: "\"AccountNumber\" IS NOT NULL AND \"AccountNumber\" <> ''");

            migrationBuilder.CreateIndex(
                name: "IX_Customers_NRIC_Unique",
                table: "Customers",
                column: "NRIC",
                unique: true,
                filter: "\"NRIC\" IS NOT NULL AND \"NRIC\" <> ''");

            migrationBuilder.CreateIndex(
                name: "IX_Customers_Passport_Unique",
                table: "Customers",
                column: "Passport",
                unique: true,
                filter: "\"Passport\" IS NOT NULL AND \"Passport\" <> ''");

            migrationBuilder.CreateIndex(
                name: "IX_Customers_PhoneNumber_Unique",
                table: "Customers",
                column: "PhoneNumber",
                unique: true,
                filter: "\"PhoneNumber\" IS NOT NULL AND \"PhoneNumber\" <> ''");

            migrationBuilder.CreateIndex(
                name: "IX_Cases_CreatedAt",
                table: "Cases",
                column: "CreatedAt",
                descending: new bool[0]);

            migrationBuilder.CreateIndex(
                name: "IX_Cases_DepartmentId_CreatedAt",
                table: "Cases",
                columns: new[] { "DepartmentId", "CreatedAt" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "IX_Cases_LinkedSourceCaseId",
                table: "Cases",
                column: "LinkedSourceCaseId");

            migrationBuilder.CreateIndex(
                name: "IX_Cases_ParentCaseId",
                table: "Cases",
                column: "ParentCaseId");

            migrationBuilder.CreateIndex(
                name: "IX_Cases_Severity",
                table: "Cases",
                column: "Severity");

            migrationBuilder.CreateIndex(
                name: "IX_Cases_Status_CreatedAt",
                table: "Cases",
                columns: new[] { "Status", "CreatedAt" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "IX_CaseEvents_CaseId_CreatedAt",
                table: "CaseEvents",
                columns: new[] { "CaseId", "CreatedAt" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "IX_CaseEvents_CreatedAt",
                table: "CaseEvents",
                column: "CreatedAt",
                descending: new bool[0]);

            migrationBuilder.CreateIndex(
                name: "IX_AgentSkills_UserId_SkillName",
                table: "AgentSkills",
                columns: new[] { "UserId", "SkillName" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AssignmentConfigurations_DepartmentId",
                table: "AssignmentConfigurations",
                column: "DepartmentId");

            migrationBuilder.CreateIndex(
                name: "IX_BusinessHours_DayOfWeek",
                table: "BusinessHours",
                column: "DayOfWeek",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CaseAttachments_CaseId",
                table: "CaseAttachments",
                column: "CaseId");

            migrationBuilder.CreateIndex(
                name: "IX_CaseAttachments_UploadedByUserId",
                table: "CaseAttachments",
                column: "UploadedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_CaseChildRelations_ChildId",
                table: "CaseChildRelations",
                column: "ChildId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CaseChildRelations_CreatedByUserId",
                table: "CaseChildRelations",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_CaseChildRelations_LinkedCaseId",
                table: "CaseChildRelations",
                column: "LinkedCaseId");

            migrationBuilder.CreateIndex(
                name: "IX_CaseChildRelations_ParentCaseId",
                table: "CaseChildRelations",
                column: "ParentCaseId");

            migrationBuilder.CreateIndex(
                name: "IX_CaseCollaborationActivities_ActorUserId",
                table: "CaseCollaborationActivities",
                column: "ActorUserId");

            migrationBuilder.CreateIndex(
                name: "IX_CaseCollaborationActivities_CaseId_CreatedAt",
                table: "CaseCollaborationActivities",
                columns: new[] { "CaseId", "CreatedAt" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "IX_CaseCollaborationActivities_TargetUserId",
                table: "CaseCollaborationActivities",
                column: "TargetUserId");

            migrationBuilder.CreateIndex(
                name: "IX_CaseTypeConfigs_Code",
                table: "CaseTypeConfigs",
                column: "Code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CustomerCustomAttributes_CustomerId",
                table: "CustomerCustomAttributes",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_DepartmentSubCategories_DepartmentId",
                table: "DepartmentSubCategories",
                column: "DepartmentId");

            migrationBuilder.CreateIndex(
                name: "IX_EscalationLevelConfigs_LevelNumber",
                table: "EscalationLevelConfigs",
                column: "LevelNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_EscalationLevelConfigs_TargetUserId",
                table: "EscalationLevelConfigs",
                column: "TargetUserId");

            migrationBuilder.CreateIndex(
                name: "IX_FieldConfigurations_ModuleKey_SectionKey_ApiField",
                table: "FieldConfigurations",
                columns: new[] { "ModuleKey", "SectionKey", "ApiField" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_LookupTypes_Code",
                table: "LookupTypes",
                column: "Code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_LookupValues_LookupTypeId_Value",
                table: "LookupValues",
                columns: new[] { "LookupTypeId", "Value" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_LookupValues_TypeCode",
                table: "LookupValues",
                column: "TypeCode");

            migrationBuilder.CreateIndex(
                name: "IX_Notifications_RecipientUserId_CreatedAt",
                table: "Notifications",
                columns: new[] { "RecipientUserId", "CreatedAt" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "IX_Notifications_Unread",
                table: "Notifications",
                column: "RecipientUserId",
                filter: "\"IsRead\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_PriorityCategoryMappings_CategoryName",
                table: "PriorityCategoryMappings",
                column: "CategoryName",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PriorityCategoryMappings_DepartmentSubCategoryId",
                table: "PriorityCategoryMappings",
                column: "DepartmentSubCategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_PriorityCategoryMappings_PrioritySlaRuleId",
                table: "PriorityCategoryMappings",
                column: "PrioritySlaRuleId");

            migrationBuilder.CreateIndex(
                name: "IX_PrioritySlaRules_Priority",
                table: "PrioritySlaRules",
                column: "Priority",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PublicHolidays_HolidayDate",
                table: "PublicHolidays",
                column: "HolidayDate",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RoutingRules_EvaluationOrder",
                table: "RoutingRules",
                column: "EvaluationOrder");

            migrationBuilder.CreateIndex(
                name: "IX_RoutingRules_TargetDepartmentId",
                table: "RoutingRules",
                column: "TargetDepartmentId");

            migrationBuilder.CreateIndex(
                name: "IX_SlaConfigurations_Severity",
                table: "SlaConfigurations",
                column: "Severity",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TeamAssignmentPointers_LastAssignedUserId",
                table: "TeamAssignmentPointers",
                column: "LastAssignedUserId");

            migrationBuilder.CreateIndex(
                name: "IX_TeamMembers_DepartmentId_UserId",
                table: "TeamMembers",
                columns: new[] { "DepartmentId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TeamMembers_UserId",
                table: "TeamMembers",
                column: "UserId");

            migrationBuilder.AddForeignKey(
                name: "FK_CaseEvents_Cases_CaseId",
                table: "CaseEvents",
                column: "CaseId",
                principalTable: "Cases",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_Cases_Cases_LinkedSourceCaseId",
                table: "Cases",
                column: "LinkedSourceCaseId",
                principalTable: "Cases",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Cases_Cases_ParentCaseId",
                table: "Cases",
                column: "ParentCaseId",
                principalTable: "Cases",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CaseEvents_Cases_CaseId",
                table: "CaseEvents");

            migrationBuilder.DropForeignKey(
                name: "FK_Cases_Cases_LinkedSourceCaseId",
                table: "Cases");

            migrationBuilder.DropForeignKey(
                name: "FK_Cases_Cases_ParentCaseId",
                table: "Cases");

            migrationBuilder.DropTable(
                name: "AgentSkills");

            migrationBuilder.DropTable(
                name: "AssignmentConfigurations");

            migrationBuilder.DropTable(
                name: "BusinessHours");

            migrationBuilder.DropTable(
                name: "CaseAttachments");

            migrationBuilder.DropTable(
                name: "CaseChildRelations");

            migrationBuilder.DropTable(
                name: "CaseCollaborationActivities");

            migrationBuilder.DropTable(
                name: "CaseTypeConfigs");

            migrationBuilder.DropTable(
                name: "CustomerCustomAttributes");

            migrationBuilder.DropTable(
                name: "EscalationLevelConfigs");

            migrationBuilder.DropTable(
                name: "FieldConfigurations");

            migrationBuilder.DropTable(
                name: "LookupValues");

            migrationBuilder.DropTable(
                name: "Notifications");

            migrationBuilder.DropTable(
                name: "PriorityCategoryMappings");

            migrationBuilder.DropTable(
                name: "PublicHolidays");

            migrationBuilder.DropTable(
                name: "RoutingRules");

            migrationBuilder.DropTable(
                name: "SlaConfigurations");

            migrationBuilder.DropTable(
                name: "TeamAssignmentPointers");

            migrationBuilder.DropTable(
                name: "TeamMembers");

            migrationBuilder.DropTable(
                name: "LookupTypes");

            migrationBuilder.DropTable(
                name: "DepartmentSubCategories");

            migrationBuilder.DropTable(
                name: "PrioritySlaRules");

            migrationBuilder.DropIndex(
                name: "IX_Customers_AccountNumber_Unique",
                table: "Customers");

            migrationBuilder.DropIndex(
                name: "IX_Customers_NRIC_Unique",
                table: "Customers");

            migrationBuilder.DropIndex(
                name: "IX_Customers_Passport_Unique",
                table: "Customers");

            migrationBuilder.DropIndex(
                name: "IX_Customers_PhoneNumber_Unique",
                table: "Customers");

            migrationBuilder.DropIndex(
                name: "IX_Cases_CreatedAt",
                table: "Cases");

            migrationBuilder.DropIndex(
                name: "IX_Cases_DepartmentId_CreatedAt",
                table: "Cases");

            migrationBuilder.DropIndex(
                name: "IX_Cases_LinkedSourceCaseId",
                table: "Cases");

            migrationBuilder.DropIndex(
                name: "IX_Cases_ParentCaseId",
                table: "Cases");

            migrationBuilder.DropIndex(
                name: "IX_Cases_Severity",
                table: "Cases");

            migrationBuilder.DropIndex(
                name: "IX_Cases_Status_CreatedAt",
                table: "Cases");

            migrationBuilder.DropIndex(
                name: "IX_CaseEvents_CaseId_CreatedAt",
                table: "CaseEvents");

            migrationBuilder.DropIndex(
                name: "IX_CaseEvents_CreatedAt",
                table: "CaseEvents");

            migrationBuilder.DropColumn(
                name: "Queue",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "Team",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "Channels",
                table: "Departments");

            migrationBuilder.DropColumn(
                name: "Function",
                table: "Departments");

            migrationBuilder.DropColumn(
                name: "IsActive",
                table: "Departments");

            migrationBuilder.DropColumn(
                name: "AccountNumber",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "DateOfBirth",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "IdType",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "Passport",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "PreferredLanguage",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "CaseType",
                table: "Cases");

            migrationBuilder.DropColumn(
                name: "CommunicationChannel",
                table: "Cases");

            migrationBuilder.DropColumn(
                name: "EscalationLevel",
                table: "Cases");

            migrationBuilder.DropColumn(
                name: "ExternalResolutionDueAt",
                table: "Cases");

            migrationBuilder.DropColumn(
                name: "ExternalResolutionTargetMinutes",
                table: "Cases");

            migrationBuilder.DropColumn(
                name: "FirstResponseActualAt",
                table: "Cases");

            migrationBuilder.DropColumn(
                name: "FirstResponseDueAt",
                table: "Cases");

            migrationBuilder.DropColumn(
                name: "FirstResponseStatus",
                table: "Cases");

            migrationBuilder.DropColumn(
                name: "FirstResponseTargetMinutes",
                table: "Cases");

            migrationBuilder.DropColumn(
                name: "InternalResolutionDueAt",
                table: "Cases");

            migrationBuilder.DropColumn(
                name: "InternalResolutionTargetMinutes",
                table: "Cases");

            migrationBuilder.DropColumn(
                name: "LinkedSourceCaseId",
                table: "Cases");

            migrationBuilder.DropColumn(
                name: "ParentCaseId",
                table: "Cases");

            migrationBuilder.DropColumn(
                name: "PreferredCommunicationChannel",
                table: "Cases");

            migrationBuilder.DropColumn(
                name: "Sla12hBreachedEscalated",
                table: "Cases");

            migrationBuilder.DropColumn(
                name: "Sla70ReminderSent",
                table: "Cases");

            migrationBuilder.DropColumn(
                name: "Sla90Escalated",
                table: "Cases");

            migrationBuilder.DropColumn(
                name: "SlaBreachedAt",
                table: "Cases");

            migrationBuilder.DropColumn(
                name: "SlaBreachedEscalated",
                table: "Cases");

            migrationBuilder.DropColumn(
                name: "SlaConfigVersion",
                table: "Cases");

            migrationBuilder.DropColumn(
                name: "SlaPausedAt",
                table: "Cases");

            migrationBuilder.DropColumn(
                name: "SlaTotalPausedMinutes",
                table: "Cases");

            migrationBuilder.DropColumn(
                name: "SourceChannel",
                table: "Cases");

            migrationBuilder.DropColumn(
                name: "SubcaseType",
                table: "Cases");

            migrationBuilder.DropColumn(
                name: "Subcategory",
                table: "Cases");

            migrationBuilder.DropColumn(
                name: "ActionType",
                table: "CaseEvents");

            migrationBuilder.DropColumn(
                name: "Channel",
                table: "CaseEvents");

            migrationBuilder.DropColumn(
                name: "EntityName",
                table: "CaseEvents");

            migrationBuilder.DropColumn(
                name: "IsInternal",
                table: "CaseEvents");

            migrationBuilder.DropColumn(
                name: "Module",
                table: "CaseEvents");

            migrationBuilder.DropColumn(
                name: "NewValue",
                table: "CaseEvents");

            migrationBuilder.DropColumn(
                name: "OldValue",
                table: "CaseEvents");

            migrationBuilder.AlterColumn<string>(
                name: "NRIC",
                table: "Customers",
                type: "text",
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);

            migrationBuilder.AddColumn<int>(
                name: "TenureMonths",
                table: "Customers",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AlterColumn<Guid>(
                name: "CaseId",
                table: "CaseEvents",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Customers_NRIC",
                table: "Customers",
                column: "NRIC",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Cases_DepartmentId",
                table: "Cases",
                column: "DepartmentId");

            migrationBuilder.CreateIndex(
                name: "IX_CaseEvents_CaseId",
                table: "CaseEvents",
                column: "CaseId");

            migrationBuilder.AddForeignKey(
                name: "FK_CaseEvents_Cases_CaseId",
                table: "CaseEvents",
                column: "CaseId",
                principalTable: "Cases",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
