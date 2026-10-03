(function () {
  'use strict';
  window.createDivisionHandwriting = function (options) {
    var root = document.getElementById('divisionHandwriting');
    var canvas = root.querySelector('canvas'), ctx = canvas.getContext('2d');
    var status = root.querySelector('[data-status]');
    var candidates = root.querySelector('[data-candidates]');
    var toggle = document.getElementById('divisionInputMode');
    var mode = 'keypad', model, loading, timer, version = 0, drawing = null, ink = false, target;
    function clear() {
      version++;
      clearTimeout(timer);
      drawing = null;
      ink = false;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      candidates.replaceChildren();
      status.textContent = '1けたずつ書いて、読み取った数字をおしてね';
    }
    async function ensureModel() {
      if (model) return model;
      if (!loading) {
        loading = (async function () {
          if (!window.tf) await options.loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js');
          await window.tf.ready();
          model = await window.tf.loadGraphModel('./model/model.json');
          return model;
        })().catch(function (error) { loading = null; throw error; });
      }
      return loading;
    }
    function same(a, b) {
      return a && b && a.problem === b.problem && a.key === b.key && a.enabled === b.enabled;
    }
    function sync() {
      var next = options.target();
      if (!same(target, next)) { clear(); target = next; }
      root.querySelector('[data-target]').textContent = next.label;
      canvas.style.pointerEvents = next.enabled ? 'auto' : 'none';
      canvas.style.opacity = next.enabled ? '1' : '.4';
      root.querySelector('[data-recognize]').disabled = !next.enabled;
      if (!next.enabled) { candidates.replaceChildren(); status.textContent = next.label; }
    }
    function setMode(value) {
      mode = value === 'handwriting' ? value : 'keypad';
      toggle.value = mode;
      root.hidden = mode !== 'handwriting';
      document.getElementById('keypad').hidden = mode === 'handwriting';
      clear(); sync();
      if (mode === 'handwriting') {
        var ticket = version;
        status.textContent = '数字の読み取りをじゅんびしています…';
        ensureModel().then(function () {
          if (ticket === version && mode === 'handwriting') status.textContent = ink ? '「読みとる」をおしてね' : '1けたずつ書いて、読み取った数字をおしてね';
        }).catch(function () {
          if (ticket === version && mode === 'handwriting') status.textContent = '読み込めませんでした。「読みとる」で再試行、または数字ボタンに切りかえてね';
        });
      }
    }
    function point(e) {
      var r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height };
    }
    canvas.addEventListener('pointerdown', function (e) {
      if (!options.target().enabled || drawing !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault(); version++; clearTimeout(timer); candidates.replaceChildren();
      canvas.setPointerCapture(e.pointerId); drawing = e.pointerId; ink = true;
      var p = point(e);
      ctx.strokeStyle = '#111'; ctx.fillStyle = '#111'; ctx.lineWidth = 16; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(p.x, p.y);
      status.textContent = '書きおわったら、読み取った数字をおしてね';
    });
    canvas.addEventListener('pointermove', function (e) {
      if (drawing !== e.pointerId) return;
      e.preventDefault(); var p = point(e); ctx.lineTo(p.x, p.y); ctx.stroke();
    });
    function end(e) {
      if (drawing !== e.pointerId) return;
      drawing = null;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      if (e.type !== 'pointercancel') timer = setTimeout(recognize, 750);
    }
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('lostpointercapture', end);
    async function recognize() {
      clearTimeout(timer);
      sync();
      if (!ink || !target.enabled || mode !== 'handwriting' || drawing !== null) return;
      var ticket = ++version, original = options.target();
      candidates.replaceChildren(); status.textContent = '読みとっています…';
      var input, output;
      try {
        var loaded = await ensureModel();
        if (ticket !== version || !same(original, options.target())) return;
        input = preprocessCanvas(canvas, true);
        output = loaded.predict(input);
        var values = await output.data();
        if (ticket !== version || mode !== 'handwriting' || !same(original, options.target())) return;
        var digits = Array.from(values, function (score, digit) { return { score: score, digit: digit }; });
        digits.sort(function (a, b) { return b.score - a.score; });
        digits.slice(0, 3).forEach(function (candidate, i) {
          var button = document.createElement('button'); button.type = 'button';
          button.textContent = candidate.digit; button.className = i === 0 ? 'first-candidate' : '';
          button.setAttribute('aria-label', candidate.digit + 'を入力');
          button.addEventListener('click', function () {
            if (ticket !== version || !same(original, options.target())) { sync(); return; }
            clear(); options.digit(candidate.digit); sync();
          });
          candidates.appendChild(button);
        });
        status.textContent = '書いた数字をえらんでね。ちがうときは書きなおそう';
      } catch (error) {
        if (ticket === version) status.textContent = '読み取れませんでした。もう一度「読みとる」をおしてね';
        console.warn('Division handwriting:', error);
      } finally {
        if (input) input.dispose(); if (output) output.dispose();
      }
    }
    root.querySelector('[data-clear]').addEventListener('click', clear);
    root.querySelector('[data-delete]').addEventListener('click', function () { clear(); options.removeDigit(); sync(); });
    root.querySelector('[data-recognize]').addEventListener('click', recognize);
    toggle.addEventListener('change', function () { setMode(toggle.value); });
    clear(); sync();
    return { sync: sync, clear: clear, setMode: setMode, getMode: function () { return mode; } };
  };
function preprocessCanvas(canvas, invert=false){
  const ctx = canvas.getContext("2d");
  const cw = canvas.width;
  const ch = canvas.height;
  if(!cw || !ch) return tf.zeros([1, 28, 28, 1]);

  const imgData = ctx.getImageData(0, 0, cw, ch);
  const data = imgData.data;

  // 背景色（白背景か黒背景か）を自動判定（四隅の輝度平均）
  let cornerLum = (data[0] + data[(cw-1)*4] + data[(cw*(ch-1))*4] + data[(cw*ch-1)*4]) / 4;
  let isWhiteBg = (invert || cornerLum > 128);

  // 1. バウンディングボックスの検出
  let minX = cw, minY = ch, maxX = -1, maxY = -1;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const idx = (y * cw + x) * 4;
      const lum = data[idx];
      const isStroke = isWhiteBg ? (lum < 200) : (lum > 50);
      if (isStroke) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  // 文字が描かれていない場合
  if (maxX === -1) {
    return tf.zeros([1, 28, 28, 1]);
  }

  // 余白（パディング）を追加
  const pad = Math.max(4, Math.round(Math.min(cw, ch) * 0.05));
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(cw - 1, maxX + pad);
  maxY = Math.min(ch - 1, maxY + pad);
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;

  // 2. 文字領域を一時キャンバスに切り出し
  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = bw;
  cropCanvas.height = bh;
  const cropCtx = cropCanvas.getContext("2d");
  cropCtx.drawImage(canvas, minX, minY, bw, bh, 0, 0, bw, bh);

  // 3. アスペクト比を維持して 20x20 以内にフィット
  const maxDim = Math.max(bw, bh);
  const scale = 20 / maxDim;
  const fitW = Math.max(1, Math.round(bw * scale));
  const fitH = Math.max(1, Math.round(bh * scale));

  const fitCanvas = document.createElement("canvas");
  fitCanvas.width = fitW;
  fitCanvas.height = fitH;
  const fctx = fitCanvas.getContext("2d");
  fctx.imageSmoothingEnabled = true;
  fctx.drawImage(cropCanvas, 0, 0, fitW, fitH);

  // 4. 重心（Center of Mass）の計算
  const fitData = fctx.getImageData(0, 0, fitW, fitH).data;
  let totalMass = 0;
  let sumX = 0;
  let sumY = 0;

  const geoX = Math.floor((28 - fitW) / 2);
  const geoY = Math.floor((28 - fitH) / 2);

  for (let y = 0; y < fitH; y++) {
    for (let x = 0; x < fitW; x++) {
      const idx = (y * fitW + x) * 4;
      const lum = fitData[idx];
      const val = isWhiteBg ? Math.max(0, (255 - lum)) / 255.0 : Math.min(255, lum) / 255.0;
      if (val > 0.05) {
        totalMass += val;
        sumX += x * val;
        sumY += y * val;
      }
    }
  }

  let shiftX = geoX;
  let shiftY = geoY;
  if (totalMass > 0) {
    const cX = sumX / totalMass;
    const cY = sumY / totalMass;
    shiftX = Math.round(13.5 - cX);
    shiftY = Math.round(13.5 - cY);
  }

  // 5. 28x28配列（MNIST規格: 黒背景0.0、白文字1.0）へ重心センタリングして配置
  const img28 = new Float32Array(28 * 28);
  for (let y = 0; y < fitH; y++) {
    for (let x = 0; x < fitW; x++) {
      const idx = (y * fitW + x) * 4;
      const lum = fitData[idx];
      const val = isWhiteBg ? Math.max(0, (255 - lum)) / 255.0 : Math.min(255, lum) / 255.0;
      const targetX = shiftX + x;
      const targetY = shiftY + y;
      if (targetX >= 0 && targetX < 28 && targetY >= 0 && targetY < 28) {
        img28[targetY * 28 + targetX] = val;
      }
    }
  }

  return tf.tensor4d(img28, [1, 28, 28, 1]);
}

})();
