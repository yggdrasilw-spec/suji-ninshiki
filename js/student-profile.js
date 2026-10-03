/**
 * StudentProfile - 児童ローカルプロフィール共通モジュール
 * 既存レイドボス系アプリ（raid-boss-project）の保存値をそのまま共有
 */
(function(global) {
  'use strict';

  const STORAGE_KEYS = {
    NAME: 'raid_boss_student_name',
    AVATAR: 'raid_boss_student_avatar',
    LAST_TEACHER_CODE: 'teacher_bridge_last_code'
  };

  const DEFAULT_AVATARS = ['⚔️', '🧙‍♂️', '🏹', '🥷', '🐱', '🐶', '🤖', '⚓'];

  const StudentProfile = {
    getNickname: function() {
      try {
        const name = localStorage.getItem(STORAGE_KEYS.NAME);
        return (name && name.trim()) ? name.trim() : '';
      } catch (e) {
        return '';
      }
    },

    setNickname: function(name) {
      if (!name) return;
      const clean = String(name).trim().slice(0, 10);
      try {
        localStorage.setItem(STORAGE_KEYS.NAME, clean);
      } catch (e) {}
      return clean;
    },

    getAvatar: function() {
      try {
        const av = localStorage.getItem(STORAGE_KEYS.AVATAR);
        return av || '⚔️';
      } catch (e) {
        return '⚔️';
      }
    },

    setAvatar: function(avatar) {
      if (!avatar) return;
      try {
        localStorage.setItem(STORAGE_KEYS.AVATAR, avatar);
      } catch (e) {}
    },

    getLastTeacherCode: function() {
      try {
        return localStorage.getItem(STORAGE_KEYS.LAST_TEACHER_CODE) || '';
      } catch (e) {
        return '';
      }
    },

    setLastTeacherCode: function(code) {
      try {
        if (code) localStorage.setItem(STORAGE_KEYS.LAST_TEACHER_CODE, code);
        else localStorage.removeItem(STORAGE_KEYS.LAST_TEACHER_CODE);
      } catch (e) {}
    },

    normalizeCode: function(str) {
      if (!str) return '';
      return String(str)
        .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function(s) {
          return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
        })
        .replace(/\s+/g, '')
        .toUpperCase();
    },

    AVATARS: DEFAULT_AVATARS
  };

  global.StudentProfile = StudentProfile;
})(typeof window !== 'undefined' ? window : this);
