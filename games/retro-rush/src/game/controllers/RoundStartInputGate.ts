export interface RoundStartGameplayInput {
  left: boolean;
  right: boolean;
  jump: boolean;
  speedAbility: boolean;
  rocketAbility: boolean;
  askAbility: boolean;
  developmentMovement: boolean;
}

const isNeutral = (input: RoundStartGameplayInput) =>
  !input.left &&
  !input.right &&
  !input.jump &&
  !input.speedAbility &&
  !input.rocketAbility &&
  !input.askAbility &&
  !input.developmentMovement;

/**
 * Input that began during a round-start lock must not become fresh gameplay
 * when the deadline expires. One fully neutral frame rearms input processing.
 */
export class RoundStartInputGate {
  private waitingForNeutral = false;

  lock() {
    this.waitingForNeutral = true;
  }

  shouldSuppress(input: RoundStartGameplayInput) {
    if (!this.waitingForNeutral) return false;
    if (isNeutral(input)) this.waitingForNeutral = false;
    return true;
  }
}
