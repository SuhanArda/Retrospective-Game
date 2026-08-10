# Build and run the room API. Docker is used rather than a platform's native
# .NET support because it behaves identically on Render, Railway, Fly and a
# local machine — one less thing to differ between environments.
#
# Build context is the repository root:
#   docker build -f services/retro-platform-api/Dockerfile -t retro-api .

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Restore first, on its own layer, so code edits do not re-download packages.
COPY services/retro-platform-api/retro-platform-api.csproj services/retro-platform-api/
RUN dotnet restore services/retro-platform-api/retro-platform-api.csproj

COPY services/retro-platform-api/ services/retro-platform-api/
RUN dotnet publish services/retro-platform-api/retro-platform-api.csproj \
    -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .

# The host supplies PORT at runtime; Program.cs binds to it. This is only a
# sensible default for `docker run` without one.
ENV PORT=8080
EXPOSE 8080

# Runs as a non-root user, which the aspnet image provides.
USER $APP_UID

ENTRYPOINT ["dotnet", "retro-platform-api.dll"]
