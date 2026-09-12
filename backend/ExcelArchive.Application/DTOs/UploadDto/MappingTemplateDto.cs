using System.Text.Json;

namespace ExcelArchive.Application.DTOs.UploadDto;

public record MappingTemplateDto(Guid Id, Guid GroupId, string Name, JsonDocument Mapping);
