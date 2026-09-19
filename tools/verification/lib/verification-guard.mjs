/**
 * Guard: a mutating verification suite must run against an ISOLATED server.
 *
 * A suite that creates/patches/deletes conversations must never be pointed at the
 * owner's normal Playground, because that writes into `apps/web/data/gharibo.db`
 * — the real user database.
 *
 * The isolated runner (`run-isolated.mjs`) sets GHARIBO_ISOLATED_VERIFICATION=1
 * in the suite's environment. If that is absent, the suite aborts loudly instead
 * of quietly mutating real data.
 *
 * A human who deliberately wants to probe their own server can opt in with
 * `--allow-real-db` (or ALLOW_REAL_DB=1). That is an explicit, visible decision.
 */
const FLAG = "GHARIBO_ISOLATED_VERIFICATION";

/**
 * Aborts unless the process is running under the isolated runner.
 *
 * @param {string} suiteName used in the error message
 */
export function requireIsolatedVerification(suiteName = "this suite") {
  if (process.env[FLAG] === "1") return;

  const optedIn =
    process.argv.includes("--allow-real-db") || process.env.ALLOW_REAL_DB === "1";
  if (optedIn) {
    console.warn(
      `\n[WARN] ${suiteName}: running against a NON-ISOLATED server by explicit request. ` +
        `This WILL create/modify conversations in the real database.\n`,
    );
    return;
  }

  console.error(
    `\n[REFUSED] ${suiteName} mutates conversations and was pointed at a non-isolated server.\n` +
      `This would write into the real user SQLite database.\n\n` +
      `Run it through the isolated runner instead:\n` +
      `  node tools/verification/run-isolated.mjs ${suiteName}\n\n` +
      `If you truly intend to run it against your own server (NOT recommended), opt in explicitly:\n` +
      `  node tools/verification/${suiteName} <url> --allow-real-db\n`,
  );
  process.exit(2);
}
