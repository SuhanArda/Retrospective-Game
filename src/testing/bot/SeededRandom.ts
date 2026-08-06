export class SeededRandom {
  constructor(private state: number) {}
  next() {
    this.state = (this.state * 1_664_525 + 1_013_904_223) >>> 0;
    return this.state / 4_294_967_296;
  }
}
