# Project Development Rules

- Keep domain rules framework-independent and covered by Vitest.
- React owns application UI; Phaser owns world simulation and rendering. Communicate only through `GameEventBridge`.
- Network-dependent game actions go through `GameTransport`; the mock transport simulates authority locally.
- Add gameplay values to typed configuration files rather than scattering literals.
- Preserve strict TypeScript. Do not introduce `any`; narrow unknown values explicitly.
- Keep accessible labels, visible focus, supportive language, and reduced-motion behavior.
- Generated geometric visuals and Web Audio tones must remain original and asset-free.
- Run `npm run lint`, `npm run test`, and `npm run build` before handing off changes.
