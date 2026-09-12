# ASP.NET 10 Web API — production image
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY ExcelArchive.Api/ExcelArchive.Api.csproj ExcelArchive.Api/
COPY ExcelArchive.Application/ExcelArchive.Application.csproj ExcelArchive.Application/
COPY ExcelArchive.Domain/ExcelArchive.Domain.csproj ExcelArchive.Domain/
COPY ExcelArchive.Infrastructure/ExcelArchive.Infrastructure.csproj ExcelArchive.Infrastructure/
RUN dotnet restore ExcelArchive.Api/ExcelArchive.Api.csproj
COPY . .
RUN dotnet publish ExcelArchive.Api/ExcelArchive.Api.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
ENV ASPNETCORE_URLS=http://+:5000
EXPOSE 5000
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "ExcelArchive.Api.dll"]
