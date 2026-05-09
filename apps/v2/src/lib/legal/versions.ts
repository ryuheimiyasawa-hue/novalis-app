export const CURRENT_TERMS_VERSION = "1.0.0";
export const CURRENT_PRIVACY_VERSION = "1.0.0";

export type LegalLanguage = "ja" | "en" | "tl";
export type LegalDocumentType = "terms" | "privacy";

export function getLegalDocumentPath(
  type: LegalDocumentType,
  version: string,
  language: LegalLanguage,
): string {
  return `/legal/${type}-${version}-${language}.md`;
}
