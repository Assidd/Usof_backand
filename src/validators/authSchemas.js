'use strict';

/**
 * /auth/register
 */
const registerSchema = {
  body: {
    login:     { type: 'string', required: true, min: 3, max: 64 },
    email:     { type: 'email',  required: true },
    password:  { type: 'string', required: true, min: 6, max: 128 },
    full_name: { type: 'string', required: true, min: 2, max: 255 },
  }
};

/**
 * /auth/login
 * ожидаем loginOrEmail + password
 */
const loginSchema = {
  body: {
    loginOrEmail: { type: 'string', required: true, min: 3, max: 255 },
    password:     { type: 'string', required: true, min: 6, max: 128 },
  }
};

/**
 * /auth/resend-verification
 */
const resendVerificationSchema = {
  body: {
    email: { type: 'email', required: true },
  }
};

/**
 * /auth/verify-email?token=...
 * GET с query-параметром token
 */
const verifyEmailSchema = {
  query: {
    token: { type: 'string', required: true, min: 10, max: 200 },
  }
};

/**
 * /auth/request-reset
 */
const requestResetSchema = {
  body: {
    email: { type: 'email', required: true },
  }
};

/**
 * /auth/reset-password
 */
const resetPasswordSchema = {
  body: {
    token:       { type: 'string', required: true, min: 10, max: 200 },
    newPassword: { type: 'string', required: true, min: 6, max: 128 },
  }
};

/**
 * /auth/refresh
 * обмен refresh → новые access+refresh
 */
const refreshSchema = {
  body: {
    refreshToken: { type: 'string', required: true, min: 20, max: 512 },
  }
};

/**
 * /auth/logout
 * можно (опционально) прислать refreshToken, чтобы отозвать его на сервере
 */
const logoutSchema = {
  body: {
    refreshToken: { type: 'string', min: 20, max: 512 },
  }
};

module.exports = {
  registerSchema,
  loginSchema,
  resendVerificationSchema,
  verifyEmailSchema,
  requestResetSchema,
  resetPasswordSchema,
  refreshSchema,
  logoutSchema,
};
