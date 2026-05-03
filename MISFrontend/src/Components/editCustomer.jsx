import React, { useState} from 'react';
import UpdateCustomer from '../Reports/updateCustomer';

export default function EditCustomer({ order }) {
    const [showUpdateModal, setShowUpdateModal] = useState(false); 
    const [selectedOrder, setSelectedOrder] = useState(null);

    const handleUpdateClick = (order) => {
    setSelectedOrder(order); 
    setShowUpdateModal(true);  
  }
const closeUpdateModal = () => {
    setShowUpdateModal(false); 
    setSelectedOrder(null);  
  };
    return (
        <>
        <div className="flex gap-2">
           
          <button onClick={() => handleUpdateClick(order)} className="p-2 rounded-full bg-white shadow hover:bg-gray-100">
        Ed
      </button>
        </div>
        {showUpdateModal && (
            <div className="modal-overlay fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center">
              <UpdateCustomer order={selectedOrder} onClose={closeUpdateModal} />
            </div>
          )}
    </>
    );
}

