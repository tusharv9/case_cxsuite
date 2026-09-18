using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CaseManagement.Api.Migrations
{
    /// <inheritdoc />
    public partial class UpdateCaseAndDepartmentModels : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "OwnerId",
                table: "Departments",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Disposition",
                table: "Cases",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ResolutionNote",
                table: "Cases",
                type: "text",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Departments_OwnerId",
                table: "Departments",
                column: "OwnerId");

            migrationBuilder.AddForeignKey(
                name: "FK_Departments_Users_OwnerId",
                table: "Departments",
                column: "OwnerId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Departments_Users_OwnerId",
                table: "Departments");

            migrationBuilder.DropIndex(
                name: "IX_Departments_OwnerId",
                table: "Departments");

            migrationBuilder.DropColumn(
                name: "OwnerId",
                table: "Departments");

            migrationBuilder.DropColumn(
                name: "Disposition",
                table: "Cases");

            migrationBuilder.DropColumn(
                name: "ResolutionNote",
                table: "Cases");
        }
    }
}
