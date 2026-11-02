import { test, expect } from '@playwright/test';
import { loadFixtureDirectory, installDirectoryPickerMock, SAMPLE_LIBRARY_PATH } from './helpers/mockDirectory';

test.describe('Video Playback & Continuous Flow', () => {
  const fixtureFiles = loadFixtureDirectory(SAMPLE_LIBRARY_PATH);

  test.beforeEach(async ({ page }) => {
    await installDirectoryPickerMock(page, 'Sample Library', fixtureFiles);
    await page.goto('/');
    await page.getByRole('button', { name: /open video folder/i }).click();
    await expect(page.locator('header')).toContainText('Sample Library');
  });

  test('Test A: clicking an episode in the playlist loads and immediately begins real playback', async ({ page }) => {
    const video = page.locator('video');

    // Click Season 1/Episode 1 in playlist
    const ep1Btn = page.getByRole('button', { name: /Episode 1\.mp4/i }).first();
    await ep1Btn.click();

    // Verify video loads and automatically begins playing (paused === false)
    await expect.poll(async () => {
      return await video.evaluate((el: HTMLVideoElement) => !el.paused && el.currentTime > 0);
    }, { timeout: 7000 }).toBe(true);

    // Verify playback position actually advances over time without calling video.play()
    const time1 = await video.evaluate((el: HTMLVideoElement) => el.currentTime);
    await page.waitForTimeout(400);
    const time2 = await video.evaluate((el: HTMLVideoElement) => el.currentTime);
    expect(time2).toBeGreaterThan(time1);
  });

  test('Test B: autoplay-next seamlessly starts playback on the next episode', async ({ page }) => {
    const video = page.locator('video');

    // Start by selecting Season 1/Episode 1
    const ep1Btn = page.getByRole('button', { name: /Episode 1\.mp4/i }).first();
    await ep1Btn.click();

    // Wait until Episode 1 is playing
    await expect.poll(async () => {
      return await video.evaluate((el: HTMLVideoElement) => !el.paused && el.duration > 0);
    }, { timeout: 6000 }).toBe(true);

    // Fast-forward near end so it reaches 'ended' event naturally
    await video.evaluate((el: HTMLVideoElement) => {
      el.currentTime = el.duration - 0.15;
    });

    // Verify it automatically transitions to Season 1/Episode 2 ("4 of 7")
    await expect(page.getByText('4 of 7')).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole('heading', { level: 2, name: 'Episode 2.mp4' })).toBeVisible();

    // Assert that Episode 2 is actually playing and advancing
    await expect.poll(async () => {
      return await video.evaluate((el: HTMLVideoElement) => !el.paused && el.currentTime > 0);
    }, { timeout: 7000 }).toBe(true);

    const time1 = await video.evaluate((el: HTMLVideoElement) => el.currentTime);
    await page.waitForTimeout(400);
    const time2 = await video.evaluate((el: HTMLVideoElement) => el.currentTime);
    expect(time2).toBeGreaterThan(time1);
  });

  test('Test C: manual Next and Previous buttons load and immediately play', async ({ page }) => {
    const video = page.locator('video');

    // Select Season 1/Episode 1 (3 of 7)
    await page.getByRole('button', { name: /Episode 1\.mp4/i }).first().click();
    await expect(page.getByText('3 of 7')).toBeVisible();

    await expect.poll(async () => {
      return await video.evaluate((el: HTMLVideoElement) => !el.paused);
    }, { timeout: 6000 }).toBe(true);

    // Click Next button
    const nextBtn = page.getByTitle(/next video/i);
    await nextBtn.click();

    // Verify Episode 2 (4 of 7) is active and playing
    await expect(page.getByText('4 of 7')).toBeVisible();
    await expect.poll(async () => {
      return await video.evaluate((el: HTMLVideoElement) => !el.paused && el.currentTime > 0);
    }, { timeout: 6000 }).toBe(true);

    // Click Previous button
    const prevBtn = page.getByTitle(/previous video/i);
    await prevBtn.click();

    // Verify back to Episode 1 (3 of 7) and playing
    await expect(page.getByText('3 of 7')).toBeVisible();
    await expect.poll(async () => {
      return await video.evaluate((el: HTMLVideoElement) => !el.paused && el.currentTime > 0);
    }, { timeout: 6000 }).toBe(true);
  });

  test('Test D: Autoplay-next OFF stops playback at the end of the current video', async ({ page }) => {
    const video = page.locator('video');

    // Turn Autoplay-next OFF
    const autoplayToggle = page.getByRole('button', { name: /autoplay next/i });
    await autoplayToggle.click();

    // Select Episode 1 (3 of 7)
    await page.getByRole('button', { name: /Episode 1\.mp4/i }).first().click();
    await expect(page.getByText('3 of 7')).toBeVisible();

    await expect.poll(async () => {
      return await video.evaluate((el: HTMLVideoElement) => !el.paused && el.duration > 0);
    }, { timeout: 6000 }).toBe(true);

    // Fast-forward to end
    await video.evaluate((el: HTMLVideoElement) => {
      el.currentTime = el.duration - 0.1;
    });

    // Wait and verify it stays on 3 of 7 and pauses
    await page.waitForTimeout(1500);
    await expect(page.getByText('3 of 7')).toBeVisible();
    const isPaused = await video.evaluate((el: HTMLVideoElement) => el.paused);
    expect(isPaused).toBe(true);
  });

  test('Test E: final video ends without looping back to the first video', async ({ page }) => {
    const video = page.locator('video');

    // Select last video: Season 2/Episode 2.mp4 (7 of 7)
    const ep2Btn = page.getByRole('button', { name: /Episode 2\.mp4/i }).last();
    await ep2Btn.click();
    await expect(page.getByText('7 of 7')).toBeVisible();

    const nextBtn = page.getByTitle(/next video/i);
    await expect(nextBtn).toBeDisabled();

    await expect.poll(async () => {
      return await video.evaluate((el: HTMLVideoElement) => !el.paused && el.duration > 0);
    }, { timeout: 6000 }).toBe(true);

    // Fast-forward to end
    await video.evaluate((el: HTMLVideoElement) => {
      el.currentTime = el.duration - 0.1;
    });

    await page.waitForTimeout(1500);
    // Verify it stays at 7 of 7 and does not loop
    await expect(page.getByText('7 of 7')).toBeVisible();
    await expect(page.getByText('1 of 7')).not.toBeVisible();
    await expect(nextBtn).toBeDisabled();
  });

  test('Test F: progress restoration restores position and continues playback', async ({ page }) => {
    const video = page.locator('video');

    // Pre-save progress for Season 1/Episode 1.mp4 (relative path 'Season 1/Episode 1.mp4')
    await page.evaluate(() => {
      const storageKey = 'Sample Library::Season 1/Episode 1.mp4::3500::1700000000000';
      // Save 1.2 seconds watched out of 3 seconds
      localStorage.setItem(storageKey, JSON.stringify({
        currentTime: 1.2,
        duration: 3.0,
        completed: false,
        lastWatched: Date.now(),
      }));
    });

    // Select Episode 1 in playlist
    await page.getByRole('button', { name: /Episode 1\.mp4/i }).first().click();

    // Wait for playback and verify position resumed near 1.2s
    await expect.poll(async () => {
      return await video.evaluate((el: HTMLVideoElement) => !el.paused && el.currentTime >= 1.0);
    }, { timeout: 6000 }).toBe(true);

    const currentTime = await video.evaluate((el: HTMLVideoElement) => el.currentTime);
    expect(currentTime).toBeGreaterThanOrEqual(1.0);
  });

  test('Test G: rapid switching cancels earlier file loads and plays only the final selection', async ({ page }) => {
    const video = page.locator('video');

    const ep1 = page.getByRole('button', { name: /Episode 1\.mp4/i }).first();
    const ep2 = page.getByRole('button', { name: /Episode 2\.mp4/i }).first();
    const ep10 = page.getByRole('button', { name: /Episode 10\.mp4/i }).first();

    // Rapidly click Episode 1 -> Episode 2 -> Episode 10
    await ep1.click();
    await ep2.click();
    await ep10.click();

    // Verify Episode 10 (5 of 7) is the active video
    await expect(page.getByText('5 of 7')).toBeVisible({ timeout: 6000 });
    await expect(page.getByRole('heading', { level: 2, name: 'Episode 10.mp4' })).toBeVisible();

    // Verify it begins playing
    await expect.poll(async () => {
      return await video.evaluate((el: HTMLVideoElement) => !el.paused && el.currentTime > 0);
    }, { timeout: 6000 }).toBe(true);
  });

  test('Test H: handles browser autoplay rejection with visible Click to Play overlay', async ({ page }) => {
    // Intercept video.play to simulate browser NotAllowedError until user clicks
    await page.evaluate(() => {
      let isBlocked = true;
      const originalPlay = HTMLMediaElement.prototype.play;
      (window as any).__unblockPlay = () => {
        isBlocked = false;
      };
      (HTMLMediaElement.prototype as any).play = function() {
        if (isBlocked) {
          return Promise.reject(new DOMException('play() failed because the user didn\'t interact with the document first.', 'NotAllowedError'));
        }
        return originalPlay.call(this);
      };
    });

    // Click Episode 1 in playlist
    await page.getByRole('button', { name: /Episode 1\.mp4/i }).first().click();

    // Verify Click to Play overlay is displayed
    const clickToPlayBtn = page.getByRole('button', { name: /click to play/i });
    await expect(clickToPlayBtn).toBeVisible({ timeout: 6000 });
    await expect(page.getByText(/browser blocked automatic playback/i)).toBeVisible();

    // User gesture unblocks policy and retries playback
    await page.evaluate(() => {
      (window as any).__unblockPlay();
    });
    await clickToPlayBtn.click();

    // Verify overlay disappears and video begins playing
    await expect(clickToPlayBtn).not.toBeVisible();
    const video = page.locator('video');
    await expect.poll(async () => {
      return await video.evaluate((el: HTMLVideoElement) => !el.paused);
    }, { timeout: 6000 }).toBe(true);
  });

  test('Test J: clicking the currently selected paused video resumes playback', async ({ page }) => {
    const video = page.locator('video');

    // Click Episode 1 in playlist to start playing
    const ep1Btn = page.getByRole('button', { name: /Episode 1\.mp4/i }).first();
    await ep1Btn.click();

    await expect.poll(async () => {
      return await video.evaluate((el: HTMLVideoElement) => !el.paused && el.currentTime > 0);
    }, { timeout: 6000 }).toBe(true);

    // Pause the video
    await video.evaluate((el: HTMLVideoElement) => el.pause());
    await expect.poll(async () => {
      return await video.evaluate((el: HTMLVideoElement) => el.paused);
    }).toBe(true);

    // Click the currently active Episode 1 button in the playlist again
    await ep1Btn.click();

    // Verify playback resumes immediately without needing a second click
    await expect.poll(async () => {
      return await video.evaluate((el: HTMLVideoElement) => !el.paused);
    }, { timeout: 6000 }).toBe(true);
  });
});
