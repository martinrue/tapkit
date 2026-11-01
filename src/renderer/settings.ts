import { defaultSettings, instrumentIds, instruments, instrumentBindings, adjacentInstrument, themes, themeIds, instrumentDimensions, instrumentArtwork, type AppState, type InstrumentId, type Settings } from '../shared/model';
import { normalizeAccelerator, validateSettings, setSharedAppearance } from '../shared/settings';
import { pianoClip } from '../shared/artwork';
import { mountInstrument } from './instrument';

export function renderSettings(root: HTMLElement, initial: AppState) {
  document.body.className = 'preferences';
  let draft = structuredClone(initial.settings);
  let selected: InstrumentId = initial.activeInstrument ?? 'djembe';
  let committed = structuredClone(initial.settings);
  let pending = 0;
  let revision = 0;
  let windowFocused = true;
  let previewReady = false;
  let preview: ReturnType<typeof mountInstrument> | undefined;
  const asset = (file: string) => new URL(`../assets/art/${file}`, location.href).href;

  root.innerHTML = `
    <aside class="sidebar">
      <div class="brand">Tapkit</div>
      <nav aria-label="Instruments">${instrumentIds.map(id => `<button class="nav-instrument" data-instrument="${id}" draggable="true" title="Drag to reorder"><span class="nav-position"></span><span class="nav-name">${instruments[id].name}</span><span class="nav-grip" aria-hidden="true">⠿</span></button>`).join('')}</nav>
      <p class="sidebar-hint">← / → switch<br>Drag to reorder</p>
    </aside>
    <section class="preferences-content">
      <header class="preferences-header"><h1>Settings</h1></header>
      <div class="settings-workspace">
        <div class="settings-scroll"><div class="instrument-settings"></div></div>
        <aside class="live-preview" aria-label="Instrument preview">
          <div class="preview-heading"><h2>Live preview</h2><p class="preview-description"></p></div>
          <div class="preview-stage"><div class="preview-fit"></div></div>
          <div class="preview-bindings" aria-label="Preview playing keys"></div>
          <p class="preview-hint" role="status"></p>
        </aside>
      </div>
      <footer class="preferences-footer"><button class="reset-button">Reset defaults</button><span class="save-message" role="status">Changes save automatically.</span></footer>
    </section>`;

  const panel = root.querySelector<HTMLElement>('.instrument-settings')!;
  const message = root.querySelector<HTMLElement>('.save-message')!;
  const stage = root.querySelector<HTMLElement>('.preview-stage')!;
  const fit = root.querySelector<HTMLElement>('.preview-fit')!;
  const navigation = root.querySelector<HTMLElement>('nav')!;
  const sidebar = root.querySelector<HTMLElement>('.sidebar')!;
  let dragged: InstrumentId | null = null;
  let dropTarget: { id: InstrumentId; after: boolean } | null = null;
  function syncNavigation() {
    draft.instrumentOrder.forEach((id, index) => {
      const button = navigation.querySelector<HTMLElement>(`[data-instrument="${id}"]`)!;
      if (navigation.children[index] !== button) navigation.insertBefore(button, navigation.children[index] ?? null);
      button.querySelector('.nav-position')!.textContent = String(index + 1);
      button.setAttribute('aria-label', `${index + 1}. ${instruments[id].name}`);
      button.classList.toggle('selected', id === selected);
    });
  }
  function editingBinding(target: EventTarget | null): boolean { return target instanceof Element && Boolean(target.closest('#summon, #range, .binding input, textarea, [contenteditable="true"]')); }
  function previewState(): AppState {
    const settings = { ...draft, instruments: { ...draft.instruments, [selected]: { ...draft.instruments[selected], size: 'm' as const, scale: 1 } } };
    return { settings, activeInstrument: selected, playing: windowFocused && !editingBinding(document.activeElement), status: '' };
  }
  function fitPreview() {
    const current = preview?.previewFrame() ?? { ...instrumentDimensions(selected, 1), left: 0, top: 0 };
    fit.style.width = `${current.width}px`; fit.style.height = `${current.height}px`;
    const host = fit.firstElementChild as HTMLElement | null;
    if (host) { host.style.left = `${-current.left}px`; host.style.top = `${-current.top}px`; }
    const scale = Math.max(.01, Math.min((stage.clientWidth - 12) / current.width, (stage.clientHeight - 12) / current.height));
    fit.style.transform = `scale(${scale})`;
    fit.style.left = `${(stage.clientWidth - current.width * scale) / 2}px`;
    fit.style.top = `${(stage.clientHeight - current.height * scale) / 2}px`;
  }
  function updatePreview() {
    const item = draft.instruments[selected];
    const register = instruments[selected].ranges?.[item.range!]?.label;
    root.querySelector('.preview-description')!.textContent = `${themes[item.theme].name}${register ? ` · ${register}` : ''}`;
    const bindings = root.querySelector<HTMLElement>('.preview-bindings')!;
    bindings.className = `preview-bindings ${selected}-bindings`;
    bindings.innerHTML = instrumentBindings(selected, item.range).map(voice => {
      const label = (selected === 'piano' || selected === 'marimba') && voice.id.startsWith('range-') ? (voice.id === 'range-down' ? '−oct' : '+oct') : voice.label;
      return `<div class="preview-binding" title="${voice.label}"><kbd>${item.keys[voice.id]}</kbd><span>${label}</span></div>`;
    }).join('');
    root.querySelector('.preview-hint')!.textContent = !previewReady ? 'Loading instrument…' : !windowFocused ? 'Focus this window to play.' : editingBinding(document.activeElement) ? 'Finish editing a binding to play.' : 'Play with your instrument’s keys.';
    preview?.update(previewState());
    fitPreview();
  }
  function showPreview() {
    preview?.destroy();
    previewReady = false;
    const host = document.createElement('div');
    fit.replaceChildren(host);
    const current = mountInstrument(host, selected, previewState(), { ...window.tapkit, reportTiming: () => {}, setRange: (id, range) => change(next => { next.instruments[id].range = range; }) }, true, fitPreview);
    preview = current;
    host.setAttribute('aria-busy', 'true');
    void current.ready.then(() => {
      if (preview !== current) return;
      previewReady = true; host.setAttribute('aria-busy', 'false'); updatePreview();
    }).catch(e => {
      if (preview === current) error(`Preview could not load: ${(e as Error).message}`);
    });
    updatePreview();
  }
  // Update in place: acknowledgements must never interrupt a slider drag or key editor.
  function syncControls() {
    syncNavigation();
    const item = draft.instruments[selected];
    panel.querySelectorAll<HTMLElement>('.theme-card').forEach(button => {
      const chosen = button.dataset.theme === item.theme;
      button.classList.toggle('selected', chosen); button.setAttribute('aria-pressed', String(chosen));
    });
    panel.querySelector<HTMLInputElement>('#volume')!.value = String(Math.round(item.volume * 100));
    panel.querySelector('output')!.textContent = `${Math.round(item.volume * 100)}%`;
    const summon = panel.querySelector<HTMLInputElement>('#summon')!;
    if (document.activeElement !== summon) summon.value = shortcutLabel(item.shortcut);
    const bindings = instrumentBindings(selected, item.range);
    panel.querySelectorAll<HTMLInputElement>('[data-voice]').forEach(input => {
      input.value = item.keys[input.dataset.voice!];
      const label = bindings.find(binding => binding.id === input.dataset.voice)!.label;
      input.setAttribute('aria-label', `${label} playing key`);
      input.parentElement!.querySelector('span')!.textContent = label;
    });
    const range = panel.querySelector<HTMLSelectElement>('#range'); if (range) range.value = String(item.range);
    updatePreview();
  }
  function change(edit: (next: Settings) => void) {
    const next = structuredClone(draft);
    edit(next);
    let candidate: Settings;
    try { candidate = validateSettings(next); }
    catch (e) { revision++; error((e as Error).message); syncControls(); return; }
    draft = candidate;
    const current = ++revision;
    pending++;
    syncControls();
    message.classList.remove('error'); message.textContent = 'Saving…';
    // Every edit is sent immediately; main serializes atomic writes, even on window close.
    void window.tapkit.saveSettings(candidate).then(result => {
      if (result.ok) committed = { ...candidate, loops: committed.loops };
      if (current === revision) {
        if (result.ok) { message.classList.remove('error'); message.textContent = 'All changes saved.'; }
        else error(result.error);
      }
    }).catch(e => { if (current === revision) error((e as Error).message); }).finally(() => {
      pending--;
      if (!pending) { draft = structuredClone(committed); syncControls(); }
    });
  }
  function error(text: string) { message.textContent = text; message.classList.add('error'); }
  function shortcutLabel(accelerator: string) { return accelerator.replace('CommandOrControl', '⌘').replace('Control', '⌃').replace('Alt', '⌥').replace('Shift', '⇧').replaceAll('+', ' '); }
  function draw() {
    const id = selected;
    const definition = instruments[id];
    const item = draft.instruments[selected];
    syncNavigation();
    panel.innerHTML = `
      <div class="instrument-heading"><h2>${definition.name}</h2></div>
      <h3 class="section-label">Style for all instruments</h3>
      <div class="theme-grid">${themeIds.map(theme => `<button class="theme-card ${item.theme === theme ? 'selected' : ''}" data-theme="${theme}" aria-pressed="${item.theme === theme}"><div class="theme-preview ${theme}"><img src="${asset(instrumentArtwork(selected, theme, true))}" alt="${themes[theme].name} ${definition.name}" draggable="false"/><span class="theme-check">✓</span></div><div class="theme-card-label"><span>${themes[theme].name}</span><i style="background:${themes[theme].accent}"></i></div></button>`).join('')}</div>
      <h3 class="section-label">Sound</h3>
      ${definition.ranges ? `<div class="settings-row"><label for="range">${id === 'piano' ? 'Octave range' : 'Register'}</label><span class="select-control"><select id="range" aria-label="${id === 'piano' ? 'Octave range' : 'Register'}">${definition.ranges.map((range, index) => `<option value="${index}" ${index === item.range ? 'selected' : ''}>${range.label}</option>`).join('')}</select></span></div>` : ''}
      <div class="settings-row"><label for="volume">Instrument volume</label><div class="volume-control"><span>−</span><input id="volume" type="range" min="0" max="100" value="${Math.round(item.volume * 100)}"/><output>${Math.round(item.volume * 100)}%</output></div></div>
      <div class="settings-row shortcut-row"><div><label for="summon">Summon shortcut</label><p>Click the field, then press a shortcut.</p></div><input id="summon" class="shortcut-input" aria-label="Summon shortcut" readonly value="${shortcutLabel(item.shortcut)}" title="Click, then press a shortcut with modifiers"/></div>
      <h3 class="section-label key-section">Playing keys</h3>
      <div class="binding-grid">${instrumentBindings(id, item.range).map(voice => `<label class="binding"><input aria-label="${voice.label} playing key" data-voice="${voice.id}" type="text" maxlength="1" value="${item.keys[voice.id]}" autocomplete="off" spellcheck="false"/><span>${voice.label}</span></label>`).join('')}</div>
      <p class="settings-note">Click a key to change its binding. Preview playback pauses while you edit.</p>`;

    panel.querySelectorAll<HTMLButtonElement>('.theme-card').forEach(button => button.addEventListener('click', () => {
      change(next => { setSharedAppearance(next, { theme: button.dataset.theme as typeof item.theme }); });
    }));
    if (selected === 'piano') panel.querySelectorAll<HTMLImageElement>('.theme-preview img').forEach(image => { image.style.clipPath = pianoClip; image.style.height = 'auto'; image.style.width = '97%'; });
    const volume = panel.querySelector<HTMLInputElement>('#volume')!;
    panel.querySelector<HTMLSelectElement>('#range')?.addEventListener('change', event => {
      const select = event.target as HTMLSelectElement;
      change(next => { next.instruments[id].range = Number(select.value); }); select.blur();
    });
    volume.addEventListener('input', () => change(next => { next.instruments[id].volume = Number(volume.value) / 100; }));
    const summon = panel.querySelector<HTMLInputElement>('#summon')!;
    summon.addEventListener('focus', () => { summon.value = 'Press shortcut…'; });
    summon.addEventListener('blur', () => { summon.value = shortcutLabel(draft.instruments[id].shortcut); });
    summon.addEventListener('keydown', event => {
      event.preventDefault(); event.stopPropagation();
      if (event.key === 'Escape') { summon.blur(); return; }
      const letter = /^Key[A-Z]$/.test(event.code) ? event.code.slice(3) : /^Digit[0-9]$/.test(event.code) ? event.code.slice(5) : event.key;
      if (!/^[a-z0-9]$/i.test(letter)) return;
      const modifiers = [event.metaKey && 'CommandOrControl', event.ctrlKey && 'Control', event.altKey && 'Alt', event.shiftKey && 'Shift'].filter(Boolean);
      if (!modifiers.length) { error('Use a modifier with the summon shortcut.'); return; }
      change(next => { next.instruments[id].shortcut = normalizeAccelerator([...modifiers, letter].join('+')); });
      summon.blur();
    });
    panel.querySelectorAll<HTMLInputElement>('[data-voice]').forEach(input => {
      input.addEventListener('focus', () => input.select());
      input.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); input.blur(); return; }
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        if (/^[a-z0-9]$/i.test(event.key)) {
          event.preventDefault(); change(next => { next.instruments[id].keys[input.dataset.voice!] = event.key.toUpperCase(); });
        }
      });
      input.addEventListener('input', () => change(next => { next.instruments[id].keys[input.dataset.voice!] = input.value.toUpperCase(); }));
    });
  }
  function selectInstrument(id: InstrumentId) {
    if (id === selected) return;
    selected = id; draw(); root.querySelector('.settings-scroll')!.scrollTop = 0; showPreview();
  }
  function clearDrag() {
    dragged = null; dropTarget = null;
    sidebar.classList.remove('reordering');
    navigation.querySelectorAll('.nav-dragging, .drop-before, .drop-after').forEach(button => button.classList.remove('nav-dragging', 'drop-before', 'drop-after'));
  }
  function updateDropTarget(y: number) {
    navigation.querySelectorAll('.drop-before, .drop-after').forEach(row => row.classList.remove('drop-before', 'drop-after'));
    const rows = [...navigation.querySelectorAll<HTMLElement>('[data-instrument]')].filter(row => row.dataset.instrument !== dragged);
    const before = rows.find(row => { const bounds = row.getBoundingClientRect(); return y < bounds.top + bounds.height / 2; });
    const row = before ?? rows.at(-1);
    dropTarget = row ? { id: row.dataset.instrument as InstrumentId, after: !before } : null;
    row?.classList.add(before ? 'drop-before' : 'drop-after');
  }
  navigation.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLElement>('[data-instrument]');
    if (button) selectInstrument(button.dataset.instrument as InstrumentId);
  });
  navigation.addEventListener('dragstart', event => {
    const button = (event.target as Element).closest<HTMLElement>('[data-instrument]');
    if (!button || !event.dataTransfer) return;
    dragged = button.dataset.instrument as InstrumentId;
    event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', dragged);
    sidebar.classList.add('reordering');
    button.classList.add('nav-dragging');
  });
  sidebar.addEventListener('dragover', event => {
    if (!dragged) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    updateDropTarget(event.clientY);
  });
  sidebar.addEventListener('drop', event => {
    if (!dragged) return;
    event.preventDefault();
    updateDropTarget(event.clientY);
    if (dropTarget) {
      const order = draft.instrumentOrder.filter(id => id !== dragged);
      order.splice(order.indexOf(dropTarget.id) + Number(dropTarget.after), 0, dragged);
      if (order.some((id, index) => id !== draft.instrumentOrder[index])) change(next => { next.instrumentOrder = order; });
    }
    clearDrag();
  });
  navigation.addEventListener('dragend', clearDrag);
  sidebar.addEventListener('dragleave', event => {
    if (!(event.relatedTarget instanceof Node) || !sidebar.contains(event.relatedTarget)) {
      dropTarget = null;
      navigation.querySelectorAll('.drop-before, .drop-after').forEach(button => button.classList.remove('drop-before', 'drop-after'));
    }
  });
  root.querySelector('.reset-button')!.addEventListener('click', () => change(next => {
    const defaults = defaultSettings(); next.instruments = defaults.instruments; next.instrumentOrder = defaults.instrumentOrder;
    setSharedAppearance(next, { scale: 1 });
  }));
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.isComposing) return;
    if (event.key === 'Tab') { event.preventDefault(); return; }
    if (event.key === 'Escape') { window.tapkit.closeSettings(); return; }
    if (event.metaKey && event.key.toLowerCase() === 's') { event.preventDefault(); return; }
    if (!windowFocused || editingBinding(event.target) || editingBinding(document.activeElement)) return;
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    // Handle keys here rather than triggering native button/slider defaults.
    event.preventDefault();
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { selectInstrument(adjacentInstrument(draft.instrumentOrder, selected, event.key === 'ArrowLeft' ? -1 : 1)); return; }
    const voice = instrumentBindings(selected).find(voice => draft.instruments[selected].keys[voice.id] === event.key.toUpperCase());
    if (!voice) return;
    preview?.play({ voiceId: voice.id, sentAt: performance.timeOrigin + performance.now() });
  });
  root.addEventListener('focusin', updatePreview);
  root.addEventListener('focusout', () => queueMicrotask(updatePreview));
  window.addEventListener('blur', () => { windowFocused = false; updatePreview(); });
  window.addEventListener('focus', () => { windowFocused = true; updatePreview(); });
  const unsubscribe = window.tapkit.onState(next => {
    committed = structuredClone(next.settings);
    draft.loops = structuredClone(next.settings.loops);
    if (!pending) { draft = structuredClone(committed); syncControls(); }
  });
  let fitFrame = 0;
  const observer = new ResizeObserver(() => {
    if (!fitFrame) fitFrame = requestAnimationFrame(() => { fitFrame = 0; fitPreview(); });
  });
  observer.observe(stage);
  window.addEventListener('pagehide', () => { observer.disconnect(); cancelAnimationFrame(fitFrame); unsubscribe(); preview?.destroy(); }, { once: true });
  if (initial.status) error(initial.status);
  draw(); showPreview();
}
