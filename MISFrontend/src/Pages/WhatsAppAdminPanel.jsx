import React, { useEffect, useState } from 'react';
import {
  fetchSessions as fetchSessionsApi,
  resetSession as resetSessionApi,
  startSession as startSessionApi,
  fetchSessionQr,
} from '../services/whatsappService.js';

export default function WhatsAppAdminPanel() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [qrSession, setQrSession] = useState(null);
  const [qrImage, setQrImage] = useState(null);
  const [qrStatus, setQrStatus] = useState('pending');
  const [lastUpdatedMap, setLastUpdatedMap] = useState({});
  const [newSessionId, setNewSessionId] = useState('');

  const fetchSessions = async () => {
    try {
      const res = await fetchSessionsApi();
      if (res.data.success) {
        setSessions(res.data.sessions);
        const now = Date.now();
        const updated = {};
        res.data.sessions.forEach(s => updated[s.sessionId] = now);
        setLastUpdatedMap(prev => ({ ...prev, ...updated }));
      }
    } catch (err) {
      console.error('❌ Failed to fetch sessions:', err);
    }
  };

  const resetSession = async (sessionId) => {
    if (!window.confirm(`Reset session ${sessionId}?`)) return;
    try {
      await resetSessionApi(sessionId);
      alert(`✅ Session ${sessionId} reset.`);
      fetchSessions();
    } catch (err) {
      alert(`❌ Failed to reset session ${sessionId}`);
      console.error(err);
    }
  };

  const startSession = async (sessionId) => {
    if (!sessionId || sessionId.trim() === '') {
      alert('❌ Session ID is required.');
      return;
    }

    setLoading(true);
    try {
      await startSessionApi(sessionId.trim());
      alert(`✅ Session ${sessionId} started.`);
      setNewSessionId('');
      fetchSessions();
    } catch (err) {
      alert(`❌ Failed to start session ${sessionId}`);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openQR = async (sessionId) => {
    setQrSession(sessionId);
    await fetchQR(sessionId);
  };

  const fetchQR = async (sessionId) => {
    try {
      const res = await fetchSessionQr(sessionId);
      setQrStatus(res.data.status);
      if (res.data.qrImage) setQrImage(res.data.qrImage);
    } catch (err) {
      setQrStatus('error');
    }
  };

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!qrSession || qrStatus === 'ready') return;
    const interval = setInterval(() => fetchQR(qrSession), 10000);
    return () => clearInterval(interval);
  }, [qrSession, qrStatus]);

  const minutesAgo = (ts) => {
    const mins = Math.floor((Date.now() - ts) / 60000);
    return mins <= 0 ? 'Just now' : `${mins} min ago`;
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-4">🛠️ WhatsApp Session Admin</h2>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="New session ID"
          className="border px-3 py-2 text-sm rounded w-full"
          value={newSessionId}
          onChange={(e) => setNewSessionId(e.target.value)}
        />
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm"
          onClick={() => startSession(newSessionId)}
          disabled={loading}
        >
          + Add
        </button>
      </div>

      <table className="w-full text-sm border">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2 border">Session ID</th>
            <th className="p-2 border">Status</th>
            <th className="p-2 border">Last Seen</th>
            <th className="p-2 border">Actions</th>
            <th className="p-2 border">QR</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.sessionId} className="text-center">
              <td className="p-2 border">{s.sessionId}</td>
              <td className="p-2 border">
                {s.ready ? (
                  <span className="text-blue-600 font-medium">✅ Ready</span>
                ) : (
                  <span className="text-yellow-600 font-medium">🕓 Not Ready</span>
                )}
                {!s.ready && lastUpdatedMap[s.sessionId] &&
                  Date.now() - lastUpdatedMap[s.sessionId] > 5 * 60 * 1000 && (
                    <span className="ml-1 text-red-600">⚠️</span>
                  )}
              </td>
              <td className="p-2 border text-xs text-gray-500">
                {lastUpdatedMap[s.sessionId] ? minutesAgo(lastUpdatedMap[s.sessionId]) : 'Unknown'}
              </td>
              <td className="p-2 border space-x-2">
                <button
                  onClick={() => startSession(s.sessionId)}
                  className="bg-blue-500 text-white px-3 py-1 rounded text-xs hover:bg-blue-600"
                  disabled={loading}
                >
                  Start
                </button>
                <button
                  onClick={() => resetSession(s.sessionId)}
                  className="bg-red-500 text-white px-3 py-1 rounded text-xs hover:bg-red-600"
                >
                  Reset
                </button>
              </td>
              <td className="p-2 border">
                <button
                  onClick={() => openQR(s.sessionId)}
                  className="text-blue-500 underline text-xs"
                >
                  Show QR
                </button>
              </td>
            </tr>
          ))}
          {!sessions.length && (
            <tr>
              <td colSpan="5" className="p-4 text-center text-gray-500">
                No sessions found.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* QR Modal */}
      {qrSession && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 shadow-xl w-[300px]">
            <h3 className="font-bold text-lg mb-2">Scan QR - {qrSession}</h3>
            {qrStatus === 'ready' && qrImage ? (
              <img src={qrImage} alt="QR Code" className="w-full" />
            ) : qrStatus === 'pending' ? (
              <p className="text-sm text-gray-500">QR code not ready yet...</p>
            ) : (
              <p className="text-sm text-red-500">Failed to load QR.</p>
            )}
            <div className="text-right mt-4">
              <button onClick={() => setQrSession(null)} className="text-sm text-blue-500">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
