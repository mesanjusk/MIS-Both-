import React, { useState, useEffect, useRef } from 'react';
import axios from '../apiClient.js';
import { useNavigate } from 'react-router-dom';

export default function TaskUpdate({ task, onClose }) {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [selectedTask, setSelecteTask] = useState(null); 
  const [values, setValues] = useState({
    id: task?._id || '',
    Usertask_name: task?.Usertask_name || '',
    Usertask_Number: task?.Usertask_Number || '',
    Remark: task?.Remark || '',
   Deadline: task?.Deadline || '',
    Status: task?.Status || ''
  });


  useEffect(() => {
    axios.get("/api/usertasks/GetUsertaskList")
      .then(res => {
        if (res.data.success) {
          setTasks(res.data.result);
        } else {
          setTasks([]);
        }
      })
      .catch(err => console.log('Error fetching order list:', err));
  }, []);
  
  

  const handleSaveChanges = (e) => {
    e.preventDefault();

    axios.put(`/usertask/update/${values.id}`, {
        Usertask_name: values.Usertask_name,
        Usertask_number: values.Usertask_Number,
        Deadline: values.Deadline,
        Remark: values.Remark,
        Status: values.Status,
      })
      .then(res => {
        if (res.data.success) {
          alert('Task updated successfully!');
          onClose(); 
          navigate("/home");  
        }
      })
      .catch(err => {
        console.log('Error updating order:', err);
      });
  };

 
  return (
    <>
<div className=" max-w-lg " >
      <div className="w-4/4 vh-100 pt-10 flex flex-col">
        <div className="px-1 pt-4 bg-blue-200 grid grid-cols-12  items-center h-18"  >
          
          <div className="w-12 h-12 p-2 col-start-1 col-end-1 bg-gray-100 rounded-full flex items-center justify-center">
            <strong className="text-l text-gray-500">{values.Usertask_Number}</strong>
          </div>
          <div>
            <div className="p-2 col-start-2 col-end-5">
              <strong className="text-l text-gray-900">{values.Usertask_name}</strong>
              <br />
            </div>        
            
          </div>
      
        </div>

        <div className="flex-1 overflow-y-scroll bg-gray-100 p-4">
          <div className="bg-blue-100 p-3 mb-2 text-right-xs rounded-lg shadow-lg w-3/4 ml-auto">
            <p className="text-sm text-gray-600">{values.Remark}</p>
          </div>

          <form onSubmit={handleSaveChanges}>
            <div className="">
              <div className="flex-grow p-2 border border-gray-300 rounded-lg">
                Update Status
                <select
                  className="form-control"
                  value={values.Task}
                  onChange={(e) => setValues({ ...values, Status: e.target.value })}
                >
                  <option value="">Select Status</option>
                  <option value="Completed">Completed</option>
                  <option value="Delegation">Delegation</option>
                </select>
              </div>
            </div>

            <div className="pb-14 border-t border-gray-300">
              <div className="flex items-center">
                <input
                  type="date"
                  value={values.Deadline}
                  onChange={(e) => setValues({ ...values, Deadline: e.target.value })}
                  placeholder="Deadline"
                  className="flex-grow p-2 border border-gray-300 rounded-lg"
                />
                
              </div>
              <div className="flex items-center">
              <button type="submit" className="ml-2 bg-blue-500 text-white p-2 rounded-lg">
                  UPDATE
                </button>
                <button type="button" className="ml-2 bg-blue-500 text-white p-2 rounded-lg" onClick={onClose}>Cancel</button>
                </div>
            </div>
          </form>
        </div>
      </div>
      </div>
      

    </>
  );
}
