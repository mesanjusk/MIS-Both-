import React, { useState} from 'react';
import UpdateDelivery from '../Pages/updateDelivery';

export default function EditOrder({ order }) {
    const [showEditModal, setShowEditModal] = useState(false); 
    const [selectedOrder, setSelectedOrder] = useState(null);

     const handleEditClick = (order) => {
    setSelectedOrder(order); 
    setShowEditModal(true);  
  }
const closeEditModal = () => {
    setShowEditModal(false); 
    setSelectedOrder(null);  
  };
    return (
        <>
        <div className="flex gap-2">
           
          <button onClick={() => handleEditClick(order)} className="p-2 rounded-full bg-white shadow hover:bg-gray-100">
        <svg className="h-5 w-5 text-blue-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M16.5 3.5a2.1 2.1 0 013 3L8.5 17l-4 1 1-4z" />
        </svg>
      </button>
        </div>
         {showEditModal && (
            <div className="modal-overlay fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center">
              <UpdateDelivery order={selectedOrder} onClose={closeEditModal} />
            </div>
          )}
    </>
    );
}

