/* Free-order handwriting for multiplication; model shared with this repository. */
const multiplicationHandwriting = (() => {
  let mode='keyboard', problem=null, entries=new Map(), active=null, model, loading, status, dialog;
  try { mode=localStorage.getItem('multiplicationInputMode')==='handwriting'?'handwriting':'keyboard'; } catch {}
  const enabled=()=>mode==='handwriting';
  const blank=c=>{const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,280,280);};
  const valid=e=>enabled()&&problem===e.problem&&entries.get(e.key)===e;
  function reset(){for(const e of entries.values()){clearTimeout(e.timer);e.version++;}entries.clear();problem=null;active=null;if(dialog?.open)dialog.close();}
  function message(text){if(status)status.textContent=text;if(dialog?.open)dialog.querySelector('output').textContent=text;}
  async function ensureModel(){
    if(model)return model;
    if(!loading)loading=(async()=>{
      if(!window.tf)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js';script.onload=resolve;script.onerror=()=>{script.remove();reject(Error('TensorFlow load failed'));};document.head.append(script);});
      await tf.ready();model=await tf.loadGraphModel('./model/model.json');return model;
    })().catch(error=>{loading=null;throw error;});
    return loading;
  }
  function select(e){active=e;for(const cell of entries.values())cell.host?.classList.toggle('selected',cell===e);message(e.label+'：書きなおし・拡大・読みとるが使えます');}
  function render(e){
    if(!valid(e))return;
    const small=e.host.querySelector('canvas');small.getContext('2d').drawImage(e.ink,0,0);
    let digit=e.host.querySelector('.digit');
    if(e.value===null){digit?.remove();}else{if(!digit){digit=document.createElement('span');digit.className='digit';e.host.append(digit);}digit.textContent=e.value;}
    e.host.setAttribute('aria-label',e.label+(e.value===null?'（未入力）':'：'+e.value));
  }
  function clear(e){if(!valid(e))return;clearTimeout(e.timer);e.version++;e.value=null;e.drawn=false;e.pending=false;blank(e.ink);e.host.classList.remove('wrong');render(e);if(dialog.open&&active===e)blank(dialog.querySelector('canvas'));ok=0;document.getElementById('nx').disabled=true;message(e.label+'に1けた書こう');}
  function accept(e,digit){if(!valid(e))return;clearTimeout(e.timer);e.version++;e.pending=false;e.value=String(digit);e.host.classList.remove('wrong');render(e);ok=0;document.getElementById('nx').disabled=true;message(e.label+'：'+digit+' と読み取りました。違うときは数字を直せます');}
  async function recognize(e){
    if(!valid(e)||!e.drawn||e.value!==null)return;
    clearTimeout(e.timer);const version=++e.version;e.pending=true;message('数字を読み取っています…');let input,output;
    try{const loaded=await ensureModel();if(!valid(e)||e.version!==version)return;input=preprocessCanvas(e.ink,true);output=loaded.predict(input);const values=await output.data();if(!valid(e)||e.version!==version)return;const digit=values.indexOf(Math.max(...values));accept(e,digit);}
    catch(error){if(valid(e)&&e.version===version)message('読み取れませんでした。「読みとる」で再試行するか、数字を直してください。');console.warn('Multiplication handwriting:',error);}
    finally{input?.dispose();output?.dispose();if(valid(e)&&e.version===version)e.pending=false;}
  }
  function bind(canvas,e,zoom=false){
    let pointer=null,start,moved=false,lastTap=0,tapInk,tapValue,tapDrawn;
    const point=event=>{const r=canvas.getBoundingClientRect();return{x:(event.clientX-r.left)*280/r.width,y:(event.clientY-r.top)*280/r.height};};
    canvas.addEventListener('pointerdown',event=>{if(pointer!==null||!valid(e))return;event.preventDefault();select(e);clearTimeout(e.timer);e.version++;e.pending=false;
      if(!zoom&&lastTap&&Date.now()-lastTap<350){e.ink.getContext('2d').drawImage(tapInk,0,0);e.value=tapValue;e.drawn=tapDrawn;render(e);lastTap=0;openZoom(e);return;}
      tapInk=document.createElement('canvas');tapInk.width=tapInk.height=280;tapInk.getContext('2d').drawImage(e.ink,0,0);tapValue=e.value;tapDrawn=e.drawn;
      if(e.value!==null){e.value=null;e.drawn=false;blank(e.ink);blank(canvas);render(e);}e.host.classList.remove('wrong');ok=0;document.getElementById('nx').disabled=true;pointer=event.pointerId;canvas.setPointerCapture(pointer);start=point(event);moved=false;
      const ctx=canvas.getContext('2d');ctx.strokeStyle='#222';ctx.fillStyle='#222';ctx.lineWidth=14;ctx.lineCap=ctx.lineJoin='round';ctx.beginPath();ctx.arc(start.x,start.y,7,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(start.x,start.y);e.drawn=true;
    });
    canvas.addEventListener('pointermove',event=>{if(pointer!==event.pointerId)return;event.preventDefault();const p=point(event);if(Math.hypot(p.x-start.x,p.y-start.y)>12)moved=true;const ctx=canvas.getContext('2d');ctx.lineTo(p.x,p.y);ctx.stroke();e.ink.getContext('2d').drawImage(canvas,0,0);});
    const end=event=>{if(pointer!==event.pointerId)return;pointer=null;e.ink.getContext('2d').drawImage(canvas,0,0);if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);render(e);if(event.type!=='pointerup')return;
      const now=Date.now();if(!zoom&&!moved&&now-lastTap<350){lastTap=0;openZoom(e);return;}lastTap=moved?0:now;e.timer=setTimeout(()=>recognize(e),850);
    };
    canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('lostpointercapture',end);
    if(!zoom)canvas.addEventListener('dblclick',event=>{event.preventDefault();openZoom(e);});
  }
  function openZoom(e){if(!valid(e))return;select(e);clearTimeout(e.timer);if(dialog.open)dialog.close();dialog.querySelector('strong').textContent=e.label+'を書く';const context=dialog.querySelector('.context');context.textContent=problem.a+' × '+problem.b+' ／ '+e.label;context.classList.toggle('carry',e.key[0]==='c');const canvas=dialog.querySelector('canvas');canvas.replaceWith(canvas.cloneNode());const pad=dialog.querySelector('canvas');pad.getContext('2d').drawImage(e.ink,0,0);bind(pad,e,true);dialog.showModal();message(e.value===null?e.label+'に1けた書こう':e.label+'：認識した数字は '+e.value+'。書きなおし・数字の訂正ができます');}
  function controls(root,zoom=false){
    for(const [label,action] of [['拡大',e=>openZoom(e)],['書きなおす',e=>clear(e)],['読みとる',e=>recognize(e)]]){if(zoom&&label==='拡大')continue;const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=()=>{if(active)action(active);else message('先に書くマスを選んでください');};root.append(button);}
    const correction=document.createElement('select');correction.setAttribute('aria-label','認識した数字を直す');correction.innerHTML='<option value="">数字を直す</option>'+Array.from({length:10},(_,d)=>'<option>'+d+'</option>').join('');correction.onchange=()=>{if(active&&correction.value!=='')accept(active,correction.value);correction.value='';};root.append(correction);
  }
  function mount(p){
    if(problem!==p){reset();problem=p;}
    const hw=document.querySelector('#g .hw'),n=String(p.a).length,W=(n+2)*44,H=132;
    const keys=Array.from({length:String(p.a*p.b).length},(_,i)=>'r'+i).concat(Array.from({length:n-1},(_,i)=>'c'+(i+1)));
    for(const key of keys){const place=+key.slice(1),carry=key[0]==='c',x=(n+1-place)*44;
      let e=entries.get(key);if(!e){const ink=document.createElement('canvas');ink.width=ink.height=280;blank(ink);e={key,ink,problem:p,value:null,version:0,drawn:false,pending:false};entries.set(key,e);}
      e.label=['一','十','百','千'][place]+'の位'+(carry?'の補助計算':'の答え');const host=document.createElement('div');host.className='hand-cell'+(carry?' carry':'');host.dataset.key=key;host.tabIndex=0;host.setAttribute('role','group');
      Object.assign(host.style,{left:(x+(carry?22:0))/W*100+'%',top:88/H*100+'%',width:(carry?22:44)/W*100+'%',height:(carry?20:44)/H*100+'%'});
      const canvas=document.createElement('canvas');canvas.width=canvas.height=280;canvas.setAttribute('aria-label',e.label+'に直接書く');canvas.getContext('2d').drawImage(e.ink,0,0);host.append(canvas);hw.append(host);e.host=host;host.classList.toggle('selected',active===e);bind(canvas,e);host.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openZoom(e);}};host.onfocus=()=>select(e);render(e);
    }
    const tools=document.createElement('div');tools.className='hand-tools';controls(tools);status=document.createElement('output');status.setAttribute('aria-live','polite');tools.append(status);document.getElementById('g').append(tools);message('好きなマスから書こう。ダブルタップで拡大できます。');
    document.getElementById('h').innerHTML=p.a+'×'+p.b+' を筆算で。 <button id="handCheck" type="button">こたえあわせ</button> <button onclick="hint()">ヒント</button> <b id="fb"></b>';document.getElementById('handCheck').onclick=check;
  }
  function check(){
    const fb=document.getElementById('fb');
    if([...entries.values()].some(e=>e.pending||(e.drawn&&e.value===null))){fb.textContent='数字の読み取りを待つか、「読みとる」「数字を直す」を使ってください。';return;}
    const expected=new Map(problem.seq.map(([key,d])=>[key,String(d)]));let good=true;
    for(const e of entries.values()){const want=expected.get(e.key);const match=want!==undefined?e.value===want:(e.value===null||e.value==='0');e.host.classList.toggle('wrong',!match);if(!match)good=false;}
    ok=good?1:0;document.getElementById('nx').disabled=!good;snd(good?'ok':'ng');fb.textContent=good?'せいかい！ 答えは '+problem.a*problem.b:'空欄や赤い枠のマスをたしかめよう。補助計算もたしかめてね。';
  }
  document.addEventListener('DOMContentLoaded',()=>{
    const settings=document.getElementById('settings'),toggle=document.getElementById('inputMode');toggle.value=mode;
    document.getElementById('settingsOpen').onclick=()=>settings.showModal();document.getElementById('settingsClose').onclick=()=>settings.close();
    toggle.onchange=()=>{mode=toggle.value;try{localStorage.setItem('multiplicationInputMode',mode);}catch{}reset();settings.close();R();};
    dialog=document.createElement('dialog');dialog.className='hand-zoom';dialog.innerHTML='<div class="heading"><strong></strong><button type="button" aria-label="閉じる">とじる</button></div><div class="context"></div><canvas width="280" height="280"></canvas><div class="buttons"></div><output aria-live="polite"></output>';document.body.append(dialog);dialog.querySelector('.heading button').onclick=()=>dialog.close();controls(dialog.querySelector('.buttons'),true);
  });
  return {enabled,reset,mount};
})();
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
