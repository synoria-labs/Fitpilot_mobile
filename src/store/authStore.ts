import { create } from 'zustand';
import { getCurrentUser } from '../services/account';
import {
  clearSessionTokens,
  getAccessToken,
  getRefreshToken,
  nutritionApi,
  nutritionClient,
  setSessionTokens,
  setUnauthorizedHandler,
} from '../services/api';
import { useCareTeamStore } from './careTeamStore';
import { useWorkoutStore } from './workoutStore';
import type { ApiError, LoginCredentials, LoginResponse, LoginResult, User } from '../types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  login: (credentials: LoginCredentials) => Promise<LoginResult>;
  completeSignupSession: (tokens: LoginResponse) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
  uploadAvatar: (uri: string) => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => {
  const clearAuthenticatedState = async (error: string | null = null) => {
    await clearSessionTokens();
    useCareTeamStore.getState().reset();
    useWorkoutStore.getState().reset();
    set({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isInitialized: true,
      error,
    });
  };

  const ensureClientUser = async (user: User) => {
    if (user.role !== 'client') {
      await clearAuthenticatedState(
        'Esta aplicacion es solo para clientes. Los profesionales deben usar la aplicacion web.',
      );
      return null;
    }

    return user;
  };

  const buildLoginErrorMessage = (error: ApiError) => {
    const status = error.status;
    const rawMessage = error.message || '';

    if (status === 401) {
      return (
        'Correo o contrasena incorrectos. Verifica tus datos e intenta de nuevo.\n\n' +
        'Si aun no tienes cuenta, puedes crearla desde la app.'
      );
    }

    if (status === 404) {
      return (
        'No se encontro una cuenta con ese correo.\n\n' +
        'Crea una cuenta nueva para comenzar tu onboarding.'
      );
    }

    if (
      rawMessage.toLowerCase().includes('network') ||
      rawMessage.toLowerCase().includes('timeout')
    ) {
      return 'No se pudo conectar con el servidor. Verifica tu conexion a internet e intenta de nuevo.';
    }

    return rawMessage || 'Error al iniciar sesion. Intenta de nuevo mas tarde.';
  };

  const authStore: AuthState = {
    user: null,
    isAuthenticated: false,
    isLoading: false,
    isInitialized: false,
    error: null,

    initialize: async () => {
      try {
        const accessToken = await getAccessToken();

        if (!accessToken) {
          set({
            isInitialized: true,
            isAuthenticated: false,
            user: null,
            error: null,
          });
          return;
        }

        if (__DEV__) {
          console.log('[Auth] init: access token found');
        }

        const user = await ensureClientUser(await getCurrentUser());
        if (!user) {
          return;
        }

        if (__DEV__) {
          console.log('[Auth] init: user loaded', user.email);
        }

        set({
          user,
          isAuthenticated: true,
          isInitialized: true,
          error: null,
        });
      } catch (error) {
        if (__DEV__) {
          console.warn('[Auth] init error', error);
        }

        await clearAuthenticatedState();
      }
    },

    login: async (credentials: LoginCredentials) => {
      set({ isLoading: true, error: null });

      try {
        if (__DEV__) {
          console.log('[Auth] login start', credentials.email);
        }

        const response = await nutritionClient.post<LoginResponse>(
          '/auth/login',
          {
            identifier: credentials.email.trim(),
            password: credentials.password,
            app_type: 'CLIENT_APP',
            captcha_token: credentials.captchaToken,
          },
          {
            skipAuth: true,
            skipAuthRefresh: true,
          },
        );

        await setSessionTokens({
          accessToken: response.access_token,
          refreshToken: response.refresh_token,
        });

        const user = await ensureClientUser(await getCurrentUser());
        if (!user) {
          return { status: 'failure' };
        }

        set({
          user,
          isAuthenticated: true,
          isLoading: false,
          isInitialized: true,
          error: null,
        });

        if (__DEV__) {
          console.log('[Auth] login success', user.email);
        }

        return { status: 'success' };
      } catch (error) {
        const apiError = error as ApiError;

        if (__DEV__) {
          console.warn('[Auth] login error', apiError?.message || apiError);
        }

        if (apiError.code === 'captcha_required') {
          set({
            isLoading: false,
            error: null,
          });

          return { status: 'captcha_required' };
        }

        set({
          isLoading: false,
          error: buildLoginErrorMessage(apiError),
        });

        return { status: 'failure' };
      }
    },

    completeSignupSession: async (tokens: LoginResponse) => {
      set({ isLoading: true, error: null });

      try {
        await setSessionTokens({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
        });

        const user = await ensureClientUser(await getCurrentUser());
        if (!user) {
          return { status: 'failure' };
        }

        set({
          user,
          isAuthenticated: true,
          isLoading: false,
          isInitialized: true,
          error: null,
        });

        return { status: 'success' };
      } catch (error) {
        const apiError = error as ApiError;

        if (__DEV__) {
          console.warn('[Auth] completeSignupSession error', apiError?.message || apiError);
        }

        await clearAuthenticatedState(
          apiError.message || 'No fue posible iniciar sesion despues del registro.',
        );

        return { status: 'failure' };
      }
    },

    logout: async () => {
      try {
        const refreshToken = await getRefreshToken();

        if (refreshToken) {
          await nutritionClient.post(
            '/auth/logout',
            { refresh_token: refreshToken },
            { skipAuthRefresh: true },
          );
        }
      } catch (error) {
        if (__DEV__) {
          console.warn('[Auth] logout request failed', error);
        }
      } finally {
        await clearAuthenticatedState();
      }
    },

    refreshUser: async () => {
      try {
        const user = await ensureClientUser(await getCurrentUser());
        if (!user) {
          return null;
        }

        set({
          user,
          isAuthenticated: true,
          isInitialized: true,
          error: null,
        });

        return user;
      } catch (error: any) {
        if (__DEV__) {
          console.warn('[Auth] refreshUser error', error?.message || error);
        }

        set({
          error: error.message || 'No fue posible actualizar tu perfil',
        });

        throw error;
      }
    },

    uploadAvatar: async (uri: string) => {
      set({ isLoading: true, error: null });

      try {
        const formData = new FormData();
        formData.append('file', {
          uri,
          name: 'profile.jpg',
          type: 'image/jpeg',
        } as unknown as Blob);

        await nutritionApi.patch('/users/me/profile-picture', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        const user = await ensureClientUser(await getCurrentUser());
        if (!user) {
          return;
        }

        set({
          user,
          isAuthenticated: true,
          isInitialized: true,
          isLoading: false,
          error: null,
        });

        if (__DEV__) {
          console.log('[Auth] uploadAvatar success', user.email);
        }
      } catch (error: any) {
        if (__DEV__) {
          console.warn('[Auth] uploadAvatar error', error?.message || error);
        }

        set({
          isLoading: false,
          error: error.message || 'Error al subir la imagen',
        });

        throw error;
      }
    },

    clearError: () => set({ error: null }),
  };

  setUnauthorizedHandler(async () => {
    const { isAuthenticated } = get();
    if (isAuthenticated) {
      await clearAuthenticatedState();
    }
  });

  return authStore;
});
