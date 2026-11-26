(() => {
  'use strict';

  const DEFAULT_INPUTS = [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,1,1,1];
  const DEFAULT_WEIGHTS = [4,-2.5,-2.5,-2.5, 4,-2.5,-2.5,-2.5, 4,-2.5,-2.5,-2.5, 4,4,4,4];
  const state = {
    inputs: [...DEFAULT_INPUTS],
    weights: [...DEFAULT_WEIGHTS],
    bias: -22,
    editing: null
  };

  const $ = (selector) => document.querySelector(selector);
  const ledGrid = $('#ledGrid');
  const knobGrid = $('#knobGrid');
  const biasMount = $('#biasMount');
  const editor = $('#dialEditor');
  const dialInput = $('#dialInput');
  const editorLabel = $('#editorLabel');

  const format = (value, digits = 1) => {
    const n = Math.abs(value) < 0.00001 ? 0 : value;
    return `${n > 0 ? '+' : ''}${n.toFixed(digits)}`;
  };
  const digitalFormat = (value, digits = 2) => {
    const n = Math.abs(value) < 0.00001 ? 0 : value;
    if (n < 0) return `−${Math.abs(n).toFixed(digits)}`;
    return `${n > 0 ? '+' : ' '}${n.toFixed(digits)}`;
  };
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  function drawWires() {
    const baseplate = $('.baseplate');
    const svg = $('#wireLayer');
    const group = $('#wirePaths');
    if (!baseplate || !svg || !group) return;

    const base = baseplate.getBoundingClientRect();
    if (!base.width || !base.height) return;
    svg.setAttribute('viewBox', `0 0 ${base.width} ${base.height}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    group.replaceChildren();

    const panelAnchor = (selector, side, fraction) => {
      const panel = document.querySelector(selector);
      if (!panel) return null;
      const rect = panel.getBoundingClientRect();
      return {
        x: rect.left - base.left + rect.width * fraction,
        y: (side === 'top' ? rect.top + 5 : rect.bottom - 5) - base.top
      };
    };
    const mobile = window.matchMedia('(max-width: 680px)').matches;
    const stacked = window.matchMedia('(max-width: 1300px)').matches;
    const cableRuns = [
      { from: '.led-module', to: '.weight-panel', start: .52, end: .2 },
      { from: '.weight-panel', to: '.compute-module', start: .85, end: .5 },
      { from: '.compute-module', to: '.meter-case', start: .75, end: .55 }
    ];
    const colors = ['cable-red', 'cable-orange', 'cable-yellow', 'cable-green', 'cable-blue', 'cable-black'];
    const ns = 'http://www.w3.org/2000/svg';

    cableRuns.forEach((run, runIndex) => {
      const vertical = mobile || (stacked && runIndex === 1);
      const from = panelAnchor(run.from, vertical ? 'bottom' : 'top', vertical ? .75 : run.start);
      const to = panelAnchor(run.to, 'top', vertical ? .75 : run.end);
      if (!from || !to) return;

      colors.forEach((colorClass, wireIndex) => {
        const offset = (wireIndex - (colors.length - 1) / 2) * 3.5;
        const startX = from.x + offset;
        const endX = to.x + offset;
        let d;
        if (vertical) {
          const middleY = (from.y + to.y) / 2 + offset * .25;
          d = `M ${startX} ${from.y} C ${startX} ${middleY}, ${endX} ${middleY}, ${endX} ${to.y}`;
        } else {
          const lift = Math.max(14, Math.min(from.y, to.y) - 105 - wireIndex * 2);
          d = `M ${startX} ${from.y} C ${startX} ${lift}, ${endX} ${lift}, ${endX} ${to.y}`;
        }

        ['cable-shadow', `cable-wire ${colorClass}`, 'cable-highlight'].forEach(className => {
          const path = document.createElementNS(ns, 'path');
          path.setAttribute('d', d);
          path.setAttribute('class', className);
          path.dataset.run = String(runIndex);
          group.appendChild(path);
        });
      });
    });
  }

  function buildInputs() {
    ledGrid.innerHTML = '';
    state.inputs.forEach((value, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `led${value ? ' on' : ''}`;
      button.setAttribute('aria-label', `Input ${index + 1}: ${value ? 'on' : 'off'}`);
      button.setAttribute('aria-pressed', String(Boolean(value)));
      button.addEventListener('click', () => {
        state.inputs[index] = state.inputs[index] ? 0 : 1;
        syncInputs();
        update();
        setStatus(`Input ${index + 1} switched ${state.inputs[index] ? 'ON' : 'OFF'}.`);
      });
      ledGrid.appendChild(button);
    });
  }

  function createKnob(index, isBias = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'knob-control';
    button.dataset.type = isBias ? 'bias' : 'weight';
    if (!isBias) button.dataset.index = index;
    const value = isBias ? state.bias : state.weights[index];
    const name = isBias ? 'Bias' : `Weight ${index + 1}`;
    button.setAttribute('aria-label', `${name}: ${value}. Click to enter a value.`);
    button.innerHTML = `<span class="knob-dial"><i class="knob-pointer"></i></span><span class="knob-value"></span>`;
    button.addEventListener('click', () => openEditor(button, index, isBias));
    renderKnob(button, value, isBias);
    return button;
  }

  function buildKnobs() {
    knobGrid.innerHTML = '';
    state.weights.forEach((_, index) => knobGrid.appendChild(createKnob(index)));
    biasMount.innerHTML = '';
    biasMount.appendChild(createKnob(0, true));
  }

  function renderKnob(button, value, isBias = false) {
    const range = isBias ? 30 : 10;
    const angle = clamp(value / range, -1, 1) * 135;
    button.querySelector('.knob-pointer').style.transform = `rotate(${angle}deg)`;
    button.querySelector('.knob-value').textContent = format(value);
    const name = isBias ? 'Bias' : `Weight ${Number(button.dataset.index) + 1}`;
    button.setAttribute('aria-label', `${name}: ${value}. Click to enter a value.`);
  }

  function syncInputs() {
    [...ledGrid.children].forEach((button, index) => {
      const active = Boolean(state.inputs[index]);
      button.classList.toggle('on', active);
      button.setAttribute('aria-pressed', String(active));
      button.setAttribute('aria-label', `Input ${index + 1}: ${active ? 'on' : 'off'}`);
    });
  }

  function syncKnobs() {
    [...knobGrid.children].forEach((button, index) => renderKnob(button, state.weights[index]));
    renderKnob(biasMount.querySelector('.knob-control'), state.bias, true);
  }

  function calculate() {
    const weightedSum = state.inputs.reduce((sum, x, i) => sum + x * state.weights[i], 0);
    const score = weightedSum + state.bias;
    const output = score >= 0 ? 1 : 0;
    return { weightedSum, score, output };
  }

  function update() {
    const { weightedSum, score, output } = calculate();
    const active = state.inputs.reduce((a, b) => a + b, 0);
    $('#activeCount').textContent = `${active} / 16`;
    $('#weightedSum').textContent = weightedSum.toFixed(2);
    $('#finalScore').textContent = score.toFixed(2);
    $('#binaryOutput').textContent = output;
    $('#moduleWeightedSum').textContent = digitalFormat(weightedSum);
    $('#moduleBias').textContent = digitalFormat(state.bias);
    $('#moduleFinalZ').textContent = digitalFormat(score);
    $('#moduleActivation').textContent = output;
    $('#moduleActivation').classList.toggle('on', Boolean(output));
    $('#equationDetail').textContent = `${weightedSum.toFixed(2)} + (${state.bias < 0 ? '−' + Math.abs(state.bias).toFixed(2) : '+' + state.bias.toFixed(2)}) = ${score.toFixed(2)} → z ${output ? '≥' : '<'} 0`;
    $('#classificationText').textContent = output ? 'MATCH' : 'NO MATCH';
    $('#resultLamp').classList.toggle('on', Boolean(output));
    $('#circuitLed').classList.toggle('on', Boolean(output));

    // The analog display is intentionally normalized to a fixed score window.
    const meterValue = clamp((score + 40) / 80 * 100, 0, 100);
    const angle = -60 + meterValue * 1.2;
    $('#needleGroup').setAttribute('transform', `rotate(${angle.toFixed(2)} 150 145)`);
  }

  function openEditor(button, index, isBias) {
    state.editing = { button, index, isBias };
    const value = isBias ? state.bias : state.weights[index];
    editorLabel.textContent = isBias ? 'BIAS / b' : `WEIGHT ${String(index + 1).padStart(2, '0')} / w${index + 1}`;
    dialInput.min = isBias ? -30 : -10;
    dialInput.max = isBias ? 30 : 10;
    dialInput.value = Number(value.toFixed(2));
    editor.hidden = false;

    const rect = button.getBoundingClientRect();
    const width = 240;
    let left = rect.left + rect.width / 2 - 28;
    let top = rect.bottom + 9;
    if (left + width > window.innerWidth - 12) left = window.innerWidth - width - 12;
    if (left < 12) left = 12;
    if (top + 150 > window.innerHeight) top = rect.top - 155;
    editor.style.left = `${left + window.scrollX}px`;
    editor.style.top = `${top + window.scrollY}px`;
    requestAnimationFrame(() => { dialInput.focus(); dialInput.select(); });
  }

  function closeEditor() {
    editor.hidden = true;
    state.editing = null;
  }

  function applyEditor() {
    if (!state.editing) return;
    const { index, isBias } = state.editing;
    const min = Number(dialInput.min);
    const max = Number(dialInput.max);
    const parsed = Number(dialInput.value);
    if (!Number.isFinite(parsed)) {
      dialInput.setCustomValidity('Enter a valid number.');
      dialInput.reportValidity();
      return;
    }
    dialInput.setCustomValidity('');
    const value = clamp(parsed, min, max);
    if (isBias) state.bias = value;
    else state.weights[index] = value;
    syncKnobs();
    update();
    setStatus(`${isBias ? 'Bias' : `Weight ${index + 1}`} set to ${format(value)}.`);
    closeEditor();
  }

  function setStatus(text, kind = 'normal') {
    const line = $('#statusLine');
    line.textContent = text;
    line.style.borderLeftColor = kind === 'error' ? '#a84535' : kind === 'success' ? '#80a94e' : '#5d813d';
  }

  function setPattern(pattern) {
    state.inputs = [...pattern];
    syncInputs();
    update();
  }

  function teach(target) {
    const rate = clamp(Number($('#learningRate').value) || 1, 0.01, 10);
    const before = calculate();
    const error = target - before.output;
    if (error === 0) {
      setStatus(`No update: the machine already predicts ${target}.`, 'success');
      return;
    }
    state.weights = state.weights.map((w, i) => clamp(w + rate * error * state.inputs[i], -10, 10));
    state.bias = clamp(state.bias + rate * error, -30, 30);
    syncKnobs();
    update();
    const after = calculate();
    setStatus(`Correction applied: error ${error > 0 ? '+' : ''}${error}, η ${rate}. New score ${after.score.toFixed(2)}.`, 'success');
  }

  function drawMeterTicks() {
    const group = $('#meterTicks');
    for (let i = 0; i <= 20; i++) {
      const angle = -60 + i * 6;
      const radians = angle * Math.PI / 180;
      const outer = 120;
      const inner = i % 5 === 0 ? 104 : 111;
      const x1 = 150 + Math.sin(radians) * inner;
      const y1 = 145 - Math.cos(radians) * inner;
      const x2 = 150 + Math.sin(radians) * outer;
      const y2 = 145 - Math.cos(radians) * outer;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x1); line.setAttribute('y1', y1);
      line.setAttribute('x2', x2); line.setAttribute('y2', y2);
      line.setAttribute('class', `meter-tick${i % 5 === 0 ? ' major' : ''}`);
      group.appendChild(line);
    }
  }

  $('#applyEdit').addEventListener('click', applyEditor);
  $('#cancelEdit').addEventListener('click', closeEditor);
  $('#incrementBtn').addEventListener('click', () => { dialInput.stepUp(); dialInput.focus(); });
  $('#decrementBtn').addEventListener('click', () => { dialInput.stepDown(); dialInput.focus(); });
  dialInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') applyEditor();
    if (event.key === 'Escape') closeEditor();
  });
  document.addEventListener('pointerdown', (event) => {
    if (!editor.hidden && !editor.contains(event.target) && !event.target.closest('.knob-control')) applyEditor();
  });

  $('#loadLBtn').addEventListener('click', () => {
    setPattern(DEFAULT_INPUTS);
    setStatus('The 4×4 letter L is loaded. The preset should classify it as a match.', 'success');
  });
  $('#clearBtn').addEventListener('click', () => {
    setPattern(Array(16).fill(0));
    setStatus('Input lights cleared.');
  });
  $('#noiseBtn').addEventListener('click', () => {
    const candidates = state.inputs.map((_, i) => i);
    const count = 1 + Math.floor(Math.random() * 3);
    for (let n = 0; n < count; n++) {
      const pick = Math.floor(Math.random() * candidates.length);
      const i = candidates.splice(pick, 1)[0];
      state.inputs[i] = state.inputs[i] ? 0 : 1;
    }
    syncInputs(); update();
    setStatus(`${count} random pixel${count > 1 ? 's were' : ' was'} flipped.`);
  });
  $('#resetBtn').addEventListener('click', () => {
    state.inputs = [...DEFAULT_INPUTS];
    state.weights = [...DEFAULT_WEIGHTS];
    state.bias = -22;
    syncInputs(); syncKnobs(); update();
    setStatus('Inputs, weights, and bias restored to the L-recognizer preset.', 'success');
  });
  $('#teachYesBtn').addEventListener('click', () => teach(1));
  $('#teachNoBtn').addEventListener('click', () => teach(0));

  drawMeterTicks();
  buildInputs();
  buildKnobs();
  update();
  requestAnimationFrame(() => requestAnimationFrame(drawWires));
  let wireResizeFrame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(wireResizeFrame);
    wireResizeFrame = requestAnimationFrame(drawWires);
  });
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(wireResizeFrame);
      wireResizeFrame = requestAnimationFrame(drawWires);
    });
    observer.observe($('.baseplate'));
  }
})();
