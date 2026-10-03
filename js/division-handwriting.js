(function () {
  'use strict';
  window.createDivisionHandwriting = function (options) {
    var root = document.getElementById('divisionHandwriting');
    var toggle = document.getElementById('divisionInputMode');
    var mode = 'keypad', model, loading, epoch = 0, identity, entries = new Map(), active, popup;
    var dialog = document.createElement('dialog');
    dialog.className = 'division-zoom';
    dialog.innerHTML = '<div class="zoom-heading"><strong>このマスに書こう</strong><button type="button" data-close aria-label="閉じる">×</button></div><div data-context></div><div data-zoom-pad></div><div data-zoom-controls></div>';
    document.body.appendChild(dialog);
    function dismiss() {
      if (popup) { popup.remove(); popup = null; }
      if (active) { active.host.classList.remove('hand-selected'); active = null; }
      if (dialog.open) dialog.close();
    }
    function clear() {
      epoch++; entries.forEach(function (entry) { clearTimeout(entry.timer); entry.version++; });
      entries.clear(); dismiss();
    }
    function prepare() {
      var next = options.target();
      if (!identity || identity.problem !== next.problem || identity.key !== next.key) { clear(); identity = next; }
      return next;
    }
    async function ensureModel() {
      if (model) return model;
      if (!loading) loading = (async function () {
        if (!window.tf) await options.loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js');
        await tf.ready(); model = await tf.loadGraphModel('./model/model.json'); return model;
      })().catch(function (error) { loading = null; throw error; });
      return loading;
    }
    function blank(canvas) { var ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,280,280); }
    function snapshot(entry) {
      entry.canvas.getContext('2d').drawImage(entry.pad,0,0,280,280);
      if (entry.host.isConnected) {
        var small = entry.host.querySelector('.division-cell-canvas');
        if (small !== entry.pad) small.getContext('2d').drawImage(entry.canvas,0,0);
      }
    }
    function current(entry) {
      var next = options.target();
      return mode === 'handwriting' && next.enabled && identity && next.problem === identity.problem && next.key === identity.key && entries.get(entry.key) === entry;
    }
    function bind(canvas, entry) {
      var pointer = null;
      function point(e) { var r=canvas.getBoundingClientRect(); return {x:(e.clientX-r.left)*280/r.width,y:(e.clientY-r.top)*280/r.height}; }
      canvas.addEventListener('pointerdown', function(e) {
        if (!current(entry) || pointer !== null || (e.pointerType==='mouse' && e.button!==0)) return;
        e.preventDefault(); entry.version++; clearTimeout(entry.timer);
        if (popup) {popup.remove();popup=null;}
        if (active && active!==entry) active.host.classList.remove('hand-selected');
        active=entry; entry.host.classList.add('hand-selected');
        entry.pad=canvas;
        if (entry.value !== null) { entry.value=null; blank(canvas); }
        entry.ink=true; pointer=e.pointerId; canvas.setPointerCapture(pointer);
        var ctx=canvas.getContext('2d'), p=point(e);
        ctx.fillStyle='#111';ctx.strokeStyle='#111';ctx.lineWidth=16;ctx.lineCap='round';ctx.lineJoin='round';
        ctx.beginPath();ctx.arc(p.x,p.y,8,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(p.x,p.y);
        snapshot(entry);
      });
      canvas.addEventListener('pointermove',function(e){if(pointer!==e.pointerId)return;e.preventDefault();var p=point(e),ctx=canvas.getContext('2d');ctx.lineTo(p.x,p.y);ctx.stroke();snapshot(entry);});
      function end(e){if(pointer!==e.pointerId)return;pointer=null;snapshot(entry);if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);if(e.type!=='pointercancel')entry.timer=setTimeout(function(){recognize(entry);},750);}
      canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('lostpointercapture',end);
    }
    function controls(entry,message,digits) {
      if (!current(entry) || active !== entry) return;
      var panel;
      if (dialog.open) { panel=dialog.querySelector('[data-zoom-controls]');panel.replaceChildren(); }
      else {
        if(popup)popup.remove();
        panel=document.createElement('div');panel.className='division-cell-popover';panel.setAttribute('role','group');panel.setAttribute('aria-label',entry.label+'の読み取り');
        document.body.appendChild(panel);popup=panel;
      }
      var status=document.createElement('p');status.textContent=message;status.setAttribute('role','status');panel.appendChild(status);
      var row=document.createElement('div');row.className='cell-candidates';panel.appendChild(row);
      (digits||[]).forEach(function(d,i){var b=document.createElement('button');b.type='button';b.textContent=d;b.className=i===0?'first-candidate':'';b.setAttribute('aria-label',d+'をこのマスに入力');b.addEventListener('click',function(){choose(entry,d);});row.appendChild(b);});
      function button(label,action){var b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',action);panel.appendChild(b);}
      button('書きなおす',function(){entry.version++;clearTimeout(entry.timer);entry.value=null;entry.ink=false;blank(entry.canvas);blank(entry.pad);snapshot(entry);controls(entry,'このマスに1けた書こう');});
      button('読みとる',function(){recognize(entry);});
      if(!dialog.open)button('拡大',function(){zoom(entry);});
      if(popup===panel){var r=entry.host.getBoundingClientRect();var p=panel.getBoundingClientRect();panel.style.left=Math.max(8,Math.min(innerWidth-p.width-8,r.left+r.width/2-p.width/2))+'px';panel.style.top=(r.bottom+p.height+8<innerHeight?r.bottom+8:Math.max(8,r.top-p.height-8))+'px';}
    }
    async function recognize(entry) {
      if (!current(entry) || !entry.ink || active !== entry) return;
      clearTimeout(entry.timer);var ticket=++entry.version, generation=epoch,input,output;
      controls(entry,'読みとっています…');
      try {
        var loaded=await ensureModel();if(generation!==epoch||ticket!==entry.version||!current(entry))return;
        input=preprocessCanvas(entry.canvas,true);output=loaded.predict(input);var values=await output.data();
        if(generation!==epoch||ticket!==entry.version||!current(entry)||active!==entry)return;
        var digits=Array.from(values,function(score,digit){return {score:score,digit:digit};}).sort(function(a,b){return b.score-a.score;}).slice(0,3).map(function(d){return d.digit;});
        controls(entry,'書いた数字をえらんでね',digits);
      } catch(error){if(generation===epoch&&ticket===entry.version)controls(entry,'読み取れませんでした。「読みとる」で再試行できます');console.warn('Division handwriting:',error);}
      finally{if(input)input.dispose();if(output)output.dispose();}
    }
    function choose(entry,digit) {
      if(!current(entry))return;
      entry.version++;clearTimeout(entry.timer);entry.value=String(digit);entry.ink=false;
      blank(entry.canvas);var ctx=entry.canvas.getContext('2d');ctx.fillStyle='#245bd6';ctx.font='bold 210px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(digit,140,155);
      entry.pad.getContext('2d').drawImage(entry.canvas,0,0);snapshot(entry);dismiss();
      if(entry.kind==='grid'){
        var group=options.target(),values=[];
        for(var i=0;i<group.count;i++){var e=entries.get('grid:'+i);if(!e||e.value===null)return;values.push(e.value);}
        options.groupDigits(values.join(''));
      }else options.normalDigit(entry.field,entry.index,digit);
      sync();
    }
    function zoom(entry) {
      if(!current(entry))return;
      if(popup){popup.remove();popup=null;}
      if(active&&active!==entry)active.host.classList.remove('hand-selected');active=entry;entry.host.classList.add('hand-selected');
      var context=dialog.querySelector('[data-context]');context.replaceChildren();
      dialog.querySelector('.zoom-heading strong').textContent=entry.label;
      var title=document.createElement('p');title.textContent=entry.label;context.appendChild(title);
      if(entry.kind==='grid'){
        var original=document.getElementById('hissan-division-grid'),mini=original.cloneNode(true);
        mini.style.setProperty('--mini-cols',getComputedStyle(original).gridTemplateColumns.split(' ').length);
        mini.removeAttribute('id');mini.classList.add('division-mini-grid');
        mini.querySelectorAll('[id]').forEach(function(n){n.removeAttribute('id');});
        mini.querySelectorAll('canvas,button').forEach(function(n){n.remove();});
        mini.querySelectorAll('.grid-cell').forEach(function(n){n.classList.remove('active-target','current-input-cell','hand-selected');});
        var index=Array.from(original.children).indexOf(entry.host);mini.children[index].classList.add('zoom-location');
        context.appendChild(mini);
      }
      var canvas=document.createElement('canvas');canvas.width=canvas.height=280;canvas.className='division-zoom-canvas';canvas.setAttribute('aria-label',entry.label+'を拡大して書く');
      canvas.getContext('2d').drawImage(entry.canvas,0,0);entry.pad=canvas;bind(canvas,entry);dialog.querySelector('[data-zoom-pad]').replaceChildren(canvas);
      dialog.showModal();controls(entry,'このマスに1けた書こう');
    }
    dialog.querySelector('[data-close]').addEventListener('click',dismiss);
    dialog.addEventListener('close',function(){if(active){snapshot(active);active.pad=active.host.querySelector('canvas');}dialog.querySelector('[data-zoom-controls]').replaceChildren();});
    function mount(host,info) {
      prepare();var key=info.kind+':'+info.index+(info.field||''),entry=entries.get(key);
      if(!entry){var saved=document.createElement('canvas');saved.width=saved.height=280;blank(saved);entry={key:key,canvas:saved,value:null,ink:false,version:0};entries.set(key,entry);}
      entry.host=host;entry.kind=info.kind;entry.index=info.index;entry.field=info.field;entry.label=info.label;
      host.classList.add('division-hand-cell');host.setAttribute('aria-label',info.label);
      host.classList.remove('current-input-cell');
      var canvas=document.createElement('canvas');canvas.width=canvas.height=280;canvas.className='division-cell-canvas';canvas.setAttribute('aria-label',info.label+'に書く');canvas.getContext('2d').drawImage(entry.canvas,0,0);entry.pad=canvas;bind(canvas,entry);
      host.appendChild(canvas);
      var expand=document.createElement('button');expand.type='button';expand.className='division-cell-expand';expand.textContent='⤢';expand.setAttribute('aria-label',info.label+'を拡大');expand.addEventListener('click',function(e){e.stopPropagation();zoom(entry);});host.appendChild(expand);
    }
    function mountGridCell(host,index,label){if(mode==='handwriting')mount(host,{kind:'grid',index:index,label:label});}
    function sync() {
      var next=prepare();
      root.hidden=mode!=='handwriting';root.textContent=next.enabled?'空欄に直接書こう。⤢でマスを拡大できるよ。':next.label;
      document.querySelectorAll('.division-normal-slot').forEach(function(n){n.remove();});
      if(mode!=='handwriting'||!next.enabled||next.kind==='grid')return;
      if(next.hasRemainder&&!document.getElementById('rSlot')){
        var quotient=document.getElementById('qSlot');
        if(quotient){
          var ns='http://www.w3.org/2000/svg',label=document.createElementNS(ns,'text'),remainder=document.createElementNS(ns,'text');
          label.setAttribute('x',Number(quotient.getAttribute('x'))+65);label.setAttribute('y',quotient.getAttribute('y'));label.setAttribute('text-anchor','middle');label.setAttribute('font-size',20);label.textContent='あまり';
          remainder.setAttribute('x',Number(quotient.getAttribute('x'))+130);remainder.setAttribute('y',quotient.getAttribute('y'));remainder.setAttribute('text-anchor','middle');remainder.setAttribute('font-size',30);remainder.setAttribute('id','rSlot');remainder.textContent=next.inputRemainder||'?';quotient.parentNode.append(label,remainder);
        }
      }
      ['q','r'].forEach(function(field){var slot=document.getElementById(field+'Slot');if(!slot|| (field==='r'&&!next.hasRemainder))return;
        if(field==='r'&&next.wrong)return;
        var count=field==='q'?next.quotientDigits:1,position=field==='q'?next.inputDigits.length:0;
        if(field==='r'&&next.inputRemainder.length)return;
        if(position>=count)return;
        var foreign=document.createElementNS('http://www.w3.org/2000/svg','foreignObject');foreign.classList.add('division-normal-slot');foreign.setAttribute('x',Number(slot.getAttribute('x'))-count*22+position*44);foreign.setAttribute('y',Number(slot.getAttribute('y'))-36);foreign.setAttribute('width',44);foreign.setAttribute('height',52);
        var host=document.createElement('div');host.style.width='44px';host.style.height='44px';foreign.appendChild(host);slot.parentNode.appendChild(foreign);
        mount(host,{kind:'normal',field:field,index:position,label:(field==='q'?'こたえ・しょう':'あまり')+'の'+(position+1)+'けた目'});
      });
    }
    function setMode(value) {
      mode=value==='handwriting'?value:'keypad';toggle.value=mode;document.getElementById('keypad').hidden=mode==='handwriting';clear();identity=null;
      options.render();sync();
      if(mode==='handwriting')ensureModel().catch(function(){if(mode==='handwriting')root.textContent='読み込めませんでした。マスに書いて「読みとる」で再試行できます。';});
    }
    toggle.addEventListener('change',function(){setMode(toggle.value);});
    window.addEventListener('resize',function(){if(popup){popup.remove();popup=null;}});
    sync();
    return {sync:sync,clear:clear,setMode:setMode,getMode:function(){return mode;},mountGridCell:mountGridCell};
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
