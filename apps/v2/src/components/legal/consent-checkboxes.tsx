"use client";

// The three agreements the lawyer review requires (terms, privacy, age),
// shared by /onboarding and /consent so the two can never drift apart.
//
// termsOpened / privacyOpened record whether the user clicked through to the
// full text before agreeing. This is what we do instead of scroll-to-agree
// (lawyer review 3-7): weaker evidence, far less friction on a phone. It is
// recorded, never required.

export interface ConsentState {
  terms: boolean;
  privacy: boolean;
  age: boolean;
  termsOpened: boolean;
  privacyOpened: boolean;
}

export const INITIAL_CONSENT_STATE: ConsentState = {
  terms: false,
  privacy: false,
  age: false,
  termsOpened: false,
  privacyOpened: false,
};

export function isConsentComplete(s: ConsentState): boolean {
  return s.terms && s.privacy && s.age;
}

export interface ConsentCheckboxLabels {
  terms: string;
  privacy: string;
  age: string;
  viewTerms: string;
  viewPrivacy: string;
}

export function ConsentCheckboxes({
  locale,
  value,
  onChange,
  labels,
}: {
  locale: "ja" | "en" | "tl";
  value: ConsentState;
  onChange: (next: ConsentState) => void;
  labels: ConsentCheckboxLabels;
}) {
  return (
    <div className="space-y-3 rounded-md border border-neutral-200 dark:border-neutral-800 p-4">
      <Checkbox
        id="agree-terms"
        checked={value.terms}
        onChange={(terms) => onChange({ ...value, terms })}
        label={labels.terms}
        link={{
          href: `/${locale}/legal/terms`,
          text: labels.viewTerms,
          onOpen: () => onChange({ ...value, termsOpened: true }),
        }}
      />
      <Checkbox
        id="agree-privacy"
        checked={value.privacy}
        onChange={(privacy) => onChange({ ...value, privacy })}
        label={labels.privacy}
        link={{
          href: `/${locale}/legal/privacy`,
          text: labels.viewPrivacy,
          onOpen: () => onChange({ ...value, privacyOpened: true }),
        }}
      />
      <Checkbox
        id="agree-age"
        checked={value.age}
        onChange={(age) => onChange({ ...value, age })}
        label={labels.age}
      />
    </div>
  );
}

function Checkbox({
  id,
  checked,
  onChange,
  label,
  link,
}: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  link?: { href: string; text: string; onOpen: () => void };
}) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 cursor-pointer">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1"
      />
      <span className="text-sm leading-relaxed">
        {label}
        {link && (
          <>
            {" — "}
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-blue-700 hover:text-blue-900"
              onClick={(e) => {
                // Inside a <label>: without this the click also toggles the box.
                e.stopPropagation();
                link.onOpen();
              }}
              onAuxClick={link.onOpen}
            >
              {link.text}
            </a>
          </>
        )}
      </span>
    </label>
  );
}
