import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  Grid,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import { format } from 'date-fns';
import axios from '../apiClient.js';
import AllOrder from '../Reports/allOrder';
import UserTask from './userTask';
import PendingTasks from './PendingTasks';
import AllAttandance from './AllAttandance';
import TaskUpdate from './taskUpdate';
import { PageContainer, SectionCard } from '../components/ui';

export default function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const [userGroup, setUserGroup] = useState('');
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [attendanceData, setAttendanceData] = useState([]);
  const [task, setTask] = useState([]);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [showTaskModal, setShowTaskModal] = useState(false);

  useEffect(() => {
    const group = localStorage.getItem('User_group');
    setUserGroup(group || '');
  }, []);

  useEffect(() => {
    setTimeout(() => {
      const userNameFromState = location.state?.id;
      const user = userNameFromState || localStorage.getItem('User_name');
      setLoggedInUser(user);
      if (user) {
        fetchData(user);
        fetchAttendance(user);
      } else {
        navigate('/');
      }
    }, 2000);
    setTimeout(() => setIsLoading(false), 2000);
  }, [location.state, navigate]);

  const fetchData = async () => {
    try {
      const [taskRes] = await Promise.all([axios.get('/api/usertasks/GetUsertaskList')]);
      if (taskRes.data.success) {
        setTask(taskRes.data.result);
      } else {
        setTask([]);
      }
    } catch (err) {
      console.log('Error fetching data:', err);
    }
  };

  const fetchUserNames = async () => {
    try {
      const response = await axios.get('/api/users/GetUserList');
      const data = response.data;

      if (data.success) {
        const userLookup = {};
        data.result.forEach((user) => {
          userLookup[user.User_uuid] = user.User_name.trim();
        });
        return userLookup;
      }
      return {};
    } catch (error) {
      console.error('Error fetching user names:', error);
      return {};
    }
  };

  const fetchAttendance = async (currentUser) => {
    try {
      const userLookup = await fetchUserNames();
      const attendanceResponse = await axios.get('/api/attendance/GetAttendanceList');
      const attendanceRecords = attendanceResponse.data.result || [];

      const attendanceWithUserNames = attendanceRecords.flatMap((record) => {
        const employeeUuid = record.Employee_uuid.trim();
        const userName = userLookup[employeeUuid] || 'Unknown';

        return record.User.map((user) => ({
          Attendance_Record_ID: record.Attendance_Record_ID,
          User_name: userName,
          Date: record.Date,
          Time: user.CreatedAt ? format(new Date(user.CreatedAt), 'hh:mm a') : 'No Time',
          Type: user.Type || 'N/A',
          Status: record.Status || 'N/A',
        }));
      });

      const filteredAttendance = attendanceWithUserNames.filter((record) => record.User_name === currentUser);
      setAttendanceData(filteredAttendance);
    } catch (error) {
      console.error('Error fetching attendance:', error);
    }
  };

  const handleTaskClick = (selectedTask) => {
    setSelectedTaskId(selectedTask);
    setShowTaskModal(true);
  };

  const closeTaskModal = () => {
    setShowTaskModal(false);
    setSelectedTaskId(null);
  };

  return (
    <PageContainer
      title="Home Command Center"
      subtitle="Operational home view with pending tasks, order pipeline and attendance context."
    >
      {isLoading ? <LinearProgress sx={{ borderRadius: 1 }} /> : null}

      <Grid container spacing={1.25}>
        <Grid item xs={12} lg={4}>
          <Stack spacing={1.25}>
            {userGroup === 'Admin User' && (
              <SectionCard title="Attendance Snapshot" subtitle="Live team check-in details" contentSx={{ p: 1 }}>
                <AllAttandance />
              </SectionCard>
            )}

            {userGroup === 'Office User' && (
              <SectionCard title="My Task Panel" subtitle="Action list for current assignments" contentSx={{ p: 1 }}>
                <UserTask />
              </SectionCard>
            )}

            <SectionCard title="Recent Attendance Logs" subtitle={`Entries for ${loggedInUser || 'current user'}`}>
              <Stack spacing={0.35}>
                {(attendanceData || []).slice(0, 8).map((row) => (
                  <Stack key={`${row.Attendance_Record_ID}-${row.Time}`} direction="row" justifyContent="space-between">
                    <Typography variant="caption">{row.Type}</Typography>
                    <Typography variant="caption" color="text.secondary">{row.Time}</Typography>
                  </Stack>
                ))}
              </Stack>
            </SectionCard>
          </Stack>
        </Grid>

        <Grid item xs={12} lg={8}>
          <Stack spacing={1.25}>
            <SectionCard title="Pending Task Queue" subtitle="Click any task to update progress" contentSx={{ p: 1 }}>
              <PendingTasks
                tasks={userGroup === 'Admin User' ? task : task.filter((t) => t.User === loggedInUser)}
                isLoading={isLoading}
                onTaskClick={handleTaskClick}
              />
            </SectionCard>

            <SectionCard title="Orders Pipeline" subtitle="Complete order board and activity stream" contentSx={{ p: 1 }}>
              <AllOrder />
            </SectionCard>
          </Stack>
        </Grid>
      </Grid>

      <Dialog open={showTaskModal} onClose={closeTaskModal} maxWidth="md" fullWidth>
        <DialogContent sx={{ p: 0.5 }}>
          {selectedTaskId ? <TaskUpdate task={selectedTaskId} onClose={closeTaskModal} /> : null}
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
