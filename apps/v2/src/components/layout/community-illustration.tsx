// A small, hand-drawn-in-code group of four people (two adults, a child
// and a teenager) standing together, for the blue closing band. Flat
// shapes only, no flag or landmark motifs, coloured entirely from theme
// tokens so it follows light and dark mode. Decorative: hidden from
// assistive technology.
export function CommunityIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 260 150"
      aria-hidden
      focusable="false"
      className={className}
    >
      {/* Ground shadow */}
      <ellipse cx="130" cy="146" rx="118" ry="4" className="fill-primary-foreground/15" />

      {/* Adult, left: short hair, yellow top */}
      <path d="M30 150v-46c0-17 13-30 30-30s30 13 30 30v46z" className="fill-highlight" />
      <circle cx="60" cy="48" r="18" className="fill-highlight-soft" />
      <path d="M42 46c0-13 8-20 18-20s19 7 18 20c-5-6-12-8-18-8s-13 2-18 8z" className="fill-footer" />
      <path d="M53 55q7 6 14 0" className="fill-none stroke-footer" strokeWidth="2" strokeLinecap="round" />

      {/* Teen, far right: ponytail, yellow top */}
      <path d="M200 150v-36c0-13 10-24 23-24s23 11 23 24v36z" className="fill-highlight" />
      <circle cx="223" cy="70" r="14" className="fill-highlight-soft" />
      <path d="M209 68c0-10 6-16 14-16s15 6 14 16c-4-5-9-6-14-6s-10 1-14 6z" className="fill-footer" />
      <circle cx="239" cy="66" r="6" className="fill-footer" />
      <path d="M218 75q5 4 10 0" className="fill-none stroke-footer" strokeWidth="2" strokeLinecap="round" />

      {/* Adult, centre-right: long hair, white top */}
      <path d="M136 82c-4 10-6 22-4 34h44c2-12 0-24-4-34z" className="fill-footer" />
      <path d="M124 150v-44c0-17 13-30 30-30s30 13 30 30v44z" className="fill-primary-foreground" />
      <circle cx="154" cy="46" r="18" className="fill-highlight-soft" />
      <path d="M134 50c-1-16 8-26 20-26s21 10 20 26c-2-8-9-14-20-14s-18 6-20 14z" className="fill-footer" />
      <path d="M147 53q7 6 14 0" className="fill-none stroke-footer" strokeWidth="2" strokeLinecap="round" />

      {/* Child, front centre: light-blue top, waving */}
      <path d="M88 150v-24c0-11 9-20 20-20s20 9 20 20v24z" className="fill-primary-soft" />
      <path d="M124 120l12-22" className="fill-none stroke-primary-soft" strokeWidth="7" strokeLinecap="round" />
      <circle cx="137" cy="96" r="5" className="fill-highlight-soft" />
      <circle cx="108" cy="92" r="13" className="fill-highlight-soft" />
      <path d="M95 90c0-9 6-14 13-14s14 5 13 14c-4-4-8-5-13-5s-9 1-13 5z" className="fill-footer" />
      <path d="M103 97q5 4 10 0" className="fill-none stroke-footer" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
