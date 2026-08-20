import React, { useState } from 'react';
import { AdminLogin } from './pages/Portal/AdminLogin';
import { Sidebar } from './components/Portal/Sidebar';
import { Header } from './components/Portal/Header';
import { UserManagement } from './pages/Portal/UserManagement';
import { Broadcast } from './pages/Portal/Broadcast';
import { StudentsRequest } from './pages/Portal/StudentsRequest';
import Dashboard from './pages/Pre-Admission/pages/Dashboard';
import Admission from './pages/Pre-Admission/pages/Admission';
import Applications from './pages/Pre-Admission/pages/Applications';
import Settings from './pages/Pre-Admission/pages/Settings'
import { ToastProvider } from './pages/Pre-Admission/components/Toast.jsx';
import EvaluationAdmin from './pages/Evaluation/EvaluationAdmin'
import EnrollmentDashboard from './pages/Enrollment/Dashboard';
import EnrollmentStudents from './pages/Enrollment/StudentList';
import EnrollmentCurriculum from './pages/Enrollment/Curriculum';
import EnrollmentSections from './pages/Enrollment/SectionList';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => localStorage.getItem('isAdminAuthenticated') === 'true'
  );
  const [activeTab, setActiveTab] = useState('pre-admission-dashboard');
  const [navigationState, setNavigationState] = useState(null);

  const navigateToTab = (tabId, state = null) => {
    setActiveTab(tabId);
    setNavigationState(state);
  };

  const handleLogout = () => {
    localStorage.removeItem('isAdminAuthenticated');
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return <AdminLogin onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  const getTabTitle = () => {
    switch (activeTab) {
      case 'pre-admission-dashboard': return 'Pre-Admission Dashboard';
      case 'pre-admission-applications': return 'Pre-Admission Applications';
      case 'pre-admission-admission': return 'Pre-Admission Admission';
      case 'pre-admission-settings': return 'Pre-Admission Settings';
      case 'pre-enrollment-dashboard': return 'Enrollment Dashboard';
      case 'pre-enrollment-students': return 'Enrollment - Students';
      case 'pre-enrollment-curriculum': return 'Enrollment - Curriculum';
      case 'pre-enrollment-sections': return 'Enrollment - Sections';
      case 'pre-advising': return 'Pre-Advising & Scheduling';
      case 'evaluation': return 'Faculty & Course Evaluation';
      case 'grading': return 'Grading & Marks System';

      case 'user-management': return 'Student Portal - User Management';
      case 'broadcast': return 'Student Portal - Broadcast & Announcements';
      case 'students-request': return 'Student Portal - Students Request';
      default: return 'Admin Portal';
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>

      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLogout={handleLogout}
      />

      <div style={{ flex: 1 }}>
        <Header title={getTabTitle()} />
        <main style={{ marginLeft: '260px', padding: activeTab.startsWith('pre-admission') || activeTab.startsWith('pre-enrollment-') ? '10px' : '32px' }}>
          {activeTab === 'user-management' && <UserManagement />}
          {activeTab === 'broadcast' && <Broadcast />}
          {activeTab === 'students-request' && <StudentsRequest />}

          {activeTab === 'pre-enrollment-dashboard' && <EnrollmentDashboard />}
          {activeTab === 'pre-enrollment-students' && <EnrollmentStudents />}
          {activeTab === 'pre-enrollment-curriculum' && <EnrollmentCurriculum />}
          {activeTab === 'pre-enrollment-sections' && <EnrollmentSections />}

          {activeTab === 'pre-admission-dashboard' && <ToastProvider><Dashboard navigateToTab={navigateToTab} /></ToastProvider>}
          {activeTab === 'pre-admission-applications' && <ToastProvider><Applications navigateToTab={navigateToTab} navigationState={navigationState} /></ToastProvider>}
          {activeTab === 'pre-admission-admission' && <ToastProvider><Admission navigateToTab={navigateToTab} /></ToastProvider>}
          {activeTab === 'pre-admission-settings' && <ToastProvider><Settings navigateToTab={navigateToTab} /></ToastProvider>}
          {activeTab === 'evaluation' && <EvaluationAdmin />}

          {/* Removed 'students-request' and 'evaluation' from this fallback list below */}
          {['pre-advising', 'grading'].includes(activeTab) && (
            <div className="placeholder-view">
              Module for <strong>{getTabTitle()}</strong> is ready to be built next.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}