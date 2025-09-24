// validators/likeSchemas.js
// Схемы для validate.js

exports.postIdParam = { params: { postId: { type: 'number', required: true } } };
exports.commentIdParam = { params: { commentId: { type: 'number', required: true } } };
exports.likeBody = {
  body: { type: { type: 'string', required: true, enum: ['like', 'dislike'] } }
};
