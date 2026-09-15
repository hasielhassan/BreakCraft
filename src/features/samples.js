/**
 * Sample scripts, doubling as the golden-file fixtures in `tests/`.
 *
 * All five are original screenplay adaptations of stories in the public
 * domain — Aesop, Hans Christian Andersen, and the Flora Annie Steel fairy
 * tale collection (1918) — written for BreakCraft rather than lifted from any
 * existing screenplay, so there is no licensing question in shipping them.
 * See README's Credits section and the About dialog for the full attribution
 * and AI-assistance disclosure.
 *
 * Each has a `.breakcraft.json` companion with the same script already tagged
 * (built from these exact files via `scripts/build-tagged-samples.mjs`), so a
 * new user can open either a blank canvas or a finished example.
 */
export const SAMPLES = [
  {
    file: 'little-red-riding-hood.fountain',
    tagged: 'little-red-riding-hood.breakcraft.json',
    name: 'Little Red Riding-Hood',
    note: 'Fountain · 13 scenes'
  },
  {
    file: 'three-little-pigs.fountain',
    tagged: 'three-little-pigs.breakcraft.json',
    name: 'The Three Little Pigs',
    note: 'Fountain · 11 scenes'
  },
  {
    file: 'three-bears.fdx',
    tagged: 'three-bears.breakcraft.json',
    name: 'The Story of the Three Bears',
    note: 'Final Draft · 12 scenes'
  },
  {
    file: 'hare-and-tortoise.fountain',
    tagged: 'hare-and-tortoise.breakcraft.json',
    name: 'The Hare and the Tortoise',
    note: 'Fountain · 8 scenes'
  },
  {
    file: 'emperors-new-clothes.fdx',
    tagged: 'emperors-new-clothes.breakcraft.json',
    name: "The Emperor's New Clothes",
    note: 'Final Draft · 8 scenes'
  }
];
