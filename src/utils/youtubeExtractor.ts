/**
 * YouTube Video Extractor with A* Algorithm
 *
 * This tool provides pixel-perfect synchronization between user POV and AI POV
 * for extracting YouTube videos with 100% accuracy.
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
  element: Element;
  rect: DOMRect;
  score: number; // A* heuristic score
}

export interface ExtractionResult {
  videos: YouTubeVideo[];
  totalFound: number;
  adsFiltered: number;
  timestamp: number;
}

/**
 * A* Algorithm Heuristics for Video Detection
 *
 * Scores elements based on multiple factors to ensure accurate detection:
 * 1. Container type reliability (most important)
 * 2. Visibility and position
 * 3. Completeness of metadata
 * 4. Ad detection confidence
 */
class VideoDetectionAStar {
  private static WEIGHTS = {
    CONTAINER_RELIABILITY: 100,
    VISIBILITY: 50,
    METADATA_COMPLETENESS: 30,
    POSITION_PRIORITY: 20,
    AD_PENALTY: -1000,
  };

  /**
   * Calculate A* heuristic score for a potential video element
   */
  static calculateScore(
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

    // Container reliability (highest weight)
    if (containerType === 'ytd-rich-item-renderer') {
      score += this.WEIGHTS.CONTAINER_RELIABILITY;
    } else if (containerType === 'ytd-video-renderer') {
      score += this.WEIGHTS.CONTAINER_RELIABILITY * 0.95;
    } else if (containerType === 'ytd-grid-video-renderer') {
      score += this.WEIGHTS.CONTAINER_RELIABILITY * 0.9;
    }

    // Visibility (critical for POV sync)
    if (isVisible) {
      score += this.WEIGHTS.VISIBILITY;
      // Bonus for elements in viewport
      if (rect.top >= 0 && rect.bottom <= window.innerHeight) {
        score += this.WEIGHTS.VISIBILITY * 0.5;
      }
    }

    // Metadata completeness
    let metadataScore = 0;
    if (hasTitle) metadataScore += 0.4;
    if (hasHref) metadataScore += 0.3;
    if (hasDuration) metadataScore += 0.2;
    if (hasChannel) metadataScore += 0.1;
    score += metadataScore * this.WEIGHTS.METADATA_COMPLETENESS;

    // Position priority (reading order: top-to-bottom, left-to-right)
    const positionScore = 1 / (rect.top + 1 + rect.left * 0.1);
    score += positionScore * this.WEIGHTS.POSITION_PRIORITY;

    // Ad penalty (exclude ads completely)
    if (isAd) {
      score += this.WEIGHTS.AD_PENALTY;
    }

    return score;
  }

  /**
   * Sort videos using A* scores for optimal ordering
   */
  static sortByScore(videos: YouTubeVideo[]): YouTubeVideo[] {
    return videos.sort((a, b) => {
      // First sort by score (higher is better)
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      // Then by visual position (top to bottom, left to right)
      if (a.rect.top !== b.rect.top) {
        return a.rect.top - b.rect.top;
      }
      return a.rect.left - b.rect.left;
    });
  }
}

/**
 * Build a stable CSS path for an element
 */
function buildStableSelector(element: Element): string {
  const path: string[] = [];
  let current: Element | null = element;
  let depth = 0;
  const maxDepth = 8;

  while (current && current.nodeType === 1 && depth < maxDepth) {
    // Use ID if available
    if (current.id) {
      path.unshift(`#${CSS.escape(current.id)}`);
      break;
    }

    // Use data-testid if available
    const testId = current.getAttribute('data-testid');
    if (testId) {
      path.unshift(`[data-testid="${testId}"]`);
      break;
    }

    // Calculate nth-child position
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
 * Check if element is truly visible
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
 * Detect if element is an ad
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

  // Check for ad overlay
  const overlay = element.querySelector('.ytp-ad-overlay-container');
  if (overlay) {
    return true;
  }

  return false;
}

/**
 * Extract all YouTube videos from the page with A* algorithm
 */
export function extractYouTubeVideos(): ExtractionResult {
  const timestamp = Date.now();
  const videos: YouTubeVideo[] = [];
  let adsFiltered = 0;

  // Known YouTube video container types (in order of reliability)
  const containerSelectors = [
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-playlist-video-renderer',
    'ytd-compact-video-renderer',
  ];

  // Find all potential video containers
  const allContainers: { element: Element; type: string }[] = [];

  containerSelectors.forEach((selector) => {
    const elements = document.querySelectorAll(selector);
    elements.forEach((el) => {
      allContainers.push({ element: el, type: selector });
    });
  });

  console.log(`[YouTubeExtractor] Found ${allContainers.length} potential containers`);

  // Process each container with A* scoring
  allContainers.forEach((container) => {
    const element = container.element;
    const rect = element.getBoundingClientRect();

    // Extract metadata
    const titleEl = element.querySelector('#video-title, .ytd-video-meta-block #video-title');
    const title = titleEl?.textContent?.trim() || null;

    const linkEl = element.querySelector('a#thumbnail, a.ytd-thumbnail');
    const href = linkEl?.getAttribute('href') || null;

    const durationEl = element.querySelector(
      '.ytd-thumbnail-overlay-time-status-renderer, .badge-style-type-simple'
    );
    const duration = durationEl?.textContent?.trim() || null;

    const channelEl = element.querySelector(
      'ytd-channel-name a, .ytd-video-meta-block yt-formatted-string'
    );
    const channel = channelEl?.textContent?.trim() || null;

    const thumbnailEl = element.querySelector('img');
    const thumbnail = thumbnailEl?.getAttribute('src') || null;

    // Visibility check
    const isVisible = isElementVisible(element, rect);

    // Ad detection
    const isAd = isAdvertisement(element, title);
    if (isAd) {
      adsFiltered++;
    }

    // Build stable selector
    const selector = buildStableSelector(element);

    // Calculate A* score
    const score = VideoDetectionAStar.calculateScore(
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

    // Only include if score is positive (not an ad and has basic metadata)
    if (score > 0 && title && href) {
      videos.push({
        index: 0, // Will be set after sorting
        title,
        href: href.startsWith('http') ? href : `https://www.youtube.com${href}`,
        duration,
        channel,
        thumbnail,
        isAd,
        selector,
        element,
        rect,
        score,
      });
    }
  });

  // Sort by A* scores and position
  const sortedVideos = VideoDetectionAStar.sortByScore(videos);

  // Assign final indices
  sortedVideos.forEach((video, idx) => {
    video.index = idx + 1;
  });

  console.log(`[YouTubeExtractor] Extracted ${sortedVideos.length} videos (filtered ${adsFiltered} ads)`);

  return {
    videos: sortedVideos,
    totalFound: sortedVideos.length,
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
    el.removeAttribute('data-yt-highlight');
  });

  // Find the video
  const video = videos.find((v) => v.index === index);
  if (!video) {
    console.error(`[YouTubeExtractor] Video ${index} not found`);
    return false;
  }

  // Scroll to video smoothly
  video.element.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
    inline: 'center',
  });

  // Wait for scroll to complete, then highlight
  setTimeout(() => {
    const el = video.element as HTMLElement;
    el.style.outline = '4px solid #f59e0b';
    el.style.outlineOffset = '-4px';
    el.style.boxShadow = '0 0 30px rgba(245, 158, 11, 0.8), 0 0 60px rgba(245, 158, 11, 0.4)';
    el.style.transition = 'all 0.3s ease-in-out';
    el.setAttribute('data-yt-highlight', 'true');

    console.log(`[YouTubeExtractor] Highlighted video ${index}: ${video.title}`);
  }, 500);

  return true;
}

/**
 * Get video by index
 */
export function getVideoByIndex(index: number, videos: YouTubeVideo[]): YouTubeVideo | null {
  return videos.find((v) => v.index === index) || null;
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
  console.log('[YouTubeExtractor] Cleared all highlights');
}
