import { ApiError, apiRequest, apiRequestNoContent } from './api';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  created_at: string;
}

/** Текущий пользователь или `null`, если сессии нет. */
export async function fetchCurrentUser(): Promise<AuthUser | null> {
  try {
    return await apiRequest<AuthUser>('/auth/me');
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

export function login(email: string, password: string): Promise<AuthUser> {
  return apiRequest<AuthUser>('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

export function register(email: string, name: string, password: string): Promise<AuthUser> {
  return apiRequest<AuthUser>('/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, name, password }),
  });
}

export function logout(): Promise<void> {
  return apiRequestNoContent('/auth/logout', { method: 'POST' });
}

/** Сообщение об ошибке входа из detail FastAPI. */
export function authErrorMessage(reason: unknown): string {
  if (reason instanceof ApiError) {
    const detail = (reason.detail as { detail?: unknown } | undefined)?.detail;
    if (detail && typeof detail === 'object' && 'message' in detail) {
      const message = (detail as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) {
        return message;
      }
    }
    if (reason.status === 401) {
      return 'Неверный email или пароль';
    }
    if (reason.status === 409) {
      return 'Пользователь с таким email уже зарегистрирован';
    }
    if (reason.status === 422) {
      return 'Проверьте email, имя и пароль (минимум 8 символов)';
    }
  }
  return reason instanceof Error ? reason.message : 'Не удалось выполнить вход';
}
