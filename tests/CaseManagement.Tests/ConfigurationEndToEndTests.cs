using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using CaseManagement.Api.Data;
using CaseManagement.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CaseManagement.Tests;

/// <summary>
/// The configuration really drives behaviour: a real application, a real migrated PostgreSQL database and real
/// signed tokens. Each test sets up configuration, then proves what the API does because of it.
/// </summary>
public class ConfigurationEndToEndTests
{
    private sealed class Env : IAsyncDisposable
    {
        public TempDatabase Db = null!;
        public AppUnderTest App = null!;
        public HttpClient Client = null!;
        public Guid Dept, FraudSub, PaymentSub, Customer;
        public string Admin = AppUnderTest.Token("adm-1", "Admin User", new[] { "Admin" });
        public string Agent = AppUnderTest.Token("agt-1", "Agent User", new[] { "Agent" });

        /// <summary>Creates the world, lets <paramref name="configure"/> change configuration, THEN starts the app.</summary>
        public static async Task<Env> StartAsync(Func<AppDbContext, Task>? configure = null)
        {
            var e = new Env { Db = await TempDatabase.CreateAsync() };

            // Migrate + bootstrap-seed once, so configuration rows exist to be customised before the app serves anything.
            using (var warm = new AppUnderTest(e.Db.ConnectionString))
            {
                await warm.ReadyClientAsync();
            }

            await using (var ctx = e.Db.NewContext())
            {
                e.Dept = Guid.NewGuid(); e.FraudSub = Guid.NewGuid(); e.PaymentSub = Guid.NewGuid(); e.Customer = Guid.NewGuid();
                ctx.Departments.Add(new Department { Id = e.Dept, Name = "Contact Center", Code = "CC", CreatedAt = DateTime.UtcNow });
                await ctx.SaveChangesAsync();
                ctx.AddRange(
                    new DepartmentSubCategory { Id = e.FraudSub, DepartmentId = e.Dept, Name = "Fraud", Code = "F", IsActive = true, CreatedAt = DateTime.UtcNow },
                    new DepartmentSubCategory { Id = e.PaymentSub, DepartmentId = e.Dept, Name = "Payment Issue", Code = "P", IsActive = true, CreatedAt = DateTime.UtcNow },
                    new Customer { Id = e.Customer, FullName = "Ahmad Razak", IdType = "Passport Number", Passport = "A98765432", PhoneNumber = "+60 12-345 6789", Email = "ahmad@example.test", PreferredLanguage = "English", Branch = "KL HQ", CreatedAt = DateTime.UtcNow });
                await ctx.SaveChangesAsync();

                var critical = await ctx.PrioritySlaRules.FirstAsync(r => r.Priority == "Critical");
                ctx.PriorityCategoryMappings.Add(new PriorityCategoryMapping { Id = Guid.NewGuid(), PrioritySlaRuleId = critical.Id, DepartmentSubCategoryId = e.FraudSub, CreatedAt = DateTime.UtcNow });
                await ctx.SaveChangesAsync();

                if (configure != null) await configure(ctx);
            }

            e.App = new AppUnderTest(e.Db.ConnectionString);
            e.Client = await e.App.ReadyClientAsync();
            return e;
        }

        public HttpRequestMessage Req(HttpMethod method, string url, string token, object? body = null)
        {
            var request = new HttpRequestMessage(method, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            if (body != null) request.Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
            return request;
        }

        public async Task<(HttpStatusCode Status, JsonElement Body)> Send(HttpMethod method, string url, string token, object? body = null)
        {
            var response = await Client.SendAsync(Req(method, url, token, body));
            var text = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(text) ? "{}" : text);
            return (response.StatusCode, doc.RootElement.Clone());
        }

        public object CaseBody(Action<Dictionary<string, object?>>? tweak = null)
        {
            var body = new Dictionary<string, object?>
            {
                ["title"] = "Card used abroad", ["description"] = "Customer did not travel.",
                ["customerId"] = Customer, ["departmentId"] = Dept, ["subcategory"] = "fraud",
                ["caseType"] = "complaint", ["preferredLanguage"] = "english",
                ["sourceChannel"] = "voice", ["preferredCommunicationChannel"] = "phone",
                ["severity"] = "Low"
            };
            tweak?.Invoke(body);
            return body;
        }

        public async ValueTask DisposeAsync()
        {
            Client.Dispose();
            await App.DisposeAsync();
            await Db.DisposeAsync();
        }
    }

    private static string[] ErrorFields(JsonElement body) =>
        body.TryGetProperty("errors", out var errors) ? errors.EnumerateObject().Select(p => p.Name).OrderBy(x => x).ToArray() : Array.Empty<string>();

    // ----------------------------------------------------------------------------------------------- cases

    [PostgresFact]
    public async Task ACase_UsesTheSubCategorysConfiguredPriority_ConfiguredSpellings_AndStoresCustomFields()
    {
        await using var env = await Env.StartAsync(async ctx =>
        {
            ctx.FieldConfigurations.Add(new FieldConfiguration
            {
                Id = Guid.NewGuid(), ModuleKey = "CaseManagement", SectionKey = "CreateCase", ApiField = "policyNumber", DisplayLabel = "Policy Number",
                FieldType = "Text", IsVisible = true, IsRequired = true, IsCustomField = true, DisplayOrder = 50,
                ValidationRegex = "^POL-\\d{6}$", ValidationMessage = "Use the format POL-123456.", CreatedAt = DateTime.UtcNow
            });
            await ctx.SaveChangesAsync();
        });

        var (status, body) = await env.Send(HttpMethod.Post, "/api/cases", env.Admin,
            env.CaseBody(b => b["customAttributes"] = new Dictionary<string, string> { ["policyNumber"] = "POL-123456" }));
        Assert.Equal(HttpStatusCode.Created, status);

        // Priority came from the mapping ("Low" was requested, "Critical" is configured for Fraud); values use the configured spelling.
        Assert.Equal("Critical", body.GetProperty("severity").GetString());
        Assert.Equal("Fraud", body.GetProperty("subcategory").GetString());
        Assert.Equal("Complaint", body.GetProperty("caseType").GetString());
        Assert.StartsWith("C-", body.GetProperty("caseNumber").GetString());
        Assert.Equal("Voice", body.GetProperty("sourceChannel").GetString());
        Assert.Equal("Phone", body.GetProperty("preferredCommunicationChannel").GetString());
        Assert.Equal(240, body.GetProperty("externalResolutionTargetMinutes").GetInt32());   // Critical's rule, snapshotted

        Assert.Equal("POL-123456", await env.Db.ScalarAsync<string>("SELECT \"FieldValue\" FROM \"CaseCustomAttributes\" WHERE \"FieldKey\" = 'policyNumber'"));

        // The custom value comes back on the case detail.
        var id = body.GetProperty("id").GetGuid();
        var (_, detail) = await env.Send(HttpMethod.Get, $"/api/cases/{id}", env.Admin);
        Assert.Contains(detail.GetProperty("customAttributes").EnumerateArray(), a => a.GetProperty("fieldKey").GetString() == "policyNumber" && a.GetProperty("fieldValue").GetString() == "POL-123456");
    }

    [PostgresFact]
    public async Task EveryProblemIsReportedAtOnce_PerField_WithTheAdministratorsMessages()
    {
        await using var env = await Env.StartAsync(async ctx =>
        {
            ctx.FieldConfigurations.Add(new FieldConfiguration
            {
                Id = Guid.NewGuid(), ModuleKey = "CaseManagement", SectionKey = "CreateCase", ApiField = "policyNumber", DisplayLabel = "Policy Number",
                FieldType = "Text", IsVisible = true, IsRequired = true, IsCustomField = true,
                ValidationRegex = "^POL-\\d{6}$", ValidationMessage = "Use the format POL-123456.", CreatedAt = DateTime.UtcNow
            });
            await ctx.SaveChangesAsync();
        });

        var (status, body) = await env.Send(HttpMethod.Post, "/api/cases", env.Admin, env.CaseBody(b =>
        {
            b["title"] = "";                                             // required (system)
            b["sourceChannel"] = "Carrier Pigeon";                       // not in the configured list
            b["preferredLanguage"] = "Klingon";                          // not in the configured list
            b["customAttributes"] = new Dictionary<string, string> { ["policyNumber"] = "wrong", ["nope"] = "x" };
        }));

        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.Equal(new[] { "nope", "policyNumber", "preferredLanguage", "sourceChannel", "title" }, ErrorFields(body));
        Assert.Equal("Use the format POL-123456.", body.GetProperty("errors").GetProperty("policyNumber")[0].GetString());
    }

    [PostgresFact]
    public async Task AnOptionalField_LeftBlank_IsAccepted_WhenTheAdministratorMadeItOptional()
    {
        await using var env = await Env.StartAsync(async ctx =>
        {
            await ctx.Database.ExecuteSqlRawAsync(
                "UPDATE \"FieldConfigurations\" SET \"IsRequired\" = FALSE WHERE \"ModuleKey\" = 'CaseManagement' AND \"SectionKey\" = 'CreateCase' " +
                "AND \"ApiField\" IN ('description', 'preferredLanguage', 'preferredCommunicationChannel', 'sourceChannel')");
        });

        var (status, body) = await env.Send(HttpMethod.Post, "/api/cases", env.Admin, env.CaseBody(b =>
        {
            b["description"] = ""; b["preferredLanguage"] = null; b["preferredCommunicationChannel"] = null; b["sourceChannel"] = null;
        }));

        Assert.Equal(HttpStatusCode.Created, status);
        Assert.Equal("", body.GetProperty("sourceChannel").GetString());   // no invented "Voice" default
        Assert.Equal("", body.GetProperty("preferredCommunicationChannel").GetString());   // no invented "Phone" default
    }

    [PostgresFact]
    public async Task ARequiredField_IsEnforcedByTheBackend_NotJustTheForm()
    {
        await using var env = await Env.StartAsync();   // seeded defaults: description and sourceChannel are required

        var (status, body) = await env.Send(HttpMethod.Post, "/api/cases", env.Admin, env.CaseBody(b => { b["description"] = ""; b["sourceChannel"] = null; }));

        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.Equal(new[] { "description", "sourceChannel" }, ErrorFields(body));
    }

    [PostgresFact]
    public async Task APriority_IsRequiredOnlyWhenTheSubCategoryHasNone_AndANewPriorityWorksImmediately()
    {
        await using var env = await Env.StartAsync();

        // Unmapped sub-category and nothing chosen: an explicit error, never a silent "Medium".
        var (s1, b1) = await env.Send(HttpMethod.Post, "/api/cases", env.Admin, env.CaseBody(b => { b["subcategory"] = "Payment Issue"; b["severity"] = ""; }));
        Assert.Equal(HttpStatusCode.BadRequest, s1);
        Assert.Contains("priority is required", b1.GetProperty("error").GetString());

        // An unknown name is rejected and the configured ones are listed.
        var (s2, b2) = await env.Send(HttpMethod.Post, "/api/cases", env.Admin, env.CaseBody(b => { b["subcategory"] = "Payment Issue"; b["severity"] = "Urgent"; }));
        Assert.Equal(HttpStatusCode.BadRequest, s2);
        Assert.Contains("not a configured priority", b2.GetProperty("error").GetString());

        // The administrator adds "Urgent" on the Settings screen — no code, no restart…
        var (s3, _) = await env.Send(HttpMethod.Post, "/api/configurablesettings/severities", env.Admin,
            new { name = "Urgent", internalHours = 1, externalHours = 2, firstResponseMinutes = 15 });
        Assert.Equal(HttpStatusCode.OK, s3);

        // …and it is immediately usable, with its own SLA numbers.
        var (s4, b4) = await env.Send(HttpMethod.Post, "/api/cases", env.Admin, env.CaseBody(b => { b["subcategory"] = "Payment Issue"; b["severity"] = "urgent"; }));
        Assert.Equal(HttpStatusCode.Created, s4);
        Assert.Equal("Urgent", b4.GetProperty("severity").GetString());
        Assert.Equal(120, b4.GetProperty("externalResolutionTargetMinutes").GetInt32());
        Assert.Equal(15, b4.GetProperty("firstResponseTargetMinutes").GetInt32());

        // The dashboard lists every configured priority, including the new one, in the configured order.
        var (_, dashboard) = await env.Send(HttpMethod.Get, "/api/dashboard/summary", env.Admin);
        var priorities = dashboard.GetProperty("casesBySeverity").EnumerateArray().Select(p => (p.GetProperty("severity").GetString(), p.GetProperty("count").GetInt32())).ToList();
        Assert.Equal(new[] { "Critical", "High", "Medium", "Low", "Urgent" }, priorities.Select(p => p.Item1));
        Assert.Equal(1, priorities.Single(p => p.Item1 == "Urgent").Item2);
    }

    [PostgresFact]
    public async Task TheCreateCaseForm_CanPreviewAPriority_WithoutDownloadingTheWholeSlaConfiguration()
    {
        await using var env = await Env.StartAsync();

        var (_, mapped) = await env.Send(HttpMethod.Get, $"/api/sla-routing/resolve-priority?departmentId={env.Dept}&subcategory=Fraud", env.Agent);
        Assert.True(mapped.GetProperty("isMapped").GetBoolean());
        Assert.Equal("Critical", mapped.GetProperty("priority").GetString());
        Assert.Equal(4, mapped.GetProperty("externalHours").GetInt32());

        var (_, unmapped) = await env.Send(HttpMethod.Get, $"/api/sla-routing/resolve-priority?departmentId={env.Dept}&subcategory=Payment%20Issue", env.Agent);
        Assert.False(unmapped.GetProperty("isMapped").GetBoolean());
    }

    [PostgresFact]
    public async Task EachFormGetsEverythingItNeedsInOneCall_AndConfigurationChangesShowUpImmediately()
    {
        await using var env = await Env.StartAsync();

        var (status, caseForm) = await env.Send(HttpMethod.Get, "/api/metadata/case-form", env.Agent);
        Assert.Equal(HttpStatusCode.OK, status);

        // Fields (with the lock flags), case types, departments WITH their sub-categories, priorities, and the options of
        // exactly the lists the form's dropdown fields use.
        var fields = caseForm.GetProperty("fields").EnumerateArray().ToDictionary(f => f.GetProperty("apiField").GetString()!);
        Assert.True(fields["title"].GetProperty("isSystemRequired").GetBoolean());
        Assert.False(fields["description"].GetProperty("isSystemRequired").GetBoolean());
        Assert.Equal(new[] { "Complaint", "Inquiry", "Service" }, caseForm.GetProperty("caseTypes").EnumerateArray().Select(c => c.GetProperty("name").GetString()).OrderBy(x => x));
        var department = caseForm.GetProperty("departments").EnumerateArray().Single(d => d.GetProperty("name").GetString() == "Contact Center");
        Assert.Equal(new[] { "Fraud", "Payment Issue" }, department.GetProperty("subCategories").EnumerateArray().Select(s => s.GetProperty("name").GetString()).OrderBy(x => x));
        Assert.Equal(new[] { "Critical", "High", "Medium", "Low" }, caseForm.GetProperty("priorities").EnumerateArray().Select(p => p.GetProperty("name").GetString()));
        var lookups = caseForm.GetProperty("lookups");
        Assert.Contains(lookups.GetProperty("SOURCE_CHANNEL").EnumerateArray(), o => o.GetProperty("value").GetString() == "Voice");
        Assert.Contains(lookups.GetProperty("COMMUNICATION_CHANNEL").EnumerateArray(), o => o.GetProperty("value").GetString() == "Phone");
        Assert.Contains(lookups.GetProperty("PREFERRED_LANGUAGE").EnumerateArray(), o => o.GetProperty("value").GetString() == "English");

        // A configuration change is visible on the very next read (no stale cache).
        await env.Send(HttpMethod.Post, "/api/configurablesettings/severities", env.Admin, new { name = "Urgent", internalHours = 1, externalHours = 2, firstResponseMinutes = 15 });
        var (_, after) = await env.Send(HttpMethod.Get, "/api/metadata/case-form", env.Agent);
        Assert.Contains(after.GetProperty("priorities").EnumerateArray(), p => p.GetProperty("name").GetString() == "Urgent");

        var (_, customerForm) = await env.Send(HttpMethod.Get, "/api/metadata/customer-form", env.Agent);
        Assert.Contains(customerForm.GetProperty("lookups").GetProperty("ID_TYPE").EnumerateArray(), o => o.GetProperty("value").GetString() == "NRIC Number");
        Assert.True(customerForm.GetProperty("fields").EnumerateArray().Single(f => f.GetProperty("apiField").GetString() == "idValue").GetProperty("isSystemRequired").GetBoolean());
    }

    // ------------------------------------------------------------------------------------------ customers

    private static object CustomerBody(Action<Dictionary<string, object?>>? tweak = null)
    {
        var body = new Dictionary<string, object?>
        {
            ["fullName"] = "Siti Nur", ["idType"] = "nric number", ["idValue"] = "900101-14-1234", ["dateOfBirth"] = "1990-01-01T00:00:00Z",
            ["phoneNumber"] = "+60 123-456 7890", ["email"] = "siti@example.test", ["preferredLanguage"] = "english", ["branch"] = "kl hq"
        };
        tweak?.Invoke(body);
        return body;
    }

    [PostgresFact]
    public async Task ACustomer_IsValidatedAgainstTheAddCustomerConfiguration()
    {
        await using var env = await Env.StartAsync();

        var (ok, created) = await env.Send(HttpMethod.Post, "/api/customers", env.Admin, CustomerBody());
        Assert.True(ok == HttpStatusCode.Created, created.GetRawText());
        Assert.Equal("NRIC Number", created.GetProperty("idType").GetString());          // configured spelling
        Assert.Equal("English", created.GetProperty("preferredLanguage").GetString());
        Assert.Equal("KL HQ", created.GetProperty("branch").GetString());

        // The Malaysian phone rule is now metadata with the administrator-editable message.
        var (bad, badBody) = await env.Send(HttpMethod.Post, "/api/customers", env.Admin,
            CustomerBody(b => { b["idValue"] = "900202-14-1234"; b["dateOfBirth"] = "1990-02-02T00:00:00Z"; b["phoneNumber"] = "12-345 6789"; b["email"] = "other@example.test"; }));
        Assert.Equal(HttpStatusCode.BadRequest, bad);
        Assert.Equal(new[] { "phoneNumber" }, ErrorFields(badBody));
        Assert.Contains("10 digits", badBody.GetProperty("errors").GetProperty("phoneNumber")[0].GetString());
    }

    [PostgresFact]
    public async Task CustomerFieldsTheAdministratorMadeOptional_CanBeOmitted_ButSystemOnesCannot()
    {
        await using var env = await Env.StartAsync(async ctx =>
        {
            await ctx.Database.ExecuteSqlRawAsync(
                "UPDATE \"FieldConfigurations\" SET \"IsRequired\" = FALSE WHERE \"ModuleKey\" = 'Customer360' AND \"SectionKey\" = 'AddNewCustomer' " +
                "AND \"ApiField\" IN ('email', 'branch', 'preferredLanguage', 'phoneNumber', 'dateOfBirth')");
        });

        var (ok, body) = await env.Send(HttpMethod.Post, "/api/customers", env.Admin, CustomerBody(b =>
        {
            b["email"] = ""; b["branch"] = ""; b["preferredLanguage"] = ""; b["phoneNumber"] = ""; b["dateOfBirth"] = null;
        }));
        Assert.Equal(HttpStatusCode.Created, ok);
        Assert.Equal("", body.GetProperty("branch").GetString());

        // Name and ID are system-required whatever the configuration says.
        var (bad, badBody) = await env.Send(HttpMethod.Post, "/api/customers", env.Admin, CustomerBody(b => { b["fullName"] = ""; b["idValue"] = ""; }));
        Assert.Equal(HttpStatusCode.BadRequest, bad);
        Assert.Contains("fullName", ErrorFields(badBody));
    }

    // ----------------------------------------------------------------------------------------------- masking

    [PostgresFact]
    public async Task SensitiveFields_AreMaskedInTheApiResponse_UnlessTheCallerMayUnmask()
    {
        await using var env = await Env.StartAsync(async ctx =>
        {
            await ctx.Database.ExecuteSqlRawAsync(
                "UPDATE \"FieldConfigurations\" SET \"IsSensitive\" = TRUE, \"MaskingRule\" = 'HideFirstShowLast', \"VisibleChars\" = 4 " +
                "WHERE \"ModuleKey\" = 'Customer360' AND \"ApiField\" IN ('idValue', 'phoneNumber')");
        });

        var url = $"/api/customers/{env.Customer}/360";

        var (_, asAgent) = await env.Send(HttpMethod.Get, url, env.Agent);
        Assert.EndsWith("5432", asAgent.GetProperty("passport").GetString());
        Assert.DoesNotContain("A9876", asAgent.GetProperty("passport").GetString());            // the old leak
        Assert.DoesNotContain("A9876", asAgent.GetProperty("idValue").GetString());
        Assert.EndsWith("6789", asAgent.GetProperty("phoneNumber").GetString());
        Assert.DoesNotContain("12-345", asAgent.GetProperty("phoneNumber").GetString());

        var (_, asAdmin) = await env.Send(HttpMethod.Get, url, env.Admin);                      // Admin holds pii.unmask
        Assert.Equal("A98765432", asAdmin.GetProperty("passport").GetString());

        // The paged list never hands out raw values either, and there is no "return everything" back door.
        var (_, page) = await env.Send(HttpMethod.Get, "/api/customers?pageSize=5000", env.Agent);
        Assert.True(page.TryGetProperty("items", out var items));
        Assert.DoesNotContain("A98765432", items.GetRawText());

        // Creating a customer answers with the same masked view.
        var (_, created) = await env.Send(HttpMethod.Post, "/api/customers", env.Agent, CustomerBody(b => { b["idValue"] = "900303-14-1234"; b["dateOfBirth"] = "1990-03-03T00:00:00Z"; b["phoneNumber"] = "+60 198-765 4321"; b["email"] = "c@example.test"; }));
        Assert.DoesNotContain("900303", created.GetProperty("nric").GetString());
        Assert.EndsWith("4321", created.GetProperty("phoneNumber").GetString());
        Assert.DoesNotContain("198-765", created.GetProperty("phoneNumber").GetString());
    }
}
