// Собственные иконки BlockForge (рисуются как SVG, без эмодзи)
window.ICON = (function () {
  const P = {
    play: '<path d="M7 4.500l12 7.500-12 7.500z" fill="currentColor"/>',
    gear: '<circle cx="12" cy="12" r="3.200"/><path d="M12 2.500v3M12 18.500v3M2.500 12h3M18.500 12h3M5.300 5.300l2.100 2.100M16.600 16.600l2.100 2.100M18.700 5.300l-2.100 2.100M7.400 16.600l-2.100 2.100"/>',
    star: '<path d="M12 3l2.700 5.600 6.100.8-4.500 4.300 1.100 6.100L12 16.800 6.600 19.800l1.100-6.100L3.200 9.400l6.100-.8z" fill="currentColor"/>',
    flag: '<path d="M6 21V4M6 5h11l-2.500 3.500L17 12H6" fill="currentColor"/>',
    warn: '<path d="M12 3.500l9.500 16.500h-19z"/><path d="M12 10v4.500M12 17.300v.1"/>',
    check: '<path d="M4.500 12.500l5 5 10-11"/>',
    plus: '<path d="M12 4.500v15M4.500 12h15"/>',
    arrow: '<path d="M4.500 12h14M13 6l6 6-6 6"/>',
    swap: '<path d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4"/>',
    spin: '<path d="M19 12a7 7 0 11-2.300-5.200M19 4v4.500h-4.500"/>',
    undo: '<path d="M9 7L4.500 11.500 9 16M5 11.500h9.500a5 5 0 010 10H12"/>',
    redo: '<path d="M15 7l4.500 4.500L15 16M19 11.500H9.500a5 5 0 000 10H12"/>',
    pen: '<path d="M4 20l1-4.500L16.500 4a2.100 2.100 0 013 3L8 18.500z"/><path d="M14.500 6l3 3"/>',
    eraser: '<path d="M8 20h11M5.500 15.500L14 7l5 5-7 7H8.500z"/><path d="M10 11.500l4.500 4.500"/>',
    bucket: '<path d="M5 11l7-7 7 7-6 6a2.500 2.500 0 01-3.500 0z"/><path d="M19.500 15.500c1.200 1.600 1.200 3 0 3.500-1.200-.5-1.200-1.900 0-3.500z" fill="currentColor"/>',
    drop: '<path d="M12 3.500c3.500 4.500 6 7.500 6 10.500a6 6 0 01-12 0c0-3 2.500-6 6-10.500z"/>',
    shirt: '<path d="M8.500 4L3 7l2.500 4L8 10v10h8V10l2.500 1L21 7l-5.500-3a3.500 3.500 0 01-7 0z"/>',
    grid: '<rect x="4" y="4" width="16" height="16" rx="1.500"/><path d="M4 9.300h16M4 14.700h16M9.300 4v16M14.700 4v16"/>',
    server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.500h.1M7 16.500h.1"/>',
    puzzle: '<path d="M10 3h4v3a2 2 0 104 0h3v4h-3a2 2 0 100 4h3v4h-4v-3a2 2 0 10-4 0v3H6v-4a2 2 0 100-4V7h4z"/>',
    pad: '<rect x="2.500" y="7" width="19" height="11" rx="5"/><path d="M7.500 10v5M5 12.500h5"/><circle cx="15.500" cy="11.500" r="1" fill="currentColor"/><circle cx="18" cy="14" r="1" fill="currentColor"/>',
    chat: '<path d="M4 5h16v11H11l-4.500 3.500V16H4z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
    crown: '<path d="M3.500 8l4.500 4 4-7 4 7 4.500-4-1.500 11h-14z" fill="currentColor"/>',
    users: '<circle cx="9" cy="8" r="3.500"/><path d="M2.500 20c0-3.600 2.900-6 6.500-6s6.500 2.400 6.500 6"/><path d="M16 4.500a3.500 3.500 0 010 7M18 14.500c2.200.7 3.500 2.600 3.500 5.500"/>',
  };
  return (n, cls) => `<svg class="ic ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;
})();
