const PATHS = {
  wallet: (
    <>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
      <path d="M20 10h-4a2 2 0 0 0 0 4h4" />
    </>
  ),
  feed: (
    <>
      <path d="M8.5 6.5H20M8.5 12H20M8.5 17.5H20" />
      <circle cx="4.5" cy="6.5" r="0.9" />
      <circle cx="4.5" cy="12" r="0.9" />
      <circle cx="4.5" cy="17.5" r="0.9" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M2.5 19.5c.7-3.3 3.2-5.2 6.5-5.2s5.8 1.9 6.5 5.2" />
      <path d="M15.5 5.3a3.5 3.5 0 0 1 0 6.4M18 14.6c1.8.8 3 2.5 3.5 4.9" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="4" />
      <path d="M4.5 20.5c.8-3.8 3.7-6 7.5-6s6.7 2.2 7.5 6" />
    </>
  ),
  userPlus: (
    <>
      <circle cx="10" cy="8.5" r="3.8" />
      <path d="M3 20c.8-3.6 3.5-5.7 7-5.7 1.4 0 2.6.3 3.7.9M18.5 13.5v6M15.5 16.5h6" />
    </>
  ),
  swap: <path d="M5 8.5h13M14.5 5l3.5 3.5-3.5 3.5M19 15.5H6M9.5 12L6 15.5 9.5 19" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  back: <path d="M15 5l-7 7 7 7" />,
  chevronRight: <path d="M9.5 6l6 6-6 6" />,
  more: (
    <>
      <circle cx="5.5" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="18.5" cy="12" r="1.2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </>
  ),
  share: (
    <>
      <path d="M12 15V4M8 7.5L12 3.5l4 4" />
      <path d="M7 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1" />
    </>
  ),
  bell: (
    <>
      <path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14z" />
      <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  trash: <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10.5 11v5.5M13.5 11v5.5" />,
};

export default function Icon({ name, size = 20, strokeWidth = 2, className = "" }) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
