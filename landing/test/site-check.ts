import { app, BrowserWindow } from 'electron';
import assert from 'node:assert/strict';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, extname, join } from 'node:path';
import { instrumentIds, themeIds, instruments } from '../src/shared/model';

void (async () => {
app.setPath('userData', resolve('.artifacts/browser-profile'));
app.commandLine.appendSwitch('autoplay-policy', 'document-user-activation-required');
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.md': 'text/plain', '.txt': 'text/plain', '.dmg': 'application/x-apple-diskimage' };
let requests: string[] = [], failures: string[] = [];
let failSample = false;
const root = resolve('.');
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url!, 'http://localhost').pathname);
  requests.push(path);
  const relative = path.replace(/^\/nested\/tapkit\//, '/');
  const file = join(root, relative.endsWith('/') ? `${relative}index.html` : relative);
  try {
    assert.ok(file.startsWith(root + '/'));
    if (failSample && path.includes('sampler-') && path.endsWith('.wav')) throw new Error('Simulated offline request');
    const size = (await stat(file)).size;
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Content-Length': size });
    if (req.method === 'HEAD') res.end(); else res.end(await readFile(file));
  } catch { failures.push(path); res.writeHead(404); res.end('Not found'); }
});

await app.whenReady();
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address() as { port: number };
const url = `http://127.0.0.1:${address.port}/`;
await writeFile('.artifacts/probe.cjs', '\n    window.audioProbe = { contexts: [], starts: [] };\n    const NativeContext = window.AudioContext;\n    window.AudioContext = class extends NativeContext {\n      constructor(options) { super(options); window.audioProbe.contexts.push(this); }\n      createBufferSource() {\n        const source = super.createBufferSource(), start = source.start.bind(source);\n        source.start = (...args) => { window.audioProbe.starts.push({ at: this.currentTime, frames: source.buffer?.length, rate: source.playbackRate.value }); return start(...args); };\n        return source;\n      }\n    };');
const win = new BrowserWindow({ show: false, width: 1440, height: 600, webPreferences: { offscreen: true, contextIsolation: false, sandbox: true, preload: resolve('.artifacts/probe.cjs'), autoplayPolicy: 'document-user-activation-required' } });
win.webContents.setAudioMuted(true);
const errors: string[] = [];
win.webContents.on('console-message', event => { if (event.level === 'error' && !event.message.includes('404')) errors.push(event.message); });
const js = <T = any>(code: string, gesture = false): Promise<T> => win.webContents.executeJavaScript(code, gesture);
async function until(code: string, label: string) {
  const deadline = Date.now() + 18000;
  while (!await js(code)) { if (Date.now() > deadline) throw new Error(`Timed out: ${label}`); await wait(25); }
}
const ready = () => until('document.querySelector(".demo-stage").getAttribute("aria-busy") === "false"', 'demo ready');
const click = (selector: string) => js(`document.querySelector(${JSON.stringify(selector)}).click()`, true);
const key = (value: string, extra = {}) => js(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',${JSON.stringify({ key: value, bubbles: true, cancelable: true, ...extra })}))`, true);
const starts = () => js<number>('window.audioProbe.starts.length');
async function screenshot(name: string) {
  await wait(75);
  await writeFile(resolve(`.artifacts/${name}.png`), (await win.webContents.capturePage()).toPNG());
}

try {
  await mkdir('.artifacts', { recursive: true });
  console.log('Loading static site');
  await win.loadURL(url); console.log('Loaded; awaiting instruments'); await ready(); console.log('Initial instrument ready');
  assert.equal(await js('window.audioProbe.contexts[0].state'), 'suspended', 'no autoplay');
  assert.equal(await js('document.querySelectorAll(".instrument-option").length'), 10);
  assert.equal(await js('document.querySelectorAll(".theme-option").length'), 7);
  assert.ok(requests.filter(path => /\.(wav|mp3)$/.test(path)).every(path => path.includes('djembe-')), 'only initial instrument audio fetched');
  const downloadUrl = await js<string>('document.querySelector(".release-download").href');
  assert.ok(await js('document.querySelector(".playground").getBoundingClientRect().top >= innerHeight'), 'default instrument test starts with the playground below the viewport');
  await js('document.activeElement.blur()');
  const before = await starts(); await key('f'); await wait(40);
  assert.equal(await starts(), before + 1, 'first key plays the default instrument from the hero without clicking or scrolling');
  assert.equal(await js('window.audioProbe.contexts.at(-1).state'), 'running');
  assert.equal(await js('document.activeElement === document.body'), true, 'playing from the hero preserves page focus');
  console.log('Capturing hero'); await screenshot('desktop-hero'); console.log('Hero captured');
  await js('document.querySelector("#playground").scrollIntoView({behavior:"instant"})');
  await wait(50);
  await js('document.activeElement.blur()');
  assert.equal(await js('document.querySelectorAll(".sound-toggle, .hero-art, .ticker, .demo-note").length'), 0, 'removed collage and playback controls');
  assert.ok(await js('document.querySelector(".instrument-picker").getBoundingClientRect().bottom < document.querySelector(".demo-panel").getBoundingClientRect().top'), 'picker sits above the instrument');
  assert.ok(await js('document.querySelector(".instrument-option img").getBoundingClientRect().width >= 140'), 'larger instrument icons');

  await key('f', { repeat: true }); assert.equal(await starts(), before + 1, 'held keys do not repeat');
  await key('f', { metaKey: true }); assert.equal(await starts(), before + 1, 'command shortcuts remain free');
  await js('document.querySelector(".volume-control input").focus()');
  await key('f'); await wait(40); assert.equal(await starts(), before + 2, 'playing keys work with the volume slider focused');
  assert.equal(await js('document.activeElement === document.querySelector(".volume-control input")'), true, 'playing preserves slider focus');
  await js('const editor=document.createElement("input");editor.id="typing-check";document.body.append(editor);editor.focus()');
  await key('f'); assert.equal(await starts(), before + 2, 'text entry does not play notes');
  await js('document.querySelector("#typing-check").remove()');
  await js('window.scrollTo({top:document.documentElement.scrollHeight,behavior:"instant"}); document.activeElement.blur()');
  const scrollBefore = await js('scrollY');
  await wait(50); await key('f'); await wait(40); assert.equal(await starts(), before + 3, 'selected instrument keeps playing when scrolled to the footer');
  assert.equal(await js('scrollY'), scrollBefore, 'keyboard playing never scrolls back to the preview');
  await js('document.querySelector("#playground").scrollIntoView({behavior:"instant"})');
  await wait(50);

  let combinations = 0, voices = 0;
  for (const id of instrumentIds) {
    console.log(`Checking ${id}`);
    await click(`[data-instrument="${id}"]`); await ready();
    assert.equal(await js('document.querySelector(".demo-name").textContent'), instruments[id].name);
    await js('document.querySelector(".instrument-option[aria-pressed=true]").focus()');
    const selectedStarts = await starts();
    await key(instruments[id].voices[0].key.toLowerCase()); await wait(40);
    assert.equal(await starts(), selectedStarts + 1, `${id}: keys work immediately after selection without clicking the preview`);
    if (instruments[id].ranges) {
      for (const index of [0, instruments[id].ranges!.length - 1, instruments[id].defaultRange!]) {
        await js(`(() => { const select=document.querySelector('.range-control select'); select.value='${index}'; select.dispatchEvent(new Event('change')); })()`);
        assert.equal(await js('document.querySelector(".range-control select").value'), String(index));
        await js('document.querySelector(".range-control select").focus()');
        const registerStarts = await starts();
        await key(instruments[id].voices[0].key.toLowerCase()); await wait(40);
        assert.equal(await starts(), registerStarts + 1, `${id}: notes play while the register selector is focused`);
        assert.equal(await js('document.activeElement === document.querySelector(".range-control select")'), true, 'playing preserves register focus');
      }
    }
    const count = await js<number>('document.querySelectorAll(".guide-key").length');
    assert.equal(count, instruments[id].voices.length);
    for (const theme of themeIds) {
      await click(`.theme-option[data-theme="${theme}"]`);
      await until(`document.querySelector('.demo-host .instrument-body').getAttribute('src').includes('/${theme}-${id}')`, `${id} ${theme} artwork`);
      await js('new Promise(resolve => requestAnimationFrame(resolve))');
      const hands = await js<string[]>('[...document.querySelectorAll(".demo-host .hand img")].map(image=>image.src)');
      assert.equal(hands.every(src => src.includes('-cartoon.webp')), theme === 'cartoon', 'matching hands');
      for (let n = 0; n < count; n++) {
        const initial = await starts();
        await js(`document.querySelectorAll('.guide-key')[${n}].click()`, true);
        await until(`window.audioProbe.starts.length > ${initial}`, `${id} voice ${n} plays`);
        voices++;
      }
      combinations++;
    }
  }
  await click('[data-instrument="piano"]'); await ready();
  await click('.theme-option[data-theme="classic"]');
  await until("document.querySelector('.instrument-body').src.includes('classic-piano')", 'piano art');
  await screenshot('desktop-playground');
  // Note/register keys stay active without focus navigation; arrows cycle page-wide.
  await js('document.querySelector(".site-header a").focus()');
  await key('x');
  assert.equal(await js('document.querySelector(".range-control select").value'), '3');
  await key('ArrowRight'); await ready();
  assert.equal(await js('document.querySelector(".demo-name").textContent'), 'Handpan');
  await click('[data-instrument=djembe]'); await ready();
  await js('document.querySelector(".volume-control input").focus()');
  await key('ArrowLeft'); await ready();
  assert.equal(await js('document.querySelector(".instrument-option[aria-pressed=true]").dataset.instrument'), 'marimba', 'left wraps first to last, even from a slider');
  await key('ArrowRight'); await ready();
  assert.equal(await js('document.querySelector(".instrument-option[aria-pressed=true]").dataset.instrument'), 'djembe', 'right wraps last to first');
  await key('ArrowRight'); await key('ArrowRight'); await key('ArrowRight'); await ready();
  assert.equal(await js('document.querySelector(".instrument-option[aria-pressed=true]").dataset.instrument'), 'tambourine', 'rapid arrows advance through loading instruments');
  await key('ArrowLeft', { repeat: true }); await key('ArrowLeft', { metaKey: true });
  assert.equal(await js('document.querySelector(".instrument-option[aria-pressed=true]").dataset.instrument'), 'tambourine', 'held keys and browser shortcuts do not cycle');
  assert.equal(await js('[...document.querySelectorAll("a,button,input,select,summary,[tabindex]")].filter(element=>element.tabIndex>=0).length'), 0, 'no page or instrument Tab stops');
  await js('document.activeElement.blur()');
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' });
  await wait(40);
  assert.equal(await js('document.activeElement === document.body'), true, 'Tab does not select a control');
  const afterCycling = await starts();
  await key('f');
  await until(`window.audioProbe.starts.length > ${afterCycling}`, 'note playback after arrow cycling');
  await js('document.querySelector(".site-header a").focus()');
  for (const width of [360, 390, 648, 820, 1024, 1440]) {
    win.setContentSize(width, 1000); await wait(100);
    assert.ok(await js('document.documentElement.scrollWidth <= window.innerWidth'), `no overflow at ${width}`);
    await js('window.scrollTo({top:0,behavior:"instant"})'); await screenshot(`hero-${width}`);
    await js('document.querySelector("#playground").scrollIntoView({behavior:"instant"})'); await screenshot(`playground-${width}`);
    assert.ok(await js('document.querySelector(".demo-stage").clientWidth > 250'), `usable stage at ${width}`);
  }
  await click('[data-instrument=marimba]'); await ready();
  const nativeBefore = await starts();
  await js(`document.querySelector('.marimba-bar').dispatchEvent(new PointerEvent('pointerdown', { bubbles:true, cancelable:true, button:0 }))`, true);
  await until(`window.audioProbe.starts.length > ${nativeBefore}`, 'instrument pointer strike');
  assert.equal(await js('document.activeElement === document.querySelector(".demo-stage")'), false, 'pointer strikes do not focus the stage');
  // Reduced-motion visitors receive key flashes without motion animations.
  win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('DOM.enable');
  await win.webContents.debugger.sendCommand('CSS.enable');
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await wait(250); await click('.guide-key'); await wait(35);
  assert.equal(await js('document.querySelectorAll(".demo-host .pressed").length > 0'), true, 'reduced-motion feedback');
  assert.equal(await js('document.querySelector(".demo-host").getAnimations({subtree:true}).length'), 0, 'motion disabled');
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] });
  // Appearance follows the browser preference live, without changing instrument materials.
  const contrastSelectors = ['.site-header .wordmark', '.site-header nav a', '.hero .eyebrow', '.hero-description', '.hero .button', '.hero .text-link', '.section-heading>p', '.option-name', '.option-index', '.demo-name', '.demo-description', '.theme-name', '.demo-count', '.demo-badge', '.guide-key span', '.guide-key kbd', '.playing-help', '.volume-control', '.range-control select', '.step>p', '.step-number', '.music-lines>span', '.mini-menu>span', '.mini-menu small', '.big-key', '.feature-label>span', '.feature-link', '.feature-list p', '.all-styles', '.download-card>p', '.download-card .button', '.site-footer>span'];
  let minimumContrast = Infinity;
  const contrastFailures: string[] = [];
  for (const appearance of ['light', 'dark']) {
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: appearance }] });
    await until(`getComputedStyle(document.documentElement).colorScheme === '${appearance}'`, appearance + ' appearance');
    assert.equal(await js(`matchMedia('(prefers-color-scheme: ${appearance})').matches`), true);
    assert.equal(await js('getComputedStyle(document.documentElement).backgroundColor'), appearance === 'dark' ? 'rgb(23, 25, 31)' : 'rgb(248, 246, 239)');
    assert.equal(await js('document.querySelector(`meta[name="theme-color"][media="(prefers-color-scheme: '+appearance+')"]`).content'), appearance === 'dark' ? '#17191f' : '#f8f6ef');
    await click('[data-instrument=piano]'); await ready();
    const previousRegister = await js('document.querySelector(".range-control select").value');
    for (const selector of ['.instrument-option[aria-pressed=true]', '.theme-option[aria-pressed=true]', '.guide-key', '.volume-control input', '.range-control select', '.faq-list summary', '.hero-actions a']) {
      const focusStyles = await js(`(() => {const element=document.querySelector(${JSON.stringify(selector)});element.blur();const read=()=>{const style=getComputedStyle(element);return [style.outlineStyle,style.border,style.boxShadow];};const before=read();element.focus();return {before,after:read()};})()`);
      assert.deepEqual(focusStyles.after, focusStyles.before, `${appearance}: focus adds no border to ${selector}`);
      assert.equal(focusStyles.after[0], 'none');
    }
    const { root: documentNode } = await win.webContents.debugger.sendCommand('DOM.getDocument');
    const { nodeId: hoverNode } = await win.webContents.debugger.sendCommand('DOM.querySelector', { nodeId: documentNode.nodeId, selector: '.instrument-option[data-instrument=djembe]' });
    await win.webContents.debugger.sendCommand('CSS.forcePseudoState', { nodeId: hoverNode, forcedPseudoClasses: ['hover'] });
    await wait(200);
    const selectionStyles = await js(`['.instrument-option[data-instrument=djembe]', '.instrument-option[aria-pressed=true]'].map(selector=>{const style=getComputedStyle(document.querySelector(selector));return [style.backgroundColor,style.borderColor,style.borderWidth,style.boxShadow];})`);
    assert.deepEqual(selectionStyles[0], selectionStyles[1], `${appearance}: hover previews the exact selected fill and border`);
    await win.webContents.debugger.sendCommand('CSS.forcePseudoState', { nodeId: hoverNode, forcedPseudoClasses: [] });
    const previewTints = new Map<string, string>();
    for (const theme of themeIds) {
      await click(`.theme-option[data-theme="${theme}"]`);
      await until(`document.querySelector('.instrument-body').src.includes('${theme}-piano')`, 'appearance artwork');
      await js('Promise.all(document.querySelector(".demo-panel").getAnimations().map(animation=>animation.finished.catch(()=>{})))');
      const tint = await js(`(() => {
        const colour = (selector,property='color',pseudo=null)=>getComputedStyle(document.querySelector(selector),pseudo)[property];
        const hue = colour=>{const values=colour.match(/[0-9.]+/g).map(Number).slice(0,3),max=Math.max(...values),min=Math.min(...values),delta=max-min;if(delta<6)return null;const [r,g,b]=values;return ((max===r?(g-b)/delta:max===g?(b-r)/delta+2:(r-g)/delta+4)*60+360)%360;};
        const dot=colour('.demo-badge .status-dot','backgroundColor');
        return {dot,ring:colour('.theme-option[aria-pressed=true]','borderColor','::after'),secondary:colour('.demo-description'),count:colour('.demo-count'),hues:[dot,colour('.demo-panel','backgroundColor'),colour('.demo-panel','borderColor'),colour('.demo-description'),colour('.style-controls','borderTopColor')].map(hue)};
      })()`);
      assert.equal(tint.dot,tint.ring, `${appearance}/${theme}: selected theme ring follows the accent dot`);
      assert.equal(tint.secondary,tint.count);
      for (const hue of tint.hues) if (hue !== null && tint.hues[0] !== null) assert.ok(Math.min(Math.abs(hue-tint.hues[0]),360-Math.abs(hue-tint.hues[0]))<9, `${appearance}/${theme}: preview surfaces, borders, labels and divider share one material hue`);
      if(theme==='paper') assert.ok(tint.hues.every(hue=>hue===null),'Paper uses neutral grey tints');
      previewTints.set(theme,tint.secondary);
      assert.equal(await js('document.querySelector(".range-control select").value'), previousRegister);
      const contrast = await js<{selector: string; ratio: number}[]>(`(() => {
        const rgba = value => (value.match(/[0-9.]+/g) || []).map(Number);
        const blend = (top, bottom) => top.slice(0,3).map((channel,i) => channel*(top[3] ?? 1)+bottom[i]*(1-(top[3] ?? 1)));
        const luminance = colour => colour.slice(0,3).map(value=>{value/=255;return value<=.04045 ? value/12.92 : ((value+.055)/1.055)**2.4;}).reduce((sum,value,i)=>sum+value*[.2126,.7152,.0722][i],0);
        return ${JSON.stringify(contrastSelectors)}.flatMap(selector => [...document.querySelectorAll(selector)].filter(el=>el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden').map(el=>{
          let background=[255,255,255], opacity=1, path=[];
          for(let parent=el;parent;parent=parent.parentElement)path.unshift(parent);
          for(const parent of path){const style=getComputedStyle(parent);background=blend(rgba(style.backgroundColor),background);opacity*=Number(style.opacity);}
          const foreground=rgba(getComputedStyle(el).color);foreground[3]=(foreground[3] ?? 1)*opacity;
          const a=luminance(blend(foreground,background)),b=luminance(background);
          return {selector,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
        }));
      })()`);
      for (const result of contrast) { minimumContrast = Math.min(minimumContrast, result.ratio); if (result.ratio < 4.5) contrastFailures.push(`${appearance}/${theme} ${result.selector}: contrast ${result.ratio.toFixed(2)}`); }
    }
    assert.equal(new Set(previewTints.values()).size,7, `${appearance}: every material has its own secondary tint`);
    await click('.theme-option[data-theme=classic]');
    await until("document.querySelector('.instrument-body').src.includes('classic-piano')", 'classic artwork settled before appearance change');
    await js('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    const art = await js('document.querySelector(".instrument-body").src');
    const noteColour = await js('getComputedStyle(document.querySelector(".piano-key.white")).backgroundImage');
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: appearance === 'dark' ? 'light' : 'dark' }] });
    await wait(50);
    assert.equal(await js('document.querySelector(".instrument-body").src'), art, 'appearance changes preserve selected artwork');
    assert.equal(await js('getComputedStyle(document.querySelector(".piano-key.white")).backgroundImage'), noteColour, 'appearance changes preserve playable key material');
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: appearance }] });
    for (const width of [390, 820, 1440]) {
      win.setContentSize(width, 1000); await wait(80);
      assert.ok(await js('document.documentElement.scrollWidth <= innerWidth'), `${appearance} fits at ${width}`);
      await js('window.scrollTo({top:0,behavior:"instant"})'); await screenshot(`${appearance}-hero-${width}`);
      await js('document.querySelector(".demo-panel").scrollIntoView({behavior:"instant",block:"start"})'); await screenshot(`${appearance}-demo-${width}`);
    }
    for (const section of ['how-it-works', 'styles', 'download']) {
      await js(`document.getElementById('${section}').scrollIntoView({behavior:'instant',block:'start'})`); await screenshot(`${appearance}-${section}`);
    }
    await win.loadURL(`${url}credits.html`);
    assert.equal(await js('getComputedStyle(document.documentElement).colorScheme'), appearance);
    await js('window.scrollTo(0,0)'); await screenshot(`${appearance}-credits`);
    await win.loadURL(url); await ready();
    await js('document.querySelector("#playground").scrollIntoView({behavior:"instant"})');
  }
  assert.deepEqual(contrastFailures, [], 'page text has at least 4.5:1 contrast in both appearances');
  console.log('Appearance checks passed:', { appearances: ['light', 'dark'], minimumContrast });
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] });
  // A failed lazy sample load reports an error and supports retry.
  failSample = true;
  await click('[data-instrument="sampler"]');
  await until('document.querySelector(".demo-loading").textContent.includes("couldn’t load")', 'sample error');
  failSample = false;
  await click('[data-instrument="sampler"]'); await ready();
  // Superseded sample and artwork loads cannot overwrite the current selection.
  await js("document.querySelector('[data-instrument=piano]').click(); document.querySelector('[data-instrument=marimba]').click(); document.querySelector('[data-instrument=djembe]').click()", true);
  await ready();
  await js("document.querySelector('.theme-option[data-theme=gold]').click(); document.querySelector('.theme-option[data-theme=paper]').click(); document.querySelector('.theme-option[data-theme=cartoon]').click()");
  await until("document.querySelector('.instrument-body').src.includes('cartoon-djembe')", 'latest theme wins');
  // Verify all static links including the real local DMG.
  const links = await js<string[]>(`[...document.querySelectorAll('a[href],link[href],script[src]')].map(el=>el.href||el.src).filter(url=>url.startsWith(location.origin))`);
  for (const link of new Set(links)) assert.equal((await fetch(link, { method: 'HEAD' })).status, 200, link);
  const unexpectedFailures = failures.filter(path => !path.includes('sampler-'));
  assert.deepEqual(unexpectedFailures, [], 'no missing static assets');
  assert.deepEqual(errors, [], 'no browser errors');
  // The same isolated directory works under a GitHub project path.
  requests = []; failures = [];
  await win.loadURL(`${url}nested/tapkit/`); await ready();
  await js('document.querySelector("#playground").scrollIntoView({behavior:"instant"})');
  await click('.guide-key');
  await until('window.audioProbe.contexts.at(-1).state === "running"', 'nested demo plays');
  assert.ok(requests.filter(path => /\.(wav|mp3|webp|svg|js|css)$/.test(path)).every(path => path.startsWith('/nested/tapkit/')), 'relative assets at project path');
  assert.deepEqual(failures, []);
  await win.loadURL(`${url}credits.html`);
  const creditLinks = await js<string[]>('[...document.querySelectorAll("a")].map(a=>a.href).filter(url=>url.startsWith(location.origin))');
  for (const link of new Set(creditLinks)) assert.equal((await fetch(link, { method: 'HEAD' })).status, 200, link);
  const result = { combinations, voices, widths: [360, 390, 648, 820, 1024, 1440], appearances: ['light', 'dark'], errors, localDownloadBytes: new URL(downloadUrl).origin === new URL(url).origin ? (await stat(join(root, decodeURIComponent(new URL(downloadUrl).pathname)))).size : null };
  await writeFile('.artifacts/check-results.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (error) { console.error(error, errors); process.exitCode = 1; }
finally { win.destroy(); server.close(); app.exit(process.exitCode ? 1 : 0); }

})().catch(error => { console.error(error); app.exit(1); });
