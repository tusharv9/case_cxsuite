namespace CaseManagement.Api.Validators;

using CaseManagement.Api.DTOs;
using FluentValidation;

public class CreateCustomerDtoValidator : AbstractValidator<CreateCustomerDto>
{
    public CreateCustomerDtoValidator()
    {
        RuleFor(x => x.FullName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.NRIC).NotEmpty().Matches(@"^\d{6}-\d{2}-\d{4}$").WithMessage("NRIC must be in format XXXXXX-XX-XXXX");
        RuleFor(x => x.PhoneNumber).NotEmpty().MaximumLength(20);
        RuleFor(x => x.Email).EmailAddress().When(x => !string.IsNullOrEmpty(x.Email));
        RuleFor(x => x.DateOfBirth).LessThan(DateTime.UtcNow).WithMessage("Date of Birth must be in the past").When(x => x.DateOfBirth.HasValue);
    }
}

public class CreateCaseDtoValidator : AbstractValidator<CreateCaseDto>
{
    public CreateCaseDtoValidator()
    {
        RuleFor(x => x.Title).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Description).NotEmpty().MaximumLength(2000);
        RuleFor(x => x.CustomerId).NotEmpty();
        RuleFor(x => x.DepartmentId).NotEmpty();
        RuleFor(x => x.Severity).NotEmpty().MaximumLength(50);
    }
}

public class AddNoteDtoValidator : AbstractValidator<AddNoteDto>
{
    public AddNoteDtoValidator()
    {
        RuleFor(x => x.Message).NotEmpty().MaximumLength(1000);
    }
}
