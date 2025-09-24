'use strict';

const { Router } = require('express');
const validate = require('../middleware/validate');
const auth = require('../middleware/authMiddleware');
const { authLimiter } = require('../middleware/rateLimit');
const ctrl = require('../controllers/authController');

const r = Router();

// регистрация
r.post(
  '/register',
  validate({
    body: {
      login:     { type: 'string', required: true, min: 3, max: 64 },
      email:     { type: 'email',  required: true },
      password:  { type: 'string', required: true, min: 6, max: 128 },
      full_name: { type: 'string', required: false, max: 128 },
    },
  }),
  ctrl.register
);

// логин (жёсткий лимитер)
r.post(
  '/login',
  authLimiter,
  validate({
    body: {
      identifier: { type: 'string', required: true, max: 128 }, // login или email
      password:   { type: 'string', required: true, min: 6, max: 128 },
    },
  }),
  ctrl.login
);

// повторная отправка письма подтверждения
r.post(
  '/resend-verification',
  validate({
    body: { email: { type: 'email', required: true } },
  }),
  ctrl.resendVerification
);

// верификация email (GET/POST — на выбор фронта)
r.get(
  '/verify-email',
  validate({ query: { token: { type: 'string', required: true } } }),
  ctrl.verifyEmail
);
r.post(
  '/verify-email',
  validate({ body: { token: { type: 'string', required: true } } }),
  ctrl.verifyEmail
);

// ─────────────────────────────────────────────
// существующие роуты сброса (оставляем для совместимости)
r.post(
  '/request-reset',
  authLimiter,
  validate({ body: { email: { type: 'email', required: true } } }),
  ctrl.requestReset
);
r.post(
  '/reset',
  authLimiter,
  validate({
    body: {
      token:       { type: 'string', required: true },
      newPassword: { type: 'string', required: true, min: 6, max: 128 },
    },
  }),
  ctrl.resetPassword
);

// ─────────────────────────────────────────────
// PDF aliases (точные пути из задания):
// POST /api/auth/password-reset            — init by email
r.post(
  '/password-reset',
  authLimiter,
  validate({ body: { email: { type: 'email', required: true } } }),
  ctrl.passwordResetInit
);

// POST /api/auth/password-reset/:confirm_token   — confirm new password
r.post(
  '/password-reset/:confirm_token',
  authLimiter,
  validate({
    params: { confirm_token: { type: 'string', required: true } },
    body: { password: { type: 'string', required: true, min: 6, max: 128 } },
  }),
  ctrl.passwordResetConfirm
);

// ─────────────────────────────────────────────
// REFRESH: обмен refresh → новые access+refresh (жёсткий лимитер)
r.post(
  '/refresh',
  authLimiter,
  validate({
    body: {
      refreshToken: { type: 'string', required: true, min: 20, max: 512 },
    },
  }),
  ctrl.refresh
);

// logout с ревокацией access (Bearer) + опционально refreshToken в body
r.post(
  '/logout',
  auth,
  validate({
    body: {
      refreshToken: { type: 'string', min: 20, max: 512 }, // опционально
    },
  }),
  ctrl.logout
);

module.exports = r;
