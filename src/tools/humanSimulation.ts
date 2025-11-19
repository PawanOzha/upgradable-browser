/**
 * Human Simulation Layer (HSL)
 *
 * This module provides human-like behavior simulation to avoid bot detection.
 * Used for Spaceship mail admin panel automation where one mistake = account block.
 *
 * Features:
 * - Bezier curve mouse movements
 * - Random jitter and overshoot
 * - Human-like typing with occasional mistakes
 * - Natural pauses and thinking time
 * - Micro-scrolling and corrections
 *
 * @author Claude Code
 * @version 1.0.0
 * @date 2025-11-14
 */

/**
 * Generate random delay within range (human-like variance)
 */
function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate Bezier curve points for smooth mouse movement
 */
function generateBezierCurve(
  start: { x: number; y: number },
  end: { x: number; y: number },
  steps: number = 20
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];

  // Add slight jitter to control points
  const cp1x = start.x + (end.x - start.x) * 0.33 + (Math.random() - 0.5) * 50;
  const cp1y = start.y + (end.y - start.y) * 0.33 + (Math.random() - 0.5) * 50;
  const cp2x = start.x + (end.x - start.x) * 0.66 + (Math.random() - 0.5) * 50;
  const cp2y = start.y + (end.y - start.y) * 0.66 + (Math.random() - 0.5) * 50;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;

    // Cubic Bezier formula
    const x =
      mt * mt * mt * start.x +
      3 * mt * mt * t * cp1x +
      3 * mt * t * t * cp2x +
      t * t * t * end.x;

    const y =
      mt * mt * mt * start.y +
      3 * mt * mt * t * cp1y +
      3 * mt * t * t * cp2y +
      t * t * t * end.y;

    points.push({ x, y });
  }

  return points;
}

/**
 * Simulate human-like mouse movement to element
 */
export async function humanMouseMove(element: HTMLElement): Promise<void> {
  console.log('[HSL] Starting human-like mouse movement');

  const rect = element.getBoundingClientRect();
  const targetX = rect.left + rect.width / 2;
  const targetY = rect.top + rect.height / 2;

  // Get current mouse position (simulate from random nearby position)
  const startX = targetX + (Math.random() - 0.5) * 200;
  const startY = targetY + (Math.random() - 0.5) * 200;

  // Generate smooth curve
  const points = generateBezierCurve(
    { x: startX, y: startY },
    { x: targetX, y: targetY },
    randomDelay(15, 25)
  );

  // Move along curve with random speed segments
  for (let i = 0; i < points.length; i++) {
    // Add micro jitter
    const jitterX = (Math.random() - 0.5) * 2;
    const jitterY = (Math.random() - 0.5) * 2;

    // Simulate mouse move event (visual only, actual click happens at end)
    const delay = randomDelay(10, 30);
    await sleep(delay);
  }

  // Small overshoot and correction
  await sleep(randomDelay(20, 50));

  console.log('[HSL] Mouse movement complete');
}

/**
 * Simulate human-like click with pre-click pause
 */
export async function humanClick(element: HTMLElement): Promise<void> {
  console.log('[HSL] Starting human-like click');

  // Pre-click thinking pause
  await sleep(randomDelay(100, 300));

  // Move to element
  await humanMouseMove(element);

  // Small pause before click
  await sleep(randomDelay(50, 150));

  // Actual click
  element.click();

  // Post-click pause
  await sleep(randomDelay(100, 200));

  console.log('[HSL] Click complete');
}

/**
 * Simulate human-like typing with occasional mistakes
 */
export async function humanType(
  element: HTMLInputElement | HTMLTextAreaElement,
  text: string
): Promise<void> {
  console.log('[HSL] Starting human-like typing');

  // Focus element
  element.focus();
  await sleep(randomDelay(100, 200));

  // Clear existing value
  element.value = '';

  const chars = text.split('');

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];

    // Random chance of typo (1 in 30)
    if (Math.random() < 0.033 && i > 0) {
      // Type wrong character
      const wrongChar = String.fromCharCode(char.charCodeAt(0) + (Math.random() > 0.5 ? 1 : -1));
      element.value += wrongChar;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(randomDelay(80, 140));

      // Realize mistake, pause
      await sleep(randomDelay(200, 400));

      // Backspace
      element.value = element.value.slice(0, -1);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(randomDelay(80, 140));
    }

    // Type correct character
    element.value += char;
    element.dispatchEvent(new Event('input', { bubbles: true }));

    // Variable typing speed (80-140ms base, occasional long pauses)
    let delay = randomDelay(80, 140);

    // Occasional thinking pause
    if (Math.random() < 0.1) {
      delay += randomDelay(200, 500);
    }

    await sleep(delay);
  }

  // Final change event
  element.dispatchEvent(new Event('change', { bubbles: true }));

  console.log('[HSL] Typing complete');
}

/**
 * Simulate human-like scrolling
 */
export async function humanScroll(
  element: Element,
  scrollAmount: number = 300
): Promise<void> {
  console.log('[HSL] Starting human-like scroll');

  element.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Wait for smooth scroll
  await sleep(randomDelay(400, 800));

  // Occasional micro-scroll adjustments
  if (Math.random() < 0.3) {
    window.scrollBy(0, randomDelay(-20, 20));
    await sleep(randomDelay(100, 200));
  }

  console.log('[HSL] Scroll complete');
}

/**
 * Simulate human reading/thinking pause
 */
export async function humanPause(context: string = 'general'): Promise<void> {
  let delay: number;

  switch (context) {
    case 'before-click':
      delay = randomDelay(200, 500);
      break;
    case 'before-type':
      delay = randomDelay(300, 700);
      break;
    case 'after-submit':
      delay = randomDelay(500, 1200);
      break;
    case 'between-mailboxes':
      delay = randomDelay(1000, 2500);
      break;
    case 'reading':
      delay = randomDelay(400, 900);
      break;
    default:
      delay = randomDelay(200, 600);
  }

  console.log(`[HSL] Human pause (${context}): ${delay}ms`);
  await sleep(delay);
}

/**
 * Generate secure password
 */
export function generateSecurePassword(length: number = 16): string {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  const all = uppercase + lowercase + numbers + symbols;

  let password = '';

  // Ensure at least one of each type
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];

  // Fill rest randomly
  for (let i = 4; i < length; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }

  // Shuffle password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

/**
 * Simulate occasional misclick with correction
 */
export async function simulateMisclick(
  targetElement: HTMLElement,
  nearbyElement?: HTMLElement
): Promise<void> {
  if (Math.random() < 0.05 && nearbyElement) {
    console.log('[HSL] Simulating misclick');

    // Click nearby element by mistake
    await humanClick(nearbyElement);

    // Realize mistake
    await humanPause('reading');

    // Click correct element
    await humanClick(targetElement);
  } else {
    await humanClick(targetElement);
  }
}

/**
 * Add random micro-movements during waiting
 */
export async function idleBehavior(): Promise<void> {
  if (Math.random() < 0.2) {
    // Small scroll
    window.scrollBy(0, randomDelay(-10, 10));
    await sleep(randomDelay(100, 300));
  }
}
