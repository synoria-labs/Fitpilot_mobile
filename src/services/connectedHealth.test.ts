import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FitpilotHealthPermissionStatus } from '../../modules/fitpilot-health';

const mocks = vi.hoisted(() => ({
  platform: { OS: 'android' },
  native: {
    requestPermissions: vi.fn(),
    getGrantedPermissions: vi.fn(),
    isAvailable: vi.fn(),
    syncRange: vi.fn(),
  },
  post: vi.fn(),
}));

vi.mock('react-native', () => ({
  Platform: mocks.platform,
  AppState: { currentState: 'active' },
}));
vi.mock('../../modules/fitpilot-health', () => ({ default: mocks.native }));
vi.mock('./api', () => ({ nutritionClient: { post: mocks.post } }));

const granted: FitpilotHealthPermissionStatus = {
  platform: 'health_connect', granted: ['steps'], missing: [], requiresManualGrant: false,
};
const denied: FitpilotHealthPermissionStatus = {
  platform: 'health_connect', granted: [], missing: ['steps'], requiresManualGrant: false,
};
const pending = <T>() => new Promise<T>(() => undefined);

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.useFakeTimers();
  mocks.platform.OS = 'android';
  mocks.native.isAvailable.mockResolvedValue({ available: true, platform: 'health_connect' });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Android health permission recovery', () => {
  it('uses existing grants without opening another permission request', async () => {
    mocks.native.getGrantedPermissions.mockResolvedValue(granted);
    const { connectedHealthService } = await import('./connectedHealth');
    expect(await connectedHealthService.requestPermissions()).toEqual(granted);
    expect(mocks.native.requestPermissions).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shares one in-flight permission request', async () => {
    mocks.native.getGrantedPermissions.mockResolvedValue(denied);
    mocks.native.requestPermissions.mockResolvedValue(granted);
    const { connectedHealthService } = await import('./connectedHealth');
    const first = connectedHealthService.requestPermissions();
    const second = connectedHealthService.requestPermissions();
    expect(first).toBe(second);
    expect(await first).toEqual(granted);
    expect(mocks.native.requestPermissions).toHaveBeenCalledOnce();
  });

  it('recovers grants when Android applies them but never returns the activity result', async () => {
    mocks.native.getGrantedPermissions.mockResolvedValueOnce(denied).mockResolvedValueOnce(granted);
    mocks.native.requestPermissions.mockReturnValue(pending());
    const { connectedHealthService } = await import('./connectedHealth');
    const result = connectedHealthService.requestPermissions();
    const assertion = expect(result).resolves.toEqual(granted);
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
    expect(mocks.native.getGrantedPermissions).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps denied permissions denied after a native timeout', async () => {
    mocks.native.getGrantedPermissions.mockResolvedValue(denied);
    mocks.native.requestPermissions.mockReturnValue(pending());
    const { connectedHealthService } = await import('./connectedHealth');
    const result = connectedHealthService.requestPermissions();
    const assertion = expect(result).resolves.toEqual(denied);
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('releases a hung status check so the user can retry', async () => {
    mocks.native.getGrantedPermissions.mockReturnValueOnce(pending()).mockResolvedValue(granted);
    const { connectedHealthService } = await import('./connectedHealth');
    const assertion = expect(connectedHealthService.requestPermissions()).rejects.toThrow('Ahora no');
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
    expect(await connectedHealthService.requestPermissions()).toEqual(granted);
  });

  it('preserves native errors without replacing them with a permission result', async () => {
    const error = new Error('Native activity is unavailable');
    mocks.native.getGrantedPermissions.mockResolvedValue(denied);
    mocks.native.requestPermissions.mockRejectedValue(error);
    const { connectedHealthService } = await import('./connectedHealth');
    await expect(connectedHealthService.requestPermissions()).rejects.toBe(error);
    expect(mocks.native.getGrantedPermissions).toHaveBeenCalledOnce();
  });

  it('leaves HealthKit authorization and its shared request unchanged', async () => {
    mocks.platform.OS = 'ios';
    let finish: (value: FitpilotHealthPermissionStatus) => void = () => undefined;
    mocks.native.requestPermissions.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const { connectedHealthService } = await import('./connectedHealth');
    const first = connectedHealthService.requestPermissions();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(connectedHealthService.requestPermissions()).toBe(first);
    expect(mocks.native.getGrantedPermissions).not.toHaveBeenCalled();
    expect(mocks.native.requestPermissions).toHaveBeenCalledOnce();
    finish({ ...granted, platform: 'healthkit' });
    await expect(first).resolves.toMatchObject({ platform: 'healthkit' });
  });
});

describe('Android health reading', () => {
  it('does not upload a late native result after timing out', async () => {
    let finish: (value: unknown) => void = () => undefined;
    mocks.native.syncRange.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const { connectedHealthService } = await import('./connectedHealth');
    const assertion = expect(connectedHealthService.sync()).rejects.toThrow('Ahora no');
    await vi.advanceTimersByTimeAsync(45_000);
    await assertion;
    finish({ permissions: ['steps'], records: [], daily_summaries: [] });
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.post).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uploads a successful native read and releases the timeout', async () => {
    const payload = { permissions: ['steps'], records: [], daily_summaries: [], metadata: { source: 'device' } };
    mocks.native.syncRange.mockResolvedValue(payload);
    mocks.post.mockResolvedValue({ status: 'completed' });
    const { connectedHealthService } = await import('./connectedHealth');
    expect(await connectedHealthService.sync()).toEqual({ status: 'completed' });
    expect(mocks.post).toHaveBeenCalledWith('/connected-health/sync', expect.objectContaining({
      ...payload,
      metadata: expect.objectContaining(payload.metadata),
    }));
    expect(vi.getTimerCount()).toBe(0);
  });
});
