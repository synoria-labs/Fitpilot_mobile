/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { test } = require('node:test');
const ts = require('typescript');
const { AndroidConfig, compileModsAsync, withPlugins } = require('expo/config-plugins');
const { syncAndroidGoogleServices } = require('./android-google-services.cjs');

const projectRoot = path.resolve(__dirname, '..');
const appConfigPath = path.join(projectRoot, 'app.config.ts');
const compiledConfig = ts.transpileModule(fs.readFileSync(appConfigPath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function loadAppConfig(env = {}, config = {}) {
  const sandbox = {
    exports: {},
    require: createRequire(appConfigPath),
    process: { env: {
      EXPO_PUBLIC_NUTRITION_API_URL: 'http://localhost:3000/v1',
      EXPO_PUBLIC_TRAINING_API_URL: 'http://localhost:8010/api',
      ...env,
    } },
  };
  vm.runInNewContext(compiledConfig, sandbox, { filename: appConfigPath });
  return sandbox.exports.default({ config });
}

for (const { name, env, fallback, expected } of [
  { name: 'default', env: {}, expected: './google-services.json' },
  { name: 'local override', env: { EXPO_ANDROID_GOOGLE_SERVICES_FILE: './local.json' }, expected: './local.json' },
  { name: 'EAS overrides local', env: { GOOGLE_SERVICES_JSON: '/tmp/eas.json', EXPO_ANDROID_GOOGLE_SERVICES_FILE: './local.json' }, expected: '/tmp/eas.json' },
  { name: 'blank EAS value falls back to local', env: { GOOGLE_SERVICES_JSON: ' ', EXPO_ANDROID_GOOGLE_SERVICES_FILE: ' ./local.json ' }, expected: './local.json' },
  { name: 'base config fallback', env: {}, fallback: './base.json', expected: './base.json' },
  { name: 'blank overrides retain base config', env: { GOOGLE_SERVICES_JSON: ' ', EXPO_ANDROID_GOOGLE_SERVICES_FILE: '' }, fallback: './base.json', expected: './base.json' },
]) {
  test(`app config Firebase selection: ${name}`, () => {
    assert.equal(loadAppConfig(env, { android: { googleServicesFile: fallback } }).android.googleServicesFile, expected);
  });
}

function createFixture(context) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fitpilot-android-deploy-'));
  const destination = path.join(fixtureRoot, 'android', 'app', 'google-services.json');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, '{"project":"existing"}');
  context.after(() => {
    assert.equal(path.dirname(fixtureRoot), path.resolve(os.tmpdir()));
    assert.ok(path.basename(fixtureRoot).startsWith('fitpilot-android-deploy-'));
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  });
  return { fixtureRoot, destination };
}

test('native Android receives the EAS file instead of the checked-in Firebase project', (context) => {
  const { fixtureRoot, destination } = createFixture(context);
  const source = path.join(fixtureRoot, 'eas.json');
  fs.writeFileSync(source, '{"project":"eas"}');
  fs.writeFileSync(path.join(fixtureRoot, 'local.json'), '{"project":"local"}');
  syncAndroidGoogleServices(fixtureRoot, {
    EAS_BUILD_PLATFORM: 'android', GOOGLE_SERVICES_JSON: source,
    EXPO_ANDROID_GOOGLE_SERVICES_FILE: './local.json',
  });
  assert.equal(fs.readFileSync(destination, 'utf8'), fs.readFileSync(source, 'utf8'));
});

test('local Firebase paths resolve from the project root', (context) => {
  const { fixtureRoot, destination } = createFixture(context);
  fs.writeFileSync(path.join(fixtureRoot, 'local.json'), '{"project":"local"}');
  syncAndroidGoogleServices(fixtureRoot, { EXPO_ANDROID_GOOGLE_SERVICES_FILE: './local.json' });
  assert.equal(JSON.parse(fs.readFileSync(destination, 'utf8')).project, 'local');
});

test('native Firebase synchronization honors the base app.json fallback', (context) => {
  const { fixtureRoot, destination } = createFixture(context);
  fs.writeFileSync(path.join(fixtureRoot, 'base.json'), '{"project":"base"}');
  fs.writeFileSync(path.join(fixtureRoot, 'app.json'), JSON.stringify({
    expo: { android: { googleServicesFile: './base.json' } },
  }));
  syncAndroidGoogleServices(fixtureRoot, {});
  assert.equal(JSON.parse(fs.readFileSync(destination, 'utf8')).project, 'base');
});

test('a missing Firebase override fails without overwriting the existing native file', (context) => {
  const { fixtureRoot, destination } = createFixture(context);
  assert.throws(() => syncAndroidGoogleServices(fixtureRoot, {
    GOOGLE_SERVICES_JSON: './missing.json',
  }), { code: 'ENOENT' });
  assert.equal(JSON.parse(fs.readFileSync(destination, 'utf8')).project, 'existing');
});

test('iOS builds skip Android Firebase synchronization', (context) => {
  const { fixtureRoot, destination } = createFixture(context);
  assert.equal(syncAndroidGoogleServices(fixtureRoot, { EAS_BUILD_PLATFORM: 'ios' }), null);
  assert.equal(JSON.parse(fs.readFileSync(destination, 'utf8')).project, 'existing');
});

test('checked-in Android resources match the system UI and notification plugins', async () => {
  const config = loadAppConfig();
  const plugins = config.plugins.filter((plugin) => [
    'expo-system-ui', 'expo-notifications',
  ].includes(Array.isArray(plugin) ? plugin[0] : plugin));
  assert.equal(plugins.length, 2);
  const pluginConfig = withPlugins({
    ...config, plugins, _internal: { projectRoot },
  }, plugins);
  const evaluated = await compileModsAsync(pluginConfig, {
    projectRoot, platforms: ['android'], introspect: true,
  });
  const generated = evaluated._internal.modResults.android;
  const actualManifest = await AndroidConfig.Manifest.readAndroidManifestAsync(
    path.join(projectRoot, 'android/app/src/main/AndroidManifest.xml'),
  );
  const expectedMetadata = generated.manifest.manifest.application[0]['meta-data'];
  const actualMetadata = actualManifest.manifest.application[0]['meta-data'];
  for (const item of expectedMetadata.filter((entry) => entry.$['android:name'].includes('default_notification'))) {
    assert.deepEqual(actualMetadata.find((entry) => entry.$['android:name'] === item.$['android:name']), item);
  }
  for (const [filename, type, name] of [
    ['strings', 'string', 'expo_system_ui_user_interface_style'],
    ['colors', 'color', 'notification_icon_color'],
  ]) {
    const actual = await AndroidConfig.Resources.readResourcesXMLAsync({
      path: path.join(projectRoot, `android/app/src/main/res/values/${filename}.xml`),
    });
    const findResource = (xml) => xml.resources[type].find((item) => item.$.name === name);
    assert.deepEqual(findResource(actual), findResource(generated[filename]));
  }
});
