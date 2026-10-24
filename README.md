# FitPilot Mobile

Aplicación de Expo Router con proyectos nativos de Android e iOS versionados.

## Desarrollo

Usa la versión de pnpm indicada en package.json y Node compatible con su campo
engines. Copia .env.example a .env.local y configura las URLs de las APIs.

```powershell
pnpm install --frozen-lockfile
pnpm android
```

Para iniciar solo Metro, usa `pnpm start`.

## Firebase en Android

La configuración elige el archivo en este orden:

1. `GOOGLE_SERVICES_JSON`, una variable de tipo **file** en EAS.
2. `EXPO_ANDROID_GOOGLE_SERVICES_FILE`, para una ruta local alternativa.
3. `android.googleServicesFile` de la configuración base.
4. `./google-services.json`.

Los dos archivos Firebase actuales permanecen versionados e incluidos en los
paquetes de EAS. `.gitignore` excluye otras copias con ese nombre.

Como `android/` está versionado, EAS no ejecuta prebuild. El hook
`eas-build-post-install` copia el archivo elegido a `android/app/google-services.json`
antes de compilar. Para aplicar una ruta alternativa antes de compilar directamente
con Android Studio o `pnpm android`, ejecuta:

```powershell
pnpm sync:android:firebase
```

## Builds en EAS

Inicia sesión con una cuenta que tenga acceso al proyecto `@fitpilot/fitpilot-mobile`:

```powershell
pnpm dlx eas-cli@19.1.0 login
```

APK instalable para pruebas:

```powershell
pnpm build:android:preview
```

AAB para Google Play:

```powershell
pnpm build:android:production
```

Para builds locales en WSL y su toolchain, consulta [ANDROID_LOCAL_BUILD.md](ANDROID_LOCAL_BUILD.md).

## Enviar a Google Play

Configura en EAS las credenciales de una cuenta de servicio con acceso a la app.
El perfil de envío `production` apunta explícitamente al canal `production`:

```powershell
pnpm submit:android:production
```

Para enviar un **AAB** al canal de pruebas internas, usa el perfil de envío `preview`:

```powershell
pnpm dlx eas-cli@19.1.0 submit --platform android --profile preview
```

El APK del build `preview` es para instalación directa; para Google Play selecciona
un AAB generado con el perfil de build `production`.

## Validación

```powershell
pnpm typescript
pnpm lint
pnpm test
pnpm check:text-encoding
```
