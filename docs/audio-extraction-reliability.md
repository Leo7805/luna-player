# Audio extraction reliability

## Findings and scope

The production asset `worker-BzJKLsK6.js` is the bundled `@ffmpeg/ffmpeg` package worker, not the FFmpeg Core script. The installed package creates a module Worker for every new instance. Its message handler rejects FFmpeg error messages, but does not register `Worker.onerror`; a failed worker script request can therefore leave `load()` unresolved. Core import and WASM errors normally return an error message, but loading resources can also wait indefinitely.

Previously, cancellation terminated the current Worker and discarded initialization state. A subsequent instance requested the Worker and Core/WASM URLs again. Vite emitted local, hashed assets, but the application did not retain those bytes; ordinary HTTP cache availability is not an offline guarantee. The Blob fallback retained only Core JavaScript, fetched it again, and still depended on the same network-loaded Worker and WASM. The initializing instance was not assigned to the service until `load()` finished, so service termination could miss it. An older attempt could also clear or replace newer initialization state.

A production Chromium control test reproduced the former direct-URL lifecycle with HTTP cache disabled: after a successful online initialization, the offline Worker request failed and `load()` remained pending until explicit termination. The fixed lifecycle passes real MP3 and WebM encoding under the same offline conditions. A canceled network entry alone does not establish the cause of the original Windows incident. The original file-21 stall remains unexplained: source handle resolution, WORKERFS synchronous reads, unlimited `exec()`, output reads, output filesystem writes, or cleanup may all wait. There is no runtime network operation inherent in an already-running encode.

## Implementation

- `src/services/ffmpegRuntime.ts`: `loadFfmpegRuntime()` lazily imports the package and Vite URL modules, fetches the bundled Worker, ESM Core, and WASM once, and retains Blob URLs for the page session. `finishFfmpegRuntimeLoad()` retains verified bytes and releases unverified bytes after an initialization failure. Failed downloads revoke partial URLs; cancellation aborts fetches. No CDN or Service Worker is used.
- `src/services/ffmpegService.ts`: `initialize()` shares one attempt and attaches cancellation. `loadInternal()` owns its Worker before loading, bounds imports/fetches/loading with a configurable 60-second timeout, terminates the affected Worker on failure/cancellation, and checks cancellation before publishing an instance. Identity checks prevent stale completion from clearing a newer attempt. `terminate()` cancels pending loading immediately. `runExtractionAttempt()` terminates its captured Worker on cancellation, cleans up that same instance, emits stage diagnostics, and limits retained FFmpeg log lines to 200.
- `src/services/audioExtractionService.ts`: `runBatchAudioExtraction()` returns cancellation even when a filesystem operation does not settle, suppresses detached progress, and prevents an abandoned task from initializing or terminating a newer engine. `BrowserOutputDirectoryWriter.writeFile()` observes cancellation, aborts an open writable stream, and only returns success after `close()`. Existing nonempty output detection and sequential processing remain intact.
- `playwright.config.ts`: uses isolated port 5193 with strict binding and no existing-server reuse, preventing an unrelated application on 5173 from silently being tested.
- Tests cover initialization sharing, failure cleanup, timeouts, cancellation races, retries, retained assets, restarting with 20 existing outputs, cancellation of stalled source reads, and aborting output writes. `tests/browser/ffmpeg.html` is a test-only production build entry; it is not included in the normal application build.

## Offline contract and recovery

After one successful initialization, Worker recreation and MP3/WebM extraction use retained Blob resources without network access, including with the browser HTTP cache disabled. Lazy JavaScript imports already evaluated in this page remain in the browser module map. Vite bundles the package Worker's static imports into one Worker asset. The single-threaded Core needs no extra thread Worker.

This guarantee lasts for the open page session. Hosting Content Security Policy must permit Blob Workers and Blob Core module loading. Reloading/closing the page or restarting the browser discards these resources; offline cold startup is outside scope. Retaining the approximately 32 MB WASM Blob increases page memory/storage backing. Successful resource URLs deliberately survive `terminate()` and are released by page teardown; partially loaded/unverified resources are explicitly revoked on failure.

Initialization timeout ends loading, terminates its Worker, resets state, and allows retry. Silent Worker syntax/load failures use the timeout because the package has no public Worker error hook. HTTP errors and Core/WASM error messages are reported with their actual details; an offline explanation is restricted to failed resource fetches while the browser reports offline.

Encoding has no automatic short timeout. A slow valid conversion is not skipped. Developers can enable DevTools Verbose logs and filter `[Audio extraction]` to see source reading, input preparation, encoding, output reading, output writing, and cleanup stages. Logs contain stage and numeric job/index only, not local file contents or filenames. Cancel terminates FFmpeg and releases the batch UI to retry. Browser filesystem operations cannot always be physically interrupted; late results are ignored and no later encode/write is started by the abandoned batch. Cancellation during an in-progress filesystem `close()` may still commit a valid complete output, which a restart will skip. A failed/aborted write is not recorded as completed.

## Windows and external-drive verification

1. Build with `npm run build`, serve `dist` with `npm run preview -- --host 127.0.0.1`, and open the printed URL in current Chrome or Edge on Windows. Do not open `dist/index.html` as a file URL.
2. Attach the external drive, click More opening options and choose Open Folder to select the source video folder, and choose an output folder on that drive. Use a disposable empty output folder and videos known to have audio.
3. Open DevTools, enable Preserve log and Disable cache in Network, and enable Verbose console messages. Start MP3 extraction online and let at least one output complete.
4. Disconnect internet or select Offline in DevTools while keeping the page open and the drive attached. Cancel the batch and select Start Again. Confirm saved outputs show Skipped and the remaining files finish without a network Worker/Core/WASM download. For the original 25-file scenario, cancel after 20 completed files and verify 20 Skipped plus five Completed after restarting.
5. Listen to several output files, inspect preserved subfolders, and verify saved files' modification times did not change on restart. Repeat in a fresh output folder using WebM.
6. To check cancellation during initialization, use a fresh page online, throttle Network, start extraction and cancel while Loading. Restore normal networking and retry. There must be no stale Loading state or old attempt taking over the retry.
7. To check offline-first failure, use a fresh page that has not initialized FFmpeg, switch offline, and start extraction. Expect an error or timeout, then reconnect and retry successfully. This is intentionally outside the offline guarantee.
8. If a particular source stalls, note the last stage log and elapsed time before canceling. Preserve the source and investigate drive sleep/disconnection, permissions, input corruption, browser memory, and codec behavior separately. Do not infer a network cause from the batch counter alone.

Automated browser tests exercise real Chromium Workers and real FFmpeg/WASM against a Vite production build with generated local PCM audio. They do not emulate Windows external-drive hardware.

## Validation results

- `npm test`: 158 tests passed across 18 files.
- `npm run build`: TypeScript and Vite production build passed.
- `git diff --check`: passed.
- Production browser verification: all five tests passed in real Chromium, including offline MP3/WebM encoding with HTTP caching disabled, Worker/Core/WASM failure recovery on the same page, and reproduction of the former unresolved offline Worker load.
- Full UI suite: 7 passed and 33 failed in the complete concurrent run (2.2 minutes). Of the failures, 31 wait for the obsolete `Open Video Folder` button, one expects a removed version label, and one expects the absent `scenic-background` test element (not present anywhere in the current source). No playback or UI source was changed. The initial run reused an unrelated Luna Music server on port 5173. The isolated rerun exposed pre-existing UI expectation drift: tests still select `Open Video Folder` and expect a header version label matching `v1.[01]`, while the current unchanged UI uses `Open Videos` and no such version label. These fail before FFmpeg initialization. The absent scenic background is another existing UI/test mismatch. The final complete run uses `npm run test:e2e -- --workers=8 --fully-parallel`; the FFmpeg tests remain a serial group sharing one preview server.
