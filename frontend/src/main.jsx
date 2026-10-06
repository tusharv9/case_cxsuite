// ===== MAIN.JSX — Standalone entry point =====
// Used only when Case Management runs by itself (local development / standalone deployment).
// When a Host App loads the Remote it uses the federated `mount` export
// and never executes this file.

import { mount } from './remote/mount.jsx';

mount(document.getElementById('root'));
