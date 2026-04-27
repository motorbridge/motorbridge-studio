import React from 'react';

function detectBrowser() {
  if (typeof navigator === 'undefined') return 'UnknownBrowser';
  const ua = String(navigator.userAgent || '');
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('Chrome/') && !ua.includes('Edg/')) return 'Chrome';
  if (ua.includes('Safari/') && !ua.includes('Chrome/')) return 'Safari';
  if (ua.includes('Firefox/')) return 'Firefox';
  return 'UnknownBrowser';
}

function detectPlatform() {
  if (typeof navigator === 'undefined') return 'UnknownPlatform';
  const ua = String(navigator.userAgent || '');
  const platform = String(navigator.platform || '');
  if (/Windows/i.test(platform) || /Windows/i.test(ua)) return 'Windows';
  if (/Mac/i.test(platform) || /Mac OS/i.test(ua)) return 'macOS';
  if (/Linux/i.test(platform) || /Linux/i.test(ua)) return 'Linux';
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  return 'UnknownPlatform';
}

function detectTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UnknownTZ';
  } catch {
    return 'UnknownTZ';
  }
}

function formatLocalTime(date) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function encodeWatermarkPayload(payload) {
  const raw = [
    `b=${payload.browser}`,
    `p=${payload.platform}`,
    `t=${payload.localTime}`,
    `z=${payload.timeZone}`,
  ].join('|');

  try {
    const encoder = typeof globalThis !== 'undefined' ? globalThis.btoa : null;
    if (typeof encoder === 'function') {
      return encoder(raw).replace(/=+$/g, '');
    }
    return raw;
  } catch {
    return raw;
  }
}

export function BrandWatermark() {
  const rows = Array.from({ length: 20 }, (_, i) => i);
  const [now, setNow] = React.useState(() => new Date());

  React.useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(id);
  }, []);

  const browser = detectBrowser();
  const platform = detectPlatform();
  const timeZone = detectTimeZone();
  const localTime = formatLocalTime(now);
  const brandLine =
    'Seeed Studio motorbridge   Seeed Studio motorbridge   Seeed Studio motorbridge   Seeed Studio motorbridge   ';
  const encodedLine = `wm:${encodeWatermarkPayload({ browser, platform, localTime, timeZone })}   `;

  return (
    <div className="brandWatermark" aria-hidden="true">
      <div className="brandWatermarkPlane">
        {rows.map((row) => (
          <div key={row} className="brandWatermarkRow">
            <span>{brandLine}</span>
            <span>{brandLine}</span>
            <span>{brandLine}</span>
            <span className="brandWatermarkCode">{encodedLine}</span>
            <span className="brandWatermarkCode">{encodedLine}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
