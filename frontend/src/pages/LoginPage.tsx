import { useState, type FormEvent } from 'react';

import { authErrorMessage, login, register, type AuthUser } from '../lib/auth';

type Mode = 'login' | 'register';

export function LoginPage({ onAuthenticated }: { onAuthenticated: (user: AuthUser) => void }) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user =
        mode === 'register' ? await register(email, name, password) : await login(email, password);
      onAuthenticated(user);
    } catch (reason) {
      setError(authErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-card__brand" aria-hidden="true">
          ⌁
        </div>
        <h1 className="auth-card__title" id="auth-title">
          BPMN Studio
        </h1>
        <p className="auth-card__subtitle">
          {mode === 'login'
            ? 'Войдите, чтобы открыть диаграммы и комментарии.'
            : 'Создайте учётную запись — вы станете владельцем своих диаграмм.'}
        </p>

        <div className="auth-tabs" role="tablist" aria-label="Вход или регистрация">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={`auth-tabs__tab${mode === 'login' ? ' is-active' : ''}`}
            onClick={() => switchMode('login')}
          >
            Войти
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={`auth-tabs__tab${mode === 'register' ? ' is-active' : ''}`}
            onClick={() => switchMode('register')}
          >
            Регистрация
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          {mode === 'register' ? (
            <label className="auth-field">
              <span>Имя</span>
              <input
                autoComplete="name"
                value={name}
                required
                maxLength={255}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          ) : null}
          <label className="auth-field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              required
              maxLength={255}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="auth-field">
            <span>Пароль</span>
            <input
              type="password"
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              value={password}
              required
              minLength={mode === 'register' ? 8 : 1}
              maxLength={128}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {mode === 'register' ? <p className="auth-hint">Пароль — не короче 8 символов.</p> : null}
          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn btn--primary auth-submit" disabled={busy}>
            {busy ? 'Подождите…' : mode === 'register' ? 'Зарегистрироваться' : 'Войти'}
          </button>
        </form>
      </section>
    </main>
  );
}
