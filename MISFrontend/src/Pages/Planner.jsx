import React, { useState, useEffect } from "react";
import axios from '../apiClient.js';

const taskNames = ["Task", "Task1", "Task2", "Task3", "Task-1", "Task-2", "Task-3"];

export default function Planner() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [logs, setLogs] = useState({});
  const [progress, setProgress] = useState({});
  const [timeBlocks, setTimeBlocks] = useState([]);
  const [blockModal, setBlockModal] = useState({ open: false, edit: null });
  const [blockForm, setBlockForm] = useState({ time: "", activity: "" });
  const [taskModal, setTaskModal] = useState({ open: false, task: null });
  const [taskForm, setTaskForm] = useState({ plannedHours: "", loggedHours: "", progress: "" });

  useEffect(() => { fetchBlocks(); }, []);
  useEffect(() => { fetchLogs(); }, [date]);

  // Fetch all time blocks
  const fetchBlocks = async () => {
    const res = await axios.get("/api/timeblocks");
    setTimeBlocks(res.data.blocks);
  };

  // Fetch all daily task logs
  const fetchLogs = async () => {
    const token = localStorage.getItem("token");
    const res = await axios.get(`/api/tasks?period=daily&date=${date}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const logsByTask = {};
    res.data.tasks?.forEach(t => logsByTask[t.name] = t);
    setLogs(logsByTask);

    // Calculate progress
    const prog = {};
    Object.keys(logsByTask).forEach(task => prog[task] = logsByTask[task]?.progress || 0);
    setProgress(prog);
  };

  // Handle Add/Edit Time Block Modal
  const openBlockModal = (block) => {
    if (block) {
      setBlockForm({ time: block.time, activity: block.activity });
      setBlockModal({ open: true, edit: block });
    } else {
      setBlockForm({ time: "", activity: "" });
      setBlockModal({ open: true, edit: null });
    }
  };
  const closeBlockModal = () => {
    setBlockForm({ time: "", activity: "" });
    setBlockModal({ open: false, edit: null });
  };
  const saveBlock = async (e) => {
    e.preventDefault();
    if (blockModal.edit) {
      await axios.put(`/api/timeblocks/${blockModal.edit._id}`, blockForm);
    } else {
      await axios.post("/api/timeblocks", blockForm);
    }
    closeBlockModal();
    fetchBlocks();
  };
  const deleteBlock = async (id) => {
    if (window.confirm("Delete this time block?")) {
      await axios.delete(`/api/timeblocks/${id}`);
      fetchBlocks();
    }
  };

  // Handle Add/Edit Task Log Modal
  const openTaskModal = (taskName) => {
    if (logs[taskName]) {
      setTaskForm({
        plannedHours: logs[taskName].plannedHours,
        loggedHours: logs[taskName].loggedHours,
        progress: logs[taskName].progress,
      });
    } else {
      setTaskForm({ plannedHours: "", loggedHours: "", progress: "" });
    }
    setTaskModal({ open: true, task: taskName });
  };
  const closeTaskModal = () => {
    setTaskForm({ plannedHours: "", loggedHours: "", progress: "" });
    setTaskModal({ open: false, task: null });
  };
  const saveTaskLog = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("token");
    await axios.post("/api/tasks", {
      name: taskModal.task,
      date,
      plannedHours: Number(taskForm.plannedHours),
      loggedHours: Number(taskForm.loggedHours),
      progress: Number(taskForm.progress),
      small: {}
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    closeTaskModal();
    fetchLogs();
  };

  // Helper: Task block detection (allows variations)
  const isTaskBlock = (activity) => {
    const name = activity.trim().split(" ")[0];
    return taskNames.map(n => n.toLowerCase()).includes(name.replace(/[^a-zA-Z0-9-]/g, "").toLowerCase());
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-3xl mx-auto bg-white rounded shadow p-6">
        <h2 className="text-2xl font-bold mb-2">Planner for {date}</h2>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="mb-4 p-1 border" />
        <button
          className="mb-4 px-4 py-2 bg-blue-700 text-white rounded"
          onClick={() => openBlockModal(null)}
        >
          + Add Time Block
        </button>

        {/* Time Blocks List */}
        <div className="grid grid-cols-1 gap-3">
          {timeBlocks.map((b, i) => {
            const taskName = b.activity.split(" ")[0];
            return (
              <div key={b._id} className="flex items-center gap-4 p-3 border rounded">
                <span className="font-semibold w-32">{b.time}</span>
                <span className="flex-1">{b.activity}</span>
                <button
                  className="bg-yellow-400 text-xs rounded px-2 py-1"
                  onClick={() => openBlockModal(b)}
                >Edit</button>
                <button
                  className="bg-red-500 text-xs text-white rounded px-2 py-1"
                  onClick={() => deleteBlock(b._id)}
                >Delete</button>
                {isTaskBlock(b.activity) && (
                  <>
                    <button
                      className="px-3 py-1 rounded bg-blue-500 text-white hover:bg-blue-700"
                      onClick={() => openTaskModal(taskName)}
                    >
                      {logs[taskName] ? "Edit Log" : "Log Task"}
                    </button>
                    <div className="ml-3 w-32">
                      <div className="w-full bg-gray-200 rounded h-2">
                        <div
                          className="bg-blue-500 h-2 rounded"
                          style={{ width: `${progress[taskName] || 0}%` }}
                        />
                      </div>
                      <div className="text-xs text-gray-500 text-right">{progress[taskName] || 0}%</div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <button className="mt-6 px-4 py-2 bg-gray-800 text-white rounded" onClick={() => window.location.href = "/review"}>Go to Reviews</button>
      </div>

      {/* Time Block Modal */}
      {blockModal.open && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded shadow-lg w-96">
            <h3 className="text-lg font-bold mb-2">{blockModal.edit ? "Edit Time Block" : "Add Time Block"}</h3>
            <form onSubmit={saveBlock} className="flex flex-col gap-2">
              <input
                type="text"
                required
                placeholder="Time (e.g. 7:00–9:00 AM)"
                value={blockForm.time}
                onChange={e => setBlockForm({ ...blockForm, time: e.target.value })}
                className="p-2 border rounded"
              />
              <input
                type="text"
                required
                placeholder="Activity"
                value={blockForm.activity}
                onChange={e => setBlockForm({ ...blockForm, activity: e.target.value })}
                className="p-2 border rounded"
              />
              <div className="flex gap-2 mt-2">
                <button type="submit" className="bg-blue-600 text-white px-4 py-1 rounded">
                  Save
                </button>
                <button type="button" className="bg-gray-300 px-4 py-1 rounded" onClick={closeBlockModal}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task Log Modal */}
      {taskModal.open && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded shadow-lg w-96">
            <h3 className="text-lg font-bold mb-2">
              {logs[taskModal.task] ? "Edit Task Log" : "Add Task Log"}: {taskModal.task}
            </h3>
            <form onSubmit={saveTaskLog} className="flex flex-col gap-2">
              <input
                type="number"
                required
                placeholder="Planned Hours"
                value={taskForm.plannedHours}
                onChange={e => setTaskForm({ ...taskForm, plannedHours: e.target.value })}
                className="p-2 border rounded"
              />
              <input
                type="number"
                required
                placeholder="Logged Hours"
                value={taskForm.loggedHours}
                onChange={e => setTaskForm({ ...taskForm, loggedHours: e.target.value })}
                className="p-2 border rounded"
              />
              <input
                type="number"
                required
                placeholder="Progress (%)"
                min={0}
                max={100}
                value={taskForm.progress}
                onChange={e => setTaskForm({ ...taskForm, progress: e.target.value })}
                className="p-2 border rounded"
              />
              <div className="flex gap-2 mt-2">
                <button type="submit" className="bg-blue-600 text-white px-4 py-1 rounded">
                  Save
                </button>
                <button type="button" className="bg-gray-300 px-4 py-1 rounded" onClick={closeTaskModal}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
