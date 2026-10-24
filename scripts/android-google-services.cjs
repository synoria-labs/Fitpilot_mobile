/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');

/** @param {NodeJS.ProcessEnv} env @param {string | undefined} fallback */
function resolveGoogleServicesFile(env, fallback) {
  return env.GOOGLE_SERVICES_JSON?.trim()
    || env.EXPO_ANDROID_GOOGLE_SERVICES_FILE?.trim()
    || fallback?.trim()
    || './google-services.json';
}

/** @param {string} projectRoot @param {NodeJS.ProcessEnv} env */
function syncAndroidGoogleServices(projectRoot, env) {
  if (env.EAS_BUILD_PLATFORM === 'ios') return null;

  const appJsonPath = path.join(projectRoot, 'app.json');
  const fallback = fs.existsSync(appJsonPath)
    ? JSON.parse(fs.readFileSync(appJsonPath, 'utf8')).expo?.android?.googleServicesFile
    : undefined;
  const source = path.resolve(projectRoot, resolveGoogleServicesFile(env, fallback));
  const destination = path.join(projectRoot, 'android', 'app', 'google-services.json');
  // Android is checked in, so EAS skips prebuild and does not copy this file for us.
  // Read before writing so a missing override never replaces the existing native config.
  const contents = fs.readFileSync(source);
  if (source !== destination) fs.writeFileSync(destination, contents);
  return destination;
}

module.exports = { resolveGoogleServicesFile, syncAndroidGoogleServices };

if (require.main === module) {
  const projectRoot = path.resolve(__dirname, '..');
  require('@expo/env').load(projectRoot, { silent: true });
  const destination = syncAndroidGoogleServices(projectRoot, process.env);
  if (destination) console.log('Configuración Firebase sincronizada en android/app/google-services.json.');
}
