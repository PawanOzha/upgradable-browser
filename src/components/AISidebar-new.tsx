/**
 * AISidebar - Main sidebar component
 *
 * Integrates ToolsSidebar which provides:
 * - YouTube Video Extractor
 * - SpaceMail Password Manager
 * - cPanel CRUD Operations (Create/Delete)
 */

import { WebViewRef } from '../types';
import ToolsSidebar from './ToolsSidebar';

interface AISidebarProps {
  isOpen: boolean;
  onClose: () => void;
  pageTitle: string;
  pageContent: string;
  currentURL: string;
  onExtractContent: () => void;
  webviewRef?: React.RefObject<WebViewRef>;
}

export default function AISidebar({ isOpen, onClose, webviewRef, currentURL }: AISidebarProps) {
  if (!isOpen || !webviewRef) return null;

  // Use ToolsSidebar which has YouTube, SpaceMail, and cPanel
  return <ToolsSidebar isOpen={isOpen} onClose={onClose} webviewRef={webviewRef} currentURL={currentURL} />;
}
