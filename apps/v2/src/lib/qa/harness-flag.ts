// The QA harness (app/[locale]/qa-chat) ships in the bundle but only
// resolves where this flag is set, which is a preview deployment and
// never production. Keeping the check in one place means the page and
// the proxy allowlist cannot disagree about whether it exists.
export const QA_HARNESS_ENABLED = process.env.NEXT_PUBLIC_QA_HARNESS === "1";
