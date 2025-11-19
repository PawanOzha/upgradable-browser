/**
 * YouTube Home Page Video Extractor
 *
 * A highly accurate tool for extracting videos from YouTube homepage with perfect POV synchronization.
 * This tool uses YouTube's stable semantic containers and handles mixed layouts (videos + reels shelves).
 *
 * Key Features:
 * - Detects and skips Reels/Shorts shelves (ytd-rich-shelf-renderer)
 * - Only extracts standalone videos (ytd-rich-item-renderer without is-shelf-item)
 * - Perfect user/AI POV synchronization
 * - Works across different viewport sizes
 * - Future-proof using YouTube's core Web Components
 *
 * @author Claude Code
 * @version 2.0.0
 * @date 2025-11-14
 */

export interface YouTubeVideo {
  index: number;
  title: string;
  href: string;
  duration: string | null;
  channel: string | null;
  thumbnail: string | null;
  isAd: boolean;
  selector: string;
  score: number;
}

export interface ExtractionResult {
  videos: YouTubeVideo[];
  totalFound: number;
  reelsSkipped: number;
  adsFiltered: number;
  timestamp: number;
}

/**
 * A* Algorithm Weights for Video Detection
 */
const WEIGHTS = {
  CONTAINER_RELIABILITY: 100,
  VISIBILITY: 50,
  METADATA_COMPLETENESS: 30,
  POSITION_PRIORITY: 20,
  AD_PENALTY: -1000,
};

/**
 * Calculate A* heuristic score for a video element
 */
function calculateScore(
  element: Element,
  rect: DOMRect,
  hasTitle: boolean,
  hasHref: boolean,
  hasDuration: boolean,
  hasChannel: boolean,
  isAd: boolean,
  isVisible: boolean,
  containerType: string
): number {
  let score = 0;

  // Container reliability
  if (containerType === 'ytd-rich-item-renderer') {
    score += WEIGHTS.CONTAINER_RELIABILITY;
  } else if (containerType === 'ytd-video-renderer') {
    score += WEIGHTS.CONTAINER_RELIABILITY * 0.95;
  } else if (containerType === 'ytd-grid-video-renderer') {
    score += WEIGHTS.CONTAINER_RELIABILITY * 0.9;
  }

  // Visibility
  if (isVisible) {
    score += WEIGHTS.VISIBILITY;
    if (rect.top >= 0 && rect.bottom <= window.innerHeight) {
      score += WEIGHTS.VISIBILITY * 0.5;
    }
  }

  // Metadata completeness
  let metadataScore = 0;
  if (hasTitle) metadataScore += 0.4;
  if (hasHref) metadataScore += 0.3;
  if (hasDuration) metadataScore += 0.2;
  if (hasChannel) metadataScore += 0.1;
  score += metadataScore * WEIGHTS.METADATA_COMPLETENESS;

  // Position priority
  const positionScore = 1 / (rect.top + 1 + rect.left * 0.1);
  score += positionScore * WEIGHTS.POSITION_PRIORITY;

  // Ad penalty
  if (isAd) {
    score += WEIGHTS.AD_PENALTY;
  }

  return score;
}

/**
 * Build a stable CSS selector for an element
 */
function buildStableSelector(element: Element): string {
  const path: string[] = [];
  let current: Element | null = element;
  let depth = 0;
  const maxDepth = 8;

  while (current && current.nodeType === 1 && depth < maxDepth) {
    if (current.id) {
      path.unshift(`#${CSS.escape(current.id)}`);
      break;
    }

    const testId = current.getAttribute('data-testid');
    if (testId) {
      path.unshift(`[data-testid="${testId}"]`);
      break;
    }

    let index = 0;
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === current.tagName) {
        index++;
      }
      sibling = sibling.previousElementSibling;
    }

    const tagName = current.tagName.toLowerCase();
    path.unshift(`${tagName}:nth-of-type(${index + 1})`);

    current = current.parentElement;
    depth++;
  }

  return path.join(' > ');
}

/**
 * Check if element is visible
 */
function isElementVisible(element: Element, rect: DOMRect): boolean {
  if (rect.width === 0 || rect.height === 0) {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.opacity === '0'
  ) {
    return false;
  }

  return true;
}

/**
 * Detect if element is an advertisement
 */
function isAdvertisement(element: Element, title: string | null): boolean {
  // Check for ad-specific renderers
  if (
    element.querySelector('ytd-display-ad-renderer') ||
    element.querySelector('ytd-promoted-sparkles-web-renderer') ||
    element.querySelector('ytd-compact-promoted-item-renderer') ||
    element.querySelector('[class*="ad-badge"]') ||
    element.querySelector('[class*="sponsored"]')
  ) {
    return true;
  }

  // Check for "Ad" or "Sponsored" text
  if (title) {
    const lowerTitle = title.toLowerCase();
    if (
      lowerTitle.includes('sponsored') ||
      lowerTitle.includes('ad ·') ||
      lowerTitle === 'ad'
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Extract all YouTube videos from homepage with perfect POV synchronization
 *
 * This function handles YouTube's mixed layout structure:
 * 1. Normal videos: <ytd-rich-item-renderer> (standalone)
 * 2. Reels shelf: <ytd-rich-shelf-renderer> containing <ytd-rich-item-renderer is-shelf-item>
 * 3. Other content: ads, playlists, etc.
 */
export function extractYouTubeHomeVideos(): ExtractionResult {
  const timestamp = Date.now();
  const videos: YouTubeVideo[] = [];
  let reelsSkipped = 0;
  let adsFiltered = 0;

  console.log('[YouTube Home Viewer] Starting extraction...');
  console.log('[YouTube Home Viewer] Current URL:', window.location.href);

  // Step 1: Find all REEL SHELF containers (horizontal scrolling Shorts sections)
  const reelShelves = document.querySelectorAll('ytd-rich-shelf-renderer, ytd-reel-shelf-renderer');
  console.log('[YouTube Home Viewer] 🎬 Found', reelShelves.length, 'REEL SHELF containers');

  // Step 2: Mark all ytd-rich-item-renderer INSIDE shelves as reels
  const reelElements = new Set<Element>();
  reelShelves.forEach(shelf => {
    const itemsInShelf = shelf.querySelectorAll('ytd-rich-item-renderer[is-shelf-item]');
    itemsInShelf.forEach(item => {
      reelElements.add(item);
      reelsSkipped++;
    });
    console.log('[YouTube Home Viewer] 🎬 Shelf contains', itemsInShelf.length, 'reel items');
  });

  // Step 3: Also mark standalone reel renderers
  const standaloneReels = document.querySelectorAll('ytd-reel-item-renderer, ytd-shorts-video-renderer, ytd-reel-video-renderer');
  standaloneReels.forEach(reel => {
    reelElements.add(reel);
    const parent = reel.closest('ytd-rich-item-renderer');
    if (parent) {
      reelElements.add(parent);
      reelsSkipped++;
    }
  });

  console.log('[YouTube Home Viewer] Total Reels to skip:', reelElements.size);

  // Step 4: Collect ONLY standalone video containers (NOT in shelves, NOT reels)
  const allContainers: { element: Element; type: string }[] = [];

  // Homepage videos: ytd-rich-item-renderer that are NOT in shelves
  const richItems = document.querySelectorAll('ytd-rich-item-renderer');
  let videoCount = 0;
  richItems.forEach(item => {
    // Skip if it's a reel (in our exclusion set)
    if (reelElements.has(item)) {
      return;
    }
    // Skip if it has the is-shelf-item attribute (reel indicator)
    if (item.hasAttribute('is-shelf-item')) {
      return;
    }
    // Skip if inside a shelf container
    if (item.closest('ytd-rich-shelf-renderer') || item.closest('ytd-reel-shelf-renderer')) {
      return;
    }
    // Skip if contains reel children
    if (item.querySelector('ytd-reel-item-renderer, ytd-reel-video-renderer, ytd-shorts-video-renderer')) {
      return;
    }
    allContainers.push({ element: item, type: 'ytd-rich-item-renderer' });
    videoCount++;
  });
  console.log('[YouTube Home Viewer] 📹 Found', videoCount, 'standalone VIDEO containers');

  // Step 5: Process each video container
  allContainers.forEach((container, idx) => {
    const element = container.element;
    const rect = element.getBoundingClientRect();

    // Get thumbnail
    const thumbnailEl = element.querySelector('img');

    // Try multiple selector patterns for title
    let titleEl = element.querySelector('#video-title');
    if (!titleEl) titleEl = element.querySelector('a#video-title-link');
    if (!titleEl) titleEl = element.querySelector('yt-formatted-string#video-title');
    if (!titleEl) titleEl = element.querySelector('[id*="video-title"]');

    const title = titleEl?.textContent?.trim() || titleEl?.getAttribute('title')?.trim() || null;

    // Try multiple selector patterns for link
    let linkEl = element.querySelector('a#thumbnail');
    if (!linkEl) linkEl = element.querySelector('a.yt-simple-endpoint');
    if (!linkEl) linkEl = element.querySelector('a[href*="/watch"]');
    if (!linkEl) linkEl = element.querySelector('ytd-thumbnail a');

    const href = linkEl?.getAttribute('href') || null;

    // Final safety check: if href contains "/shorts/", it's a Short (skip it)
    if (href && href.includes('/shorts/')) {
      console.log('[YouTube Home Viewer] 🎬 Skipping Short (URL contains /shorts/) at position', idx + 1);
      return;
    }

    // Additional check: skip if inside a reel container
    if (
      element.closest('ytd-reel-item-renderer') ||
      element.closest('ytd-shorts-video-renderer') ||
      element.closest('ytd-reel-video-renderer')
    ) {
      console.log('[YouTube Home Viewer] 🎬 Skipping - inside reel container at position', idx + 1);
      return;
    }

    // Try multiple selector patterns for duration
    let durationEl = element.querySelector('ytd-thumbnail-overlay-time-status-renderer span');
    if (!durationEl) durationEl = element.querySelector('.ytd-thumbnail-overlay-time-status-renderer');
    if (!durationEl) durationEl = element.querySelector('[class*="time-status"]');

    const duration = durationEl?.textContent?.trim() || null;

    // Try multiple selector patterns for channel
    let channelEl = element.querySelector('ytd-channel-name a');
    if (!channelEl) channelEl = element.querySelector('yt-formatted-string.ytd-channel-name');
    if (!channelEl) channelEl = element.querySelector('[class*="channel-name"]');

    const channel = channelEl?.textContent?.trim() || null;

    // Get thumbnail
    const thumbnail = thumbnailEl?.getAttribute('src') || null;

    const isVisible = isElementVisible(element, rect);
    const isAd = isAdvertisement(element, title);

    if (isAd) {
      adsFiltered++;
    }

    const selector = buildStableSelector(element);

    const score = calculateScore(
      element,
      rect,
      !!title,
      !!href,
      !!duration,
      !!channel,
      isAd,
      isVisible,
      container.type
    );

    // Debug log for first few valid videos
    if (videos.length < 5) {
      console.log('[YouTube Home Viewer] 📹 Video', videos.length + 1, ':', {
        type: container.type,
        title: title ? title.substring(0, 40) + '...' : 'NO TITLE',
        href: href ? href.substring(0, 50) + '...' : 'NO HREF',
        duration: duration || 'NO DURATION',
        channel: channel || 'NO CHANNEL',
        isAd: isAd,
        score: score.toFixed(2),
      });
    }

    // More lenient filtering - only require title OR href (not both)
    if (score > 0 && (title || href)) {
      videos.push({
        index: 0, // Will be set after sorting
        title: title || 'Untitled Video',
        href: href ? (href.startsWith('http') ? href : 'https://www.youtube.com' + href) : '#',
        duration,
        channel,
        thumbnail,
        isAd,
        selector,
        score,
      });
    }
  });

  // Sort by score and position
  videos.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Position-based sorting would need rect data
    return 0;
  });

  // Assign final indices
  videos.forEach((video, idx) => {
    video.index = idx + 1;
  });

  console.log('[YouTube Home Viewer] ✅ Extraction complete!');
  console.log('[YouTube Home Viewer] Videos extracted:', videos.length);
  console.log('[YouTube Home Viewer] Reels skipped:', reelsSkipped);
  console.log('[YouTube Home Viewer] Ads filtered:', adsFiltered);

  return {
    videos,
    totalFound: videos.length,
    reelsSkipped,
    adsFiltered,
    timestamp,
  };
}

/**
 * Highlight a specific video by index
 */
export function highlightVideo(index: number, videos: YouTubeVideo[]): boolean {
  // Remove any existing highlights
  const existingHighlights = document.querySelectorAll('[data-yt-highlight]');
  existingHighlights.forEach((el) => {
    (el as HTMLElement).style.outline = '';
    (el as HTMLElement).style.outlineOffset = '';
    (el as HTMLElement).style.boxShadow = '';
    (el as HTMLElement).style.transition = '';
    el.removeAttribute('data-yt-highlight');
  });

  // Find the video
  const video = videos.find((v) => v.index === index);
  if (!video) {
    console.error('[YouTube Home Viewer] Video', index, 'not found');
    return false;
  }

  // Find element by selector
  const element = document.querySelector(video.selector);
  if (!element) {
    console.error('[YouTube Home Viewer] Element not found for video', index);
    return false;
  }

  // Scroll to element
  element.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
    inline: 'center',
  });

  // Highlight after scroll
  setTimeout(() => {
    const el = element as HTMLElement;
    el.style.outline = '4px solid #f59e0b';
    el.style.outlineOffset = '-4px';
    el.style.boxShadow = '0 0 30px rgba(245, 158, 11, 0.8), 0 0 60px rgba(245, 158, 11, 0.4)';
    el.style.transition = 'all 0.3s ease-in-out';
    el.setAttribute('data-yt-highlight', 'true');

    console.log('[YouTube Home Viewer] Highlighted video', index, ':', video.title);
  }, 500);

  return true;
}

/**
 * Clear all highlights
 */
export function clearHighlights(): void {
  const existingHighlights = document.querySelectorAll('[data-yt-highlight]');
  existingHighlights.forEach((el) => {
    (el as HTMLElement).style.outline = '';
    (el as HTMLElement).style.outlineOffset = '';
    (el as HTMLElement).style.boxShadow = '';
    (el as HTMLElement).style.transition = '';
    el.removeAttribute('data-yt-highlight');
  });
  console.log('[YouTube Home Viewer] Cleared all highlights');
}

/**
 * Get video by index
 */
export function getVideoByIndex(index: number, videos: YouTubeVideo[]): YouTubeVideo | null {
  return videos.find((v) => v.index === index) || null;
}
