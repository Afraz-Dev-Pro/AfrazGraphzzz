(() => {
  'use strict';
  const colors = ['#287f62', '#e18a52', '#8170cf', '#3785ad', '#d65f70', '#869d36'];
  const MAX_EXPRESSION_LENGTH = 256;
  const MAX_TOKEN_COUNT = 128;
  const MAX_PARSE_DEPTH = 32;
  const MAX_EQUATIONS = 8;
  const list = document.querySelector('#equationList');
  const canvas = document.querySelector('#graphCanvas');
  const ctx = canvas.getContext('2d');
  const wrap = document.querySelector('#canvasWrap');
  let equations = [{ id: 1, expression: 'x^2', visible: true, color: colors[0], error: '' }];
  let nextId = 2;
  let view = { x: 0, y: 0, scale: 48 };
  try {
    const savedEquations = JSON.parse(localStorage.getItem('graphite.equations') || 'null');
    if (Array.isArray(savedEquations) && savedEquations.length) {
      equations = savedEquations.filter(item => item && Number.isInteger(item.id) && typeof item.expression === 'string' && item.expression.length <= MAX_EXPRESSION_LENGTH).slice(0, MAX_EQUATIONS).map((item, index) => ({ id: item.id, expression: item.expression, visible: item.visible !== false, color: colors[index % colors.length], error: '' }));
      if (!equations.length) equations = [{ id: 1, expression: 'x^2', visible: true, color: colors[0], error: '' }];
      nextId = Math.max(...equations.map(item => item.id)) + 1;
    }
    const savedView = JSON.parse(localStorage.getItem('graphite.view') || 'null');
    if (savedView && Number.isFinite(savedView.x) && Number.isFinite(savedView.y) && Number.isFinite(savedView.scale)) view = { x: savedView.x, y: savedView.y, scale: Math.min(420, Math.max(8, savedView.scale)) };
  } catch { /* Storage may be disabled; the calculator still works for this session. */ }
  let dimensions = { width: 0, height: 0, dpr: 1 };
  let pointer = null;
  let pinch = null;
  let selectedPoint = null;
  const activePointers = new Map();
  let raf = 0;
  const fmt = n => Number.isFinite(n) ? (Math.abs(n) >= 1000 || (Math.abs(n) < .001 && n !== 0) ? n.toExponential(2) : Number(n.toFixed(3)).toString()) : '—';
  function saveState() {
    try {
      localStorage.setItem('graphite.equations', JSON.stringify(equations.map(({ id, expression, visible }) => ({ id, expression, visible }))));
      localStorage.setItem('graphite.view', JSON.stringify(view));
    } catch { /* Storage may be disabled; calculations remain available in memory. */ }
  }

  function tokenize(source) {
    if (source.length > MAX_EXPRESSION_LENGTH) throw new Error(`Keep equations under ${MAX_EXPRESSION_LENGTH} characters.`);
    const tokens = [];
    const push = token => { if (tokens.length >= MAX_TOKEN_COUNT - 1) throw new Error(`Keep equations under ${MAX_TOKEN_COUNT - 1} math tokens.`); tokens.push(token); };
    let i = 0;
    while (i < source.length) {
      const c = source[i];
      if (/\s/.test(c)) { i++; continue; }
      const number = source.slice(i).match(/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i);
      if (number) { push({ type: 'number', value: Number(number[0]) }); i += number[0].length; continue; }
      const name = source.slice(i).match(/^[a-zA-Z]+/);
      if (name) { push({ type: 'name', value: name[0].toLowerCase() }); i += name[0].length; continue; }
      if ('+-*/^(),'.includes(c)) { push({ type: c, value: c }); i++; continue; }
      throw new Error(`Unexpected character “${c}”`);
    }
    tokens.push({ type: 'end', value: '' });
    return tokens;
  }
  function compile(source) {
    const tokens = tokenize(source);
    let pos = 0;
    const peek = () => tokens[pos];
    const take = type => { if (peek().type !== type) throw new Error(`Expected “${type}”`); return tokens[pos++]; };
    const functions = { sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, sqrt: Math.sqrt, abs: Math.abs, ln: Math.log, log: Math.log10, exp: Math.exp, floor: Math.floor, ceil: Math.ceil, round: Math.round, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh };
    const primary = () => {
      const token = peek();
      if (token.type === 'number') { pos++; return () => token.value; }
      if (token.type === 'name') {
        pos++;
        if (peek().type === '(') {
          if (!Object.prototype.hasOwnProperty.call(functions, token.value)) throw new Error(`Unknown function “${token.value}”`);
          pos++; const arg = nestedExpression(); take(')'); const fn = functions[token.value]; return x => fn(arg(x));
        }
        if (token.value === 'x') return x => x;
        if (token.value === 'pi') return () => Math.PI;
        if (token.value === 'e') return () => Math.E;
        throw new Error(`Unknown name “${token.value}”`);
      }
      if (token.type === '(') { pos++; const value = nestedExpression(); take(')'); return value; }
      throw new Error('Expected a number, x, or function');
    };
    const power = () => { let left = primary(); if (peek().type === '^') { pos++; const right = unary(); const l = left; left = x => Math.pow(l(x), right(x)); } return left; };
    const unary = () => { if (peek().type === '+') { pos++; return unary(); } if (peek().type === '-') { pos++; const value = unary(); return x => -value(x); } return power(); };
    const term = () => {
      let left = unary();
      while (peek().type === '*' || peek().type === '/' || peek().type === 'number' || peek().type === 'name' || peek().type === '(') {
        const explicit = peek().type === '*' || peek().type === '/'; const op = explicit ? tokens[pos++].type : '*'; const prior = left, right = unary();
        left = op === '*' ? x => prior(x) * right(x) : x => prior(x) / right(x);
      }
      return left;
    };
    const expression = () => { let left = term(); while (peek().type === '+' || peek().type === '-') { const op = tokens[pos++].type; const prior = left, right = term(); left = op === '+' ? x => prior(x) + right(x) : x => prior(x) - right(x); } return left; };
    let parseDepth = 0;
    const nestedExpression = () => { if (parseDepth >= MAX_PARSE_DEPTH) throw new Error(`Function or bracket nesting is limited to ${MAX_PARSE_DEPTH} levels.`); parseDepth++; try { return expression(); } finally { parseDepth--; } };
    const result = expression();
    if (peek().type !== 'end') throw new Error('Check the expression syntax');
    return result;
  }

  function prepareEquation(equation) {
    if (equation.compiledExpression === equation.expression) return equation.fn;
    equation.compiledExpression = equation.expression;
    equation.fn = null;
    equation.error = '';
    if (!equation.expression.trim()) return null;
    try {
      equation.fn = compile(equation.expression);
      if (!Number.isFinite(equation.fn(0)) && !Number.isFinite(equation.fn(1))) throw new Error('This expression has no real value here');
    } catch (error) { equation.error = error.message; }
    return equation.fn;
  }

  function setExpression(id, value) {
    const equation = equations.find(item => item.id === id);
    if (!equation) return;
    equation.expression = value;
    prepareEquation(equation);
    renderList(); saveState(); scheduleDraw();
  }
  function renderList(focusId = null) {
    list.replaceChildren();
    const addButton = document.querySelector('#addEquation');
    addButton.disabled = equations.length >= MAX_EQUATIONS;
    addButton.title = addButton.disabled ? `Up to ${MAX_EQUATIONS} equations per graph` : 'Add an equation';
    equations.forEach(equation => {
      const row = document.createElement('div'); row.className = 'equation-row'; row.dataset.id = equation.id;
      const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'curve-toggle'; toggle.style.background = equation.visible ? equation.color : '#d8ded8'; toggle.setAttribute('aria-label', `${equation.visible ? 'Hide' : 'Show'} ${equation.expression || 'equation'}`); toggle.setAttribute('aria-pressed', String(equation.visible));
      toggle.addEventListener('click', () => { equation.visible = !equation.visible; renderList(); saveState(); scheduleDraw(); });
      const input = document.createElement('input'); input.value = equation.expression; input.maxLength = MAX_EXPRESSION_LENGTH; input.placeholder = 'e.g. sin(x)'; input.setAttribute('aria-label', `Equation ${equations.indexOf(equation) + 1}`); input.autocomplete = 'off'; input.spellcheck = false; input.style.color = equation.color;
      input.addEventListener('input', () => { equation.expression = input.value; prepareEquation(equation); updateEquationError(equation, input); updateLegend(); saveState(); scheduleDraw(); });
      input.addEventListener('keydown', event => { if (event.key === 'Enter') { setExpression(equation.id, input.value); input.blur(); } });
      input.addEventListener('blur', () => { if (equation.expression.trim()) setExpression(equation.id, equation.expression); });
      row.append(toggle, input);
      if (equations.length > 1) { const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'row-delete'; remove.textContent = '×'; remove.setAttribute('aria-label', 'Remove equation'); remove.addEventListener('click', () => { equations = equations.filter(item => item.id !== equation.id); renderList(); saveState(); scheduleDraw(); }); row.append(remove); }
      if (equation.error) { const error = document.createElement('div'); error.className = 'equation-error'; error.textContent = equation.error; row.append(error); }
      list.append(row);
      if (focusId === equation.id) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
    });
    updateLegend();
  }
  function updateEquationError(equation, input) {
    const row = input.closest('.equation-row'); let message = row.querySelector('.equation-error');
    if (equation.error) {
      if (!message) { message = document.createElement('div'); message.className = 'equation-error'; row.append(message); }
      message.textContent = equation.error;
    } else if (message) message.remove();
  }
  function updateLegend() {
    const legend = document.querySelector('#graphLegend'); legend.replaceChildren();
    equations.forEach((equation, index) => {
      const item = document.createElement('span'); item.className = 'legend-item'; item.style.opacity = equation.visible ? '1' : '.4';
      const swatch = document.createElement('i'); swatch.className = 'legend-swatch'; swatch.style.background = equation.color;
      const label = document.createElement('span'); label.textContent = `y${equations.length > 1 ? index + 1 : ''} = ${equation.expression || '…'}`;
      item.append(swatch, label); legend.append(item);
    });
    document.querySelector('#plotCount').textContent = `${equations.filter(e => e.visible && !e.error && e.expression).length} ${equations.filter(e => e.visible && !e.error && e.expression).length === 1 ? 'curve' : 'curves'}`;
    document.querySelector('#canvasEmpty').hidden = equations.some(e => e.visible && e.expression && !e.error);
  }

  function measure() {
    const rect = wrap.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (rect.width === dimensions.width && rect.height === dimensions.height && dpr === dimensions.dpr) return;
    dimensions = { width: rect.width, height: rect.height, dpr };
    canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function tickStep() { const raw = 76 / view.scale; const power = Math.pow(10, Math.floor(Math.log10(raw))); const ratio = raw / power; return (ratio < 1.5 ? 1 : ratio < 3.5 ? 2 : ratio < 7.5 ? 5 : 10) * power; }
  function draw() {
    raf = 0; measure(); const { width, height } = dimensions; if (!width || !height) return;
    ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#fdfefc'; ctx.fillRect(0, 0, width, height);
    const originX = width / 2 - view.x * view.scale, originY = height / 2 + view.y * view.scale, step = tickStep();
    ctx.lineWidth = 1; ctx.strokeStyle = '#f0f2ee'; ctx.beginPath();
    for (let x = originX % (step * view.scale); x < width; x += step * view.scale) { ctx.moveTo(Math.round(x) + .5, 0); ctx.lineTo(Math.round(x) + .5, height); }
    for (let y = originY % (step * view.scale); y < height; y += step * view.scale) { ctx.moveTo(0, Math.round(y) + .5); ctx.lineTo(width, Math.round(y) + .5); }
    ctx.stroke();
    ctx.strokeStyle = '#b9c4bb'; ctx.lineWidth = 1.3; ctx.beginPath();
    if (originY >= 0 && originY <= height) { ctx.moveTo(0, Math.round(originY) + .5); ctx.lineTo(width, Math.round(originY) + .5); }
    if (originX >= 0 && originX <= width) { ctx.moveTo(Math.round(originX) + .5, 0); ctx.lineTo(Math.round(originX) + .5, height); }
    ctx.stroke();
    ctx.font = '10px "DM Mono", monospace'; ctx.fillStyle = '#9aa59c';
    for (let x = originX % (step * view.scale); x < width; x += step * view.scale) { const value = (x - originX) / view.scale; if (Math.abs(value) > step / 5 && originY > 14 && originY < height - 14) ctx.fillText(fmt(value), x + 4, originY - 5); }
    for (let y = originY % (step * view.scale); y < height; y += step * view.scale) { const value = (originY - y) / view.scale; if (Math.abs(value) > step / 5 && originX > 28 && originX < width - 12) ctx.fillText(fmt(value), originX + 5, y - 4); }
    equations.forEach(equation => {
      if (!equation.visible || !equation.expression || equation.error) return;
      const fn = prepareEquation(equation); if (!fn) return;
      ctx.strokeStyle = equation.color; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); let drawing = false, previousY = null;
      for (let px = 0; px <= width; px += 1.5) {
        const x = (px - originX) / view.scale; const y = fn(x); const py = originY - y * view.scale;
        if (!Number.isFinite(py) || Math.abs(py) > height * 5 || (previousY !== null && Math.abs(py - previousY) > height * .8)) { drawing = false; previousY = Number.isFinite(py) ? py : null; continue; }
        if (!drawing) { ctx.moveTo(px, py); drawing = true; } else ctx.lineTo(px, py);
        previousY = py;
      }
      ctx.stroke();
    });
    if (selectedPoint) {
      const px = width / 2 + (selectedPoint.x - view.x) * view.scale;
      const py = height / 2 - (selectedPoint.y - view.y) * view.scale;
      if (px >= 0 && px <= width && py >= 0 && py <= height) {
        ctx.fillStyle = selectedPoint.color; ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      }
    }
    document.querySelector('#zoomLevel').textContent = `${fmt(view.scale / 48)}×`;
  }
  function scheduleDraw() { if (!raf) raf = requestAnimationFrame(draw); }
  function zoom(factor, x = dimensions.width / 2, y = dimensions.height / 2) {
    const oldScale = view.scale, nextScale = Math.min(420, Math.max(8, oldScale * factor));
    const dx = x - dimensions.width / 2, dy = y - dimensions.height / 2;
    view.x += dx / oldScale - dx / nextScale; view.y -= dy / oldScale - dy / nextScale; view.scale = nextScale; saveState(); scheduleDraw();
  }
  function pointerPosition(event) { const rect = canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
  canvas.addEventListener('pointerdown', event => {
    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
    const p = pointerPosition(event); activePointers.set(event.pointerId, p);
    if (activePointers.size === 2) {
      const [a, b] = [...activePointers.values()];
      pinch = { distance: Math.hypot(b.x - a.x, b.y - a.y) || 1 };
      pointer = null;
      return;
    }
    pointer = { id: event.pointerId, x: p.x, y: p.y, viewX: view.x, viewY: view.y, moved: false };
  });
  canvas.addEventListener('pointermove', event => {
    const p = pointerPosition(event);
    if (activePointers.has(event.pointerId)) activePointers.set(event.pointerId, p);
    if (pinch && activePointers.size >= 2) {
      const [a, b] = [...activePointers.values()]; const distance = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      zoom(distance / pinch.distance, (a.x + b.x) / 2, (a.y + b.y) / 2); pinch.distance = distance;
    }
    if (pointer && pointer.id === event.pointerId) {
      const dx = p.x - pointer.x, dy = p.y - pointer.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) pointer.moved = true;
      if (pointer.moved) { view.x = pointer.viewX - dx / view.scale; view.y = pointer.viewY + dy / view.scale; scheduleDraw(); }
    }
    const x = (p.x - dimensions.width / 2) / view.scale + view.x, y = (dimensions.height / 2 - p.y) / view.scale + view.y;
    document.querySelector('#coordinateReadout').textContent = `x: ${fmt(x)} · y: ${fmt(y)}`;
  });
  canvas.addEventListener('pointerup', event => {
    activePointers.delete(event.pointerId);
    if (activePointers.size < 2) pinch = null;
    if (pointer && pointer.id === event.pointerId) {
      if (!pointer.moved) {
        const p = pointerPosition(event), x = (p.x - dimensions.width / 2) / view.scale + view.x;
        let nearest = null;
        equations.forEach((equation, index) => {
          if (!equation.visible || equation.error || !equation.expression) return;
          try { const y = prepareEquation(equation)(x), py = dimensions.height / 2 - (y - view.y) * view.scale; const gap = Math.abs(py - p.y); if (Number.isFinite(y) && gap < 24 && (!nearest || gap < nearest.gap)) nearest = { equation, index, x, y, gap }; } catch { /* invalid expressions are reported beside their input */ }
        });
        if (nearest) {
          selectedPoint = { x: nearest.x, y: nearest.y, color: nearest.equation.color };
          document.querySelector('#coordinateReadout').textContent = `y${equations.length > 1 ? nearest.index + 1 : ''}: (${fmt(nearest.x)}, ${fmt(nearest.y)})`;
          scheduleDraw();
        } else {
          const y = (dimensions.height / 2 - p.y) / view.scale + view.y;
          selectedPoint = null; document.querySelector('#coordinateReadout').textContent = `x: ${fmt(x)} · y: ${fmt(y)}`; scheduleDraw();
        }
      }
      if (pointer.moved) saveState();
      pointer = null;
    }
  });
  canvas.addEventListener('pointercancel', event => { activePointers.delete(event.pointerId); pointer = null; pinch = null; });
  canvas.addEventListener('wheel', event => { event.preventDefault(); const p = pointerPosition(event); zoom(event.deltaY < 0 ? 1.12 : 1 / 1.12, p.x, p.y); }, { passive: false });
  document.querySelector('#zoomIn').addEventListener('click', () => zoom(1.25));
  document.querySelector('#zoomOut').addEventListener('click', () => zoom(1 / 1.25));
  document.querySelector('#resetView').addEventListener('click', () => { view = { x: 0, y: 0, scale: 48 }; document.querySelector('#coordinateReadout').textContent = 'x: — · y: —'; saveState(); scheduleDraw(); });
  document.querySelector('#addEquation').addEventListener('click', () => { if (equations.length >= MAX_EQUATIONS) return; const equation = { id: nextId++, expression: '', visible: true, color: colors[(equations.length) % colors.length], error: '' }; equations.push(equation); renderList(equation.id); saveState(); scheduleDraw(); });
  document.querySelectorAll('.example-chip').forEach(button => button.addEventListener('click', () => {
    const empty = equations.find(equation => !equation.expression);
    if (!empty && equations.length >= MAX_EQUATIONS) return;
    const equation = empty || { id: nextId++, expression: '', visible: true, color: colors[equations.length % colors.length], error: '' };
    if (!empty) equations.push(equation);
    equation.expression = button.dataset.expression; equation.visible = true; prepareEquation(equation); renderList(); saveState(); scheduleDraw();
  }));
  const analysisDialog = document.querySelector('#analysisDialog');
  const analysisEquation = document.querySelector('#analysisEquation');
  const analysisMode = document.querySelector('#analysisMode');
  const analysisValues = document.querySelector('#analysisValues');
  const analysisResult = document.querySelector('#analysisResult');
  function inputField(label, name, value) {
    const field = document.createElement('label'); field.className = 'analysis-field compact';
    const caption = document.createElement('span'); caption.textContent = label;
    const input = document.createElement('input'); input.name = name; input.type = 'number'; input.step = 'any'; input.value = value; input.setAttribute('aria-label', label);
    field.append(caption, input); return field;
  }
  function renderAnalysisFields() {
    analysisValues.replaceChildren();
    if (analysisMode.value === 'trace' || analysisMode.value === 'derivative') analysisValues.append(inputField('x value', 'x', '1'));
    if (analysisMode.value === 'integral' || analysisMode.value === 'table' || analysisMode.value === 'roots') {
      analysisValues.append(inputField('From x', 'from', '0'), inputField('To x', 'to', '5'));
    }
    analysisResult.replaceChildren();
    const tip = document.createElement('span'); tip.textContent = analysisMode.value === 'roots' ? 'Searches the selected interval for x-intercepts.' : 'Choose a range or value, then calculate.';
    analysisResult.append(tip);
  }
  function analysisOutput(title, text) {
    analysisResult.replaceChildren(); const heading = document.createElement('p'); heading.className = 'result-title'; heading.textContent = title;
    const body = document.createElement('div'); body.textContent = text; analysisResult.append(heading, body);
  }
  document.querySelector('#analyzeButton').addEventListener('click', () => {
    analysisEquation.replaceChildren();
    equations.forEach((equation, index) => {
      const option = document.createElement('option'); option.value = equation.id; option.textContent = `y${equations.length > 1 ? index + 1 : ''} = ${equation.expression || '…'}`; analysisEquation.append(option);
    });
    analysisDialog.showModal(); renderAnalysisFields();
  });
  analysisMode.addEventListener('change', renderAnalysisFields);
  document.querySelector('#runAnalysis').addEventListener('click', () => {
    const equation = equations.find(item => item.id === Number(analysisEquation.value));
    if (!equation || !equation.expression) { analysisOutput('NO EQUATION', 'Enter an expression first.'); return; }
    let fn;
    try { fn = compile(equation.expression); } catch (error) { analysisOutput('CHECK THE EXPRESSION', error.message); return; }
    const field = name => Number(analysisValues.querySelector(`[name="${name}"]`)?.value);
    const mode = analysisMode.value;
    if (mode === 'trace' || mode === 'derivative') {
      const x = field('x'), y = fn(x);
      if (!Number.isFinite(x) || !Number.isFinite(y)) { analysisOutput('NO REAL VALUE', 'Try an x value in the domain of this curve.'); return; }
      const h = 1e-5 * Math.max(1, Math.abs(x)); const slope = (fn(x + h) - fn(x - h)) / (2 * h);
      selectedPoint = { x, y, color: equation.color }; scheduleDraw();
      if (mode === 'trace') analysisOutput('TRACE', `x = ${fmt(x)}    f(x) = ${fmt(y)}\nSlope here ≈ ${fmt(slope)}`);
      else analysisOutput('NUMERICAL SLOPE', `f′(${fmt(x)}) ≈ ${fmt(slope)}\nPoint: (${fmt(x)}, ${fmt(y)})`);
      document.querySelector('#coordinateReadout').textContent = `(${fmt(x)}, ${fmt(y)})`;
    } else {
      const a = field('from'), b = field('to');
      if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) { analysisOutput('CHECK THE INTERVAL', 'Enter two different finite x values.'); return; }
      if (mode === 'integral') {
        const n = 1200, step = (b - a) / n; let total = fn(a) + fn(b);
        for (let i = 1; i < n; i++) total += (i % 2 ? 4 : 2) * fn(a + step * i);
        const area = total * step / 3;
        if (!Number.isFinite(area)) analysisOutput('AREA UNDEFINED', 'The function is discontinuous or outside its real domain in this interval.');
        else analysisOutput('DEFINITE INTEGRAL', `∫ f(x) dx from ${fmt(a)} to ${fmt(b)} ≈ ${fmt(area)}\nSigned area; numerical Simpson estimate.`);
      } else if (mode === 'table') {
        const heading = document.createElement('p'); heading.className = 'result-title'; heading.textContent = 'VALUES';
        const table = document.createElement('table'); table.className = 'analysis-table'; const thead = document.createElement('thead'), headRow = document.createElement('tr');
        ['x', 'f(x)'].forEach(text => { const th = document.createElement('th'); th.textContent = text; headRow.append(th); }); thead.append(headRow); table.append(thead);
        const tbody = document.createElement('tbody');
        for (let i = 0; i <= 10; i++) { const x = a + (b - a) * i / 10, tr = document.createElement('tr'); [fmt(x), fmt(fn(x))].forEach(text => { const td = document.createElement('td'); td.textContent = text; tr.append(td); }); tbody.append(tr); }
        table.append(tbody); analysisResult.replaceChildren(heading, table);
      } else {
        const low = Math.min(a, b), high = Math.max(a, b), samples = 1600, dx = (high - low) / samples; const roots = [];
        let x0 = low, y0 = fn(x0);
        for (let i = 1; i <= samples; i++) {
          const x1 = low + i * dx, y1 = fn(x1);
          if (Number.isFinite(y0) && Number.isFinite(y1)) {
            if (y0 === 0) roots.push(x0);
            else if (y0 * y1 < 0) {
              let left = x0, right = x1, fl = y0;
              for (let j = 0; j < 48; j++) { const mid = (left + right) / 2, fm = fn(mid); if (!Number.isFinite(fm)) break; if (fl * fm <= 0) right = mid; else { left = mid; fl = fm; } }
              roots.push((left + right) / 2);
            }
          }
          x0 = x1; y0 = y1;
        }
        if (Number.isFinite(y0) && Math.abs(y0) < 1e-9) roots.push(high);
        const unique = roots.filter((root, index) => index === 0 || Math.abs(root - roots[index - 1]) > 1e-5).slice(0, 12);
        if (!unique.length) analysisOutput('NO X-INTERCEPTS FOUND', `Searched from ${fmt(low)} to ${fmt(high)}. Try a wider interval.`);
        else analysisOutput('X-INTERCEPTS', unique.map(root => `x ≈ ${fmt(root)}   ·   (${fmt(root)}, 0)`).join('\n'));
      }
    }
  });
  const help = document.querySelector('#helpDialog');
  document.querySelector('#helpButton').addEventListener('click', () => help.showModal());
  window.addEventListener('resize', scheduleDraw);
  if ('ResizeObserver' in window) new ResizeObserver(scheduleDraw).observe(wrap);
  equations.forEach(prepareEquation);
  renderList(); scheduleDraw();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
})();
