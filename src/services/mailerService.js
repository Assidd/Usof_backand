// src/services/mailerService.js
'use strict';

const { sendMail } = require('../config/mailer');
const env = require('../config/env');

// Базовый адрес, на который будет вести ссылка из письма
function baseUrl() {
  return env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
}

function buildVerifyUrl(token) {
  const url = new URL('/auth/verify-email', baseUrl());
  url.searchParams.set('token', token);
  return url.toString();
}

function buildResetUrl(token) {
  const url = new URL('/auth/reset', baseUrl());
  url.searchParams.set('token', token);
  return url.toString();
}

/**
 * Письмо подтверждения e-mail
 */
async function sendVerifyEmail(to, token) {
  const link = buildVerifyUrl(token);
  const subject = 'USOF — подтвердите e-mail';
  const text = `Для завершения регистрации откройте ссылку: ${link}`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height:1.5">
      <h2>Подтверждение e-mail</h2>
      <p>Для завершения регистрации нажмите на ссылку ниже:</p>
      <p><a href="${link}">${link}</a></p>
      <hr/>
      <p style="color:#666">Если это были не вы — просто проигнорируйте письмо.</p>
    </div>
  `;

  return sendMail({ to, subject, text, html, from: env.FROM_EMAIL });
}

/**
 * Письмо со сбросом пароля (если будешь использовать)
 */
async function sendResetEmail(to, token) {
  const link = buildResetUrl(token);
  const subject = 'USOF — сброс пароля';
  const text = `Сбросить пароль можно по ссылке: ${link}`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height:1.5">
      <h2>Сброс пароля</h2>
      <p>Перейдите по ссылке, чтобы задать новый пароль:</p>
      <p><a href="${link}">${link}</a></p>
    </div>
  `;

  return sendMail({ to, subject, text, html, from: env.FROM_EMAIL });
}

module.exports = {
  sendVerifyEmail,
  sendResetEmail,
  buildVerifyUrl,
  buildResetUrl,
};
