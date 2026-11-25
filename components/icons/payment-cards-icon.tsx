// Two payment cards, one tilted behind the other (drawn for PC Silicon).
// Black parts are currentColor, white parts the background color.
export function PaymentCardsIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <g transform="rotate(-18 24 26)">
        <rect x="5" y="14" width="36" height="24" rx="4" fill="currentColor" />
        <rect
          x="10"
          y="20"
          width="8"
          height="6"
          rx="1.5"
          className="fill-background"
        />
        <rect
          x="10"
          y="30"
          width="11"
          height="2.5"
          rx="1.25"
          className="fill-background"
        />
      </g>
      <rect
        x="21"
        y="26"
        width="38"
        height="25"
        rx="4.5"
        stroke="currentColor"
        strokeWidth="3.5"
        className="fill-background"
      />
      <rect x="21" y="32" width="38" height="4.5" fill="currentColor" />
      <path
        d="M27.5 43.5h13"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}
