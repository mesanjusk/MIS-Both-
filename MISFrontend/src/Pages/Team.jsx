import React, { useState, useEffect } from "react";
import axios from '../apiClient.js';

export default function Team() {
  const [users, setUsers] = useState([]);
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    fetchTeam();
  }, []);

  const fetchTeam = async () => {
    // For demo, fetch all users and all tasks
    // In real, filter based on admin privileges
    const token = localStorage.getItem("token");
    const resTasks = await axios.get(`/tasks`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setTasks(resTasks.data.tasks);
  };

  return (
    <div className="min-h-screen bg-gray-200 p-4">
      <div className="max-w-4xl mx-auto bg-white rounded shadow p-6">
        <h2 className="text-xl font-bold mb-4">Team Progress Overview</h2>
        <ul>
          {tasks.map(t => (
            <li key={t._id} className="border-b py-2 flex flex-col gap-1">
              <div className="flex justify-between">
                <span>{t.user?.name || "User"}: {t.name} ({t.date?.slice(0,10)})</span>
                <span>{t.progress || 0}%</span>
              </div>
              {t.small && (
                <div className="ml-6 text-xs text-gray-600">
                  <div><b>SMALL Breakdown:</b></div>
                  {Object.entries(t.small).map(([k,v]) => <div key={k}>{k}: {v}</div>)}
                </div>
              )}
              {t.review && <div className="ml-6 text-xs text-gray-600">Review: {t.review}</div>}
            </li>
          ))}
        </ul>
        <button className="mt-6 px-4 py-2 bg-gray-800 text-white rounded" onClick={() => window.location.href = "/planner"}>Back to Planner</button>
      </div>
    </div>
  );
}
