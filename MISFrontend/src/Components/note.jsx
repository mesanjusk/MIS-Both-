import React, { useState} from 'react';
import AddNote from "../Pages/addNote";

export default function Note({ order }) {
    const [showNoteModal, setShowNoteModal] = useState(false); 
    const [selectedOrder, setSelectedOrder] = useState(null);

      const handleNoteClick = (order) => {
    setSelectedOrder(order); 
    setShowNoteModal(true);  
  }
const closeNoteModal = () => {
    setShowNoteModal(false); 
    setSelectedOrder(null); 
  };
    return (
        <>
        <div className="flex gap-2">
           
           <button onClick={() => handleNoteClick(order)} className="p-2 rounded-full bg-white shadow hover:bg-gray-100">
        <svg className="h-6 w-6 text-blue-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <line x1="9" y1="12" x2="15" y2="12" />
          <line x1="12" y1="9" x2="12" y2="15" />
        </svg>
      </button>
        </div>
      {showNoteModal && (
          <div className="modal-overlay fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center">
            <AddNote order={selectedOrder} onClose={closeNoteModal} />
          </div>
        )}
    </>
    );
}

