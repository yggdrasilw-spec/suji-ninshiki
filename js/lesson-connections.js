/* Lazy Firebase SDK loading for apps adding teacher support. */
(function () {
  var pending;
  window.LessonTeacherReady = function () {
    if (!pending) pending = (async function () {
      var base = 'https://www.gstatic.com/firebasejs/10.8.0/';
      for (var part of ['app','auth','database']) {
        if (window.firebase && (part === 'app' || firebase[part])) continue;
        await new Promise(function (resolve, reject) {
          var script = document.createElement('script'); script.src = base + 'firebase-' + part + '-compat.js';
          var timer = setTimeout(function () { script.remove(); reject(new Error('通信タイムアウト')); }, 12000);
          script.onload = function () { clearTimeout(timer); resolve(); };
          script.onerror = function () { clearTimeout(timer); script.remove(); reject(new Error('通信エラー')); };
          document.head.appendChild(script);
        });
      }
      var app;
      try { app = firebase.app(); } catch (e) {
        app = firebase.initializeApp({apiKey:'AIzaSyDdqalOwQFkZnNvFCKzXqM4VeP4IBPhzXo',authDomain:'raid-boss-project.firebaseapp.com',databaseURL:'https://raid-boss-project-default-rtdb.asia-southeast1.firebasedatabase.app',projectId:'raid-boss-project',appId:'1:195656323635:web:ca2dd1251af61929080946'});
      }
      await app.auth().signInAnonymously(); return app.database();
    })().catch(function (e) { pending = null; throw e; });
    return pending;
  };
  var room, online = false, data, answered = new WeakSet();
  window.LessonRaid = {
    init: function () {
      var bar = document.createElement('div'); bar.className = 'settingsCard';
      bar.innerHTML = '<h3>👾 クラスのレイドに参加</h3><label>レイドコード <input id="classRaidCode" maxlength="8"></label><button id="classRaidConnect" type="button">接続</button><p id="classRaidStatus" role="status">未接続</p>';
      document.getElementById('topPage').appendChild(bar);
      document.getElementById('classRaidConnect').onclick = this.connect;
      var code = new URLSearchParams(location.search).get('code');
      if (code) { document.getElementById('classRaidCode').value = code; this.connect(); }
    },
    connect: async function () {
      var status = document.getElementById('classRaidStatus'), input = document.getElementById('classRaidCode');
      var code = input.value.normalize('NFKC').replace(/\s/g,'').toUpperCase(); input.value = code;
      if (!/^[A-Z0-9]{4,8}$/.test(code)) { status.textContent = '英数字4〜8文字で入力してください'; return; }
      if (room) room.off(); room = null; online = false; data = null;
      status.textContent = 'ルーム確認中…';
      try {
        var db = await LessonTeacherReady(), ref = db.ref('rooms/' + code), snap = await ref.once('value');
        var val = snap.val();
        if (!val || !val.boss || !Number.isFinite(val.boss.currentHp) || (val.expiresAt && val.expiresAt <= Date.now())) throw new Error('ルームが見つからないか期限切れです');
        room = ref;
        ref.on('value', function (s) { data = s.val(); status.textContent = data && data.boss ? '👾 ' + (data.boss.name || 'ボス') + ' HP ' + data.boss.currentHp : 'レイド終了'; });
        db.ref('.info/connected').on('value', function (s) { online = s.val() === true; });
      } catch (e) { status.textContent = e.message || '接続できません'; }
    },
    answer: async function (problem) {
      if (!problem || typeof problem !== 'object') return;
      if (answered.has(problem)) return; answered.add(problem);
      if (!room || !online || !data || !data.boss || (data.expiresAt && data.expiresAt <= Date.now())) return;
      var target = room, expiry = data.expiresAt;
      try {
        var result = await target.child('boss/currentHp').transaction(function (hp) {
          if (!online || (expiry && expiry <= Date.now()) || !Number.isFinite(hp) || hp <= 0) return;
          return Math.max(0, hp - 10);
        }, undefined, false);
        if (result.committed) await target.child('logs').push({name:StudentProfile.getNickname() || 'ななし',avatar:StudentProfile.getAvatar(),damage:10,detail:'足し算・引き算の筆算',timestamp:Date.now()});
      } catch (e) { console.warn('レイドの攻撃を送信できませんでした', e); }
    }
  };
})();
