/**
 * TeacherBridge - 児童向け共通「先生支援」通信モジュール
 * 1授業限定の先生コードに接続し、進捗・支援状態・「先生に聞く」を双方向リアルタイム同期。
 * Firebase未接続でも教材本体の学習を止めない完全非破壊設計。
 */
(function(global) {
  'use strict';

  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDdqalOwQFkZnNvFCKzXqM4VeP4IBPhzXo",
    authDomain: "raid-boss-project.firebaseapp.com",
    databaseURL: "https://raid-boss-project-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "raid-boss-project",
    storageBucket: "raid-boss-project.firebasestorage.app",
    messagingSenderId: "195656323635",
    appId: "1:195656323635:web:ca2dd1251af61929080946",
    measurementId: "G-6VBWZVLKLK"
  };

  let db = null;
  let auth = null;
  let authPromise = null;
  let serverOffset = 0;

  // 内部状態
  const state = {
    initialized: false,
    appId: 'default-app',
    appName: '自力学習教材',
    teacherCode: '',
    sessionId: '',
    uid: null,
    connected: false,
    sessionActive: false,
    currentStep: '',
    currentScreenId: '',
    currentScreenName: '',
    supportLevel: 0,
    supportCount: 0,
    helpCount: 0,
    status: 'learning', // learning | help_requested | teacher_coming | teacher_supporting | paused | offline
    helpRequestedAt: null,
    listeners: {
      statusChange: [],
      sessionEnded: [],
      connectionChange: []
    }
  };

  let studentNodeRef = null;
  let sessionNodeRef = null;
  let studentValueListener = null;
  let sessionValueListener = null;

  function now() {
    return Date.now() + serverOffset;
  }

  function ensureFirebase() {
    if (db && auth) return authPromise;

    if (typeof firebase === 'undefined') {
      console.warn('[TeacherBridge] Firebase SDKが読み込まれていません。ローカル動作を継続します。');
      return Promise.resolve(null);
    }

    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
      }
      db = firebase.database();
      auth = firebase.auth();

      // サーバー時刻オフセット同期
      db.ref('.info/serverTimeOffset').on('value', function(snap) {
        serverOffset = snap.val() || 0;
      });

      authPromise = auth.signInAnonymously()
        .then(function(cred) {
          state.uid = cred.user.uid;
          return cred.user;
        })
        .catch(function(err) {
          console.error('[TeacherBridge] 匿名認証エラー:', err);
          return null;
        });

      return authPromise;
    } catch (e) {
      console.error('[TeacherBridge] Firebase初期化エラー:', e);
      return Promise.resolve(null);
    }
  }

  function emit(event, data) {
    const list = state.listeners[event] || [];
    for (let i = 0; i < list.length; i++) {
      try {
        list[i](data);
      } catch (e) {
        console.error('[TeacherBridge] リスナー実行エラー:', e);
      }
    }
  }

  const TeacherBridge = {
    /**
     * 教材アプリ起動時の初期化
     * @param {Object} config { appId: string, appName: string }
     */
    init: function(config) {
      if (config) {
        if (config.appId) state.appId = config.appId;
        if (config.appName) state.appName = config.appName;
      }
      state.initialized = true;
      ensureFirebase();
      return this;
    },

    /**
     * 先生コードで授業セッションに参加
     * @param {string} teacherCode 6桁英数字
     * @returns {Promise<{success: boolean, message: string, code?: string}>}
     */
    joinSession: async function(teacherCode) {
      const code = global.StudentProfile ? global.StudentProfile.normalizeCode(teacherCode) : String(teacherCode || '').trim().toUpperCase();
      if (!code || code.length < 4) {
        return { success: false, message: '先生コードを入力してください。' };
      }

      await ensureFirebase();
      if (!db || !auth || !state.uid) {
        return { success: false, message: '通信環境を確認してください（Firebase未接続）。' };
      }

      try {
        // 1. コード照会
        const codeSnap = await db.ref('teacherCodes/' + code).once('value');
        const codeData = codeSnap.val();
        const currentTime = now();

        if (!codeData || !codeData.sessionId) {
          return { success: false, message: '先生コードが見つかりません。' };
        }

        // 60分有効期限チェック（期限切れは論理的に即利用不可）
        if (codeData.expiresAt && codeData.expiresAt <= currentTime) {
          return { success: false, message: 'この先生コードの時間は終了しました。' };
        }

        const sessionId = codeData.sessionId;

        // 2. セッション自体の有効性確認
        const sessionSnap = await db.ref('teacherSessions/' + sessionId).once('value');
        const sessionData = sessionSnap.val();
        if (!sessionData || sessionData.status !== 'active' || (sessionData.expiresAt && sessionData.expiresAt <= currentTime)) {
          return { success: false, message: 'この授業はすでに終了しています。' };
        }

        // 3. 既存のリスナーがあれば解除
        TeacherBridge.leaveSession(false);

        state.teacherCode = code;
        state.sessionId = sessionId;
        state.sessionActive = true;
        if (global.StudentProfile) {
          global.StudentProfile.setLastTeacherCode(code);
        }

        // 4. 児童ノード登録
        studentNodeRef = db.ref('teacherSessions/' + sessionId + '/students/' + state.uid);
        sessionNodeRef = db.ref('teacherSessions/' + sessionId);

        const nickname = (global.StudentProfile ? global.StudentProfile.getNickname() : '') || 'ななし';
        const avatar = (global.StudentProfile ? global.StudentProfile.getAvatar() : '⚔️') || '⚔️';

        const studentData = {
          nickname: nickname,
          avatar: avatar,
          appId: state.appId,
          appName: state.appName,
          step: state.currentStep || 'STEP 0',
          screenId: state.currentScreenId || '',
          screenName: state.currentScreenName || '',
          status: 'learning',
          supportLevel: state.supportLevel || 0,
          supportCount: state.supportCount || 0,
          helpCount: state.helpCount || 0,
          helpRequestedAt: null,
          screenEnteredAt: firebase.database.ServerValue.TIMESTAMP,
          updatedAt: firebase.database.ServerValue.TIMESTAMP,
          connected: true
        };

        await studentNodeRef.set(studentData);

        // Presence設定（切断時は offline に）
        const presenceRef = db.ref('.info/connected');
        presenceRef.on('value', function(snap) {
          if (snap.val() === true && studentNodeRef) {
            studentNodeRef.onDisconnect().update({
              connected: false,
              status: 'offline',
              disconnectedAt: firebase.database.ServerValue.TIMESTAMP
            });
            studentNodeRef.update({
              connected: true,
              status: state.status === 'offline' ? 'learning' : state.status
            });
          }
        });

        // 先生からの状態変更を監視（teacher_coming, teacher_supporting, resolved 等）
        studentValueListener = studentNodeRef.on('value', function(snap) {
          const val = snap.val();
          if (!val) {
            // ノードが消えた（先生が終了したか削除された）
            TeacherBridge.handleSessionClosed();
            return;
          }
          if (val.status !== state.status) {
            const oldStatus = state.status;
            state.status = val.status;
            emit('statusChange', { status: val.status, oldStatus: oldStatus });
          }
        });

        // 授業全体のステータス監視（先生が「授業終了」を押した時の検知）
        sessionValueListener = sessionNodeRef.child('status').on('value', function(snap) {
          const st = snap.val();
          if (st === 'ended' || st === null) {
            TeacherBridge.handleSessionClosed();
          }
        });

        state.connected = true;
        emit('connectionChange', { connected: true, teacherCode: code });
        return { success: true, message: '先生コードに接続しました。', code: code };

      } catch (err) {
        console.error('[TeacherBridge] 参加処理エラー:', err);
        return { success: false, message: '接続に失敗しました: ' + (err.message || '通信エラー') };
      }
    },

    /**
     * セッション切断
     * @param {boolean} [clearLastCode=true]
     */
    leaveSession: function(clearLastCode) {
      if (studentNodeRef) {
        if (studentValueListener) studentNodeRef.off('value', studentValueListener);
        studentNodeRef.onDisconnect().cancel();
        // 児童自身のノードを安全にオフライン化または削除
        studentNodeRef.update({ connected: false, status: 'offline' }).catch(function(){});
        studentNodeRef = null;
      }
      if (sessionNodeRef && sessionValueListener) {
        sessionNodeRef.child('status').off('value', sessionValueListener);
        sessionNodeRef = null;
      }

      state.sessionActive = false;
      state.connected = false;
      state.status = 'learning';
      if (clearLastCode && global.StudentProfile) {
        global.StudentProfile.setLastTeacherCode('');
      }
      emit('connectionChange', { connected: false });
    },

    /**
     * 先生側でセッションが終了・削除されたときのハンドラ
     */
    handleSessionClosed: function() {
      if (!state.sessionActive) return;
      TeacherBridge.leaveSession(true);
      emit('sessionEnded', { reason: 'closed_by_teacher' });
    },

    /**
     * 画面進捗の更新（画面遷移時に呼ぶ）
     * @param {Object} data { step: string, screenId: string, screenName: string }
     */
    updateProgress: function(data) {
      if (!data) return;
      if (data.step !== undefined) state.currentStep = data.step;
      if (data.screenId !== undefined) state.currentScreenId = data.screenId;
      if (data.screenName !== undefined) state.currentScreenName = data.screenName;

      if (!studentNodeRef || !state.sessionActive) return;

      studentNodeRef.update({
        step: state.currentStep,
        screenId: state.currentScreenId,
        screenName: state.currentScreenName,
        screenEnteredAt: firebase.database.ServerValue.TIMESTAMP,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      }).catch(function(e) {
        console.warn('[TeacherBridge] 進捗同期エラー:', e.message);
      });
    },

    /**
     * 支援レベルの更新（ヒント段階 0〜3）
     * @param {number} level
     */
    updateSupportLevel: function(level) {
      state.supportLevel = Number(level) || 0;
      if (level > 0) state.supportCount++;

      if (!studentNodeRef || !state.sessionActive) return;

      studentNodeRef.update({
        supportLevel: state.supportLevel,
        supportCount: state.supportCount,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      }).catch(function(){});
    },

    /**
     * 「先生に聞く」要請
     */
    requestHelp: function() {
      state.status = 'help_requested';
      state.helpCount++;
      state.helpRequestedAt = now();

      if (!studentNodeRef || !state.sessionActive) return;

      studentNodeRef.update({
        status: 'help_requested',
        helpCount: state.helpCount,
        helpRequestedAt: firebase.database.ServerValue.TIMESTAMP,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      }).catch(function(e) {
        console.warn('[TeacherBridge] ヘルプ要請エラー:', e.message);
      });
    },

    /**
     * 「やっぱり大丈夫」（ヘルプ取り下げ）
     */
    cancelHelp: function() {
      state.status = 'learning';
      state.helpRequestedAt = null;

      if (!studentNodeRef || !state.sessionActive) return;

      studentNodeRef.update({
        status: 'learning',
        helpRequestedAt: null,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      }).catch(function(){});
    },

    /**
     * 「先生といっしょに見た」（ヘルプ解決完了）
     */
    resolveHelp: function() {
      state.status = 'learning';
      state.helpRequestedAt = null;

      if (!studentNodeRef || !state.sessionActive) return;

      studentNodeRef.update({
        status: 'learning',
        helpRequestedAt: null,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      }).catch(function(){});
    },

    /**
     * 休憩・一時停止（「休む」連動）
     */
    pause: function() {
      state.status = 'paused';
      if (!studentNodeRef || !state.sessionActive) return;
      studentNodeRef.update({
        status: 'paused',
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      }).catch(function(){});
    },

    /**
     * 学習再開
     */
    resume: function() {
      state.status = 'learning';
      if (!studentNodeRef || !state.sessionActive) return;
      studentNodeRef.update({
        status: 'learning',
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      }).catch(function(){});
    },

    /**
     * 先生からの状態変化（teacher_coming等）リスナー登録
     * @param {function} callback ({status: string, oldStatus: string}) => void
     */
    onTeacherStatusChange: function(callback) {
      if (typeof callback === 'function') {
        state.listeners.statusChange.push(callback);
      }
    },

    /**
     * 授業終了（先生が終了を押した、または期限切れ）リスナー登録
     * @param {function} callback ({reason: string}) => void
     */
    onSessionEnded: function(callback) {
      if (typeof callback === 'function') {
        state.listeners.sessionEnded.push(callback);
      }
    },

    /**
     * 接続状態変化リスナー登録
     * @param {function} callback ({connected: boolean, teacherCode?: string}) => void
     */
    onConnectionChange: function(callback) {
      if (typeof callback === 'function') {
        state.listeners.connectionChange.push(callback);
      }
    },

    /**
     * 現在の状態取得
     */
    getSessionState: function() {
      return {
        sessionActive: state.sessionActive,
        connected: state.connected,
        teacherCode: state.teacherCode,
        status: state.status,
        step: state.currentStep,
        screenName: state.currentScreenName
      };
    },

    destroy: function() {
      TeacherBridge.leaveSession(false);
      state.listeners.statusChange = [];
      state.listeners.sessionEnded = [];
      state.listeners.connectionChange = [];
    }
  };

  global.TeacherBridge = TeacherBridge;
})(typeof window !== 'undefined' ? window : this);
