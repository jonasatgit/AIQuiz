(() => {
  'use strict';

  const vocabulary = ['the', 'sky', 'is', 'blue', 'gray', 'clear', 'today', '.'];
  const width = 4;
  const heads = 2;
  const headWidth = width / heads;
  const limit = 12;
  const vector = (length, fn) => Array.from({ length }, (_, i) => fn(i));
  const add = (a, b) => a.map((value, i) => value + b[i]);
  const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
  const linear = (input, weights) => weights.map(row => dot(row, input));
  const layerNorm = input => {
    const mean = input.reduce((sum, value) => sum + value, 0) / input.length;
    const centered = input.map(value => value - mean);
    const scale = Math.sqrt(dot(centered, centered) / input.length + 1e-5);
    return centered.map(value => value / scale);
  };
  const softmax = scores => {
    const offset = Math.max(...scores);
    const exp = scores.map(score => Math.exp(score - offset));
    const total = exp.reduce((sum, value) => sum + value, 0);
    return exp.map(value => value / total);
  };

  let seed = 41;
  const weight = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32 - .5;
  };
  const matrix = (rows, cols) => vector(rows, () => vector(cols, weight));
  const embeddings = matrix(vocabulary.length, width);
  const positions = matrix(limit, width);
  const blocks = vector(2, () => ({
    q: matrix(width, width), k: matrix(width, width), v: matrix(width, width),
    mix: matrix(width, width), expand: matrix(8, width), contract: matrix(width, 8)
  }));
  const readout = matrix(vocabulary.length, width);

  function transformer(input, block) {
    const norm = input.map(layerNorm);
    const query = norm.map(row => linear(row, block.q));
    const keys = norm.map(row => linear(row, block.k));
    const values = norm.map(row => linear(row, block.v));
    const trace = input.map((row, i) => {
      const weights = [];
      const mixed = vector(heads, head => {
        const split = vec => vec.slice(head * headWidth, (head + 1) * headWidth);
        const q = split(query[i]);
        // Excluding future keys before softmax is equivalent to masking their scores with -Infinity.
        const visible = softmax(keys.slice(0, i + 1).map(key => dot(q, split(key)) / Math.sqrt(headWidth)));
        weights.push(visible);
        return vector(headWidth, j => visible.reduce((sum, p, k) => sum + p * split(values[k])[j], 0));
      }).flat();
      const attended = linear(mixed, block.mix);
      const residual = add(row, attended);
      const normalized = layerNorm(residual);
      const hidden = linear(normalized, block.expand).map(value => Math.max(0, value));
      const mlp = linear(hidden, block.contract);
      return { values: [norm[i], attended, residual, normalized, mlp, add(residual, mlp)], weights };
    });
    return { output: trace.map(row => row.values.at(-1)), trace };
  }

  function predict(tokens) {
    const embedded = tokens.map((id, i) => add(embeddings[id], positions[i]));
    const first = transformer(embedded, blocks[0]);
    const second = transformer(first.output, blocks[1]);
    const normalized = layerNorm(second.output.at(-1));
    const logits = linear(normalized, readout);
    const probabilities = softmax(logits);
    const ranking = vocabulary.map((_, i) => i).sort((a, b) => probabilities[b] - probabilities[a]);
    return { embedded, traces: [first.trace, second.trace], normalized, logits, probabilities, ranking };
  }

  const stages = [
    ['Input', 'Turn text into token IDs',
      'A tokenizer maps pieces of text to vocabulary IDs. In this demo, each word or period is one token; real tokenizers often split words into smaller pieces.',
      'Both start with input the machine can process: on/off pixels there, token IDs here.'],
    ['Embedding', 'Give each token a vector',
      'Look up each token’s embedding and add a vector for its position. The result gives later layers numerical information about both token identity and order.',
      'The perceptron takes numbers directly. The transformer first turns each ID into a row of numbers.'],
    ['Transformer', 'Mix earlier context into each token',
      'Each block normalizes its input, mixes earlier and current positions using two attention heads, and adds that result back. Then it normalizes again, applies a feed-forward network (MLP) to each position separately, and adds that result back. The second block repeats the operation with different weights.',
      'Both combine values with weights. Here attention computes fresh mixing weights from the current input instead of using one fixed weight per pixel.'],
    ['Projection', 'Score every possible next token',
      'After the last block, normalize the final position and multiply it by a vocabulary weight matrix. Each row makes one raw score, called a logit. Larger logits favor those tokens; logits are not probabilities.',
      'Each vocabulary row makes a weighted sum much like the perceptron’s single score, except this demo’s projection has no bias.'],
    ['Softmax', 'Turn scores into probabilities',
      'Softmax exponentiates scores and divides by their sum. The probabilities add up to 100% before rounding. This demo shows the whole eight-token vocabulary.',
      'Instead of thresholding one score into 0 or 1, the transformer compares scores across possible next tokens.'],
    ['Output', 'Select a token and feed it back',
      'This demo uses greedy decoding: choose the highest-probability token. Real systems can instead sample from the distribution. Append it to the prompt and run the same stages again to predict one more token.',
      'The perceptron’s decision ends the pass. An LLM can use its decision as part of the next input.']
  ];

  const $ = id => document.getElementById(id);
  const buttons = [...$('llm-flow').querySelectorAll('button')];
  const play = $('llm-play');
  const prev = $('llm-prev');
  const next = $('llm-next');
  const prompt = $('llm-prompt');
  const query = $('llm-query');
  const block = $('llm-block-number');
  const operations = [...$('llm-block').querySelectorAll('button')];
  const branches = [...$('llm-block').querySelectorAll('.llm-branch')];
  const operationLabels = ['Normalize the block input', 'Mix visible context', 'Add back the block input',
    'Normalize after attention', 'Apply the feed-forward network with ReLU', 'Add back the attention residual'];
  const append = $('llm-append');
  const scroll = $('llm-scroll');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const last = stages.length - 1;
  let step = 0;
  let operation = 1;
  let timer = null;
  let feedback = false;
  let tokens;
  let result;

  const readable = vec => `[${vec.map(value => value.toFixed(2)).join(', ')}]`;
  const percent = value => `${(value * 100).toFixed(1)}%`;
  const chips = items => `<div class="llm-chips">${items.map(([label, selected]) =>
    `<span class="llm-chip${selected ? ' selected' : ''}">${label}</span>`).join('')}</div>`;
  const table = (headers, rows) => `<table class="llm-trace-table"><thead><tr>${headers.map(label =>
    `<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${rows.map(([label, ...cells]) =>
    `<tr><th scope="row">${label}</th>${cells.map(value => `<td>${value}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

  function renderAttention() {
    const i = Number(query.value);
    const { values, weights } = result.traces[Number(block.value)][i];
    $('llm-trace').innerHTML = `<p><strong>${operationLabels[operation]}:</strong> <code>${readable(values[operation])}</code></p>`;
    operations.forEach((button, index) => {
      button.setAttribute('aria-pressed', String(index === operation));
    });
    branches.forEach((branch, index) => branch.classList.toggle('adding', operation === index * 3 + 2));
    $('llm-weights').innerHTML = table(['Key position', 'Head 1', 'Head 2'],
      tokens.map((id, k) => [`${k + 1} · ${vocabulary[id]}`, ...weights.map(head => k > i ? 'Masked' : percent(head[k]))]));
  }

  function renderTrace() {
    const i = tokens.length - 1;
    const id = tokens[i];
    const winner = result.ranking[0];
    const trace = $('llm-trace');
    const labels = ['Token IDs', `Embedding at position ${i + 1}`, 'Inside the transformer',
      'Vocabulary logits', 'Next-token probabilities', 'Greedy selection'];
    $('llm-trace-label').textContent = labels[step];
    $('llm-block').hidden = step !== 2;
    $('llm-attention').hidden = step !== 2;
    append.hidden = step !== last;
    append.disabled = tokens.length >= limit;
    $('llm-limit').hidden = step !== last || !append.disabled;

    switch (step) {
      case 0:
        trace.innerHTML = chips(tokens.map((token, index) => [`${vocabulary[token]} · ID ${token}`, feedback && index === i])) +
          (feedback ? '<p>The highlighted token came from the previous output.</p>' : '');
        break;
      case 1:
        trace.innerHTML = table(['Vector', 'Values (rounded)'], [
          [`Token “${vocabulary[id]}”`, readable(embeddings[id])],
          [`Position ${i + 1}`, readable(positions[i])],
          ['Sum', readable(result.embedded[i])]
        ]);
        break;
      case 2:
        renderAttention();
        break;
      case 3:
        trace.innerHTML = `<p>Final normalized vector: <code>${readable(result.normalized)}</code></p>` +
          '<div class="llm-score-map"><span><strong>Perceptron</strong> Weighted sum → threshold → 0 or 1</span>' +
          '<span><strong>Transformer</strong> One weighted sum per token → softmax → distribution</span></div>' +
          table(['Token', 'Logit'], result.ranking.map(token => [vocabulary[token], result.logits[token].toFixed(3)]));
        break;
      case 4:
        trace.innerHTML = result.ranking.map(token => {
          const probability = percent(result.probabilities[token]);
          return `<div class="llm-bar-row"><span>${vocabulary[token]}</span><div class="llm-bar" aria-hidden="true"><span style="width:${probability}"></span></div><strong>${probability}</strong></div>`;
        }).join('');
        break;
      case 5:
        trace.innerHTML = chips([...tokens.map(token => [vocabulary[token], false]), [vocabulary[winner], true]]) +
          `<p>Selected <strong>${vocabulary[winner]}</strong> (${percent(result.probabilities[winner])}).</p>`;
        break;
    }
  }

  function showStep(index, follow = false) {
    const previous = step;
    step = index;
    const [name, title, detail, parallel] = stages[index];
    $('llm-step-label').textContent = `Step 0${index + 1} / 06`;
    $('llm-step-title').textContent = title;
    $('llm-step-detail').textContent = detail;
    $('llm-parallel').textContent = parallel;
    $('llm-progress').textContent = `${index + 1} of ${stages.length} · ${name}`;
    buttons.forEach((button, i) => {
      button.setAttribute('aria-pressed', String(i === index));
      button.parentElement.classList.toggle('passed', i < index);
      button.parentElement.classList.toggle('sending', follow && index === previous + 1 && i === previous);
    });
    prev.disabled = index === 0;
    next.disabled = index === last;
    renderTrace();

    if (follow) {
      const box = scroll.getBoundingClientRect();
      const stage = buttons[index].getBoundingClientRect();
      if (stage.left < box.left + 5 || stage.right > box.right - 5) {
        scroll.scrollTo({
          left: scroll.scrollLeft + stage.left - box.left + (stage.width - box.width) / 2,
          behavior: reducedMotion.matches ? 'instant' : 'smooth'
        });
      }
    }
  }

  function stop() {
    clearTimeout(timer);
    timer = null;
    play.textContent = step === last ? 'Replay flow' : 'Play flow';
  }

  function start() {
    if (step === last) showStep(0, true);
    play.textContent = 'Pause flow';
    scheduleStep();
  }

  function scheduleStep() {
    timer = setTimeout(() => {
      if (step === 2 && (operation < operations.length - 1 || block.value === '0')) {
        if (operation === operations.length - 1) {
          block.value = '1';
          operation = 0;
        } else {
          operation++;
        }
        renderAttention();
      } else {
        if (step === 1) {
          block.value = '0';
          operation = 0;
        }
        showStep(step + 1, true);
      }
      if (step === last) stop();
      else scheduleStep();
    }, step === 2 ? 750 : 1400);
  }

  function load(context, fromOutput = false) {
    tokens = context;
    feedback = fromOutput;
    result = predict(tokens);
    query.replaceChildren(...tokens.map((id, i) => new Option(`${i + 1} · ${vocabulary[id]}`, i)));
    query.value = 1;
    showStep(0, true);
    stop();
  }

  const reset = () => load(prompt.value.split(' ').map(token => vocabulary.indexOf(token)));
  prompt.addEventListener('change', reset);
  $('llm-reset').addEventListener('click', reset);
  play.addEventListener('click', () => timer === null ? start() : stop());
  query.addEventListener('change', renderAttention);
  block.addEventListener('change', renderAttention);
  [query, block, ...operations].forEach(control => control.addEventListener('focus', stop));
  operations.forEach((button, index) => button.addEventListener('click', () => {
    operation = index;
    renderAttention();
  }));
  function jump(index) {
    if (index === 2 && step !== 2) {
      block.value = '1';
      operation = 1;
    }
    showStep(index, true);
    stop();
  }
  prev.addEventListener('click', () => jump(step - 1));
  next.addEventListener('click', () => jump(step + 1));
  buttons.forEach((button, i) => button.addEventListener('click', () => jump(i)));
  append.addEventListener('click', () => {
    load([...tokens, result.ranking[0]], true);
    play.focus();
    start();
  });
  window.addEventListener('pagehide', stop);
  window.addEventListener('message', event => {
    if (event.source === window.parent && event.data?.type === 'demo-visibility' && event.data.visible === false) stop();
  });
  reset();
})();
