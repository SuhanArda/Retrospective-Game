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
# Alpine's .NET images default to Invariant Globalization (no ICU) to stay
# small, but that makes CultureInfo.GetCultureInfo("tr-TR") throw — Draw &
# Guess needs real Turkish casing rules (İ/I/ı/i) to compare guesses
# correctly. Install ICU and turn invariant mode back off.
RUN apk add --no-cache icu-libs
ENV ASPNETCORE_ENVIRONMENT=Production \
    ASPNETCORE_URLS=http://0.0.0.0:10000 \
    DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false
EXPOSE 10000
COPY --from=build /app/publish .
USER $APP_UID
ENTRYPOINT ["dotnet", "retrospective-server.dll"]
