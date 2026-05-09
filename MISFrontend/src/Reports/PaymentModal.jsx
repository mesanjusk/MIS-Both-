import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { addPayment, updatePayment } from '../services/paymentService.js';

export default function PaymentModal({ isOpen, onClose, isEdit, existingData, onSuccess }) {
  const [Payment_name, setPayment_Name] = useState('');

  useEffect(() => {
    if (isEdit && existingData) {
      setPayment_Name(existingData.Payment_name || '');
    } else {
      setPayment_Name('');
    }
  }, [isEdit, existingData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (isEdit) {
        const res = await updatePayment(existingData._id, {
          Payment_name,
        });

        if (res.data.success) {
          toast.success('Payment updated successfully');
          onSuccess();
          onClose();
        } else {
          toast.error('Failed to update');
        }
      } else {
        await addPayment({ Payment_name });
        toast.success('Payment added successfully');
        onSuccess();
        onClose();
      }
    } catch (err) {
      if (err.response?.status === 409) {
        toast.error('Name already exists');
      } else {
        console.error(err);
        toast.error('Error while submitting');
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
      <div className="bg-white rounded shadow-lg p-6 w-full max-w-md">
        <h2 className="text-lg font-bold mb-4">{isEdit ? 'Edit Payment' : 'Add Payment'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block font-semibold mb-1">Payment Name</label>
            <input
              type="text"
              value={Payment_name}
              onChange={(e) => setPayment_Name(e.target.value)}
              className="w-full border px-3 py-2 rounded"
              required
            />
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="bg-gray-400 text-white px-4 py-2 rounded mr-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-blue-500 text-white px-4 py-2 rounded"
            >
              {isEdit ? 'Update' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
