import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import normalizeWhatsAppNumber from '../utils/normalizeNumber';
import { fetchSessions, sendTestMessage } from '../services/whatsappService.js';

export default function SendMessagePanel() {
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [to, setTo] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const loadSessions = async () => {
      try {
        const res = await fetchSessions();
        if (res.data.success) setSessions(res.data.sessions);
      } catch (err) {
        console.error('Failed to load sessions:', err);
      }
    };
    loadSessions();
  }, []);

  const sendMessage = async () => {
    try {
      const number = normalizeWhatsAppNumber(to);
      await sendTestMessage({ sessionId, to: number, message });
      toast.success('Message sent!');
    } catch (err) {
      console.error(err);
      toast.error('Failed to send message');
    }
  };

  return (
    <div className="max-w-xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-4">Send WhatsApp Message</h2>

      <div className="mb-4">
        <label className="block text-sm font-medium">Session</label>
        <select
          className="border w-full p-2 rounded"
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
        >
          <option value="">Select session</option>
          {sessions.map((s) => (
            <option key={s.sessionId} value={s.sessionId}>
              {s.sessionId} {s.user ? `(${s.user.name})` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium">To (WhatsApp number)</label>
        <input
          type="text"
          className="border w-full p-2 rounded"
          placeholder="91XXXXXXXXXX"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium">Message</label>
        <textarea
          className="border w-full p-2 rounded"
          rows="4"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>

      <button
        onClick={sendMessage}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        disabled={!sessionId || !to || !message}
      >
        Send
      </button>
    </div>
  );
}
