export function Icon({ name, size = 22 }) {
  const paths = {
    arrow: <><path d="M4 12h15"/><path d="m14 5 7 7-7 7"/></>,
    archive: <><rect x="4" y="5" width="16" height="15" rx="1"/><path d="M8 5V3h8v2M8 10h8M8 14h5"/></>,
    flask: <><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M7 16h10"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    stamp: <><path d="M6 20h12M8 16h8l-1-5a4 4 0 1 0-6 0z"/></>,
    upload: <><path d="M12 16V4m0 0-5 5m5-5 5 5"/><path d="M4 15v5h16v-5"/></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="1"/><circle cx="9" cy="10" r="2"/><path d="m21 15-5-5L5 20"/></>,
    chat: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></>,
    text: <><path d="M4 6h16M12 6v14M8 20h8"/></>,
    share: <><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4m-6.8 7 6.8 4"/></>,
    reset: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></>,
    close: <><path d="m5 5 14 14M19 5 5 19"/></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="1"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    scale: <><path d="M12 3v18M5 7h14M5 7l-3 6h6L5 7Zm14 0-3 6h6l-3-6ZM8 21h8"/></>,
    copy: <><rect x="8" y="8" width="12" height="12" rx="1"/><path d="M16 8V4H4v12h4"/></>,
  };
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">{paths[name] || paths.arrow}</svg>;
}
