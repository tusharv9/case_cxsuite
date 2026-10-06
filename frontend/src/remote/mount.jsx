// ===== MOUNT — framework-agnostic entry =====
// Renders Case Management into `element` in its OWN React root with its OWN router.
//
// Why an isolated root: the Host App owns the page's router, and React Router refuses to nest a
// <Router> inside another. Mounting in a separate root keeps the Remote's existing absolute
// navigation (`/case-management/...`) working unchanged, resolved against the `basename` the
// Host gives us (e.g. the Host route `/cases/*` -> basename "/cases"). It also means the Remote
// never depends on how the Host is built or which router version it runs.
//
// Returns { update(props), unmount() } so a Host can push new props (token, user, permissions).
//
// Host-side usage (React example):
//     const { mount } = await import('caseManagement/mount');
//     useEffect(() => { const h = mount(ref.current, { basename: '/cases', ... }); return () => h.unmount(); }, []);

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import App from '../App.jsx';

export function mount(element, props = {}) {
  if (!element) throw new Error('Case Management mount: a DOM element is required.');

  const root = createRoot(element);
  const render = (p) =>
    root.render(
      <StrictMode>
        <App {...p} />
      </StrictMode>
    );

  render(props);

  return {
    update: (nextProps) => render(nextProps),
    unmount: () => root.unmount(),
  };
}

export default mount;
