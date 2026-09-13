// 1.1.0 takes effect 2026-09-28 (lawyer review of 2026-08-10). Merging a
// bump here sends every user whose latest consent is older to /consent and
// stops the AI (web and Messenger) until they agree. Deploy on the effective
// date stated at the bottom of public/legal/*-<version>-*.md, not before.
export const CURRENT_TERMS_VERSION = "1.1.0";
export const CURRENT_PRIVACY_VERSION = "1.1.0";

export type LegalLanguage = "ja" | "en" | "tl";
export type LegalDocumentType = "terms" | "privacy";

export function getLegalDocumentPath(
  type: LegalDocumentType,
  version: string,
  language: LegalLanguage,
): string {
  return `/legal/${type}-${version}-${language}.md`;
}
