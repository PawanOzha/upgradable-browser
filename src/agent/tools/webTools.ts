import { AgentTool, ToolContext } from '../types';
import { registerTool } from '../toolRegistry';

const ok = (output?: any) => ({ success: true, output });
const fail = (error: string) => ({ success: false, error });

export const navigateTool: AgentTool = {
  name: 'navigate',
  description: 'Navigate the browser to a given URL. Use full absolute URLs (https://...).',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Absolute URL to open' },
    },
    required: ['url'],
    additionalProperties: false,
  },
  async execute(ctx: ToolContext, args: { url: string }) {
    const url = String(args?.url || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) return fail('Invalid url');
    ctx.log(`Opening URL: ${url}`);
    try {
      ctx.webview.loadURL(url);
      await new Promise((r) => setTimeout(r, 1500));
      return ok({ url });
    } catch (e: any) {
      return fail(e?.message || 'Navigation failed');
    }
  },
};

export const findTextTool: AgentTool = {
  name: 'find_text',
  description: 'Find visible text on the page (Ctrl+F style). Scroll to the first match.',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text to find' },
    },
    required: ['text'],
    additionalProperties: false,
  },
  async execute(ctx: ToolContext, args: { text: string }) {
    const text = String(args?.text || '').trim();
    if (!text) return fail('Missing text');
    ctx.log(`Finding text: "${text}"`);
    try {
      ctx.webview.stopFindInPage('clearSelection');
      await new Promise((r) => setTimeout(r, 150));
      ctx.webview.findInPage(text, { forward: true, findNext: false });
      await new Promise((r) => setTimeout(r, 500));
      // Smooth scroll to match
      await ctx.webview.executeJavaScript(`(async function(){
        const searchText = ${JSON.stringify(text)};
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
          acceptNode: (node) => (node.textContent && node.textContent.toLowerCase().includes(searchText.toLowerCase()))
            ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
        });
        let first; let n;
        while(n = walker.nextNode()) {
          const el = n.parentElement;
          if (el && el.offsetParent !== null) { first = el; break; }
        }
        if (!first) return false;
        first.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(r => setTimeout(r, 600));
        return true;
      })()`);
      return ok({ text });
    } catch (e: any) {
      return fail(e?.message || 'Find failed');
    }
  },
};

export const clickTextTool: AgentTool = {
  name: 'click_text',
  description: 'Click the first clickable element that contains the given text (link or button).',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text to click' },
    },
    required: ['text'],
    additionalProperties: false,
  },
  async execute(ctx: ToolContext, args: { text: string }) {
    const text = String(args?.text || '').trim();
    if (!text) return fail('Missing text');
    ctx.log(`Clicking text: "${text}"`);
    try {
      const res = await ctx.webview.executeJavaScript(`(async function(){
        const targetText = ${JSON.stringify(text)}.toLowerCase();
        const els = Array.from(document.querySelectorAll('*'));
        function isClickable(el){
          return el.tagName==='A' || el.tagName==='BUTTON' || el.onclick ||
                 el.getAttribute('role')==='button' || el.getAttribute('role')==='link' ||
                 window.getComputedStyle(el).cursor==='pointer';
        }
        for (const el of els) {
          const raw = (el.textContent || '').trim();
          if (!raw) continue;
          const childText = Array.from(el.children).map(c=>c.textContent||'').join('');
          const own = raw.replace(childText,'').trim().toLowerCase();
          if (own.includes(targetText) && isClickable(el)) {
            el.scrollIntoView({ behavior:'smooth', block:'center'});
            await new Promise(r=>setTimeout(r, 300));
            el.click();
            return { clicked: true, text: raw.slice(0, 80) };
          }
        }
        return { clicked: false };
      })()`);
      if (res?.clicked) return ok({ clicked: true, text: res.text });
      return fail('No clickable match');
    } catch (e: any) {
      return fail(e?.message || 'Click failed');
    }
  },
};

export const typeTextTool: AgentTool = {
  name: 'type_text',
  description: 'Type text into the most likely input field (optionally by target hint: username/email/password).',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text to type' },
      target: { type: 'string', enum: ['username', 'email', 'password', 'any'], description: 'Target field hint' }
    },
    required: ['text'],
    additionalProperties: false,
  },
  async execute(ctx: ToolContext, args: { text: string; target?: string }) {
    const text = String(args?.text || '');
    const target = String(args?.target || 'any');
    if (!text) return fail('Missing text');
    ctx.log(`Typing into ${target} field`);
    try {
      const result = await ctx.webview.executeJavaScript(`(async function(){
        const target = ${JSON.stringify(target)};
        let input;
        if (target==='password') input = document.querySelector('input[type="password"]');
        if (!input && target==='email') input = document.querySelector('input[type="email"]');
        if (!input && (target==='username' || target==='email')) {
          const q = target==='username' ? 'user' : 'email';
          input = document.querySelector('input[name*="'+q+'" i], input[id*="'+q+'" i]');
        }
        if (!input) input = document.querySelector('input:not([type="hidden"]):not([type="submit"]), textarea');
        if (!input) return { ok:false, reason:'No input found' };
        input.scrollIntoView({ behavior:'smooth', block:'center'});
        await new Promise(r=>setTimeout(r, 250));
        input.focus(); input.click();
        input.value = ${JSON.stringify(text)};
        input.dispatchEvent(new Event('input', { bubbles:true }));
        input.dispatchEvent(new Event('change', { bubbles:true }));
        return { ok:true, name: input.name || input.id || input.type || 'input' };
      })()`);
      if (result?.ok) return ok({ field: result.name });
      return fail(result?.reason || 'Type failed');
    } catch (e: any) {
      return fail(e?.message || 'Type failed');
    }
  },
};

export const pressEnterTool: AgentTool = {
  name: 'press_enter',
  description: 'Press Enter on the focused element (often submits forms or searches).',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  async execute(ctx: ToolContext) {
    try {
      await ctx.webview.executeJavaScript(`(async function(){
        let t = document.activeElement || document.querySelector('input:focus, textarea:focus');
        if (!t) t = document.querySelector('input, textarea, button');
        if (!t) return false;
        t.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true}));
        t.dispatchEvent(new KeyboardEvent('keypress', {key:'Enter', bubbles:true}));
        t.dispatchEvent(new KeyboardEvent('keyup', {key:'Enter', bubbles:true}));
        return true;
      })()`);
      return ok();
    } catch (e: any) {
      return fail(e?.message || 'Enter failed');
    }
  },
};

export const scrollTool: AgentTool = {
  name: 'scroll',
  description: 'Scroll the page by a number of pixels (positive is down, negative is up).',
  parameters: {
    type: 'object',
    properties: {
      amount: { type: 'number', description: 'Pixels to scroll (e.g., 600)' },
    },
    required: ['amount'],
    additionalProperties: false,
  },
  async execute(ctx: ToolContext, args: { amount: number }) {
    const amount = Number(args?.amount || 0);
    try {
      await ctx.webview.executeJavaScript(`(function(){
        window.scrollBy({ top: ${amount}, behavior: 'smooth' });
      })()`);
      await new Promise((r) => setTimeout(r, 500));
      return ok({ amount });
    } catch (e: any) {
      return fail(e?.message || 'Scroll failed');
    }
  },
};

export const waitMsTool: AgentTool = {
  name: 'wait_ms',
  description: 'Wait for a number of milliseconds (useful for page loads).',
  parameters: {
    type: 'object',
    properties: {
      ms: { type: 'number', description: 'Milliseconds to wait (e.g., 1000)' },
    },
    required: ['ms'],
    additionalProperties: false,
  },
  async execute(_ctx: ToolContext, args: { ms: number }) {
    const ms = Math.max(0, Number(args?.ms || 0));
    await new Promise((r) => setTimeout(r, ms));
    return ok({ waited: ms });
  },
};

export const extractLinksTool: AgentTool = {
  name: 'extract_links',
  description: 'Extract top links and headings from the page (for quick summaries).',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  async execute(ctx: ToolContext) {
    try {
      const data = await ctx.webview.executeJavaScript(`(function(){
        const results = [];
        const links = Array.from(document.querySelectorAll('a')).filter(a => a.href && a.textContent.trim())
          .slice(0, 10)
          .map(a => ({ title: a.textContent.trim(), url: a.href, type: 'link' }));
        const headings = Array.from(document.querySelectorAll('h1, h2, h3')).slice(0, 5)
          .map(h => ({ title: h.textContent.trim(), type: 'heading' }));
        return { links, headings };
      })()`);
      return ok(data);
    } catch (e: any) {
      return fail(e?.message || 'Extract failed');
    }
  },
};

// Register all tools on import
registerTool(navigateTool);
registerTool(findTextTool);
registerTool(clickTextTool);
registerTool(typeTextTool);
registerTool(pressEnterTool);
registerTool(scrollTool);
registerTool(waitMsTool);
registerTool(extractLinksTool);


