// A truck in front of a clock, with speed lines (drawn for PC Silicon). Black
// parts are currentColor; the knockouts use the background color, so the
// truck stays cut out of the clock on any surface.
export function FastDeliveryIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <circle cx="45" cy="19" r="13" stroke="currentColor" strokeWidth="2.75" />
      <path
        d="M45 11v8h6"
        stroke="currentColor"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g
        strokeWidth="2.5"
        strokeLinejoin="round"
        fill="currentColor"
        className="stroke-background"
      >
        <rect x="15" y="20" width="27" height="25" rx="3" />
        <path d="M41 28h9.5a2 2 0 0 1 1.6.8l5.2 7a2 2 0 0 1 .4 1.2V43a2 2 0 0 1-2 2H41z" />
        <circle cx="23" cy="46" r="5.5" />
        <circle cx="49" cy="46" r="5.5" />
      </g>
      <path d="M45 31h5l3.6 5H45z" className="fill-background" />
      <circle cx="23" cy="46" r="1.9" className="fill-background" />
      <circle cx="49" cy="46" r="1.9" className="fill-background" />
      <path
        d="M4 27h7M2 33h9M6 39h5"
        stroke="currentColor"
        strokeWidth="3.25"
        strokeLinecap="round"
      />
    </svg>
  )
}
