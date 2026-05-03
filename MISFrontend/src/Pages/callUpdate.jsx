import React, { useState, useEffect, useRef } from 'react';
import axios from '../apiClient.js';
import { useNavigate } from 'react-router-dom';

export default function CallUpdate({ log, onClose }) {
  const navigate = useNavigate();
  const [values, setValues] = useState({
    id: log?._id || '',
    cachedName: log?.cachedName || '',
    callerId: log?.callerId || '',
    type: log?.type || '',
    duration: log?.duration || '',
  });

  
  const handleSaveChanges = (e) => {
    e.preventDefault();
  
    axios.post(`/calllogs/addCallLog`, {
        Name: values.cachedName,
        Mobile_number: values.callerId,
        Type: values.type,
        Duration: values.duration,
        Status: values.Status,
    })
    .then(res => {  
        if (res.data.success) {
            alert(res.data.message); 
            onClose();
            navigate("/home");
        } else {
            alert(res.data.message); 
        }
    })
    .catch(err => {
        console.log('Error updating calllog:', err);
        alert('CallLog save failed. Please try again.');
    });
    
  };
  
 
  return (
    <>
<div className=" max-w-lg " >
      <div className="w-4/4 vh-100 pt-10 flex flex-col">
        <div className="px-1 pt-4 bg-blue-200 grid grid-cols-12  items-center h-18"  >
          
          <div className="w-12 h-12 p-2 col-start-1 col-end-1 bg-gray-100 rounded-full flex items-center justify-center">
            <strong className="text-l text-gray-500">{values.duration}</strong>
          </div>
          <div>
            <div className="p-2 col-start-2 col-end-5">
              <strong className="text-l text-gray-900">{values.cachedName}</strong>

              <br />
              <strong className="text-l text-gray-900">{values.callerId}</strong>
            </div>        
            
          </div>
      
        </div>

        <div className="flex-1 overflow-y-scroll bg-gray-100 p-4">
          <div className="bg-blue-100 p-3 mb-2 text-right-xs rounded-lg shadow-lg w-3/4 ml-auto">
            <p className="text-sm text-gray-600">{values.type}</p>
          </div>

          <form onSubmit={handleSaveChanges}>
            <div className="">
              <div className="flex-grow p-2 border border-gray-300 rounded-lg">
                Status
                <select
                  className="form-control"
                  value={values.Task}
                  onChange={(e) => setValues({ ...values, Status: e.target.value })}
                >
                  <option value="">Select Status</option>
                  <option value="Banner">Banner</option>
                  <option value="VC">VC</option>
                  <option value="WC">WC</option>
                </select>
              </div>
            </div>

            <div className="pb-14 border-t border-gray-300">
             
              <div className="flex items-center">
              <button type="submit" className="w-100 h-10 bg-blue-500 text-white shadow-lg flex items-center justify-center">
                 Save
                </button>
                <button type="button" className="w-100 h-10 bg-red-500 text-white shadow-lg flex items-center justify-center" onClick={onClose}>Cancel</button>
                </div>
            </div>
          </form>
         
        </div>
      </div>
      </div>
      

    </>
  );
}
