import { useEffect, useState } from 'react';
import io from 'socket.io-client';
import { getApiBase } from '../apiClient.js';

let socket;

export default function WhatsAppLogin() {
  const [qrCode, setQrCode] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null); // State for error handling
  const [isModalOpen, setIsModalOpen] = useState(false); // State to control modal visibility

  useEffect(() => {
    let s;
    const base = getApiBase();
    s = io(base);
    socket = s;
    s.on('qr', (data) => {
      console.log("QR Code Data:", data);
      setQrCode(data);
      setIsModalOpen(true);
    });
    s.on('ready', () => setIsReady(true));
    s.on('error', (error) => {
      console.error("Socket Error:", error);
      setError("Failed to connect. Please try again.");
    });

    return () => {
      if (s) {
        s.off('qr');
        s.off('ready');
        s.off('error');
        s.disconnect();
      }
    };
  }, []);

  const closeModal = () => {
    setIsModalOpen(false); // Close the modal
  };

  const retryConnection = () => {
    setError(null); // Reset error message
    socket.connect(); // Retry the connection
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen">
      {error && (
        <div className="bg-red-500 text-white p-4 rounded mb-4">
          <p>{error}</p>
          <button 
            className="mt-4 bg-blue-500 text-white py-2 px-4 rounded"
            onClick={retryConnection}
          >
            Retry
          </button>
        </div>
      )}
      
      {isReady ? (
        <p className="text-blue-600 text-xl">✅ WhatsApp is connected!</p>
      ) : qrCode ? (
        <>
          <p className="text-gray-700 mb-4">Scan this QR with your phone</p>
          {/* Modal for displaying the QR code */}
          {isModalOpen && (
            <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
              <div className="bg-white p-6 rounded-lg shadow-lg">
                <h2 className="text-xl font-bold mb-4">Scan the QR Code</h2>
                <img src={qrCode} />

                <button
                  className="bg-blue-500 text-white py-2 px-4 rounded"
                  onClick={closeModal}
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <p>Waiting for QR code...</p>
      )}
    </div>
  );
}
