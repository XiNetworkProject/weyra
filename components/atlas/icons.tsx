import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Svg({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconSearch(props: IconProps) {
  return <Svg {...props}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.4" y2="16.4" /></Svg>;
}

export function IconUsers(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="10" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Svg>
  );
}

export function IconBell(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </Svg>
  );
}

export function IconMenu(props: IconProps) {
  return <Svg {...props}><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></Svg>;
}

export function IconNavigation(props: IconProps) {
  return <Svg {...props}><polygon points="3 11 22 2 13 21 11 13 3 11" /></Svg>;
}

export function IconDotsVertical(props: IconProps) {
  return (
    <Svg {...props} fill="currentColor" stroke="none">
      <circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" />
    </Svg>
  );
}

export function IconWind(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9.59 4.59A2 2 0 1 1 11 8H2" />
      <path d="M17.73 7.73A2.5 2.5 0 1 1 19.5 12H2" />
      <path d="M12.59 19.41A2 2 0 1 0 14 16H2" />
    </Svg>
  );
}

export function IconDroplet(props: IconProps) {
  return <Svg {...props}><path d="M12 2.7l5.66 5.65a8 8 0 1 1-11.32 0z" /></Svg>;
}

export function IconThermometer(props: IconProps) {
  return <Svg {...props}><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" /></Svg>;
}

export function IconRadar(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M19.07 4.93A10 10 0 0 0 6.99 3.34" />
      <path d="M4 6h.01" />
      <path d="M2.29 9.62A10 10 0 1 0 21.31 8.35" />
      <path d="M16.24 7.76A6 6 0 1 0 8.23 16.67" />
      <path d="M12 18h.01" />
      <path d="M17.99 11.66A6 6 0 0 1 15.77 16.67" />
      <circle cx="12" cy="12" r="2" />
      <path d="m13.41 10.59 5.66-5.66" />
    </Svg>
  );
}

export function IconCloud(props: IconProps) {
  return <Svg {...props}><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z" /></Svg>;
}

export function IconChevronDown(props: IconProps) {
  return <Svg {...props}><polyline points="6 9 12 15 18 9" /></Svg>;
}

export function IconPlus(props: IconProps) {
  return <Svg {...props}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></Svg>;
}

export function IconMinus(props: IconProps) {
  return <Svg {...props}><line x1="5" y1="12" x2="19" y2="12" /></Svg>;
}

export function IconPlay(props: IconProps) {
  return <Svg {...props} fill="currentColor"><polygon points="7 4 20 12 7 20 7 4" /></Svg>;
}

export function IconPause(props: IconProps) {
  return (
    <Svg {...props} fill="currentColor" stroke="none">
      <rect x="6" y="4" width="4" height="16" rx="1.4" /><rect x="14" y="4" width="4" height="16" rx="1.4" />
    </Svg>
  );
}

export function IconMaximize(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </Svg>
  );
}

export function IconMapPin(props: IconProps) {
  return <Svg {...props}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></Svg>;
}

export function IconClock(props: IconProps) {
  return <Svg {...props}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></Svg>;
}

export function IconArrowUp(props: IconProps) {
  return <Svg {...props}><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></Svg>;
}

export function IconClose(props: IconProps) {
  return <Svg {...props}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></Svg>;
}
