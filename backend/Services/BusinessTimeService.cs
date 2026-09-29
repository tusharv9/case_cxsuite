namespace CaseManagement.Api.Services;

using CaseManagement.Api.Data;
using CaseManagement.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

public class BusinessTimeService : IBusinessTimeService
{
    private readonly AppDbContext _context;
    private readonly ILogger<BusinessTimeService> _logger;
    private static readonly TimeZoneInfo BusinessTimeZone = ResolveTimeZone();

    public BusinessTimeService(AppDbContext context, ILogger<BusinessTimeService> logger)
    {
        _context = context;
        _logger = logger;
    }

    private static TimeZoneInfo ResolveTimeZone()
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById("Asia/Kuala_Lumpur");
        }
        catch
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById("Singapore Standard Time");
            }
            catch
            {
                return TimeZoneInfo.CreateCustomTimeZone("MYT", TimeSpan.FromHours(8), "Malaysia Standard Time", "Malaysia Standard Time");
            }
        }
    }

    private async Task<(Dictionary<DayOfWeek, BusinessHour> schedule, HashSet<DateTime> holidays)> LoadCalendarDataAsync(CancellationToken ct)
    {
        var dbHours = await _context.BusinessHours.AsNoTracking().ToListAsync(ct);
        var dbHolidays = await _context.PublicHolidays
            .AsNoTracking()
            .Where(h => h.IsActive)
            .Select(h => h.HolidayDate.Date)
            .ToListAsync(ct);

        var schedule = new Dictionary<DayOfWeek, BusinessHour>();

        if (dbHours.Count == 7)
        {
            foreach (var h in dbHours)
            {
                schedule[h.DayOfWeek] = h;
            }
        }
        else
        {
            // Fallback default: Mon-Fri 09:00-17:00, Sat-Sun disabled
            var days = Enum.GetValues<DayOfWeek>();
            foreach (var d in days)
            {
                bool isWorkDay = d != DayOfWeek.Saturday && d != DayOfWeek.Sunday;
                schedule[d] = new BusinessHour
                {
                    DayOfWeek = d,
                    DayName = d.ToString(),
                    IsEnabled = isWorkDay,
                    StartTime = new TimeSpan(9, 0, 0),
                    EndTime = new TimeSpan(17, 0, 0)
                };
            }
        }

        var holidays = new HashSet<DateTime>(dbHolidays);
        return (schedule, holidays);
    }

    public async Task<DateTime> AddBusinessMinutesAsync(DateTime startUtc, int targetMinutes, CancellationToken ct = default)
    {
        if (targetMinutes <= 0) return startUtc;

        var (schedule, holidays) = await LoadCalendarDataAsync(ct);

        // Convert start time to local operational time
        DateTime current = TimeZoneInfo.ConvertTimeFromUtc(startUtc, BusinessTimeZone);
        int remaining = targetMinutes;
        int safetyLoopLimit = 365; // Max 1 year projection
        int loopCount = 0;

        // Step 1: Forward-align start point to a valid business window
        while (loopCount++ < safetyLoopLimit)
        {
            var dayOfWeek = current.DayOfWeek;
            var dayDate = current.Date;
            bool isHoliday = holidays.Contains(dayDate);
            bool isDayEnabled = schedule.TryGetValue(dayOfWeek, out var bh) && bh.IsEnabled;

            if (!isDayEnabled || isHoliday || bh == null)
            {
                // Move to start of next calendar day at midnight, then loop checks again
                current = current.Date.AddDays(1);
                continue;
            }

            // Day is a working day
            if (current.TimeOfDay < bh.StartTime)
            {
                // Created before business hours -> snap to opening time
                current = current.Date + bh.StartTime;
                break;
            }
            else if (current.TimeOfDay >= bh.EndTime)
            {
                // Created after business hours -> advance to next day
                current = current.Date.AddDays(1);
                continue;
            }
            else
            {
                // Inside working hours
                break;
            }
        }

        // Step 2: Consume business minutes
        loopCount = 0;
        while (remaining > 0 && loopCount++ < safetyLoopLimit)
        {
            var dayOfWeek = current.DayOfWeek;
            var dayDate = current.Date;
            bool isHoliday = holidays.Contains(dayDate);
            bool isDayEnabled = schedule.TryGetValue(dayOfWeek, out var bh) && bh.IsEnabled;

            if (!isDayEnabled || isHoliday || bh == null)
            {
                current = current.Date.AddDays(1);
                continue;
            }

            // Ensure current time is not before start of today's window
            if (current.TimeOfDay < bh.StartTime)
            {
                current = current.Date + bh.StartTime;
            }

            double availableMinutes = (bh.EndTime - current.TimeOfDay).TotalMinutes;

            if (availableMinutes <= 0)
            {
                current = current.Date.AddDays(1);
                continue;
            }

            if (remaining <= availableMinutes)
            {
                current = current.AddMinutes(remaining);
                remaining = 0;
                break;
            }
            else
            {
                remaining -= (int)availableMinutes;
                current = current.Date.AddDays(1);
            }
        }

        return TimeZoneInfo.ConvertTimeToUtc(current, BusinessTimeZone);
    }

    public async Task<int> GetElapsedBusinessMinutesAsync(DateTime fromUtc, DateTime toUtc, CancellationToken ct = default)
    {
        if (toUtc <= fromUtc) return 0;

        var (schedule, holidays) = await LoadCalendarDataAsync(ct);

        DateTime fromLocal = TimeZoneInfo.ConvertTimeFromUtc(fromUtc, BusinessTimeZone);
        DateTime toLocal = TimeZoneInfo.ConvertTimeFromUtc(toUtc, BusinessTimeZone);

        double totalElapsedMinutes = 0;
        DateTime cursorDate = fromLocal.Date;
        DateTime endDate = toLocal.Date;

        while (cursorDate <= endDate)
        {
            var dayOfWeek = cursorDate.DayOfWeek;
            bool isHoliday = holidays.Contains(cursorDate);
            bool isDayEnabled = schedule.TryGetValue(dayOfWeek, out var bh) && bh.IsEnabled;

            if (isDayEnabled && !isHoliday && bh != null)
            {
                TimeSpan windowStart = bh.StartTime;
                TimeSpan windowEnd = bh.EndTime;

                if (cursorDate == fromLocal.Date && fromLocal.TimeOfDay > windowStart)
                {
                    windowStart = fromLocal.TimeOfDay;
                }

                if (cursorDate == endDate && toLocal.TimeOfDay < windowEnd)
                {
                    windowEnd = toLocal.TimeOfDay;
                }

                if (windowEnd > windowStart)
                {
                    totalElapsedMinutes += (windowEnd - windowStart).TotalMinutes;
                }
            }

            cursorDate = cursorDate.AddDays(1);
        }

        return (int)Math.Max(0, Math.Round(totalElapsedMinutes));
    }

    public async Task<bool> IsWithinBusinessHoursAsync(DateTime utcTime, CancellationToken ct = default)
    {
        var (schedule, holidays) = await LoadCalendarDataAsync(ct);
        DateTime localTime = TimeZoneInfo.ConvertTimeFromUtc(utcTime, BusinessTimeZone);

        if (holidays.Contains(localTime.Date)) return false;

        if (schedule.TryGetValue(localTime.DayOfWeek, out var bh) && bh.IsEnabled)
        {
            return localTime.TimeOfDay >= bh.StartTime && localTime.TimeOfDay < bh.EndTime;
        }

        return false;
    }

    public async Task<(bool isHoliday, string? holidayName)> GetActiveHolidayAsync(DateTime utcTime, CancellationToken ct = default)
    {
        DateTime localTime = TimeZoneInfo.ConvertTimeFromUtc(utcTime, BusinessTimeZone);
        var targetDate = localTime.Date;
        var startOfDayUtc = DateTime.SpecifyKind(targetDate, DateTimeKind.Utc);
        var endOfDayUtc = startOfDayUtc.AddDays(1);

        var holiday = await _context.PublicHolidays
            .AsNoTracking()
            .Where(h => h.IsActive && h.HolidayDate >= startOfDayUtc && h.HolidayDate < endOfDayUtc)
            .FirstOrDefaultAsync(ct);

        if (holiday != null)
        {
            return (true, holiday.Name);
        }

        return (false, null);
    }
}
