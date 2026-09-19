import { cn } from "@/lib/utils";

type IcegramLogoProps = { compact?: boolean; light?: boolean; className?: string };

export function IcegramLogo({ compact = false, light = false, className }: IcegramLogoProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <svg aria-label="Icegram mark" className={compact ? "h-9 w-9" : "h-11 w-11"} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="icegram-mark" x1="7" y1="4" x2="40" y2="44" gradientUnits="userSpaceOnUse">
            <stop stopColor="#DDF9FF" />
            <stop offset="0.48" stopColor="#67D9F5" />
            <stop offset="1" stopColor="#2F75E8" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="44" height="44" rx="14" fill={light ? "rgba(255,255,255,.14)" : "#10213E"} />
        <path d="M24 9L30.5 15.5L27.4 18.6L24 15.2L20.6 18.6L17.5 15.5L24 9Z" fill="url(#icegram-mark)" />
        <path d="M24 15.2V36" stroke="url(#icegram-mark)" strokeWidth="4.5" strokeLinecap="round" />
        <path d="M13 24H35" stroke="url(#icegram-mark)" strokeWidth="4.5" strokeLinecap="round" />
        <path d="M14.5 33.5L20.1 27.9M33.5 33.5L27.9 27.9" stroke="url(#icegram-mark)" strokeWidth="2.3" strokeLinecap="round" />
      </svg>
      {!compact && <div className={cn("leading-none", light ? "text-white" : "text-foreground")}><div className="text-lg font-black tracking-[0.18em]">ICEGRAM</div><div className={cn("mt-1 text-[9px] font-semibold tracking-[0.28em]", light ? "text-white/60" : "text-muted-foreground")}>CONNECT. CHAT. CREATE.</div></div>}
    </div>
  );
}
