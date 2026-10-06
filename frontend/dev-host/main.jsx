// Minimal stand-in for the real Host App. Its only job is to prove that Case Management can be
// loaded through Module Federation and mounted under a Host-owned router with Host-provided
// identity. It owns NO users or login: the "session" is just a token pasted into localStorage,
// handed to the Remote through getAccessToken() exactly the way the real Host will.
//
//   localStorage['dev-host-token']  the bearer token to present (see HOST_INTEGRATION.md)
//   localStorage['dev-host-api']    backend base URL (optional)

import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';

const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };

// This is the entire Host-side integration: a div, and a call to the Remote's mount().
function CaseManagementHost() {
  const containerRef = useRef(null);

  useEffect(() => {
    let handle = null;
    let cancelled = false;

    import('caseManagement/mount').then(({ mount }) => {
      if (cancelled) return;
      handle = mount(containerRef.current, {
        basename: '/cases',
        getAccessToken: () => read('dev-host-token'),
        onUnauthorized: () => console.warn('[dev-host] Case Management reported 401 — the Host would refresh the token or sign out here.'),
        apiBaseUrl: read('dev-host-api') || undefined,
        locale: 'en-MY',
        timezone: 'Asia/Kuala_Lumpur',
      });
    });

    return () => {
      cancelled = true;
      queueMicrotask(() => handle?.unmount());
    };
  }, []);

  return <div ref={containerRef} style={{ height: '100%' }} />;
}

function HostShell() {
  return (
    <>
      <div className="host-bar">
        <strong>DEV HOST</strong>
        <Link to="/">Host home</Link>
        <Link to="/cases">Case Management (/cases)</Link>
      </div>
      <div className="host-content">
        <Routes>
          <Route path="/" element={<div style={{ padding: 24 }}>Host home page</div>} />
          <Route path="/cases/*" element={<CaseManagementHost />} />
        </Routes>
      </div>
    </>
  );
}

createRoot(document.getElementById('host-root')).render(
  <BrowserRouter>
    <HostShell />
  </BrowserRouter>
);
