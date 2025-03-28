/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { LaunchOptions, BrowserContextOptions, Page, BrowserContext, Video, APIRequestContext, Tracing } from 'playwright-core';
import type { TestType, PlaywrightTestArgs, PlaywrightTestOptions, PlaywrightWorkerArgs, PlaywrightWorkerOptions, TestInfo, VideoMode, TraceMode } from '../types/test';
import { rootTestType } from './testType';
import { createGuid, debugMode } from 'playwright-core/lib/utils';
import { removeFolders } from 'playwright-core/lib/utils/fileUtils';
export { expect } from './expect';
export const _baseTest: TestType<{}, {}> = rootTestType.test;
export { addRunnerPlugin as _addRunnerPlugin } from './plugins';
import * as outOfProcess from 'playwright-core/lib/outofprocess';
import * as playwrightLibrary from 'playwright-core';
import type { TestInfoImpl } from './testInfo';

if ((process as any)['__pw_initiator__']) {
  const originalStackTraceLimit = Error.stackTraceLimit;
  Error.stackTraceLimit = 200;
  try {
    throw new Error('Requiring @playwright/test second time, \nFirst:\n' + (process as any)['__pw_initiator__'] + '\n\nSecond: ');
  } finally {
    Error.stackTraceLimit = originalStackTraceLimit;
  }
} else {
  (process as any)['__pw_initiator__'] = new Error().stack;
}

type TestFixtures = PlaywrightTestArgs & PlaywrightTestOptions & {
  _combinedContextOptions: BrowserContextOptions,
  _contextReuseEnabled: boolean,
  _reuseContext: boolean,
  _setupContextOptionsAndArtifacts: void;
  _contextFactory: (options?: BrowserContextOptions) => Promise<BrowserContext>;
};
type WorkerFixtures = PlaywrightWorkerArgs & PlaywrightWorkerOptions & {
  _browserOptions: LaunchOptions;
  _artifactsDir: () => string;
  _snapshotSuffix: string;
};

export const test = _baseTest.extend<TestFixtures, WorkerFixtures>({
  defaultBrowserType: ['chromium', { scope: 'worker', option: true }],
  browserName: [({ defaultBrowserType }, use) => use(defaultBrowserType), { scope: 'worker', option: true }],
  playwright: [async ({ }, use) => {
    if (process.env.PW_OUT_OF_PROCESS_DRIVER) {
      const impl = await outOfProcess.start({
        NODE_OPTIONS: undefined  // Hide driver process while debugging.
      });
      const pw = impl.playwright as any;
      pw._setSelectors(playwrightLibrary.selectors);
      await use(pw);
      await impl.stop();
    } else {
      await use(require('playwright-core'));
    }
  }, { scope: 'worker' }],
  headless: [({ launchOptions }, use) => use(launchOptions.headless ?? true), { scope: 'worker', option: true }],
  channel: [({ launchOptions }, use) => use(launchOptions.channel), { scope: 'worker', option: true }],
  launchOptions: [{}, { scope: 'worker', option: true }],
  connectOptions: [({}, use) => {
    const wsEndpoint = process.env.PW_TEST_CONNECT_WS_ENDPOINT;
    if (!wsEndpoint)
      return use(undefined);
    let headers = process.env.PW_TEST_CONNECT_HEADERS ? JSON.parse(process.env.PW_TEST_CONNECT_HEADERS) : undefined;
    if (process.env.PW_TEST_REUSE_CONTEXT) {
      headers = {
        ...headers,
        'x-playwright-reuse-context': '1',
      };
    }
    return use({
      wsEndpoint,
      headers
    });
  }, { scope: 'worker', option: true }],
  screenshot: ['off', { scope: 'worker', option: true }],
  video: ['off', { scope: 'worker', option: true }],
  trace: ['off', { scope: 'worker', option: true }],

  _artifactsDir: [async ({}, use, workerInfo) => {
    let dir: string | undefined;
    await use(() => {
      if (!dir) {
        dir = path.join(workerInfo.project.outputDir, '.playwright-artifacts-' + workerInfo.workerIndex);
        fs.mkdirSync(dir, { recursive: true });
      }
      return dir;
    });
    if (dir)
      await removeFolders([dir]);
  }, { scope: 'worker', _title: 'playwright configuration' } as any],

  _browserOptions: [async ({ playwright, headless, channel, launchOptions, connectOptions }, use) => {
    const options: LaunchOptions = {
      handleSIGINT: false,
      timeout: 0,
      ...launchOptions,
    };
    if (headless !== undefined)
      options.headless = headless;
    if (channel !== undefined)
      options.channel = channel;

    for (const browserType of [playwright.chromium, playwright.firefox, playwright.webkit]) {
      (browserType as any)._defaultLaunchOptions = options;
      (browserType as any)._defaultConnectOptions = connectOptions;
    }
    await use(options);
    for (const browserType of [playwright.chromium, playwright.firefox, playwright.webkit]) {
      (browserType as any)._defaultLaunchOptions = undefined;
      (browserType as any)._defaultConnectOptions = undefined;
    }
  }, { scope: 'worker', auto: true }],

  browser: [async ({ playwright, browserName }, use) => {
    if (!['chromium', 'firefox', 'webkit'].includes(browserName))
      throw new Error(`Unexpected browserName "${browserName}", must be one of "chromium", "firefox" or "webkit"`);
    const browser = await playwright[browserName].launch();
    await use(browser);
    await browser.close();
  }, { scope: 'worker', timeout: 0 }],

  acceptDownloads: [({ contextOptions }, use) => use(contextOptions.acceptDownloads ?? true), { option: true }],
  bypassCSP: [({ contextOptions }, use) => use(contextOptions.bypassCSP), { option: true }],
  colorScheme: [({ contextOptions }, use) => use(contextOptions.colorScheme), { option: true }],
  deviceScaleFactor: [({ contextOptions }, use) => use(contextOptions.deviceScaleFactor), { option: true }],
  extraHTTPHeaders: [({ contextOptions }, use) => use(contextOptions.extraHTTPHeaders), { option: true }],
  geolocation: [({ contextOptions }, use) => use(contextOptions.geolocation), { option: true }],
  hasTouch: [({ contextOptions }, use) => use(contextOptions.hasTouch), { option: true }],
  httpCredentials: [({ contextOptions }, use) => use(contextOptions.httpCredentials), { option: true }],
  ignoreHTTPSErrors: [({ contextOptions }, use) => use(contextOptions.ignoreHTTPSErrors), { option: true }],
  isMobile: [({ contextOptions }, use) => use(contextOptions.isMobile), { option: true }],
  javaScriptEnabled: [({ contextOptions }, use) => use(contextOptions.javaScriptEnabled ?? true), { option: true }],
  locale: [({ contextOptions }, use) => use(contextOptions.locale ?? 'en-US'), { option: true }],
  offline: [({ contextOptions }, use) => use(contextOptions.offline), { option: true }],
  permissions: [({ contextOptions }, use) => use(contextOptions.permissions), { option: true }],
  proxy: [({ contextOptions }, use) => use(contextOptions.proxy), { option: true }],
  storageState: [({ contextOptions }, use) => use(contextOptions.storageState), { option: true }],
  timezoneId: [({ contextOptions }, use) => use(contextOptions.timezoneId), { option: true }],
  userAgent: [({ contextOptions }, use) => use(contextOptions.userAgent), { option: true }],
  viewport: [({ contextOptions }, use) => use(contextOptions.viewport === undefined ? { width: 1280, height: 720 } : contextOptions.viewport), { option: true }],
  actionTimeout: [0, { option: true }],
  testIdAttribute: ['data-testid', { option: true }],
  navigationTimeout: [0, { option: true }],
  baseURL: [async ({ }, use) => {
    await use(process.env.PLAYWRIGHT_TEST_BASE_URL);
  }, { option: true }],
  serviceWorkers: [({ contextOptions }, use) => use(contextOptions.serviceWorkers ?? 'allow'), { option: true }],
  contextOptions: [{}, { option: true }],

  _combinedContextOptions: async ({
    acceptDownloads,
    bypassCSP,
    colorScheme,
    deviceScaleFactor,
    extraHTTPHeaders,
    hasTouch,
    geolocation,
    httpCredentials,
    ignoreHTTPSErrors,
    isMobile,
    javaScriptEnabled,
    locale,
    offline,
    permissions,
    proxy,
    storageState,
    viewport,
    timezoneId,
    userAgent,
    baseURL,
    contextOptions,
    serviceWorkers,
  }, use) => {
    const options: BrowserContextOptions = {};
    if (acceptDownloads !== undefined)
      options.acceptDownloads = acceptDownloads;
    if (bypassCSP !== undefined)
      options.bypassCSP = bypassCSP;
    if (colorScheme !== undefined)
      options.colorScheme = colorScheme;
    if (deviceScaleFactor !== undefined)
      options.deviceScaleFactor = deviceScaleFactor;
    if (extraHTTPHeaders !== undefined)
      options.extraHTTPHeaders = extraHTTPHeaders;
    if (geolocation !== undefined)
      options.geolocation = geolocation;
    if (hasTouch !== undefined)
      options.hasTouch = hasTouch;
    if (httpCredentials !== undefined)
      options.httpCredentials = httpCredentials;
    if (ignoreHTTPSErrors !== undefined)
      options.ignoreHTTPSErrors = ignoreHTTPSErrors;
    if (isMobile !== undefined)
      options.isMobile = isMobile;
    if (javaScriptEnabled !== undefined)
      options.javaScriptEnabled = javaScriptEnabled;
    if (locale !== undefined)
      options.locale = locale;
    if (offline !== undefined)
      options.offline = offline;
    if (permissions !== undefined)
      options.permissions = permissions;
    if (proxy !== undefined)
      options.proxy = proxy;
    if (storageState !== undefined)
      options.storageState = storageState;
    if (timezoneId !== undefined)
      options.timezoneId = timezoneId;
    if (userAgent !== undefined)
      options.userAgent = userAgent;
    if (viewport !== undefined)
      options.viewport = viewport;
    if (baseURL !== undefined)
      options.baseURL = baseURL;
    if (serviceWorkers !== undefined)
      options.serviceWorkers = serviceWorkers;
    await use({
      ...contextOptions,
      ...options,
    });
  },

  _snapshotSuffix: [process.platform, { scope: 'worker' }],

  _setupContextOptionsAndArtifacts: [async ({ playwright, _snapshotSuffix, _combinedContextOptions, _browserOptions, _artifactsDir, trace, screenshot, actionTimeout, navigationTimeout, testIdAttribute }, use, testInfo) => {
    if (testIdAttribute)
      playwrightLibrary.selectors.setTestIdAttribute(testIdAttribute);
    testInfo.snapshotSuffix = _snapshotSuffix;
    if (debugMode())
      testInfo.setTimeout(0);

    const traceMode = normalizeTraceMode(trace);
    const defaultTraceOptions = { screenshots: true, snapshots: true, sources: true };
    const traceOptions = typeof trace === 'string' ? defaultTraceOptions : { ...defaultTraceOptions, ...trace, mode: undefined };
    const captureTrace = shouldCaptureTrace(traceMode, testInfo);
    const temporaryTraceFiles: string[] = [];
    const temporaryScreenshots: string[] = [];
    const testInfoImpl = testInfo as TestInfoImpl;

    const createInstrumentationListener = (context?: BrowserContext) => {
      return {
        onApiCallBegin: (apiCall: string, stackTrace: ParsedStackTrace | null, userData: any) => {
          if (apiCall.startsWith('expect.'))
            return { userObject: null };
          if (apiCall === 'page.pause') {
            testInfo.setTimeout(0);
            context?.setDefaultNavigationTimeout(0);
            context?.setDefaultTimeout(0);
          }
          const step = testInfoImpl._addStep({
            location: stackTrace?.frames[0] as any,
            category: 'pw:api',
            title: apiCall,
            canHaveChildren: false,
            forceNoParent: false
          });
          userData.userObject = step;
        },
        onApiCallEnd: (userData: any, error?: Error) => {
          const step = userData.userObject;
          step?.complete({ error });
        },
      };
    };

    const startTracing = async (tracing: Tracing) => {
      if (captureTrace) {
        const title = [path.relative(testInfo.project.testDir, testInfo.file) + ':' + testInfo.line, ...testInfo.titlePath.slice(1)].join(' › ');
        if (!(tracing as any)[kTracingStarted]) {
          await tracing.start({ ...traceOptions, title });
          (tracing as any)[kTracingStarted] = true;
        } else {
          await tracing.startChunk({ title });
        }
      } else {
        if ((tracing as any)[kTracingStarted]) {
          (tracing as any)[kTracingStarted] = false;
          await tracing.stop();
        }
      }
    };

    const onDidCreateBrowserContext = async (context: BrowserContext) => {
      context.setDefaultTimeout(actionTimeout || 0);
      context.setDefaultNavigationTimeout(navigationTimeout || actionTimeout || 0);
      await startTracing(context.tracing);
      const listener = createInstrumentationListener(context);
      (context as any)._instrumentation.addListener(listener);
      (context.request as any)._instrumentation.addListener(listener);
    };
    const onDidCreateRequestContext = async (context: APIRequestContext) => {
      const tracing = (context as any)._tracing as Tracing;
      await startTracing(tracing);
      (context as any)._instrumentation.addListener(createInstrumentationListener());
    };

    const startedCollectingArtifacts = Symbol('startedCollectingArtifacts');

    const stopTracing = async (tracing: Tracing) => {
      (tracing as any)[startedCollectingArtifacts] = true;
      if (captureTrace) {
        // Export trace for now. We'll know whether we have to preserve it
        // after the test finishes.
        const tracePath = path.join(_artifactsDir(), createGuid() + '.zip');
        temporaryTraceFiles.push(tracePath);
        await tracing.stopChunk({ path: tracePath });
      }
    };

    const screenshottedSymbol = Symbol('screenshotted');
    const screenshotPage = async (page: Page) => {
      if ((page as any)[screenshottedSymbol])
        return;
      (page as any)[screenshottedSymbol] = true;
      const screenshotPath = path.join(_artifactsDir(), createGuid() + '.png');
      temporaryScreenshots.push(screenshotPath);
      // Pass caret=initial to avoid any evaluations that might slow down the screenshot
      // and let the page modify itself from the problematic state it had at the moment of failure.
      await page.screenshot({ timeout: 5000, path: screenshotPath, caret: 'initial' }).catch(() => {});
    };

    const screenshotOnTestFailure = async () => {
      const contexts: BrowserContext[] = [];
      for (const browserType of [playwright.chromium, playwright.firefox, playwright.webkit])
        contexts.push(...(browserType as any)._contexts);
      await Promise.all(contexts.map(ctx => Promise.all(ctx.pages().map(screenshotPage))));
    };

    const onWillCloseContext = async (context: BrowserContext) => {
      await stopTracing(context.tracing);
      if (screenshot === 'on' || screenshot === 'only-on-failure') {
        // Capture screenshot for now. We'll know whether we have to preserve them
        // after the test finishes.
        await Promise.all(context.pages().map(screenshotPage));
      }
    };

    const onWillCloseRequestContext =  async (context: APIRequestContext) => {
      const tracing = (context as any)._tracing as Tracing;
      await stopTracing(tracing);
    };

    // 1. Setup instrumentation and process existing contexts.
    for (const browserType of [playwright.chromium, playwright.firefox, playwright.webkit]) {
      (browserType as any)._onDidCreateContext = onDidCreateBrowserContext;
      (browserType as any)._onWillCloseContext = onWillCloseContext;
      (browserType as any)._defaultContextOptions = _combinedContextOptions;
      const existingContexts = Array.from((browserType as any)._contexts) as BrowserContext[];
      await Promise.all(existingContexts.map(onDidCreateBrowserContext));
    }
    {
      (playwright.request as any)._onDidCreateContext = onDidCreateRequestContext;
      (playwright.request as any)._onWillCloseContext = onWillCloseRequestContext;
      const existingApiRequests: APIRequestContext[] =  Array.from((playwright.request as any)._contexts as Set<APIRequestContext>);
      await Promise.all(existingApiRequests.map(onDidCreateRequestContext));
    }
    if (screenshot === 'on' || screenshot === 'only-on-failure')
      testInfoImpl._onTestFailureImmediateCallbacks.set(screenshotOnTestFailure, 'Screenshot on failure');

    // 2. Run the test.
    await use();

    // 3. Determine whether we need the artifacts.
    const testFailed = testInfo.status !== testInfo.expectedStatus;
    const preserveTrace = captureTrace && (traceMode === 'on' || (testFailed && traceMode === 'retain-on-failure') || (traceMode === 'on-first-retry' && testInfo.retry === 1));
    const captureScreenshots = (screenshot === 'on' || (screenshot === 'only-on-failure' && testFailed));

    const traceAttachments: string[] = [];
    const addTraceAttachment = () => {
      const tracePath = testInfo.outputPath(`trace${traceAttachments.length ? '-' + traceAttachments.length : ''}.zip`);
      traceAttachments.push(tracePath);
      testInfo.attachments.push({ name: 'trace', path: tracePath, contentType: 'application/zip' });
      return tracePath;
    };

    const screenshotAttachments: string[] = [];
    const addScreenshotAttachment = () => {
      const screenshotPath = testInfo.outputPath(`test-${testFailed ? 'failed' : 'finished'}-${screenshotAttachments.length + 1}.png`);
      screenshotAttachments.push(screenshotPath);
      testInfo.attachments.push({ name: 'screenshot', path: screenshotPath, contentType: 'image/png' });
      return screenshotPath;
    };

    // 4. Cleanup instrumentation.
    const leftoverContexts: BrowserContext[] = [];
    for (const browserType of [playwright.chromium, playwright.firefox, playwright.webkit]) {
      leftoverContexts.push(...(browserType as any)._contexts);
      (browserType as any)._onDidCreateContext = undefined;
      (browserType as any)._onWillCloseContext = undefined;
      (browserType as any)._defaultContextOptions = undefined;
    }
    leftoverContexts.forEach(context => (context as any)._instrumentation.removeAllListeners());
    for (const context of (playwright.request as any)._contexts)
      context._instrumentation.removeAllListeners();
    const leftoverApiRequests: APIRequestContext[] =  Array.from((playwright.request as any)._contexts as Set<APIRequestContext>);
    (playwright.request as any)._onDidCreateContext = undefined;
    (playwright.request as any)._onWillCloseContext = undefined;
    testInfoImpl._onTestFailureImmediateCallbacks.delete(screenshotOnTestFailure);

    const stopTraceChunk = async (tracing: Tracing): Promise<boolean> => {
      // When we timeout during context.close(), we might end up with context still alive
      // but artifacts being already collected. In this case, do not collect artifacts
      // for the second time.
      if ((tracing as any)[startedCollectingArtifacts])
        return false;
      if (preserveTrace)
        await tracing.stopChunk({ path: addTraceAttachment() });
      else if (captureTrace)
        await tracing.stopChunk();
      return true;
    };

    // 5. Collect artifacts from any non-closed contexts.
    await Promise.all(leftoverContexts.map(async context => {
      if (!await stopTraceChunk(context.tracing))
        return;
      if (captureScreenshots) {
        await Promise.all(context.pages().map(async page => {
          if ((page as any)[screenshottedSymbol])
            return;
          // Pass caret=initial to avoid any evaluations that might slow down the screenshot
          // and let the page modify itself from the problematic state it had at the moment of failure.
          await page.screenshot({ timeout: 5000, path: addScreenshotAttachment(), caret: 'initial' }).catch(() => {});
        }));
      }
    }).concat(leftoverApiRequests.map(async context => {
      const tracing = (context as any)._tracing as Tracing;
      await stopTraceChunk(tracing);
    })));

    // 6. Either remove or attach temporary traces and screenshots for contexts closed
    // before the test has finished.
    await Promise.all(temporaryTraceFiles.map(async file => {
      if (preserveTrace)
        await fs.promises.rename(file, addTraceAttachment()).catch(() => {});
      else
        await fs.promises.unlink(file).catch(() => {});
    }));
    await Promise.all(temporaryScreenshots.map(async file => {
      if (captureScreenshots)
        await fs.promises.rename(file, addScreenshotAttachment()).catch(() => {});
      else
        await fs.promises.unlink(file).catch(() => {});
    }));
  }, { auto: 'all-hooks-included',  _title: 'playwright configuration' } as any],

  _contextFactory: [async ({ browser, video, _artifactsDir }, use, testInfo) => {
    const videoMode = normalizeVideoMode(video);
    const captureVideo = shouldCaptureVideo(videoMode, testInfo);
    const contexts = new Map<BrowserContext, { pages: Page[] }>();

    await use(async options => {
      const hook = hookType(testInfo);
      if (hook) {
        throw new Error([
          `"context" and "page" fixtures are not supported in "${hook}" since they are created on a per-test basis.`,
          `If you would like to reuse a single page between tests, create context manually with browser.newContext(). See https://aka.ms/playwright/reuse-page for details.`,
          `If you would like to configure your page before each test, do that in beforeEach hook instead.`,
        ].join('\n'));
      }
      const videoOptions: BrowserContextOptions = captureVideo ? {
        recordVideo: {
          dir: _artifactsDir(),
          size: typeof video === 'string' ? undefined : video.size,
        }
      } : {};
      const context = await browser.newContext({ ...videoOptions, ...options });
      const contextData: { pages: Page[] } = { pages: [] };
      contexts.set(context, contextData);
      context.on('page', page => contextData.pages.push(page));
      return context;
    });

    const prependToError = (testInfo as any)._didTimeout ?
      formatPendingCalls((browser as any)._connection.pendingProtocolCalls()) : '';

    let counter = 0;
    await Promise.all([...contexts.keys()].map(async context => {
      await context.close();

      const testFailed = testInfo.status !== testInfo.expectedStatus;
      const preserveVideo = captureVideo && (videoMode === 'on' || (testFailed && videoMode === 'retain-on-failure') || (videoMode === 'on-first-retry' && testInfo.retry === 1));
      if (preserveVideo) {
        const { pages } = contexts.get(context)!;
        const videos = pages.map(p => p.video()).filter(Boolean) as Video[];
        await Promise.all(videos.map(async v => {
          try {
            const savedPath = testInfo.outputPath(`video${counter ? '-' + counter : ''}.webm`);
            ++counter;
            await v.saveAs(savedPath);
            testInfo.attachments.push({ name: 'video', path: savedPath, contentType: 'video/webm' });
          } catch (e) {
            // Silent catch empty videos.
          }
        }));
      }
    }));

    if (prependToError)
      testInfo.errors.push({ message: prependToError });
  }, { scope: 'test',  _title: 'context' } as any],

  _contextReuseEnabled: !!process.env.PW_TEST_REUSE_CONTEXT,

  _reuseContext: async ({ video, trace, _contextReuseEnabled }, use, testInfo) => {
    const reuse = _contextReuseEnabled && !shouldCaptureVideo(normalizeVideoMode(video), testInfo) && !shouldCaptureTrace(normalizeTraceMode(trace), testInfo);
    await use(reuse);
  },

  context: async ({ playwright, browser, _reuseContext, _contextFactory }, use, testInfo) => {
    if (!_reuseContext) {
      await use(await _contextFactory());
      return;
    }

    const defaultContextOptions = (playwright.chromium as any)._defaultContextOptions as BrowserContextOptions;
    const context = await (browser as any)._newContextForReuse(defaultContextOptions);
    await use(context);
  },

  page: async ({ context, _reuseContext }, use) => {
    if (!_reuseContext) {
      await use(await context.newPage());
      return;
    }

    // First time we are reusing the context, we should create the page.
    let [page] = context.pages();
    if (!page)
      page = await context.newPage();
    await use(page);
  },

  request: async ({ playwright, _combinedContextOptions }, use) => {
    const request = await playwright.request.newContext(_combinedContextOptions);
    await use(request);
    await request.dispose();
  }

});


function formatPendingCalls(calls: ParsedStackTrace[]) {
  calls = calls.filter(call => !!call.apiName);
  if (!calls.length)
    return '';
  return 'Pending operations:\n' + calls.map(call => {
    const frame = call.frames && call.frames[0] ? ' at ' + formatStackFrame(call.frames[0]) : '';
    return `  - ${call.apiName}${frame}\n`;
  }).join('');
}

function formatStackFrame(frame: StackFrame) {
  const file = path.relative(process.cwd(), frame.file) || path.basename(frame.file);
  return `${file}:${frame.line || 1}:${frame.column || 1}`;
}

function hookType(testInfo: TestInfo): 'beforeAll' | 'afterAll' | undefined {
  if ((testInfo as any)._timeoutManager._runnable?.type === 'beforeAll')
    return 'beforeAll';
  if ((testInfo as any)._timeoutManager._runnable?.type === 'afterAll')
    return 'afterAll';
}

type StackFrame = {
  file: string,
  line?: number,
  column?: number,
  function?: string,
};

type ParsedStackTrace = {
  frames: StackFrame[];
  frameTexts: string[];
  apiName: string;
};

export function normalizeVideoMode(video: VideoMode | 'retry-with-video' | { mode: VideoMode } | undefined): VideoMode {
  if (!video)
    return 'off';
  let videoMode = typeof video === 'string' ? video : video.mode;
  if (videoMode === 'retry-with-video')
    videoMode = 'on-first-retry';
  return videoMode;
}

export function shouldCaptureVideo(videoMode: VideoMode, testInfo: TestInfo) {
  return (videoMode === 'on' || videoMode === 'retain-on-failure' || (videoMode === 'on-first-retry' && testInfo.retry === 1));
}

export function normalizeTraceMode(trace: TraceMode | 'retry-with-trace' | { mode: TraceMode } | undefined): TraceMode {
  if (!trace)
    return 'off';
  let traceMode = typeof trace === 'string' ? trace : trace.mode;
  if (traceMode === 'retry-with-trace')
    traceMode = 'on-first-retry';
  return traceMode;
}

export function shouldCaptureTrace(traceMode: TraceMode, testInfo: TestInfo) {
  return traceMode === 'on' || traceMode === 'retain-on-failure' || (traceMode === 'on-first-retry' && testInfo.retry === 1);
}

const kTracingStarted = Symbol('kTracingStarted');

export default test;
