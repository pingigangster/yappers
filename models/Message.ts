import mongoose from 'mongoose';

const MessageSchema = new mongoose.Schema({
  content: {
    type: String,
    required: [true, 'El mensaje no puede estar vacío'],
    trim: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  room: {
    type: String,
    default: 'general',
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Índice compuesto para consultar mensajes por sala + fecha
MessageSchema.index({ room: 1, createdAt: -1 });

export default mongoose.models.Message || mongoose.model('Message', MessageSchema); 