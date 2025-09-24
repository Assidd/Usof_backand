// src/controllers/authController.js
'use strict';

const authService = require('../services/authService');

module.exports = {
  // POST /auth/register
  async register(req, res, next) {
    try {
      const { login, email, password, full_name } = req.body;
      const data = await authService.register({ login, email, password, full_name });
      res.status(201).json(data);
    } catch (e) { next(e); }
  },

  // POST /auth/login
  async login(req, res, next) {
    try {
      // identifier = login or email
      const { identifier, password } = req.body;
      const data = await authService.login({ identifier, password });

      // ⚠️ Без алиаса "token": только accessToken/refreshToken (+user)
      const out = {
        accessToken: data?.accessToken ?? data?.token ?? null,
        refreshToken: data?.refreshToken ?? null,
      };
      if (data?.user) out.user = data.user;

      res.json(out);
    } catch (e) { next(e); }
  },

  // POST /auth/resend-verification
  async resendVerification(req, res, next) {
    try {
      const { email } = req.body;
      const data = await authService.resendVerification(email);
      res.json(data); // { ok: true, [email_token] }
    } catch (e) { next(e); }
  },

  // GET/POST /auth/verify-email
  async verifyEmail(req, res, next) {
    try {
      const token = req.query.token || req.body?.token;
      const data = await authService.verifyEmail(token);
      res.json(data); // { ok: true }
    } catch (e) { next(e); }
  },

  // POST /auth/request-reset
  async requestReset(req, res, next) {
    try {
      const { email } = req.body;
      const data = await authService.requestPasswordReset(email);
      res.json(data); // { ok: true, [reset_token] }
    } catch (e) { next(e); }
  },

  // POST /auth/reset-password
  async resetPassword(req, res, next) {
    try {
      const { token, newPassword } = req.body;
      const data = await authService.resetPassword({ token, newPassword });
      res.json(data); // { ok: true }
    } catch (e) { next(e); }
  },

  // ─────────────────────────────────────────────
  // PDF aliases:
  // POST /api/auth/password-reset        { email }
  async passwordResetInit(req, res, next) {
    try {
      const { email } = req.body;
      const data = await authService.requestPasswordReset(email);
      res.json(data); // { ok: true }
    } catch (e) { next(e); }
  },

  // POST /api/auth/password-reset/:confirm_token   { password }
  async passwordResetConfirm(req, res, next) {
    try {
      const token = req.params.confirm_token;
      const { password } = req.body;
      const data = await authService.resetPassword({ token, newPassword: password });
      res.json(data); // { ok: true }
    } catch (e) { next(e); }
  },
  // ─────────────────────────────────────────────

  // POST /auth/refresh  — обмен refresh → новые access+refresh
  async refresh(req, res, next) {
    try {
      const { refreshToken } = req.body;
      const data = await authService.refresh({ refreshToken });

      // ⚠️ Без алиаса "token": только accessToken/refreshToken
      res.json({
        accessToken: data?.accessToken ?? data?.token ?? null,
        refreshToken: data?.refreshToken ?? null,
      });
    } catch (e) { next(e); }
  },

  // POST /auth/logout — ревокация access (по jti/exp) + опционально refresh
  async logout(req, res, next) {
    try {
      const jti = req.tokenMeta?.jti;
      const exp = req.tokenMeta?.exp;
      const userId = req.user?.id || null;
      const refreshToken = req.body?.refreshToken;

      const data = await authService.logout({ jti, exp, userId, refreshToken });
      res.json(data); // { ok: true }
    } catch (e) { next(e); }
  },
};
