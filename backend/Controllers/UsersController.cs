namespace CaseManagement.Api.Controllers;

using CaseManagement.Api.Models;
using CaseManagement.Api.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

[ApiController]
[Route("api/[controller]")]
public class UsersController : BaseApiController
{
    private readonly AppDbContext _context;
    private readonly CaseManagement.Api.Repositories.IUserRepository _userRepository;

    public UsersController(AppDbContext context, CaseManagement.Api.Repositories.IUserRepository userRepository)
    {
        _context = context;
        _userRepository = userRepository;
    }

    [HttpGet]
    public async Task<IActionResult> GetUsers(CancellationToken ct)
    {
        var users = await _userRepository.GetUsersAsync(ct);
        return Ok(users);
    }

    [HttpPost]
    public async Task<IActionResult> CreateUser([FromBody] CaseManagement.Api.DTOs.CreateUserDto dto)
    {
        if (await _userRepository.ExistsByEmailAsync(dto.Email))
            throw new InvalidOperationException($"A user with the email '{dto.Email}' already exists.");

        var user = new User
        {
            Id = Guid.NewGuid(),
            Name = dto.Name,
            Email = dto.Email,
            Role = dto.Role,
            DepartmentId = dto.DepartmentId
        };
        _context.Users.Add(user);
        await _context.SaveChangesAsync();
        
        // Load the Department so it is returned in the response
        await _context.Entry(user).Reference(u => u.Department).LoadAsync();
        
        return CreatedAtAction(nameof(GetUsers), new { id = user.Id }, user);
    }

    [HttpPut("me/status")]
    public async Task<IActionResult> UpdateStatus([FromBody] CaseManagement.Api.DTOs.UpdateUserStatusDto dto)
    {
        var user = await _context.Users.FindAsync(CurrentUserId);
        if (user == null) return NotFound("User not found.");

        if (!Enum.TryParse<UserStatus>(dto.Status, true, out var newStatus))
        {
            return BadRequest($"Invalid status '{dto.Status}'. Allowed values: Available, Busy, Away.");
        }

        user.Status = newStatus;
        await _context.SaveChangesAsync();
        
        return Ok(new { message = "Status updated successfully.", status = newStatus.ToString() });
    }
}
