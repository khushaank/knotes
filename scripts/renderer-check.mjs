import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { marked } from 'marked';
import createDOMPurify from 'dompurify';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://knotes.dpdns.org/pulse/'
});

globalThis.document = dom.window.document;
globalThis.DOMParser = dom.window.DOMParser;
globalThis.window = dom.window;
globalThis.marked = marked;
globalThis.DOMPurify = createDOMPurify(dom.window);

const rendererSource = await readFile(new URL('../assets/js/contentRenderer.js', import.meta.url), 'utf8');
const rendererUrl = `data:text/javascript;base64,${Buffer.from(rendererSource).toString('base64')}`;
const { renderMarkdown } = await import(rendererUrl);

const rendered = renderMarkdown(`# Renderer test

This has **bold**, *italic*, and \`inline code\`.

> A safe quote.

- one
- two

![Landscape](https://images.unsplash.com/photo-test)

https://youtu.be/dQw4w9WgXcQ

<iframe src="https://evil.example/embed"></iframe>

<script>globalThis.compromised = true;</script>

[unsafe](javascript:alert(1))`);

const parsed = new JSDOM(`<main>${rendered}</main>`).window.document;
const youtube = parsed.querySelector('iframe');
const image = parsed.querySelector('img');
const unsafeLink = [...parsed.querySelectorAll('a')].find(link => link.textContent === 'unsafe');

assert.equal(parsed.querySelectorAll('h1').length, 1, 'heading should render');
assert.equal(parsed.querySelectorAll('strong').length, 1, 'bold text should render');
assert.equal(parsed.querySelectorAll('blockquote').length, 1, 'blockquote should render');
assert.equal(parsed.querySelectorAll('ul > li').length, 2, 'list should render');
assert.equal(parsed.querySelectorAll('script').length, 0, 'scripts must be removed');
assert.equal(parsed.querySelectorAll('iframe').length, 1, 'untrusted iframes must be removed');
assert.match(youtube?.getAttribute('src') || '', /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ$/);
assert.equal(youtube?.getAttribute('sandbox'), 'allow-scripts allow-same-origin allow-presentation');
assert.equal(image?.getAttribute('loading'), 'lazy');
assert.equal(image?.getAttribute('decoding'), 'async');
assert.equal(unsafeLink?.hasAttribute('href'), false, 'unsafe link protocol must be removed');

console.log('Renderer checks passed (Markdown, image, YouTube, and XSS hardening).');
