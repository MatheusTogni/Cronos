export default async function globalTeardown() {
  await globalThis.__RPG_PG__?.stop();
}
