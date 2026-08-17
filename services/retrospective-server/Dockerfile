FROM mcr.microsoft.com/dotnet/sdk:10.0-alpine AS build
WORKDIR /src

COPY services/retrospective-server/retrospective-server.csproj services/retrospective-server/
RUN dotnet restore services/retrospective-server/retrospective-server.csproj

COPY services/retrospective-server/ services/retrospective-server/
RUN dotnet publish services/retrospective-server/retrospective-server.csproj \
    --configuration Release \
    --no-restore \
    --output /app/publish \
    /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine AS runtime
WORKDIR /app
ENV ASPNETCORE_ENVIRONMENT=Production \
    ASPNETCORE_URLS=http://0.0.0.0:10000
EXPOSE 10000
COPY --from=build /app/publish .
USER $APP_UID
ENTRYPOINT ["dotnet", "retrospective-server.dll"]
