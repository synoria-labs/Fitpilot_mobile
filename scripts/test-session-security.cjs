const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const ts = require(require.resolve('typescript', { paths: [root] }));
const source = fs.readFileSync(path.join(root, 'src/services/api.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const storage = new Map();
let resolveRefresh, refreshStarted;
const started = new Promise((resolve) => { refreshStarted = resolve; });
class AxiosError extends Error {}
const axios = {
  AxiosError, isAxiosError: (error) => error instanceof AxiosError,
  post: () => { refreshStarted(); return new Promise((resolve) => { resolveRefresh = resolve; }); },
  create: () => {
    const instance = { interceptors: { request: { use() {} }, response: { use(_success, reject) { instance.rejectResponse = reject; } } }, request: async () => { throw new Error('Unexpected retry'); } };
    return instance;
  },
};
const secureStore = { getItemAsync: async (key) => storage.get(key) ?? null, setItemAsync: async (key,value) => { storage.set(key,value); }, deleteItemAsync: async (key) => { storage.delete(key); } };
const moduleObject = { exports: {} };
const mocks = {
  axios,
  'expo-secure-store': secureStore,
  'expo-constants': { expoConfig: { extra: { nutritionApiUrl: 'https://nutrition.example.invalid', trainingApiUrl: 'https://training.example.invalid' } } },
  '../store/connectivityStore': { useConnectivityStore: { getState: () => ({ isOnline: true, noteBackendReachable() {} }) } },
};
vm.runInNewContext(code, { module: moduleObject, exports: moduleObject.exports, require: (name) => { if (!(name in mocks)) throw new Error('Unmocked dependency '+name); return mocks[name]; }, process: { env: {} }, __DEV__: false, console, setTimeout, clearTimeout });
(async () => {
  const api = moduleObject.exports;
  await api.setSessionTokens({ accessToken: 'old-access', refreshToken: 'old-refresh' });
  const error = new AxiosError('Expired');
  error.response = { status: 401, data: {} };
  error.config = { headers: {}, url: '/test' };
  const request = api.nutritionApi.rejectResponse(error).catch(() => undefined);
  await started;
  await api.clearSessionTokens();
  resolveRefresh({ data: { access_token: 'late-access', refresh_token: 'late-refresh' } });
  await request;
  assert.equal(await api.getAccessToken(), null);
  assert.equal(await api.getRefreshToken(), null);
  assert.equal(storage.size, 0);
  console.log('PASS mobile session: a delayed refresh cannot restore credentials after logout.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
