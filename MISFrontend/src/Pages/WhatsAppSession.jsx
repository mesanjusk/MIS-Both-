import React, { useState, useEffect } from 'react';
import axios from '../apiClient.js';
import { ToastContainer, toast } from '../Components';
import normalizeWhatsAppNumber from '../utils/normalizeNumber';

const WhatsAppSession = () => {
  const [number, setNumber] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const checkStatus = async () => {
    try {
      const res = await axios.get('/api/whatsapp/status');
      setIsConnected(res.data.ready === true);
    } catch (err) {
      console.error("Status check failed:", err);
      setIsConnected(false);
    }
  };

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 10000); // check every 10s
    return () => clearInterval(interval);
  }, []);

  const handleSend = async (e) => {
    e.preventDefault();

    if (!number || !message) {
      toast.error("Please fill all fields");
      return;
    }

    setSending(true);
    try {
      const normalized = normalizeWhatsAppNumber(number);
      const res = await axios.post('/api/whatsapp/send-test', {
        number: normalized,
        message,
      });

      if (res.data && res.data.success && res.data.messageId) {
        toast.success(`✅ Message sent! ID: ${res.data.messageId}`);
        setMessage('');
      } else {
        toast.error("⚠️ Message send failed (server did not confirm)");
      }
    } catch (err) {
      console.error("❌ Send error:", err);
      toast.error("❌ Failed to send message");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center bg-gray-100 p-4">
      <ToastContainer />

      {/* ✅ Status Banner */}
      <div className={`w-full max-w-md text-center py-2 rounded mb-4 ${isConnected ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
        {isConnected ? '🟢 WhatsApp Connected' : '🔴 WhatsApp Not Connected'}
      </div>

      <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-semibold mb-4 text-center">📲 Send WhatsApp Message</h2>

        <form onSubmit={handleSend} className="space-y-4">
          <input
            type="text"
            placeholder="Phone number (e.g., 91XXXXXXXXXX)"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <textarea
            rows="4"
            placeholder="Enter your message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <button
            type="submit"
            disabled={sending}
            className={`w-full py-2 rounded text-white ${sending ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {sending ? 'Sending...' : 'Send Message'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default WhatsAppSession;
