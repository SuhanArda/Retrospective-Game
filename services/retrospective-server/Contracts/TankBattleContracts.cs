namespace Retrospective.Server.Contracts;

public sealed record TankBattlePoint(double X, double Y);

public sealed record TankBattlePlayerSnapshot(
    string PlayerId,
    string DisplayName,
    string Color,
    string Team,
    bool Connected,
    double X,
    double Y,
    int Health,
    bool Alive,
    string Facing,
    double TurretAngle,
    double VelocityX,
    double VelocityY,
    bool Airborne);

public sealed record TankBattleShotSnapshot(
    string ShotId,
    string OwnerPlayerId,
    double Angle,
    double Power,
    TankBattlePoint Launch,
    TankBattlePoint Velocity,
    double Gravity,
    IReadOnlyList<TankBattlePoint> Path,
    TankBattlePoint Impact,
    long FiredAtUnixMs,
    long ImpactAtUnixMs,
    string Status,
    string ImpactType);

public sealed record TankBattleResultSnapshot(
    string WinnerTeam,
    string LoserTeam,
    IReadOnlyList<string> SurvivingPlayerIds,
    IReadOnlyList<string> EliminatedPlayerIds);

public sealed record TankBattleQuestionSnapshot(
    string QuestionId,
    int QuestionIndex,
    string LoserTeam,
    IReadOnlyList<string> AnsweredPlayerIds);

public sealed record TankBattleGameSnapshot(
    string GameSessionId,
    int RoundNumber,
    int Revision,
    long ServerTimeUnixMs,
    string Phase,
    int MapSeed,
    int MapWidth,
    int MapHeight,
    double WaterY,
    int TerrainStep,
    IReadOnlyList<double> TerrainHeights,
    IReadOnlyList<TankBattlePlayerSnapshot> Players,
    IReadOnlyList<TankBattleShotSnapshot> Projectiles,
    TankBattleShotSnapshot? LastShot,
    TankBattleResultSnapshot? Result,
    TankBattleQuestionSnapshot? ActiveQuestion);

public sealed record MoveTankBattleTankRequest(string GameSessionId, int Direction);
public sealed record FireTankBattleShotRequest(string GameSessionId, string Facing, double Angle, double Power);
public sealed record CompleteTankBattleQuestionRequest(string GameSessionId, string QuestionId);
