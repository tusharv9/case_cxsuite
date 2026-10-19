// ===== SIGN-IN SCREEN (standalone site only) =====
// Inside a Host App the Host signs people in and this screen never shows. On the standalone site it offers
// what the deployment allows (see loadSignInOptions in AppContext):
//   - the person's OmniConnect account (email + password, checked by the Host's AuthService), and/or
//   - a demo user picker, where the backend still accepts the development header.

import { useEffect, useState } from 'react';
import { LogIn } from 'lucide-react';
import { useApp } from '../../../contexts/AppContext.jsx';
import { userService } from '../../../services/userService.js';
import { Input, Select } from '../../common/Input/Input.jsx';
import { Button } from '../../common/Button/Button.jsx';
import './SignInScreen.css';

export function SignInScreen() {
  const { signInOptions, bootstrap, signInWithAccount, signInAsDemoUser } = useApp();
  const options = signInOptions || { account: false, demoUsers: false };

  return (
    <div className="sign-in">
      <div className="sign-in__card">
        <div className="sign-in__header">
          <div className="sign-in__icon"><LogIn size={20} /></div>
          <h1 className="sign-in__title">Sign in to Case Management</h1>
        </div>

        {bootstrap.error && <p className="sign-in__notice" role="alert">{bootstrap.error}</p>}

        {options.account && <AccountForm onSubmit={signInWithAccount} />}

        {options.account && options.demoUsers && <div className="sign-in__divider"><span>or</span></div>}

        {options.demoUsers && <DemoUserPicker onPick={signInAsDemoUser} />}

        {!options.account && !options.demoUsers && (
          <p className="sign-in__hint">
            This site has no way to sign in configured. Open Case Management from the OmniConnect app, or ask an
            administrator to set the sign-in service for this site.
          </p>
        )}
      </div>
    </div>
  );
}

function AccountForm({ onSubmit }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(email.trim(), password);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <form className="sign-in__form" onSubmit={submit} noValidate>
      <p className="sign-in__hint">Use your OmniConnect account.</p>
      <Input label="Email" type="email" autoComplete="username" value={email}
        onChange={(e) => setEmail(e.target.value)} disabled={busy} required />
      <Input label="Password" type="password" autoComplete="current-password" value={password}
        onChange={(e) => setPassword(e.target.value)} disabled={busy} required />
      {error && <p className="sign-in__error" role="alert">{error}</p>}
      <Button type="submit" variant="primary" isLoading={busy} className="sign-in__submit">Sign in</Button>
    </form>
  );
}

function DemoUserPicker({ onPick }) {
  const [users, setUsers] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [selected, setSelected] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    userService.getAllUsers()
      .then((list) => { if (!cancelled) setUsers(list || []); })
      .catch((e) => { if (!cancelled) setLoadError(e.message); });
    return () => { cancelled = true; };
  }, [attempt]);

  // The backend identifies a demo user by their Host id (externalUserId), not the local id.
  const userOptions = (users || [])
    .filter((u) => u.externalUserId)
    .map((u) => ({ value: u.externalUserId, label: u.role ? `${u.name} (${u.role})` : u.name, searchText: u.email }));

  return (
    <div className="sign-in__form">
      <p className="sign-in__hint">Demo access: continue as an existing user without a password.</p>
      <Select label="User" options={userOptions} value={selected} onChange={(e) => setSelected(e.target.value)}
        placeholder="Choose a user" isLoading={users === null && !loadError} loadError={loadError}
        onRetry={() => setAttempt((n) => n + 1)} emptyText="No users exist yet." />
      <Button variant="outline" disabled={!selected} onClick={() => onPick(selected)} className="sign-in__submit">
        Continue as this user
      </Button>
    </div>
  );
}
