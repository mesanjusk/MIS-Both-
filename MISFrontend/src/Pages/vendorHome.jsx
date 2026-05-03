import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from "react-router-dom";
import { addAttendance } from '../services/attendanceService.js';

export default function VendorHome() {
  const navigate = useNavigate();
  const location = useLocation();
  const [userName, setUserName] = useState('');
  const [showOutButton, setShowOutButton] = useState(false); 

  useEffect(() => {
    const userNameFromState = location.state?.id;
    const loggedInUser = userNameFromState || localStorage.getItem('User_name');

    if (loggedInUser) {
      setUserName(loggedInUser);
    } else {
      navigate("/login");
    }
  }, [location.state, navigate]);

  const saveAttendance = async (type) => {
    const currentTime = new Date().toLocaleTimeString('en-US', { hour12: false });
    const currentDate = new Date().toLocaleDateString(); 

    try {
      const response = await addAttendance({
        User_name: userName,
        Type: type,
        Status: 'Present',
        Date: currentDate,  
        Time: currentTime    
      });

      if (response.data.success) {
        alert(`Attendance saved successfully for ${type}`);
      } else {
        console.error('Failed to save attendance:', response.data.message);
      }
    } catch (error) {
      console.error('Error saving attendance:', error.response?.data?.message || error.message);
    }
  };

  const handleInClick = () => {
    setShowOutButton(true);
    saveAttendance('In'); 
  };
  
  const handleOutClick = () => {
    setShowOutButton(false);
    saveAttendance('Out'); 
  };

  return (
    <>
      <div className="relative mt-10">
        <h1 className="absolute right-10 text-s font-bold mb-6">Welcome, {userName}!</h1>

        <div className="absolute right-10 top-10 p-2">
          <button
            onClick={handleInClick}
            className={`sanju ${showOutButton ? 'hidden' : 'visible'} bg-blue-500 text-white px-2 py-2 mr-2 rounded`}
          >
            In
          </button>

          {showOutButton && (
            <button
              onClick={handleOutClick}
              className="sanju bg-red-500 text-white px-2 py-2 rounded"
            >
              Out
            </button>
          )}
        </div>
      </div>

    </>
  );
}
