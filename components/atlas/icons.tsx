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

export function IconBolt(props: IconProps) {
  return <Svg {...props} fill="currentColor" stroke="none"><polygon points="13 2 3 14 11 14 9 22 21 10 13 10 13 2" /></Svg>;
}

export function IconHail(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M17.5 12H9a5 5 0 1 1 4.79-6.5" />
      <circle cx="8" cy="17" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="13" cy="19" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="17" cy="16.3" r="1.3" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconSnowflake(props: IconProps) {
  return (
    <Svg {...props}>
      <line x1="12" y1="3" x2="12" y2="21" />
      <line x1="5" y1="7.5" x2="19" y2="16.5" />
      <line x1="19" y1="7.5" x2="5" y2="16.5" />
      <path d="M12 3l-2.2 2.2M12 3l2.2 2.2M12 21l-2.2-2.2M12 21l2.2-2.2" />
      <path d="M5 7.5l3-.3M5 7.5l.8 2.9M19 16.5l-3 .3M19 16.5l-.8-2.9" />
      <path d="M19 7.5l-3 .3M19 7.5l-.8 2.9M5 16.5l3-.3M5 16.5l-.8-2.9" />
    </Svg>
  );
}

export function IconSend(props: IconProps) {
  return (
    <Svg {...props}>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </Svg>
  );
}

export function IconSun(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </Svg>
  );
}

export function IconCloudSun(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="7.5" r="2.6" />
      <line x1="8" y1="2" x2="8" y2="3.2" />
      <line x1="3.6" y1="3.6" x2="4.45" y2="4.45" />
      <line x1="2" y1="7.5" x2="3.2" y2="7.5" />
      <path d="M20 17.5a4 4 0 0 0-1.4-7.74 5.5 5.5 0 0 0-10.4 2.2A4.5 4.5 0 0 0 9 21h9a3.5 3.5 0 0 0 2-3.5z" />
    </Svg>
  );
}

export function IconCloudFog(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M16.5 12.5a4.5 4.5 0 0 0-8.62-1.77A5 5 0 0 0 8 20.5h8" />
      <line x1="4" y1="16" x2="20" y2="16" />
      <line x1="6" y1="20" x2="18" y2="20" />
    </Svg>
  );
}

export function IconCloudDrizzle(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 15.58A5 5 0 0 0 18 6h-1.26A8 8 0 1 0 4 14.25" />
      <line x1="8" y1="18" x2="8" y2="20" />
      <line x1="8" y1="13" x2="8" y2="15" />
      <line x1="16" y1="18" x2="16" y2="20" />
      <line x1="16" y1="13" x2="16" y2="15" />
      <line x1="12" y1="20" x2="12" y2="22" />
      <line x1="12" y1="15" x2="12" y2="17" />
    </Svg>
  );
}

export function IconCloudRain(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 15.58A5 5 0 0 0 18 6h-1.26A8 8 0 1 0 4 14.25" />
      <line x1="16" y1="14" x2="16" y2="21" />
      <line x1="8" y1="14" x2="8" y2="21" />
      <line x1="12" y1="16" x2="12" y2="23" />
    </Svg>
  );
}

export function IconCloudSnow(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25" />
      <line x1="8" y1="16" x2="8.01" y2="16" />
      <line x1="8" y1="20" x2="8.01" y2="20" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
      <line x1="12" y1="22" x2="12.01" y2="22" />
      <line x1="16" y1="16" x2="16.01" y2="16" />
      <line x1="16" y1="20" x2="16.01" y2="20" />
    </Svg>
  );
}

export function IconCloudLightning(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M19 15.9A5 5 0 0 0 18 6h-1.26a8 8 0 1 0-11.62 9" />
      <polyline points="13 11 9 17 15 17 11 23" />
    </Svg>
  );
}

export function IconDroplets(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.09 3 12.25c0 2.22 1.8 4.05 4 4.05z" />
      <path d="M16.5 10.2c1.5 0 2.7-1.24 2.7-2.77 0-.8-.4-1.53-1.15-2.18-.75-.64-1.35-1.53-1.55-2.47-.2.99-.75 1.88-1.5 2.52s-1.7 1.35-1.7 2.13c0 1.53 1.2 2.77 2.7 2.77z" />
    </Svg>
  );
}

export function IconAlertTriangle(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </Svg>
  );
}

export function IconActivity(props: IconProps) {
  return <Svg {...props}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></Svg>;
}

export function IconCamera(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 8a2 2 0 0 1 2-2h1.2l.9-1.5A2 2 0 0 1 9.83 3.5h4.34a2 2 0 0 1 1.73 1L16.8 6H18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="13" r="3.6" />
    </Svg>
  );
}

export function IconTornado(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 5h16" />
      <path d="M6 9h12" />
      <path d="M8 13h8" />
      <path d="M10 17h4" />
      <path d="M11.5 21h1" />
    </Svg>
  );
}

export function IconWaves(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2 7c2.2 0 2.2 2 4.4 2S8.6 7 10.8 7s2.2 2 4.4 2S17.4 7 19.6 7 21.8 9 24 9" />
      <path d="M2 12c2.2 0 2.2 2 4.4 2s2.2-2 4.4-2 2.2 2 4.4 2 2.2-2 4.4-2 2.2 2 4.4 2" />
      <path d="M2 17c2.2 0 2.2 2 4.4 2s2.2-2 4.4-2 2.2 2 4.4 2 2.2-2 4.4-2 2.2 2 4.4 2" />
    </Svg>
  );
}

export function IconRainbow(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 18a8 8 0 0 1 16 0" />
      <path d="M7 18a5 5 0 0 1 10 0" />
      <path d="M10 18a2 2 0 0 1 4 0" />
    </Svg>
  );
}

export function IconHeart(props: IconProps) {
  return <Svg {...props}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" /></Svg>;
}

export function IconShare(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.6" y1="10.5" x2="15.4" y2="6.5" />
      <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
    </Svg>
  );
}

export function IconCheck(props: IconProps) {
  return <Svg {...props}><polyline points="20 6 9 17 4 12" /></Svg>;
}

export function IconRepeat(props: IconProps) {
  return (
    <Svg {...props}>
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </Svg>
  );
}

export function IconSkipBack(props: IconProps) {
  return <Svg {...props} fill="currentColor"><line x1="5" y1="4" x2="5" y2="20" /><polygon points="19 4 8 12 19 20 19 4" /></Svg>;
}

export function IconSkipForward(props: IconProps) {
  return <Svg {...props} fill="currentColor"><line x1="19" y1="4" x2="19" y2="20" /><polygon points="5 4 16 12 5 20 5 4" /></Svg>;
}

export function IconStar(props: IconProps) {
  return <Svg {...props}><polygon points="12 2 15.1 8.3 22 9.3 17 14.2 18.2 21 12 17.8 5.8 21 7 14.2 2 9.3 8.9 8.3 12 2" /></Svg>;
}

export function IconSettings(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06-2.83 2.83-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21h-4v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06-2.83-2.83.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3v-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06 2.83-2.83.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3h4v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06 2.83 2.83-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21v4h-.09A1.65 1.65 0 0 0 19.4 15z" />
    </Svg>
  );
}

export function IconChevronRight(props: IconProps) {
  return <Svg {...props}><polyline points="9 18 15 12 9 6" /></Svg>;
}

export function IconCompass(props: IconProps) {
  return <Svg {...props}><circle cx="12" cy="12" r="9" /><polygon points="16 8 14 14 8 16 10 10 16 8" /></Svg>;
}

export function IconSliders(props: IconProps) {
  return (
    <Svg {...props}>
      <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
    </Svg>
  );
}

export function IconTrash(props: IconProps) {
  return <Svg {...props}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6m3 0V3h8v3" /><line x1="10" y1="11" x2="10" y2="16" /><line x1="14" y1="11" x2="14" y2="16" /></Svg>;
}

export function IconEye(props: IconProps) {
  return <Svg {...props}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Svg>;
}

export function IconHome(props: IconProps) {
  return <Svg {...props}><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></Svg>;
}

export function IconBook(props: IconProps) {
  return <Svg {...props}><path d="M4 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H4z" /><path d="M20 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></Svg>;
}

export function IconBookmark(props: IconProps) {
  return <Svg {...props}><path d="M6 3h12v18l-6-4-6 4z" /></Svg>;
}

export function IconMessage(props: IconProps) {
  return <Svg {...props}><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /></Svg>;
}

export function IconUser(props: IconProps) {
  return <Svg {...props}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Svg>;
}

export function IconShield(props: IconProps) {
  return <Svg {...props}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></Svg>;
}

export function IconEdit(props: IconProps) {
  return <Svg {...props}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z" /></Svg>;
}

export function IconArrowLeft(props: IconProps) {
  return <Svg {...props}><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></Svg>;
}

export function IconMoreHorizontal(props: IconProps) {
  return <Svg {...props}><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></Svg>;
}

export function IconFilter(props: IconProps) {
  return <Svg {...props}><path d="M4 5h16" /><path d="M7 12h10" /><path d="M10 19h4" /></Svg>;
}

export function IconGlobe(props: IconProps) {
  return <Svg {...props}><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18" /><path d="M12 3a14 14 0 0 0 0 18" /></Svg>;
}
