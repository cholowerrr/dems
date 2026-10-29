// Small inline icon set (24px, stroke) plus the DEMS mark.
const P = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 3-6 6.5-6s6.5 2.4 6.5 6" /><circle cx="17.5" cy="9" r="2.5" /><path d="M17 14.2c2.6.2 4.5 2 4.5 5" /></>,
  audit: <path d="M9 4h6M9 4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2M9.5 11h5M9.5 15h5" />,
  logout: <path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M16 8l4 4-4 4M20 12H9" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  alert: <path d="M12 4l9 16H3zM12 10v4M12 17.2v.01" />,
  plus: <path d="M12 5v14M5 12h14" />,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h8" /></>,
  upload: <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  file: <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5" />,
  link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1" />,
  swap: <path d="M4 8h13M13 4l4 4-4 4M20 16H7M11 12l-4 4 4 4" />,
  inbox: <path d="M3 13l2.5-7h13L21 13M3 13v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5M3 13h5l1 2h6l1-2h5" />,
  send: <path d="M4 12l16-8-6 16-3-7z" />,
  eye: <><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" /><circle cx="12" cy="12" r="2.8" /></>,
  shield: <path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z" />,
};

export function Icon({ name, size = 18, className = '' }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[name]}
    </svg>
  );
}

// Original mark: a shield with a chain link. Not based on any police insignia.
export function Logo({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#10233a" />
      <path d="M16 5l9 3.4v7.2c0 5-3.6 8.6-9 10-5.4-1.4-9-5-9-10V8.4z" fill="none" stroke="#e6d3a3" strokeWidth="2" strokeLinejoin="round" />
      <g fill="none" stroke="#e6d3a3" strokeWidth="1.7" strokeLinecap="round" transform="translate(0 .4)">
        <path d="M14.2 17.3a2.6 2.6 0 0 0 3.7 0l1.8-1.8a2.6 2.6 0 0 0-3.7-3.7l-.6.6" />
        <path d="M17.8 14.7a2.6 2.6 0 0 0-3.7 0l-1.8 1.8a2.6 2.6 0 0 0 3.7 3.7l.6-.6" />
      </g>
    </svg>
  );
}
