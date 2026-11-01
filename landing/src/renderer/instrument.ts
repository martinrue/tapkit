import { loopDockHeight, loopToggleShortcut } from '../shared/loops';
import { createLooper } from './looper';
import { instruments, voicesFor, rangeBindings, themes, themeIds, instrumentScale, instrumentArtwork, handGroupFilter, handGeometry, handArtwork, type AppState, type Hand, type Hit, type InstrumentId, type VoiceDefinition, type TapkitBridge } from '../shared/model';
import { InstrumentAudio } from './audio';
import { pianoClip, insidePiano } from '../shared/artwork';
import { pianoLayout, pianoKeyCenter } from '../shared/piano';
import { samplerLayout, samplerPad, samplerPadColours } from '../shared/sampler';
import { marimbaLayout, marimbaBar, marimbaMaterials } from '../shared/marimba';

type Frame = { left: number; top: number; width: number; height: number };
type AlphaMap = { data: Uint8ClampedArray; width: number; height: number; frame: Frame };

const asset = (file: string) => new URL(`./assets/${file}`, location.href).href;

/** Shared by the desktop overlay and the embedded settings preview. */
export function mountInstrument(root: HTMLElement, id: InstrumentId, initial: AppState, bridge: TapkitBridge, preview = false, layoutChanged?: () => void) {
  const scope = preview ? root : document.body;
  let destroyed = false;
  let prepared = false;
  const events = new AbortController();
  const definition = instruments[id];
  let state = initial;
  let currentTheme = state.settings.instruments[id].theme;
  let artworkRequest = 0;
  let artworkReady: Promise<void> = Promise.resolve();
  let pointerInteractive = false;
  let gesture: { kind: 'drag' | 'resize'; pointerId: number; target: Element; last: { x: number; y: number } } | null = null;
  let gestureFrame = 0;
  let hoverExitTimer: ReturnType<typeof setTimeout> | undefined;
  const animations = new Map<Element, Animation>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const keyTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const alphaMaps = new Map<HTMLImageElement, AlphaMap>();
  const audio = new InstrumentAudio();

  scope.classList.add(preview ? 'instrument-preview' : 'overlay', id);
  scope.dataset.theme = currentTheme;
  root.innerHTML = `
    <div class="instrument-stage" style="height:${definition.height}px"><section class="instrument-shell" aria-label="${definition.name}">
      <div class="instrument-art" data-drag>
        <img class="instrument-body cutout" alt="${definition.name}" draggable="false" />
        ${id === 'piano' ? '<div class="keyboard interactive" aria-label="Piano keys"></div>' : '<div class="drum-surface" aria-hidden="true"></div>'}
        ${id === 'violin' ? '<div class="violin-bow" aria-hidden="true"><span class="bow-hair"></span><span class="bow-stick"></span><span class="bow-frog"></span></div>' : ''}
        ${id === 'drums' ? '<div class="kick-pedal" aria-hidden="true"><span></span></div>' : ''}
        <div class="hands" aria-hidden="true">
          <div class="hand hand-left" ${id === 'trumpet' ? 'hidden' : ''}>${id === 'drums' ? '<span class="drumstick"></span>' : id === 'marimba' ? '<span class="marimba-mallet"></span>' : ''}<img draggable="false" alt="" /></div>
          <div class="hand hand-right">${id === 'drums' ? '<span class="drumstick"></span>' : id === 'marimba' ? '<span class="marimba-mallet"></span>' : ''}<img draggable="false" alt="" /></div>
        </div>
        <div class="strike-flash" aria-hidden="true"></div>
        ${id === 'trumpet' ? `<div class="valve-lights" aria-hidden="true">${[.404, .476, .55].map((x, index) => `<span data-valve="${index + 1}" style="left:${20 + x * 500}px"></span>`).join('')}</div><div class="bell-flash" aria-hidden="true"></div>` : ''}
        ${id === 'guitar' ? `<div class="string-lights" aria-hidden="true">${Array.from({ length: 6 }, (_, index) => `<span data-string="${index}" style="top:${230 + index * 7}px"></span>`).join('')}</div>` : ''}
      </div>
      <div class="key-legend ${id === 'piano' || id === 'marimba' ? 'piano-legend' : definition.ranges ? 'melodic-legend' : ''}" aria-label="Playing keys"></div>
      ${definition.ranges ? '<div class="register-control interactive" aria-label="Register"><button data-range="-1" aria-label="Lower register"><kbd></kbd> −</button><span class="register-name"></span><button data-range="1" aria-label="Higher register">+ <kbd></kbd></button></div>' : ''}
      ${preview ? '' : `<div class="overlay-controls interactive hover-control" aria-label="Instrument controls">
        <button class="resize-grip interactive" aria-label="Resize instrument" title="Drag to resize" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5v14h14M10 5v9h9M15 5v4h4"/></svg></button>
        <button class="loop-toggle interactive" aria-label="Show loop recorder" aria-pressed="false" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 8a7 7 0 0 0-12-2L4 9m0-5v5h5M5 16a7 7 0 0 0 12 2l3-3m0 5v-5h-5"/><circle cx="12" cy="12" r="2"/></svg></button>
        <div class="overlay-themes" aria-label="Instrument themes">${themeIds.map(theme => `<button class="theme-dot ${theme}" style="background:${themes[theme].accent}" data-theme="${theme}" title="${themes[theme].name}" aria-label="${themes[theme].name} theme"></button>`).join('')}</div>
      </div>`}
      <p class="instrument-error" role="status"></p>
    </section></div>${preview ? '' : '<div class="loop-dock" hidden></div>'}`;
  root.dataset.prepared = 'false';
  const body = root.querySelector<HTMLImageElement>('.instrument-body')!;
  const art = root.querySelector<HTMLElement>('.instrument-art')!;
  const handPair = root.querySelector<HTMLElement>('.hands')!;
  handPair.style.filter = handGroupFilter();
  root.style.width = `${definition.width}px`;
  root.style.transformOrigin = 'top left';
  function updateScale(next: AppState) {
    const scale = !preview && next.overlayScale !== undefined ? next.overlayScale : instrumentScale(next.settings.instruments[id]);
    root.style.transform = `scale(${scale})`;
    root.style.setProperty('--instrument-scale', String(scale));
    root.style.height = `${Math.round(definition.height * scale + (preview ? 0 : loopDockHeight)) / scale}px`;
  }
  updateScale(initial);
  if (id === 'piano') {
    body.style.clipPath = pianoClip;
    const keyboard = root.querySelector<HTMLElement>('.keyboard')!;
    keyboard.style.left = `${pianoLayout.left}px`; keyboard.style.top = `${pianoLayout.top}px`;
    keyboard.style.width = `${pianoLayout.width}px`; keyboard.style.height = `${pianoLayout.height}px`;
    keyboard.style.setProperty('--white-key-width', `${100 / pianoLayout.whiteKeys}%`);
    keyboard.style.setProperty('--black-key-width', `${100 * pianoLayout.blackWidth / pianoLayout.whiteKeys}%`);
  }
  const hands: Record<Hand, HTMLElement> = { left: root.querySelector('.hand-left')!, right: root.querySelector('.hand-right')! };
  const geometry = handGeometry[id];
  for (const hand of Object.values(hands)) {
    hand.style.width = `${geometry.width}px`; hand.style.height = `${geometry.height}px`; hand.style.top = `${geometry.top}px`;
    const center = hand === hands.left ? .36 : .64;
    hand.style.left = `${definition.width * center - geometry.width / 2}px`;
  }
  if (id === 'tambourine') {
    hands.right.style.left = `${definition.width * .82 - geometry.width / 2}px`;
    hands.right.style.top = '173px';
    hands.right.style.transform = 'rotate(-24deg)';
  }
  if (id === 'trumpet') {
    hands.right.style.left = '235px';
  }
  if (id === 'guitar') {
    hands.left.style.left = '170px'; hands.left.style.top = '153px';
    hands.right.style.left = '403px'; hands.right.style.top = '160px';
  }
  if (id === 'violin') {
    hands.left.style.left = '205px'; hands.left.style.top = '142px';
    hands.right.style.left = '366px'; hands.right.style.top = '281px';
  }
  if (id === 'drums') {
    hands.left.style.left = '114px'; hands.left.style.top = '322px';
    hands.right.style.left = '337px'; hands.right.style.top = '226px';
  }
  if (id === 'marimba') for (const side of ['left', 'right'] as const) {
    const bar = marimbaBar(side === 'left' ? 4 : 19);
    hands[side].style.left = `${bar.centerX - geometry.width / 2}px`;
    hands[side].style.top = `${bar.contactY + marimbaLayout.malletContact - 12}px`;
  }
  // Stable motion envelope: fitting must not jump when a hand moves to another note.
  const previewOrigin = preview ? root.getBoundingClientRect() : null;
  const previewScale = previewOrigin ? previewOrigin.width / definition.width || 1 : 1;
  const handFrames: Frame[] = previewOrigin ? Object.values(hands).filter(hand => !hand.hidden).map(hand => {
    const rect = hand.getBoundingClientRect();
    return { left: (rect.left - previewOrigin.left) / previewScale, top: (rect.top - previewOrigin.top) / previewScale, width: rect.width / previewScale, height: rect.height / previewScale };
  }) : [];
  if (preview) for (const voice of definition.voices) {
    let left = voice.x * definition.width - geometry.width / 2, top = geometry.top;
    if (id === 'piano') {
      left = pianoKeyCenter(voice) - (voice.hand === 'left' ? geometry.fingertipX : 1 - geometry.fingertipX) * geometry.width;
      top = geometry.top + (voice.black ? 0 : 18);
    } else if (id === 'marimba') {
      top = voice.y! * definition.height + marimbaLayout.malletContact;
    } else if (id === 'sampler') {
      left = voice.x * definition.width - (voice.hand === 'left' ? geometry.fingertipX : 1 - geometry.fingertipX) * geometry.width;
      top = voice.y! * definition.height - geometry.height * .77 - geometry.contactY;
    } else if (id === 'handpan' || (id === 'guitar' && voice.surface === 'body')) top = voice.y! * definition.height - geometry.height * .85 - geometry.contactY;
    else if (id === 'drums') { if (voice.surface === 'kick') continue; top = voice.y! * definition.height + 60; }
    else if (id !== 'djembe' && id !== 'tambourine') continue;
    handFrames.push({ left, top, width: geometry.width, height: geometry.height });
  }
  function previewFrame(): Frame {
    const alpha = alphaMaps.get(body);
    if (!alpha) return { left: 0, top: 0, width: definition.width, height: definition.height };
    const style = getComputedStyle(body), width = parseFloat(style.width), height = parseFloat(style.height);
    const frame = alpha.frame;
    const parts: Frame[] = [{ left: parseFloat(style.left) + frame.left / alpha.width * width, top: parseFloat(style.top) + frame.top / alpha.height * height, width: frame.width / alpha.width * width, height: frame.height / alpha.height * height },
      ...handFrames.map(frame => ({ left: frame.left - 12, top: frame.top - (id === 'drums' || id === 'marimba' ? 90 : 26), width: frame.width + 24, height: frame.height + geometry.contactY + (id === 'drums' || id === 'marimba' ? 106 : 42) }))];
    for (const part of root.querySelectorAll<HTMLElement>('.violin-bow, .kick-pedal')) parts.push({ left: part.offsetLeft - 12, top: part.offsetTop - 42, width: part.offsetWidth + 24, height: part.offsetHeight + 66 });
    const left = Math.floor(Math.min(...parts.map(part => part.left)) - 8), top = Math.floor(Math.min(...parts.map(part => part.top)) - 8);
    return { left, top, width: Math.ceil(Math.max(...parts.map(part => part.left + part.width)) + 8) - left, height: Math.ceil(Math.max(...parts.map(part => part.top + part.height)) + 8) - top };
  }
  const keyElements = new Map<string, HTMLElement>();
  const toneFields = new Map<string, HTMLElement>();
  if (id === 'piano') {
    const keyboard = root.querySelector('.keyboard')!;
    for (const voice of definition.voices) {
      const key = document.createElement('button');
      key.className = `piano-key ${voice.black ? 'black' : 'white'} interactive`;
      key.dataset.voice = voice.id;
      key.style.left = `${voice.x * 100 / pianoLayout.whiteKeys}%`;
      key.setAttribute('aria-label', voice.label);
      key.innerHTML = '<span></span>';
      keyboard.append(key);
      keyElements.set(voice.id, key);
      key.addEventListener('pointerdown', event => { event.stopPropagation(); play({ voiceId: voice.id, sentAt: performance.timeOrigin + performance.now() }); });
    }
  }
  if (id === 'marimba') {
    for (const voice of definition.voices) {
      const bar = marimbaBar(voice.noteIndex!), button = document.createElement('button');
      button.className = `marimba-bar ${bar.sharp ? 'raised' : 'natural'} interactive`;
      button.dataset.voice = voice.id;
      Object.assign(button.style, { left: `${bar.left}px`, top: `${bar.top}px`, width: `${bar.width}px`, height: `${bar.height}px` });
      button.innerHTML = '<kbd></kbd>';
      art.append(button); keyElements.set(voice.id, button);
      button.addEventListener('pointerdown', event => { event.stopPropagation(); play({ voiceId: voice.id, sentAt: performance.timeOrigin + performance.now() }); });
    }
  }
  const legend = root.querySelector('.key-legend')!;
  if (!preview) {
    legend.classList.add('hover-control');
    root.querySelector('.register-control')?.classList.add('hover-control');
  }
  if (id !== 'piano' && id !== 'sampler' && id !== 'marimba') for (const voice of definition.voices) {
    const button = document.createElement('button');
    button.className = 'legend-key interactive';
    button.innerHTML = `<kbd></kbd><span>${voice.legend ?? (voice.id.endsWith('bass') ? 'bass' : 'rim')}</span>`;
    button.dataset.voice = voice.id;
    if (voice.chord) button.classList.add('chord-key');
    legend.append(button); keyElements.set(voice.id, button);
    button.addEventListener('pointerdown', event => { event.stopPropagation(); play({ voiceId: voice.id, sentAt: performance.timeOrigin + performance.now() }); });
  }
  if (id === 'sampler') {
    Object.assign(body.style, { left: `${samplerLayout.left}px`, top: `${samplerLayout.top}px`, width: `${samplerLayout.body}px`, height: `${samplerLayout.body}px` });
    for (const voice of definition.voices) {
      const pad = samplerPad(voice.noteIndex!), button = document.createElement('button');
      button.className = 'sampler-pad interactive'; button.dataset.voice = voice.id;
      Object.assign(button.style, { left: `${pad.left}px`, top: `${pad.top}px`, width: `${pad.size}px`, height: `${pad.size}px` });
      button.innerHTML = '<kbd></kbd><span></span>';
      button.querySelector('span')!.textContent = voice.label;
      button.title = voice.label;
      button.addEventListener('pointerdown', event => { event.stopPropagation(); play({ voiceId: voice.id, sentAt: performance.timeOrigin + performance.now() }); });
      art.append(button); keyElements.set(voice.id, button);
    }
  }
  root.querySelectorAll<HTMLButtonElement>('[data-range]').forEach(button => button.addEventListener('click', () => changeRange(Number(button.dataset.range))));

  function changeRange(direction: number) {
    if (!definition.ranges) return;
    const current = state.settings.instruments[id].range ?? definition.defaultRange!;
    const range = Math.max(0, Math.min(definition.ranges.length - 1, current + direction));
    if (range === current) return;
    // Update locally before IPC so a rapid Z/X followed by a note uses the new register.
    const next = { ...state, settings: structuredClone(state.settings) };
    next.settings.instruments[id].range = range; update(next);
    bridge.setRange(id, range);
  }
  if (id === 'drums') for (const voice of definition.voices.filter((voice, index, all) => all.findIndex(other => other.surface === voice.surface) === index)) {
    const field = document.createElement('div');
    field.className = 'kit-target'; field.dataset.surface = voice.surface;
    field.style.left = `${voice.x * 100}%`; field.style.top = `${voice.y! * 100}%`;
    field.setAttribute('aria-hidden', 'true'); art.append(field);
  }
  if (id === 'handpan') for (const voice of definition.voices) {
    const field = document.createElement('button');
    field.className = 'tone-field interactive';
    field.dataset.voice = voice.id;
    field.style.left = `${voice.x * 100}%`; field.style.top = `${voice.y! * 100}%`;
    field.textContent = voice.label;
    field.setAttribute('aria-label', `${voice.label} tone field`);
    art.append(field); toneFields.set(voice.id, field);
    field.addEventListener('pointerdown', event => { event.stopPropagation(); play({ voiceId: voice.id, sentAt: performance.timeOrigin + performance.now() }); });
  }
  root.querySelectorAll<HTMLElement>('.theme-dot').forEach(button => button.addEventListener('click', () => bridge.setTheme(button.dataset.theme as typeof currentTheme)));

  const looper = preview ? null : createLooper(id, audio, () => prepared, clip => bridge.setLoop(id, clip), animateHit);
  const loopDock = root.querySelector<HTMLElement>('.loop-dock');
  const loopToggle = root.querySelector<HTMLButtonElement>('.loop-toggle');
  if (looper) loopDock!.append(looper.element);
  function toggleLoop() {
    if (!loopDock || !loopToggle) return;
    loopDock.hidden = !loopDock.hidden;
    loopToggle.setAttribute('aria-pressed', String(!loopDock.hidden));
    loopToggle.setAttribute('aria-label', loopDock.hidden ? 'Show loop recorder' : 'Hide loop recorder');
  }
  loopToggle?.addEventListener('click', toggleLoop);
  const unsubscribeLoop = preview ? () => {} : bridge.onToggleLoop(toggleLoop);

  async function mapAlpha(image: HTMLImageElement) {
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let left = canvas.width, top = canvas.height, right = 0, bottom = 0;
    if (preview) for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) if (data[(y * canvas.width + x) * 4 + 3] > 40) {
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
    }
    if (right <= left || bottom <= top) { left = 0; top = 0; right = canvas.width; bottom = canvas.height; }
    return { data, width: canvas.width, height: canvas.height, frame: { left, top, width: right - left, height: bottom - top } };
  }
  const handSprites = new Map<string, Promise<HTMLImageElement>>();
  function loadHand(theme: typeof currentTheme, hand: Hand) {
    const file = handArtwork(id, theme, hand);
    if (!handSprites.has(file)) {
      const image = new Image(); image.src = asset(`art/${file}`);
      const decoded = image.decode().then(() => image).catch(error => { handSprites.delete(file); throw error; });
      handSprites.set(file, decoded);
    }
    return handSprites.get(file)!;
  }
  async function setArtwork() {
    const request = ++artworkRequest;
    const theme = currentTheme;
    const image = new Image();
    image.src = asset(`art/${instrumentArtwork(id, theme)}`);
    try {
      const [alpha, leftSprite, rightSprite] = await Promise.all([mapAlpha(image), loadHand(theme, 'left'), loadHand(theme, 'right')]);
      if (destroyed || request !== artworkRequest) return;
      // Commit body and both hands together; stale theme loads never mix art styles.
      body.src = image.src;
      alphaMaps.set(body, alpha);
      if (id === 'marimba') for (const [name, colour] of Object.entries(marimbaMaterials[theme])) root.style.setProperty(`--marimba-${name}`, colour);
      if (id === 'sampler') for (const voice of definition.voices) {
        const colours = samplerPadColours(voice.noteIndex!, theme), pad = keyElements.get(voice.id)!;
        for (const [name, colour] of Object.entries(colours)) pad.style.setProperty(`--pad-${name}`, colour);
      }
      hands.left.querySelector('img')!.src = leftSprite.src;
      hands.right.querySelector('img')!.src = rightSprite.src;
      await Promise.all(Object.values(hands).map(hand => hand.querySelector('img')!.decode()));
      if (!destroyed && request === artworkRequest) layoutChanged?.();
    } catch (error) { if (!destroyed && request === artworkRequest) throw error; }
  }
  function update(next: AppState) {
    if (destroyed) return;
    const wasPlaying = state.playing;
    state = next;
    const item = state.settings.instruments[id];
    updateScale(state);
    audio.setVolume(item.volume);
    if (loopToggle) {
      const mac = navigator.userAgent.includes('Mac');
      const shortcut = loopToggleShortcut(state.settings).replace('CommandOrControl', mac ? '⌘' : 'Ctrl').replace('Alt', mac ? '⌥' : 'Alt').replace('Shift', mac ? '⇧' : 'Shift').replaceAll('+', mac ? '' : '+');
      loopToggle.title = `Toggle loop recorder · ${shortcut}`;
    }
    looper?.update(state.settings.loops[id], prepared && state.playing, item.theme);
    audio.setEnabled(prepared && state.playing);
    scope.classList.toggle('paused', !state.playing);
    root.querySelector('.instrument-error')!.textContent = state.status;
    if (currentTheme !== item.theme) {
      currentTheme = item.theme;
      scope.dataset.theme = currentTheme;
      void prepareArtwork().catch(showError);
    }
    handPair.style.filter = handGroupFilter();
    root.querySelectorAll<HTMLElement>('.theme-dot').forEach(button => button.classList.toggle('selected', button.dataset.theme === currentTheme));
    for (const voice of voicesFor(id, item.range)) {
      const key = keyElements.get(voice.id)!;
      const label = key.querySelector('kbd, span')!;
      label.textContent = item.keys[voice.id];
      key.setAttribute('aria-label', `${voice.label} · ${item.keys[voice.id]}`);
      if (id === 'sampler') key.title = `${voice.label} · ${item.keys[voice.id]}`;
      toneFields.get(voice.id)?.setAttribute('aria-label', `${voice.label} · ${item.keys[voice.id]}`);
      if (definition.ranges && id !== 'piano' && id !== 'marimba') key.querySelector('span')!.textContent = voice.legend ?? voice.label;
    }
    if (definition.ranges) {
      const range = item.range ?? definition.defaultRange!;
      root.querySelector('.register-name')!.textContent = definition.ranges[range].label;
      root.querySelectorAll<HTMLButtonElement>('[data-range]').forEach(button => {
        const down = Number(button.dataset.range) < 0;
        button.querySelector('kbd')!.textContent = item.keys[down ? 'range-down' : 'range-up'];
        button.disabled = down ? range === 0 : range === definition.ranges!.length - 1;
      });
    }
    if (wasPlaying && !state.playing) {
      finishGesture(); hideHover();
      for (const animation of animations.values()) animation.cancel();
      animations.clear();
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      for (const timer of keyTimers.values()) clearTimeout(timer);
      keyTimers.clear();
      for (const key of keyElements.values()) key.classList.remove('pressed');
      for (const field of toneFields.values()) field.classList.remove('pressed');
    }
  }
  function showError(error: unknown) { root.querySelector('.instrument-error')!.textContent = `Unable to prepare instrument: ${(error as Error).message}`; }
  function prepareArtwork() { artworkReady = setArtwork(); return artworkReady; }
  function animate(element: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    animations.get(element)?.cancel();
    const animation = element.animate(frames, options);
    animations.set(element, animation);
    animation.onfinish = () => { if (animations.get(element) === animation) animations.delete(element); };
  }
  function animateHit(voice: VoiceDefinition) {
    const hand = hands[voice.hand];
    const accent = Boolean(voice.accent);
    if (id === 'djembe') {
      hand.style.left = `${voice.x * definition.width - geometry.width / 2}px`;
      animate(hand, [
        { transform: `translateY(${geometry.contactY + (accent ? 7 : 0)}px) rotate(-4deg) scale(.97)`, offset: 0 },
        { transform: 'translateY(-8px) rotate(3deg) scale(1.03)', offset: 0.4 },
        { transform: 'translateY(0) rotate(0) scale(1)', offset: 1 },
      ], { duration: 210, easing: 'cubic-bezier(.18,.7,.3,1)' });
      animate(body, [{ transform: accent ? 'scale(1.025,.98)' : 'scale(1.012,.99)' }, { transform: 'scale(1)' }], { duration: 160 });
      const flash = root.querySelector<HTMLElement>('.strike-flash')!;
      flash.style.left = `${voice.x * 100 - 6}%`;
      animate(flash, [{ opacity: accent ? .85 : .65, transform: 'scale(.5)' }, { opacity: 0, transform: 'scale(1.9)' }], { duration: accent ? 310 : 260 });
    } else if (id === 'piano') {
      const keyCenter = pianoKeyCenter(voice);
      const fingertip = (voice.hand === 'left' ? geometry.fingertipX : 1 - geometry.fingertipX) * geometry.width;
      hand.style.left = `${keyCenter - fingertip}px`;
      hand.style.top = `${geometry.top + (voice.black ? 0 : 18)}px`;
      animate(hand, [{ transform: `translateY(${geometry.contactY}px) rotate(-3deg)` }, { transform: 'translateY(-5px) rotate(2deg)', offset: .45 }, { transform: 'translateY(0) rotate(0)' }], { duration: 240, easing: 'cubic-bezier(.2,.8,.3,1)' });
    } else if (id === 'marimba') {
      hand.style.left = `${voice.x * definition.width - geometry.width / 2}px`;
      hand.style.top = `${voice.y! * definition.height + marimbaLayout.malletContact}px`;
      // The mallet head is already on the bar at audible onset, then rebounds.
      animate(hand, [{ transform: 'translateY(0)' }, { transform: 'translateY(-28px)', offset: .38 }, { transform: 'translateY(-12px)' }], { duration: 210, easing: 'cubic-bezier(.18,.7,.3,1)' });
      animate(keyElements.get(voice.id)!, [{ transform: 'translateY(2px)', filter: 'brightness(1.2)' }, { transform: 'translateY(0)', filter: 'brightness(1)' }], { duration: 180 });
    } else if (id === 'sampler') {
      const fingertip = (voice.hand === 'left' ? geometry.fingertipX : 1 - geometry.fingertipX) * geometry.width;
      hand.style.left = `${voice.x * definition.width - fingertip}px`;
      hand.style.top = `${voice.y! * definition.height - geometry.height * .77 - geometry.contactY}px`;
      animate(hand, [{ transform: `translateY(${geometry.contactY}px) rotate(-2deg)` }, { transform: 'translateY(-10px) rotate(2deg)', offset: .45 }, { transform: 'translateY(-3px)' }], { duration: 210, easing: 'cubic-bezier(.2,.8,.3,1)' });
      animate(keyElements.get(voice.id)!, [{ transform: 'translateY(3px)', filter: 'brightness(1.2)' }, { transform: 'translateY(0)', filter: 'brightness(1)' }], { duration: 190 });
    } else if (id === 'handpan') {
      hand.style.left = `${voice.x * definition.width - geometry.width / 2}px`;
      hand.style.top = `${voice.y! * definition.height - geometry.height * .85 - geometry.contactY}px`;
      animate(hand, [{ transform: `translateY(${geometry.contactY}px) rotate(-3deg)` }, { transform: 'translateY(-7px) rotate(3deg)', offset: .4 }, { transform: 'translateY(0) rotate(0)' }], { duration: 230, easing: 'cubic-bezier(.18,.7,.3,1)' });
      const field = toneFields.get(voice.id)!;
      animate(field, [{ boxShadow: '0 0 0 2px #fff9, 0 0 24px #bdefffaa' }, { boxShadow: '0 0 0 12px #fff0, 0 0 30px #bdefff00' }], { duration: 600 });
    } else if (id === 'trumpet') {
      const valve = voice.valves?.[0] ?? 2;
      hands.right.style.left = `${20 + [.404, .476, .55][valve - 1] * 500 - geometry.width * (1 - geometry.fingertipX)}px`;
      animate(hands.right, [{ transform: `translateY(${geometry.contactY}px)` }, { transform: 'translateY(-4px)', offset: .45 }, { transform: 'translateY(0)' }], { duration: 190 });
      root.querySelectorAll<HTMLElement>('[data-valve]').forEach(light => {
        animations.get(light)?.cancel();
        if (voice.valves?.includes(Number(light.dataset.valve))) animate(light, [{ opacity: .9, transform: 'translate(-50%, 6px)' }, { opacity: 0, transform: 'translate(-50%, 0)' }], { duration: 240 });
      });
      animate(root.querySelector<HTMLElement>('.bell-flash')!, [{ opacity: .55, transform: 'scale(.85)' }, { opacity: 0, transform: 'scale(1.2)' }], { duration: 350 });
    } else if (id === 'guitar' && voice.surface === 'body') {
      hands.right.style.left = `${voice.x * definition.width - geometry.width / 2}px`;
      hands.right.style.top = `${voice.y! * definition.height - geometry.height * .85 - geometry.contactY}px`;
      animate(hands.right, [
        { transform: `translateY(${geometry.contactY}px) rotate(-3deg) scale(1.04,.95)` },
        { transform: 'translateY(-16px) rotate(7deg)', offset: .4 },
        { transform: 'translateY(0) rotate(0)' },
      ], { duration: 240, easing: 'cubic-bezier(.18,.7,.3,1)' });
      const flash = root.querySelector<HTMLElement>('.strike-flash')!;
      flash.style.left = `${voice.x * definition.width - 24}px`;
      flash.style.top = `${voice.y! * definition.height - 10}px`;
      animate(flash, [{ opacity: .65, transform: 'scale(.7)' }, { opacity: 0, transform: 'scale(1.7)' }], { duration: 230 });
    } else if (id === 'guitar') {
      hands.right.style.left = '403px';
      const fret = voice.fret ?? 0;
      const x = 20 + 580 * (.18 + .45 * (1 - 2 ** (-fret / 12)) / .75);
      hands.left.style.left = `${x - geometry.width / 2}px`;
      const contact = voice.chord ? 248 : 230 + voice.string! * 7;
      hands.left.style.top = `${contact - geometry.height * .85 - 9}px`;
      hands.right.style.top = voice.chord ? '160px' : `${contact - geometry.height * .85 - 9}px`;
      animate(hands.left, [{ transform: 'translateY(9px)' }, { transform: 'translateY(0)' }], { duration: 170 });
      animate(hands.right, voice.chord
        ? [{ transform: 'translateY(-14px) rotate(-10deg)' }, { transform: 'translateY(22px) rotate(10deg)', offset: .23 }, { transform: 'translateY(0) rotate(0)' }]
        : [{ transform: 'translateY(9px) rotate(8deg)' }, { transform: 'translateY(-4px) rotate(-3deg)', offset: .4 }, { transform: 'translateY(0) rotate(0)' }], { duration: voice.chord ? 220 : 180 });
      root.querySelectorAll<HTMLElement>('[data-string]').forEach(string => {
        if (voice.chord || Number(string.dataset.string) === voice.string) animate(string, [{ opacity: .8, transform: 'translateY(0)' }, { opacity: .5, transform: 'translateY(2px)', offset: .25 }, { opacity: .4, transform: 'translateY(-2px)', offset: .5 }, { opacity: 0, transform: 'translateY(0)' }], { duration: 380 });
      });
    } else if (id === 'violin') {
      // A bowed note begins with the bow already contacting the string.
      const x = 20 + 580 * (.22 + .39 * (1 - 2 ** (-(voice.fret ?? 0) / 12)) / .75);
      hands.left.style.left = `${x - geometry.width / 2}px`;
      hands.left.style.top = `${140 + (voice.string ?? 0) * 5}px`;
      animate(hands.left, [{ transform: 'translateY(12px)' }, { transform: 'translateY(0)' }], { duration: 170 });
      const stroke = (voice.noteIndex ?? 0) % 2 ? -1 : 1;
      const frames = [{ transform: `translateY(${-18 * stroke}px)` }, { transform: `translateY(${18 * stroke}px)`, offset: .7 }, { transform: 'translateY(0)' }];
      animate(root.querySelector<HTMLElement>('.violin-bow')!, frames, { duration: 480, easing: 'ease-out' });
      animate(hands.right, frames, { duration: 480, easing: 'ease-out' });
    } else if (id === 'drums') {
      if (voice.surface === 'kick') {
        animate(root.querySelector<HTMLElement>('.kick-pedal')!, [{ transform: 'rotateX(32deg) translateY(-7px)' }, { transform: 'rotateX(0) translateY(0)' }], { duration: 170 });
      } else {
        // Stick tip is 60 px above its gripping hand; the first pose contacts the head.
        hand.style.left = `${voice.x * definition.width - geometry.width / 2}px`;
        hand.style.top = `${voice.y! * definition.height + 60}px`;
        animate(hand, [{ transform: 'translateY(0)' }, { transform: 'translateY(-24px)', offset: .38 }, { transform: 'translateY(-12px)' }], { duration: 190, easing: 'cubic-bezier(.18,.7,.3,1)' });
      }
      const target = root.querySelector<HTMLElement>(`[data-surface="${voice.surface}"]`)!;
      const cymbal = ['hat', 'crash', 'ride'].includes(voice.surface!);
      animate(target, [{ opacity: .8, transform: 'translate(-50%, -50%) scale(.8)' }, { opacity: 0, transform: `translate(-50%, -50%) scale(${cymbal ? 1.8 : 1.35})` }], { duration: cymbal ? 600 : 220 });
    } else if (voice.motion) {
      // Body and holding hand move together; each tap restarts the short shake gesture.
      const direction = voice.motion === 'roll' ? -1 : 1;
      const count = voice.motion === 'roll' ? 8 : 4;
      animate(art, Array.from({ length: count + 1 }, (_, index) => ({ transform: index === count ? 'translateX(0) rotate(0)' : `translateX(${(index % 2 ? -7 : 7) * direction}px) rotate(${(index % 2 ? -3 : 3) * direction}deg)` })), { duration: voice.motion === 'roll' ? 720 : 250, easing: 'ease-out' });
    } else {
      hand.style.left = `${voice.x * definition.width - geometry.width / 2}px`;
      animate(hand, [{ transform: `translateY(${geometry.contactY}px) rotate(-4deg)` }, { transform: 'translateY(-8px) rotate(3deg)', offset: .4 }, { transform: 'translateY(0) rotate(0)' }], { duration: 220 });
      animate(art, [{ transform: 'rotate(-3deg) scale(.99)' }, { transform: 'rotate(2deg)' }, { transform: 'rotate(0) scale(1)' }], { duration: 260 });
    }
    const key = keyElements.get(voice.id)!;
    clearTimeout(keyTimers.get(voice.id));
    key.classList.add('pressed');
    toneFields.get(voice.id)?.classList.add('pressed');
    keyTimers.set(voice.id, setTimeout(() => { key.classList.remove('pressed'); toneFields.get(voice.id)?.classList.remove('pressed'); keyTimers.delete(voice.id); }, 140));
  }
  function itemRange() { return state.settings.instruments[id].range ?? definition.defaultRange; }
  function play(hit: Hit) {
    if (destroyed || !prepared || !state.playing) return;
    if (definition.ranges && rangeBindings.some(binding => binding.id === hit.voiceId)) { changeRange(hit.voiceId === 'range-down' ? -1 : 1); return; }
    const received = performance.now();
    const voice = voicesFor(id, state.settings.instruments[id].range).find(item => item.id === hit.voiceId);
    if (!voice) return;
    const result = audio.play(voice);
    if (!result) return;
    looper?.capture(voice.id, definition.ranges ? itemRange() : undefined);
    const wait = Math.max(0, result.onset - performance.now() - 5);
    // Audio starts first. Only the contact pose waits for the estimated output time.
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (destroyed || !prepared || !state.playing) return;
      requestAnimationFrame(() => {
        if (destroyed || !prepared || !state.playing) return;
        animateHit(voice);
        bridge.reportTiming({ schedulingMs: result.schedulingMs, dispatchMs: Math.max(0, performance.timeOrigin + received - hit.sentAt), visualErrorMs: performance.now() - result.onset, baseLatencyMs: audio.context.baseLatency * 1000, outputLatencyMs: (audio.context.outputLatency || 0) * 1000 });
      });
    }, wait);
    timers.add(timer);
  }

  function opaqueAt(image: HTMLImageElement, x: number, y: number) {
    const rect = image.getBoundingClientRect();
    const map = alphaMaps.get(image);
    if (!map || x < rect.left || y < rect.top || x >= rect.right || y >= rect.bottom) return false;
    if (id === 'piano' && !insidePiano((x - rect.left) / rect.width * 100, (y - rect.top) / rect.height * 100)) return false;
    const px = Math.floor((x - rect.left) / rect.width * map.width);
    const py = Math.floor((y - rect.top) / rect.height * map.height);
    return map.data[(py * map.width + px) * 4 + 3] > 40;
  }
  function interactiveAt(target: EventTarget | null) {
    const control = target instanceof Element ? target.closest<HTMLElement>('.interactive') : null;
    return Boolean(control && getComputedStyle(control).visibility !== 'hidden' && getComputedStyle(control).pointerEvents !== 'none');
  }
  function setInteractive(next: boolean) {
    if (pointerInteractive === next) return;
    pointerInteractive = next; bridge.pointerInteractive(next);
  }
  function hideHover() {
    clearTimeout(hoverExitTimer); hoverExitTimer = undefined;
    scope.classList.remove('instrument-hover');
  }
  function showHover() {
    clearTimeout(hoverExitTimer); hoverExitTimer = undefined;
    scope.classList.add('instrument-hover');
  }
  function pointerAt(event: MouseEvent) {
    const over = interactiveAt(document.elementFromPoint(event.clientX, event.clientY)) || opaqueAt(body, event.clientX, event.clientY);
    setInteractive(over);
    if (over) showHover();
    else if (!hoverExitTimer) hoverExitTimer = setTimeout(hideHover, 600);
  }
  function finishGesture(point = gesture?.last) {
    if (!gesture || !point) return;
    const current = gesture; gesture = null;
    cancelAnimationFrame(gestureFrame); gestureFrame = 0;
    scope.classList.remove('dragging', 'resizing');
    if (current.kind === 'resize') bridge.resize('end', point);
    else bridge.drag('end', point);
    if (current.target.hasPointerCapture(current.pointerId)) current.target.releasePointerCapture(current.pointerId);
  }
  if (!preview) {
    document.addEventListener('mousemove', event => { if (!gesture) pointerAt(event); }, { signal: events.signal });
    document.addEventListener('mouseleave', () => {
      if (!gesture) { hideHover(); setInteractive(false); }
    }, { signal: events.signal });
    document.addEventListener('pointerdown', event => {
      if (event.button !== 0 || gesture || event.detail >= 2) return;
      const target = event.target as Element;
      const resize = Boolean(target.closest('.resize-grip'));
      if (!resize && (target.closest('button, input') || !target.closest('[data-drag]') || !opaqueAt(body, event.clientX, event.clientY))) return;
      if (resize && !interactiveAt(target)) return;
      const kind = resize ? 'resize' : 'drag';
      gesture = { kind, pointerId: event.pointerId, target, last: { x: event.screenX, y: event.screenY } };
      scope.classList.add(resize ? 'resizing' : 'dragging'); showHover(); setInteractive(true);
      target.setPointerCapture(event.pointerId);
      event.preventDefault();
      if (resize) bridge.resize('start', gesture.last);
      else bridge.drag('start', gesture.last);
    }, { signal: events.signal });
    document.addEventListener('pointermove', event => {
      if (!gesture || event.pointerId !== gesture.pointerId || !(event.buttons & 1)) return;
      gesture.last = { x: event.screenX, y: event.screenY };
      if (!gestureFrame) gestureFrame = requestAnimationFrame(() => {
        gestureFrame = 0;
        if (!gesture) return;
        if (gesture.kind === 'resize') bridge.resize('move', gesture.last);
        else bridge.drag('move', gesture.last);
      });
    }, { signal: events.signal });
    document.addEventListener('pointerup', event => {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      finishGesture({ x: event.screenX, y: event.screenY }); pointerAt(event);
    }, { signal: events.signal });
    for (const name of ['pointercancel', 'lostpointercapture']) document.addEventListener(name, () => { finishGesture(); hideHover(); setInteractive(false); }, { signal: events.signal });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') { finishGesture(); hideHover(); setInteractive(false); }
      bridge.visibility(document.visibilityState === 'visible');
    }, { signal: events.signal });
  }
  const unsubscribeState = preview ? () => {} : bridge.onState(update);
  const unsubscribeHit = preview ? () => {} : bridge.onHit(play);
  const ready = Promise.all([audio.load(definition), prepareArtwork()]).then(async () => {
    while (!destroyed) {
      const latestArtwork = artworkReady;
      await latestArtwork;
      if (destroyed) return;
      prepared = true;
      update(state);
      // Decoding isn't painting: allow the complete body, hands and controls to
      // reach a composited frame before the native window is made visible.
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (destroyed) return;
      if (latestArtwork !== artworkReady) continue;
      root.dataset.prepared = 'true';
      if (!preview) await bridge.ready();
      return;
    }
  });
  update(state);
  return {
    update, play, ready, previewFrame, unlock: () => audio.context.resume(),
    destroy() {
      destroyed = true;
      finishGesture(); hideHover(); cancelAnimationFrame(gestureFrame);
      events.abort(); unsubscribeState(); unsubscribeHit();
      for (const animation of animations.values()) animation.cancel();
      for (const timer of timers) clearTimeout(timer);
      for (const timer of keyTimers.values()) clearTimeout(timer);
      unsubscribeLoop(); looper?.destroy(); audio.dispose();
      root.replaceChildren();
    },
  };
}
