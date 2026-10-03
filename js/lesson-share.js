/* Shared distribution settings. Only explicitly registered fields enter a URL. */
(function () {
  'use strict';
  var config, dialog, editors = [], message, output;
  var params = new URLSearchParams(location.search);
  function normalize(value) { return String(value || '').normalize('NFKC').replace(/\s/g, '').toUpperCase(); }
  function valid(field, value) {
    if (field.options) {
      var allowed = field.options.map(function (option) { return String(option[0]); });
      return field.multiple ? Array.isArray(value) && value.length > 0 && value.length <= allowed.length && value.every(function (v) { return allowed.indexOf(v) >= 0; }) : allowed.indexOf(String(value)) >= 0;
    }
    return typeof value === 'boolean';
  }
  function node(tag, text, parent) {
    var el = document.createElement(tag); if (text) el.textContent = text;
    if (parent) parent.appendChild(el); return el;
  }
  function restore() {
    if (!params.has('lesson')) return;
    try {
      if (params.get('lesson').length > 16000) throw new Error();
      var saved = JSON.parse(params.get('lesson'));
      if (saved.v !== 1 || saved.app !== config.id || !saved.settings || typeof saved.settings !== 'object') throw new Error();
      config.fields.forEach(function (field) {
        if (Object.prototype.hasOwnProperty.call(saved.settings, field.key) && valid(field, saved.settings[field.key])) field.set(saved.settings[field.key]);
      });
      if (config.afterRestore) config.afterRestore();
    } catch (e) { console.warn('配布URLの設定を読み込めませんでした。通常の設定で続けます。', e); }
  }
  function build() {
    dialog = node('dialog'); dialog.className = 'lesson-share'; dialog.setAttribute('aria-label', '設定・配布URL');
    document.body.appendChild(dialog);
    node('h2', '⚙️ 設定・配布URL', dialog);
    node('p', '配布する設定にチェックを入れてください。チェックを外した項目は児童が選べます。名前・記録はURLに含めません。', dialog);
    config.fields.forEach(function (field) {
      var row = node('div', '', dialog); row.className = 'lesson-share-row';
      var label = node('label', '', row), include = node('input', '', label); include.type = 'checkbox'; include.checked = true;
      label.appendChild(document.createTextNode(' URLに含める：' + field.label));
      var control = node(field.multiple ? 'div' : field.options ? 'select' : 'input', '', row);
      control.setAttribute('aria-label', field.label);
      if (field.options) {
        if (field.multiple) {
          field.options.forEach(function (option) { var label = node('label', '', control), el = node('input', '', label); el.type = 'checkbox'; el.value = option[0]; label.appendChild(document.createTextNode(' ' + option[1])); });
        } else field.options.forEach(function (option) { var el = node('option', option[1], control); el.value = option[0]; });
      } else {
        control.type = 'checkbox';
        var enabledLabel = node('label', '', row); enabledLabel.appendChild(control); enabledLabel.appendChild(document.createTextNode(' 有効にする'));
      }
      include.onchange = function () { control.disabled = !include.checked; control.querySelectorAll('input').forEach(function (el) { el.disabled = !include.checked; }); };
      editors.push({ field: field, include: include, control: control });
    });
    node('p', 'コードは任意です。授業・レイドの有効期限は元のコードと同じです。', dialog);
    function codeField(label, id) {
      var row = node('label', label + ' ', dialog), input = node('input', '', row);
      input.id = id; input.maxLength = 8; input.autocomplete = 'off'; input.placeholder = '指定しない場合は空欄'; return input;
    }
    var teacher = codeField('先生コード', 'lesson-teacher');
    var raid = config.raid ? codeField('レイドコード', 'lesson-raid') : null;
    var actions = node('div', '', dialog); actions.className = 'lesson-share-actions';
    var generate = node('button', '配布URLを生成', actions); generate.type = 'button';
    output = node('textarea', '', dialog); output.readOnly = true; output.rows = 3; output.setAttribute('aria-label', '配布URL');
    var copy = node('button', 'URLをコピー', actions); copy.type = 'button';
    var close = node('button', '閉じる', actions); close.type = 'button'; close.onclick = function () { dialog.close(); };
    message = node('p', '', dialog); message.setAttribute('role', 'status');
    generate.onclick = function () {
      try {
        var data = {}, tcode = normalize(teacher.value), rcode = raid ? normalize(raid.value) : '';
        if ([tcode, rcode].some(function (v) { return v && !/^[A-Z0-9]{4,8}$/.test(v); })) throw new Error('コードは英数字4〜8文字で指定してください。');
        editors.forEach(function (editor) {
          if (!editor.include.checked) return;
          var field = editor.field, value = field.options ? (field.multiple ? Array.from(editor.control.querySelectorAll('input:checked')).map(function (o) { return o.value; }) : editor.control.value) : editor.control.checked;
          if (!valid(field, value)) throw new Error(field.label + 'を1つ以上選んでください。');
          data[field.key] = value;
        });
        if (config.validate) config.validate(data);
        var url = new URL(location.href); url.search = ''; url.hash = '';
        url.searchParams.set('share', '1');
        if (Object.keys(data).length) url.searchParams.set('lesson', JSON.stringify({ v: 1, app: config.id, settings: data }));
        if (tcode) url.searchParams.set('teacherCode', tcode);
        if (rcode) url.searchParams.set('code', rcode);
        output.value = url.href; teacher.value = tcode; if (raid) raid.value = rcode;
        message.textContent = 'URLを生成しました。指定した項目は開いたときに適用されます。';
      } catch (e) { output.value = ''; message.textContent = e.message; }
    };
    copy.onclick = async function () {
      if (!output.value) { message.textContent = '先にURLを生成してください。'; return; }
      try { await navigator.clipboard.writeText(output.value); message.textContent = 'コピーしました。'; }
      catch (e) { output.focus(); output.select(); message.textContent = 'URLを選択しました。コピーしてください。'; }
    };
  }
  async function teacherSetup() {
    if (config.nativeTeacher) return;
    var bar = node('details', '', document.body); bar.className = 'lesson-teacher-bar';
    node('summary', '🧑‍🏫 先生', bar);
    var name = node('input', '', bar); name.placeholder = 'なまえ'; name.maxLength = 10; name.setAttribute('aria-label', 'なまえ'); name.value = StudentProfile.getNickname();
    name.onchange = function () { StudentProfile.setNickname(name.value); };
    var input = node('input', '', bar); input.placeholder = '先生コード'; input.maxLength = 8; input.setAttribute('aria-label', '先生コード');
    var connect = node('button', '先生につなぐ', bar), help = node('button', '先生に聞く', bar), status = node('span', '先生未接続', bar);
    help.disabled = true; var listenersBound = false;
    async function join() {
      var code = normalize(input.value); input.value = code;
      if (!/^[A-Z0-9]{4,8}$/.test(code)) { status.textContent = 'コードは英数字4〜8文字'; return; }
      connect.disabled = true; status.textContent = '確認中…';
      try {
        await window.LessonTeacherReady();
        if (name.value.trim()) StudentProfile.setNickname(name.value);
        TeacherBridge.init({ appId: config.id, appName: config.name });
        var result = await TeacherBridge.joinSession(code); status.textContent = result.message; help.disabled = !result.success;
        if (result.success) TeacherBridge.updateProgress({ step: '学習中', screenId: config.id, screenName: config.name });
        if (!listenersBound) {
          listenersBound = true;
          TeacherBridge.onSessionEnded(function () { help.disabled = true; status.textContent = '授業は終了しました'; });
          TeacherBridge.onTeacherStatusChange(function (e) { if (e.status === 'teacher_coming') status.textContent = '先生が見に来ます'; if (e.status === 'teacher_supporting') status.textContent = '先生といっしょに見ているよ'; });
          var lastScreen = '';
          new MutationObserver(function () {
            var screen = document.querySelector('.sc.on,.page.active'), id = screen ? screen.id : config.id;
            if (id === lastScreen) return; lastScreen = id;
            TeacherBridge.updateProgress({ step: '学習中', screenId: id, screenName: screen ? (screen.querySelector('h1,h2,.page-title') || screen).textContent.trim().slice(0,60) : config.name });
          }).observe(document.body, { subtree:true, attributes:true, attributeFilter:['class'] });
        }
      } catch (e) { status.textContent = '接続できません。もう一度試してください'; }
      finally { connect.disabled = false; }
    }
    connect.onclick = join; help.onclick = function () { TeacherBridge.requestHelp(); status.textContent = '先生が見に来ます。この画面で待っていてね'; };
    if (params.get('teacherCode')) { input.value = params.get('teacherCode'); join(); }
  }
  window.LessonShare = {
    init: function (options) {
      config = options; config.fields = config.fields || []; restore();
      var style = node('style', '', document.head);
      style.textContent = '.lesson-share{box-sizing:border-box;width:min(600px,94vw);max-height:90dvh;overflow:auto;border:2px solid #cbd5e1;border-radius:18px;padding:22px;color:#233247;background:#fff;font:16px sans-serif;text-align:left}.lesson-share::backdrop{background:#0008}.lesson-share p{font-size:14px;line-height:1.5}.lesson-share label{display:block;margin:12px 0}.lesson-share-row{padding:5px 0;border-bottom:1px solid #e2e8f0}.lesson-share select,.lesson-share textarea{box-sizing:border-box;width:100%;font:inherit;padding:8px}.lesson-share input:not([type=checkbox]){width:min(220px,90%);padding:8px;font:inherit}.lesson-share button,.lesson-teacher-bar button{font:inherit;border:0;border-radius:8px;padding:9px;background:#2563eb;color:white;cursor:pointer}.lesson-share-actions{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}.lesson-share-launcher{padding:10px;margin:10px;border:0;border-radius:10px;background:#2563eb;color:white;font:inherit;cursor:pointer}.lesson-share-floating{position:fixed;right:8px;bottom:8px;z-index:1100}.lesson-teacher-bar{position:fixed;left:4px;bottom:4px;z-index:1099;display:flex;flex-wrap:wrap;gap:4px;max-width:70vw;background:#fff;padding:4px;border-radius:8px;font:12px sans-serif}.lesson-teacher-bar{display:block}.lesson-teacher-bar[open]{bottom:60px}.lesson-teacher-bar summary{cursor:pointer;font-weight:bold}.lesson-teacher-bar input{width:85px}.lesson-share-row>div label{display:inline-block;margin:6px 10px 6px 0}.lesson-teacher-bar span{max-width:180px}';
      build();
      var parent = config.mount ? document.querySelector(config.mount) : null;
      var launcher = node('button', '⚙️ 設定・配布URL', parent || document.body); launcher.type = 'button';
      launcher.className = 'lesson-share-launcher' + (parent ? '' : ' lesson-share-floating'); launcher.onclick = this.open;
      teacherSetup();
    },
    open: function () {
      editors.forEach(function (editor) {
        var value = editor.field.get();
        if (editor.field.options) {
          if (editor.field.multiple) editor.control.querySelectorAll('input').forEach(function (o) { o.checked = value.indexOf(o.value) >= 0; });
          else editor.control.value = String(value);
        } else editor.control.checked = !!value;
      });
      document.getElementById('lesson-teacher').value = params.get('teacherCode') || (document.querySelector('#teacherCodeInput,#kz_teacherCodeInput') || {}).value || '';
      if (config.raid) document.getElementById('lesson-raid').value = params.get('code') || (document.querySelector('#studentRaidCode,#raidCodeInput,#raid-code') || {}).value || '';
      output.value = ''; message.textContent = ''; dialog.showModal();
    },
    select: function (key, label, id) {
      var el = document.getElementById(id);
      return { key:key, label:label, options:Array.from(el.options).map(function(o) { return [o.value,o.textContent]; }), get:function() { return el.value; }, set:function(v) { el.value=v; el.dispatchEvent(new Event('change',{bubbles:true})); } };
    },
    checkbox: function (key, label, selector) {
      return { key:key, label:label, get:function() { return document.querySelector(selector).checked; }, set:function(v) { var el=document.querySelector(selector); el.checked=v; el.dispatchEvent(new Event('change',{bubbles:true})); } };
    }
  };
})();
